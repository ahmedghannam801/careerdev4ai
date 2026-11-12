/**
 * Activity status badges.
 *
 * Recent Activity used to label every entry with the same phrase, "Verified
 * log", whether the candidate had ticked a task, submitted a project or the
 * platform had evaluated an assessment. The word "verified" claimed a review
 * that had not happened, and the identical badge made the list unscannable.
 *
 * There are four honest states, and each activity belongs to exactly one:
 *
 *   Activity Recorded   the candidate did something; the platform noted it
 *   User Submitted      the candidate handed something in for review
 *   System Evaluated    the platform measured it automatically
 *   Evidence Verified   the platform checked proof and accepted it
 *
 * The mapping is by action type, so every surface that renders an activity —
 * the dashboard list, the progress page, the mobile summary — uses the same
 * label. It is pure and shared.
 */

import type { ActivityActionType } from '../src/types/career.ts';

export const ACTIVITY_BADGE_IDS = [
  'activity_recorded',
  'user_submitted',
  'system_evaluated',
  'evidence_verified',
] as const;

export type ActivityBadgeId = (typeof ACTIVITY_BADGE_IDS)[number];

export type ActivityBadgeTone = 'neutral' | 'info' | 'measured' | 'proof';

export interface ActivityBadge {
  id: ActivityBadgeId;
  label: string;
  tone: ActivityBadgeTone;
  /** One sentence explaining what the badge means, for a tooltip. */
  description: string;
}

export const ACTIVITY_BADGES: Record<ActivityBadgeId, ActivityBadge> = {
  activity_recorded: {
    id: 'activity_recorded',
    label: 'Activity Recorded',
    tone: 'neutral',
    description: 'You did this and the platform saved it to your history.',
  },
  user_submitted: {
    id: 'user_submitted',
    label: 'User Submitted',
    tone: 'info',
    description: 'You handed this in. It is waiting to be reviewed or looked at.',
  },
  system_evaluated: {
    id: 'system_evaluated',
    label: 'System Evaluated',
    tone: 'measured',
    description: 'The platform measured this result automatically.',
  },
  evidence_verified: {
    id: 'evidence_verified',
    label: 'Evidence Verified',
    tone: 'proof',
    description: 'The platform checked the proof behind this and accepted it.',
  },
};

/**
 * Which badge an action type earns.
 *
 * The default is `activity_recorded`: an action the platform does not recognise
 * is something the candidate did, not something the platform verified.
 */
const ACTION_BADGE_MAP: Record<ActivityActionType, ActivityBadgeId> = {
  completed_task: 'activity_recorded',
  added_project: 'user_submitted',
  uploaded_cv: 'user_submitted',
  applied_job: 'user_submitted',
  mock_interview: 'system_evaluated',
  acquired_skill: 'system_evaluated',
  added_evidence: 'evidence_verified',
  saved_job: 'activity_recorded',
  goal_updated: 'activity_recorded',
  document_saved: 'user_submitted',
};

export function activityBadge(actionType: string | null | undefined): ActivityBadge {
  if (!actionType) return ACTIVITY_BADGES.activity_recorded;
  const key = actionType as ActivityActionType;
  return ACTIVITY_BADGES[ACTION_BADGE_MAP[key] ?? 'activity_recorded'];
}

/** The badge id alone, for callers that only need a CSS class or a key. */
export function activityBadgeId(actionType: string | null | undefined): ActivityBadgeId {
  return activityBadge(actionType).id;
}

/**
 * Builds an activity badge from a free-text event kind.
 *
 * Some server events describe a submission or a verification without using the
 * client's action vocabulary. This maps those words to the same four badges so
 * a server-rendered row is labelled consistently with a client one.
 */
export function activityBadgeFromEventLabel(label: string): ActivityBadge {
  const normalized = label.trim().toLowerCase();
  if (/verif|proof|evidence/.test(normalized)) return ACTIVITY_BADGES.evidence_verified;
  if (/evaluat|assess|score|measured|graded/.test(normalized))
    return ACTIVITY_BADGES.system_evaluated;
  if (/submit|handed|applied|uploaded|saved/.test(normalized))
    return ACTIVITY_BADGES.user_submitted;
  return ACTIVITY_BADGES.activity_recorded;
}
