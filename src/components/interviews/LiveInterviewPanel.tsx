/**
 * The live voice interview.
 * ---------------------------------------------------------------------------
 * A real conversation with an interviewer that speaks and listens.
 *
 * WHAT IS ON THE SCREEN
 * The setup (the kind of interview and the language), the microphone state,
 * who is speaking right now, the connection state, the transcript as it is
 * said, and the report at the end.
 *
 * THE SCREEN IS QUIET ON PURPOSE
 * An interview is a conversation, and a screen full of numbers would pull
 * the candidate out of it. There is one large element — the speaking
 * indicator — and everything else is small and out of the way.
 *
 * NOTHING IS RECORDED
 * The audio goes from the microphone to Gemini. This screen keeps the words.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, PhoneOff, Radio, Volume2, Languages } from 'lucide-react';

import { useCareer } from '../../context/CareerContext';
import { MascotLoader } from '../processing/MascotLoader';
import {
  completeLiveInterview,
  startLiveInterview,
  type LiveInterviewEvaluation,
  type LiveInterviewLanguage,
  type LiveInterviewType,
  type LiveTranscriptTurn,
} from '../../lib/liveInterviewApi';
import {
  LiveInterviewClient,
  type LiveConnectionState,
} from '../../lib/liveInterviewClient';

const INTERVIEW_TYPES: { value: LiveInterviewType; label: string }[] = [
  { value: 'hr', label: 'HR' },
  { value: 'technical', label: 'Technical' },
  { value: 'role', label: 'Role-based' },
  { value: 'behavioral', label: 'Behavioral' },
  { value: 'mixed', label: 'Mixed' },
];

const LANGUAGES: { value: LiveInterviewLanguage; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'ar', label: 'Arabic' },
  { value: 'ar-eg', label: 'Egyptian Arabic' },
];

export interface LiveInterviewPanelProps {
  /** The role the interview is about. */
  roleTitle?: string;
  /** The posting the interview is about, when there is one. */
  jobDescription?: string | null;
  /** The posting's id, so the interview can be linked to it. */
  jobId?: string | null;
  /** Called once the interview is finished and its report is ready. */
  onCompleted?: (evaluation: LiveInterviewEvaluation | null) => void;
}

