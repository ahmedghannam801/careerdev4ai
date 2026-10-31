/**
 * The application's route vocabulary and its hash format.
 *
 * The application routes by hash: the URL is the source of truth for which
 * view is open. That makes a page shareable and — more importantly — makes a
 * browser refresh land on the same page instead of on the dashboard.
 *
 * The format is:
 *
 * ```text
 * #/<route>
 * #/<route>?<key>=<value>&<key>=<value>
 * #/profile/<username>      a public profile, readable without a session
 * ```
 *
 * This module is deliberately pure. It never touches `window`, so the routing
 * rules can be reasoned about — and tested — without a browser.
 */

/** Every view the signed-in application can show. */
export const APP_ROUTES = [
  'dashboard',
  'my-career',
  'roles',
  'analysis',
  'plan',
  'roadmap',
  'skills',
  'learning',
  'projects',
  'volunteer',
  'evidence',
  'cv-studio',
  'documents',
  'jobs',
  'applications',
  'interviews',
  'profile',
  'activity',
  'progress',
  'settings',
] as const;

/** A view the signed-in application can show. */
export type AppRoute = (typeof APP_ROUTES)[number];

/**
 * The two views that exist outside the signed-in shell: the landing page and
 * the onboarding wizard. They are real routes — the URL says so — but they are
 * not navigable destinations in the sidebar.
 */
export const SESSION_ROUTES = ['landing', 'onboarding'] as const;

/** Every route the application recognises, signed in or not. */
export const KNOWN_ROUTES: readonly string[] = [...APP_ROUTES, ...SESSION_ROUTES];

/** Whether a string names a view of the signed-in application. */
export function isAppRoute(value: string): value is AppRoute {
  return (APP_ROUTES as readonly string[]).includes(value);
}

/** Whether a string names any view the application recognises. */
export function isKnownRoute(value: string): boolean {
  return KNOWN_ROUTES.includes(value);
}

/** A hash broken into the parts the application cares about. */
export interface ParsedRoute {
  /** The route id. Empty when the hash names nothing. */
  route: string;
  /** The query parameters that follow the route. */
  params: Record<string, string>;
  /** The username of a public profile, when the hash points at one. */
  publicUsername: string | null;
}

/**
 * Breaks a hash into a route, its parameters and an optional public username.
 *
 * The hash is read defensively. A hand-edited or truncated hash is not an
 * error: it simply produces a route the caller will not recognise, and the
 * caller falls back to a known page.
 */
export function parseRouteHash(hash: string): ParsedRoute {
  const raw = (hash ?? '').trim();
  if (!raw) return { route: '', params: {}, publicUsername: null };

  // Strip the fragment marker and the optional leading slash. Both `#/x` and
  // `#x` have been seen in the wild, and the OAuth redirect handler leaves the
  // hash in whatever shape the provider sent it.
  let body = raw.startsWith('#') ? raw.slice(1) : raw;
  if (body.startsWith('/')) body = body.slice(1);
  if (!body) return { route: '', params: {}, publicUsername: null };

  // The query string is separated with the first `?`. A hash may legitimately
  // contain one — `#/cv-studio?tab=ats` — and the path never does.
  const queryIndex = body.indexOf('?');
  const path = queryIndex === -1 ? body : body.slice(0, queryIndex);
  const query = queryIndex === -1 ? '' : body.slice(queryIndex + 1);

  const segments = path.split('/').filter(Boolean);
  const route = segments[0] ?? '';

  let publicUsername: string | null = null;
  if (route === 'profile' && segments[1]) {
    try {
      publicUsername = decodeURIComponent(segments[1]);
    } catch {
      publicUsername = segments[1];
    }
  }

  const params: Record<string, string> = {};
  if (query) {
    for (const [key, value] of new URLSearchParams(query)) {
      if (!key) continue;
      params[key] = value;
    }
  }

  return { route, params, publicUsername };
}

/**
 * Builds the hash for a route and its parameters.
 *
 * Parameters whose value is empty are dropped, so a page that has nothing
 * selected does not carry a trail of empty parameters in its URL.
 */
export function buildRouteHash(
  route: string,
  params?: Record<string, string | undefined | null>
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (!key || value === undefined || value === null || value === '') continue;
    search.set(key, value);
  }
  const query = search.toString();
  return query ? `#/${route}?${query}` : `#/${route}`;
}

