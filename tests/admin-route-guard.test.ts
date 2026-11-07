/**
 * The guard on the administrative route.
 *
 * The Admin Center is the one part of the application that is not for
 * everybody, so it must never be mounted for somebody who is not an
 * administrator.
 *
 * Two rules are protected here.
 *
 * The first is that the answer comes from the server. `GET /api/admin/me`
 * answers from the verified token, and it is the only source of truth: there
 * is no role in local storage, none in the session and none in the URL, so
 * there is nothing in the browser a visitor could change.
 *
 * The second is that the interface tells the truth about what it knows. While
 * the answer is still on its way the caller is "checking", not "refused", so a
 * real administrator never sees a flash of "access required" before the
 * server has answered for them.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..');

const app = readFileSync(join(REPO_ROOT, 'src', 'App.tsx'), 'utf-8');
const guard = readFileSync(
  join(REPO_ROOT, 'src', 'components', 'admin', 'AdminRouteGuard.tsx'),
  'utf-8'
);
const hook = readFileSync(join(REPO_ROOT, 'src', 'lib', 'useAdminAccess.ts'), 'utf-8');
const api = readFileSync(join(REPO_ROOT, 'src', 'lib', 'adminApi.ts'), 'utf-8');

describe('the administrative route is guarded', () => {
  test('the Admin Center is mounted through the guard', () => {
    assert.match(app, /<AdminRouteGuard>/);
    assert.match(app, /<AdminCenterView \/>/);
    // The guard stands between the route and the administrative surface.
    const guardIndex = app.indexOf('<AdminRouteGuard>');
    const centreIndex = app.indexOf('<AdminCenterView />');
    assert.ok(guardIndex > -1 && centreIndex > guardIndex);
  });

  test('a signed-out visitor never reaches the route switch', () => {
    // The landing page is returned before the route is rendered at all, so
    // there is no admin surface to reach without a session.
    const landingIndex = app.indexOf('if (!currentUser)');
    const switchIndex = app.indexOf('switch (currentView)');
    assert.ok(landingIndex > -1, 'the landing page must stand before the route switch');
    assert.ok(switchIndex > landingIndex, 'the route switch must come after the landing page');
  });

  test('the answer comes from the server and from nowhere else', () => {
    assert.match(api, /\/api\/admin\/me/);
    assert.match(hook, /fetchAdminMe/);
    // Nothing in the browser may decide who an administrator is.
    for (const source of [guard, hook]) {
      assert.doesNotMatch(source, /localStorage/);
      assert.doesNotMatch(source, /sessionStorage/);
      assert.doesNotMatch(source, /role=/);
      assert.doesNotMatch(source, /isAdmin\s*=\s*true/);
    }
  });
});

describe('the guard tells the truth while it waits', () => {
  test('the check starts as a check, not as a refusal', () => {
    // The answer is only about the person who is signed in now, so the check
    // is unfinished while the answer belongs to somebody else.
    assert.match(hook, /answeredFor/);
    assert.match(hook, /const loading = userId !== null && answeredFor !== userId/);
    // The old state — a check that had already finished before it started —
    // must be gone.
    assert.doesNotMatch(hook, /useState\(false\)/);
  });

  test('the refusal comes after the check, never before it', () => {
    const checkingIndex = guard.indexOf('if (loading)');
    const refusedIndex = guard.indexOf('if (!admin');
    assert.ok(checkingIndex > -1, 'the guard must have a checking state');
    assert.ok(refusedIndex > checkingIndex, 'the refusal must come after the check');
    // And the administrative surface is only returned at the very end.
    assert.match(guard, /return <>\{children\}<\/>/);
  });

  test('the page a refused caller is shown is the same one the Admin Center shows', () => {
    const centre = readFileSync(
      join(REPO_ROOT, 'src', 'components', 'views', 'AdminCenterView.tsx'),
      'utf-8'
    );
    assert.match(guard, /export const AdminAccessDenied/);
    assert.match(centre, /<AdminAccessDenied \/>/);
  });
});
