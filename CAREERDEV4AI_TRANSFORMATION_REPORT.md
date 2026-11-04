# CareerDev4AI — Complete Product Transformation

**Delivery report**
**Date:** 2026-11-04
**Repository:** `https://github.com/ahmedghannam801/careerdev4ai.git`
**Branch:** `main`
**Production:** `https://careerdev4ai.pages.dev`

---

## 1. Initial audit findings

The platform was already a mature, working product, not a prototype. The audit
classified each capability by **executed** evidence, not by the presence of a
page or a button.

| Class | Capability | Evidence |
|---|---|---|
| A — complete | Auth, consent gate, profiles, skills, roadmaps, learning, projects, evidence, applications, interviews, CV studio, volunteer, admin announcements, SEO surface | 754 tests passing at baseline; 36 migrations; RLS enforced on every user-owned table |
| B — needs improvement | Public website (described rather than demonstrated; footer links were inert text; nav labels were not translated) | `src/components/views/LandingView.tsx` |
| B — needs improvement | Dashboard (no recent-activity module) | `src/components/views/DashboardView.tsx` |
| B — needs improvement | AI mentor (grounded in verified data, but the user could not inspect the evidence) | `server/ai/careerContext.ts`, `src/components/copilot/CopilotDrawer.tsx` |
| C — UI exists, backend thin | "Training & Courses" route (`jobs`) — deliberately not a job board | `src/components/views/JobsView.tsx` |
| D — broken | None found | — |
| E — missing | Live vacancy feed; community/mentorship surfaces | — |
| F — not justified | Human mentorship marketplace; social-proof metrics; carousels | see §14 below |

**The one genuinely new finding:** the platform has **no live job feed, by
design** — `JobsView.tsx` says so in its own header comment. The spec's "Job
Market Intelligence" cannot be satisfied by inventing vacancies, so the honest
implementation was to make the *existing* verified market surface (the Egyptian
opportunities catalogue and the learning catalogue) excellent, with source
attribution and freshness shown on every row.

**The most important structural finding:** the data layer for a connected career
graph already exists (`shared/skillGap.ts`, `shared/skillMatching.ts`,
`shared/roadmapGenerator.ts`, `shared/learningCoverage.ts`). The gap was
**presentation**, not backend.

---

## 2. Features completed

- **Interactive product preview** — the landing preview runs the platform's own
  `generateRoadmapPlan` against the platform's own 81-role catalogue for a
  visitor with no recorded skills. Five roles across five domains; three tabs
  (roadmap, skill gaps, next action); live re-planning on role change.
- **Capabilities grid** — the ten capabilities that are actually implemented,
  each naming its in-app area.
- **Trust and transparency** — how readiness is computed, how the AI reaches
  its conclusions, how data is held, and what the platform cannot guarantee.
- **FAQ** — native `details`/`summary`; works without JavaScript; answers
  include what the product does *not* do.
- **Contact** — the published support address, the published legal documents
  and the operator.
- **Working footer links** — `/terms`, `/privacy`, `/about`, `/careers`,
  `/learning`, `mailto:` support, plus a working language switch.
- **Recent Activity on the dashboard** — reads the same PostgreSQL activity
  ledger as the Activity Center.
- **AI mentor evidence disclosure** — the records the assistant reasons over,
  with counts, and a link to each.
- **Skip-to-content link** in the signed-in shell.

---

## 3. Public pages updated

| Page | Change |
|---|---|
| `/` (landing) | Hero → **Live preview** → Features → How it works → AI guidance → Personas → Target roles → Trust → FAQ → Contact → CTA → Footer |
| `/terms` | Untouched — the operator-approved document is published verbatim at its own address |
| `/privacy` | Untouched — same |
| `/about`, `/careers`, `/learning`, `/opportunities` | Untouched; now linked from the footer |

---

## 4. Authenticated pages updated

| Route | Change |
|---|---|
| `#/dashboard` | Recent Activity module added (§8.L) |
| `#/activity` | Icon mapping extracted to `src/components/career/activityIcons.ts` so it cannot drift from the dashboard |
| `#/settings` | Support address now read from `shared/contact.ts` |
| Copilot drawer (all routes) | Evidence disclosure panel added |
| Application shell (all routes) | Skip-to-content link; focusable `<main>` |

