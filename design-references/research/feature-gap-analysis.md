# Feature Gap Analysis — CareerDev4AI

**Research date:** 2026-11-04
**Companion documents:** [`competitor-analysis.md`](./competitor-analysis.md) · [`feature-benchmark.md`](./feature-benchmark.md) · [`ux-analysis.md`](./ux-analysis.md) · [`visual-decisions.md`](./visual-decisions.md)

---

## How to read this table

**CareerDev4AI status** — one of:
`IMPLEMENTED` (with file path) · `IMPLEMENTED BUT WEAK` · `UI-ONLY` · `BACKEND INCOMPLETE` · `MISSING` · `NOT SUITABLE NOW`

Every `IMPLEMENTED` and `IMPLEMENTED BUT WEAK` cell cites a file path verified in this pass across `src/`, `server/`, `shared/` and `package.json`.

**Priority** — six independent judgements, each `High` / `Med` / `Low`:

| Code | Dimension | Question it answers |
| --- | --- | --- |
| **UV** | User value | How much does this improve a job seeker's outcome? |
| **CA** | Competitive advantage | Does it create a position competitors cannot copy quickly? |
| **TF** | Technical feasibility | Can it be built well with the current stack (React 19, TS, Vite, Tailwind v4, Supabase, Express, Gemini)? |
| **DA** | Data availability | Does CareerDev4AI already hold the data needed? |
| **IR** | Implementation risk | How likely is this to break, regress or destabilise? |
| **MC** | Maintenance cost | Ongoing cost of running and keeping it correct. |

*Note on IR and MC: `High` IR / `High` MC mean **bad** — the feature is risky and expensive to keep. Read those two columns as costs, the other four as benefits.*

**Competitor source URLs** are given inline. All competitor observations are from 2026-11-04; nine sites loaded, `pathrise.com` was offline (🔵 secondary only).

---

## Gap table

