# Feature Benchmark — CareerDev4AI vs. Competitors

**Research date:** 2026-11-04
**Companion document:** [`competitor-analysis.md`](./competitor-analysis.md)

---

## How to read this table

### CareerDev4AI column — strict verification rule

A CareerDev4AI capability is marked **IMPLEMENTED** **only if the implementation was located in the actual repository code during this pass**, with a file path cited. The verification covered:

- `src/components/views/*.tsx` (25 view components)
- `src/components/{ai,copilot,layout,cv,brand,ui}/*.tsx`
- `server/**` (71 TypeScript modules across `ai/`, `cv/`, `db/`, `learning/`, `projects/`, `roadmap/`, `seo/`, `admin/`, `analytics/`, `auth/`)
- `shared/*.ts` (40 shared modules)
- `src/index.css` (design tokens), `src/context/CareerContext.tsx`, `src/lib/routing.ts`
- `package.json` (dependencies)

**Status vocabulary for the CareerDev4AI column:**

| Status | Meaning |
| --- | --- |
| **IMPLEMENTED** | Code exists and was located. File path cited. |
| **IMPLEMENTED BUT WEAK** | Code exists and runs, but the implementation is thinner than the stated capability (e.g. a single view, no persistence, no charts). |
| **UI-ONLY** | The capability is rendered in the UI but has no verified backing service, schema, or persistence. |
| **BACKEND INCOMPLETE** | A server module exists, but the feature is not fully wired end-to-end. |
| **UNKNOWN** | Not verified either way. **Not** a synonym for "no". |
| **MISSING** | Searched for and confirmed absent. |
| **NOT SUITABLE NOW** | Deliberately excluded for product or technical reasons. |

### Competitor columns — honesty note

Competitor cells describe **what was observed on the competitor's marketing site on 2026-11-04** (see `competitor-analysis.md` for the method and the exact marker used in each entry). No competitor was logged into, so **authenticated product depth could not be verified** for any of them.

| Cell | Meaning |
| --- | --- |
| ✅ | Advertised and evidenced on the public page (nav entry, product section, or explicit feature list). |
| ◐ | Partially present — a related tool or a lighter version of the capability. |
| ❌ | Not found anywhere on the public page. |
| ? | Could not be determined (site offline, or the capability is behind a login). |

---

## Capability comparison table

