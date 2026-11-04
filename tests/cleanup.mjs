// Test-run cleanup.
//
// Every artifact this suite can create is removed by exact identity — an
// auth-user id, a profile id, a row id, a storage object path. Nothing is ever
// removed by a table-wide delete or a table-wide truncate, and nothing outside
// the `cp-test-*` namespace is ever touched.
//
// What the sweep covers, and why each part is needed:
//
//   auth.users               the test identities themselves. Deleting an auth
//                            user cascades to public.profiles, and from there
//                            to every profile-scoped domain table (verified
//                            live — see the B3_7_1 report).
//   public.profiles          removed explicitly as well, so that a failed
//                            cascade can never leave a profile behind.
//   public.user_preferences  keyed by user_id. The cascade already covers it,
//                            but it is swept explicitly for the same reason.
//   public.skills            a GLOBAL catalogue with no owner and no cascade.
//                            A project with a skill inserts a catalogue row
//                            that would survive forever. The runner snapshots
//                            the catalogue before the run and removes only the
//                            ids that are new afterwards — a skill that
//                            already existed belongs to a real user and is
//                            never touched.
//   storage.objects          Storage has no cascade at all: a file uploaded by
//                            a test user outlives the user. The bucket is swept
//                            per test-user folder.
//   .careerpilot_state.json  the legacy JSON state file. The suite must never
//                            write to it; its content is verified unchanged
//                            after the run.

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

/** Prefix every test identity's email carries. Nothing else is ever removed. */
export const TEST_EMAIL_PREFIX = 'cp-test-';

/**
 * How long an identity may exist before it is treated as abandoned residue.
 *
 * A run that is still going on cannot have created an identity older than
 * this: the workflow gives a run twenty minutes, and a local run finishes in
 * about ten. So anything older belongs to a run that was interrupted, and an
 * identity younger than this may still belong to a run that is in progress.
 */
export const STALE_IDENTITY_AGE_MS = 60 * 60 * 1000;

/**
 * The namespace of the run that is executing right now.
 *
 * Every identity this run creates carries the run id, so two runs against the
 * same database can never remove each other's data. That matters: the suite
 * deletes the identities it finds at the end of a run, and before this
 * existed, two runs that overlapped — two CI runs, or a CI run and a local
 * run — deleted each other's identities in the middle of their own tests.
 * The result was a red CI with failures that had nothing to do with the
 * commit under test.
 *
 * The id is read from the environment when there is one, so the runner's own
 * process and the test files it spawns agree on it.
 */
export function testRunId() {
  if (!process.env.TEST_RUN_ID) {
    process.env.TEST_RUN_ID = randomBytes(4).toString('hex');
  }
  return process.env.TEST_RUN_ID;
}

/** The email prefix of the current run's identities. */
export function runEmailPrefix() {
  return `${TEST_EMAIL_PREFIX}${testRunId()}-`;
}

/** The CV storage bucket the application uses. */
const CV_BUCKET = 'cv-files';

/**
 * Every table the suite can leave a row in, with the column that identifies
 * the owning test profile.
 *
 * `user_preferences` and `user_skills` are keyed by `user_id`; every other
 * table here is keyed by `profile_id`.
 */
const PROFILE_SCOPED_TABLES = [
  { table: 'user_preferences', column: 'user_id' },
  { table: 'user_skills', column: 'user_id' },
  { table: 'notifications', column: 'profile_id' },
  { table: 'profile_career_identity', column: 'profile_id' },
  { table: 'profile_certifications', column: 'profile_id' },
  { table: 'profile_languages', column: 'profile_id' },
  { table: 'profile_links', column: 'profile_id' },
  { table: 'projects', column: 'profile_id' },
  { table: 'evidence_items', column: 'profile_id' },
  { table: 'cvs', column: 'profile_id' },
  { table: 'saved_roles', column: 'profile_id' },
  { table: 'job_applications', column: 'profile_id' },
  { table: 'interview_sessions', column: 'profile_id' },
  { table: 'roadmaps', column: 'profile_id' },
  { table: 'activities', column: 'profile_id' },
  { table: 'secondary_goals', column: 'profile_id' },
  { table: 'career_milestones', column: 'profile_id' },
  { table: 'cover_letters', column: 'profile_id' },
  { table: 'job_bookmarks', column: 'profile_id' },
  { table: 'user_learning_items', column: 'profile_id' },
  // The administrative layer. An announcement belongs to the profile that
  // wrote it, so a failed run cannot leave a test announcement behind.
  { table: 'announcements', column: 'created_by' },
  { table: 'admin_users', column: 'profile_id' },
];

