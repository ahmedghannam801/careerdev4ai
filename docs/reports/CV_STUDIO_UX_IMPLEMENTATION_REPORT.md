# CV Studio and guided-tour UX — implementation report

**Scope.** The seven reported problems in the CV studio and the first-run
guidance: the guided tour, the transparent surfaces, the language selector in
the header, managing the CV's data from inside the studio, the AI suggestions
per section, the separation between the CV studio and the profile screen, and
the UX of the studio as a whole.

**Branch.** `main` · **Status.** Implemented, verified against the live
database, deployed.

---

## 1. What was actually wrong

The report described symptoms. Four of them turned out to have a single
shared cause, and two of the reported features did not exist at all.

### 1.1 The transparency was a missing Tailwind theme, not a colour choice

The components were written against semantic colour utilities — `bg-surface`,
`text-foreground`, `bg-primary`, `text-muted`, `border-border`,
`bg-surface-raised`, `bg-primary/10`, `ring-primary/20` — and **the project
had no `@theme` block at all**.

Tailwind v4 only generates a utility for a colour name that exists in the
theme. The application defines its palette as plain CSS variables inside
`@layer base` so it can switch between light and dark with a class on
`<html>`. Without a theme bridge, every one of those class names produced
**no CSS at all**:

```
$ grep -c 'bg-surface' dist/assets/*.css     →  0
$ grep -c 'text-foreground' dist/assets/*.css →  0
$ grep -c 'bg-primary' dist/assets/*.css      →  0
```

196 real utility usages across 70 files were silently doing nothing. A panel
whose class was `bg-surface` had **no background at all**; a border written
as `border-border` drew no border; `text-foreground` and `text-muted` fell
back to the inherited colour. That is exactly the "transparent / washed out"
appearance of the credits dropdown, the upgrade modal, the language picker
and the admin panels.

The fix is a `@theme inline` block in `src/index.css` that maps the semantic
names onto the existing CSS variables:

```css
@theme inline {
  --color-surface: var(--color-surface);
  --color-foreground: var(--color-text);
  --color-muted: var(--color-text-muted);
  --color-primary: var(--color-primary);
  --color-border: var(--color-border);
  --color-surface-raised: var(--color-surface-elevated-alt);
  /* … */
}
```

`inline` is required: the theme variable references the semantic variable of
the same name, and `inline` makes Tailwind put that reference straight into
the utility instead of resolving it once at build time, so the utility stays
dynamic and follows the `.dark` override at runtime. The declarations
themselves live in `@layer base`, which is ordered **after** Tailwind's own
`@layer theme`, so the palette always wins over anything the theme layer
emits. Verified in the built CSS:

```css
.bg-surface{background-color:var(--color-surface)}
.bg-surface-raised{background-color:var(--color-surface-elevated-alt)}
.bg-primary\/10{background-color:color-mix(in oklab, var(--color-primary) 10%, transparent)}
```

Nine further variables were **referenced but never declared** — `--bg-subtle`,
`--color-error`, `--color-primary-surface`, `--color-text-primary`,
`--danger-surface`, `--surface-raised`, `--success-strong`,
`--success-surface`, `--text-warning`. Each resolved to an invalid value, so
the admin panels lost their background, the job-status chips lost theirs, and
the warning text lost its colour. All nine are now declared in both modes.

### 1.2 The tour hid the very thing it was pointing at

Both tours dimmed the page **twice**: a full-screen scrim (`bg-black/60
backdrop-blur-xs`) *and* a spotlight ring drawn as a very large `box-shadow`.
The ring leaves the target's own box uncovered — but the scrim underneath it
painted over that box anyway. The element the instruction was talking about
was the one thing on screen you could not see.

The scrim is now transparent while a spotlight is showing, and the ring alone
does the dimming. When a step has no target there is nothing to point at, so
the scrim returns and the page dims as before.

The card was also placed by hand ("below if there is room, otherwise above"),
with no check for whether it covered the element. It could, and on a wide
target it did. Placement now goes through `placeTooltip`
(`src/components/onboarding/useSpotlight.ts`), which tries every side and
**rejects any placement that overlaps the target**; on a phone the card
becomes a bottom sheet, which is the only place it can go without covering
the subject.

Both tours also shared a third defect: the position was read once, so a
scroll, a resize or a view change left the spotlight pointing at nothing.
The measurement is now live — it follows scrolling, resizing and the target
changing size.

