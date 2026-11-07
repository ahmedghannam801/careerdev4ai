/**
 * The CV Analyzer.
 *
 * The analyzer used to be a page that did the measuring on its own: its own
 * upload, its own run, its own history, and a button in the studio that
 * navigated here to do work the studio already knew how to do.
 *
 * It is now the same panel the studio uses, shown on its own page. The page
 * is kept because the route is in use — links to it exist, and the
 * navigation entry points at it — but the measurement lives in one place:
 * `CvAnalysisPanel`, which the studio's analysis tab also renders.
 *
 * What this page adds on top of the panel is a way into the rest of the
 * studio, because the studio is now where the whole CV journey lives:
 * importing a document, reviewing what was extracted, editing it and
 * measuring it.
 */

import React from 'react';
import { FileText, Gauge } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { CvAnalysisPanel } from '../cv/CvAnalysisPanel';

export const CvAnalyzerView: React.FC<{ onNavigate?: (view: string) => void }> = ({ onNavigate }) => {
  const { t } = useCareer();

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-[var(--text-primary)]">{t('CV Analyzer')}</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {t('Evidence-backed score for the Egyptian market')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate?.('cv-studio')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-secondary)]"
          >
            <Gauge className="w-3.5 h-3.5 text-[var(--color-primary-text)]" />
            {t('Open CV Studio')}
          </button>
        </div>
      </div>

      {/* The panel the studio uses, shown with its upload. */}
      <CvAnalysisPanel showUpload />

      {/* A pointer to the rest of the journey: the studio is where a CV is
          imported, reviewed, corrected and measured. */}
      <div className="p-5 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-2">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-[var(--color-primary-text)]" />
          <h2 className="text-sm font-bold text-[var(--text-primary)]">
            {t('Import a CV and review it before it is used')}
          </h2>
        </div>
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          {t(
            'CV Studio reads a document you already have, shows every value it found with the text it came from, and waits for you to accept it before anything is saved.'
          )}
        </p>
        <button
          type="button"
          onClick={() => onNavigate?.('cv-studio')}
          className="px-3.5 py-2 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--color-on-primary)] text-xs font-bold transition-colors"
        >
          {t('Open CV Studio')}
        </button>
      </div>
    </div>
  );
};
