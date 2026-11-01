/**
 * The AI response language selector.
 *
 * The interface language and the language the assistant answers in are two
 * different settings. A candidate may read the app in Arabic but ask for an
 * English CV summary, or work in a French interface and want Arabic coaching.
 *
 * The selection is stored in the browser with the rest of the AI preferences
 * and is sent explicitly with every AI request. It is never inferred from the
 * prompt, because a model reading an English question in an Arabic interface
 * would otherwise answer in the wrong language.
 */

import React from 'react';
import { Languages } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import {
  AI_LANGUAGES,
  aiLanguageLabel,
  type AiLanguageCode,
} from '../../../shared/aiLanguages';

export interface AiLanguageSelectorProps {
  /** `compact` fits in the header; `card` is the settings control. */
  variant?: 'compact' | 'card';
  className?: string;
}

export const AiLanguageSelector: React.FC<AiLanguageSelectorProps> = ({
  variant = 'compact',
  className = '',
}) => {
  const { t, aiPreferences, updateAiPreferences } = useCareer();

  const select = (
    <select
      value={aiPreferences.preferredLanguage}
      onChange={(event) =>
        updateAiPreferences({ preferredLanguage: event.target.value as AiLanguageCode })
      }
      aria-label={t('AI response language')}
      title={t('AI response language')}
      className={
        variant === 'compact'
          ? 'max-w-[7.5rem] rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-1.5 py-1 text-[11px] font-semibold text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none'
          : 'w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none'
      }
    >
      {AI_LANGUAGES.map((language) => (
        <option key={language.code} value={language.code}>
          {aiLanguageLabel(language.code)}
        </option>
      ))}
    </select>
  );

  if (variant === 'card') {
    return (
      <div className={`space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-4 ${className}`}>
        <div className="flex items-center gap-2">
          <Languages className="h-4 w-4 shrink-0 text-[var(--color-primary-text)]" />
          <div>
            <span className="block text-xs font-bold text-[var(--text-primary)]">
              {t('AI response language')}
            </span>
            <p className="text-[11px] text-[var(--text-secondary)]">
              {t(
                'Every AI answer, summary and feedback will be written in this language. It is separate from the interface language.'
              )}
            </p>
          </div>
        </div>
        {select}
      </div>
    );
  }

  return (
    <label className={`inline-flex items-center gap-1.5 ${className}`}>
      <Languages className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
      <span className="sr-only">{t('AI response language')}</span>
      {select}
    </label>
  );
};
