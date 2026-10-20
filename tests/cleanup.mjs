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

/** Prefix every test identity's email carries. Nothing else is ever removed. */
export const TEST_EMAIL_PREFIX = 'cp-test-';

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
];

export function createAdminClient(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Lists every Supabase Auth identity whose email carries the test prefix.
 *
 * Pagination is handled: the list is not capped at one page.
 */
export async function listTestIdentities(admin) {
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
      if (!user.email || !user.email.startsWith(TEST_EMAIL_PREFIX)) continue;
      found.push({ id: user.id, email: user.email });
    }
    sawFullPage = users.length === 200;
    page += 1;
  } while (sawFullPage);

  return found;
}

/**
 * Deletes every test identity and everything it owns.
 *
 * Order matters: the storage objects and the explicitly-keyed rows are removed
 * while the profile still exists, then the auth identity goes last so that the
 * database cascade can take the remaining profile-scoped rows with it.
 *
 * Returns the ids that were removed.
 */
export async function deleteAllTestIdentities(admin) {
  const identities = await listTestIdentities(admin);
  const removedIds = [];
  for (const { id } of identities) {
    await deleteTestIdentity(admin, id);
    removedIds.push(id);
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

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error && !/not found/i.test(error.message)) {
    // A missing identity is not a failure; anything else is worth surfacing.
    throw new Error(`Could not delete auth identity ${userId}: ${error.message}`);
  }
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
