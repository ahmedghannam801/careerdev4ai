/**
 * The resume language picker.
 *
 * It lives in the CV Studio, and only there. The header used to carry a
 * language selector, and it read as if it chose the language of the CV —
 * which it did not: it chose the language the assistant answered in. A
 * candidate who wanted an English CV while working in an Arabic interface
 * had nowhere to say so, and the document silently followed the interface.
 *
 * This picker is that somewhere. It changes:
 *
 *   - the section headings printed on the document;
 *   - the direction the document is laid out in;
 *   - the language the assistant writes CV content in.
 *
 * It does NOT change the interface language, and it does not rewrite the
 * facts: an employer, a university and a certificate body are proper nouns
 * and keep the spelling their issuer gave them.
 */

import React from 'react';
import { Languages } from 'lucide-react';
import { useCareer } from '../../../context/CareerContext';
import {
  RESUME_LANGUAGES,
  resumeDirection,
  type ResumeLanguage,
} from '../../../../shared/resumeLanguage';

export interface ResumeLanguagePickerProps {
  className?: string;
  /** Called after the language has been stored. */
  onChange?: (language: ResumeLanguage) => void;
}

export const ResumeLanguagePicker: React.FC<ResumeLanguagePickerProps> = ({
  className = '',
  onChange,
}) => {
  const { t, settings, updateSettings } = useCareer();

  const handleChange = (language: ResumeLanguage) => {
    updateSettings({ resumeLanguage: language });
    onChange?.(language);
  };

  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] px-3 py-2 ${className}`}
    >
      <Languages className="h-4 w-4 shrink-0 text-[var(--color-primary-text)]" />
      <div className="min-w-0">
        <span className="block text-xs font-bold text-[var(--text-primary)]">
          {t('Resume Language')}
        </span>
        <span className="block text-[10px] leading-relaxed text-[var(--text-muted)]">
          {t('The language your CV is written in. It does not change the language of the interface.')}
        </span>
      </div>
      <div
        role="radiogroup"
        aria-label={t('Resume Language')}
        className="ms-auto flex items-center gap-1 rounded-lg bg-[var(--surface-secondary)] p-1"
      >
        {RESUME_LANGUAGES.map((option) => {
          const active = settings.resumeLanguage === option.code;
          return (
            <button
              key={option.code}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => handleChange(option.code)}
              title={`${option.englishLabel} — ${option.nativeLabel} (${resumeDirection(option.code)})`}
              className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                active
                  ? 'bg-[var(--accent-primary)] text-[var(--color-on-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {option.nativeLabel}
            </button>
          );
        })}
      </div>
    </div>
  );
};
