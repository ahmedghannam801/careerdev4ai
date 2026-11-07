// The administrative layer.
//
// Administration is a real backend system, not a client-side menu:
//
//   1. a normal signed-in user has no administrative access at all;
//   2. each role can do only what its server-side permission set allows;
//   3. only a Super Admin can read or change the administrator roster;
//   4. publishing an announcement delivers a real notification row to every
//      targeted user, and re-publishing does not deliver it twice;
//   5. a moderator's report is persisted in the audit log, where a Super Admin
//      can review it.
//
// Every row this file creates is removed in the `after` hook by explicit id.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTestUser,
  deleteTestUser,
  admin,
  api,
  type TestUser,
} from './helpers.ts';

let normalUser: TestUser;
let superAdminUser: TestUser;
let contentAdminUser: TestUser;
let opportunityAdminUser: TestUser;
let moderatorUser: TestUser;
let targetUser: TestUser;

/** The admin_users rows created for this file, in insertion order. */
const adminRowIds: string[] = [];
const announcementIds: string[] = [];

/**
 * Targeting fixtures.
 *
 * The suite runs against the live project, so every value that a test matches
 * on is suffixed with a per-run marker. A filter therefore resolves only the
 * identities this file created, never a real user who happens to share a
 * career or a city with the fixture.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const DATA_ROLE = `ZZ Data Analyst ${RUN}`;
const HR_ROLE = `ZZ HR ${RUN}`;
const INDUSTRY = `ZZ Industry ${RUN}`;
const CITY_A = `ZZ City A ${RUN}`;
const CITY_B = `ZZ City B ${RUN}`;
const UNIVERSITY = `ZZ University ${RUN}`;
const FIELD_OF_STUDY = `ZZ Field ${RUN}`;
const ROADMAP_TITLE = `ZZ Roadmap ${RUN}`;
const ROADMAP_STEP = `ZZ SQL Step ${RUN}`;
const PROJECT_DONE = `ZZ Done Project ${RUN}`;
const PROJECT_ACTIVE = `ZZ Active Project ${RUN}`;
/** A real catalog row, so the learning filters resolve a genuine course id. */
const LEARNING_COURSE_ID = 'edx-cs50x';
const LEARNING_COURSE_TITLE = 'CS50x: Introduction to Computer Science';

let sqlSkillId = '';

