// The heartbeat.
//
// A queue on its own cannot do anything: it needs a worker behind it. The
// API cannot ask the queue whether one is there, so the worker says so.
//
// Every worker writes a row here when it runs its scheduled sweep, and the API
// reads the newest one. A heartbeat that has gone quiet is evidence, not a
// guess — which is what lets the interface say "background processing is not
// available right now" without ever having to guess.
//
// The same module serves the deployed worker and the local development
// runner, so the local server tells the truth about itself in exactly the same
// way the deployed one does.

import { getSupabaseServer } from '../db/supabase.ts';

/**
 * Records that a worker is alive.
 *
 * The row is keyed by the worker's id, so a worker that restarts keeps its own
 * row and the "when did it last check in" question keeps meaning the same
 * thing.
 */
export async function writeConsumerHeartbeat(
  consumerId: string,
  queue: string | null,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const now = new Date().toISOString();

  const { error } = await getSupabaseServer()
    .from('background_job_consumers')
    .upsert(
      {
        consumer_id: consumerId,
        queue,
        last_seen_at: now,
        metadata: metadata ?? null,
      },
      { onConflict: 'consumer_id' },
    );

  if (error) {
    // A heartbeat that cannot be written is worth reporting, but it must not
    // stop the sweep: the rest of the sweep still recovers work that is
    // stranded.
    console.error('Could not record the background worker heartbeat:', error.message);
  }
}
