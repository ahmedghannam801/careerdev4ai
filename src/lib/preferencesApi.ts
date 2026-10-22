// Typed client for the preferences endpoints.
//
// public.user_preferences holds the three settings that belong to the ACCOUNT
// rather than to the browser: the theme, the interface language and the
// notification switch. They follow the user to another device.
//
// The remaining settings in the interface (the reminder toggles, the AI
// personalisation controls) are per-device UI preferences and deliberately
// stay in local state.

import { getAccessToken } from './supabase';

export interface PreferencesDTO {
  theme: string | null;
  language: string | null;
  notificationsEnabled: boolean | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(path, { ...init, headers });
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok) {
    const message =
      payload && typeof payload === 'object' && payload !== null && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed with status ${res.status}`;
    throw new Error(message);
  }
  return payload as T;
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
