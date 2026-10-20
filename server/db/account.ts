// Supabase Auth account operations — server-side only.
// The service-role client is used ONLY here, for privileged Auth admin calls.
// The target user is always the verified Supabase Auth user id; never a client-supplied id.
import { createClient } from '@supabase/supabase-js';
import { getSupabaseServer } from './supabase';
import { CV_BUCKET } from './cvStorage';

/**
 * Verifies a password for a user without disturbing the service-role client.
 *
 * `signInWithPassword` stores the session it creates in the client's auth
 * state. Calling it on the shared service-role client would replace that
 * client's service-role session with a USER session, and every later call
 * through it would then run under the user's RLS context instead of the
 * service role — reads would return nothing and writes would be rejected.
 *
 * A throwaway client is therefore used for the sign-in, and the result is
 * discarded.
 */
async function verifyPassword(email: string, password: string): Promise<boolean> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Supabase server credentials are not configured');
  }
  const probe = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await probe.auth.signInWithPassword({ email, password });
  return !error;
}

/**
 * Change the authenticated user's password.
 * Requires the caller's current password (re-authentication) — Supabase Auth
 * verifies it server-side. The plaintext password is never stored or logged.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<{ ok: boolean; error?: string }> {
  // Verify the current password for this user by attempting a sign-in.
  const { data: list } = await getSupabaseServer().auth.admin.listUsers({ page: 1, perPage: 1000 });
  const target = list?.users?.find((u) => u.id === userId);
  if (!target?.email) return { ok: false, error: 'Account not found' };

  const correct = await verifyPassword(target.email, currentPassword);
  if (!correct) return { ok: false, error: 'Current password is incorrect' };

  const { error } = await getSupabaseServer().auth.admin.updateUserById(userId, {
    password: newPassword,
  });
  if (error) return { ok: false, error: 'Failed to update password' };
  return { ok: true };
}

/**
 * Request an email change for the authenticated user.
 * Supabase Auth handles confirmation; the new address is not applied until confirmed.
 */
export async function changeEmail(
  userId: string,
  newEmail: string
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await getSupabaseServer().auth.admin.updateUserById(userId, {
    email: newEmail,
  });
  if (error) return { ok: false, error: 'Failed to update email' };
  return { ok: true };
}

/**
 * Delete the authenticated user's account.
 * auth.users cascades to the profile-owned tables via their FKs.
 *
 * Supabase Storage has NO cascade: an object in the `cv-files` bucket would
 * outlive the user and become unreachable (the bucket policy compares the
 * path's first segment to auth.uid(), and the user no longer exists). The
 * user's folder is therefore emptied BEFORE the identity is deleted.
 */
export async function deleteAccount(userId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data: objects, error: listError } = await getSupabaseServer()
      .storage.from(CV_BUCKET)
      .list(userId, { limit: 1000 });
    if (!listError && (objects ?? []).length > 0) {
      const paths = (objects ?? [])
        .filter((entry) => entry && typeof entry.name === 'string')
        .map((entry) => `${userId}/${entry.name}`);
      if (paths.length > 0) {
        await getSupabaseServer().storage.from(CV_BUCKET).remove(paths);
      }
    }
  } catch {
    // A storage failure must not block the account deletion itself; the
    // bucket sweeper can still reclaim the objects later.
  }

  const { error } = await getSupabaseServer().auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: 'Failed to delete account' };
  return { ok: true };
}