| Capability | **CareerDev4AI** (verified in code) | Mafe Sho8l | USAM | Emekly | Careerflow | CareerExplorer | Teal | Pathrise | roadmap.sh | Coursera | WuzzufTop |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Career assessment / readiness** | ✅ **IMPLEMENTED** — `src/components/views/CareerAnalysisView.tsx`, `shared/skillGap.ts`, `shared/skillMatching.ts`, `shared/targetRoleSelection.ts`, `shared/careerDomains.ts`, `shared/careerRoles.ts` | ◐ CV grading only | ✅ Goal-intake routing + discover step | ✅ "find your ideal career path" from CV | ❌ | ✅ **Core product** — assessment → matches → library | ◐ Resume/ATS scoring | ✅ (1:1 coaching) 🔵 | ❌ | ❌ | ❌ |
| **CV tailoring / AI rewrite** | ✅ **IMPLEMENTED** — `src/components/views/CVStudioView.tsx`, `server/cv/aiAssist.ts`, `server/cv/jobDescription.ts`, `shared/cvAiAssist.ts`, `shared/atsAnalysis.ts`, `server/db/cvVersions.ts` | ✅ **Core** — AI rewrite + market-fit score | ◐ "CV story" demo | ✅ Upload CV → analysis | ✅ Resume Optimizer + AI Cover Letter | ❌ | ✅ **Core** — one resume per job, ATS checker, keyword scanner | ✅ Résumé review 🔵 | ❌ | ❌ | ◐ `/cv-builder/` |
| **Job matching** | ✅ **IMPLEMENTED** — `src/components/views/JobsView.tsx`, `shared/opportunities.ts`, `shared/careerSearch.ts`, `shared/skillMatching.ts`, `server/db/savedRoles.ts` | ✅ LinkedIn + Wuzzuf + Bayt roles | ✅ "Relevant opportunities" | ✅ Interactive global job globe | ❌ | ❌ | ◐ Tech Job Board only | ✅ 🔵 | ❌ | ❌ | ✅ `/jobs/` + AI MATCH scoring |
| **Application tracking** | ✅ **IMPLEMENTED** — `src/components/views/ApplicationsView.tsx`, `server/db/jobApplications.ts`, `server/db/applicationPackages.ts`, `server/db/coverLetters.ts` | ❌ | ◐ Enterprise/lifecycle implied | ❌ | ✅ Job Tracker + autofill + Networking tracker | ❌ | ✅ Job Application Tracker (per-stage email templates) | ✅ 🔵 | ❌ | ❌ | ✅ Job lifecycle |
| **Roadmaps** | ✅ **IMPLEMENTED** — `src/components/views/RoadmapView.tsx`, `server/roadmap/service.ts`, `shared/roadmapGenerator.ts`, `server/db/roadmap.ts`, `server/db/careerMilestones.ts` | ❌ | ✅ Learn → Earn pathing | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ **Core** — 97 roadmaps, sections→topics→links | ❌ | ❌ |
| **Learning + credentials** | ◐ **Learning IMPLEMENTED** / **Credentials UI-ONLY** — catalogue + video-first learning: `src/components/views/LearningCenterView.tsx`, `server/learning/{ai,context,recommendation}.ts`, `server/db/learning.ts`, `shared/courseProviders.ts`, `shared/learningCoverage.ts`. Certificate *availability* is recorded (`hasCertificate`, `AvailabilityValue: 'free_course_paid_certificate'`, provider tiers 1–3) but the product does not issue or verify a user credential | ❌ | ✅ Learning programmes | ❌ | ❌ | ❌ | ❌ | ❌ | ◐ Articles/guides | ✅ **Core** — professional certificates, Google Certificate, freemium certificate paywall | ✅ `/courses/` |
| **Project evidence** | ✅ **IMPLEMENTED** — `src/components/views/ProjectsView.tsx`, `src/components/views/EvidenceView.tsx`, `server/projects/{analysis,recommendation}.ts`, `server/db/evidence.ts`, `server/db/skillEvidence.ts`, `server/db/projects.ts` | ❌ | ◐ "Evidence of your work" | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Portfolio / public profile** | ✅ **IMPLEMENTED** — `src/components/views/PublicProfileView.tsx` (read-only public profile: experiences, education, certifications, skills, projects), `src/components/views/ProfileView.tsx`, `shared/profileLinks.ts`, `server/db/profileExtensions.ts` | ❌ | ❌ | ❌ | ◐ LinkedIn Optimizer (LinkedIn, not a hosted portfolio) | ❌ | ❌ | 🔵 LinkedIn Makeover | ❌ | ❌ | ❌ |
| **Interview prep** | ✅ **IMPLEMENTED** — `src/components/views/InterviewsView.tsx`, `src/data/interviewBank.ts`, `server/db/interviewSessions.ts`, `server/db/guides.ts` | ❌ | ❌ | ❌ | ✅ AI Mock Interview ("New!") | ❌ | ✅ AI Interview Practice | ✅ 🔵 Mock interviews | ✅ Interview-question links inside roadmap topics | ❌ | ❌ |
| **Mentorship / coaching** | ❌ **MISSING** — searched `src/`, `server/`, `shared/`: the only `mentor` hits are role-title keywords in career data (`shared/careerRoles.ts`) and interview-bank content (`src/data/interviewBank.ts`). No mentor entity, matching, booking or scheduling module exists | ❌ | ◐ AI guidance only | ❌ | ✅ Coach Portal (career-coach orgs) | ❌ | ❌ | ✅ **Core** — 1:1 coaching 🔵 | ❌ | ❌ | ❌ |
| **Bilingual / RTL** | ✅ **IMPLEMENTED** — 19 locale part modules in `src/translations/parts/` (plus `src/translations/index.ts` and `src/translations/sourceStrings.ts`), `src/context/CareerContext.tsx:2465` sets `root.setAttribute('dir', language === 'ar' ? 'rtl' : 'ltr')`, `src/translations/parts/aiLanguages.ts`, plus Tailwind `rtl:` variants | ✅ Bilingual, `hreflang en/ar/en-EG/ar-EG` | ◐ English-primary with an `العربية` locale toggle | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ (nav `dir="ltr"` hard-set) | ◐ i18n infra, `dir="ltr"` | ✅ **RTL-native** — `<html lang="ar" dir="rtl">`, AR/EN toggle, per-country currency & cities |
| **Admin / analytics** | ✅ **IMPLEMENTED** — `src/components/views/AdminCenterView.tsx` (announcement centre, permissions), `server/admin/permissions.ts`, `server/db/admin.ts`, `shared/admin.ts`, `server/analytics/ga4.ts`, `shared/analyticsEvents.ts`, `server/seo/*` | ❌ | ✅ Enterprise/Government tiers | ❌ | ✅ For Orgs (Universities, Coaches, Bootcamps) | ✅ For Organizations | ❌ | ❌ | ❌ | ❌ | ◐ `/post-job/` (employer side) |