async function makeAdmin(user: TestUser, role: string): Promise<string> {
  const { data, error } = await admin
    .from('admin_users')
    .insert({
      profile_id: user.id,
      email: user.email,
      full_name: `Test ${role}`,
      role,
      status: 'active',
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`could not create the ${role} row: ${error?.message}`);
  adminRowIds.push(data.id);
  return data.id;
}

function trackAnnouncement(id: string) {
  announcementIds.push(id);
}

async function previewAudience(rules: unknown) {
  return api('POST', '/api/admin/announcements/preview', {
    token: superAdminUser.token,
    body: { audienceRules: rules },
  });
}

async function createDraft(body: Record<string, unknown>) {
  const created = await api('POST', '/api/admin/announcements', {
    token: superAdminUser.token,
    body,
  });
  assert.equal(created.status, 201, created.body?.error);
  const id = created.body.announcement.id;
  assert.ok(id);
  trackAnnouncement(id);
  return created.body.announcement;
}

async function statsFor(id: string) {
  const list = await api('GET', '/api/admin/announcements', {
    token: superAdminUser.token,
  });
  assert.equal(list.status, 200, list.body?.error);
  const announcement = list.body.announcements.find((row: any) => row.id === id);
  assert.ok(announcement, 'the announcement is in the administrative history');
  return announcement.stats;
}

before(async () => {
  normalUser = await createTestUser('admin-normal');
  superAdminUser = await createTestUser('admin-super');
  contentAdminUser = await createTestUser('admin-content');
  opportunityAdminUser = await createTestUser('admin-opportunity');
  moderatorUser = await createTestUser('admin-moderator');
  targetUser = await createTestUser('admin-target');

  await makeAdmin(superAdminUser, 'super_admin');
  await makeAdmin(contentAdminUser, 'content_admin');
  await makeAdmin(opportunityAdminUser, 'opportunity_admin');
  await makeAdmin(moderatorUser, 'moderator');

  // ---- targeting fixtures ------------------------------------------------
  // Two users share a career, so AND/OR semantics and the preview/delivery
  // parity can be asserted exactly.
  await admin
    .from('profiles')
    .update({
      target_role: DATA_ROLE,
      target_industry: INDUSTRY,
      user_type: 'student',
      country: 'Egypt',
      city: CITY_A,
      location: `${CITY_A}, Egypt`,
    })
    .eq('id', normalUser.id);
  await admin
    .from('profiles')
    .update({
      target_role: DATA_ROLE,
      user_type: 'fresh_graduate',
      country: 'Egypt',
      city: CITY_B,
      location: `${CITY_B}, Egypt`,
    })
    .eq('id', targetUser.id);
  await admin
    .from('profiles')
    .update({
      target_role: HR_ROLE,
      user_type: 'working_professional',
      country: 'Egypt',
      city: CITY_B,
    })
    .eq('id', moderatorUser.id);

  const { data: skill, error: skillError } = await admin
    .from('skills')
    .select('id')
    .eq('name', 'SQL')
    .maybeSingle();
  if (skillError || !skill) throw new Error('the SQL skill is missing from the live catalog');
  sqlSkillId = skill.id;

  await admin.from('user_skills').insert({
    user_id: normalUser.id,
    skill_id: sqlSkillId,
    proficiency: 4,
  });
  await admin.from('educations').insert({
    user_id: targetUser.id,
    institution: UNIVERSITY,
    field_of_study: FIELD_OF_STUDY,
    degree: 'Bachelor',
    is_current: true,
  });

  await admin.from('user_learning_items').insert([
    { profile_id: normalUser.id, course_id: LEARNING_COURSE_ID, status: 'completed' },
    { profile_id: targetUser.id, course_id: LEARNING_COURSE_ID, status: 'in_progress' },
  ]);

  const { data: roadmap, error: roadmapError } = await admin
    .from('roadmaps')
    .insert({
      profile_id: normalUser.id,
      title: ROADMAP_TITLE,
      status: 'active',
      is_enrolled: true,
      target_role_title: DATA_ROLE,
    })
    .select('id')
    .single();
  if (roadmapError || !roadmap) throw new Error(`could not seed a roadmap: ${roadmapError?.message}`);

  const { data: phase, error: phaseError } = await admin
    .from('roadmap_phases')
    .insert({ roadmap_id: roadmap.id, phase_number: 1, title: `Phase ${RUN}` })
    .select('id')
    .single();
  if (phaseError || !phase) throw new Error(`could not seed a phase: ${phaseError?.message}`);

  const { data: milestone, error: milestoneError } = await admin
    .from('roadmap_milestones')
    .insert({ phase_id: phase.id, title: `Milestone ${RUN}` })
    .select('id')
    .single();
  if (milestoneError || !milestone) {
    throw new Error(`could not seed a milestone: ${milestoneError?.message}`);
  }

  await admin.from('roadmap_tasks').insert({
    milestone_id: milestone.id,
    title: `${ROADMAP_STEP} SQL practice`,
    status: 'in_progress',
    skill_name: 'SQL',
  });

  await admin.from('projects').insert([
    { profile_id: normalUser.id, title: PROJECT_DONE, status: 'completed' },
    { profile_id: targetUser.id, title: PROJECT_ACTIVE, status: 'active' },
  ]);
});

after(async () => {
  // Target fixtures first: deleting a test user cascades its profile, but the
  // domain rows are removed explicitly so a failed identity cleanup cannot
  // leave test data behind.
  for (const userId of [normalUser?.id, targetUser?.id, moderatorUser?.id]) {
    if (!userId) continue;
    await admin.from('user_learning_items').delete().eq('profile_id', userId);
    await admin.from('projects').delete().eq('profile_id', userId);
    await admin.from('educations').delete().eq('user_id', userId);
    await admin.from('user_skills').delete().eq('user_id', userId);
    await admin.from('roadmaps').delete().eq('profile_id', userId);
  }
  for (const announcementId of announcementIds) {
    await admin.from('notifications').delete().eq('announcement_id', announcementId);
    await admin.from('announcements').delete().eq('id', announcementId);
  }
  for (const adminId of adminRowIds) {
    await admin.from('admin_audit_log').delete().eq('admin_id', adminId);
    await admin.from('admin_users').delete().eq('id', adminId);
  }
  for (const user of [
    normalUser,
    superAdminUser,
    contentAdminUser,
    opportunityAdminUser,
    moderatorUser,
    targetUser,
  ]) {
    if (user) await deleteTestUser(user);
  }
});

describe('administrative access is server-enforced', () => {
  test('a normal user has no administrative access', async () => {
    const me = await api('GET', '/api/admin/me', { token: normalUser.token });
    assert.equal(me.status, 200);
    assert.equal(me.body?.admin, null, 'a normal user has no admin row');

    for (const path of [
      '/api/admin/analytics',
      '/api/admin/admins',
      '/api/admin/announcements',
      '/api/admin/opportunities',
      '/api/admin/learning',
      '/api/admin/audit',
    ]) {
      const res = await api('GET', path, { token: normalUser.token });
      assert.equal(res.status, 403, `${path} must be closed to a normal user`);
    }

    const write = await api('POST', '/api/admin/announcements', {
      token: normalUser.token,
      body: { title: 'No', body: 'No', audienceType: 'all' },
    });
    assert.equal(write.status, 403, 'a normal user cannot write an announcement');
  });

  test('each role sees only its own permissions', async () => {
    const content = await api('GET', '/api/admin/me', { token: contentAdminUser.token });
    assert.equal(content.status, 200);
    assert.equal(content.body?.admin?.role, 'content_admin');
    assert.ok(
      content.body.admin.permissions.includes('announcements.publish'),
      'a Content Admin can publish announcements'
    );
    assert.ok(
      !content.body.admin.permissions.includes('admin.manage'),
      'a Content Admin cannot manage administrators'
    );

    const contentRoster = await api('GET', '/api/admin/admins', {
      token: contentAdminUser.token,
    });
    assert.equal(contentRoster.status, 403, 'a Content Admin cannot read the roster');

    const contentLearning = await api('GET', '/api/admin/learning', {
      token: contentAdminUser.token,
    });
    assert.equal(contentLearning.status, 200, 'a Content Admin owns learning content');

    const contentOpportunities = await api('GET', '/api/admin/opportunities', {
      token: contentAdminUser.token,
    });
    assert.equal(contentOpportunities.status, 403, 'opportunities are not theirs to manage');

    const opportunity = await api('GET', '/api/admin/me', {
      token: opportunityAdminUser.token,
    });
    assert.equal(opportunity.body?.admin?.role, 'opportunity_admin');
    const opportunityCatalogue = await api('GET', '/api/admin/opportunities', {
      token: opportunityAdminUser.token,
    });
    assert.equal(opportunityCatalogue.status, 200);
    const opportunityAnnouncements = await api('GET', '/api/admin/announcements', {
      token: opportunityAdminUser.token,
    });
    assert.equal(opportunityAnnouncements.status, 403);

    const moderator = await api('GET', '/api/admin/me', {
      token: moderatorUser.token,
    });
    assert.equal(moderator.body?.admin?.role, 'moderator');
    assert.ok(
      moderator.body.admin.permissions.includes('moderation.write'),
      'a Moderator can report content'
    );
    const moderatorWrite = await api('POST', '/api/admin/announcements', {
      token: moderatorUser.token,
      body: { title: 'No', body: 'No', audienceType: 'all' },
    });
    assert.equal(moderatorWrite.status, 403, 'a Moderator cannot write announcements');
  });

  test('a disabled administrator loses every permission', async () => {
    const rowId = adminRowIds[2]; // the opportunity admin
    const disabled = await api('PATCH', `/api/admin/admins/${rowId}`, {
      token: superAdminUser.token,
      body: { status: 'disabled' },
    });
    assert.equal(disabled.status, 200, disabled.body?.error);
    assert.equal(disabled.body?.admin?.status, 'disabled');
    assert.deepEqual(disabled.body?.admin?.permissions, []);

    const blocked = await api('GET', '/api/admin/opportunities', {
      token: opportunityAdminUser.token,
    });
    assert.equal(blocked.status, 403, 'a disabled administrator is not an administrator');

    const enabled = await api('PATCH', `/api/admin/admins/${rowId}`, {
      token: superAdminUser.token,
      body: { status: 'active' },
    });
    assert.equal(enabled.status, 200);
    assert.ok(enabled.body?.admin?.permissions.includes('opportunities.write'));
  });
});

describe('administrator management', () => {
  test('only a Super Admin can add, edit and remove an administrator', async () => {
    const forbidden = await api('POST', '/api/admin/admins', {
      token: contentAdminUser.token,
      body: { email: targetUser.email, role: 'moderator' },
    });
    assert.equal(forbidden.status, 403, 'a Content Admin cannot add an administrator');

    const roster = await api('GET', '/api/admin/admins', {
      token: superAdminUser.token,
    });
    assert.equal(roster.status, 200);
    assert.ok(
      roster.body.admins.some((row: any) => row.role === 'super_admin'),
      'the roster shows the Super Admin'
    );

    const created = await api('POST', '/api/admin/admins', {
      token: superAdminUser.token,
      body: { email: targetUser.email, role: 'moderator' },
    });
    assert.equal(created.status, 201, created.body?.error);
    const createdId = created.body?.admin?.id;
    assert.ok(createdId);
    adminRowIds.push(createdId);
    assert.equal(created.body.admin.role, 'moderator');
    assert.equal(created.body.admin.email, targetUser.email);

    const updated = await api('PATCH', `/api/admin/admins/${createdId}`, {
      token: superAdminUser.token,
      body: { role: 'opportunity_admin' },
    });
    assert.equal(updated.status, 200, updated.body?.error);
    assert.equal(updated.body.admin.role, 'opportunity_admin');
    assert.ok(updated.body.admin.permissions.includes('opportunities.verify'));

    const removed = await api('DELETE', `/api/admin/admins/${createdId}`, {
      token: superAdminUser.token,
    });
    assert.equal(removed.status, 200, removed.body?.error);
    adminRowIds.splice(adminRowIds.indexOf(createdId), 1);

    const afterRemoval = await api('GET', '/api/admin/me', { token: targetUser.token });
    assert.equal(afterRemoval.body?.admin, null, 'a removed administrator is a normal user');
  });

  test('an unknown email or role is rejected', async () => {
    const unknownEmail = await api('POST', '/api/admin/admins', {
      token: superAdminUser.token,
      body: { email: 'nobody-here@example.invalid', role: 'moderator' },
    });
    assert.ok(
      unknownEmail.status === 404 || unknownEmail.status === 400,
      `an unknown account is rejected, got ${unknownEmail.status}`
    );

    const unknownRole = await api('POST', '/api/admin/admins', {
      token: superAdminUser.token,
      body: { email: targetUser.email, role: 'owner' },
    });
    assert.equal(unknownRole.status, 400);
  });
});

describe('announcement delivery', () => {
  test('a targeted announcement reaches exactly the selected users', async () => {
    const created = await api('POST', '/api/admin/announcements', {
      token: superAdminUser.token,
      body: {
        title: 'Career fair on Sunday',
        body: 'The university career fair opens at 10:00 in the main hall.',
        priority: 'important',
        audienceType: 'users',
        audienceValues: [normalUser.id, moderatorUser.id],
        linkView: 'volunteer',
      },
    });
    assert.equal(created.status, 201, created.body?.error);
    const announcementId = created.body?.announcement?.id;
    assert.ok(announcementId);
    trackAnnouncement(announcementId);
    assert.equal(created.body.announcement.status, 'draft');

    const published = await api('POST', `/api/admin/announcements/${announcementId}/publish`, {
      token: superAdminUser.token,
    });
    assert.equal(published.status, 200, published.body?.error);
    assert.equal(published.body.announcement.status, 'published');
    assert.equal(published.body.announcement.recipientCount, 2);

    const { data: delivered, error } = await admin
      .from('notifications')
      .select('profile_id, title, type, announcement_id, link_view')
      .eq('announcement_id', announcementId);
    assert.equal(error, null);
    assert.equal(delivered?.length, 2, 'one notification per recipient');

    const recipients = (delivered ?? []).map((row) => row.profile_id).sort();
    assert.deepEqual(recipients, [normalUser.id, moderatorUser.id].sort());
    for (const row of delivered ?? []) {
      assert.equal(row.type, 'announcement');
      assert.equal(row.title, 'Career fair on Sunday');
      assert.equal(row.link_view, 'volunteer');
    }

    // The recipient sees it in the real notification list.
    const inbox = await api('GET', '/api/notifications', { token: normalUser.token });
    const announcement = inbox.body.notifications.find(
      (notification: any) => notification.announcementId === announcementId
    );
    assert.ok(announcement, 'the delivered announcement is in the inbox');
    assert.equal(announcement.type, 'announcement');
    assert.equal(announcement.read, false);

    // Someone outside the audience does not receive it.
    const outsider = await api('GET', '/api/notifications', {
      token: opportunityAdminUser.token,
    });
    assert.ok(
      !outsider.body.notifications.some(
        (notification: any) => notification.announcementId === announcementId
      ),
      'a user outside the audience must not receive the announcement'
    );
  });

  test('re-publishing does not deliver the same announcement twice', async () => {
    const announcementId = announcementIds[0];
    const before = await admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('announcement_id', announcementId);

    const again = await api('POST', `/api/admin/announcements/${announcementId}/publish`, {
      token: superAdminUser.token,
    });
    assert.equal(again.status, 200, again.body?.error);
    assert.equal(again.body.announcement.recipientCount, before.count);

    const afterCount = await admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('announcement_id', announcementId);
    assert.equal(afterCount.count, before.count, 'a second publish inserts nothing');
  });

  test('two concurrent publishes still deliver once per recipient', async () => {
    const created = await api('POST', '/api/admin/announcements', {
      token: superAdminUser.token,
      body: {
        title: 'Concurrent publish',
        body: 'A manual publish may race the server-side scheduler tick.',
        audienceType: 'users',
        audienceValues: [normalUser.id, targetUser.id],
      },
    });
    assert.equal(created.status, 201, created.body?.error);
    const announcementId = created.body.announcement.id;
    trackAnnouncement(announcementId);

    const [first, second] = await Promise.all([
      api('POST', `/api/admin/announcements/${announcementId}/publish`, {
        token: superAdminUser.token,
      }),
      api('POST', `/api/admin/announcements/${announcementId}/publish`, {
        token: superAdminUser.token,
      }),
    ]);
    assert.equal(first.status, 200, first.body?.error);
    assert.equal(second.status, 200, second.body?.error);

    const { count, error } = await admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('announcement_id', announcementId);
    assert.equal(error, null);
    assert.equal(count, 2, 'the database keeps one notification per recipient');

    const { count: ledgerCount, error: ledgerError } = await admin
      .from('announcement_deliveries')
      .select('id', { count: 'exact', head: true })
      .eq('announcement_id', announcementId);
    assert.equal(ledgerError, null);
    assert.equal(ledgerCount, 2, 'one delivery per recipient');
  });

  test('an archived announcement cannot be published again', async () => {
    const announcementId = announcementIds[0];
    const archived = await api('POST', `/api/admin/announcements/${announcementId}/archive`, {
      token: superAdminUser.token,
    });
    assert.equal(archived.status, 200, archived.body?.error);
    assert.equal(archived.body.announcement.status, 'archived');

    const publish = await api('POST', `/api/admin/announcements/${announcementId}/publish`, {
      token: superAdminUser.token,
    });
    assert.equal(publish.status, 409, 'an archived announcement stays archived');
  });

  test('an audience that resolves to nobody is rejected', async () => {
    const created = await api('POST', '/api/admin/announcements', {
      token: superAdminUser.token,
      body: {
        title: 'Nobody',
        body: 'This targets a profile that does not exist.',
        audienceType: 'users',
        audienceValues: ['00000000-0000-4000-8000-000000000000'],
      },
    });
    assert.equal(created.status, 201, created.body?.error);
    const id = created.body.announcement.id;
    trackAnnouncement(id);

    const published = await api('POST', `/api/admin/announcements/${id}/publish`, {
      token: superAdminUser.token,
    });
    assert.equal(published.status, 422, 'nothing is sent to an empty audience');
  });
});

describe('moderation reports', () => {
  test('a Moderator report is persisted in the audit log', async () => {
    const reason = 'The application deadline contradicts the source page.';
    const reported = await api('POST', '/api/admin/reports', {
      token: moderatorUser.token,
      body: {
        entityType: 'opportunity',
        entityId: 'opp-eg-zewail-city',
        reason,
      },
    });
    assert.equal(reported.status, 201, reported.body?.error);

    const audit = await api('GET', '/api/admin/audit', { token: superAdminUser.token });
    assert.equal(audit.status, 200, audit.body?.error);
    const entry = audit.body.entries.find(
      (row: any) => row.action === 'moderation.reported'
    );
    assert.ok(entry, 'the report is a real audit entry');
    assert.equal(entry.entityId, 'opp-eg-zewail-city');
    assert.equal(entry.metadata?.reason, reason);
  });

  test('a report needs a known entity type and a reason', async () => {
    const noReason = await api('POST', '/api/admin/reports', {
      token: moderatorUser.token,
      body: { entityType: 'opportunity', entityId: 'opp-eg-zewail-city', reason: '' },
    });
    assert.equal(noReason.status, 400);

    const noEntity = await api('POST', '/api/admin/reports', {
      token: moderatorUser.token,
      body: { entityType: 'planet', reason: 'Bad' },
    });
    assert.equal(noEntity.status, 400);

    const contentAdmin = await api('POST', '/api/admin/reports', {
      token: contentAdminUser.token,
      body: { entityType: 'opportunity', reason: 'Not my permission' },
    });
    assert.equal(contentAdmin.status, 403, 'only a Moderator-or-above can report');
  });
});

describe('audience targeting', () => {
  test('the preview count is the delivery count', async () => {
    const rules = [
      {
        logic: 'and',
        conditions: [
          { field: 'career', values: [DATA_ROLE] },
          { field: 'skill', values: ['SQL'] },
        ],
      },
    ];
    const preview = await previewAudience(rules);
    assert.equal(preview.status, 200, preview.body?.error);
    assert.equal(preview.body.preview.count, 1, preview.body.preview.summary);

    const draft = await createDraft({
      title: 'SQL careers',
      body: 'A message for data analysts who already know SQL.',
      audienceType: 'all',
      audienceRules: rules,
    });
    const published = await api('POST', `/api/admin/announcements/${draft.id}/publish`, {
      token: superAdminUser.token,
    });
    assert.equal(published.status, 200, published.body?.error);
    assert.equal(
      published.body.announcement.recipientCount,
      preview.body.preview.count,
      'preview and delivery must resolve the same audience'
    );

    const { data: deliveries } = await admin
      .from('announcement_deliveries')
      .select('profile_id')
      .eq('announcement_id', draft.id);
    assert.equal(deliveries?.length, 1);
    assert.equal(deliveries?.[0].profile_id, normalUser.id);
  });

  test('AND, OR and combined groups use the declared logic', async () => {
    const orPreview = await previewAudience([
      {
        logic: 'or',
        conditions: [
          { field: 'career', values: [DATA_ROLE] },
          { field: 'career', values: [HR_ROLE] },
        ],
      },
    ]);
    assert.equal(orPreview.status, 200, orPreview.body?.error);
    assert.equal(orPreview.body.preview.count, 3, 'two data analysts OR one HR profile');

    const andPreview = await previewAudience([
      {
        logic: 'and',
        conditions: [
          { field: 'career', values: [DATA_ROLE] },
          { field: 'user_type', values: ['student'] },
        ],
      },
    ]);
    assert.equal(andPreview.status, 200, andPreview.body?.error);
    assert.equal(andPreview.body.preview.count, 1, 'AND narrows to the student');

    const combined = await previewAudience([
      {
        logic: 'and',
        conditions: [{ field: 'career', values: [DATA_ROLE] }],
      },
      {
        logic: 'and',
        conditions: [{ field: 'country', values: ['Egypt'] }],
      },
    ]);
    assert.equal(combined.status, 200, combined.body?.error);
    assert.equal(combined.body.preview.count, 2, 'groups are intersected');

    const impossible = await previewAudience([
      {
        logic: 'and',
        conditions: [
          { field: 'career', values: [HR_ROLE] },
          { field: 'skill', values: ['SQL'] },
        ],
      },
    ]);
    assert.equal(impossible.status, 200, impossible.body?.error);
    assert.equal(impossible.body.preview.count, 0, 'an impossible AND resolves to nobody');
  });

  test('every stored targeting field resolves real data', async () => {
    const cases: Array<{ label: string; rules: unknown; expected: number }> = [
      {
        label: 'industry',
        rules: [
          {
            logic: 'and',
            conditions: [
              { field: 'career', values: [DATA_ROLE] },
              { field: 'industry', values: [INDUSTRY] },
            ],
          },
        ],
        expected: 1,
      },
      {
        label: 'university',
        rules: [
          {
            logic: 'and',
            conditions: [
              { field: 'career', values: [DATA_ROLE] },
              { field: 'university', values: [UNIVERSITY] },
            ],
          },
        ],
        expected: 1,
      },
      {
        label: 'field of study',
        rules: [
          {
            logic: 'and',
            conditions: [
              { field: 'career', values: [DATA_ROLE] },
              { field: 'field_of_study', values: [FIELD_OF_STUDY] },
            ],
          },
        ],
        expected: 1,
      },
      {
        label: 'degree',
        rules: [
          {
            logic: 'and',
            conditions: [
              { field: 'career', values: [DATA_ROLE] },
              { field: 'degree', values: ['Bachelor'] },
            ],
          },
        ],
        expected: 1,
      },
      {
        label: 'city',
        rules: [
          {
            logic: 'and',
            conditions: [
              { field: 'career', values: [DATA_ROLE] },
              { field: 'city', values: [CITY_A] },
            ],
          },
        ],
        expected: 1,
      },
      {
        label: 'enrolled roadmap',
        rules: [
          {
            logic: 'and',
            conditions: [
              { field: 'career', values: [DATA_ROLE] },
              { field: 'roadmap', values: [DATA_ROLE] },
            ],
          },
        ],
        expected: 1,
      },
      {
        label: 'roadmap step',
        rules: [
          {
            logic: 'and',
            conditions: [
              { field: 'career', values: [DATA_ROLE] },
              { field: 'roadmap_stage', values: [ROADMAP_STEP] },
            ],
          },
        ],
        expected: 1,
      },
      {
        label: 'completed project',
        rules: [
          {
            logic: 'and',
            conditions: [
              { field: 'career', values: [DATA_ROLE] },
              { field: 'project_completed', values: [PROJECT_DONE] },
            ],
          },
        ],
        expected: 1,
      },
      {
        label: 'active project',
        rules: [
          {
            logic: 'and',
            conditions: [
              { field: 'career', values: [DATA_ROLE] },
              { field: 'project_active', values: [PROJECT_ACTIVE] },
            ],
          },
        ],
        expected: 1,
      },
      {
        label: 'completed course',
        rules: [
          {
            logic: 'and',
            conditions: [
              { field: 'career', values: [DATA_ROLE] },
              { field: 'learning_completed', values: [LEARNING_COURSE_TITLE] },
            ],
          },
        ],
        expected: 1,
      },
      {
        label: 'course in progress',
        rules: [
          {
            logic: 'and',
            conditions: [
              { field: 'career', values: [DATA_ROLE] },
              { field: 'learning_in_progress', values: [LEARNING_COURSE_TITLE] },
            ],
          },
        ],
        expected: 1,
      },
    ];

    for (const entry of cases) {
      const preview = await previewAudience(entry.rules);
      assert.equal(preview.status, 200, `${entry.label}: ${preview.body?.error}`);
      assert.equal(
        preview.body.preview.count,
        entry.expected,
        `${entry.label} resolved ${preview.body.preview.count} users`
      );
    }
  });

  test('malformed or unsafe targeting is rejected, never widened', async () => {
    const unknownField = await api('POST', '/api/admin/announcements', {
      token: superAdminUser.token,
      body: {
        title: 'Bad filter',
        body: 'An unknown field must not be accepted.',
        audienceRules: [
          { logic: 'and', conditions: [{ field: 'salary', values: ['1000'] }] },
        ],
      },
    });
    assert.equal(unknownField.status, 400);

    // An explicit rule list that contains only blanks normalises to nothing.
    // Treating that as "everyone" would broadcast a malformed message, so the
    // server rejects it instead.
    const emptyCondition = await api('POST', '/api/admin/announcements', {
      token: superAdminUser.token,
      body: {
        title: 'Empty filter',
        body: 'This must not become a platform-wide broadcast.',
        audienceRules: [
          { logic: 'and', conditions: [{ field: 'career', values: ['   '] }] },
        ],
      },
    });
    assert.equal(emptyCondition.status, 400);

    const tooManyGroups = await api('POST', '/api/admin/announcements', {
      token: superAdminUser.token,
      body: {
        title: 'Too many groups',
        body: 'The server enforces the documented limit.',
        audienceRules: Array.from({ length: 7 }, () => ({
          logic: 'and',
          conditions: [{ field: 'career', values: [DATA_ROLE] }],
        })),
      },
    });
    assert.equal(tooManyGroups.status, 400);
  });
});

describe('delivery ledger and analytics', () => {
  test('read and click states are written to the delivery ledger', async () => {
    const draft = await createDraft({
      title: 'Ledger announcement',
      body: 'Read and click me.',
      linkView: 'volunteer',
      audienceRules: [
        {
          logic: 'and',
          conditions: [{ field: 'career', values: [DATA_ROLE] }],
        },
      ],
    });
    const published = await api('POST', `/api/admin/announcements/${draft.id}/publish`, {
      token: superAdminUser.token,
    });
    assert.equal(published.status, 200, published.body?.error);
    assert.equal(published.body.announcement.recipientCount, 2);

    const { data: rows, error } = await admin
      .from('announcement_deliveries')
      .select('id, profile_id, notification_id, read_at, clicked_at')
      .eq('announcement_id', draft.id);
    assert.equal(error, null);
    assert.equal(rows?.length, 2, 'one delivery row per recipient');

    const normalRow = rows!.find((row) => row.profile_id === normalUser.id)!;
    const targetRow = rows!.find((row) => row.profile_id === targetUser.id)!;
    assert.equal(normalRow.read_at, null);
    assert.equal(normalRow.clicked_at, null);

    const inbox = await api('GET', '/api/notifications', { token: normalUser.token });
    const notification = inbox.body.notifications.find(
      (entry: any) => entry.announcementId === draft.id
    );
    assert.ok(notification, 'the recipient sees the delivered announcement');
    assert.equal(notification.read, false);
    assert.equal(notification.clicked, false);

    const read = await api('PATCH', `/api/notifications/${notification.id}`, {
      token: normalUser.token,
    });
    assert.equal(read.status, 200, read.body?.error);
    assert.equal(
      read.body.notifications.find((entry: any) => entry.id === notification.id).read,
      true
    );

    let stats = await statsFor(draft.id);
    assert.equal(stats.deliveredCount, 2);
    assert.equal(stats.readCount, 1);
    assert.equal(stats.clickedCount, 0);
    assert.equal(stats.readRate, 50);

    const afterRead = await admin
      .from('announcement_deliveries')
      .select('read_at')
      .eq('id', normalRow.id)
      .single();
    assert.ok(afterRead.data?.read_at, 'reading the notification marks the delivery read');

    const click = await api('POST', `/api/notifications/${notification.id}/click`, {
      token: normalUser.token,
    });
    assert.equal(click.status, 200, click.body?.error);
    assert.equal(click.body.linkView, 'volunteer');

    const afterClick = await admin
      .from('announcement_deliveries')
      .select('read_at, clicked_at')
      .eq('id', normalRow.id)
      .single();
    assert.ok(afterClick.data?.clicked_at, 'a CTA click marks the delivery clicked');
    assert.ok(afterClick.data?.read_at, 'a CTA click also implies the message was read');

    stats = await statsFor(draft.id);
    assert.equal(stats.readCount, 1);
    assert.equal(stats.clickedCount, 1);
    assert.equal(stats.clickRate, 50);

    const markAll = await api('POST', '/api/notifications/read-all', {
      token: targetUser.token,
    });
    assert.equal(markAll.status, 200, markAll.body?.error);
    assert.ok(markAll.body.marked >= 1);

    const targetAfterRead = await admin
      .from('announcement_deliveries')
      .select('read_at, clicked_at')
      .eq('id', targetRow.id)
      .single();
    assert.ok(targetAfterRead.data?.read_at, 'mark-all-read reaches the delivery ledger');
    assert.equal(targetAfterRead.data?.clicked_at, null, 'reading is not clicking');

    stats = await statsFor(draft.id);
    assert.equal(stats.readCount, 2);
    assert.equal(stats.clickedCount, 1);
    assert.equal(stats.readRate, 100);
  });

  test('one user cannot read or change another user’s delivery', async () => {
    const draft = await createDraft({
      title: 'Private ledger',
      body: 'Only the recipient can see this delivery.',
      audienceRules: [
        {
          logic: 'and',
          conditions: [{ field: 'career', values: [DATA_ROLE] }],
        },
      ],
    });
    const published = await api('POST', `/api/admin/announcements/${draft.id}/publish`, {
      token: superAdminUser.token,
    });
    assert.equal(published.status, 200, published.body?.error);

    const { data: targetDelivery } = await admin
      .from('announcement_deliveries')
      .select('id, profile_id, read_at')
      .eq('announcement_id', draft.id)
      .eq('profile_id', targetUser.id)
      .single();
    assert.ok(targetDelivery);

    const { data: targetNotification } = await admin
      .from('notifications')
      .select('id')
      .eq('announcement_id', draft.id)
      .eq('profile_id', targetUser.id)
      .single();
    assert.ok(targetNotification);

    // RLS: the normal user's own session sees only its own delivery row.
    const ownDeliveries = await normalUser.client
      .from('announcement_deliveries')
      .select('id, profile_id')
      .eq('announcement_id', draft.id);
    assert.equal(ownDeliveries.error, null);
    assert.equal(ownDeliveries.data?.length, 1);
    assert.equal(ownDeliveries.data?.[0].profile_id, normalUser.id);

    const otherNotifications = await normalUser.client
      .from('notifications')
      .select('id, profile_id')
      .eq('profile_id', targetUser.id);
    assert.equal(otherNotifications.error, null);
    assert.equal(otherNotifications.data?.length, 0, 'RLS hides another user’s inbox');

    const tamper = await normalUser.client
      .from('announcement_deliveries')
      .update({ read_at: new Date().toISOString() })
      .eq('id', targetDelivery.id)
      .select('id');
    // The write is refused. It used to be refused by the row policy alone;
    // the client no longer holds the write grant on the delivery ledger at
    // all, so it is refused even earlier. The property under test is the
    // same either way: one user can never change another user's delivery.
    assert.equal(
      (tamper.data?.length ?? 0) === 0,
      true,
      'one user cannot change another user’s delivery'
    );

    const stillUnread = await admin
      .from('announcement_deliveries')
      .select('read_at')
      .eq('id', targetDelivery.id)
      .single();
    assert.equal(stillUnread.data?.read_at, null);

    // The API is owner-scoped too, not just the table policy.
    const forbiddenRead = await api('PATCH', `/api/notifications/${targetNotification.id}`, {
      token: normalUser.token,
    });
    assert.equal(forbiddenRead.status, 404);

    const forbiddenClick = await api(
      'POST',
      `/api/notifications/${targetNotification.id}/click`,
      { token: normalUser.token }
    );
    assert.equal(forbiddenClick.status, 404);
  });
});

describe('scheduling and expiry', () => {
  test('a scheduled announcement is published by the server tick', async () => {
    const draft = await createDraft({
      title: 'Scheduled announcement',
      body: 'This is published without an administrator watching.',
      audienceRules: [
        {
          logic: 'and',
          conditions: [{ field: 'career', values: [DATA_ROLE] }],
        },
      ],
    });

    const future = new Date(Date.now() + 2 * 60_000).toISOString();
    const scheduled = await api('POST', `/api/admin/announcements/${draft.id}/schedule`, {
      token: superAdminUser.token,
      body: { publishAt: future },
    });
    assert.equal(scheduled.status, 200, scheduled.body?.error);
    assert.equal(scheduled.body.announcement.status, 'scheduled');
    assert.ok(scheduled.body.announcement.publishAt);

    const beforeDue = await admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('announcement_id', draft.id);
    assert.equal(beforeDue.count, 0, 'scheduling delivers nothing immediately');

    const pastAttempt = await api(
      'POST',
      `/api/admin/announcements/${draft.id}/schedule`,
      {
        token: superAdminUser.token,
        body: { publishAt: new Date(Date.now() - 60_000).toISOString() },
      }
    );
    assert.equal(pastAttempt.status, 400, 'a schedule in the past is rejected');

    // Simulate time passing without touching any browser state. The server
    // reads publish_at from the database.
    await admin
      .from('announcements')
      .update({ publish_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', draft.id);

    const processed = await api('POST', '/api/admin/announcements/process-due', {
      token: superAdminUser.token,
    });
    assert.equal(processed.status, 200, processed.body?.error);
    assert.ok(processed.body.published >= 1, 'the due announcement was published');

    const stored = await admin
      .from('announcements')
      .select('status, recipient_count')
      .eq('id', draft.id)
      .single();
    assert.equal(stored.data?.status, 'published');
    assert.equal(stored.data?.recipient_count, 2);

    const delivered = await admin
      .from('announcement_deliveries')
      .select('id', { count: 'exact', head: true })
      .eq('announcement_id', draft.id);
    assert.equal(delivered.count, 2, 'the scheduled publish created real deliveries');
  });

  test('an expired announcement stops being active but keeps its ledger', async () => {
    const draft = await createDraft({
      title: 'Expiring announcement',
      body: 'This becomes expired after its expiry date.',
      audienceRules: [
        {
          logic: 'and',
          conditions: [{ field: 'career', values: [DATA_ROLE] }],
        },
      ],
    });
    const published = await api('POST', `/api/admin/announcements/${draft.id}/publish`, {
      token: superAdminUser.token,
    });
    assert.equal(published.status, 200, published.body?.error);

    await admin
      .from('announcements')
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', draft.id);

    const processed = await api('POST', '/api/admin/announcements/process-due', {
      token: superAdminUser.token,
    });
    assert.equal(processed.status, 200, processed.body?.error);
    assert.ok(processed.body.expired >= 1, 'the expired announcement was moved to expired');

    const stored = await admin
      .from('announcements')
      .select('status')
      .eq('id', draft.id)
      .single();
    assert.equal(stored.data?.status, 'expired');

    const deliveries = await admin
      .from('announcement_deliveries')
      .select('id', { count: 'exact', head: true })
      .eq('announcement_id', draft.id);
    assert.equal(deliveries.count, 2, 'expiry does not erase the delivery history');
  });
});

describe('rich announcement fields', () => {
  test('images, category, CTA and critical priority survive delivery', async () => {
    const draft = await createDraft({
      title: 'Critical security notice',
      body: 'Rotate your password if you reused it elsewhere.',
      priority: 'critical',
      category: 'security',
      imageUrl: 'https://example.com/banner.png',
      thumbnailUrl: 'https://example.com/thumb.png',
      ctaText: 'Review account',
      ctaUrl: 'https://example.com/security',
      linkView: 'settings',
      audienceType: 'users',
      audienceValues: [normalUser.id],
    });
    assert.equal(draft.priority, 'critical');
    assert.equal(draft.category, 'security');
    assert.equal(draft.ctaText, 'Review account');
    assert.equal(draft.imageUrl, 'https://example.com/banner.png');

    const published = await api('POST', `/api/admin/announcements/${draft.id}/publish`, {
      token: superAdminUser.token,
    });
    assert.equal(published.status, 200, published.body?.error);

    const inbox = await api('GET', '/api/notifications', { token: normalUser.token });
    const notification = inbox.body.notifications.find(
      (entry: any) => entry.announcementId === draft.id
    );
    assert.ok(notification);
    assert.equal(notification.priority, 'critical');
    assert.equal(notification.linkView, 'settings');

    const stored = await statsFor(draft.id);
    assert.equal(stored.deliveredCount, 1);
  });

  test('invalid URLs, priorities and categories are rejected', async () => {
    for (const body of [
      {
        title: 'Bad image',
        body: 'No script URLs are accepted.',
        imageUrl: 'javascript:alert(1)',
      },
      {
        title: 'Bad priority',
        body: 'The vocabulary is fixed.',
        priority: 'urgent',
      },
      {
        title: 'Bad category',
        body: 'The vocabulary is fixed.',
        category: 'gossip',
      },
    ]) {
      const res = await api('POST', '/api/admin/announcements', {
        token: superAdminUser.token,
        body,
      });
      assert.equal(res.status, 400, `${body.title} must be rejected`);
    }
  });
});
