// Notification persistence (B.3.9 finding M-1).
//
// The notifications drawer used to render two HARD-CODED entries that lived
// only in React state: the read/unread state was lost on every reload, and
// real users were shown fabricated content ("Round 2 Technical Interview with
// Vanguard Systems").
//
// These tests prove the notifications are real, owned, validated rows.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTestUser,
  deleteTestUser,
  admin,
  api,
  type TestUser,
} from './helpers.ts';

let user: TestUser;

before(async () => {
  user = await createTestUser('notifications');
});

after(async () => {
  await deleteTestUser(user);
});

describe('notifications', () => {
  test('a notification is created and persisted', async () => {
    const res = await api('POST', '/api/notifications', {
      token: user.token,
      body: {
        title: 'Interview scheduled',
        message: 'Round 2 with Acme',
        type: 'interview',
        linkView: 'applications',
      },
    });
    assert.equal(res.status, 201);
    const created = res.body?.notification;
    assert.ok(created?.id, 'the notification must have a real id');
    assert.equal(created.title, 'Interview scheduled');
    assert.equal(created.type, 'interview');
    assert.equal(created.read, false, 'a new notification is unread');

    // It is really in the database.
    const { data, error } = await admin
      .from('notifications')
      .select('id, title, read_at, type')
      .eq('id', created.id)
      .single();
    assert.equal(error, null);
    assert.equal(data?.title, 'Interview scheduled');
    assert.equal(data?.read_at, null, 'an unread notification has no read_at');
  });

  test('the notification is listed and the read state survives a reload', async () => {
    const list = await api('GET', '/api/notifications', { token: user.token });
    assert.equal(list.status, 200);
    const notifications = list.body?.notifications ?? [];
    assert.ok(notifications.length > 0, 'the notification must be listed');
    assert.ok(
      notifications.every((n: any) => n.read === false),
      'a new notification is unread'
    );

    // Mark it read.
    const target = notifications[0];
    const marked = await api('PATCH', `/api/notifications/${target.id}`, {
      token: user.token,
    });
    assert.equal(marked.status, 200);
    const updated = (marked.body?.notifications ?? []).find((n: any) => n.id === target.id);
    assert.equal(updated?.read, true, 'the notification must be marked read');

    // And the read state survives a fresh read (a reload).
    const after = await api('GET', '/api/notifications', { token: user.token });
    const reloaded = (after.body?.notifications ?? []).find((n: any) => n.id === target.id);
    assert.equal(reloaded?.read, true, 'the read state must be persisted');
  });

  test('clearing removes the notifications', async () => {
    const cleared = await api('DELETE', '/api/notifications', { token: user.token });
    assert.equal(cleared.status, 200);

    const list = await api('GET', '/api/notifications', { token: user.token });
    assert.equal(list.status, 200);
    assert.equal(
      (list.body?.notifications ?? []).length,
      0,
      'every notification must be gone'
    );

    const { count } = await admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', user.id);
    assert.equal(count, 0);
  });

  test('an invalid type is rejected', async () => {
    const res = await api('POST', '/api/notifications', {
      token: user.token,
      body: { title: 'Bad type', type: 'not_a_type' },
    });
    assert.equal(res.status, 400);
  });

  test('a missing title is rejected', async () => {
    const res = await api('POST', '/api/notifications', {
      token: user.token,
      body: { message: 'no title' },
    });
    assert.equal(res.status, 400);
  });

  test('the notification endpoints require authentication', async () => {
    const list = await api('GET', '/api/notifications');
    assert.equal(list.status, 401);
    const create = await api('POST', '/api/notifications', { body: { title: 'x' } });
    assert.equal(create.status, 401);
  });

  test('another user cannot read, update or delete a notification', async () => {
    const other = await createTestUser('notificationsother');
    try {
      const created = await api('POST', '/api/notifications', {
        token: user.token,
        body: { title: 'Private notification', type: 'system' },
      });
      assert.equal(created.status, 201);
      const id = created.body?.notification?.id;

      // B's list must not contain A's notification.
      const otherList = await api('GET', '/api/notifications', { token: other.token });
      assert.equal(otherList.status, 200);
      assert.ok(
        !(otherList.body?.notifications ?? []).some((n: any) => n.id === id),
        "B must not see A's notification"
      );

      // B must not mark it read.
      const marked = await api('PATCH', `/api/notifications/${id}`, {
        token: other.token,
      });
      assert.equal(marked.status, 404, "B must not mark A's notification read");

      // B must not delete it.
      const deleted = await api('DELETE', `/api/notifications/${id}`, {
        token: other.token,
      });
      assert.equal(deleted.status, 404, "B must not delete A's notification");

      // A's notification must be intact and still unread.
      const { data } = await admin
        .from('notifications')
        .select('read_at')
        .eq('id', id)
        .single();
      assert.equal(data?.read_at, null, "A's notification must be untouched");
    } finally {
      await deleteTestUser(other);
    }
  });

  test('a malformed notification id is rejected', async () => {
    const res = await api('PATCH', '/api/notifications/not-a-uuid', {
      token: user.token,
    });
    assert.equal(res.status, 400);
  });

  test('deleting the account removes the notifications (the FK cascade)', async () => {
    const temp = await createTestUser('notificationscascade');
    try {
      const created = await api('POST', '/api/notifications', {
        token: temp.token,
        body: { title: 'Will cascade', type: 'system' },
      });
      assert.equal(created.status, 201);
      const id = created.body?.notification?.id;

      await api('POST', '/api/account/delete', { token: temp.token });

      const { data } = await admin
        .from('notifications')
        .select('id')
        .eq('id', id)
        .maybeSingle();
      assert.equal(data, null, 'the notification must be cascade-deleted');
    } finally {
      await deleteTestUser(temp);
    }
  });
});
