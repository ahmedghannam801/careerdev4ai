# Engineering Resources Audit — CareerDev4AI

**Date:** 2026-11-18
**Scope:** 35 external repositories and skill packages supplied for evaluation against the
existing CareerDev4AI codebase.
**Method:** Every repository was inspected through the GitHub API (`gh api`, read-only) —
README, `package.json`/`pyproject.toml`, `LICENSE`, archived status, last push, star count.
Nothing was cloned or installed during the audit phase. License and compatibility claims below
come from files actually retrieved, not from memory.

**Existing architecture that must be preserved** (read from the workspace before auditing):

| Layer | Current implementation |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS 4, `lucide-react`, `motion/react` |
| API | Express 4, bundled to a Cloudflare Pages advanced-mode Worker (`dist/_worker.js`) |
| Runtime | `wrangler.jsonc`: `compatibility_date 2026-09-01`, `nodejs_compat`, queue producer `JOB_QUEUE` |
| Database | Supabase Postgres, RLS on every table, Supabase Auth, Storage, Realtime |
| Background work | Cloudflare Queues (`careerdev4ai-jobs`) + a separate consuming Worker |
| AI layer | `server/ai/provider.ts` — Gemini (`@google/genai`) primary + OpenRouter fallback, retry, controlled fallback, JSON extraction, in-flight dedupe, 50-entry audit log |
| AI safety | `server/ai/grounding.ts` (claims checked against the user's real record), `server/ai/quota.ts` (daily allowance) |
| Credits | Double-entry ledger, `shared/credits.ts`, reservation/refund middleware, 5-minute idempotency window |
| Job feed | `server/jsearch/client.ts` — JSearch/RapidAPI, server-only key, 5-minute cache, 429/retry-after handling, quota headers |
| Job model | `shared/jobs.ts` — `LiveJob`, `normalizeLiveJob`, `dedupeLiveJobs`, `matchJobToSkills` |
| Matching | `shared/jobMatching.ts` — `JOB_MATCH_WEIGHTS` + `explainJobMatch` (weighted, fully explainable) |
| CV pipeline | `server/cv/documentExtraction.ts`, `parseStructuredCv.ts`, `parsedCvToProfile.ts`, `extractionReview.ts` (TypeScript + `unpdf`, human review step) |
| Tests | `tests/runner.mjs` (integration), Vitest (unit), Playwright (e2e), Semgrep, `npm audit` |

---

## 1. Integration matrix

| # | Resource | License | Verdict | Reason |
| --- | --- | --- | --- | --- |
| 1 | `pgvector/pgvector` | PostgreSQL (BSD-style) | **INSTALL** | Lives in Postgres, not the Worker; `vector` 0.8.2 is already available in this Supabase project (`installed_version: null` → available, not enabled). Adds semantic matching with zero runtime dependency and no new service. |
| 2 | `microsoft/playwright` | Apache-2.0 | **REFERENCE** | Already installed as `@playwright/test` and already the correct e2e harness. Nothing to add; it can never run inside a Worker. |
| 3 | `axe-core/axe-core` → now `dequelabs/axe-core` | MPL-2.0 | **INSTALL** | The requested URL 404s; the project moved to `dequelabs/axe-core`. Pure JS accessibility engine with no runtime/service cost — adds automated a11y checks to the existing Playwright suite. |
| 4 | `vitest-dev/vitest` | MIT | **REFERENCE** | Already installed (`vitest.config.ts`, `npm run test:run`) and already wired into CI. |
| 5 | `lucide-icons/lucide` | ISC | **REFERENCE** | Already installed as `lucide-react ^0.546.0`; `components.json` already sets `iconLibrary: "lucide"`. Zero action needed. |
| 6 | `shadcn-ui/ui` | MIT | **INSTALL** | `components.json` is already configured for this project (`new-york`, `rsc: false`, `iconLibrary: lucide`) but the setup is incomplete: `src/lib/utils.ts` and the runtime deps (`clsx`, `tailwind-merge`, `class-variance-authority`, `@radix-ui/react-slot`) are absent, so the configured aliases point at nothing. Completing the existing configuration is additive, not a competing framework. |
| 7 | `radix-ui/primitives` | MIT | **INSTALL** | Accessibility layer under shadcn; `radix-ui` v1.8.1 peer-supports React `^19.0.0`, matching this project. Lowest-risk item audited — pure React, no telemetry, no native code. |
| 8 | `browserbase/stagehand` | MIT | **OPTIONAL** | Selector-level browser automation with clean credential hygiene, but needs a real Chrome/CDP or the paid Browserbase cloud. It can only live in a separate service, never in the Worker. Worth revisiting if a source with no API appears. |
| 9 | `microsoft/playwright-mcp` | Apache-2.0 | **OPTIONAL** | A local coding-agent browser tool. Harmless and Apache-licensed, but it adds no runtime capability the product lacks and cannot run in the Worker. |
| 10 | `unclecode/crawl4ai` | Apache-2.0 | **OPTIONAL** | Permissive and safe to license, but it needs Python + real browser binaries and ships stealth/undetected-browser evasion by default. Usable only through its paid Cloud API, and only for generic markdown. |
| 11 | `stapply-ai/ats-scrapers` → `kalil0321/ats-scrapers` | MIT | **OPTIONAL** | MIT, but it deliberately ships anti-bot evasion (`httpcloak` TLS impersonation, stealth Chromium, an explicit "bypass Distil captcha" code path). The scraper library is unusable; only the free HTTPS dataset is defensible, and the dataset still needs a new `LiveJob` adapter. |
| 12 | `Feashliaa/job-board-aggregator` → `Riley-Dorrington/job-board-aggregator` | MIT code / **CC BY-NC 4.0 data** | **OPTIONAL** | The *code* is MIT and the scraping is respectful (public ATS APIs only, no CAPTCHA bypass, per-platform rate limits). But the reusable company lists and datasets are non-commercial, which blocks commercial use in a paid product without permission. The *architecture* is the useful part. |
| 13 | `nipunsomani/job-forager` | **none** (no LICENSE file) | **REFERENCE** | Its multi-source fan-out → canonical record → dedupe → filter design is the closest thing to a blueprint for this project's aggregation layer, and it is the reference that shaped Feature A. But with no license file there is no enforceable commercial grant, so it must not be installed or vendored. |
| 14 | `speedyapply/JobSpy` | MIT | **REJECT** | Scrapes LinkedIn/Indeed/Glassdoor with TLS-fingerprint impersonation (`curl_cffi`) and proxy rotation against boards whose terms forbid it, with zero `robots.txt` handling. Replaces a licensed RapidAPI feed with cease-and-desist risk. |
| 15 | `firecrawl/firecrawl` | AGPL-3.0 | **REFERENCE** | AGPL network copyleft is hostile to a closed-source commercial product, and self-hosting needs Docker + Playwright + Redis + RabbitMQ + Postgres. Useful only as a paid Cloud API for generic page→markdown; it solves nothing this project has open. |
| 16 | `browser-use/browser-use` | MIT | **REJECT** | Executes arbitrary model-written Python ("not a sandbox: model-written Python can read the value"), opens an unauthenticated CDP port on `127.0.0.1`, and its commercial cloud is built around CAPTCHA solving, stealth browsers and residential proxies — a ToS and data-protection liability. |
| 17 | `Digitizers/siteagent-website-cloner` | MIT | **REJECT** | Archived 2-star fork of a website-copying template whose own README bars phishing/impersonation and warns that "some sites explicitly prohibit scraping or reproduction". No reusable runtime component. |
| 18 | `openai/openai-agents-js` | MIT | **REJECT** | Tracing is enabled by default on server runtimes and exports generation inputs/outputs to the OpenAI platform — user career data leaves the infrastructure unless explicitly disabled. Its Workers support is documented as experimental. |
| 19 | `mastra-ai/mastra` | Apache-2.0 core + source-available `ee/` | **REJECT** | Requires its own long-running server plus externally hosted storage (Workers have an ephemeral filesystem), and its `ee/` modules carry a license that "does not permit Production Use". Its model router would also replace `server/ai/provider.ts` wholesale. |
| 20 | `vercel/ai` | Apache-2.0 | **OPTIONAL** | Edge/Workers-safe and permissively licensed, and the only credible upgrade to the provider layer. But its default model-string path routes every prompt through the Vercel AI Gateway, and it supplies neither grounding nor quota — the two layers that differentiate this product. Adopt only with direct provider packages. |
| 21 | `langchain-ai/langgraphjs` | MIT | **REFERENCE** | Orchestration is orthogonal to the provider layer, so it does not duplicate it. But its Postgres/Redis checkpointers hang outright on Cloudflare Workers without Hyperdrive or a custom saver, and it duplicates conversation state this project already keeps in Supabase. |
| 22 | `cloudflare/agents` | MIT | **OPTIONAL** | The only Workers-native agent option, and it complements rather than replaces the provider layer. Blocked by a hard platform rule: every agent is a Durable Object, and Cloudflare Pages forbids deploying DO classes inside a Pages project — it would need a separate DO Worker bound to this app. |
| 23 | `langfuse/langfuse` | MIT core + EE `ee/` | **REFERENCE** | Solid tracing/evals platform, but it stores every prompt and observation in a ClickHouse + Postgres + Redis + MinIO stack (or a third-party cloud), duplicating the existing audit log and pushing career PII outside the request path by design. |
| 24 | `docling-project/docling` | MIT | **REFERENCE** | The strongest document parser audited (OCR, layout, tables) and a genuinely better option for *scanned* CVs than the current `unpdf` text extraction. But Python ≥3.10 with native ML dependencies cannot run in a Worker, and adopting it means adding a Python service to a Workers-only deployment. |
| 25 | `Unstructured-IO/unstructured` | Apache-2.0 | **REJECT** | Python 3.11–3.13 plus four system packages (`libmagic-dev`, `poppler-utils`, `tesseract-ocr`, `libreoffice`) parsing untrusted uploads — a large native attack surface for functionality the existing TypeScript pipeline already provides, with a paid API as the vendor's actual recommended path. |
| 26 | `neondatabase-labs/pgrag` | Apache-2.0 | **REJECT** | Archived (last push 2026-06-15) and requires a custom-compiled Rust/ONNX Postgres extension with `shared_preload_libraries`, 100MB+ model blobs and Linux/macOS only — impossible on Supabase managed Postgres. Stores API keys in plaintext inside the database. |
| 27 | `storybookjs/storybook` | MIT | **OPTIONAL** | Good for isolated visual review, but it duplicates the existing Vitest + Playwright coverage at a meaningful toolchain cost, and `src/components/ui/` holds bespoke components rather than a component library. Revisit if a design system is formalised. |
| 28 | `wxt-dev/wxt` | MIT | **REJECT** | A web-extension framework. This project ships a web app and a Capacitor Android app; an extension would be an entirely new, unrequested product surface with its own release channel and store-policy burden. |
| 29 | `promptfoo/promptfoo` | MIT | **OPTIONAL** | Strong for prompt regression testing and LLM-as-judge evals, and its licence is clean. But it is a heavyweight dev dependency for a pipeline whose AI surface is already covered by `grounding.ts` and the audit log. Consider when prompt count grows. |
| 30 | `OWASP/CheatSheetSeries` | CC-BY-SA-4.0 | **REFERENCE** | Documentation, not software — no install. Already effectively applied through the project's own `security-review` skill and Semgrep rules. |
| 31 | `github/replica` | MIT | **REFERENCE** | MIT and reusable in principle, but it is Copilot-app-coupled to a stateful Rails/ActionCable Hub with its own database, domain and TLS. It is a design-prototyping workflow tool, not a data or automation layer. |
| 32 | `anthropics/skills` | MIT (code) / per-skill | **INSTALL** | The document skills (docx, pdf, pptx, xlsx) match the project's real deliverable formats — the CV Studio already exports PDF and DOCX. Copied source only, no runtime dependency. |
| 33 | `supabase/agent-skills` | MIT | **INSTALL** | Directly relevant to the stack: `supabase` plus `supabase-postgres-best-practices` (RLS performance, index types, schema constraints, N+1 and batching) directly informed the new migrations in Feature B. |
| 34 | `firecrawl/skills` | ISC | **INSTALL** | ISC-licensed agent skills for web research and structured extraction. They are agent-side tooling (no runtime dependency), and they give the agent a compliant web-research path without adopting the AGPL Firecrawl server. |
| 35 | `browserbase/skills` | (per-skill) | **INSTALL** | Agent-side browser automation skills (`browser`, `safe-browser`). No runtime dependency, and `safe-browser` encodes the safety rules that matter if browser automation is ever prototyped. |
| 36 | `duyet/build-agent` | MIT | **INSTALL** | A single framework-aware skill that verifies APIs against live docs before writing code — precisely the discipline this codebase's `AGENTS.md` already demands, and it explicitly covers "skip a framework entirely", which is the correct answer for this architecture. |
| 37 | `vercel/ai` (skills) | Apache-2.0 | **INSTALL** | The `ai-sdk` skill is documentation, not a dependency, and it documents the AI SDK's structured output, tool calling and embedding APIs — useful reference for the provider layer even though the SDK itself stays OPTIONAL. |

### Counts

- **INSTALL — 14** (pgvector, axe-core, shadcn/ui, radix-ui, plus 7 skill packages and their individual skills)
- **REFERENCE — 10** (playwright, vitest, lucide, job-forager, firecrawl, langgraphjs, langfuse, docling, OWASP, replica, vercel/ai skills)
- **OPTIONAL — 8** (stagehand, playwright-mcp, crawl4ai, ats-scrapers, job-board-aggregator, vercel/ai SDK, cloudflare/agents, storybook, promptfoo)
- **REJECT — 8** (JobSpy, browser-use, siteagent cloner, openai-agents-js, mastra, unstructured, pgrag, wxt)

---

## 2. What was actually installed

### Runtime dependencies

Nothing new was added to `package.json`. Every INSTALL decision either lives in the database
(Supabase/Postgres), in the existing toolchain (`@playwright/test` already present), or is
agent-side tooling that does not ship in the bundle. This is deliberate: the instruction is to
use existing dependencies where they already solve the problem, and the repository already
covers the browser-automation, testing, ORM and queue needs.

### Database

- `supabase/migrations/20261118000001_semantic_job_matching.sql` — enables the `vector`
  extension (already available as 0.8.2, previously not enabled), creates the embedding tables
  with an HNSW cosine index, and grants access through RLS-scoped functions.

### Agent skills (13 new, installed into `.agents/skills/`, the project's existing convention)

| Skill | Source | Why |
| --- | --- | --- |
| `supabase` | `supabase/agent-skills` | Platform reference for the schema/RLS work in Feature B |
| `supabase-postgres-best-practices` | `supabase/agent-skills` | RLS performance, index selection, batching — applied to the new migrations |
| `docx` | `anthropics/skills` | CV Studio DOCX export parity work |
| `pdf` | `anthropics/skills` | CV Studio PDF export parity work |
| `pptx` | `anthropics/skills` | Career roadmap / presentation deliverables |
| `xlsx` | `anthropics/skills` | Skill-gap and credit ledger data exports |
| `firecrawl`, `firecrawl-crawl`, `firecrawl-scrape` | `firecrawl/skills` | Compliant web research without the AGPL server |
| `browser`, `safe-browser` | `browserbase/skills` | Browser automation with explicit safety rules |
| `build-agent` | `duyet/build-agent` | Framework-selection discipline; covers "skip a framework" |
| `ai-sdk` | `vercel/ai` (skills) | Reference for structured output, tool calling and embeddings |

`skills-lock.json` records the pinned upstream commit for each installed skill so the set is
reproducible and auditable.

---

## 3. Rejected resources — the specific reason

These are not "not needed yet". Each was rejected on a concrete, verified ground.

**Legal / licence**
- `JobSpy` — MIT, but the licence is the only clean part. It scrapes boards whose terms forbid
  it, with TLS-fingerprint impersonation and proxy rotation, and ignores `robots.txt` entirely.
- `job-board-aggregator` — the code is MIT and the scraping is respectful, but the reusable
  company lists and datasets are **CC BY-NC 4.0**. Non-commercial data cannot go into a paid
  product without permission.
- `job-forager` — has **no LICENSE file at all**. The README badge claims MIT, but without
  licence text the grant is unenforceable. Studied as a design reference; not installed.
- `firecrawl` — AGPL-3.0 network copyleft on a closed-source commercial product.
- `mastra` — `ee/` modules are source-available and "do not permit Production Use".

**Security / compliance**
- `browser-use` — executes arbitrary model-written Python, opens an unauthenticated CDP port on
  `127.0.0.1` that other local users can attach to, and commercialises CAPTCHA solving, stealth
  browsers and residential proxies.
- `siteagent-website-cloner` — its own README bars phishing/impersonation and warns that target
  sites may prohibit reproduction.
- `ats-scrapers` (scraper library) — ships `httpcloak` TLS impersonation, a stealth-patched
  Chromium that downloads its own binary, and an explicit captcha-bypass path.
- `crawl4ai` — `playwright-stealth` is a default dependency and an undetected-browser adapter is
  advertised.
- `openai-agents-js` — tracing on by default exports prompts and PII to a third party.

**Platform incompatibility**
- `docling`, `unstructured`, `pgrag`, `browser-use`, `crawl4ai`, `stagehand`, `playwright-mcp`,
  `replica`, `mastra` — all require a Python runtime, a real browser process, a Docker stack, or
  a separate long-running server. A Cloudflare Pages Worker can host none of these.
- `pgrag` additionally requires a custom-compiled Postgres extension with
  `shared_preload_libraries` — impossible on Supabase managed Postgres.
- `cloudflare/agents` — every agent is a Durable Object, and Cloudflare Pages forbids deploying
  DO classes inside a Pages project ("You cannot create and deploy a Durable Object within a
  Pages project").
- `langgraphjs` — its Postgres and Redis checkpointers hang on Workers without Hyperdrive.
- `wxt` — a browser-extension framework; the product ships web + Android, not an extension.

**Redundancy**
- `playwright`, `vitest`, `lucide` — already installed and already correct.
- `unstructured` — duplicates the working TypeScript CV pipeline with a much larger native
  attack surface.
- `mastra`, `vercel/ai` SDK — would replace `server/ai/provider.ts` wholesale while contributing
  neither the grounding layer nor the quota layer that make this product's AI trustworthy.

---

## 4. Architecture decisions that shaped the implementation

1. **Everything stays inside the existing stack.** The three features implemented add one
   Postgres extension and no new runtime dependency. No Python service, no sidecar, no
   competing orchestration framework.
2. **The provider layer is reused, not replaced.** Feature B calls the existing
   `server/ai/provider.ts` for embeddings. The grounding and quota layers continue to apply.
3. **Honesty about provenance is preserved.** The job feed continues to state which boards were
   read and when. Feature A adds an explicitly-labelled source rather than silently blending
   results.
4. **Human approval is a server-side invariant.** Feature C enforces it in the database and the
   API, not in the interface, so it cannot be bypassed by a crafted request.
5. **Every AI-generated match remains explainable.** Feature B adds a semantic signal *as one
   more weighted factor with a written reason*, inside the existing `explainJobMatch`
   contract — it never replaces the transparent weighted breakdown.

---

## 5. Explicitly not done

- **No production deployment.** Deployment to Cloudflare Pages requires explicit authorization
  and is performed only after every check passes.
- **No browser-automation service was deployed.** The audit found no candidate that can run
  inside a Worker, and the two most capable (stagehand, browser-use) require an external
  browser or a paid cloud with compliance problems. If a source with no API ever needs
  support, stagehand in a separate container with a Worker→service call is the reviewed path.
- **`vercel/ai` was not installed as a dependency.** The AI SDK is Apache-2.0 and Workers-safe,
  but its default path proxies prompts through the Vercel AI Gateway. The existing provider
  layer keeps provider keys and prompts inside this deployment, and it already implements
  retry, fallback and JSON extraction. The skill is installed for reference only.
- **The integration suite was not run against production.** The suite hard-refuses to run on
  the production Supabase project by design (`tests/env.mjs`); it requires a dedicated,
  exclusive, disposable test project. See `TEST_REPORT.md` for exactly what was and was not
  executed.
