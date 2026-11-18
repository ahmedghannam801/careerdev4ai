// The approval gate on sending an application.
//
// WHAT THIS IS FOR
// -----------------
// An application package holds the tailored CV, the cover letter and the
// analysis of the posting. The platform builds them from the candidate's own
// verified record, so they are accurate — but they are still the candidate's
// words going to an employer, and the candidate must be the one who says
// "yes, this is what I want to send".
//
// Before this, nothing recorded that decision. A package could be created and
// treated as finished.
//
// THE RULE
// --------
// A package cannot be marked as ready to send unless the candidate has
// approved it, and it cannot reach 'approved' without going through review
// first. The rule is enforced by a trigger in the database, so it holds
// however the change was made — through this API, through a dashboard, or
// through a crafted request.
//
// The states:
//
//   draft         the candidate is still working on it
//   pending_review  the candidate has asked for it to be reviewed
//   approved      the candidate has read it and said yes
//   rejected      the candidate has read it and said no
//
// This module moves a package between those states and records what happened.
// It never approves anything on the candidate's behalf: every transition is
// made by the candidate, through their own account.

import { getSupabaseServer } from './supabase.ts';

/** The states a package can be in. */
export const APPLICATION_PACKAGE_STATUSES = [
  'draft',
  'pending_review',
  'approved',
  'rejected',
] as const;

export type ApplicationPackageStatus = (typeof APPLICATION_PACKAGE_STATUSES)[number];

/** What the candidate asked for. */
export type ApplicationPackageAction = 'submit_for_review' | 'approve' | 'reject' | 'withdraw';

/**
 * The state each action leads to.
 *
 * The mapping is written out rather than derived, so the allowed moves are
 * visible in one place and the database trigger can be checked against it.
 */
const ACTION_TARGETS: Record<ApplicationPackageAction, ApplicationPackageStatus> = {
  submit_for_review: 'pending_review',
  approve: 'approved',
  reject: 'rejected',
  withdraw: 'draft',
};

/** The state each action has to start from. */
const ACTION_REQUIRES: Record<ApplicationPackageAction, ApplicationPackageStatus[]> = {
  submit_for_review: ['draft', 'rejected'],
  approve: ['pending_review'],
  reject: ['pending_review'],
  withdraw: ['approved'],
};

/** One decision, as it is recorded. */
export interface ApplicationPackageReviewDTO {
  id: string;
  packageId: string;
  fromStatus: ApplicationPackageStatus;
  toStatus: ApplicationPackageStatus;
  note: string | null;
  createdAt: string;
}

/** The outcome of a move. */
export interface ApplicationPackageTransitionResult {
  packageId: string;
  fromStatus: ApplicationPackageStatus;
  toStatus: ApplicationPackageStatus;
  reviewedAt: string | null;
}

/**
 * The reason a move was refused, in the interface's own words.
 *
 * The wording names the state the package is in, because the candidate can
 * only act on what they are told.
 */
export function describeRefusal(
  action: ApplicationPackageAction,
  fromStatus: ApplicationPackageStatus,
  required: readonly ApplicationPackageStatus[]
): string {
  const requiredText = required.join(' or ');
  const actionText: Record<ApplicationPackageAction, string> = {
    submit_for_review: 'sent for review',
    approve: 'approved',
    reject: 'rejected',
    withdraw: 'withdrawn',
  };

  return `This application is ${fromStatus.replace('_', ' ')}, so it cannot be ${actionText[action]}. It must be ${requiredText} first.`;
}

/**
 * Moves a package to the state the action names.
 *
 * The state the package must be in is checked here first, so the candidate
 * gets a clear message rather than a database error. The database checks it
 * again, and that second check is the one that counts: this function is a
 * courtesy, the trigger is the gate.
 */
export async function transitionApplicationPackage(
  profileId: string,
  packageId: string,
  action: ApplicationPackageAction,
  note?: string | null
): Promise<
  | { ok: true; result: ApplicationPackageTransitionResult }
  | { ok: false; status: number; error: string }
> {
  const target = ACTION_TARGETS[action];
  const required = ACTION_REQUIRES[action];

  const { data: current, error: readError } = await getSupabaseServer()
    .from('application_packages')
    .select('id, status')
    .eq('id', packageId)
    .eq('profile_id', profileId)
    .maybeSingle();

  if (readError) {
    console.error('Could not read the application package:', readError.message);
    return { ok: false, status: 500, error: 'Failed to read this application' };
  }

  // A package that does not exist and a package that belongs to somebody else
  // are answered the same way, so the route cannot be used to discover which
  // package ids exist.
  if (!current) {
    return { ok: false, status: 404, error: 'Application not found' };
  }

  const fromStatus = (current.status ?? 'draft') as ApplicationPackageStatus;
  if (!required.includes(fromStatus)) {
    return {
      ok: false,
      status: 409,
      error: describeRefusal(action, fromStatus, required),
    };
  }

  const trimmedNote = typeof note === 'string' && note.trim() ? note.trim().slice(0, 2000) : null;

  const { data: updated, error: writeError } = await getSupabaseServer()
    .from('application_packages')
    .update({ status: target, review_note: trimmedNote })
    .eq('id', packageId)
    .eq('profile_id', profileId)
    .select('id, status, reviewed_at')
    .maybeSingle();

  if (writeError) {
    // The trigger refused the move. This is the gate working, not a failure
    // of the platform, so the candidate is told the move was refused.
    if (writeError.code === '23514' || writeError.code === 'P0001') {
      return {
        ok: false,
        status: 409,
        error: describeRefusal(action, fromStatus, required),
      };
    }
    console.error('Could not move the application package:', writeError.message);
    return { ok: false, status: 500, error: 'Failed to update this application' };
  }

  if (!updated) {
    return { ok: false, status: 404, error: 'Application not found' };
  }

  return {
    ok: true,
    result: {
      packageId: updated.id as string,
      fromStatus,
      toStatus: (updated.status ?? target) as ApplicationPackageStatus,
      reviewedAt: (updated.reviewed_at as string | null) ?? null,
    },
  };
}

/**
 * The decisions made on a package.
 *
 * This is the record that "the candidate approved this" can be checked
 * against later, rather than taken on trust.
 */
export async function listApplicationPackageReviews(
  profileId: string,
  packageId: string
): Promise<ApplicationPackageReviewDTO[]> {
  const { data, error } = await getSupabaseServer()
    .from('application_package_reviews')
    .select('id, package_id, from_status, to_status, note, created_at')
    .eq('profile_id', profileId)
    .eq('package_id', packageId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Could not read the application reviews:', error.message);
    return [];
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    packageId: row.package_id as string,
    fromStatus: row.from_status as ApplicationPackageStatus,
    toStatus: row.to_status as ApplicationPackageStatus,
    note: (row.note as string | null) ?? null,
    createdAt: row.created_at as string,
  }));
}

/**
 * True when the package may be sent.
 *
 * This is the check the sending route makes. It reads the state from the
 * database rather than from anything the browser sent, so it cannot be
 * talked into sending something nobody approved.
 */
export async function isPackageApproved(
  profileId: string,
  packageId: string
): Promise<boolean> {
  const { data, error } = await getSupabaseServer()
    .from('application_packages')
    .select('status')
    .eq('id', packageId)
    .eq('profile_id', profileId)
    .maybeSingle();

  if (error || !data) return false;
  return (data as { status: string }).status === 'approved';
}
