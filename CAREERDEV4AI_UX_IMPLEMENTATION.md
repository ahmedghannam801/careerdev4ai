# CareerPilot AI — UX & Intelligence Implementation

**Date:** 1 November 2026
**Companion documents:** `CAREERDEV4AI_UX_INTELLIGENCE_AUDIT.md`, `CAREERDEV4AI_FINAL_TEST_REPORT.md`

This report describes what was changed, why, and how it was verified. It covers the UX-intelligence scope: navigation, dashboard, roadmap, learning, volunteering, AI answers, personalization, Arabic/RTL and mobile. Pre-existing work in the CV pipeline and certificate areas is outside this scope and was left untouched.

---

## 1. Principles applied

1. **Additive, not destructive.** Existing routes, roadmap phases, catalogue rows and user progress are preserved. New data is inserted with `ON CONFLICT` upserts.
2. **Presentation follows the data.** The roadmap and the Job Ready state are derived from real tasks; nothing is regenerated to look better.
3. **Reusable logic, no role special-cases.** Learning and volunteering use one scoring function each, driven by the user context.
4. **Verified resources only.** Every new URL was checked live before insertion. No URL was invented.
5. **Arabic is a first-class path.** Not a translation afterthought: language is a ranking signal and the catalogue is complete.
6. **One shared answer layer.** AI formatting is parsed once and rendered by one component.

---

## 2. Navigation

**File:** `src/components/layout/AppShell.tsx`

The flat list was replaced by five groups. Every route is still reachable.

| Group | Routes |
| --- | --- |
| Home | Dashboard |
| Career | My Career, Roadmap, Skills, Progress |
| Learn | Learning, Projects, Volunteer |
| Career Tools | CV Studio, Jobs, Applications, Interviews, My Documents |
| Profile | My Profile, Recent Activity, Settings |

- The desktop sidebar and the mobile drawer both render `navGroups`, so they cannot drift apart.
- The mobile bottom bar is Home / Career / Learn / Tools / Profile / More. "More" opens the grouped drawer.
- Group labels are translated (`Home`, `Career`, `Learn`, `Career Tools`, `Profile`) and have Arabic entries.
- Drawer panels sit at the inline-start edge: LTR slides from the left, RTL from the right. The copilot and notifications drawers sit at the inline-end edge and now choose their slide direction from the interface language (LTR from the right, RTL from the left).

**Verification:** at 320 and 390 CSS pixels, in both `ltr` and `rtl`, the navigation dialog's rectangle stayed inside the layout viewport (`left ≥ 0`, `right ≤ content width`), and the same held for the copilot and notifications drawers.

---

## 3. Dashboard — three questions

**File:** `src/components/views/DashboardView.tsx`

The page now answers, in order:

1. **Where am I?** Target role, readiness percentage and label (`Building foundations` / `Almost there` / `Ready to apply`), plus the three numbers that explain the score.
2. **What is the next step?** A single Next Best Step card with *Next Step → Why → Start*. It links to the exact destination (roadmap stage, learning item or project).
3. **What can help?** Only the learning, project or resource that supports that step.

Secondary detail (full skill gaps, weekly priorities, activity) is available further down but no longer competes for the first screen.

The guided-tour hooks (`data-guide="readiness"`, `"next-action"`, `"skill-gaps"`, `"roadmap-summary"`, `"roadmap-task"`) were preserved so the existing product tour still works.

---

## 4. Roadmap — chronological stage timeline

**File:** `src/components/views/RoadmapView.tsx`

- The four existing phases are presented as stages: **Foundation → Core Skills → Practice → Job Preparation**, followed by a derived **Job Ready** state.
- Each stage shows its name, goal, effort (hours), progress (`done/total`), up to five actions, related resources and related projects.
- A stepper at the top marks **Done / You are here / Upcoming** and scrolls to a stage.
- The current stage is the first incomplete stage; it opens automatically once, and the user can open or close any stage afterwards.
- Stage progress and the Job Ready card are computed from real task statuses. No roadmap is regenerated, so completed work is never lost.
- The empty state explains that a target role is needed and links to role selection.

---

## 5. AI answer layer

### 5.1 Shared parser — `src/lib/aiResponse.ts`

`parseAiResponse(raw)` turns model text into a small block model:

- `heading` — markdown headings are demoted and stripped of `#`; a line longer than 90 characters that merely starts with `#` becomes a paragraph instead of a giant title.
- `paragraph` — wrapped lines are joined; excess whitespace collapses.
- `list` — one level of bullets or numbered steps; nested bullets are flattened to peers, never rendered as a second indent.
- `code` — fenced blocks keep their language and content; an unterminated fence still renders as code rather than leaking backticks.
- `quote` — `>` lines become quotes.
- Horizontal rules and repeated separators (`---`, `***`, `___`) are dropped.
- The function is pure and never throws; malformed input degrades to paragraphs.