---

## CareerDev4AI — capability detail

### Strongest relative position

| Capability | Evidence | Why it matters competitively |
| --- | --- | --- |
| **Bilingual / RTL** | `src/translations/parts/` (19 locale modules), `src/context/CareerContext.tsx:2465`, `src/translations/parts/aiLanguages.ts` | **No competitor in the set ships Arabic + English at parity.** WuzzufTop is Arabic-only; USAM is English-first; the other eight are English-only. This is the clearest structural advantage. |
| **Roadmaps** | `src/components/views/RoadmapView.tsx`, `server/roadmap/service.ts`, `shared/roadmapGenerator.ts` | Only roadmap.sh does this well, and it has no assessment, CV or jobs product around it. CareerDev4AI connects it to a skill gap. |
| **Project evidence** | `src/components/views/ProjectsView.tsx`, `src/components/views/EvidenceView.tsx`, `server/db/evidence.ts`, `server/db/skillEvidence.ts` | **No competitor does this at all.** Mafe Sho8l, Teal and Careerflow stop at the CV; nothing lets a user build a verifiable skill record from delivered work. |
| **Career graph** | `shared/skillGap.ts` → `shared/skillMatching.ts` → `shared/roadmapGenerator.ts` → `shared/learningCoverage.ts` → `shared/opportunities.ts`; `src/components/views/MyCareerView.tsx`, `src/components/views/CareerPlanView.tsx` | Every competitor is a bag of independent tools. This connected model is the "career operating system" claim made real. |
| **Portfolio** | `src/components/views/PublicProfileView.tsx` | Competitors route portfolios to LinkedIn (Careerflow) or don't offer one. A first-party, evidence-backed public profile is different. |

### Weaknesses confirmed during verification