export const LiveInterviewPanel: React.FC<LiveInterviewPanelProps> = ({
  roleTitle,
  jobDescription,
  jobId,
  onCompleted,
}) => {
  const { t } = useCareer();

  const [type, setType] = useState<LiveInterviewType>('mixed');
  const [language, setLanguage] = useState<LiveInterviewLanguage>('en');
  const [state, setState] = useState<LiveConnectionState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<LiveTranscriptTurn[]>([]);
  const [evaluation, setEvaluation] = useState<LiveInterviewEvaluation | null>(null);
  const [busy, setBusy] = useState(false);

  const clientRef = useRef<LiveInterviewClient | null>(null);
  const startingRef = useRef(false);
  const stoppingRef = useRef(false);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const startedAtRef = useRef<number>(0);

  // The transcript is scrolled to the newest turn, so the candidate reads
  // the conversation as it happens rather than scrolling to find it.
  useEffect(() => {
    const node = transcriptRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [turns]);

  // The session is closed when the panel goes away, so a microphone is never
  // left open behind a screen the candidate has left.
  useEffect(
    () => () => {
      void clientRef.current?.stop();
      clientRef.current = null;
    },
    []
  );

  const handleStart = useCallback(async () => {
    // A double click can arrive before React has re-rendered the disabled
    // button. The ref is the guard that keeps one interview to one session.
    if (startingRef.current || clientRef.current) return;
    startingRef.current = true;

    setError(null);
    setTurns([]);
    setEvaluation(null);
    setBusy(true);

    const client = new LiveInterviewClient({
      onState: (next) => setState(next),
      onTranscript: (turn) => setTurns((prev) => [...prev, turn]),
      onError: (failure) => setError(failure.message),
    });
    clientRef.current = client;

    try {
      // The audio contexts are created while the click still counts as a
      // user gesture. Doing this after the network request left them
      // suspended on browsers with a strict autoplay policy.
      client.prepare();

      const grant = await startLiveInterview({
        type,
        language,
        roleTitle,
        jobDescription: jobDescription ?? undefined,
        jobId: jobId ?? undefined,
      });

      startedAtRef.current = Date.now();
      await client.start(grant);
    } catch (failure) {
      await client.stop().catch(() => undefined);
      if (clientRef.current === client) clientRef.current = null;
      setState('error');
      setError(
        failure instanceof Error
          ? failure.message
          : t('The live interviewer could not be started.')
      );
    } finally {
      startingRef.current = false;
      setBusy(false);
    }
  }, [type, language, roleTitle, jobDescription, jobId, t]);

  const handleStop = useCallback(async () => {
    const client = clientRef.current;
    if (!client || stoppingRef.current) return;
    stoppingRef.current = true;
    setBusy(true);
    try {
      const transcript = await client.stop();
      if (clientRef.current === client) clientRef.current = null;
      setState('closed');

      if (transcript.length === 0) {
        setError(t('The interview produced no transcript, so there is nothing to report.'));
        return;
      }

      const durationSeconds = Math.round((Date.now() - startedAtRef.current) / 1000);
      const result = await completeLiveInterview({
        type,
        language,
        roleTitle,
        jobDescription: jobDescription ?? undefined,
        jobId: jobId ?? undefined,
        transcript,
        durationSeconds,
      });
      setEvaluation(result.evaluation);
      if (result.evaluationError) setError(result.evaluationError);
      onCompleted?.(result.evaluation);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('The interview could not be saved.'));
    } finally {
      stoppingRef.current = false;
      setBusy(false);
    }
  }, [type, language, roleTitle, jobDescription, jobId, onCompleted, t]);

  /** Returns the panel to the setup screen for a fresh session. */
  const handleRestart = useCallback(() => {
    clientRef.current = null;
    setState('idle');
    setError(null);
    setEvaluation(null);
    setTurns([]);
  }, []);

  /** Saves a transcript whose connection ended before the report was written. */
  const handleSaveTranscript = useCallback(async () => {
    if (turns.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const durationSeconds = Math.round((Date.now() - startedAtRef.current) / 1000);
      const result = await completeLiveInterview({
        type,
        language,
        roleTitle,
        jobDescription: jobDescription ?? undefined,
        jobId: jobId ?? undefined,
        transcript: turns,
        durationSeconds,
      });
      setEvaluation(result.evaluation);
      if (result.evaluationError) setError(result.evaluationError);
      onCompleted?.(result.evaluation);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('The interview could not be saved.'));
    } finally {
      setBusy(false);
    }
  }, [busy, turns, type, language, roleTitle, jobDescription, jobId, onCompleted, t]);

  const live = state === 'connecting' || state === 'listening' || state === 'speaking';
  const speaking = state === 'speaking';

  return (
    <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-primary-text)]">
            <Radio className="h-3.5 w-3.5" />
            {t('Live voice interview')}
          </div>
          <h2 className="mt-1 text-lg font-bold text-[var(--text-primary)]">
            {t('Talk with the interviewer')}
          </h2>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-[var(--text-secondary)]">
            {t(
              'A spoken conversation with an interviewer who listens and follows up. Only the transcript is kept — your voice is not recorded.'
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold ${
              live
                ? 'border-[var(--color-success-strong)]/40 bg-[var(--color-success-surface)] text-[var(--color-success-strong)]'
                : 'border-[var(--border-subtle)] text-[var(--text-muted)]'
            }`}
            aria-live="polite"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                live ? 'bg-[var(--color-success-strong)]' : 'bg-[var(--text-muted)]'
              }`}
              aria-hidden="true"
            />
            {live ? t('Connected') : t('Not connected')}
          </span>
        </div>
      </div>

      {/* The setup, before the conversation starts. */}
      {!live && state !== 'closed' ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)]">
              <Mic className="h-3 w-3" />
              {t('Interview type')}
            </span>
            <select
              value={type}
              onChange={(event) => setType(event.target.value as LiveInterviewType)}
              className="mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-3 py-2 text-xs text-[var(--text-primary)]"
            >
              {INTERVIEW_TYPES.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {t(entry.label)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)]">
              <Languages className="h-3 w-3" />
              {t('Language')}
            </span>
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value as LiveInterviewLanguage)}
              className="mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-3 py-2 text-xs text-[var(--text-primary)]"
            >
              {LANGUAGES.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {t(entry.label)}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => void handleStart()}
            disabled={busy}
            className="mt-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--accent-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--color-on-primary)] transition-opacity hover:opacity-90 disabled:opacity-60 sm:col-span-2"
          >
            <Mic className="h-4 w-4" />
            {t('Start the interview')}
          </button>
        </div>
      ) : null}

      {/* The conversation. */}
      {live ? (
        <div className="mt-4 space-y-4">
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-[var(--surface-secondary)]/50 py-6">
            <div
              className={`flex h-16 w-16 items-center justify-center rounded-full transition-colors ${
                speaking
                  ? 'bg-[var(--accent-primary)]/20 text-[var(--color-primary-text)]'
                  : 'bg-[var(--accent-primary)]/10 text-[var(--color-primary-text)]'
              }`}
              aria-hidden="true"
            >
              {speaking ? <Volume2 className="h-7 w-7" /> : <Mic className="h-7 w-7" />}
            </div>
            <p className="text-xs font-semibold text-[var(--text-primary)]" aria-live="polite">
              {state === 'connecting'
                ? t('Connecting to the interviewer…')
                : speaking
                  ? t('The interviewer is speaking')
                  : t('You are speaking — the interviewer is listening')}
            </p>
            <button
              type="button"
              onClick={() => void handleStop()}
              disabled={busy}
              className="mt-1 inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-danger)]/40 bg-[var(--danger-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--color-danger)] transition-colors hover:opacity-90 disabled:opacity-60"
            >
              <PhoneOff className="h-3.5 w-3.5" />
              {t('End the interview')}
            </button>
          </div>

          <div
            ref={transcriptRef}
            className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/30 p-3"
            aria-live="polite"
          >
            {turns.length === 0 ? (
              <p className="text-[11px] text-[var(--text-muted)]">
                {t('The transcript appears here as the conversation happens.')}
              </p>
            ) : (
              turns.map((turn, index) => (
                <p
                  key={`${turn.speaker}-${index}`}
                  className={`text-xs leading-relaxed ${
                    turn.speaker === 'interviewer'
                      ? 'text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)]'
                  }`}
                >
                  <span className="me-1 font-semibold text-[var(--text-muted)]">
                    {turn.speaker === 'interviewer' ? t('Interviewer') : t('You')}:
                  </span>
                  {turn.text}
                </p>
              ))
            )}
          </div>
        </div>
      ) : null}

      {/* The report. */}
      {evaluation ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              {t('Your interview report')}
            </h3>
            <span className="rounded-full bg-[var(--accent-surface)] px-2 py-0.5 font-mono text-xs font-bold text-[var(--color-primary-text)]">
              {evaluation.score}/10
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              { label: t('Communication'), value: evaluation.communication },
              { label: t('Technical knowledge'), value: evaluation.technicalKnowledge },
              { label: t('Answer quality'), value: evaluation.answerQuality },
              { label: t('Problem solving'), value: evaluation.problemSolving },
              { label: t('Language fluency'), value: evaluation.languageFluency },
            ].map((dimension) => (
              <div
                key={dimension.label}
                className="rounded-xl border border-[var(--border-subtle)] p-2.5"
              >
                <div className="text-[10px] text-[var(--text-secondary)]">{dimension.label}</div>
                <div className="mt-0.5 font-mono text-sm font-bold text-[var(--text-primary)]">
                  {dimension.value}/10
                </div>
              </div>
            ))}
          </div>

          {evaluation.summary ? (
            <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
              {evaluation.summary}
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { title: t('Strengths'), items: evaluation.strengths, tone: 'success' },
              { title: t('Areas to improve'), items: evaluation.improvements, tone: 'warning' },
              { title: t('Suggested better answers'), items: evaluation.suggestedAnswers, tone: 'plain' },
              { title: t('Recommended training plan'), items: evaluation.trainingPlan, tone: 'plain' },
            ].map((section) => (
              <div
                key={section.title}
                className="rounded-xl border border-[var(--border-subtle)] p-3"
              >
                <div className="text-[11px] font-bold text-[var(--text-primary)]">
                  {section.title}
                </div>
                {section.items.length === 0 ? (
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">—</p>
                ) : (
                  <ul className="mt-1.5 space-y-1">
                    {section.items.map((item, index) => (
                      <li key={index} className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
                        • {item}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          {/*
            How the candidate came across.

            These are observations about the conversation — clarity, structure,
            whether they answered what was asked. They are not measurements of
            personality, confidence or state of mind, and the platform does not
            claim to measure those.
          */}
          {evaluation.communicationObservations.length > 0 ? (
            <div className="rounded-xl border border-[var(--border-subtle)] p-3">
              <div className="text-[11px] font-bold text-[var(--text-primary)]">
                {t('How you came across in the conversation')}
              </div>
              <ul className="mt-1.5 space-y-1">
                {evaluation.communicationObservations.map((item, index) => (
                  <li
                    key={index}
                    className="text-[11px] leading-relaxed text-[var(--text-secondary)]"
                  >
                    • {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div
          className="mt-3 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--danger-surface)] p-3 text-xs text-[var(--text-secondary)]"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {busy && !live ? (
        <div className="mt-4 flex justify-center py-4">
          <MascotLoader size="sm" />
        </div>
      ) : null}

      {state === 'closed' && !live ? (
        <div className="mt-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[var(--text-secondary)]">
            {t('The interview is over. Start another one whenever you like.')}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {turns.length > 0 && !evaluation ? (
              <button
                type="button"
                onClick={() => void handleSaveTranscript()}
                disabled={busy}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] px-4 py-2 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-secondary)] disabled:opacity-60"
              >
                {t('Save transcript & get report')}
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleRestart}
              className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--accent-primary)] px-4 py-2 text-xs font-semibold text-[var(--color-on-primary)] transition-opacity hover:opacity-90"
            >
              <Mic className="h-3.5 w-3.5" />
              {t('Start another interview')}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default LiveInterviewPanel;
