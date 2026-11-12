/**
 * Importing a CV, the way it should work.
 *
 * The upload used to be one step: a file went in and a CV came out, and the
 * candidate was shown what had been found. This is the same journey with the
 * step the candidate needs in the middle of it.
 *
 *   1. Choose a document — a file or pasted text.
 *   2. Read it. Nothing is written; the reader reports what it found.
 *   3. Review it. Every value, where it came from, how sure the reader is,
 *      and what is wrong with it.
 *   4. Apply it. The records are filled in, the document is saved as a
 *      version, and the analysis is measured again.
 *
 * The candidate can stop at any point before the last one, and nothing they
 * have not accepted is ever written.
 */

import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  Upload,
  Sparkles,
} from 'lucide-react';
import type { CVProfile } from '../../types/career';
import type {
  CvExtractionReview as CvExtractionReviewDocument,
  CvReviewedImportResult,
  CvSectionKey,
} from '../../../shared/cvExtraction';
import { CV_SECTION_LABELS } from '../../../shared/cvExtraction';
import { extractCv, importReviewedCv } from '../../lib/cvExtractionApi';
import { ApiRequestError } from '../../lib/apiClient';
import { useCareer } from '../../context/CareerContext';
import { useToast } from '../toast/ToastProvider';
import { CvExtractionReview, type CvApplyMode } from './CvExtractionReview';

const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.txt', '.json'];

export interface CvReviewWorkspaceProps {
  /** Puts the reviewed document into the studio. */
  onApplied?: (result: CvReviewedImportResult, cv: CVProfile) => void;
}

