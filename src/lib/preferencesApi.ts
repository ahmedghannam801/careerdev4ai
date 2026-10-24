// Typed client for the preferences endpoints.
//
// public.user_preferences holds the three settings that belong to the ACCOUNT
// rather than to the browser: the theme, the interface language and the
// notification switch. They follow the user to another device.
//
// The remaining settings in the interface (the reminder toggles, the AI
// personalisation controls) are per-device UI preferences and deliberately
// stay in local state.

// The shared client: the same Bearer header, JSON parsing and non-OK
// handling every API module uses.
import { apiRequest as request } from './apiClient';

export interface PreferencesDTO {
  theme: string | null;
  language: string | null;
  notificationsEnabled: boolean | null;
}

export async function fetchPreferences(): Promise<PreferencesDTO | null> {
  const data = await request<{ success: boolean; preferences: PreferencesDTO | null }>(
    '/api/preferences'
  );
  return data.preferences ?? null;
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
  return data.preferences;
}
