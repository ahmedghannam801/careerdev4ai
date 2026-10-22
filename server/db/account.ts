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
  // getUserById is used instead of listUsers: a 1000-user page would silently
  // fail for every account beyond the first page.
  const { data: target, error: lookupError } = await getSupabaseServer().auth.admin.getUserById(userId);
  if (lookupError || !target?.user?.email) return { ok: false, error: 'Account not found' };
  const targetEmail = target.user.email;

  const correct = await verifyPassword(targetEmail, currentPassword);
  if (!correct) return { ok: false, error: 'Current password is incorrect' };

  const { error } = await getSupabaseServer().auth.admin.updateUserById(userId, {
    password: newPassword,
  });
  if (error) return { ok: false, error: 'Failed to update password' };
  return { ok: true };
}

/**
 * Change the authenticated user's email address.
 *
 * The current password is required, exactly as for a password change. The
 * login identity must not be changeable by anyone who merely holds a stolen
 * session token: without re-authentication an attacker could move the account
 * to an address they control and then reset the password.
 *
 * The Admin API applies the new address immediately; Supabase's confirmation
 * flow is not used here. The password check is therefore the authorization
 * boundary for this operation.
 */
export async function changeEmail(
  userId: string,
  newEmail: string,
  currentPassword: string
): Promise<{ ok: boolean; error?: string }> {
  const { data: target, error: lookupError } = await getSupabaseServer().auth.admin.getUserById(userId);
  if (lookupError || !target?.user?.email) return { ok: false, error: 'Account not found' };

  const correct = await verifyPassword(target.user.email, currentPassword);
  if (!correct) return { ok: false, error: 'Current password is incorrect' };

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
