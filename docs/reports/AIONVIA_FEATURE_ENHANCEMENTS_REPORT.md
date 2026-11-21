# Aionvia — Focused Feature Improvements & UI/UX Enhancement

**Scope.** The "Focused Feature Improvements & UI/UX Enhancement" specification (§2–§22) against the
Aionvia repository at `D:/Saas/careerpilot-ai`, on top of the rebrand and surface work already committed at
`506c85a`, `4b36aa4` and `adaaeb3`.

**Rule followed.** Inspect first, then implement only what was missing or broken. The rebrand, the roadmap
command centre, the profile completeness work, the projects coverage panel, the assessment expansion and the
volunteer filter panel were treated as completed by the parallel rebrand work and were not rebuilt. The
work below is the set of requirements that were still genuinely incomplete on those committed surfaces.

---

## A. Implemented

| § | Requirement | What was delivered |
|---|---|---|
| 5 | Progress Dashboard built from real data | `ProgressView` rebuilt around the candidate's own records: 12 statistic cards (mastered skills, roadmap completion and remaining tasks, completed projects against the role's portfolio target, career readiness, interview readiness, average interview performance, saved jobs, active applications, interviews, offers, certifications, evidence), a Learning block (recommended / saved / in progress / completed) that opens the Learning Hub already filtered, a pipeline block, and a "resume where you left off" row naming the most recently started course. Every card that has a destination is a real button; the rest are plain figures rather than dead controls. |
| 5 | Interactive statistics | Each card navigates through the hash with the filter that matches what it counted: `learning?tab=in_progress`, `applications?view=list`, `evidence?type=certificate`, `skills`, `roadmap`, `projects`, `analysis`, `interviews`, `jobs`. |
| 5 | A chart that carries information | Eight-week activity chart built from the recorded activity ledger, with empty weeks drawn as empty columns rather than skipped, per-bar accessible labels, and an honest empty state. New pure module `weeklyActivityBuckets` in `shared/progressMomentum.ts`. |
| 5 | Empty states | No target role now reads "No target role selected yet." with a real **Choose a target role** button; an unmeasured readiness reads "—" with its reason; a candidate with no activity is told so instead of being shown a zero-filled chart. |
| 15 | Follow-up reminders | Reminder panel grouping the dates the candidate recorded on their own applications into overdue / today / coming up, each row opening the application, with a **Mark done** action that clears the recorded reminder. Reminder chips also appear on the pipeline cards. |
| 15 | Analytics where the data supports it | Application-to-interview conversion and offer rate, computed only from confirmed applications; the denominator-zero case reads "Confirm an application to measure this", not 0%. Average response time and job-source effectiveness are deliberately **not** shown: the record holds no transition timestamps and no source column, so either figure would be a guess. |
| 15 | List view | Search over role, company, place, mode, notes and next action; stage filter; sort by last updated / applied date / company; a clear-filters action; a row count; and a real "no application matches" state. |
| 15 | Destructive and reversible actions | Deleting an application now asks for confirmation in a dialog that names it and offers archiving instead. Archiving moves the row to `withdrawn`, keeps the record and its notes, and is reversible from the stage menu. |
| 16 | Interview history | The stored live-voice transcripts and their reports were written to the database but never shown again. `InterviewsView` now has a voice-interview history section: type, role, date, language, duration, turn count, score, and — on open — the per-dimension scores, the transcript, strengths, improvements and the recommended training plan. No audio is read or offered, because none is stored. |
| 16 | Progress integration | The Progress Dashboard counts live voice interviews together with the written mock sessions when it measures readiness and average performance, through a shared cached loader (`src/lib/useLiveInterviewHistory.ts`) so the two pages make one request, not two. |
| 11 | CV Studio preview control | The desktop workspace can now fold the preview away and bring it back (`Hide preview` / `Show preview`), keeping the editor full width when the candidate is writing a long section. On a phone the existing Editor/Preview switch is unchanged. The preview is hidden, never unmounted, so its scroll position survives. |
| 14 | Official mascot loading | The job search — a real wait against the job provider — now shows the official mascot (`public/brand/aionvia-ai-mascot.webp`, byte-identical to the original `roadmapak-ai-mascot.webp`) inside its loading region, with the skeletons beneath it. The existing `MascotLoader` remains the single loading component, already carrying the two specified messages. |
| 7 / 18 | Keyboard and screen-reader access | Application form fields are now bound to their labels (`htmlFor`/`id`), icon-only close and delete controls carry accessible names, and the pipeline card's title is a real button so the card can be opened from the keyboard instead of only by pointer. |
| 3 | Spiral timeline | Audited rather than rebuilt: the spiral, its states, its accessible marker labels, its detail panel and its empty state were re-verified, and the markers now expose stable `data-spiral-marker` / `data-spiral-state` hooks for verification. |
| 1 / 21 | Official logo, applied everywhere from one artwork | The supplied lockup is now the single source of truth at `src/assets/brand/official/aionvia-logo.png`, and `npm run brand` derives every asset from it: the **mark alone** for the favicon, the app icons, the maskable tile and the SVG favicon; the **whole lockup** for the header, the auth screens, the public profile, the landing footer and the social card. The pipeline finds the empty band between the mark and the lettering in the artwork itself instead of guessing a crop, so nothing is redrawn, re-lettered or stretched — only the white field is removed and the supplied margin trimmed. |

