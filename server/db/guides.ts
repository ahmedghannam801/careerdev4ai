/**
 * Guided tour state.
 *
 * The product had no way to remember that a user had already seen a first-use
 * hint. A hint that is not remembered either appears forever or never appears
 * at all, so this table is what makes a guided tour possible: the row is
 * written when the user dismisses a tour, and its presence means "do not
 * show this again".
 */

import { getSupabaseServer } from './supabase';

export interface GuideDismissal {
  guideKey: string;
  dismissedAt: string;
}

/** The guide keys the product knows about. */
export const GUIDE_KEYS = [
  'dashboard',
  'roadmap',
  'learning',
  'projects',
  'volunteer',
  'cv',
  'skills',
] as const;

export type GuideKey = (typeof GUIDE_KEYS)[number];

function isGuideKey(value: string): value is GuideKey {
  return (GUIDE_KEYS as readonly string[]).includes(value);
}

/**
 * The guide keys the user has already dismissed.
 *
 * A user with no rows has dismissed nothing, which is what a brand new user
 * should see.
 */
export async function listDismissedGuides(profileId: string): Promise<string[]> {
  const { data, error } = await getSupabaseServer()
    .from('user_guide_dismissals')
    .select('guide_key')
    .eq('profile_id', profileId);
  if (error) throw error;
  return ((data ?? []) as Array<{ guide_key: string }>).map((row) => row.guide_key);
}

/**
 * Records that the user has seen a guide.
 *
 * Unknown keys are rejected so a typo cannot create an unbounded set of
 * rows.
 */
export async function dismissGuide(
  profileId: string,
  guideKey: string
): Promise<GuideDismissal> {
  const key = guideKey.trim().toLowerCase();
  if (!isGuideKey(key)) {
    throw new Error(`Unknown guide key: ${guideKey}`);
  }

  const { data, error } = await getSupabaseServer()
    .from('user_guide_dismissals')
    .upsert(
      { profile_id: profileId, guide_key: key, dismissed_at: new Date().toISOString() },
      { onConflict: 'profile_id,guide_key' }
    )
    .select('guide_key, dismissed_at')
    .single();
  if (error) throw error;

  return {
    guideKey: (data as { guide_key: string }).guide_key,
    dismissedAt: (data as { dismissed_at: string }).dismissed_at,
  };
}

/**
 * Clears a dismissal so the guide is shown again.
 *
 * Used by the "show me around again" action in settings.
 */
export async function restoreGuide(
  profileId: string,
  guideKey: string
): Promise<boolean> {
  const key = guideKey.trim().toLowerCase();
  if (!isGuideKey(key)) {
    throw new Error(`Unknown guide key: ${guideKey}`);
  }
  const { error } = await getSupabaseServer()
    .from('user_guide_dismissals')
    .delete()
    .eq('profile_id', profileId)
    .eq('guide_key', key);
  if (error) throw error;
  return true;
}