/**
 * Resolves the route a hash names.
 *
 * A hash that names a known route is honoured. Anything else — an empty hash,
 * a route that no longer exists, a malformed hash — falls back, because a
 * visitor must never be left on a blank page.
 */
export function resolveRouteId(hash: string, fallback: string): string {
  const { route } = parseRouteHash(hash);
  if (isKnownRoute(route)) return route;
  return fallback;
}

/* -------------------------------------------------------------------------- */
/* Sub-page state                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The values a meaningful sub-page can hold.
 *
 * A tab or a filter is part of the page the user is looking at, so it belongs
 * in the URL. The list of allowed values is declared here so a link that
 * carries a stale or hand-edited value falls back to a real one instead of
 * leaving the page in a state the view does not understand.
 */

/** The tabs of the CV studio. */
export const CV_STUDIO_TABS = ['editor', 'job', 'ats', 'versions', 'built'] as const;
export type CvStudioTab = (typeof CV_STUDIO_TABS)[number];

/** The tabs of the learning hub. */
export const LEARNING_TABS = [
  'recommended',
  'saved',
  'in_progress',
  'completed',
  'catalog',
] as const;
export type LearningTab = (typeof LEARNING_TABS)[number];

/** The proficiency filter of the learning hub. */
export const LEARNING_LEVELS = ['all', 'Beginner', 'Intermediate', 'Advanced'] as const;

/** The availability filter of the learning hub. */
export const LEARNING_AVAILABILITY = [
  'all',
  'free',
  'free_with_limitations',
  'audit',
  'free_course_paid_certificate',
  'paid',
  'youtube_free',
] as const;

/** The format filter of the learning hub. */
export const LEARNING_FORMATS = [
  'all',
  'course',
  'professional_certificate',
  'learning_path',
  'tutorial',
  'video',
  'playlist',
] as const;

/** The status filter of the roadmap. */
export const ROADMAP_STATUS_FILTERS = [
  'all',
  'in_progress',
  'completed',
  'not_started',
  'blocked',
] as const;

/** The category filter of the skills centre. */
export const SKILL_CATEGORIES = [
  'all',
  'technical',
  'analytical',
  'business',
  'communication',
  'leadership',
  'tools',
  'domain',
  'soft_skills',
] as const;

/** The status filter of the projects board. */
export const PROJECT_STATUS_FILTERS = [
  'all',
  'in_progress',
  'completed',
  'planned',
  'idea',
  'published',
] as const;

/** The tabs of the volunteer page. */
export const VOLUNTEER_TABS = ['opportunities', 'record'] as const;

/** The tabs of the documents page. */
export const DOCUMENT_TABS = ['documents', 'cv-versions', 'cover-letters'] as const;

/** The document type filter of the documents page. */
export const DOCUMENT_TYPE_FILTERS = [
  'all',
  'cv',
  'cover_letter',
  'certificate',
  'portfolio',
] as const;

/** The tabs of the settings page. */
export const SETTINGS_TABS = [
  'account',
  'security',
  'privacy',
  'ai',
  'notifications',
  'interface',
  'about',
] as const;

/** The category filter of the interview trainer. */
export const INTERVIEW_CATEGORIES = ['all', 'star', 'technical', 'behavioral'] as const;

/** The layout of the applications board. */
export const APPLICATION_VIEW_MODES = ['kanban', 'list'] as const;

/** The type filter of the evidence page. */
export const EVIDENCE_TYPES = [
  'all',
  'github',
  'demo',
  'certificate',
  'project',
  'experience',
  'course',
  'assessment',
  'portfolio',
] as const;

/** The filter of the activity page. */
export const ACTIVITY_FILTERS = [
  'all',
  'roadmap',
  'jobs',
  'interviews',
  'skills',
  'documents',
] as const;

/** The sections of the profile page a link can point at. */
export const PROFILE_SECTIONS = [
  'top',
  'summary',
  'experience',
  'education',
  'certifications',
  'languages',
  'links',
] as const;

/**
 * Reads a parameter out of a parsed hash and checks it against the values the
 * page understands.
 *
 * An unknown value falls back rather than being passed on, so a link from an
 * older build cannot put a page into a state it does not understand.
 */
export function readRouteParam<T extends string>(
  params: Record<string, string>,
  key: string,
  allowed: readonly T[],
  fallback: T
): T {
  const raw = params[key];
  if (raw === undefined) return fallback;
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}
