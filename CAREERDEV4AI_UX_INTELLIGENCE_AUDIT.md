# CareerPilot AI — UX & Intelligence Audit

**Date:** 1 November 2026
**Repository:** `D:\Saas\careerpilot-ai`
**Branch:** `audit/before-supabase-migration`
**Live database:** Supabase project `ciihprsfdojzvjnqgbxl` (CareerFlow)
**Scope:** product UX, roadmap, learning resources, volunteering, AI answer quality, personalization, Arabic/RTL and mobile behaviour.

---

## 1. Executive summary

The platform was functionally broad but hard to read. A new user landing on the dashboard saw many competing panels and had to work out for themselves which one mattered. The roadmap was a dense task list rather than a plan. The learning catalogue was effectively English-only (467 courses, 100% English at the start of the audit) even for users who had chosen Arabic. Volunteering was a global/Western list with no Egypt relevance. The copilot returned raw model markdown, so answers reached the reader with `##`, `**` and `---` in them.

The work described in the companion implementation report changed the **presentation and ranking layers** without rebuilding the product, resetting data or removing routes. This audit records what was wrong, the evidence for each finding, and why each change was chosen.

---

## 2. Method

| Activity | How it was done |
| --- | --- |
| Code inspection | Read the route table, `AppShell`, dashboard, roadmap, learning, volunteer, copilot server route and context provider. |
| Live data audit | Read-only SQL against the live Supabase project (course count, language, format; volunteer count, country, links). |
| Resource verification | YouTube `oEmbed` endpoints for every playlist; live HTTP requests for every volunteering URL, before insertion. |
| Localization audit | The repository's own localization test, which fails when a `t('…')` literal has no Arabic entry. |
| Responsive/RTL audit | Same-origin iframes at 320, 390, 768 and 1000 CSS pixels; DOM measurements of `scrollWidth − clientWidth`, element rectangles and computed transforms in both `ltr` and `rtl`. |
| AI output audit | Read the copilot prompt and the client renderer; exercised the parser with malformed model output. |

No production data was deleted, no RLS policy was disabled, and no service-role key was exposed to the client.

---

## 3. Findings

### 3.1 Navigation — too many peers, no hierarchy

**Observed:** the sidebar and the mobile drawer listed every destination as one long flat list (dashboard, career, roadmap, skills, progress, learning, projects, volunteer, CV studio, jobs, applications, interviews, documents, profile, activity, settings). The bottom bar had five destinations plus a "more" button whose contents were the same flat list.

**Why it hurts:** a beginner cannot tell the difference between "My Career", "Roadmap", "Skills" and "Progress" from the labels alone. Every item has equal visual weight, so nothing reads as "start here".

**Severity:** high — it is the first thing a new user meets.

**Direction taken:** group the existing routes into five destinations (Home, Career, Learn, Career Tools, Profile). Keep every route; change only the hierarchy. The mobile bottom bar mirrors the same five groups.

### 3.2 Dashboard — many recommendations, no single next step

**Observed:** the dashboard was a grid of cards: readiness, skill gaps, roadmap preview, recommended courses, project suggestions, recent activity, notifications, quick actions. Several cards each proposed something to do.

**Why it hurts:** the product's own question — "what should I do next?" — had no single answer. A user could leave the page with five equally valid next actions and no decision.

**Severity:** high.

**Direction taken:** the page now answers exactly three questions: *where am I* (target role + readiness), *what is the one next step*, and *what can help* (the learning/project/resource that supports that step). Everything else is secondary or removed from the first screen.

### 3.3 Roadmap — a task list, not a plan

**Observed:** the roadmap rendered phases as sections of checkboxes. There was no sense of chronology, no explicit "you are here", no effort estimate per stage and no final "job ready" state. Completed tasks were mixed with upcoming ones.

**Why it hurts:** a beginner cannot see the shape of the journey or how far they have come. The page answers "what are my tasks?" instead of "where am I in the plan?".

**Severity:** high.

**Direction taken:** present the existing phases as a chronological stage timeline (Foundation → Core Skills → Practice → Job Preparation), derive the current stage from real completed tasks, cap the visible actions at five per stage, and derive a final **Job Ready** state from actual completion rather than generating a new roadmap.

### 3.4 Learning — English-only catalogue, weak format signals

**Observed (live database, before changes):**

- 467 courses, **100% English**.
- No Arabic course, playlist or video.
- The recommendation engine did not weight language or format; an Arabic-speaking beginner received the same English text articles as an English-speaking advanced user.
- The UI had no language badge or language filter.

**Why it hurts:** the target audience is Egyptian/Arab beginners. Telling them to "learn SQL" in English text when an Arabic video playlist exists is a failure of the product, not of the user.

**Severity:** critical for the stated audience.

**Direction taken:** add a verified Arabic/video catalogue, expose language and format, and make language a real ranking signal (with an explicit exception for advanced material that is genuinely better in English).

