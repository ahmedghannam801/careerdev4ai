/**
 * Behavioural checks for the routing.
 *
 * The URL is the state of the application. That is what makes a refresh land
 * on the same page, and it is what makes a link to "the AI tab of the CV
 * studio" mean something.
 *
 * These tests exercise the pure half of the routing — the part that decides
 * what a hash means — because that is where the behaviour that matters lives:
 * a known route is honoured, an unknown one falls back, and a tab or a filter
 * survives the trip through the URL.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  APP_ROUTES,
  CV_STUDIO_STEPS,
  CV_STUDIO_TABS,
  DOCUMENT_TABS,
  LEGACY_ALIASED_ROUTES,
  LEARNING_LEVELS,
  LEARNING_TABS,
  ROADMAP_STATUS_FILTERS,
  ROUTE_ALIASES,
  buildRouteHash,
  cvStudioStepForTab,
  isAppRoute,
  isKnownRoute,
  parseRouteHash,
  readRouteParam,
  resolveRouteAlias,
  resolveRouteId,
} from '../src/lib/routing.ts';

describe('the route vocabulary', () => {
  it('names every page the application can open', () => {
    for (const route of [
      'profile',
      'cv-studio',
      'roadmap',
      'learning',
      'projects',
      'volunteer',
      'jobs',
      'interviews',
      'skills',
      'documents',
      'settings',
    ]) {
      assert.equal(isAppRoute(route), true, `${route} must be a known route`);
      assert.equal(isKnownRoute(route), true);
    }
  });

  it('does not accept a route that does not exist', () => {
    assert.equal(isAppRoute('nonsense'), false);
    assert.equal(isKnownRoute('nonsense'), false);
    assert.equal(APP_ROUTES.includes('nonsense' as never), false);
  });

  it('knows the pages that live outside the signed-in shell', () => {
    assert.equal(isKnownRoute('landing'), true);
    assert.equal(isKnownRoute('onboarding'), true);
    assert.equal(isAppRoute('landing'), false);
  });
});

describe('a route that has moved inside another view', () => {
  it('resolves to where it lives now', () => {
    // The CV Analyzer is the CV Studio's analysis tab. A link to the old
    // address still works because the address is an alias, not a dead end.
    const alias = resolveRouteAlias('cv-analyzer');
    assert.ok(alias);
    assert.equal(alias.route, 'cv-studio');
    assert.equal(alias.params.tab, 'ats');
    assert.equal(buildRouteHash(alias.route, alias.params), '#/cv-studio?tab=ats');
  });

  it('is still a route the application knows', () => {
    // The alias is resolved, not removed: the link is in shared CVs, in
    // support messages and in browser history. The address is recognised so
    // it can be redirected — but the analyzer is no longer a view of the
    // application, so nothing may open one.
    assert.equal(isAppRoute('cv-analyzer'), false);
    assert.equal(isKnownRoute('cv-analyzer'), true);
    assert.equal(parseRouteHash('#/cv-analyzer').route, 'cv-analyzer');
  });

  it('leaves an ordinary route alone', () => {
    assert.equal(resolveRouteAlias('cv-studio'), null);
    assert.equal(resolveRouteAlias('dashboard'), null);
    assert.equal(resolveRouteAlias('nonsense'), null);
  });

  it('only ever points at a route that exists', () => {
    for (const [from, to] of Object.entries(ROUTE_ALIASES)) {
      // The address the alias replaces must stay an address the application
      // recognises — as a legacy address, if the view behind it is gone — and
      // it must point at a route that is a view of the application today.
      assert.equal(isKnownRoute(from), true, `${from} must stay a known route`);
      assert.equal(isAppRoute(to.route), true, `${from} must point at a real route`);
      for (const [key, value] of Object.entries(to.params ?? {})) {
        assert.ok(value.length > 0, `the parameter ${key} of ${from} must have a value`);
      }
    }
  });

  it('keeps the legacy addresses in the list of addresses it recognises', () => {
    // The platform recognises an address so it can redirect it. That is a
    // different thing from opening it as a view.
    assert.ok(LEGACY_ALIASED_ROUTES.includes('cv-analyzer'));
    for (const route of LEGACY_ALIASED_ROUTES) {
      assert.equal(isAppRoute(route), false, `${route} must not be a view of the application`);
      assert.equal(isKnownRoute(route), true, `${route} must still be a known route`);
      assert.ok(resolveRouteAlias(route), `${route} must be redirected somewhere`);
    }
  });
});

describe('reading a hash', () => {
  it('reads a plain route', () => {
    const parsed = parseRouteHash('#/cv-studio');
    assert.equal(parsed.route, 'cv-studio');
    assert.deepEqual(parsed.params, {});
    assert.equal(parsed.publicUsername, null);
  });

  it('reads a route with a tab', () => {
    const parsed = parseRouteHash('#/cv-studio?tab=ats');
    assert.equal(parsed.route, 'cv-studio');
    assert.equal(parsed.params.tab, 'ats');
  });

  it('reads a route with a filter', () => {
    const parsed = parseRouteHash('#/learning?tab=catalog&level=Advanced');
    assert.equal(parsed.route, 'learning');
    assert.equal(parsed.params.tab, 'catalog');
    assert.equal(parsed.params.level, 'Advanced');
  });

  it('reads a hash that has no leading slash', () => {
    assert.equal(parseRouteHash('#cv-studio').route, 'cv-studio');
  });

  it('reads a public profile', () => {
    const parsed = parseRouteHash('#/profile/amal-said');
    assert.equal(parsed.route, 'profile');
    assert.equal(parsed.publicUsername, 'amal-said');
  });

  it('reads the signed-in profile as a profile without a username', () => {
    const parsed = parseRouteHash('#/profile');
    assert.equal(parsed.route, 'profile');
    assert.equal(parsed.publicUsername, null);
  });

  it('reads an empty hash as no route at all', () => {
    const parsed = parseRouteHash('');
    assert.equal(parsed.route, '');
    assert.deepEqual(parsed.params, {});
  });

  it('does not fall over on a malformed hash', () => {
    assert.equal(parseRouteHash('#/').route, '');
    assert.equal(parseRouteHash('#?tab=ats').route, '');
    assert.equal(parseRouteHash('#/cv-studio?tab=ats&tab=editor').params.tab, 'editor');
  });
});

describe('writing a hash', () => {
  it('writes a route', () => {
    assert.equal(buildRouteHash('cv-studio'), '#/cv-studio');
  });

  it('writes a route with its parameters', () => {
    assert.equal(buildRouteHash('cv-studio', { tab: 'ats' }), '#/cv-studio?tab=ats');
  });

  it('leaves out the parameters that are empty', () => {
    assert.equal(buildRouteHash('cv-studio', { tab: '', other: undefined }), '#/cv-studio');
  });

  it('round-trips', () => {
    const hash = buildRouteHash('learning', { tab: 'catalog', level: 'Advanced' });
    const parsed = parseRouteHash(hash);
    assert.equal(parsed.route, 'learning');
    assert.equal(parsed.params.tab, 'catalog');
    assert.equal(parsed.params.level, 'Advanced');
  });
});

describe('resolving a hash to a page', () => {
  it('honours a known route', () => {
    assert.equal(resolveRouteId('#/cv-studio', 'dashboard'), 'cv-studio');
    assert.equal(resolveRouteId('#/learning?tab=catalog', 'dashboard'), 'learning');
  });

  it('falls back for a route that does not exist', () => {
    assert.equal(resolveRouteId('#/does-not-exist', 'dashboard'), 'dashboard');
    assert.equal(resolveRouteId('', 'dashboard'), 'dashboard');
    assert.equal(resolveRouteId('#/', 'dashboard'), 'dashboard');
  });
});

describe('a refresh', () => {
  // The scenario the routing exists for: the user is on a page, they press
  // F5, and the application reopens the same page.
  const refresh = (hash: string) => {
    // A refresh replays the URL into a fresh application. The route is
    // resolved from the hash alone, before any session has been restored.
    const route = resolveRouteId(hash, 'dashboard');
    return { route, params: parseRouteHash(hash).params };
  };

  it('reopens the CV studio', () => {
    assert.equal(refresh('#/cv-studio').route, 'cv-studio');
  });

  it('reopens the CV studio on the tab it was on', () => {
    const state = refresh('#/cv-studio?tab=ats');
    assert.equal(state.route, 'cv-studio');
    assert.equal(state.params.tab, 'ats');
  });

  it('reopens the learning hub on its filter', () => {
    const state = refresh('#/learning?tab=catalog&level=Advanced');
    assert.equal(state.route, 'learning');
    assert.equal(state.params.level, 'Advanced');
  });

  it('reopens the profile', () => {
    assert.equal(refresh('#/profile').route, 'profile');
  });

  it('reopens the roadmap, projects, volunteer, jobs, interviews and skills', () => {
    for (const route of ['roadmap', 'projects', 'volunteer', 'jobs', 'interviews', 'skills']) {
      assert.equal(refresh(`#/${route}`).route, route);
    }
  });

  it('reopens the settings page', () => {
    assert.equal(refresh('#/settings?tab=security').route, 'settings');
    assert.equal(refresh('#/settings?tab=security').params.tab, 'security');
  });
});

describe('a tab or a filter the page understands', () => {
  it('takes the value the URL carries', () => {
    const params = parseRouteHash('#/cv-studio?tab=versions').params;
    assert.equal(readRouteParam(params, 'tab', CV_STUDIO_TABS, 'editor'), 'versions');
  });

  it('falls back for a value the page does not have', () => {
    const params = parseRouteHash('#/cv-studio?tab=not-a-tab').params;
    assert.equal(readRouteParam(params, 'tab', CV_STUDIO_TABS, 'editor'), 'editor');
  });

  it('falls back when the URL carries nothing', () => {
    const params = parseRouteHash('#/cv-studio').params;
    assert.equal(readRouteParam(params, 'tab', CV_STUDIO_TABS, 'editor'), 'editor');
  });

  it('guards every kind of sub-page the application has', () => {
    const learning = parseRouteHash('#/learning?tab=completed&level=Beginner').params;
    assert.equal(readRouteParam(learning, 'tab', LEARNING_TABS, 'recommended'), 'completed');
    assert.equal(readRouteParam(learning, 'level', LEARNING_LEVELS, 'all'), 'Beginner');

    const roadmap = parseRouteHash('#/roadmap?status=in_progress').params;
    assert.equal(readRouteParam(roadmap, 'status', ROADMAP_STATUS_FILTERS, 'all'), 'in_progress');

    const documents = parseRouteHash('#/documents?tab=cv-versions').params;
    assert.equal(readRouteParam(documents, 'tab', DOCUMENT_TABS, 'documents'), 'cv-versions');
  });
});

describe('the workflow of the CV Studio', () => {
  it('is one path of five steps', () => {
    assert.deepEqual(
      CV_STUDIO_STEPS.map((step) => step.id),
      ['cv', 'import', 'analyze', 'improve', 'export']
    );
  });

  it('gives every tab of the studio to exactly one step', () => {
    const owned = CV_STUDIO_STEPS.flatMap((step) => [...step.tabs]);
    assert.deepEqual([...owned].sort(), [...CV_STUDIO_TABS].sort());
    assert.equal(new Set(owned).size, owned.length, 'a tab belongs to one step only');
  });

  it('says which step a tab belongs to', () => {
    // "My CV" owns the document, the records it is built from and its
    // history; the rest of the tabs each belong to their own step.
    assert.equal(cvStudioStepForTab('editor'), 'cv');
    assert.equal(cvStudioStepForTab('data'), 'cv');
    assert.equal(cvStudioStepForTab('versions'), 'cv');
    assert.equal(cvStudioStepForTab('review'), 'import');
    assert.equal(cvStudioStepForTab('ats'), 'analyze');
    assert.equal(cvStudioStepForTab('job'), 'improve');
    assert.equal(cvStudioStepForTab('built'), 'export');
  });

  it('keeps every deep link of the studio working', () => {
    for (const tab of CV_STUDIO_TABS) {
      const params = parseRouteHash(buildRouteHash('cv-studio', { tab })).params;
      assert.equal(readRouteParam(params, 'tab', CV_STUDIO_TABS, 'editor'), tab);
    }
  });
});