export function createAdminClient(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Lists the Supabase Auth identities whose email carries a prefix.
 *
 * Pagination is handled: the list is not capped at one page.
 *
 * The prefix defaults to the current run's namespace, so a run only ever sees
 * the identities it created. `created_at` is returned so a caller can tell an
 * abandoned identity from one a concurrent run is still using.
 */
export async function listTestIdentities(admin, prefix = runEmailPrefix()) {
  const found = [];
  let page = 1;
  let sawFullPage;

  do {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      throw new Error(`Could not list Supabase Auth users: ${error.message}`);
    }
    const users = data?.users ?? [];
    for (const user of users) {
      if (!user.email || !user.email.startsWith(prefix)) continue;
      found.push({ id: user.id, email: user.email, createdAt: user.created_at ?? null });
    }
    sawFullPage = users.length === 200;
    page += 1;
  } while (sawFullPage);

  return found;
}

/**
 * Lists the test identities that belong to some OTHER run.
 *
 * They are never deleted by a run that did not create them: a concurrent run
 * may still be using them. They are reported so that residue is visible
 * rather than silent.
 */
export async function listForeignTestIdentities(admin) {
  const mine = runEmailPrefix();
  const all = await listTestIdentities(admin, TEST_EMAIL_PREFIX);
  return all.filter((identity) => !identity.email.startsWith(mine));
}

/**
 * Lists the identities that belong to no live run: they were left behind by
 * a run that was interrupted.
 *
 * An identity is only treated as abandoned when it is older than
 * `STALE_IDENTITY_AGE_MS`. Anything younger may belong to a run that is still
 * going on, and removing it would break that run.
 */
export async function listStaleTestIdentities(admin, maxAgeMs = STALE_IDENTITY_AGE_MS) {
  const cutoff = Date.now() - maxAgeMs;
  const foreign = await listForeignTestIdentities(admin);
  return foreign.filter((identity) => {
    if (!identity.createdAt) return false;
    const created = new Date(identity.createdAt).getTime();
    return Number.isFinite(created) && created < cutoff;
  });
}

/**
 * Deletes the test identities that carry a prefix, and everything they own.
 *
 * Order matters: the storage objects and the explicitly-keyed rows are removed
 * while the profile still exists, then the auth identity goes last so that the
 * database cascade can take the remaining profile-scoped rows with it.
 *
 * The prefix defaults to the current run's namespace. A run must never delete
 * an identity another run created: that identity may be in the middle of a
 * test in that other run.
 *
 * One identity that cannot be removed must not stop the sweep of the others,
 * so a failure is retried and then reported by the runner's final verification,
 * which fails the run if anything was left behind.
 *
 * Returns the ids that were removed.
 */
export async function deleteAllTestIdentities(admin, prefix = runEmailPrefix()) {
  const identities = await listTestIdentities(admin, prefix);
  return deleteTestIdentities(admin, identities);
}

/**
 * Deletes a specific set of test identities, and everything they own.
 *
 * One identity that cannot be removed must not stop the removal of the
 * others, so a failure is retried and then reported by the runner's final
 * verification, which fails the run if anything was left behind.
 *
 * Returns the ids that were removed.
 */
export async function deleteTestIdentities(admin, identities) {
  const removedIds = [];
  for (const { id } of identities) {
    try {
      await deleteTestIdentity(admin, id);
      removedIds.push(id);
    } catch (error) {
      try {
        await deleteTestIdentity(admin, id);
        removedIds.push(id);
      } catch (retryError) {
        console.warn(`Could not remove the test identity ${id}: ${retryError.message}`);
      }
    }
  }
  return removedIds;
}

/**
 * Removes one test identity and everything it owns.
 */
export async function deleteTestIdentity(admin, userId) {
  await removeStorageFolder(admin, userId);
  await deleteProfileScopedRows(admin, userId);
  await admin.from('profiles').delete().eq('id', userId);

  const { error } = await deleteAuthUser(admin, userId);
  if (error && !/not found/i.test(error.message)) {
    // A missing identity is not a failure; anything else is worth surfacing.
    throw new Error(`Could not delete auth identity ${userId}: ${error.message}`);
  }
}

/**
 * Deletes an auth identity, retrying a momentarily failing platform.
 *
 * The hosted Auth service throttles and occasionally fails a deletion while a
 * run is still creating and removing identities. A retry keeps a platform
 * hiccup from leaving a test account behind.
 */
