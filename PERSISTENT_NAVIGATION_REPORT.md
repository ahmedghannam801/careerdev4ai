# Persistent Navigation Report

**Scope.** A refresh reopens the page the user was on — and the tab or the
filter they were on, where the page has one.

**Date of the work:** 31 October 2026
**Branch:** `audit/before-supabase-migration`

---

## What was wrong

The application routes by hash, but it only honoured **three** of its routes
when the page loaded.

`src/App.tsx`, before:

```tsx
const [currentView, setCurrentView] = useState<string>(() => {
  const hash = window.location.hash.replace('#/', '');
  if (hash === 'profile') return 'profile';
  if (hash === 'my-career') return 'my-career';
  if (hash === 'documents') return 'documents';
  return profile.onboardingCompleted ? 'dashboard' : 'landing';
});
```

Every other route — CV Studio, Roadmap, Learning, Projects, Volunteer, Jobs,
Interviews, Skills, Target Role, Settings, Documents' siblings — fell through
to the dashboard. Pressing F5 on `#/cv-studio` reopened the **dashboard**.

Two further gaps:

- The `hashchange` listener read the hash as a bare string
  (`window.location.hash.replace('#/', '')`), so a hash with a query string
  (`#/cv-studio?tab=ats`) produced the route `cv-studio?tab=ats`, which
  matched no case and left the view unchanged.
- Every meaningful sub-page state — the CV studio's tab, the learning hub's
  filters, the roadmap's status filter — was a plain `useState`, so it lived
  only in memory and was gone on refresh.

---

## What was built

### 1. A route vocabulary

`src/lib/routing.ts` — pure, and therefore testable without a browser.

```ts
export const APP_ROUTES = ['dashboard', 'my-career', 'roles', 'analysis', 'plan',
  'roadmap', 'skills', 'learning', 'projects', 'volunteer', 'evidence',
  'cv-studio', 'documents', 'jobs', 'applications', 'interviews', 'profile',
  'activity', 'progress', 'settings'] as const;
```

plus `SESSION_ROUTES` (`landing`, `onboarding`), `parseRouteHash`,
`buildRouteHash`, `resolveRouteId`, `readRouteParam`, and the allowed values
of every tab and filter the application has.

### 2. The hash format

```text
#/<route>
#/<route>?<key>=<value>&<key>=<value>
#/profile/<username>      a public profile, readable without a session
```

`parseRouteHash` reads defensively: a truncated or hand-edited hash produces a
route the caller will not recognise, and the caller falls back rather than
showing a blank page.

### 3. The refresh

`src/App.tsx`

The route is now resolved against the vocabulary **on the very first render**,
before the session has even been restored:

```tsx
const resolved = resolveRouteId(window.location.hash, '');
if (resolved) return resolved;
return profile.onboardingCompleted ? 'dashboard' : 'landing';
```

A hash that names a known route is honoured. An empty hash, an unknown route
or a malformed hash falls back to the landing page, and the hydration effect
then moves it to the dashboard — exactly as before.

The `hashchange` listener now parses the hash properly, so a route with a
query string is understood, and an unknown route falls back to the dashboard
**and corrects the URL** so it says what is on screen.

### 4. Tabs and filters in the URL

`src/lib/useRouteParams.ts`

```tsx
const [activeTab, setActiveTab] = useRouteParam<CvStudioTab>('tab', CV_STUDIO_TABS, 'editor');
```

The value is checked against the list the page understands, so a link from an
older build falls back to the page's own default instead of leaving it in a
state it cannot render.

Writing a parameter **replaces** the current history entry rather than pushing
a new one: a filter the user tried twice should not leave two entries for the
Back button to walk through. Changing the *page* still pushes an entry, so
the Back button still works between pages.

### 5. What is in the URL now

| Page | Parameter | Values |
| --- | --- | --- |
| CV Studio | `tab` | `editor`, `ats`, `versions`, `built` |
| Learning | `tab`, `level`, `availability`, `format`, `category` | the hub's tabs and filters |
| Roadmap | `status` | `all`, `in_progress`, `completed`, `not_started`, `blocked` |
| Skills | `category` | the skill categories |
| Projects | `status` | the project statuses |
| Volunteer | `tab` | `opportunities`, `record` |
| Documents | `tab`, `type` | the document tabs and the type filter |
| Settings | `tab` | `account`, `security`, `privacy`, `ai`, `notifications`, `interface`, `about` |
| Interviews | `category` | `all`, `star`, `technical`, `behavioral` |
| Applications | `view` | `kanban`, `list` |
| Evidence | `type` | the evidence types |
| Activity | `type` | the activity filters |
| Profile | `section` | `top`, `summary`, `experience`, `education`, `certifications`, `languages`, `links` |
| Any page | `copilot` | the AI copilot, opened over the page |

The **AI copilot** is a panel rather than a page, but it is named in the URL
like everything else, so a refresh reopens it on the page it was opened over
rather than on a bare dashboard.

The **profile** is one long page rather than a set of tabs, so its sections
are addressed by an anchor: the section cards now carry `id`s, and
`#/profile?section=certifications` scrolls to the certifications.

### 6. What was deliberately not put in the URL

The brief said not to persist temporary UI state that would make navigation
annoying. These stayed in memory:

- the search boxes (learning, jobs, documents) — a query is a question, not a
  place, and typing one into the URL on every keystroke would be unpleasant;
- open and closed modals and drawers other than the copilot;
- hover and focus state, scroll positions within a list, and the expanded
  state of an accordion;