### 1.3 The header language selector was never a CV language selector

The header carried the **AI response language** picker. It read as if it
chose the language of the CV — and it did, in effect: the studio wrote CV
content in the AI response language, and there was no setting for the
language of the document at all.

Three languages were being confused with one another. They are now three
separate settings:

| Setting | Where it lives | What it decides |
|---|---|---|
| Interface language | Header + Settings | What the product says |
| **Resume language** | **CV Studio** | The language the CV is written in |
| AI response language | Settings | The language every other generated answer is written in |

### 1.4 The CV could not be managed from inside the studio

The studio could write the *words* on a CV, but the *records* the CV is built
from lived on the profile screen. Adding a job meant going to the profile,
coming back, and filling the document in again.

### 1.5 The AI could write a section, but not be asked for anything specific

The assistant had one mode: write the field. There was no way to ask for the
same entry as an improvement, as bullet points, as the responsibilities of
the role, or as the achievements it produced.

### 1.6 The order of the entries was thrown away on every read

Experience was re-sorted by start date, education by start date, certificates
by issue date, languages by name, projects by creation time. The order a
candidate chose was discarded the moment they saved it, and a CV that made
sense to them came back in a different order every time it was rebuilt.

---

## 2. What was built

### 2.1 The design tokens (`src/index.css`)

* A `@theme inline` bridge that registers `background`, `surface`,
  `surface-secondary`, `surface-elevated`, `surface-raised`, `foreground`,
  `muted`, `border`, `primary`, `primary-hover`, `primary-surface`, `card`
  and `ai`, so the 196 utilities the application already used now render.
* The nine variables that were referenced but never declared, in both modes.
* Light and dark palettes re-checked for contrast on the surfaces that were
  actually transparent.

### 2.2 The spotlight engine (`src/components/onboarding/useSpotlight.ts`)

A single implementation shared by both tours:

* `useSpotlight` — resolves the target (with optional fallbacks), scrolls it
  into view, and re-measures it on scroll, resize and size change.
* `placeTooltip` — places the instruction card beside the target and never
  over it; a bottom sheet on a narrow screen.

### 2.3 The tours

**`GuidedTour`** was rewritten around the shared engine: a ring that leaves
the target bright, a card beside it, a step counter with progress dots, and
**Next / Back / Skip / Finish**. The Skip button did not exist. The step
titles and bodies were **hardcoded English**, so an Arabic reader saw an
English coach-mark; all ten are now in the Arabic catalogue.

**`InteractiveTourModal`** got the same ring treatment, the same
non-overlapping placement, and a live viewport measurement. Its "Skip Step"
button was a **duplicate of "Next"** — it advanced one step and was labelled
as skipping; it is now "Skip Tour", which ends the tour and persists the
dismissal. The tour remains reachable afterwards from Settings and from the
Tour Navigator.

### 2.4 The resume language

**`shared/resumeLanguage.ts`** — the vocabulary: the two languages, the
direction of each, the labels, the model instruction, and the section
headings printed on the document.

**Storage.** `public.user_preferences.resume_language` (`text`, `NOT NULL`,
default `'en'`, `CHECK (resume_language IN ('ar','en'))`). The column is on
the existing account-owned settings table, which already has owner-only
row-level security, so **no new table and no new access path** is introduced.
Applied to the live database.

**What it changes.** The headings printed on the document, the direction the
document is laid out in, and the language the assistant writes CV content in.

**What it does not change.** The interface language, and the facts. An
employer, a university and a certificate body are proper nouns: they are
written the way the issuer writes them. The English headings are byte-identical
to the ones the document has always printed, so an existing CV looks the same
after the upgrade.

### 2.5 The data manager (`src/components/cv/studio/CvDataManager.tsx`)

A new **My Data** tab in the studio where the candidate manages the records
the CV is built from — personal information, experience, education, projects,
certifications, skills, languages and volunteering — with **add, edit,
delete and reorder** for each.

It edits **the same records the profile screen edits**. There is one source
of truth (`public.profiles`, `public.experiences`, `public.educations`,
`public.profile_certifications`, `public.profile_languages`,
`public.projects`, `public.user_skills`) and no second copy of anything: a
change made in the studio appears on the profile screen immediately, and the
other way round.

A delete asks first, because a delete here is a delete of the candidate's
real record and not of a line on a draft.

### 2.6 The order of the entries