### 3.5 Volunteering — global list, no local relevance

**Observed (live database, before changes):** 37 opportunities, all global or Western organisations. No country field, no language field, no opportunity type, no deadline. An Egyptian beginner could not tell which opportunities were open to them, in Arabic, or in Egypt.

**Why it hurts:** volunteering is one of the few credible ways for a beginner to gain experience without a job. A list they cannot act on is worse than no list.

**Severity:** high.

**Direction taken:** add Egypt-focused and remote Arabic-friendly organisations with verified links, add country/language/type/deadline metadata, and rank local relevance only as a tie-breaker after skill and role fit.

### 3.6 AI answers — raw markdown, wrong shape, occasional wrong language

**Observed:**

- The copilot rendered the model's text with `whitespace-pre-wrap`, so `## Heading`, `**bold**` and `---` reached the reader literally.
- The prompt did not tell the model to answer the actual question first, to keep answers short, or to avoid markdown.
- Answers could open with a heading and a long preamble before addressing the question (for example, "أتعلم SQL منين؟" could produce a curriculum instead of a recommendation, a reason and a link).
- The client had no shared sanitisation layer; any future AI surface would have had to re-implement rendering.

**Why it hurts:** the answer is read on a phone, often in Arabic. Symbols and preambles make it slower to act on.

**Severity:** high.

**Direction taken:** a shared block parser + renderer, and prompt rules that require a direct answer first, at most one level of bullets, no headers/bold/separators, Arabic when the question is Arabic, and no invented URLs.

### 3.7 Arabic and RTL — incomplete catalogue, mixed terminology

**Observed:**

- 68 user-visible strings introduced by the new surfaces had no Arabic entry; the localization test would fail on any new `t('…')`.
- Some new labels (volunteer categories, opportunity types, country filters) were hard-coded English.
- RTL layout was broadly correct but several filter rows used `overflow-x-auto`, which hides options off-screen on a 320px phone.

**Severity:** medium–high (the Arabic experience is a core requirement, not a nice-to-have).

**Direction taken:** complete the catalogue (100% coverage), wrap filter chips instead of scrolling them, and verify RTL at 320/390/768 with real measurements.

### 3.8 Mobile — horizontal overflow and clipped controls

**Observed:**

- The Projects status filters used a horizontally scrolling row; on a 320px screen several chips sat entirely outside the viewport (`left: -47`, `left: -106`).
- The Profile action row (Preview / Share / Edit Profile) overflowed at exactly 768px in Arabic, clipping the first button by 7px.
- Decorative gradients on the Profile header extend beyond the card; they are clipped by `overflow-hidden` and do not create page overflow.

**Severity:** medium.

**Direction taken:** wrap the filters, allow the profile actions to wrap, and keep the decorative element clipped.

### 3.9 Personalization — signals existed but did not reach ranking

**Observed:** the platform already stored target role, skills, levels, preferences, saved courses, projects and roadmap progress, but the learning and volunteer rankers used only part of that state. Language preference was stored and ignored. There were role-specific special cases in places instead of a reusable scoring model.

**Severity:** high — "personalized" was mostly cosmetic.

**Direction taken:** one reusable scoring function per domain, reading the real user context; no hard-coded role branches; language and format applied as multipliers after relevance, so they break ties without promoting irrelevant content.

---

## 4. What was deliberately not changed

| Area | Reason |
| --- | --- |
| Route names and URLs | Deep links, tests and user habits depend on them. Regrouping is presentation-only. |
| Roadmap phase data | Existing progress is stored against real tasks. Regenerating would destroy it. The UI derives stages from the existing phases. |
| CV studio, job matching, applications, interviews | Outside the UX-intelligence scope; already working and covered by tests. |
| RLS policies and auth | No security change was required; none was made. |
| Existing catalogue rows | New resources are additive (`ON CONFLICT` upserts); no row was dropped or rewritten. |

---

## 5. Prioritized recommendations (all addressed unless listed as remaining)

1. **One next step on the dashboard** — highest impact on comprehension.
2. **Stage timeline with a derived "you are here"** — highest impact on motivation.
3. **Arabic/video supply plus language-aware ranking** — highest impact for the stated audience.
4. **Egypt-relevant volunteering with verified links** — highest impact on first experience.
5. **Direct-first AI answers with a shared renderer** — highest impact on trust.
6. **Navigation grouping** — highest impact on first-session orientation.
7. **Mobile/RTL overflow fixes** — necessary for the phone-first audience.

Remaining gaps are recorded in `CAREERDEV4AI_FINAL_TEST_REPORT.md` (chiefly catalogue breadth and the live Gemini quota).

---

## 6. Audit conclusion

The product did not need a rebuild. It needed a clear hierarchy, an honest single next step, a roadmap that reads as a journey, resources the audience can actually use, and an answer layer that respects the reader. Those are the changes implemented and verified in the companion reports.