## B. Fixed

| Bug | Root cause | Fix |
|---|---|---|
| Statistics that could only be looked at | The Progress page had no destinations at all — its cards were static divs. | Every countable card is now a button that navigates to the section it counts, with the matching filter in the URL. |
| A zero denominator presented as a result | Analytics panels would have shown "0%" for a candidate with no applications, which is not zero — it is unknown. | The ratios are computed only when there is something to divide, and say so otherwise. |
| Follow-up dates that existed but were never surfaced | The date was stored per application and shown only after opening that one application; nothing aggregated it. | A reminder panel and per-card reminder chips, both derived from the stored dates. |
| One-click deletion of a tracked application | The delete control called the delete mutation directly. | A confirmation dialog that names the application, with archiving as the reversible alternative. |
| Unlabelled form inputs in the application dialogs | `<label>` elements were not associated with their inputs. | `htmlFor`/`id` pairs on every field, and accessible names on icon-only controls. |
| The stored voice interviews vanished after the session | The transcript write existed; no read path was ever built into the interface. | History section that reads the candidate's own rows under RLS and shows transcript and report. |
| The CV preview could not be hidden on a desktop | The split view had no fold control (only the phone had a switch). | A desktop toggle that hides the panel without unmounting it. |
| The full logo was illegible wherever it was used | The asset was a wide lockup, but every call site sized it by height (`h-8`, `h-12`). With a stacked lockup that leaves the lettering about six pixels tall, and on a wide one it wastes the slot. | The logo is now sized by width wherever the lockup is shown (`w-24`, `w-32`), and shallow bars carry the mark beside the product name instead of a lockup squeezed into 32 pixels. The `Logo` component documents the rule so the next edit cannot reintroduce it. |
| The favicon was the whole lockup squeezed into 16 pixels | One square asset was reused for both the UI and the icon set. | The icon set is now generated from the mark alone, with the wordmark left out where it cannot be read. |
| The Progress header printed "Target Role:" with nothing after it, and a "Mastered Skills for" heading with no role | Empty-state handling was missing. | Real empty states with a control to choose a role. |

## C. Database

**No migration was required or written.** Every figure and every action above reads or writes tables that
already exist and are already migrated:

- `user_activity` (weekly chart, streak), `roadmap_phases` / roadmap tasks (completion), `user_skills`
  (mastery), `projects` (portfolio), `profile_certifications`, `evidence_items`, `job_applications`
  (pipeline, follow-ups, analytics), `mock_interview_sessions`, `learning_items` / the learning catalogue,
  and `live_interview_sessions` (created by `supabase/migrations/20261129000001_live_interview_sessions.sql`,
  which already carries owner-only `SELECT`/`INSERT`/`UPDATE`/`DELETE` policies and no audio column).

The duplicate-project requirement (§17.9) was investigated and found already fixed at the correct layer: the
write path reuses an existing row through `shared/projectIdentity.ts`, and the read path collapses legacy
duplicate rows (`collapseDuplicateProjectRows`) instead of deleting them. No project was removed.

## D. AI integration

- **Gemini Live was reused, not replaced.** `server/interviews/live.ts` mints one ephemeral token per
  session from the existing server-side `GEMINI_API_KEY`, locked to `gemini-3.8-live`, `v1beta`, the
  interviewer's system instruction and the transcript-only modality configuration. The key never leaves the
  server; the browser receives the short-lived token. Verified against Google's current model list, which
  advertises `gemini-3.8-live` as a served Live model.
- **The Live credential cannot be minted today.** The key in `.env` is refused by Google with
  `401 UNAUTHENTICATED / ACCOUNT_STATE_INVALID — "The bound service account is deleted or disabled."` The
  same call fails for plain text generation, so the whole key is dead, not just the Live path. No new key,
  no new project and no bypass of Google's account validation was created. The production Pages secret for
  Gemini was deliberately not overwritten by the rebrand work either, so production Live will report
  "not configured" until a working key is supplied.
- The transcript-only storage policy is enforced by schema: the table has no audio column, and the client
  streams audio directly to Google without recording it.

