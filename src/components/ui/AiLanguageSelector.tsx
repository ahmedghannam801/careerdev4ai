/**
 * The AI response language selector.
 *
 * The interface language, the resume language and the language the assistant
 * answers in are three different settings:
 *
 *  - the interface language is the language of the application itself;
 *  - the resume language is the language the CV is written in, and it lives in
 *    the CV Studio (see `shared/resumeLanguage.ts`);
 *  - the AI response language is the language every generated answer is
 *    written in.
 *
 * This control is the third one only, and it belongs in the settings screen.
 * It used to be rendered in the application header, where it was read as if it
 * chose the language of the CV; the header no longer carries it.
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
  className?: string;
}

export const AiLanguageSelector: React.FC<AiLanguageSelectorProps> = ({ className = '' }) => {
  const { t, aiPreferences, updateAiPreferences } = useCareer();

  return (
    <div
      className={`space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-4 ${className}`}
    >
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
      <select
        value={aiPreferences.preferredLanguage}
        onChange={(event) =>
          updateAiPreferences({ preferredLanguage: event.target.value as AiLanguageCode })
        }
        aria-label={t('AI response language')}
        title={t('AI response language')}
        className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
      >
        {AI_LANGUAGES.map((language) => (
          <option key={language.code} value={language.code}>
            {aiLanguageLabel(language.code)}
          </option>
        ))}
      </select>
    </div>
  );
};