| Area | Finding | Status |
| --- | --- | --- |
| **Mentorship** | No mentor entity, no matching, no booking, no scheduling anywhere in `src/`, `server/`, `shared/`. | **MISSING** |
| **Analytics / charting** | No charting library in `package.json`. `src/components/views/ProgressView.tsx` computes aggregates (roadmap %, mastered skills, completed projects, active applications) and renders **progress bars only**. There are no charts, funnels, time series, or trend views anywhere in `src/`. `server/analytics/ga4.ts` collects site traffic for admin, but there is no user-facing analytics visualisation. | **IMPLEMENTED BUT WEAK** — progress bars only, no charts |
| **Credentials** | `shared/courseProviders.ts` records whether a course offers a certificate, and `LearningCenterView.tsx:360,772-781` surfaces a "With a Certificate" rail and the `free_course_paid_certificate` availability bucket. There is **no issuance, storage, verification, share, or badge** for a credential the *user* earned. | **UI-ONLY** for user credentials |
| **Application tracking depth** | `server/db/jobApplications.ts` and `server/db/applicationPackages.ts` exist and `src/components/views/ApplicationsView.tsx` renders the list. But the reviewed evidence shows a stage-based list, **not** the Kanban board + funnel that competitors and open-source trackers converge on. | **IMPLEMENTED BUT WEAK** |
| **Roadmap depth** | `server/roadmap/service.ts` and `shared/roadmapGenerator.ts` generate roadmaps, but the structure is roadmap → phases → milestones → tasks (`src/components/views/ProgressView.tsx:9-10` reads `roadmapPhases.flatMap(p => p.milestones.flatMap(m => m.tasks))`). It is **not yet** the roadmap.sh-style roadmap → section → topic → *link* model, so a roadmap item cannot yet be a course, an article or an interview question. | **IMPLEMENTED BUT WEAK** |
| **Charts / dataviz** | Grep across `src/` for `recharts|Chart|donut|sparkline` returned **no charting usage**. All quantitative display is via `AnimatedProgress` bars and inline SVG. | **MISSING** (as a capability; not a bug) |

### Notes on specific competitor cells

- **Pathrise column** is marked 🔵 throughout because `pathrise.com` returned Cloudflare error 1014 and could not be loaded. Capability claims in that column come from secondary sources only and are **not** first-party verified.
- **Coursera's learning + credentials** cell is ✅ based on the delivered page configuration containing live experiment namespaces `GoogleCertificate` and `ProfessionalCertificates` (including `isVlpRedirectForFreemiumModelRolloutGAEnabled`) plus the `/courses` navigation. The rendered homepage hero was not observed (JS-rendered).
- **CareerExplorer's "800+ careers" / "1,000+ careers and degrees"** and **WuzzufTop's "28+ active jobs / 380 partner companies / 94% match rate"** are 🟡 vendor claims read on the page, not audited facts. They are recorded as capabilities existing, not as verified magnitudes.
- **Teal's ATS checker, keyword scanner and job-description match** are evidenced by explicit nav/tool-list entries (`Resume ATS Checker`, `Resume Keyword Scanner`, `Resume Job Description Match`).
- **Careerflow's Coach Portal** is evidenced by the footer product list and is a *marketplace for career coaches*, not a mentorship feature for the end user.

---

## Summary scorecard

Legend: ●●● strong (core product, evidenced) · ●●○ present and credible · ●○○ light / limited · ○○○ absent · ? unverifiable

| Capability | CareerDev4AI | Best-in-set competitor |
| --- | --- | --- |
| Career assessment / readiness | ●●○ | CareerExplorer ●●● |
| CV tailoring | ●●○ | Teal ●●● |
| Job matching | ●●○ | Emekly / WuzzufTop ●●● |
| Application tracking | ●●○ | Careerflow / Teal ●●● |
| Roadmaps | ●●○ | roadmap.sh ●●● |
| Learning + credentials | ●●○ | Coursera ●●● |
| Project evidence | ●●● | **Nobody ●●●** — CareerDev4AI leads |
| Portfolio | ●●● | Nobody ●●● — CareerDev4AI leads |
| Interview prep | ●●○ | Careerflow / Teal ●●○ |
| Mentorship | ○○○ | Pathrise ●●● 🔵 (offline) |
| Bilingual / RTL | ●●● | WuzzufTop ●●○ (Arabic only) — **CareerDev4AI leads at parity** |
| Admin / analytics | ●●○ | USAM / Careerflow ●●○ |

**Three places CareerDev4AI already leads the set:** project evidence, first-party portfolio, and true bilingual/RTL parity.

**Two places it is behind and the gap is closable:** charting/analytics (no library installed) and mentorship (no data model at all).
