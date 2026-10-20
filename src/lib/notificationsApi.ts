// Typed client for the notifications endpoints.
//
// The notifications drawer used to render two hard-coded entries that lived
// only in React state, so the read/unread state was lost on every reload.
// These endpoints make the notifications real, owned rows.
//
// Every call is authenticated with the current Supabase access token; the
// server derives the owner from the verified token.

import { getAccessToken } from './supabase';

export interface NotificationDTO {
  id: string;
  title: string;
  message: string | null;
  type: 'interview' | 'roadmap' | 'application' | 'achievement' | 'system';
  read: boolean;
  linkView: string | null;
  createdAt: string;
}

export class ApiRequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
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
    throw new ApiRequestError(res.status, message);
  }
  return payload as T;
}

export async function fetchNotifications(): Promise<NotificationDTO[]> {
  const data = await request<{ success: boolean; notifications: NotificationDTO[] }>(
    '/api/notifications'
  );
  return data.notifications ?? [];
}

export async function postNotification(input: {
  title: string;
  message?: string;
  type?: NotificationDTO['type'];
  linkView?: string;
}): Promise<NotificationDTO> {
  const data = await request<{ success: boolean; notification: NotificationDTO }>(
    '/api/notifications',
    { method: 'POST', body: JSON.stringify(input) }
  );
  return data.notification;
}

/** Marks one notification as read and returns the refreshed list. */
export async function markNotificationRead(id: string): Promise<NotificationDTO[]> {
  const data = await request<{ success: boolean; notifications: NotificationDTO[] }>(
    `/api/notifications/${id}`,
    { method: 'PATCH' }
  );
  return data.notifications ?? [];
}

/** Marks every unread notification as read and returns the refreshed list. */
export async function markAllNotificationsRead(): Promise<NotificationDTO[]> {
  const data = await request<{ success: boolean; notifications: NotificationDTO[] }>(
    '/api/notifications/read-all',
    { method: 'POST' }
  );
  return data.notifications ?? [];
}

/** Deletes every notification and returns how many were removed. */
export async function clearNotifications(): Promise<number> {
  const data = await request<{ success: boolean; cleared: number }>('/api/notifications', {
    method: 'DELETE',
  });
  return data.cleared ?? 0;
}

export async function deleteNotification(id: string): Promise<void> {
  await request<{ success: boolean }>(`/api/notifications/${id}`, { method: 'DELETE' });
}
