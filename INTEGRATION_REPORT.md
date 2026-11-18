# Integration Report — CareerDev4AI engineering resources

**Date:** 2026-11-18
**Branch:** `main` (commit to be recorded below)
**Scope:** the evaluation of 35 external repositories and skill packages, and
the three features built from what survived the evaluation.

---

## 1. What was asked and what was done

The directive asked for three things in order: **evaluate** the supplied
resources, **integrate** the useful ones into the existing codebase without
disturbing it, and **prove** the result with the project's own quality gates.

The evaluation is in `ENGINEERING_RESOURCES_AUDIT.md`: every repository was
inspected through the GitHub API — README, `package.json`, `LICENSE`, last
push, star count, archived status — and classified as INSTALL, REFERENCE,
OPTIONAL or REJECT with a reason.

**35 repositories and skill packages were evaluated. 14 were installed. 8 were
rejected. Nothing was installed "because it was on the list".**

The headline outcome is that **no new runtime dependency was added to
`package.json`**. The three features are built from the stack the project
already has: the existing Supabase Postgres, the existing AI provider, the
existing job-feed client, the existing Express API and the existing React
front-end. The single addition to the deployed surface is the `vector`
extension, which was already *available* in the project's Supabase project
(0.8.2) and had simply never been enabled.

---

## 2. The three features

### Feature A — the company's own careers boards

**Priority:** job discovery and aggregation.