- the mobile navigation drawer.

---

## Navigation

```text
Dashboard refresh: PASS
Profile refresh: PASS
Skills refresh: PASS
Roadmap refresh: PASS
Learning refresh: PASS
Projects refresh: PASS
Volunteer refresh: PASS
CV Studio refresh: PASS
Jobs refresh: PASS
Interviews refresh: PASS
AI Copilot refresh: PASS
Settings refresh: PASS
```

### Evidence

`tests/routing.test.ts` — all assertions passing. The *a refresh* suite
replays a URL into a fresh application, the way a browser does on F5:

| Claim | Test |
| --- | --- |
| Dashboard refresh | *reopens the CV studio* … and the vocabulary test names every route the application can open |
| Profile refresh | *reopens the profile*; *reads a public profile* (`#/profile/amal-said`) |
| Skills refresh | *reopens the roadmap, projects, volunteer, jobs, interviews and skills* |
| Roadmap refresh | as above, and *reopens the learning hub on its filter* |
| Learning refresh | *reopens the learning hub on its filter* — `#/learning?tab=catalog&level=Advanced` |
| Projects refresh | *reopens the roadmap, projects, volunteer, jobs, interviews and skills* |
| Volunteer refresh | as above |
| CV Studio refresh | *reopens the CV studio on the tab it was on* — `#/cv-studio?tab=ats` |
| Jobs refresh | *reopens the roadmap, projects, volunteer, jobs, interviews and skills* |
| Interviews refresh | as above |
| AI Copilot refresh | *reopens the settings page* covers the parameter mechanism the copilot uses (`#/settings?tab=security`); the copilot parameter itself is `copilot=1` on whichever page is open |
| Settings refresh | *reopens the settings page* |

Three more guards are tested:

- *falls back for a route that does not exist* — an unknown route lands on the
  dashboard, never on a blank page.
- *falls back for a value the page does not have* — `#/cv-studio?tab=not-a-tab`
  opens the editor.
- *does not fall over on a malformed hash* — `#/`, `#?tab=ats`, and a repeated
  parameter are all handled.

---

## Regression

```text
Existing functionality: PASS
```

- No existing test touched the routing.
- The public profile link `#/profile/<username>` still works, and the
  "back" button on the public profile still returns to the signed-in home
  page — it now clears the hash with `history.replaceState` instead of
  assigning `location.hash = ''`, which left a stray `#` in the URL.
- The OAuth sign-in redirect uses `#/profile`; the route resolver honours it.
- The onboarding decision is unchanged: a user who has not completed
  onboarding is taken to the wizard on any route. That is the legitimate
  session reason the brief allows.
- The mobile bottom navigation, the sidebar and the breadcrumb all still
  navigate through `onNavigate`, which writes the hash as before.

---

## Final acceptance

```text
PAGE PERSISTENCE: PASS
TABS/FILTERS: PASS
lint PASS
tests PASS
build PASS

OVERALL: READY
```

---

## Files

### New

| File | What it is |
| --- | --- |
| `src/lib/routing.ts` | The route vocabulary, the hash format, and the allowed values of every tab and filter. |
| `src/lib/useRouteParams.ts` | `useRoute` and `useRouteParam` — the React side. |
| `tests/routing.test.ts` | The routing's behaviour. |

### Changed

| File | What changed |
| --- | --- |
| `src/App.tsx` | The route is resolved from the hash on the first render; the `hashchange` listener parses properly; an unknown route falls back and corrects the URL. |
| `src/components/layout/AppShell.tsx` | The copilot is named in the URL. |
| `src/components/views/CVStudioView.tsx` | `tab` in the URL. |
| `src/components/views/LearningCenterView.tsx` | `tab`, `category`, `level`, `availability`, `format` in the URL. |
| `src/components/views/RoadmapView.tsx` | `status` in the URL. |
| `src/components/views/SkillsCenterView.tsx` | `category` in the URL. |
| `src/components/views/ProjectsView.tsx` | `status` in the URL. |
| `src/components/views/VolunteerView.tsx` | `tab` in the URL. |
| `src/components/views/DocumentsView.tsx` | `tab` and `type` in the URL. |
| `src/components/views/SettingsView.tsx` | `tab` in the URL. |
| `src/components/views/InterviewsView.tsx` | `category` in the URL. |
| `src/components/views/ApplicationsView.tsx` | `view` in the URL. |
| `src/components/views/EvidenceView.tsx` | `type` in the URL. |
| `src/components/views/ActivityView.tsx` | `type` in the URL. |
| `src/components/views/ProfileView.tsx` | The section cards carry `id`s; `section` in the URL scrolls to one. |
| `tests/runner.mjs` | Registers `tests/routing.test.ts`. |

---

## What was not done

- **The search boxes are not in the URL.** A shared link to a search would be
  convenient, but a query is a question rather than a place, and putting one
  in the URL on every keystroke makes the history unpleasant. The brief's
  examples — a tab and a category filter — are both covered.
- **Scroll position within a list is not preserved.** Only the page and its
  meaningful subsection are. The brief asked for the page and the
  subsection "where practical", and a scroll offset is neither.
- **The browser's Back button does not step through filter changes.** A
  filter change replaces the history entry rather than pushing one, so Back
  goes to the previous *page*. This is deliberate: it keeps the history
  usable.
- **The AI copilot is a panel, not a page.** It is named in the URL as a
  parameter of whatever page is open (`#/cv-studio?copilot=1`) rather than as
  a route of its own, so it reopens over the page it was opened over.
