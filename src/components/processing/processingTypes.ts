/**
 * The vocabulary of the global processing layer.
 * ---------------------------------------------------------------------------
 * Every long-running request in the product reports the same lifecycle, so a
 * caller never has to invent a status of its own and the interface can render
 * one honest surface for all of them.
 *
 * The states are deliberately explicit. `pending` and `processing` are not the
 * same thing — the first means the request has been accepted but has not
 * started its work, the second means it is doing the work — and `cancelled`
 * and `timed_out` are not failures either: one is the candidate's decision and
 * the other is the platform's. A failure is only `failed`, and it is only
 * reached when the server said so.
 */

/** The lifecycle of one processing operation. */
export type ProcessingStatus =
  /** The request was accepted; the work has not started yet. */
  | 'pending'
  /** The work is running. */
  | 'processing'
  /** The work finished and the server confirmed the result. */
  | 'completed'
  /** The work failed. The error is the server's own message. */
  | 'failed'
  /** The candidate stopped waiting. The late result is discarded. */
  | 'cancelled'
  /** The work ran longer than the operation allows and was stopped. */
  | 'timed_out';

/**
 * One meaningful step of an operation.
 *
 * The label is an English source string: the overlay translates it, so a
 * stage is written once and reads correctly in both languages.
 */
export interface ProcessingStage {
  /** The stage's own identifier, used to report that the work reached it. */
  id: string;
  /** The English source string shown to the candidate. */
  label: string;
}

/** What the interface knows about one operation at a given moment. */
export interface ProcessingOperationView {
  /** The operation's identifier. Two runs with the same id are the same work. */
  id: string;
  /** The English source string naming the operation. */
  title: string;
  /** The meaningful stages of the operation, in the order they happen. */
  stages: ProcessingStage[];
  /** Where the operation is in its lifecycle. */
  status: ProcessingStatus;
  /** The stage the work is in, when the caller reported one. */
  currentStageId: string | null;
  /**
   * The real progress as a fraction between 0 and 1, or `null` when the
   * caller did not report any. `null` means the interface shows an
   * indeterminate animation — never a made-up percentage.
   */
  progress: number | null;
  /** The server's own failure message, when the operation failed. */
  error: string | null;
  /** Whether the work can still be stopped. */
  cancellable: boolean;
  /** When the operation started, in milliseconds since the epoch. */
  startedAt: number;
  /**
   * Whether the operation has run longer than the duration it was expected to
   * take. It changes the wording, never the outcome.
   */
  slow: boolean;
}

/** What a running operation is given to report its own progress. */
export interface ProcessingRunContext {
  /** The signal that is aborted when the candidate cancels or the work times out. */
  signal: AbortSignal;
  /**
   * Reports the real progress as a fraction between 0 and 1. Call it only when
   * the number is known — a made-up fraction is a lie the interface cannot see
   * through.
   */
  reportProgress: (fraction: number) => void;
  /** Reports the stage the work has reached. */
  setStage: (stageId: string) => void;
}

/** The outcome of one run. */
export type ProcessingRunResult<T> =
  | { status: 'completed'; value: T }
  | { status: 'failed'; error: unknown }
  | { status: 'cancelled' }
  | { status: 'timed_out' };

/** What a caller hands to `runOperation`. */
export interface RunOperationOptions<T> {
  /**
   * The operation's identifier. While an operation with this id is running, a
   * second call joins it instead of starting a duplicate request.
   */
  id: string;
  /** The English source string naming the operation. */
  title: string;
  /** The meaningful stages of the operation, in the order they happen. */
  stages?: ProcessingStage[];
  /** The work itself. It receives the abort signal and the progress reporter. */
  operation: (context: ProcessingRunContext) => Promise<T>;
  /** Called with the result once the server confirmed it. */
  onSuccess?: (result: T) => void;
  /** Called with the failure. The interface reports it as well. */
  onError?: (error: unknown) => void;
  /**
   * How long the work may run before it is stopped and reported as a timeout.
   * It is not a progress estimate.
   */
  timeoutMs?: number;
  /**
   * How long the work is expected to take. It only changes the wording: after
   * this the interface says that the work is taking longer than usual. It
   * never delays, cancels or fails anything.
   */
  expectedDurationMs?: number;
  /** Whether the candidate may stop waiting. Defaults to `true`. */
  cancellable?: boolean;
  /**
   * Where the operation is shown.
   *
   * `overlay` (the default) puts it on the global processing surface.
   * `inline` belongs to the section that started it, so the global surface
   * leaves it alone and the section shows it with `InlineProcessingOverlay`.
   */
  presentation?: 'overlay' | 'inline';
}
