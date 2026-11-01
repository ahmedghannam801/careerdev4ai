/**
 * The languages the AI assistant can answer in.
 *
 * The interface language and the AI response language are deliberately
 * separate settings. A candidate may read the product in Arabic while asking
 * the assistant for an English CV summary, or work in a French interface and
 * want Arabic coaching. The interface language is a property of the app; the
 * response language is an explicit instruction attached to every AI request.
 *
 * Nothing here relies on the model inferring the language from the prompt.
 * Every request carries a code, and the server turns that code into a direct
 * instruction in the system prompt. That is the only reliable way to keep an
 * Arabic question from producing an English answer, or a French question from
 * drifting into English halfway through.
 */

/** The response languages the product supports. */
export type AiLanguageCode = 'en' | 'ar' | 'fr' | 'de' | 'es';

/** One supported response language. */
export interface AiLanguageDefinition {
  /** The stable code sent over the wire. */
  code: AiLanguageCode;
  /** The English name, used in prompts and diagnostics. */
  englishName: string;
  /** The name in the language itself, used in the selector. */
  nativeName: string;
  /** The direct instruction the model receives. */
  instruction: string;
}

/**
 * The supported languages, in the order the selector shows them.
 *
 * English and Arabic come first because they are the two interface languages
 * today; the other three are response-only additions.
 */
export const AI_LANGUAGES: readonly AiLanguageDefinition[] = [
  {
    code: 'en',
    englishName: 'English',
    nativeName: 'English',
    instruction: 'Write the answer entirely in English.',
  },
  {
    code: 'ar',
    englishName: 'Arabic',
    nativeName: 'العربية',
    instruction: 'Write the answer entirely in Arabic (Modern Standard Arabic).',
  },
  {
    code: 'fr',
    englishName: 'French',
    nativeName: 'Français',
    instruction: 'Write the answer entirely in French (français).',
  },
  {
    code: 'de',
    englishName: 'German',
    nativeName: 'Deutsch',
    instruction: 'Write the answer entirely in German (Deutsch).',
  },
  {
    code: 'es',
    englishName: 'Spanish',
    nativeName: 'Español',
    instruction: 'Write the answer entirely in Spanish (español).',
  },
];

/** The default response language. */
export const DEFAULT_AI_LANGUAGE: AiLanguageCode = 'en';

const AI_LANGUAGE_BY_CODE = new Map<AiLanguageCode, AiLanguageDefinition>(
  AI_LANGUAGES.map((language) => [language.code, language])
);

/** True when the value is a supported response language code. */
export function isAiLanguageCode(value: unknown): value is AiLanguageCode {
  return typeof value === 'string' && AI_LANGUAGE_BY_CODE.has(value as AiLanguageCode);
}

/**
 * Normalises a language value.
 *
 * Accepts a code (`fr`), a locale (`fr-FR`) or an English/native name
 * (`French`, `Français`). An unknown value falls back to the supplied default
 * rather than failing the request: a language preference must never be the
 * reason an AI call is refused.
 */
export function normalizeAiLanguage(
  value: unknown,
  fallback: AiLanguageCode = DEFAULT_AI_LANGUAGE
): AiLanguageCode {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;

  const lower = trimmed.toLowerCase();
  if (isAiLanguageCode(lower)) return lower;

  // A locale such as `fr-FR` or `ar_EG` still names a supported language.
  const base = lower.split(/[-_]/)[0];
  if (isAiLanguageCode(base)) return base;

  for (const language of AI_LANGUAGES) {
    if (
      lower === language.englishName.toLowerCase() ||
      lower === language.nativeName.toLowerCase()
    ) {
      return language.code;
    }
  }
  return fallback;
}

/** The definition for a language code. */
export function aiLanguageDefinition(code: AiLanguageCode): AiLanguageDefinition {
  return AI_LANGUAGE_BY_CODE.get(code) ?? AI_LANGUAGE_BY_CODE.get(DEFAULT_AI_LANGUAGE)!;
}

/**
 * The instruction the model receives.
 *
 * The trailing sentence is shared: technical product names stay in their usual
 * form, because a translated `SQL` or `React` is harder to recognise, not
 * easier.
 */
export function aiLanguageInstruction(code: AiLanguageCode): string {
  return `${aiLanguageDefinition(code).instruction} Keep industry-standard technical names (for example SQL, React, CV, ATS) in the form they are normally written, and do not mix in another language without a reason.`;
}

/** The English name of a language, for prompts and diagnostics. */
export function aiLanguageEnglishName(code: AiLanguageCode): string {
  return aiLanguageDefinition(code).englishName;
}

/** The native label shown in the selector. */
export function aiLanguageNativeName(code: AiLanguageCode): string {
  return aiLanguageDefinition(code).nativeName;
}

/** The selector label, e.g. "Français (French)". */
export function aiLanguageLabel(code: AiLanguageCode): string {
  const language = aiLanguageDefinition(code);
  return language.nativeName === language.englishName
    ? language.englishName
    : `${language.nativeName} (${language.englishName})`;
}
