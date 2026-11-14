/**
 * The AI assist control.
 *
 * The CV studio had no way to write anything: every line on the document was
 * typed by hand, even when the platform already held the facts. Other parts
 * of the product had one-off "ask the AI" buttons, each of them wired to its
 * own endpoint with its own shape.
 *
 * This is the one implementation of that idea. It is used by every writable
 * field in the studio — the summary, the headline, an experience bullet list,
 * a project description, a course line — and it behaves the same everywhere:
 *
 *   - it offers the controls that change the answer (length and tone);
 *   - it generates, and regenerates a genuinely different answer on request;
 *   - it shows the candidate what it wrote BEFORE anything reaches the
 *     document, so nothing is ever overwritten silently;
 *   - it accepts the suggestion into the field, or discards it;
 *   - and it tells the candidate when part of the answer was removed because
 *     it referred to something they have no record of.
 *
 * The candidate's existing text is sent with every request, so "improve this"
 * and "write this" are the same operation and the model can keep what is
 * already good.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Check, Loader2, Sparkles, X } from 'lucide-react';
import { assistCvField } from '../../lib/cvAssistApi';
import { useCareer } from '../../context/CareerContext';
import { aiButtonLabel } from '../../lib/aiTokenCosts';
import {
  CV_ASSIST_LENGTHS,
  CV_ASSIST_TONES,
  cvAssistActionsFor,
  type CvAssistAction,
  type CvAssistField,
  type CvAssistLength,
  type CvAssistSourceKind,
  type CvAssistTone,
} from '../../../shared/cvAiAssist';

export interface AiAssistProps {
  /** Which field is being written. */
  field: CvAssistField;
  /** The record the field belongs to, when it belongs to one. */
  sourceKind?: CvAssistSourceKind;
  /** The id of that record. */
  sourceId?: string;
  /** The candidate's own notes about this field. */
  context?: string;
  /** The text currently in the field. */
  existingText?: string;
  /** The role the CV is aimed at. */
  targetRoleTitle?: string;
  /** Puts the suggestion into the field. */
  onApply: (text: string, bullets: string[]) => void;
  /** The label on the button. */
  label?: string;
  /** Rendered when the assistant is switched off in the user's preferences. */
  disabledReason?: string;
}

/**
 * The label used for each field.
 *
 * Kept here rather than in the catalogue so the control and the field it
 * writes can never drift apart.
 */
const FIELD_LABELS: Record<CvAssistField, string> = {
  summary: 'Write the summary',
  headline: 'Write the headline',
  experience: 'Write the bullet points',
  education: 'Write the education line',
  project: 'Write the bullet points',
  certification: 'Write the certification line',
  course: 'Write the course line',
  volunteering: 'Write the bullet points',
  skills: 'Write the skills line',
};

const TONE_LABELS: Record<CvAssistTone, string> = {
  professional: 'Professional',
  impactful: 'Impactful',
  concise: 'Concise',
  technical: 'Technical',
};

const LENGTH_LABELS: Record<CvAssistLength, string> = {
  short: 'Short',
  medium: 'Medium',
  long: 'Long',
};

/**
 * The label for each action.
 *
 * Kept here beside the field labels so the control and the contract can
 * never drift apart.
 */
const ACTION_LABELS: Record<CvAssistAction, string> = {
  write: 'Write it for me',
  improve: 'Improve what I wrote',
  shorten: 'Make it shorter',
  expand: 'Add more detail',
  bullets: 'Turn it into bullet points',
  achievements: 'Suggest achievements',
  responsibilities: 'Suggest responsibilities',
  keywords: 'Suggest relevant skills',
};

