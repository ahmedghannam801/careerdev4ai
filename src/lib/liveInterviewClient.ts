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
 * Gemini decides when the candidate has finished speaking and when it is
 * model's turn to talk. This module does not interrupt it and does not
 * interrupt the candidate: when the model is interrupted, the playback queue
 * is dropped, which is what makes a real conversation possible.
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

/**
 * The worklet that turns the microphone into the bytes the API expects.
 *
 * It runs on the audio thread: it takes the float samples the browser gives
 * it and writes 16-bit little-endian PCM, which is the format the Live API
 * takes. It is registered from an inline source, so there is no extra file to
 * ship and no extra request to make.
 */
const PCM_WORKLET_SOURCE = `
class Pcm16Processor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channel = input[0];
    if (!channel) return true;
    const buffer = new ArrayBuffer(channel.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < channel.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, channel[i]));
      view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }
    this.port.postMessage(buffer, [buffer]);
    return true;
  }
}
registerProcessor('pcm16-processor', Pcm16Processor);
`;

/**
 * Collects the transcript as it arrives.
 *
 * The API sends the transcription of a turn in pieces, and marks the end of
 * one with `finished`. The collector holds the pieces of the turn in progress
 * and hands over one whole turn at a time, so the interface never shows a
 * half sentence that is about to change.
 */
class TranscriptCollector {
  private pending = new Map<'interviewer' | 'candidate', string>();

  add(speaker: 'interviewer' | 'candidate', text: string, finished?: boolean): LiveTranscriptTurn | null {
    const current = `${this.pending.get(speaker) ?? ''}${text}`.trim();
    if (!finished) {
      this.pending.set(speaker, current);
      return null;
    }
    this.pending.delete(speaker);
    if (!current) return null;
    return { speaker, text: current, at: new Date().toISOString() };
  }

  /** The turn that is still open when the conversation ends. */
  flush(): LiveTranscriptTurn[] {
    const turns: LiveTranscriptTurn[] = [];
    for (const [speaker, text] of this.pending) {
      if (text.trim()) {
        turns.push({ speaker, text: text.trim(), at: new Date().toISOString() });
      }
    }
    this.pending.clear();
    return turns;
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
 * `start()` asks for the microphone and opens the session; `stop()` closes
 * everything and hands back the transcript.
 */
export class LiveInterviewClient {
  private readonly grant: LiveInterviewGrant;
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

  constructor(
    grant: LiveInterviewGrant,
    callbacks: LiveInterviewClientCallbacks
  ) {
    this.grant = grant;
    this.callbacks = callbacks;
  }

  /** The transcript so far. */
  get transcript(): LiveTranscriptTurn[] {
    return [...this.turns];
  }

  /**
   * Opens the session.
   *
   * The microphone is requested first: a candidate who refuses it is told so
   * plainly, rather than being left looking at a silent interview.
   */
  async start(): Promise<void> {
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

    try {
      await this.startCapture();
      // The playback context is opened up front: a context that is created
      // in the middle of the first answer would make the interviewer's
      // first words arrive late.
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
        apiKey: this.grant.token,
        httpOptions: { apiVersion: this.grant.apiVersion },
      });

      this.session = await this.ai.live.connect({
        model: this.grant.model,
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            this.callbacks.onState('listening');
          },
          onmessage: (message) => {
            this.handleMessage(message);
          },
          onerror: (event) => {
            this.callbacks.onError(new Error('The live connection failed.'));
            this.callbacks.onState('error');
          },
          onclose: () => {
            if (!this.stopped) this.callbacks.onState('closed');
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
    this.stopped = true;
    for (const turn of this.collector.flush()) {
      this.turns.push(turn);
      this.callbacks.onTranscript(turn);
    }

    try {
      this.session?.close();
    } catch {
      // The session may already be gone. Nothing is lost by it.
    }
    this.session = null;

    await this.releaseMedia();
    this.callbacks.onState('closed');
    return this.transcript;
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
  }

  /**
   * Starts streaming the microphone.
   *
   * The capture context runs at the rate the Live API expects, so the
   * browser resamples for us and the worklet only has to pack the samples.
   */
  private async startCapture(): Promise<void> {
    const AudioContextCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) throw new Error('This browser cannot capture audio.');
    if (!this.stream) throw new Error('The microphone is not open.');

    const inputContext = new AudioContextCtor({ sampleRate: INPUT_SAMPLE_RATE });
    this.inputContext = inputContext;

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
    const worklet = new AudioWorkletNode(inputContext, 'pcm16-processor');
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

  /** Prepares the context the interviewer's voice is played back through. */
  async primePlayback(): Promise<void> {
    if (this.outputContext) return;
    const AudioContextCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    this.outputContext = new AudioContextCtor({ sampleRate: OUTPUT_SAMPLE_RATE });
    if (this.outputContext.state === 'suspended') {
      await this.outputContext.resume().catch(() => undefined);
    }
  }
}
