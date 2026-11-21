/**
 * The browser side of the live interview.
 * ---------------------------------------------------------------------------
 * This is the part of the conversation the candidate takes part in: it opens
 * the microphone, streams it to Gemini's Live API, plays the interviewer's
 * voice back, and keeps the words.
 *
 * THE AUDIO NEVER LANDS ON THE PLATFORM
 * The microphone is captured in the browser and streamed straight to Google.
 * Nothing is uploaded to the platform's own storage, nothing is recorded on
 * the server, and the only thing this module keeps is the TEXT.
 *
 * THE TURN-TAKING IS THE MODEL'S
 * Gemini decides when the candidate has finished speaking and when it is the
 * model's turn to talk. When the model is interrupted, the playback queue is
 * dropped, which is what makes a real conversation possible.
 *
 * THE AUDIO CONTEXTS ARE CREATED ON THE CLICK
 * Browsers only let a page start audio while it has the user's activation.
 * `prepare()` is therefore called synchronously from the Start button, before
 * any network request. Creating the contexts later, after the token had been
 * fetched, left them suspended and produced a silent interview: the
 * microphone streamed nothing and the interviewer's voice was queued into a
 * context that was never running.
 */

import type { GoogleGenAI } from '@google/genai/web';

import type { LiveInterviewGrant, LiveTranscriptTurn } from './liveInterviewApi';

/** What the connection is doing right now. */
export type LiveConnectionState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'speaking'
  | 'error'
  | 'closed';

/** The sample rates the Live API speaks. */
const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;

export interface LiveInterviewClientCallbacks {
  /** The connection changed state. */
  onState: (state: LiveConnectionState) => void;
  /** A turn of the conversation was completed. */
  onTranscript: (turn: LiveTranscriptTurn) => void;
  /** Something went wrong. */
  onError: (error: Error) => void;
}

/** The AudioContext constructor, including Safari's prefixed name. */
function audioContextCtor(): typeof AudioContext | null {
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
    null
  );
}

/**
 * Creates an AudioContext at the preferred rate, or at the browser's own rate
 * when it refuses that rate. Safari and some Firefox builds do not accept
 * every rate, and a refused rate must not end the interview.
 */
function createAudioContext(preferredRate: number): AudioContext {
  const Ctor = audioContextCtor();
  if (!Ctor) throw new Error('This browser cannot play or capture audio.');
  try {
    return new Ctor({ sampleRate: preferredRate });
  } catch {
    return new Ctor();
  }
}

/**
 * The worklet that turns the microphone into the bytes the API expects.
 *
 * It runs on the audio thread: it takes the float samples the browser gives
 * it, resamples them to the 16 kHz the Live API expects when the context runs
 * at another rate, and writes 16-bit little-endian PCM. It is registered from
 * an inline source, so there is no extra file to ship and no extra request to
 * make.
 */
const PCM_WORKLET_SOURCE = `
class Pcm16Processor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const settings = (options && options.processorOptions) || {};
    this.inputRate = settings.inputSampleRate || sampleRate;
    this.targetRate = settings.targetSampleRate || 16000;
    this.ratio = this.inputRate / this.targetRate;
    this.pending = new Float32Array(0);
    this.readAt = 0;
  }

  post(samples) {
    if (!samples || samples.length === 0) return;
    const buffer = new ArrayBuffer(samples.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < samples.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }
    this.port.postMessage(buffer, [buffer]);
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channel = input[0];
    if (!channel) return true;

    // The common case: the browser gave us exactly the rate the API wants.
    if (Math.abs(this.ratio - 1) < 0.0001) {
      this.post(channel);
      return true;
    }

    // Append the new samples to whatever was left from the previous block.
    const merged = new Float32Array(this.pending.length + channel.length);
    merged.set(this.pending);
    merged.set(channel, this.pending.length);
    this.pending = merged;

    const output = [];
    while (this.readAt + 1 < this.pending.length) {
      const index = Math.floor(this.readAt);
      const fraction = this.readAt - index;
      output.push(
        this.pending[index] * (1 - fraction) + this.pending[index + 1] * fraction
      );
      this.readAt += this.ratio;
    }

    // Keep only the part that has not been consumed yet, so the buffer does
    // not grow for the length of the interview.
    const consumed = Math.floor(this.readAt);
    if (consumed > 0) {
      this.pending = this.pending.slice(consumed);
      this.readAt -= consumed;
    }

    if (output.length > 0) this.post(Float32Array.from(output));
    return true;
  }
}
registerProcessor('pcm16-processor', Pcm16Processor);
`;

/**
 * Collects the transcript as it arrives.
 *
 * The API sends the transcription of a turn in pieces. A piece may be marked
 * `finished`, but many Live messages only mark the end of a turn with
 * `turnComplete`, so the collector can close every open turn when the turn is
 * over. Without that, the transcript stayed empty until the candidate pressed
 * End, which made a working interview look broken.
 */
