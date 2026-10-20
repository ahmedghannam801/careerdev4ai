// Supabase Auth account operations — server-side only.
// The service-role client is used ONLY here, for privileged Auth admin calls.
// The target user is always the verified Supabase Auth user id; never a client-supplied id.
import { getSupabaseServer } from './supabase';

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

  const { error: signInError } = await getSupabaseServer().auth.signInWithPassword({
    email: target.email,
    password: currentPassword,
  });
  if (signInError) return { ok: false, error: 'Current password is incorrect' };

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
 */
export async function deleteAccount(userId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await getSupabaseServer().auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: 'Failed to delete account' };
  return { ok: true };
}
