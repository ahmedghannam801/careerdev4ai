// The queue transport.
//
// The queue is how a message gets from the API to the worker that does the
// work. Nothing else in the system knows how that message travels: the API
// publishes, the worker consumes, and both of them go through the small
// interface below.
//
// Two implementations exist:
//
//   * `CloudflareQueueProducer` — the real one. It uses the queue binding that
//     Cloudflare hands to the Worker, and it is what production uses.
//   * `LocalJobQueue` — an in-process queue with the same shape. It is what
//     the local development server uses, so that a developer sees the same
//     behaviour without a Cloudflare account, and it is what the test suite
//     drives.
//
// The two are interchangeable on purpose. A test that publishes through one
// and consumes through the other exercises the same code the platform runs.
//
// The message itself is deliberately tiny. It carries the id of the job, the
// attempt that is being asked for, and nothing else: the request, the state
// and the result all live in the database row, where they survive a restart
// and can be read back.

/** The message the API publishes and the worker consumes. */
export interface JobQueueMessage {
  /** The id of this message. It is the handle on the execution. */
  id: string;
  /** The row that records the job. */
  jobId: string;
  /** Which attempt of the job is being asked for. */
  attempt: number;
}

/**
 * The part of a Cloudflare queue binding this module uses.
 *
 * It is written structurally rather than imported so that the server code does
 * not have to depend on the Workers type definitions: the same module runs in
 * the Pages Worker, in the queue Worker and in Node.
 */
export interface CloudflareQueueBinding {
  send(body: unknown, options?: { delaySeconds?: number }): Promise<void>;
}

/** Anything that can carry a job message. */
export interface JobQueueProducer {
  send(body: JobQueueMessage, options?: { delaySeconds?: number }): Promise<void>;
}

/** Thrown when there is no queue at all on this server. */
export class QueueNotConfiguredError extends Error {
  constructor(message = 'No background job queue is configured on this server.') {
    super(message);
    this.name = 'QueueNotConfiguredError';
  }
}

/** Thrown when a message could not be handed to the queue. */
export class QueuePublishError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'QueuePublishError';
    this.cause = cause;
  }
}

/**
 * The producer that talks to a Cloudflare queue.
 *
 * The binding is passed in rather than looked up, so that the same class works
 * for the Pages Worker (which publishes) and the queue Worker (which
 * republishes a failed attempt).
 */
export class CloudflareQueueProducer implements JobQueueProducer {
  private readonly queue: CloudflareQueueBinding;

  constructor(queue: CloudflareQueueBinding) {
    this.queue = queue;
  }

  async send(body: JobQueueMessage, options?: { delaySeconds?: number }): Promise<void> {
    try {
      await this.queue.send(body, options);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new QueuePublishError(`The background job queue refused the message: ${detail}`, error);
    }
  }
}

interface QueuedMessage {
  body: JobQueueMessage;
  deliverAt: number;
}

/**
 * An in-process queue.
 *
 * It holds the messages until they are due and hands them to a runner. It is
 * what the local development server and the test suite use, and it is the
 * reason the same code path can be proven without a Cloudflare account.
 */
export class LocalJobQueue implements JobQueueProducer {
  private readonly messages: QueuedMessage[] = [];

  async send(body: JobQueueMessage, options?: { delaySeconds?: number }): Promise<void> {
    const delaySeconds = Math.max(0, options?.delaySeconds ?? 0);
    this.messages.push({ body, deliverAt: Date.now() + delaySeconds * 1000 });
  }

  /** How many messages are waiting, due or not. */
  get size(): number {
    return this.messages.length;
  }

  /**
   * Takes the messages that are due.
   *
   * The messages are removed before the runner is given them, so a message is
   * only ever handed out once.
   */
  takeDue(now = Date.now()): JobQueueMessage[] {
    const due: JobQueueMessage[] = [];
    const waiting: QueuedMessage[] = [];

    for (const message of this.messages) {
      if (message.deliverAt <= now) due.push(message.body);
      else waiting.push(message);
    }

    this.messages.length = 0;
    this.messages.push(...waiting);
    return due;
  }

  /** Empties the queue. Used by the test suite between cases. */
  clear(): void {
    this.messages.length = 0;
  }
}

// ---------------------------------------------------------------------------
// The producer this process uses
// ---------------------------------------------------------------------------

let producer: JobQueueProducer | null = null;

/**
 * Registers the queue this process publishes to.
 *
 * It is called once, at the edge of the process: by the Pages Worker when it
 * boots with a queue binding, by the queue Worker when it boots, and by the
 * local development server when it installs its in-process queue.
 */
export function setJobQueueProducer(next: JobQueueProducer | null): void {
  producer = next;
}

/** The queue this process publishes to, if there is one. */
export function getJobQueueProducer(): JobQueueProducer | null {
  return producer;
}

/** True when this process can hand a message to a queue at all. */
export function isJobQueueConfigured(): boolean {
  return producer !== null;
}

/**
 * Publishes the message that asks a worker to carry out a job.
 *
 * The message id is generated here rather than taken from the queue, because
 * Cloudflare's queue binding does not hand one back — and the id has to be
 * written to the job row *before* the message is published, so that a row is
 * never left pointing at a message that does not exist.
 *
 * Throws `QueueNotConfiguredError` when there is no queue, and
 * `QueuePublishError` when the queue refused the message.
 */
export async function publishJobMessage(
  jobId: string,
  attempt: number,
  options?: { delaySeconds?: number },
): Promise<string> {
  const active = producer;
  if (!active) throw new QueueNotConfiguredError();

  const message: JobQueueMessage = {
    id: globalThis.crypto.randomUUID(),
    jobId,
    attempt,
  };

  await active.send(message, options);
  return message.id;
}