export class TranscriptCollector {
  private pending = new Map<'interviewer' | 'candidate', string>();

  add(
    speaker: 'interviewer' | 'candidate',
    text: string,
    finished?: boolean
  ): LiveTranscriptTurn | null {
    const current = `${this.pending.get(speaker) ?? ''}${text}`.trim();
    if (!finished) {
      this.pending.set(speaker, current);
      return null;
    }
    this.pending.delete(speaker);
    if (!current) return null;
    return { speaker, text: current, at: new Date().toISOString() };
  }

  /** Closes every open turn at the end of a model turn. */
  finishAll(): LiveTranscriptTurn[] {
    const turns: LiveTranscriptTurn[] = [];
    for (const [speaker, text] of this.pending) {
      if (text.trim()) {
        turns.push({ speaker, text: text.trim(), at: new Date().toISOString() });
      }
    }
    this.pending.clear();
    return turns;
  }

  /** The turn that is still open when the conversation ends. */
  flush(): LiveTranscriptTurn[] {
    return this.finishAll();
  }
}

/** Decodes the base64 PCM the API sends. */
function decodePcm16(base64: string): Int16Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

/**
 * Encodes the microphone's bytes for the API.
 *
 * The API takes the audio as base64 with the sample rate in the media type,
 * which is why the rate is part of the type rather than a separate field.
 */