| # | Capability | Competitors that do it well | CareerDev4AI status | UV | CA | TF | DA | IR | MC | Recommended approach |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| G1 | **Application pipeline view (Kanban + funnel)** | Careerflow (https://www.careerflow.ai/), Teal (https://www.tealhq.com/), CareerExplorer — *For Orgs* (https://www.careerexplorer.com/) | **IMPLEMENTED BUT WEAK** — `src/components/views/ApplicationsView.tsx`, `server/db/jobApplications.ts`, `server/db/applicationPackages.ts` exist and persist stages, but the view is a stage-based list, not a board | High | High | High | High | Med | Med | **Do this next.** Add a Kanban board to `ApplicationsView` with drag-to-change-stage and a "Move to" menu for keyboard/touch (the pattern both the open-source trackers and Careerflow converge on). Add a funnel (applied → screening → interview → offer). Reuse the existing stage enum; **no schema change needed.** Keep the list view as the source of truth, as `NextRole` does — the board is a projection over the same records. |
| G2 | **Charts & analytics visualisation** | roadmap.sh (https://roadmap.sh/), Careerflow (https://www.careerflow.ai/), Teal (https://www.tealhq.com/) | **MISSING** as charts; **IMPLEMENTED BUT WEAK** as progress bars — `src/components/views/ProgressView.tsx` computes roadmap %, mastered skills, completed projects and active applications, but `package.json` has **no charting library** and `src/` contains **no** chart code | High | Med | Med | High | Med | Med | Add a lightweight charting dependency and build **one** chart first: an applications-over-time + funnel pair in `ProgressView`. Follow the chart rules in `visual-decisions.md` §10 (no gridlines, zero-based axes, text alternative + hidden data list, ≤5 hues). **Defer** a full analytics suite. |
| G3 | **Roadmap → section → topic → link model** | roadmap.sh (https://roadmap.sh/) | **IMPLEMENTED BUT WEAK** — `src/components/views/RoadmapView.tsx`, `server/roadmap/service.ts`, `shared/roadmapGenerator.ts` produce roadmap → phase → milestone → task (`src/components/views/ProgressView.tsx:9-10` reads `roadmapPhases.flatMap(p => p.milestones.flatMap(m => m.tasks))`) | High | High | Med | Med | Med | Med | **High leverage.** Change the leaf from "task" to "**link**", where a link is a course (from `shared/courseProviders.ts`), an interview question (from `src/data/interviewBank.ts`), a project (from `server/projects/`) or an article. A roadmap item then *does something* instead of only being checked off. Requires a schema migration on the roadmap table. |
| G4 | **Credential issuance & verification** | Coursera (https://www.coursera.org/), WuzzufTop `/courses/` (https://wuzzuftop.com/) | **UI-ONLY** — `shared/courseProviders.ts` records whether a course has a certificate (`hasCertificate`, `AvailabilityValue: 'free_course_paid_certificate'`, provider tiers 1–3) and `src/components/views/LearningCenterView.tsx:360,772-781` renders a "With a Certificate" rail, but **nothing issues, stores, verifies or shares a credential the user earned** | Med | Med | Med | Low | Med | Med | Add a `certificates` table storing provider, course, issued date, and a verification URL/ID; surface it in `PublicProfileView` (which already has a `PublicCertification` type). This is cheap because the profile model already expects certifications — **the schema is half-built**. |
| G5 | **Mentorship / coaching** | Pathrise (🔵 https://techinterview.org/pathrise-shutting-down/), Careerflow "Coach Portal" (https://www.careerflow.ai/) | **MISSING** — searched `src/`, `server/`, `shared/`: the only `mentor` hits are role-title keywords (`shared/careerRoles.ts`) and interview-bank content (`src/data/interviewBank.ts`). **No mentor entity, matching, booking, scheduling or messaging module exists** | Med | High | Low | Low | High | High | **Do not build a human-mentor marketplace.** Pathrise's coaching business shut down (🔵) — that is the documented failure mode of this exact model, and human supply is a cost the product cannot carry. Instead, ship **AI coaching** via the existing `src/components/copilot/CopilotDrawer.tsx`, with a *mentor persona* mode. Revisit human review only as a small, explicitly-priced add-on. |
| G6 | **No-account first value / public free tool** | Mafe Sho8l `/try` + `/sample-report` (https://mafeshsho8l.com/), Careerflow free-tools list (https://www.careerflow.ai/), CareerExplorer free test (https://www.careerexplorer.com/) | **MISSING** — no public, unauthenticated result route was found in `src/lib/routing.ts`; the landing page (`src/components/views/LandingView.tsx`) shows product marketing but not a live result | High | High | Med | High | Med | Med | Expose a **public readiness check** backed by `shared/skillGap.ts` / `shared/skillMatching.ts`: a visitor uploads a CV or picks a target role and gets a real score + 3 gaps, with no account. Cap at 3 uses and show the limit up front, exactly as Mafe Sho8l does. Existing SEO infrastructure (`server/seo/publicPages.ts`, `server/seo/jsonld.ts`) already supports public pages. |
| G7 | **Trust centre, accessibility page, AI-limits disclosure** | USAM `/trust`, `/ai-use`, `/privacy-requests` (https://usamif.com/); CareerExplorer `/accessibility` (https://www.careerexplorer.com/) | **MISSING** — `shared/legal.ts` and `server/legal.ts` exist and a Terms page is published, but no `/trust`, `/accessibility` or `/ai-use` route was found in `src/lib/routing.ts` | Med | Med | High | High | Low | Low | **Cheapest high-trust win in the table.** Add `/trust` (data use, AI limits, child-safety posture), `/accessibility` (bilingual + RTL statement), and an AI-limits FAQ block. Route + copy only; no schema work. Especially valuable for a product making AI-ranked career recommendations. |
| G8 | **Score explainability** | Emekly (https://emekly.com/), WuzzufTop "AI MATCH" (https://wuzzuftop.com/) | **IMPLEMENTED BUT WEAK** — `shared/skillMatching.ts` and `shared/skillGap.ts` compute match and gap data, but `src/components/views/JobsView.tsx` / `src/components/views/CareerAnalysisView.tsx` surface them as bare numbers; there is no per-criterion breakdown | High | High | High | High | Low | Low | Render every score as a **labelled match bar** (`visual-decisions.md` §6.3) with the top 3 contributing factors and the single biggest fix. Explainability is what makes an AI recommendation acceptable — and it is close to free, because the data already exists. |
| G9 | **Career-graph visualisation** | roadmap.sh (https://roadmap.sh/), CareerExplorer Library (https://www.careerexplorer.com/) | **PARTIAL** — `src/components/views/MyCareerView.tsx` and `src/components/brand/CareerJourneyVisual.tsx` exist; `shared/` provides the graph's edges (`skillGap`, `skillMatching`, `roadmapGenerator`, `learningCoverage`, `opportunities`). No interactive graph view was found | Med | High | Med | High | Med | Med | Turn the static `CareerJourneyVisual` into an interactive node graph where skills → learning → projects → evidence → roles are visible edges. This is **the** visual expression of "career operating system" and the clearest differentiator vs. every tool-bag competitor. Reuse the existing shared modules; the data layer is already there. |
| G10 | **Filter chips + ⌘K search in catalogues** | roadmap.sh (https://roadmap.sh/), Teal (https://www.tealhq.com/) | **PARTIAL** — `src/components/layout/GlobalSearchModal.tsx` exists (global ⌘K), but `src/components/views/RoadmapView.tsx` and `src/components/views/LearningCenterView.tsx` have no `aria-pressed` filter-chip row | Med | Med | High | High | Low | Low | Add `aria-pressed` filter chips (theme, status, provider, free/paid) to `RoadmapView` and `LearningCenterView`, following roadmap.sh's `rounded-full h-8` chip pattern. Extend `GlobalSearchModal` to index learning resources and saved roles, not just the app shell. |
| G11 | **Chat-first / conversational entry** | WuzzufTop "زكي" assistant (https://wuzzuftop.com/), USAM "Ask USAM" (https://usamif.com/), Emekly (https://emekly.com/) | **IMPLEMENTED** — `src/components/copilot/CopilotDrawer.tsx`, `src/components/ai/AIProcessingModal.tsx`, `server/ai/careerContext.ts`, `server/ai/quota.ts`, `src/translations/parts/aiLanguages.ts` | High | Med | High | High | Med | Med | The capability exists; the **entry point** is the gap. Add a "Start with the assistant" CTA on the landing page and in `OnboardingView`, so the copilot is the first thing a new user meets, not a hidden drawer. |
| G12 | **Copilot context pins / receipts** | B2B copilot pattern (https://apptension.com/guides/building-ai-copilots-inside-b2b-saas-ux-patterns-permissions-and-workflow-automation-using-a-starter-kit) | **MISSING** — `server/ai/careerContext.ts` builds context server-side, but no UI surfaces *which* CV, job or roadmap item the AI is currently using | High | Med | Med | High | Med | Med | Add a context strip to `CopilotDrawer`: the active CV, the target role, the selected job — each removable. Also add "explain with receipts": list the records used. This prevents the classic "what does *this* mean?" failure when a career graph has dozens of entities. |
| G13 | **Conversational → action handoff** | https://www.parallelhq.com/blog/llm-chat-ux-patterns | **MISSING** — no route or action bridge was found from the copilot to the core workspaces | High | Med | Med | High | Med | Med | Every copilot answer should end in a real destination: "Open in CV Studio", "Add to roadmap", "Track this application". Without this the copilot is a chatbot bolted onto an OS; with it, it *is* the OS's interface. |
| G14 | **Native mobile app** | Mafe Sho8l iOS + Android (https://mafeshsho8l.com/), Coursera iOS/iPad/Android (https://www.coursera.org/) | **IMPLEMENTED** — `package.json` includes `@capacitor/android` ^8.5.3, `@capacitor/core`, `@capacitor/app`, `@capacitor/browser`, `@capacitor/splash-screen`, `@capacitor/cli`; `capacitor.config.ts` wraps the deployed web build unchanged | Med | Med | High | High | Med | Med | Already done. The remaining work is **not** the shell but the *mobile UX* (see `ux-analysis.md` §1, D-series). Priority is **Low** — do not gold-plate. |
| G15 | **Local currency / regional pricing** | Mafe Sho8l EGP tiers (https://mafeshsho8l.com/), WuzzufTop 7-country currency (https://wuzzuftop.com/), Careerflow geo-IP pricing (https://www.careerflow.ai/) | **MISSING** — no pricing surface was found in `src/components/views/`; `shared/` has no currency module | Med | High | High | Low | Low | Med | Add EGP (and optionally AED/SAR) pricing display and a currency preference in `SettingsView`. Cheap, and it is table stakes for the Egyptian market. |
| G16 | **Interview practice with recording / feedback loop** | Careerflow "AI Mock Interview" (https://www.careerflow.ai/), Teal "AI Interview Practice" (https://www.tealhq.com/) | **IMPLEMENTED BUT WEAK** — `src/components/views/InterviewsView.tsx`, `src/data/interviewBank.ts` (question bank), `server/db/interviewSessions.ts` (session persistence) exist. No recording or scoring loop was found | High | Med | Med | High | Med | Med | The question bank and session persistence are done. Add a **structured self-assessment**: after each question, the user records or types their answer and scores against a model answer rubric already implied by `interviewBank.ts`. The AI is already available via `server/ai/`. |
| G17 | **Notification / reminder engine for applications** | Careerflow (https://www.careerflow.ai/), Teal per-stage email templates (https://www.tealhq.com/), open-source trackers | **IMPLEMENTED BUT WEAK** — `server/db/notifications.ts` exists and announcements are surfaced on the dashboard, but no per-application follow-up/reminder scheduling was found | High | Med | Med | Med | Med | Med | Extend `server/db/notifications.ts` with a per-application next-action date surfaced in `ApplicationsView` and the dashboard. Teal's per-stage template model is a good, simple spec. |
| G18 | **Volunteer / impact opportunities** | USAM (https://usamif.com/), WuzzufTop `/freelance/` (https://wuzzuftop.com/) | **IMPLEMENTED** — `src/components/views/VolunteerView.tsx`, `server/db/volunteer.ts`, `server/db/volunteerOpportunities.ts` | Med | Med | High | High | Low | Med | Differentiator. **No competitor in the set has a volunteer-evidence loop.** Keep it; position it in the portfolio as "impact evidence", not as a second job board. |
| G19 | **Per-job CV variants (one CV per job)** | Teal (https://www.tealhq.com/), Mafe Sho8l (https://mafeshsho8l.com/), Careerflow (https://www.careerflow.ai/) | **IMPLEMENTED BUT WEAK** — `server/db/cvVersions.ts` and `server/cv/jobDescription.ts` exist and `src/components/views/CVStudioView.tsx` + `src/components/cv/JobDescriptionPanel.tsx` wire them, but the "one CV per application" *product model* (a variant bound to an application, tracked with its match score) is not visible in the views | High | High | High | High | Med | Med | Bind a CV version to an application row and show its match score inside `ApplicationsView`. The data layer already supports it — this is a product-modelling change, not a build. |
| G20 | **Bilingual parity across all content** | *No competitor does this.* WuzzufTop is Arabic-only (https://wuzzuftop.com/); USAM is English-first (https://usamif.com/); the rest are English-only | **IMPLEMENTED** — 19 locale modules in `src/translations/parts/` (plus `src/translations/index.ts` and `src/translations/sourceStrings.ts`), `src/context/CareerContext.tsx:2465` sets `dir`, `src/translations/parts/aiLanguages.ts` | High | High | High | High | Med | Med | **The moat.** Protect it: add a CI check that every key in `src/translations/parts/` exists in both `en` and `ar`, and that no user-facing string is hard-coded in a view. |
| G21 | **Social proof / testimonials** | Teal "4M users" 🟡, Careerflow "2M+" 🟡, CareerExplorer "400M questions" 🟡, USAM (https://usamif.com/) | **MISSING** — no testimonials or usage metrics surface was found | Low | Low | High | Low | Low | Low | **Do not fabricate.** Prefer verifiable in-product proof (the user's own readiness score, their own evidence) over borrowed counts. Add testimonials only once they are real and consented. |
| G22 | **Nav badges for new/revised surfaces** | Careerflow "New!" / "Trending" (https://www.careerflow.ai/) | **MISSING** — `src/components/layout/AppShell.tsx:119-174` defines nav groups with `{ id, label, icon }` only | Low | Low | High | High | Low | Low | Add an optional `badge` to the nav item type, driven by a feature-flag list. Low effort, helps a 20-route app stay navigable as surfaces change. |
| G23 | **Public profile discovery / SEO** | — (no competitor in the set ships a first-party public profile; Careerflow routes to LinkedIn) | **IMPLEMENTED** — `src/components/views/PublicProfileView.tsx` (read-only public profile with experiences, education, certifications, skills, projects), route `#/profile/<username>` readable without a session (`src/lib/routing.ts:13,106-110`), `server/seo/publicPages.ts` | Med | High | High | High | Med | Med | **Ship it and market it.** Add a share button and OG meta for the profile route (`server/seo/config.ts` already exists), and make the profile the top-of-funnel artefact. This is the one artefact that makes "evidence" visible outside the product. |

---

## Priority summary

### Tier 1 — do now (high value, data already exists, low risk)

| # | Item | Why now |
| --- | --- | --- |
| **G8** | Score explainability | The data exists in `shared/skillMatching.ts`. Turns a number into a decision. |
| **G7** | Trust centre / accessibility / AI-limits | Route + copy only. Directly supports the AI-ranked-recommendations promise. |
| **G1** | Application Kanban + funnel | No schema change needed — the stages are already persisted. |
| **G19** | Bind CV versions to applications | `server/db/cvVersions.ts` already exists; this is product modelling, not a build. |
| **G10** | Filter chips + catalogue search | `GlobalSearchModal.tsx` already exists. |

### Tier 2 — do next (larger, but high leverage)

| # | Item | Why now |
| --- | --- | --- |
| **G3** | Roadmap leaf becomes a "link" | Turns the roadmap from a checklist into a navigation surface. Requires a migration. |
| **G2** | Charts (one, not a suite) | Install a library; build the applications funnel. Restraint is the point. |
| **G6** | Public no-account readiness check | The strongest acquisition pattern in the competitor set; the SEO infrastructure already exists. |
| **G9** | Interactive career graph | The visual proof of "career operating system". Data layer already present. |
| **G12 + G13** | Copilot context pins + action handoff | Turns the copilot from a chatbot into the OS's interface. |

### Tier 3 — deliberate, later

| # | Item | Why later |
| --- | --- | --- |
| **G4** | Credential issuance | Profile model already expects `PublicCertification`; finish it when the learning catalogue matures. |
| **G15** | Regional currency | Cheap but not differentiating — do it when pricing is decided. |
| **G16** | Interview feedback loop | Question bank and session persistence are done; the scoring rubric is the work. |
| **G17** | Application reminders | `notifications.ts` exists; scheduling is the addition. |
| **G22** | Nav badges | Polish, not capability. |

### Explicitly not building

| # | Item | Reason |
| --- | --- | --- |
| **G5** | Human mentorship marketplace | 🔵 Pathrise operated this exact model and shut down (https://techinterview.org/pathrise-shutting-down/). Human supply is a cost the product cannot carry. Ship AI coaching instead. |
| **G21** | Fabricated social proof | Never ship a metric that is not measurable. |
| **G22 (as a vanity metric)** | "Users" and "questions answered" counters | CareerExplorer's "400M questions answered" 🟡 is a vanity number with no bearing on career outcomes. |

---

## Cross-cutting observation

The **strongest pattern** across this whole table: in G1, G3, G8, G9, G12, G13 and G19, the **data layer already exists** — `server/db/`, `shared/skillGap.ts`, `shared/skillMatching.ts`, `shared/roadmapGenerator.ts`, `server/db/cvVersions.ts` — and only the *presentation* is missing.

CareerDev4AI's competitive position is therefore not a backend gap. It is a **surface gap**: the product computes a connected career graph and then presents it as a set of separate screens with bare numbers. The competitors' weaknesses are all in the same place — they compute less and present more. The fastest way to win this market is to present the graph that has already been built.
