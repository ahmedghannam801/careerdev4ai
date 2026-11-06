// Typed client for the preferences endpoints.
//
// public.user_preferences holds the settings that belong to the ACCOUNT
// rather than to the browser: the theme, the interface language, the resume
// language and the notification switch. They follow the user to another
// device.
//
// The interface language and the resume language are separate on purpose: the
// interface language decides what the product says, and the resume language
// decides what the CV says.
//
// The remaining settings in the interface (the reminder toggles, the AI
// personalisation controls) are per-device UI preferences and deliberately
// stay in local state.

// The shared client: the same Bearer header, JSON parsing and non-OK
// handling every API module uses.
import { apiRequest as request } from './apiClient';
import {
  normalizeResumeLanguage,
  type ResumeLanguage,
} from '../../shared/resumeLanguage';

export interface PreferencesDTO {
  theme: string | null;
  language: string | null;
  /** The language the CV is written in. Independent of `language`. */
  resumeLanguage: ResumeLanguage;
  notificationsEnabled: boolean | null;
}

export async function fetchPreferences(): Promise<PreferencesDTO | null> {
  const data = await request<{ success: boolean; preferences: PreferencesDTO | null }>(
    '/api/preferences'
  );
  if (!data.preferences) return null;
  return {
    ...data.preferences,
    // The server normalises this too, but a stale row or a cached response
    // must never put the document into a language the studio cannot render.
    resumeLanguage: normalizeResumeLanguage(data.preferences.resumeLanguage),
  };
}

/**
 * Writes the account-owned settings.
 *
 * A field that is absent from `updates` is left untouched.
 */
export async function patchPreferences(
  updates: Partial<PreferencesDTO>
): Promise<PreferencesDTO> {
  const data = await request<{ success: boolean; preferences: PreferencesDTO }>(
    '/api/preferences',
    { method: 'PATCH', body: JSON.stringify(updates) }
  );
  return {
    ...data.preferences,
    resumeLanguage: normalizeResumeLanguage(data.preferences.resumeLanguage),
  };
}