function encodePcm16(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  // The chunk is small (a few kilobytes), so the string is built in pieces
  // rather than one character at a time.
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

/**
 * The live interview, as the browser sees it.
 *
 * `prepare()` is called from the click, `start(grant)` opens the session, and
 * `stop()` closes everything and hands back the transcript.
 */
export class LiveInterviewClient {
  private readonly callbacks: LiveInterviewClientCallbacks;

  private ai: GoogleGenAI | null = null;
  private session: Awaited<ReturnType<GoogleGenAI['live']['connect']>> | null = null;
  private stream: MediaStream | null = null;
  private inputContext: AudioContext | null = null;
  private outputContext: AudioContext | null = null;
  private worklet: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private readonly collector = new TranscriptCollector();
  private readonly turns: LiveTranscriptTurn[] = [];
  /** The audio that is queued to be played, and when it may start. */
  private nextPlayAt = 0;
  private readonly scheduled: AudioBufferSourceNode[] = [];
  private stopped = false;
  private active = false;
  private disconnectHandled = false;
  private prepared = false;

  constructor(callbacks: LiveInterviewClientCallbacks) {
    this.callbacks = callbacks;
  }

  /** The transcript so far. */
  get transcript(): LiveTranscriptTurn[] {
    return [...this.turns];
  }

  /** Whether a session is open or opening. */
  get isActive(): boolean {
    return this.active;
  }

  /**
   * Creates the audio contexts while the page still has the click's user
   * activation. This method is deliberately synchronous and must be called
   * before the first `await` in the Start handler.
   */
  prepare(): void {
    if (this.prepared) {
      void this.resumeContexts();
      return;
    }
    this.prepared = true;

    this.inputContext = createAudioContext(INPUT_SAMPLE_RATE);
    this.outputContext = createAudioContext(OUTPUT_SAMPLE_RATE);
    void this.resumeContexts();
  }

  private async resumeContexts(): Promise<void> {
    for (const context of [this.inputContext, this.outputContext]) {
      if (!context) continue;
      if (context.state === 'suspended') {
        await context.resume().catch(() => undefined);
      }
    }
  }

  /**
   * Opens the session.
   *
   * The microphone is requested first: a candidate who refuses it is told so
   * plainly, rather than being left looking at a silent interview.
   */
  async start(grant: LiveInterviewGrant): Promise<void> {
    if (this.active) throw new Error('An interview is already running.');

    this.stopped = false;
    this.disconnectHandled = false;
    this.callbacks.onState('connecting');

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser cannot open a microphone.');
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (error) {
      const name = (error as { name?: string })?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        throw new Error(
          'The microphone permission was refused. Allow the microphone to use the live interview.'
        );
      }
      if (name === 'NotFoundError') {
        throw new Error('No microphone was found on this device.');
      }
      throw new Error('The microphone could not be opened.');
    }

    // A microphone that is unplugged or revoked mid-interview must close the
    // session instead of leaving the candidate talking into nothing.
    this.stream.getAudioTracks().forEach((track) => {
      track.addEventListener('ended', () => {
        if (this.stopped) return;
        this.callbacks.onError(new Error('The microphone stopped. The interview was ended.'));
        void this.handleConnectionLost();
      });
    });

    if (!this.prepared) this.prepare();

    try {
      await this.startCapture();
      await this.primePlayback();

      // The ephemeral token is used as the credential. It opens one session
      // and nothing else.
      //
      // The API version has to be the one the token was minted on: an
      // ephemeral token issued by one API version cannot open a session on
      // another. The server sends the version it used with the grant, so the
      // two can never drift apart.
      //
      // The SDK is loaded HERE, when the candidate starts an interview, and
      // not when the page is built: a candidate who never practises a spoken
      // interview never downloads it.
      const { GoogleGenAI, Modality } = await import('@google/genai/web');
      this.ai = new GoogleGenAI({
        apiKey: grant.token,
        httpOptions: { apiVersion: grant.apiVersion },
      });

      this.session = await this.ai.live.connect({
        model: grant.model,
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            this.active = true;
            this.callbacks.onState('listening');
          },
          onmessage: (message) => {
            this.handleMessage(message);
          },
          onerror: () => {
            this.callbacks.onError(new Error('The live connection failed.'));
            this.callbacks.onState('error');
          },
          onclose: () => {
            void this.handleConnectionLost();
          },
        },
      });
    } catch (error) {
      await this.releaseMedia();
      throw error instanceof Error ? error : new Error('The live interview could not be started.');
    }
  }

  /** Stops the interview and closes everything it opened. */
  async stop(): Promise<LiveTranscriptTurn[]> {
    const wasStopped = this.stopped;
    this.stopped = true;

    // The open turn is part of the conversation. It is recorded before the
    // session is closed, so pressing End never loses the last sentence.
    for (const turn of this.collector.flush()) {
      this.pushTurn(turn);
    }

    try {
      this.session?.close();
    } catch {
      // The session may already be gone. Nothing is lost by it.
    }
    this.session = null;
    this.active = false;

    await this.releaseMedia();

    // A stop that was already in progress (for example from the unmount
    // cleanup) must not announce a second closed state.
    if (!wasStopped) this.callbacks.onState('closed');
    return this.transcript;
  }

  /**
   * The connection ended without the candidate pressing End: a network drop,
   * a browser sleep, or the model closing the socket. The last transcript
   * pieces are kept, the microphone is released, and the interface is told.
   * It is not reconnected automatically: the token is single-use, so a
   * reconnect would need a fresh credential and a new session.
   */
  private async handleConnectionLost(): Promise<void> {
    if (this.stopped || this.disconnectHandled) return;
    this.disconnectHandled = true;
    this.active = false;

    for (const turn of this.collector.flush()) {
      this.pushTurn(turn);
    }
    this.session = null;
    await this.releaseMedia();
    this.callbacks.onState('closed');
    this.callbacks.onError(
      new Error('The live connection ended. Your transcript up to that point is kept.')
    );
  }

  /** Releases the microphone, the audio contexts and the worklet. */
  private async releaseMedia(): Promise<void> {
    this.worklet?.disconnect();
    this.worklet = null;
    this.source?.disconnect();
    this.source = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    for (const scheduled of this.scheduled) {
      try {
        scheduled.stop();
      } catch {
        // A source that already finished cannot be stopped again.
      }
    }
    this.scheduled.length = 0;
    if (this.inputContext) {
      await this.inputContext.close().catch(() => undefined);
      this.inputContext = null;
    }
    if (this.outputContext) {
      await this.outputContext.close().catch(() => undefined);
      this.outputContext = null;
    }
    this.prepared = false;
  }

  /**
   * Starts streaming the microphone.
   *
   * When the browser honours the requested 16 kHz rate the worklet only packs
   * samples. When it does not, the worklet resamples from the context's own
   * rate, so a browser that refuses 16 kHz still gets a working interview
   * rather than a stream the API cannot read.
   */
  private async startCapture(): Promise<void> {
    if (!this.stream) throw new Error('The microphone is not open.');
    if (!this.inputContext) this.inputContext = createAudioContext(INPUT_SAMPLE_RATE);
    const inputContext = this.inputContext;

    if (inputContext.state === 'suspended') {
      await inputContext.resume().catch(() => undefined);
    }

    if (!inputContext.audioWorklet) {
      await inputContext.close().catch(() => undefined);
      this.inputContext = null;
      throw new Error('This browser cannot capture audio.');
    }

    const moduleUrl = URL.createObjectURL(
      new Blob([PCM_WORKLET_SOURCE], { type: 'application/javascript' })
    );
    try {
      await inputContext.audioWorklet.addModule(moduleUrl);
    } finally {
      URL.revokeObjectURL(moduleUrl);
    }

    const source = inputContext.createMediaStreamSource(this.stream);
    this.source = source;
    const worklet = new AudioWorkletNode(inputContext, 'pcm16-processor', {
      processorOptions: {
        inputSampleRate: inputContext.sampleRate,
        targetSampleRate: INPUT_SAMPLE_RATE,
      },
    });
    this.worklet = worklet;
    worklet.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      this.sendAudio(event.data);
    };
    source.connect(worklet);
    // The worklet must be connected to the destination to be pulled by the
    // audio graph. It outputs silence: the microphone is never played back.
    const mute = inputContext.createGain();
    mute.gain.value = 0;
    worklet.connect(mute);
    mute.connect(inputContext.destination);

    if (inputContext.state === 'suspended') {
      await inputContext.resume().catch(() => undefined);
    }
  }

  /** Sends one chunk of the microphone to the API. */
  private sendAudio(buffer: ArrayBuffer): void {
    if (!this.session || this.stopped) return;
    try {
      this.session.sendRealtimeInput({
        audio: {
          data: encodePcm16(buffer),
          mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}`,
        },
      });
    } catch {
      // A chunk that cannot be sent is dropped: the next one is on its way.
    }
  }

  /** Reads one message from the API. */
  private handleMessage(message: {
    serverContent?: {
      modelTurn?: {
        parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }>;
      };
      inputTranscription?: { text?: string; finished?: boolean };
      outputTranscription?: { text?: string; finished?: boolean };
      interrupted?: boolean;
      turnComplete?: boolean;
    };
  }): void {
    const content = message.serverContent;
    if (!content) return;

    // The candidate spoke.
    if (content.inputTranscription?.text) {
      const turn = this.collector.add(
        'candidate',
        content.inputTranscription.text,
        content.inputTranscription.finished
      );
      if (turn) this.pushTurn(turn);
    }

    // The interviewer spoke.
    if (content.outputTranscription?.text) {
      const turn = this.collector.add(
        'interviewer',
        content.outputTranscription.text,
        content.outputTranscription.finished
      );
      if (turn) this.pushTurn(turn);
    }

    // The interviewer's voice.
    const parts = content.modelTurn?.parts ?? [];
    for (const part of parts) {
      const data = part.inlineData?.data;
      if (data) this.playAudio(data);
    }

    if (content.interrupted) {
      // The candidate spoke over the interviewer. The queued voice is
      // dropped, which is what makes the conversation feel like one.
      this.stopPlayback();
    }

    if (content.turnComplete) {
      // The Live API often marks a turn complete without marking the last
      // transcription piece as `finished`. Closing the open turns here makes
      // the transcript appear as the conversation happens.
      for (const turn of this.collector.finishAll()) {
        this.pushTurn(turn);
      }
      this.callbacks.onState('listening');
    }
  }

  /** Records one finished turn. */
  private pushTurn(turn: LiveTranscriptTurn): void {
    this.turns.push(turn);
    this.callbacks.onTranscript(turn);
  }

  /** Queues the interviewer's voice for playback. */
  private playAudio(base64: string): void {
    if (!this.outputContext) return;
    const context = this.outputContext;
    if (context.state === 'suspended') {
      // Some browsers suspend the context again after a long silence. The
      // gesture that started the interview already unlocked audio, so this
      // resume is allowed; it is best-effort and the chunk is still queued.
      void context.resume().catch(() => undefined);
    }
    const samples = decodePcm16(base64);
    const buffer = context.createBuffer(1, samples.length, OUTPUT_SAMPLE_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i += 1) {
      channel[i] = samples[i] / 32768;
    }

    const node = context.createBufferSource();
    node.buffer = buffer;
    node.connect(context.destination);
    const startAt = Math.max(context.currentTime, this.nextPlayAt);
    node.start(startAt);
    this.nextPlayAt = startAt + buffer.duration;
    this.scheduled.push(node);
    this.callbacks.onState('speaking');
  }

  /** Drops the voice that has not been played yet. */
  private stopPlayback(): void {
    for (const node of this.scheduled) {
      try {
        node.stop();
      } catch {
        // Already finished.
      }
    }
    this.scheduled.length = 0;
    if (this.outputContext) this.nextPlayAt = this.outputContext.currentTime;
  }

  /**
   * Prepares the context the interviewer's voice is played back through.
   *
   * The context is normally created in `prepare()` on the click. This method
   * only creates one as a fallback and refuses to continue when the browser
   * has blocked playback outright, because a silent interview is a worse
   * outcome than a clear error.
   */
  async primePlayback(): Promise<void> {
    if (!this.outputContext) this.outputContext = createAudioContext(OUTPUT_SAMPLE_RATE);
    if (this.outputContext.state === 'suspended') {
      await this.outputContext.resume().catch(() => undefined);
    }
    if (this.outputContext.state === 'suspended') {
      throw new Error(
        'The browser blocked audio playback. Start the interview again and allow sound for this page.'
      );
    }
  }
}
