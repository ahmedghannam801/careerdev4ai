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
});

after(async () => {
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