## E. Testing

| Check | Command | Result |
|---|---|---|
| Type check | `npx tsc --noEmit` | **exit 0** |
| Lint (app + test types) | `npm run lint` | **exit 0** |
| Database-free suite | `npm run test:logic` | **1675 passed, 0 failed** (352 suites) |
| Component suite (vitest + testing-library) | `npx vitest run` | **69 passed, 0 failed** (11 files) |
| Localisation completeness | `tests/localization.test.ts` | **6 passed** — every new English string has an Arabic entry |
| Production build | `npm run build` | **exit 0** — `dist/_worker.js` 4.29 MiB |

New tests: `tests/progress-activity.test.ts` (8 — week boundaries, month/year rollover, out-of-window
activity, unreadable timestamps) and `tests/vitest/SpiralTimeline.test.tsx` (5 — one marker per record,
translated accessible names, marker opens the record's own details, candidate data not translated, empty
state).

**Browser verification** (built app served by the local dev server, signed in as the disposable QA account,
English and Arabic, 1440×900 and 390×844): **41/41 checks passed**.

- Progress: 12 statistic cards, learning counters, activity chart (8 labelled bars once activity exists),
  card → filtered destination navigation, no page overflow at either width, no console errors.
- Applications: application added, follow-up date set, overdue reminder shown and named, list search
  finds it, delete asks first and then removes the row (confirmed against the API: 0 rows remain).
- Interviews: voice-history section renders; CV Studio: preview toggle hides and restores the pane, mobile
  pane switcher present, no overflow; career page: spiral empty state is honest (the QA account holds no
  records), and the spiral's populated behaviour is covered by the component tests; Learning: "Start
  Learning" is an `https:` link to the real course.
- The QA account's interface language was set through its own preferences API for the run and restored
  afterwards. The only row created (one application) was deleted again; no other production data was
  touched.

## F. Git

| | |
|---|---|
| Branch | `main` |
| Base | `adaaeb3` (the rebrand work's latest commit) |
| My changes | `shared/progressMomentum.ts`, `src/lib/useLiveInterviewHistory.ts`, `src/components/career/SpiralTimeline.tsx`, `src/components/views/{ProgressView,ApplicationsView,InterviewsView,CVStudioView,JobsView}.tsx`, `src/translations/parts/{momentum,applications,interviews,cv}.ts`, `tests/progress-activity.test.ts`, `tests/vitest/SpiralTimeline.test.tsx`, `docs/reports/AIONVIA_FEATURE_ENHANCEMENTS_REPORT.md` |
| Logo pass | `src/assets/brand/official/aionvia-logo.png` (the supplied artwork), the regenerated `src/assets/brand/aionvia-{icon,logo}.png`, `public/brand/*`, `public/favicon.{ico,svg}`, `scripts/generate-brand-assets.mjs`, and the sizing call sites in `Logo.tsx`, `AuthModal.tsx`, `PasswordRecoveryModal.tsx`, `PublicProfileView.tsx`, `LandingView.tsx`. Every generated asset is derived by `npm run brand`; none of them is hand-edited. |
| Commit state | Uncommitted on `main` at the time of writing. Committing and deploying were not authorized by the user, and the rebrand agent was deploying `main` concurrently. |

## G. Deployment

Not performed by me, and no Cloudflare project, domain, secret or environment variable was created or
changed. The rebrand work's own deployment of commit `506c85a` to the `aionvia` Pages project is theirs;
these changes are not part of that deployment. Production therefore shows the rebranded platform without
this pass's progress/application/interview/CV refinements until these files are committed and deployed.

## H. Remaining issues

1. **Gemini Live cannot be exercised end to end** — Google refuses the ephemeral token for the bound
   service account (`ACCOUNT_STATE_INVALID`). The code path, model and API version are correct and the
   history UI is in place; a working key (or re-enabling the bound account) is required, and it must be
   added as a Pages secret by whoever owns the Google project.
2. **The spiral's populated state was verified by component test, not in the browser**, because the
   disposable QA account has no education, experience, projects or milestones. The drawing itself was
   verified in the browser in the previous QA pass; nothing in this pass changed its geometry.
3. **The "reference screenshot" issue in §3 could not be reproduced** — no screenshot was attached to this
   task. The known defects from the earlier spiral pass (marker overlap, phone overflow, raw timestamps,
   progress line, Arabic labels, translated candidate data) remain covered by the existing tests and by
   this pass's component tests.
4. **Average response time and job-source effectiveness** are not displayed because the data model has no
   transition timestamps and no source column. Adding them would need schema changes, which this pass did
   not make.
5. **The application records have no job-URL or salary columns**, so those two details cannot be shown on
   the application detail panel without a migration.