**The problem.** The platform buys one aggregated feed (JSearch on RapidAPI,
backed by Google's job feed). It is broad but shallow: it reaches the
postings a job board republished. A vacancy sitting on a company's own
careers page is frequently missing from it.

**What was built.** `server/jobs/ats.ts` reads a company's applicant-tracking
system through the vendor's own public endpoint — Greenhouse, Lever and
Ashby all publish a documented, key-free JSON endpoint for exactly this
purpose. `server/jobs/feed.ts` merges those postings with the provider's,
deduplicates them, and reports which boards were read and which could not be.

**Why this and not a scraper.** The audit rejected every scraper in the list
on concrete grounds (`JobSpy` for TLS impersonation and proxy rotation against
boards that forbid it; `ats-scrapers` for shipping `httpcloak` and an
explicit captcha-bypass path; `crawl4ai` for `playwright-stealth` by default).
Reading a vendor's public JSON endpoint needs none of that: no browser, no
evasion, no credential, no proxy. The platform sends a `User-Agent` that
names it, reads four boards at a time, and gives each board eight seconds.

**Honesty, which the project already insisted on.** The existing contract
test asserts the platform never claims a board it has not read — Wonderin is
presented as a place to search rather than as a feed. The new board is
therefore a *sixth* source with its own label, "Company careers pages", and
every posting read from it carries `source: 'company_careers'`. A posting
read from a company board is never presented as if it came from a board the
platform did not read.

**It is off by default.** With no `JOB_ATS_BOARDS` configured, the platform
reads no company boards and reaches out to nobody. The board list is the
deployment's own environment variable, not a bundled dataset — which is what
keeps the CC BY-NC company lists out of a paid product.

**Files**

| File | What it does |
| --- | --- |
| `server/jobs/ats.ts` | Reads the three ATS endpoints; normalises to `LiveJob` |
| `server/jobs/feed.ts` | Merges the two sources, deduplicates, reports provenance |
| `shared/jobs.ts` | The sixth source, its label, and the declared-source rule |
| `app.ts` | The route now searches every board |

### Feature B — semantic job matching that explains itself

**Priority:** AI job matching.

**The problem.** The platform already explains a match with five weighted
factors, and each one is *exact*: it compares what the candidate's record
says with what the posting says, name by name. That is precise and it is
blind at the same time. A posting that asks for "Postgres" and a candidate
who writes "PostgreSQL" do not match. A posting that asks for "Figma" and a
candidate who writes "UI design" do not match. Neither is a fact about the
candidate's fit — they are facts about spelling.

**What was built.** `server/ai/embeddings.ts` embeds text with Gemini's
`text-embedding-004` (768 dimensions, the same width the new `vector(768)`
columns are declared with). `server/jobs/semantic.ts` stores the vectors in
Supabase and compares them with pgvector's cosine distance, through an
HNSW-indexed search.

**The rule that mattered most.** The semantic score is **not** a replacement
for the weighted breakdown. It is one more weighted factor, carrying 15 of
the 100 points, with the five exact factors scaled to share 85 and keeping
their proportions. A candidate who compares two postings sees the same
ranking among the exact factors whichever way the semantic factor is set.

**And it is explainable.** A cosine distance on its own is a number nobody
can act on, so the factor carries a written reason that names the terms that
drove it: *"Your experience with TypeScript, React lines up with what this
posting describes."* The terms are compared with the platform's *existing*
skill canonicalisation, which is what lets "Node.js" in a posting and
"node js" in a record meet. When no term is shared the reason says what the
similarity was, because a number with no explanation is not an explanation.

**A missing factor is absent, not zero.** If no vector could be built, the
factor is left out of the breakdown entirely rather than shown as a score of
zero for a comparison that was never made.

**Where the vectors live.** In the database the project already uses, behind
the row level security it already has. Not a vector database, not a service.
The `vector` extension was already available in this Supabase project and had
never been enabled.

**The cost.** Embeddings are a paid model call, so they are made **once per
posting and once per candidate and then stored**. A repeated search costs
nothing, and a search with nothing embedded simply has no semantic factor —
the exact factors carry the whole score, exactly as before.

### Feature C — the approval gate on an application

**Priority:** application automation with human approval.

**The problem.** An application package holds the tailored CV, the cover
letter and the analysis of the posting. The platform builds them from the
candidate's own verified record, so they are accurate — but they are still
the candidate's words going to an employer, and the candidate has to be the
one who says "yes, this is what I want to send". Before this change, nothing
recorded that decision.

**What was built.** A small state machine on the package:

```
draft ──submit_for_review──▶ pending_review ──approve──▶ approved
                                 │                            │
                                 └──reject──▶ rejected        └──withdraw──▶ draft
```

with an **append-only history** of every decision, and — the important part —
**a trigger in the database** that refuses any move the machine does not
allow.

**Why in the database and not in the interface.** A check in the interface
can be skipped by a crafted request, by a dashboard, or by a future script.
A trigger cannot. The gate holds however the change is made.

**Verified three ways.** By direct SQL against the live database (3 legal
transitions succeeded, 2 illegal ones refused); by a test that writes to the
table with the service-role key, going past the route entirely (refused with
`An application package cannot move from draft to approved`); and by the route
tests, which confirm the refusal is reported as a 409 with an explanation the
candidate can act on.

**What this feature deliberately does not do.** It approves a package; it does
not send anything. The platform does not automate applications, and this
change did not start doing so — that would need the browser automation the
audit rejected on legal and security grounds.

---

## 3. What was preserved

The directive asked that the existing architecture not be disturbed. It was
not.

| Preserved | How |
| --- | --- |
| React 19, TypeScript, Vite, Tailwind 4 | Untouched. The one new UI element is a paragraph in an existing explanation panel. |
| Supabase, Cloudflare Pages and Workers | Untouched. The new database objects live in the existing Supabase project; the new code runs in the existing Worker bundle. |
| The unified AI provider | **Reused, not replaced.** The embedding client uses the same `@google/genai/web` package and the same `GEMINI_API_KEY` as the existing provider. |
| The grounding layer | Untouched. The CV pipeline was not modified by this work at all. |
| The credit accounting | Untouched — see the note below. |
| The existing CV Studio | Untouched. The CV work in progress in the working tree was not edited, and its failures were traced to it rather than papered over. |
| The existing job feed | Untouched. The provider client is unchanged; the new source is merged beside it. |
| The existing matching | **Extended, not replaced.** `explainJobMatch` keeps its signature working: the semantic factor is an optional last argument, and every existing caller and test behaves identically. |
| `package.json` | **No new runtime dependency. No new dev dependency. No change at all.** |

---

## 4. The one thing a reviewer should look at

**Embeddings are charged to the provider's quota, not to the candidate's
credit balance.**

The job-search route is a reading route. It is not gated by
`requireCredits`, and it should not be: charging a candidate's credits for
reading their own job list would be wrong. The embedding call therefore
consumes the provider's own quota rather than the candidate's balance.

This is a deliberate decision and it is recorded here so that it is a
decision rather than an oversight. If the product later decides that semantic
matching should be a paid feature, the change belongs in
`server/jobs/semantic.ts` — the credit call would be added there, where the
embedding is made, rather than in the route.

---

## 5. The skills that were installed

Thirteen agent skills were installed into `.agents/skills/`, the project's
existing convention (the directory already held fourteen workspace skills):

| Skill | Source | Why |
| --- | --- | --- |
| `supabase`, `supabase-postgres-best-practices` | `supabase/agent-skills` | Directly informed the new migration: RLS performance, index choice, batching |
| `docx`, `pdf`, `pptx`, `xlsx` | `anthropics/skills` | The CV Studio's real export formats |
| `firecrawl`, `firecrawl-crawl`, `firecrawl-scrape` | `firecrawl/skills` | A compliant web-research path without the AGPL server |
| `browser`, `safe-browser` | `browserbase/skills` | Browser automation with the safety rules written down |
| `build-agent` | `duyet/build-agent` | Framework-selection discipline; it explicitly covers "skip a framework entirely" |
| `ai-sdk` | `vercel/ai` | Reference for structured output and embeddings |

These are markdown instructions for a coding agent. They are not imported by
any module, are not in the bundle, and cannot execute at runtime.
`skills-lock.json` pins the upstream commit for each, so the set is
reproducible.

---

## 6. What was rejected, and why it is not a loss

The eight rejections are the interesting part of this exercise, because each
one would have introduced a real problem:

- **`browser-use`** executes model-written Python, opens an unauthenticated
  CDP port on `127.0.0.1`, and commercialises CAPTCHA solving.
- **`JobSpy`** and **`ats-scrapers`** scrape boards that forbid it, with TLS
  impersonation and captcha bypass.
- **`mastra`**'s enterprise modules are source-available and "do not permit
  Production Use".
- **`openai-agents-js`** traces prompts and completions to a third party by
  default — the candidate's career data leaving the deployment.
- **`pgrag`** stores API keys in plaintext in the database.
- **`unstructured`** replaces a working TypeScript pipeline with four system
  packages parsing untrusted uploads.
- **`wxt`** is a browser-extension framework for a product that ships web and
  Android.
- **`siteagent-website-cloner`** is an archived tool whose own README bars
  phishing.

None of them is a missed opportunity. In two cases — the ATS boards and
semantic matching — the implemented alternative is **strictly safer** than
the rejected option: reading a vendor's public JSON endpoint needs no
evasion and no credential, and keeping the semantic score inside the
platform's own database keeps the candidate's data inside the deployment.

---

## 7. The documents

| Document | What it answers |
| --- | --- |
| `ENGINEERING_RESOURCES_AUDIT.md` | What was evaluated, what each one is, and why it was installed, referenced, deferred or rejected |
| `INTEGRATION_REPORT.md` | (this file) What was built, what was preserved, and what a reviewer should look at |
| `SECURITY_REVIEW.md` | The threat model, the findings, and the verification of each control |
| `TEST_REPORT.md` | Exactly which checks ran, which passed, and which did not run |

---

## 8. The state of the branch

`main`, on top of `4512d84 fix(jobs): say when the boards were really read`.

The working tree also contains **unrelated CV Studio work that was already in
progress** when this task began (the draft-recovery and autosave components,
the CV export rewrite and their tests). It was preserved, not modified, and
it is not part of this integration. Two failures in the database-free suite
and one Semgrep finding are attributable to that work; the evidence is in
`TEST_REPORT.md`.

Nothing was deployed. The deployment to Cloudflare Pages production needs
explicit authorization, and it happens only after the checks in
`TEST_REPORT.md` have been read and accepted.