export const CvReviewWorkspace: React.FC<CvReviewWorkspaceProps> = ({ onApplied }) => {
  const { t, targetRole, applyReviewedCv } = useCareer();
  const { showToast } = useToast();
  const [review, setReview] = useState<CvExtractionReviewDocument | null>(null);
  const [sourceText, setSourceText] = useState('');
  const [isReading, setIsReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CvReviewedImportResult | null>(null);
  const [pasteMode, setPasteMode] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const readDocument = async (file: File | null, text: string | null) => {
    setIsReading(true);
    setError(null);
    setResult(null);
    try {
      const response = await extractCv(file ? { file } : { text: text ?? '' });
      setReview(response.review);
      setSourceText(text ?? '');
      if (file && !text) {
        // The document has to be kept as text so a single section can be
        // read again without the file being uploaded a second time. The
        // browser can read it; the server does not need it.
        try {
          setSourceText(await file.text());
        } catch {
          setSourceText('');
        }
      }
    } catch (readError) {
      setReview(null);
      if (readError instanceof ApiRequestError) {
        setError(readError.message);
      } else {
        setError(
          readError instanceof Error
            ? readError.message
            : t('This document could not be read.')
        );
      }
    } finally {
      setIsReading(false);
    }
  };

  const handleApply = async (
    cv: CVProfile,
    selectedSections: Record<string, boolean>,
    mode: CvApplyMode = 'studio_and_profile'
  ) => {
    const versionName = review?.source.fileName
      ? `${review.source.fileName.replace(/\.[^/.]+$/, '')} (Reviewed)`
      : 'Reviewed CV';

    if (mode === 'studio_only') {
      applyReviewedCv({
        cv,
        versionName,
        targetRoleTitle: targetRole?.title ?? '',
      });
      const studioOnlyOutcome: CvReviewedImportResult = {
        success: true,
        imported: 0,
        skipped: 0,
        failed: 0,
        sections: [],
        errors: [],
      };
      setResult(studioOnlyOutcome);
      showToast({
        variant: 'info',
        title: t('Applied to CV Studio Only'),
        description: t('The reviewed CV is now loaded in CV Studio. Your saved profile records were left unchanged.'),
      });
      onApplied?.(studioOnlyOutcome, cv);
      return;
    }

    const outcome = await importReviewedCv(cv, selectedSections);
    setResult(outcome);
    applyReviewedCv({
      cv,
      versionName,
      targetRoleTitle: targetRole?.title ?? '',
      cvId: outcome.cvId ?? undefined,
      cvVersionId: outcome.cvVersionId ?? undefined,
    });
    onApplied?.(outcome, cv);

    // The candidate has just changed their own records, so the interface
    // confirms it. The counts are the real ones from the write — including
    // what was skipped as already present, so "3 added" is never claimed
    // when nothing was actually added.
    if (outcome.failed > 0) {
      showToast({
        variant: 'error',
        title: t('The CV was applied with some problems.'),
        description: t('{imported} imported, {skipped} already saved, {failed} failed.').replace(
          '{imported}',
          String(outcome.imported)
        ).replace('{skipped}', String(outcome.skipped)).replace('{failed}', String(outcome.failed)),
      });
    } else if (outcome.imported === 0 && outcome.skipped > 0) {
      showToast({
        variant: 'info',
        title: t('Everything in this CV was already saved.'),
        description: t('{skipped} records matched your profile, so nothing was duplicated.').replace(
          '{skipped}',
          String(outcome.skipped)
        ),
      });
    } else {
      showToast({
        variant: 'success',
        title: t('CV applied to your profile.'),
        description: t('{imported} records added, {skipped} already saved.').replace(
          '{imported}',
          String(outcome.imported)
        ).replace('{skipped}', String(outcome.skipped)),
      });
    }
  };

  if (result) {
    return (
      <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] shadow-xs space-y-4">
        <div className="flex items-start gap-3">
          <CheckCircle2
            className={`w-5 h-5 shrink-0 mt-0.5 ${
              result.failed > 0 ? 'text-[var(--color-warning)]' : 'text-[var(--color-success)]'
            }`}
          />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              {result.failed > 0
                ? t('The CV was applied, but some sections could not be saved.')
                : t('The CV is now your CV.')}
            </h3>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {t('Added')}: {result.imported} · {t('Already there')}: {result.skipped} ·{' '}
              {t('Failed')}: {result.failed}
            </p>
          </div>
        </div>

        {result.sections.filter((section) => section.imported > 0).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {result.sections
              .filter((section) => section.imported > 0)
              .map((section) => (
                <span
                  key={section.section}
                  className="px-2.5 py-1 rounded-lg bg-[var(--color-success)]/10 text-[var(--color-success)] text-[11px] font-semibold"
                >
                  {t(CV_SECTION_LABELS[section.section as CvSectionKey] ?? section.section)}: +
                  {section.imported}
                </span>
              ))}
          </div>
        )}

        {result.errors.length > 0 && (
          <ul className="space-y-1">
            {result.errors.map((message, index) => (
              <li key={index} className="text-[11px] text-[var(--color-danger)]">
                {message}
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={() => {
            setResult(null);
            setReview(null);
          }}
          className="px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-secondary)] transition-colors"
        >
          {t('Import another CV')}
        </button>
      </div>
    );
  }

  if (review) {
    return (
      <CvExtractionReview
        review={review}
        sourceText={sourceText}
        onApply={handleApply}
        onClose={() => setReview(null)}
      />
    );
  }

  return (
    <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] shadow-xs space-y-5">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">
          {t('Import your CV')}
        </h2>
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed max-w-2xl">
          {t(
            'Upload the CV you already have. It is read and shown to you section by section, with the original text beside every value, before anything is saved.'
          )}
        </p>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setPasteMode(false)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            pasteMode
              ? 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              : 'bg-[var(--accent-primary)] text-[var(--color-on-primary)]'
          }`}
        >
          {t('Upload a file')}
        </button>
        <button
          type="button"
          onClick={() => setPasteMode(true)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            pasteMode
              ? 'bg-[var(--accent-primary)] text-[var(--color-on-primary)]'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          {t('Paste your CV text')}
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-xl border border-[var(--color-danger)]/25 bg-[var(--color-danger)]/10 flex items-start gap-2.5"
        >
          <AlertCircle className="w-4 h-4 text-[var(--color-danger)] shrink-0 mt-0.5" />
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{error}</p>
        </div>
      )}

      {pasteMode ? (
        <div className="space-y-3">
          <textarea
            value={pastedText}
            onChange={(event) => setPastedText(event.target.value)}
            rows={12}
            placeholder={t('Paste the full text of your CV here…')}
            className="w-full px-3.5 py-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/30 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] resize-y leading-relaxed"
          />
          <button
            type="button"
            onClick={() => readDocument(null, pastedText)}
            disabled={!pastedText.trim() || isReading}
            className="px-4 py-2 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--color-on-primary)] text-xs font-bold flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {isReading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            {isReading ? t('Reading…') : t('Read my CV')}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS.join(',')}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              if (file) readDocument(file, null);
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isReading}
            className="w-full py-8 rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-secondary)]/30 hover:bg-[var(--surface-secondary)] flex flex-col items-center gap-2.5 transition-colors disabled:opacity-60"
          >
            {isReading ? (
              <Loader2 className="w-6 h-6 text-[var(--color-primary-text)] animate-spin" />
            ) : (
              <Upload className="w-6 h-6 text-[var(--color-primary-text)]" />
            )}
            <span className="text-xs font-bold text-[var(--text-primary)]">
              {isReading ? t('Reading your CV…') : t('Choose a file')}
            </span>
            <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-1.5">
              <FileText className="w-3 h-3" />
              PDF, DOCX, DOC, TXT or JSON
            </span>
          </button>
        </div>
      )}
    </div>
  );
};
