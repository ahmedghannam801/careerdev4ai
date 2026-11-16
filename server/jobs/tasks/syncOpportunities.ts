// Reading the official opportunity sources.
//
// The work: read the registry of sources, fetch what each of them has
// published, and write what they actually say into the catalogue.
//
// This runs on the worker's schedule rather than when a candidate asks for
// it, because the sources publish on their own timetable. The schedule tick
// is every five minutes, which is far too often to read a ministry's
// announcement page, so the run is guarded: it only happens when the last
// successful read is old enough. That guard lives here rather than in the
// worker so that the rule and the work stay in one file.
//
// Every record that is written can be traced back to a page. A source that
// cannot be read is reported and skipped — the other sources are still read.

import { runJob, type JobContext, type JobPayload } from '../runtime.ts';
import { getSupabaseServer } from '../../db/supabase.ts';
import {
  expirePastOpportunities,
  syncOpportunitySources,
  type SyncOutcome,
} from '../../opportunities/sync.ts';
import { notifyAboutNewOpportunities } from '../../opportunities/notify.ts';
import { ROLE_DEFINITION_LIST } from '../../../shared/careerRoles.ts';

/**
 * How long the platform waits between two reads of the same sources.
 *
 * A government announcement list changes a few times a week at most, so
 * reading it more than once a day is enough to notice. The value is in
 * hours because the schedule tick is in minutes.
 */
export const OPPORTUNITY_SYNC_INTERVAL_HOURS = 12;

/**
 * Whether the sources are due to be read again.
 *
 * The decision is made from the registry itself, so it survives a restart and
 * does not depend on anything the worker kept in memory.
 */
export async function isOpportunitySyncDue(now = new Date()): Promise<boolean> {
  const { data, error } = await getSupabaseServer()
    .from('opportunity_sources')
    .select('last_synced_at, last_status')
    .eq('enabled', true);
  if (error) throw error;

  const sources = (data ?? []) as Array<{
    last_synced_at: string | null;
    last_status: string | null;
  }>;
  if (sources.length === 0) return false;

  const cutoff = now.getTime() - OPPORTUNITY_SYNC_INTERVAL_HOURS * 60 * 60 * 1000;
  return sources.some((source) => {
    // A source that failed is read again as soon as the interval allows, so a
    // broken source recovers without waiting for an operator.
    if (!source.last_synced_at) return true;
    const last = Date.parse(source.last_synced_at);
    if (!Number.isFinite(last)) return true;
    return last < cutoff;
  });
}

/**
 * The synchronisation itself.
 *
 * A plain function, so the scheduled run and a queued job carry out exactly
 * the same work.
 */
export async function runOpportunitySync(now: Date = new Date()): Promise<Record<string, unknown>> {
  const outcome: SyncOutcome = await syncOpportunitySources(now);
  const expired = await expirePastOpportunities(now);
  const notified = await notifyAboutNewOpportunities(outcome.createdOpportunities, now);

  return {
    startedAt: outcome.startedAt,
    finishedAt: outcome.finishedAt,
    sources: outcome.sources,
    created: outcome.created,
    updated: outcome.updated,
    unchanged: outcome.unchanged,
    failed: outcome.failed,
    expired,
    notified,
    /** The roles the notifications were matched against. */
    matchedRoles: ROLE_DEFINITION_LIST.length,
  };
}

/**
 * Reads the sources only when they are due.
 *
 * Returns `null` when the run was skipped, so the caller can tell "nothing
 * was due" apart from "everything was read and nothing changed".
 */
export async function runOpportunitySyncIfDue(
  now: Date = new Date(),
): Promise<Record<string, unknown> | null> {
  const due = await isOpportunitySyncDue(now);
  if (!due) return null;
  return runOpportunitySync(now);
}

export async function syncOpportunitiesTask(
  payload: JobPayload,
  context: JobContext,
): Promise<Record<string, unknown>> {
  return runJob(payload, context, 'reading the opportunity sources', async () => {
    await context.reportStage('reading the opportunity sources');
    return runOpportunitySync();
  });
}