async function deleteAuthUser(admin, userId) {
  const transient = ['429', 'rate limit', 'timeout', 'timed out', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', '500', '502', '503', '504'];
  let last = { error: null };
  for (let attempt = 0; attempt < 4; attempt += 1) {
    last = await admin.auth.admin.deleteUser(userId);
    if (!last.error) return last;
    if (!transient.some((marker) => last.error.message.includes(marker))) return last;
    await new Promise((resolve) => setTimeout(resolve, 1_000 * (attempt + 1)));
  }
  return last;
}

/**
 * Deletes every row of the given tables that belongs to the given profile.
 *
 * Rows are matched by their owning column, never by a table-wide delete.
 * Tables that do not exist in the database are skipped rather than failing the
 * whole sweep.
 */
export async function deleteProfileScopedRows(admin, userId) {
  for (const { table, column } of PROFILE_SCOPED_TABLES) {
    await deleteWhere(admin, table, column, userId);
  }
}

/**
 * Deletes the catalogue rows the suite created during this run.
 *
 * `public.skills` is a shared catalogue — it has no profile owner and no
 * cascade, so a row inserted by a test would otherwise survive forever. Only
 * ids that did not exist before the run are removed; a skill that was already
 * in the catalogue belongs to a real user and is never touched.
 */
export async function deleteSkillsById(admin, skillIds) {
  for (const id of skillIds) {
    const { error } = await admin.from('skills').delete().eq('id', id);
    if (error && !/not found/i.test(error.message)) {
      throw new Error(`Could not clean skills row ${id}: ${error.message}`);
    }
  }
}

/** Returns the ids of every row in the shared skill catalogue. */
export async function listSkillIds(admin) {
  const { data, error } = await admin.from('skills').select('id');
  if (error) return new Set();
  return new Set((data ?? []).map((row) => row.id));
}

/** Removes every object in the CV bucket that belongs to the given user folder. */
export async function removeStorageFolder(admin, userId) {
  const { data: objects, error } = await admin.storage
    .from(CV_BUCKET)
    .list(userId, { limit: 1000 });
  if (error) return [];
  const paths = (objects ?? [])
    .filter((entry) => entry && typeof entry.name === 'string')
    .map((entry) => `${userId}/${entry.name}`);
  if (paths.length === 0) return [];
  await admin.storage.from(CV_BUCKET).remove(paths);
  return paths;
}

/**
 * Removes the CV bucket folders of the given test user ids.
 *
 * This is the safety net for an interrupted run: a folder whose owner was
 * already deleted would otherwise never be found again, because Storage has no
 * cascade. Only the ids given are touched, so a real user's folder is never
 * at risk.
 */
export async function removeTestStorageFolders(admin, userIds) {
  const removed = [];
  for (const userId of userIds) {
    removed.push(...(await removeStorageFolder(admin, userId)));
  }
  return removed;
}

/**
 * Returns the CV bucket folders whose owner no longer exists as an auth user.
 *
 * Such a folder is unreachable: the bucket's RLS policy compares the object's
 * first path segment against auth.uid(), so no authenticated user — including
 * the owner — can ever read it again. The suite never creates this state (it
 * removes a folder *before* it removes the identity), so any folder reported
 * here predates the suite and is reported rather than deleted: the runner must
 * not remove data it cannot attribute to the test run.
 */
export async function listOrphanedStorageFolders(admin) {
  const { data: folders, error } = await admin.storage
    .from(CV_BUCKET)
    .list('', { limit: 1000 });
  if (error) return [];

  const liveUserIds = new Set();
  let page = 1;
  let sawFullPage;
  do {
    const { data, error: listError } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listError) return [];
    for (const user of data?.users ?? []) liveUserIds.add(user.id);
    sawFullPage = (data?.users ?? []).length === 200;
    page += 1;
  } while (sawFullPage);

  return (folders ?? [])
    .filter((folder) => folder && typeof folder.name === 'string')
    .map((folder) => folder.name)
    .filter((name) => !liveUserIds.has(name));
}

/** Deletes the rows of a table that match a single column value. */
async function deleteWhere(admin, table, column, value) {
  if (value === undefined || value === null) return;
  const { error } = await admin.from(table).delete().eq(column, value);
  if (error) {
    // A table that does not exist in this database is not a cleanup failure —
    // the suite simply never wrote to it.
    const missingTable = /does not exist|not found|schema cache/i.test(error.message);
    if (!missingTable) {
      throw new Error(`Could not clean ${table}.${column}: ${error.message}`);
    }
  }
}

/**
 * Counts the rows a test run could have left behind, per table.
 *
 * Used by the runner to report what the sweep actually removed, and to assert
 * that the database is clean when the run ends.
 */
export async function countTestArtifacts(admin) {
  const counts = {};
  for (const { table } of PROFILE_SCOPED_TABLES) {
    const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true });
    counts[table] = error ? null : count;
  }
  return counts;
}