`public.{experiences,educations,profile_certifications,profile_languages,projects}`
each gained a `sort_order integer NOT NULL DEFAULT 0`, and the server reads
it as the **first** key of the sort with the old date as the tiebreak. Every
existing row therefore has `sort_order = 0` and keeps exactly the order it
has today — the change is invisible until somebody reorders something.

`POST /api/profile/reorder` stores a new order. The collection is chosen
from a fixed list on the server and never from the request; the owner is
always the verified user id; and the whole collection is renumbered, so a row
created in another session keeps its relative position instead of jumping to
the top.

### 2.7 The AI suggestions

`shared/cvAiAssist.ts` gained an **action** dimension, independent of the
field:

| Action | What it asks for | Offered on |
|---|---|---|
| `write` | Write the section from the record | every field |
| `improve` | Improve what the candidate already wrote | every field |
| `shorten` | Cut the wording, not the substance | every field |
| `expand` | Add the detail the record supports | summary, experience, education, project, volunteering |
| `bullets` | Turn it into bullet points | experience, project, volunteering |
| `achievements` | Suggest the achievements | experience, volunteering |
| `responsibilities` | Suggest the responsibilities of the role | experience |
| `keywords` | Suggest relevant skills | summary, skills, experience, project |

An action that does not apply to a field falls back to a plain write, so the
control never offers to suggest achievements for a certificate.

**The grounding rules are in the prompt for every action.** An action is a
different *instruction*, never a weaker set of rules: the record is still
read from the database for the verified user id, and the answer is still
checked back against it, so a number the candidate has never recorded is
removed before they see it.

The preview-before-apply, regenerate and discard flow that already existed
is unchanged; the action picker sits above it.

### 2.8 The studio

* The **Resume Language** picker sits in the studio header.
* The **My Data** tab holds the records.
* The preview renders the section headings in the resume language and lays
  the paper out in the right direction.

---

## 3. Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm test` | see §4 |
| `npx vite build` | clean, and the generated CSS contains the utilities it did not contain before |
| Migrations applied to the live database | `resume_language` and the five `sort_order` columns confirmed present |
| Data manager / preview / picker | exercised against the live database |

### The new tests

`tests/resume-language.test.ts`, `tests/cv-assist-actions.test.ts` and
`tests/cv-studio-data.test.ts` — all pure, all registered in the runner.

They protect the properties that are easy to break:

* the resume language is normalised, and the three languages stay separate;
* the English headings are byte-identical to the ones the document has always
  printed;
* an action that does not apply to a field falls back to a plain write, and
  the grounding rules are in the prompt for **every** action;
* a collection whose order is not stored cannot be named;
* the tour card never overlaps the element it describes.

---

## 4. Files

**Added**
`shared/resumeLanguage.ts` · `src/components/onboarding/useSpotlight.ts` ·
`src/components/cv/studio/CvDataManager.tsx` ·
`src/components/cv/studio/ResumeLanguagePicker.tsx` ·
`src/lib/profileOrderApi.ts` · `server/db/ordering.ts` ·
`src/translations/parts/cvStudioData.ts` ·
`supabase/migrations/20261111000001_resume_language.sql` ·
`supabase/migrations/20261111000002_collection_ordering.sql` ·
`tests/resume-language.test.ts` · `tests/cv-assist-actions.test.ts` ·
`tests/cv-studio-data.test.ts`

**Changed**
`src/index.css` · `src/components/onboarding/GuidedTour.tsx` ·
`src/components/onboarding/InteractiveTourModal.tsx` ·
`src/components/layout/AppShell.tsx` · `src/components/ui/AiLanguageSelector.tsx` ·
`src/components/cv/AiAssist.tsx` · `src/components/cv/CvPreview.tsx` ·
`src/components/views/CVStudioView.tsx` · `src/components/views/SettingsView.tsx` ·
`src/context/CareerContext.tsx` · `src/lib/preferencesApi.ts` ·
`src/lib/routing.ts` · `src/types/career.ts` ·
`src/translations/index.ts` · `src/translations/sourceStrings.ts` ·
`src/translations/parts/tour.ts` · `shared/cvAiAssist.ts` ·
`server/cv/aiAssist.ts` · `server/db/preferences.ts` ·
`server/db/experiences.ts` · `server/db/educations.ts` ·
`server/db/profileExtensions.ts` · `server/db/projects.ts` ·
`app.ts` · `tests/runner.mjs`