`aiResponsePreview(raw, maxLength)` produces a plain-text preview with markers removed and an ellipsis on truncation. `isArabicText` detects Arabic script.

### 5.2 Renderer — `src/components/copilot/AiResponse.tsx`

Renders the block model as React elements with no raw HTML. Inline emphasis, code and links are parsed safely; links open in a new tab with `rel="noopener noreferrer"`. The copilot drawer (`CopilotDrawer.tsx`) now renders every assistant message through `<AiResponse>`.

### 5.3 Prompt rules — `app.ts` (`/api/copilot`)

The system prompt now requires:

1. Answer the actual question first, in one or two sentences.
2. Add only detail that helps the user act.
3. Write in Arabic when the question is in Arabic; keep industry-standard names in English (SQL, React, CV, ATS).
4. No markdown headers, bold asterisks, horizontal rules, tables or nested bullets.
5. Use a list only for steps or options, at most one level.
6. Name the recommended resource, say why it fits this user, and give the direct link only if the platform state contains one. Never invent a URL.
7. Keep the answer proportional to the question.
8. Never assume a technical role; use the real target role and domain.
9. Use the real platform context (target role, gaps, stage, projects), not generic advice.

The suggestion chips were localised for Arabic and English.

**Verification:** 14 unit tests cover headings, separators, nested lists, ordered steps, fenced and unterminated code, quotes, malformed input, Arabic detection and previews. Live model output could not be exercised because the Gemini free-tier daily quota was exhausted during the session (see the final test report).

---

## 6. Learning — verified Arabic/video catalogue and language-aware ranking

### 6.1 Catalogue migration

**File:** `supabase/migrations/20261102000001_arabic_video_catalog.sql`

- 38 verified playlists (26 Arabic, 12 English) inserted as course rows, with skills and role links.
- Every YouTube URL was checked against the `oEmbed` endpoint before insertion; the migration is idempotent (`ON CONFLICT` upsert) and does not delete existing rows.
- Added indexes on `courses.language` and `courses.format`.

**Live result:** 505 courses total, **26 Arabic**, **43 video/playlist** rows (26 Arabic playlists + 13 English playlists + 4 English videos).

### 6.2 Ranking — `server/learning/recommendation.ts`

The score is built from real signals, in this order:

- role relevance, role-skill match, open skill-gap match, current roadmap stage, focus skill, saved courses;
- weak signals: career goal and domain;
- generic fit: level, language, preferred format, weekly time, budget.

Language and format are applied as **multipliers after relevance**, so they break ties without promoting irrelevant content:

| Situation | Multiplier |
| --- | --- |
| Arabic interface, Arabic course | 1.00 |
| Arabic interface, English course, beginner/intermediate | 0.72 |
| Arabic interface, English course, advanced | 0.90 |
| English interface, English course | 1.00 |
| English interface, non-English course | 0.82 |
| Video or playlist | 1.05 |
| Text/article | 0.97 |

The reason text is language-aware: an Arabic user is told why an English course is still the better choice for advanced material, instead of being silently downgraded.

### 6.3 UI — `src/components/views/LearningCenterView.tsx`, `src/lib/routing.ts`

- Language badge on cards and in the detail header.
- Language filter (`All languages` / `Arabic` / `English`) stored in the URL, so it survives refresh and sharing.
- `LEARNING_LANGUAGES` added to the routing vocabulary.

---

## 7. Volunteering — Egypt focus and verified links

### 7.1 Migration

**File:** `supabase/migrations/20261102000002_volunteer_egypt.sql`

- Adds `country`, `languages`, `opportunity_type` and `deadline` to `volunteer_opportunities`.
- Inserts 12 verified Egypt-focused or remote Arabic-friendly organisations (for example Resala, INJAZ Egypt and other community, education, healthcare and humanitarian programmes). Each URL was checked with a live HTTP request before insertion.
- Additive only; existing 37 rows keep their data and receive sensible defaults.

**Live result:** 49 active opportunities, **10 with `country = 'Egypt'`**.

### 7.2 Ranking — `server/db/volunteerOpportunities.ts`

- Scores skill overlap with open gaps, target-role overlap and domain fit first.
- Egypt gets a small **+10** tie-breaker; Arabic-language opportunities get **+5**. These are applied after the skill/role signals, so local relevance never outranks a genuinely better fit.
- The reason string is written in Arabic when the account language is `ar`, read from `user_preferences`.
- DTO arrays (`skillsGained`, `requiredSkills`, `roleSlugs`, `domainIds`, `languages`) are de-duplicated before they reach React, which removes duplicate-key warnings.

### 7.3 UI — `src/components/volunteer/VolunteerOpportunities.tsx`

- Country filter (All / Egypt with count / Global) and language filter (Any / Arabic / English).
- Cards show country, language, opportunity type and deadline.
- Category and type labels are translated.
- Filter rows wrap instead of scrolling horizontally.
- Empty state explains that no opportunity matches the filters.