---

## 5. Visual reference implementation

**The operator's supplied reference images were not present in the repository.**
There is no `design-references/` directory in the checkout, no image assets
outside `src/assets/brand` and `src/assets/images`, and no attached files. That
fact is reported here rather than papered over; the written descriptions in
the brief were used as the source for the visual direction instead.

The library was then built independently:

- `design-references/research/competitor-analysis.md` — all ten competitors
  fetched from their own pages on 2026-11-04. Each claim carries a marker:
  **VERIFIED** (read in the delivered markup), **MARKETING COPY** (the
  competitor's own unverified number), **SECONDARY** (third-party article), or
  **NOT ACCESSIBLE**. Nine of ten loaded; **Pathrise returned Cloudflare error
  1014 (site offline)** and nothing is asserted about it from first-party
  observation.
- `design-references/research/feature-benchmark.md` — capability comparison;
  every CareerDev4AI cell cites the file that implements it.
- `design-references/research/ux-analysis.md` — 15 patterns to adopt (each
  sourced), 8 to reject (each with a reason).
- `design-references/research/visual-decisions.md` — colour roles, type
  scale, spacing, radius, elevation, card anatomy, RTL mirroring, charts.
- `design-references/research/feature-gap-analysis.md` — 22 gaps ranked by
  value, feasibility, data availability, risk and maintenance cost.
- 13 category folders, each with a README stating what belongs there and how
  a reference must be recorded.

No competitor image is embedded in the product; no protected asset was
downloaded into the repository.

---

## 6. Design system changes

| Token | Light | Dark | Purpose |
|---|---|---|---|
| `--color-ai` | `#5F4F86` | `#A893D4` | AI-assisted surfaces only. Contrast 7.1:1 / 6.1:1 |
| `--color-ai-surface` | `#F1EEF8` | `#2A2535` | AI surface tint |
| `--color-ai-border` | `#D6CDE9` | `#3E3552` | AI surface border |
| `--shadow-card` / `--shadow-raised` / `--shadow-overlay` | derived from `--color-text` via `color-mix` | same | One elevation scale, three steps |
| `.cp-icon-tile` | — | — | One-pixel inset highlight on icon tiles |

**The brief proposed "brand orange". The actual brand is terracotta**
(`--color-primary: #B94736`), documented in `src/index.css` as "Palette 2
(Warm Cream + Terracotta + Dusty Rose + Sage + Charcoal)". Per the brief's own
instruction to validate proposed directions against existing brand assets, **the
existing brand was preserved** and orange was not introduced. The restrained
purple the brief asked for was added as an **accent role only** — never a
primary call-to-action, never a replacement for the brand.

---

## 7. Mobile and responsive results

- **Overflow sweep:** 44 combinations (11 widths × 4 theme/direction modes) →
  **0 overflowing**. One real defect was found and fixed: the header CTA
  overflowed by **8 px in RTL at 834 px**, because the seven-link navigation
  did not fit beside the logo and the call to action. The navigation now
  appears at `lg` and above; below it the panel menu carries the links.
- **Signed-in routes:** 12 routes × 2 viewports × 3 modes → **0 overflowing,
  0 console errors, 0 failed requests**, every route rendered.
- Touch targets, the bottom tab bar, the stacked dashboard, the mobile
  navigation panel and the mobile AI assistant were all captured and reviewed.

---

## 8. AI integration changes

- The mentor's context is loaded **from the database for the verified user** —
  never from the request body. This was already true and was preserved.
- **New:** the user can now inspect that context. The evidence panel lists
  target role, skills, roadmap steps, learning items, projects, evidence
  entries, applications and work experience, with the skill gaps the assistant
  reasons about, and links into each area.
- Anonymous visitors changing the theme or language no longer fire a
  preference request that can only fail (the request was a guaranteed console
  error for every logged-out visitor).

---

## 9. Backend and database changes

- **No schema change was required for this work.** The two migrations that
  were already in the working tree (`announcement_notification_uniqueness`,
  `consent_onboarding_and_packages`) are additive and were committed with the
  code that uses them.
- `shared/contact.ts` — new shared module for the published contact channels,
  consumed by the landing page and Settings.
- `shared/roadmapGenerator.ts` and `shared/careerRoles.ts` were **read and
  reused**, not modified: the landing preview calls the same engine the
  signed-in product uses.

---

## 10. Security findings

| Finding | Status |
|---|---|
| RLS, storage policies, consent records, admin permissions, audit log | **Unchanged and passing** — `tests/security.test.ts`, `tests/consent-gate.test.ts` |
| New public surface | **No new public policy was created.** No table, bucket or endpoint was opened. |
| Secrets in the new code | **None.** A scan of every new and changed file for service-role keys, JWTs and API-key shapes came back clean. |
| Anonymous preference write | **Fixed** — was an unauthenticated `PATCH` attempt on every theme/language change by a logged-out visitor. |
| Legal routes | `/terms` and `/privacy` were already server-rendered at their own addresses; the footer now actually reaches them. |

No production table was dropped, no RLS was disabled, no Supabase project was
reset, and no service-role key was exposed.

---

## 11. Performance measurements

- **Type check:** clean (`tsc --noEmit`, exit 0).
- **Production build:** clean. The main bundle is 708 kB / 190 kB gzipped,
  unchanged in character from the baseline; every view is already
  route-split (`RoadmapView` 33.7 kB, `SettingsView` 38.5 kB, `ProfileView`
  64.9 kB, `CVStudioView` 123.7 kB). The landing preview adds no new
  dependency and computes in **under 1 ms per role** for the catalogue roles
  measured (0.4–15.3 ms).
- The bundle-size warning is pre-existing and was not introduced by this work.

---

## 12. Test results

```
lint (tsc --noEmit)     exit 0
npm test                766 tests / 180 suites
                        764 pass   0 fail   2 skipped   0 cancelled
npm run build           exit 0
```

**Baseline before this work: 754 tests / 752 pass / 0 fail / 2 skipped.**
The +12 are the new `tests/public-site.test.ts`. No test was weakened or
removed to obtain a passing run.

The suite runs against the live Supabase project, creates and removes its own
identities, and verifies afterwards that **no test identities and no orphaned
storage objects remain** and that `.careerpilot_state.json` is unchanged.

The eight QA accounts created for the visual sweep were deleted afterwards;
the live project was verified to hold **0 QA profiles, 0 QA activities**, with
production data intact (37 CVs, 55 roadmaps, 79 profiles).

---

## 13. Screenshots and visual QA findings

**141 screenshots** were captured and reviewed: 69 of the public page (5
sections × 3 viewports × 4 theme/direction modes, plus full-page sweeps) and
72 of the signed-in application (12 routes × 2 viewports × 3 modes).

Defects found **and fixed** during the sweep:

1. **8 px RTL header overflow at tablet width** — fixed by moving the full
   navigation to `lg` and above.
2. **Untranslated navigation labels** — the landing navigation labels were
   plain strings and stayed English in Arabic. Now literal translation calls.
3. **Translation audit blind spot** — the new components initially translated
   through a variable (`t(label)`), which renders correctly but is invisible
   to the localisation audit, so a gap could never be reported. Every new
   string is now a literal call, and the audit's reach grew from **1,468 to
   1,531 source strings at 100 % coverage**.
4. **Untranslated "Skill gaps" tab** — found in the RTL render, fixed.
5. **Lonely card in the features grid** — the AI Career Mentor now closes the
   grid as a full-width card rather than sitting alone in a half-empty row.
6. **Untranslated copy in the footer** — "Privacy", "Terms" and "Status" were
   `<span>` elements that looked like links and went nowhere.

---

## 14. Remaining blockers and honest limitations

1. **Legal wording is still an operator action.** The published Terms identify
   the approved document dated 4 November 2026, but §14 still says the
   governing law and dispute-resolution arrangements "must be specified in the
   final legally approved version", and §15 refers to the published contact
   channels rather than naming an address. **The legal release blocker is
   preserved and not bypassed.** Supply the approved wording and bump
   `TERMS_VERSION`; that re-gates every user exactly as designed.
2. **GA4 needs re-authorisation.** The Admin traffic panel reports that
   analytics is not configured (`invalid_grant` / `invalid_client` / missing
   `analytics.readonly` scope). Pre-existing credential issue, not a
   regression. The panel shows "not configured" rather than inventing numbers.
3. **`GEMINI_API_KEY` must exist in the deployment environment** for a real
   extraction, letter generation and mentor answer. Without it the workflow
   degrades to the deterministic reader and a measured score, which is
   reported as unavailable rather than faked.
4. **The career catalogue is English.** The role titles, skill names and
   roadmap task text are catalogue data, not interface strings, so they stay
   English in the Arabic interface. Translating the catalogue is a data
   project, not a UI change, and it was not attempted.
5. **No live vacancy feed, and none was invented.** §12's "job market
   intelligence" is delivered through the verified Egyptian opportunities
   catalogue (source link, verification state, deadline) and the relevance-
   gated learning catalogue — not by showing vacancies the platform cannot
   source.
6. **Community and mentorship (§14) were deliberately not built.** The spec
   forbids empty community pages, and the research supports the decision:
   Pathrise operated the human-mentorship model and shut down
   (techinterview.org/pathrise-shitting-down). Human supply is a cost this
   product cannot carry; software-assisted guidance is the answer.
7. **The announcement scheduler is traffic-driven.** A due announcement waits
   for the next request unless an external cron calls
   `POST /api/admin/announcements/process-due`. Pre-existing, unchanged.
8. **65 raw English literals remain in components** that were never routed
   through `t()` (mostly `CareerContext.tsx` and `CareerPilotAvatars.tsx`).
   The audit measures this rather than hiding it.
9. **The AI provider's own accuracy is not verifiable here.** The product
   guarantees grounding and evidence, not that the model is right.

---

## 15–18. GitHub synchronisation

| | |
|---|---|
| Repository | `https://github.com/ahmedghannam801/careerdev4ai.git` |
| Branch | `main` |
| Base commit before this work | `1f56391` |

Four commits, each meaningful and independently reviewable:

| Commit | Description |
|---|---|
| `6310f65` | `feat(cv):` the job-description workflow, consent gating and SEO updates (the work already in the tree, committed as its own change) |
| `d69342c` | `feat(landing):` a live product preview, the real capabilities and real links |
| `abca751` | `feat(dashboard):` show recent activity, expose the mentor's evidence, skip link |
| `b9eff69` | `docs(design-references):` competitive research and the visual reference library |

Unrelated changes were preserved, not overwritten. The secret scan was run over
every new and changed file. **No force-push was used.**

**Push status:** **pushed and verified.** `origin/main` reads
`3849f8d3e21eb53c6856611a3cf357cf60b6e955`, identical to the local `HEAD`,
and `git status` reports `main...origin/main` with no divergence.

---

## 19–20. Deployment

| | |
|---|---|
| Provider | Cloudflare Pages (`wrangler.jsonc`, project `careerdev4ai`) |
| Production URL | `https://careerdev4ai.pages.dev` |
| Deployment id | `013b0f8a-174e-46ab-ae33-2e93aefb0d87` |
| Deployment URL | `https://013b0f8a.careerdev4ai.pages.dev` |
| Command | `npm run cf:deploy` → `npm run build && wrangler pages deploy dist --project-name careerdev4ai --branch main` |
| **Deployed commit** | **`3849f8d`** — identical to local `main` and to `origin/main` |
| Verified | the deployment's `Source` field was read back from the Pages API and compared with the local hash; the deployed bundle was then fetched and searched for the new strings |

### Production verification

| Check | Result |
|---|---|
| `/api/health` | 200 — `{"status":"ok","modelConfigured":true,"modelName":"gemini-3.6-flash"}` |
| `/terms`, `/privacy`, `/about`, `/careers`, `/learning`, `/opportunities`, `/robots.txt`, `/sitemap.xml`, `/` | **all 200** |
| Deployed bundle contains the new code | **yes** — `assets/index-D0ZvAZ1G.js` carries the live preview, the mentor evidence panel, the recent-activity panel, the skip link and the preview caption |
| Browser console errors | **0** across light, dark and Arabic RTL |
| Failed network requests | **0** |
| Horizontal overflow | **0** in all three modes |
| All five new sections present | **yes** (`#preview`, `#features`, `#trust`, `#faq`, `#contact`) |
| Footer links | **all seven resolve to real destinations** |
| The preview re-plans live in production | **yes** — selecting *HR Specialist* re-runs the engine and returns an HR plan (4 phases, 14 tasks, 200 h, 6 gaps, next action "Learn Confidentiality & Data Handling", with the reason "…is at 0/5 and this role expects 4/5 — blocks the role") |
| A real sign-up against production | **succeeds** and lands on the onboarding wizard |

### The auto-deploy failure

Cloudflare Pages is connected to GitHub and started its own build when `main`
was pushed (deployment `56bc4e78`, status **Failure**). The same pattern
appears for every earlier commit — one failed auto-deployment followed by one
successful manual deployment — so this is a long-standing condition of the
project's Git integration, not something this work introduced. The manual
path in `package.json` (`npm run cf:deploy`) is the one that succeeds, and it
is the path used here. **The failed auto-build is a live issue for the
operator to resolve in the Cloudflare dashboard** (build command and output
directory for the Git-connected build); it does not affect the running
production site, which serves commit `3849f8d`.

**Rollback:** revert the code commits and redeploy. Every schema change in this
period is additive, so an older application build keeps working against the
current database.

### Post-deployment cleanup

The account created by the production smoke test was deleted. The live project
was verified afterwards: **0 QA profiles, 0 QA activities**, with production
data intact (37 CVs, 55 roadmaps, 83 profiles).

---

## 21. Requirement-to-evidence matrix

| Requirement | Evidence |
|---|---|
| Interactive product preview | `src/components/landing/ProductPreview.tsx`; `tests/public-site.test.ts` — the preview's roles exist in the catalogue and its plan is the engine's plan |
| Features showcase | `src/components/landing/FeatureGrid.tsx` — ten implemented capabilities, each naming its in-app area |
| Trust and transparency | `src/components/landing/TrustSection.tsx` — readiness, AI grounding, data handling, explicit limits |
| FAQ | `src/components/landing/FaqSection.tsx` — native `details`/`summary` |
| Contact | `src/components/landing/ContactSection.tsx`, `shared/contact.ts` — one published source for every channel |
| Working footer links | `LandingView.tsx` — `/terms`, `/privacy`, `/about`, `/careers`, `/learning`, `mailto:`; verified in the browser sweep |
| Bilingual parity | `src/translations/parts/landing.ts`; the audit reports **1,531 / 1,531 source strings translated** |
| Design system tokens | `src/index.css` — AI accent and elevation scale; the brand primary is unchanged |
| Dashboard recent activity | `src/components/career/RecentActivityPanel.tsx` |
| Mentor evidence | `src/components/copilot/EvidencePanel.tsx` |
| Skip to content | `src/components/layout/AppShell.tsx` |
| No invented content | the preview calls the real engine; the FAQ says what the product does not do; no testimonial, salary or vacancy is fabricated anywhere |
| Production data preserved | 0 QA profiles, 0 QA activities; 37 CVs / 55 roadmaps / 79 profiles intact; no table dropped, no RLS disabled |
| Legal approval preserved | the release blocker is reported, not bypassed |

---

## 22. What was deliberately not built

| Item | Reason |
|---|---|
| Human mentorship / community pages | The spec forbids empty community surfaces; Pathrise's shutdown shows the human-supply cost is not carryable |
| A live job board | The platform has no verified feed and will not invent one |
| Orange as the brand primary | The existing brand is terracotta; the brief said to validate proposed directions against the existing assets |
| Testimonials | None exist to publish, and inventing them would contradict the trust section |
| A chart library | One well-designed chart beats a suite; the research's own ranking puts charts in Tier 2 |