export const AiAssist: React.FC<AiAssistProps> = ({
  field,
  sourceKind,
  sourceId,
  context,
  existingText,
  targetRoleTitle,
  onApply,
  label,
  disabledReason,
}) => {
  const { t, aiPreferences, privacyPreferences, settings } = useCareer();
  const enabled = aiPreferences.writingAssistance && privacyPreferences.shareAnalyticsWithAi;

  const [isOpen, setIsOpen] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [draftBullets, setDraftBullets] = useState<string[]>([]);
  const [groundingNote, setGroundingNote] = useState<string | null>(null);
  const [tone, setTone] = useState<CvAssistTone>('professional');
  const [length, setLength] = useState<CvAssistLength>('medium');
  // The actions that make sense for this field. A certificate has no
  // achievements to suggest, so the control never offers one.
  const actions = useMemo(() => cvAssistActionsFor(field), [field]);
  const [action, setAction] = useState<CvAssistAction>('write');
  const attemptRef = useRef(0);
  // The request that is currently in flight, so closing the panel really
  // stops it instead of only hiding the answer.
  const controllerRef = useRef<AbortController | null>(null);
  const attemptRunRef = useRef(0);

  const run = useCallback(
    async (attempt: number) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      attemptRunRef.current = attempt;
      setIsWorking(true);
      setError(null);
      try {
        const response = await assistCvField({
          field,
          action,
          sourceKind,
          sourceId,
          context,
          existingText,
          targetRoleTitle,
          tone,
          length,
          // The CV is written in the resume language, so the text the
          // assistant produces for it is written in that language too. The
          // AI response language is a separate setting and does not apply
          // here.
          language: settings.resumeLanguage,
          attempt,
        }, { signal: controller.signal });
        // A late answer from a request the candidate already replaced or
        // cancelled never reaches the field.
        if (attemptRunRef.current !== attempt || controller.signal.aborted) return;
        setDraft(response.text);
        setDraftBullets(response.bullets);
        setGroundingNote(response.groundingNote);
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
        if (attemptRunRef.current !== attempt) return;
        // The server's own message is shown. Nothing is written, and the
        // candidate is not left with a blank field wondering what happened.
        setDraft('');
        setDraftBullets([]);
        setGroundingNote(null);
        setError(
          requestError instanceof Error
            ? requestError.message
            : t('The AI assistant is unavailable right now. Nothing was written.')
        );
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          setIsWorking(false);
        }
      }
    },
    [
      field,
      action,
      sourceKind,
      sourceId,
      context,
      existingText,
      targetRoleTitle,
      tone,
      length,
      settings.resumeLanguage,
      t,
    ]
  );

  const handleOpen = () => {
    setIsOpen(true);
    if (!draft && !isWorking) {
      attemptRef.current = 0;
      void run(0);
    }
  };

  const handleRegenerate = () => {
    attemptRef.current += 1;
    void run(attemptRef.current);
  };

  const handleAccept = () => {
    onApply(draft, draftBullets);
    setIsOpen(false);
    setDraft('');
    setDraftBullets([]);
    setGroundingNote(null);
  };

  const handleCancel = () => {
    // Closing the panel stops the request that is still running, so a late
    // answer cannot appear the next time the panel is opened.
    controllerRef.current?.abort();
    controllerRef.current = null;
    attemptRunRef.current += 1;
    setIsOpen(false);
    setIsWorking(false);
    setDraft('');
    setDraftBullets([]);
    setGroundingNote(null);
    setError(null);
  };

  if (!enabled) {
    return disabledReason ? (
      <p className="text-[11px] text-[var(--text-muted)]">{disabledReason}</p>
    ) : null;
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleOpen}
        disabled={isWorking}
        title={label ?? FIELD_LABELS[field]}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--color-primary-text)] transition-colors hover:bg-[var(--accent-surface)] disabled:opacity-50"
      >
        {isWorking ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
        ) : (
          <Sparkles className="h-3 w-3 shrink-0" />
        )}
        <span>{aiButtonLabel(label ?? t(FIELD_LABELS[field]), 'ai_assist_inline', t)}</span>
      </button>

      {isOpen && (
        <div className="space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-3">
          {/* What the candidate is asking for. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
              {t('AI Suggestions')}
            </span>
            {actions.map((option) => (
              <button
                key={option}
                type="button"
                // A request is in flight while the chip is disabled: a second
                // click would replace the answer being written with another
                // request. Inline CV writing is free, so there is no charge to
                // duplicate either way.
                disabled={isWorking}
                onClick={() => {
                  setAction(option);
                  // The answer changes with the action, so the old one is
                  // discarded rather than left on screen next to the new
                  // question.
                  setDraft('');
                  setDraftBullets([]);
                  setGroundingNote(null);
                  attemptRef.current = 0;
                  void run(0);
                }}
                className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  option === action
                    ? 'bg-[var(--accent-primary)] text-[var(--color-on-primary)]'
                    : 'bg-[var(--surface-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {aiButtonLabel(t(ACTION_LABELS[option]), 'ai_assist_inline', t)}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
              <span>{t('Tone')}</span>
              <select
                value={tone}
                onChange={(event) => setTone(event.target.value as CvAssistTone)}
                className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-1.5 py-1 text-[11px] text-[var(--text-primary)]"
              >
                {CV_ASSIST_TONES.map((option) => (
                  <option key={option} value={option}>
                    {TONE_LABELS[option]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
              <span>{t('Length')}</span>
              <select
                value={length}
                onChange={(event) => setLength(event.target.value as CvAssistLength)}
                className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-1.5 py-1 text-[11px] text-[var(--text-primary)]"
              >
                {CV_ASSIST_LENGTHS.map((option) => (
                  <option key={option} value={option}>
                    {LENGTH_LABELS[option]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {isWorking && (
            <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
              <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
              {t('Writing…')}
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-[var(--color-warning)]/25 bg-[var(--color-warning)]/10 px-2.5 py-2 text-[11px] leading-relaxed text-[var(--text-secondary)]"
            >
              {error}
            </div>
          )}

          {!isWorking && draft && (
            <>
              <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-[var(--surface-secondary)] px-2.5 py-2 text-[11px] leading-relaxed text-[var(--text-primary)]">
                {draft}
              </div>

              {groundingNote && (
                <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">
                  {groundingNote}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleAccept}
                  className="inline-flex items-center gap-1 rounded-lg bg-[var(--accent-primary)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--color-on-primary)] transition-colors hover:bg-[var(--accent-secondary)]"
                >
                  <Check className="h-3 w-3 shrink-0" />
                  <span>{t('Use this')}</span>
                </button>
                <button
                  type="button"
                  onClick={handleRegenerate}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]"
                >
                  <Sparkles className="h-3 w-3 shrink-0" />
                  <span>{aiButtonLabel(t('Try again'), 'ai_assist_inline', t)}</span>
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
                >
                  <X className="h-3 w-3 shrink-0" />
                  <span>{t('Discard')}</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