---

## 8. Arabic and RTL

- **Localization:** every new `t('…')` string has an Arabic entry across `src/translations/parts/{appShell,dashboard,roadmap,learning,volunteer,profile,projects}.ts`. The localization test reports **1098/1098 source strings (100%)**.
- **Terminology:** interface Arabic is used for actions and explanations; industry names stay in English (SQL, React, CV, ATS).
- **Direction:** `dir` and `lang` follow the account language. Layout uses logical utilities (`start`/`end`, `border-s`/`border-e`) so RTL mirrors correctly.
- **Drawers:** slide direction follows the inline edge in both directions.
- **Filters:** wrapped, not horizontally scrolled.

---

## 9. Mobile fixes

| Screen | Problem | Fix |
| --- | --- | --- |
| Projects | Status filters in `overflow-x-auto`; chips at `left: -47` and `left: -106` on a 320px screen | `flex-wrap`, no horizontal scroll |
| Profile | Preview / Share / Edit Profile overflowed at 768px in Arabic, clipping the first button by 7px | `flex-wrap` on the action row |
| Volunteer | Category/country filter rows scrolled horizontally | `flex-wrap` |
| Drawers | Off-screen measurement in RTL (investigated) | Confirmed correct after accounting for the scrollbar and for background-tab `requestAnimationFrame` throttling; no layout defect remained |

Measured page overflow (`documentElement.scrollWidth − clientWidth`) was **0** on dashboard, roadmap, learning, volunteer, projects, CV studio and profile at 320, 390, 768 and 1000 CSS pixels, in both LTR and RTL. The only elements extending past the viewport were the intentionally clipped decorative gradients inside `overflow-hidden` cards.

---

## 10. Personalization

- Ranking reads the live user context on every request: target role, required skills, open gaps, experience level, weekly hours, budget, preferred format, saved courses, roadmap stage, existing projects and language.
- A change to the target role, skills, level, saved course, project, roadmap task or preferences changes the recommendations on the next fetch. No role-specific branch was added.
- The dashboard's Next Best Step and the roadmap's current stage use the same underlying state as the rankers, so the three surfaces cannot disagree.

---

## 11. Security and cleanup

- `X-Frame-Options` was temporarily relaxed to `SAMEORIGIN` to allow a same-origin QA harness; it is restored to **`DENY`**.
- The QA harness (`public/qa-harness.html`) and the two temporary QA scripts were deleted.
- The temporary QA identity was deleted from Supabase Auth and confirmed absent.
- The development server was stopped; port 3000 is closed.
- No RLS policy was disabled, no service-role key is referenced in client code, and no production row was deleted.

---

## 12. Files changed in this scope

| File | Change |
| --- | --- |
| `src/components/layout/AppShell.tsx` | Grouped navigation; bottom bar; RTL-aware drawer |
| `src/components/views/DashboardView.tsx` | Three-question dashboard; single next step |
| `src/components/views/RoadmapView.tsx` | Stage timeline; derived current stage and Job Ready |
| `src/lib/aiResponse.ts` | Shared block parser and preview |
| `src/components/copilot/AiResponse.tsx` | Safe renderer |
| `src/components/copilot/CopilotDrawer.tsx` | Render answers through `AiResponse`; RTL slide |
| `src/components/notifications/NotificationsDrawer.tsx` | RTL slide |
| `app.ts` | Copilot answering rules; `X-Frame-Options: DENY` |
| `server/learning/recommendation.ts` | Language/format weighting; Arabic reasons |
| `server/db/volunteerOpportunities.ts` | Egypt/Arabic tie-breakers; DTO dedupe |
| `src/components/views/LearningCenterView.tsx` | Language badge and filter |
| `src/components/volunteer/VolunteerOpportunities.tsx` | Country/language filters; facts; wrapped chips |
| `src/components/views/ProjectsView.tsx` | Wrapped status filters |
| `src/components/views/ProfileView.tsx` | Wrapped action row |
| `src/lib/routing.ts` | `LEARNING_LANGUAGES` |
| `src/lib/personalizationApi.ts` | Volunteer DTO fields |
| `src/translations/parts/*.ts` | Arabic entries (100% coverage) |
| `supabase/migrations/20261102000001_arabic_video_catalog.sql` | 38 verified playlists |
| `supabase/migrations/20261102000002_volunteer_egypt.sql` | Metadata + 12 verified opportunities |
| `tests/ai-response.test.ts` | 14 formatter tests |
| `tests/runner.mjs` | Register the formatter tests |

---

## 13. Conclusion

The platform now answers "where am I, what next, what can help" on the first screen, presents the roadmap as a journey, offers Arabic video learning where verified material exists, surfaces Egypt-relevant volunteering, and returns clean, direct AI answers through a shared layer. The remaining gaps are supply-side (catalogue breadth) and environmental (Gemini quota), both documented in the final test report.
