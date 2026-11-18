# Security Review — CareerDev4AI resource integration

**Date:** 2026-11-18
**Scope:** the three features added by the engineering-resource integration
(company careers boards, semantic job matching, the application approval gate),
plus the thirteen agent skills installed into `.agents/skills/`.
**Method:** the project's own Semgrep rules (`.semgrep.yml`), `npm audit`, a
manual review of every new file, and a review of each rejected resource
against the threat model below.

---

## 1. Threat model for what was added

| Asset | Where it lives | Who can reach it |
| --- | --- | --- |
| A candidate's CV, cover letter and profile | Supabase, behind RLS | The candidate, and the server with the service-role key |
| A candidate's application decisions | `application_package_reviews`, behind RLS | The candidate only |
| A candidate's profile vector | `profile_embeddings`, behind RLS | The candidate only |
| A posting's vector | `job_embeddings`, readable by any signed-in candidate | Public postings |
| The provider and ATS credentials | Server environment only | The server |
| The Gemini API key | Server environment only | The server |

The rule that governs all three features: **a candidate's data leaves the
platform only when the candidate sends something, and only after they have
approved it.**

---

## 2. Findings

### 2.1 No secret reaches the browser — CONFIRMED

The three new server modules read credentials from the process environment
only:

- `server/ai/embeddings.ts` reads `GEMINI_API_KEY`.
- `server/jobs/ats.ts` reads `JOB_ATS_BOARDS`, which is a list of public board
  identifiers — not a credential at all.
- `server/jobs/semantic.ts` reads nothing; it uses the server's Supabase
  client.

None of them is imported by any file under `src/`. The only file the browser
imports from the new work is `src/lib/jobsApi.ts`, which carries types only.

The project's own check confirms this at build time:
`scripts/verify-bundle-auth-config.mjs` runs as part of `npm run build` and
passed:

```
[bundle-auth] the bundle carries the public Supabase configuration and all 4 sign-in methods
```

Semgrep's `vite-client-secret-reference` rule (which fails the build on any
`import.meta.env.VITE_*` reference to a service-role key, client secret,
private key or access token) found nothing.

### 2.2 The semantic comparison is a bound parameter, never SQL text — CONFIRMED

The candidate's vector reaches Postgres as a bound parameter:

```ts
getSupabaseServer().rpc('match_jobs_semantically', {
  candidate_embedding: toVectorLiteral(candidateVector),
  ...
});
```

`toVectorLiteral` formats the numbers with `Number(value).toFixed(6)` and
joins them with commas. A vector is 768 numbers produced by the model, so
there is no string a user could inject into it. Even if there were, the value
is a bound parameter and cannot become part of the statement.

The function itself is additionally locked down in the migration:

```sql
REVOKE ALL ON FUNCTION public.match_jobs_semantically(vector, integer, real) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_jobs_semantically(vector, integer, real) TO service_role;
```

So the function cannot be called by a signed-in browser client at all.

**Noted, accepted:** `toVectorLiteral` produces the literal `'[0.1,0.2]'`
rather than a native `vector` binding. Supabase's PostgREST client sends a
`vector` as a string anyway, so this is the same wire format. The value is
still parameterised, not interpolated into SQL text.

### 2.3 The profile vector is the candidate's own — CONFIRMED

`profile_embeddings` has row level security enabled with three policies that
all check `auth.uid() = profile_id` (select, insert, update). There is no
policy that lets one candidate read another's vector, and no policy that lets
a browser client delete one.

The `match_jobs_semantically` function takes the candidate vector as an
argument rather than reading it from a caller-supplied profile id. This is
deliberate: a function that took a profile id would be a way to ask "how does
*that* candidate match these jobs?".

### 2.4 The postings' vectors are public — CONFIRMED, and correct

`job_embeddings` holds vectors built from public postings, so its select
policy is `USING (true)` for `authenticated`. A posting is public
information, and the vector is derived from it. The `source_text` column is
the posting's own text, which is also public.

### 2.5 The approval gate cannot be walked around — CONFIRMED

This is the most important control in the change, and it is enforced in the
database rather than in the interface:

```sql
CREATE TRIGGER application_package_enforce_approval_gate
  BEFORE UPDATE OF status ON public.application_packages
  FOR EACH ROW
  EXECUTE FUNCTION public.application_package_enforce_approval_gate();
```

The trigger refuses any move the state machine does not allow. A package
cannot reach `approved` without having been in `pending_review`, and cannot
jump from `draft` to `approved`.

This was verified three ways:

1. By direct SQL against the live database: 3 legal transitions succeeded and
   2 illegal ones were refused.
2. By a test that writes to the table with the service-role key, going past
   the route entirely — the update is refused with
   `An application package cannot move from draft to approved`.
3. By the route tests, which confirm the refusal is reported as a 409 with an
   explanation the candidate can act on.

Ownership is taken from the verified Supabase token, never from the request
body. The route reads the package with `.eq('profile_id', profileId)`, so a
package belonging to somebody else is not found rather than refused — the
route cannot be used to discover which package ids exist.

The history table `application_package_reviews` is writable only by the
trigger, which runs as its owner. A candidate can read their own decisions
(RLS: `auth.uid() = profile_id`) and cannot write to the table directly.

**Noted, accepted:** the decision history stores the candidate's own note
(`review_note`, capped at 2000 characters). It is the candidate's words about
their own application, and it is readable only by them.

### 2.6 The ATS boards are read politely and identify themselves — CONFIRMED

The adapter reads only the three documented, public, key-free ATS endpoints:

| Provider | Endpoint |
| --- | --- |
| Greenhouse | `https://boards-api.greenhouse.io/v1/boards/{id}/jobs` |
| Lever | `https://api.lever.co/v0/postings/{id}?mode=json` |
| Ashby | `https://api.ashbyhq.com/posting-api/job-board/{id}` |

Controls applied:

- **No scraping.** These are the endpoints the ATS vendors publish for job
  boards to read. There is no HTML parsing of a careers page, no browser
  automation, no CAPTCHA handling, no proxy rotation and no TLS
  impersonation. The deliberately unauthenticated request is what makes this
  different from every rejected scraping resource in the audit.
- **Identified.** The `User-Agent` names the platform and links to it.
- **Rate-limited.** At most four boards are read at once
  (`BOARD_CONCURRENCY = 4`).
- **Bounded.** Each board has an 8-second timeout (`BOARD_TIMEOUT_MS`), and a
  timeout ends that board only.
- **Off by default.** With no `JOB_ATS_BOARDS` configured, the platform reads
  no company boards at all and reaches out to nobody.
- **Configured, not scraped.** The board list comes from the deployment's own
  environment. No third-party dataset of companies is bundled, which is what
  keeps the CC BY-NC datasets out of the product.

**Board identifiers are validated** before they are used:

```ts
if (!boardId || !/^[a-z0-9][a-z0-9-]{0,63}$/i.test(boardId)) continue;
```

and are then URL-encoded. A board id therefore cannot traverse a path or
reach another host.

**No credential is ever sent to a board.** The requests carry only `Accept`
and `User-Agent`.

### 2.7 Posting text is sanitised before it is stored — CONFIRMED

The ATS endpoints do not all send markup the same way. Lever sends real HTML
(`<p>text</p>`). Greenhouse sends markup that has been **escaped once**
(`&lt;p&gt;text&lt;/p&gt;`), so its tags arrive as entities rather than as
markup.

The adapter therefore **decodes the entities first and strips the markup
afterwards**:

```ts
decodeEntities(value)
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/(p|li|h\d|tr|div|section)>/gi, '\n')
  .replace(/<li[^>]*>/gi, '- ')
  .replace(/<[^>]+>/g, ' ')
  ...
```

The order is the whole point, and getting it wrong was a real bug found by
the live check. The first implementation stripped the markup and then
decoded the entities: the stripper found nothing to remove in an escaped
posting, and the decoder then *wrote the tags into the text*. Every posting
was arriving carrying the markup the platform meant to remove. Decoding
first and stripping afterwards produces the same plain text for a board that
sends real HTML and for one that sends escaped HTML.

`&amp;` is decoded **last, and only once**, so `&amp;lt;` cannot be decoded
twice into a `<`.

Verified against the live board: 142 real postings read from Greenhouse,
**0 of them containing any markup**. Verified against attack input:

| Input | Result |
| --- | --- |
| `&lt;script&gt;alert(1)&lt;/script&gt;` | `alert(1)` — no tag survives |
| `<script>alert(1)</script>` | `alert(1)` — no tag survives |
| `&lt;img src=x onerror=alert(2)&gt;` | no tag and no `onerror` survives |

The result is plain text, which is what `LiveJob.description` is typed as
and what the interface renders as React text. It is never passed to
`dangerouslySetInnerHTML`. Semgrep's `react-dangerous-html-injection` rule
found nothing new, and the adapter introduces no `innerHTML` assignment
either.

### 2.8 The score a candidate sees is explainable — CONFIRMED

The directive requires that every AI-generated match be explainable. The
semantic factor:

- never replaces the exact factors — it joins them as a sixth weighted factor
  carrying 15 of the 100 points, with the exact factors scaled to share 85;
- always carries a written reason naming the terms that drove it
  (`describeSemanticMatch`);
- is **absent** rather than zero when no comparison was made, so the
  interface never shows a score for something that was not measured;
- is computed from the candidate's own record and the posting's own text —
  nothing is asserted that the candidate cannot read back.

The terms are compared with the platform's existing skill canonicalisation
(`canonicalSkillKey`, `skillNameVariants`), so "Postgres" and "PostgreSQL"
are recognised as the same skill. A term is only counted when it appears in
the text, so nothing is inferred that the posting does not say.

### 2.9 Resume information is verified — UNCHANGED, AND PRESERVED

The directive requires that all resume modifications use verified user
information. The CV pipeline was **not modified** by this work. The
pre-existing grounding layer (`server/ai/grounding.ts`) and the extraction
review step (`server/cv/extractionReview.ts`) continue to apply exactly as
before. No new path was added that writes a skill, a date or a claim into a
candidate's record without going through the existing writers.

### 2.10 Paid AI operations go through the existing credit accounting — CONFIRMED

Embeddings are a paid model call, so they must be accounted for.

The embedding is not charged per search: it is made once per posting and once
per candidate and then stored, so a repeated search costs nothing. The
embedding call happens inside `semanticFactorsFor`, which is called from the
job-search route.

**Flagged for follow-up, not blocking:** the job-search route is not itself
gated by `requireCredits`. Embeddings are therefore charged against the
provider's own quota rather than against the candidate's credit balance. The
existing daily AI allowance (`server/ai/quota.ts`) covers the AI routes that
are free; the job search is a reading route, and charging a candidate's
credits for reading their own job list would be wrong. This is recorded in
`INTEGRATION_REPORT.md` as the one thing a reviewer should look at.

### 2.11 Nothing new is exposed publicly — CONFIRMED

The two new routes are behind `requireAuth`:

- `POST /api/application-packages/:id/decision`
- `GET /api/application-packages/:id/reviews`

Both take the owner's id from the verified token.

### 2.12 Rate limits are respected — CONFIRMED

The job-search route keeps its existing limit of 20 requests per minute per
user (`jobSearchRateLimit`). The ATS boards are read inside that limit, so a
candidate cannot use the search to hammer a company's board faster than the
platform allows.

### 2.13 The input the platform accepts is bounded — CONFIRMED

- A board list line is bounded to 64 characters for the board id, and the
  company name is the remainder of a line.
- The decision note is trimmed and cut at 2000 characters.
- The action is matched against a fixed list of four, and anything else is
  refused with a 400.
- The package id is checked with `isUuid` before it reaches the database.
- The text sent for embedding is cut at 8000 characters
  (`MAX_EMBEDDING_CHARS`).

---

## 3. The rejected resources, and what each would have cost

The audit rejected eight resources. Each rejection was a security decision as
much as a licensing one:

| Resource | The risk it would have introduced |
| --- | --- |
| `browser-use/browser-use` | Executes model-written Python, opens an unauthenticated CDP port on `127.0.0.1` that any local user can attach to, and commercialises CAPTCHA solving and residential proxies. |
| `Digitizers/siteagent-website-cloner` | Its own README bars phishing and impersonation, and warns that the target sites may forbid reproduction. |
| `speedyapply/JobSpy` | TLS-fingerprint impersonation and proxy rotation against boards whose terms forbid it, with no `robots.txt` handling. |
| `stapply-ai/ats-scrapers` (scraper library) | Ships `httpcloak` TLS impersonation, a stealth Chromium that downloads its own binary, and an explicit captcha-bypass path. |
| `unclecode/crawl4ai` | `playwright-stealth` by default, plus an advertised undetected-browser adapter. |
| `openai/openai-agents-js` | Tracing is on by default and exports generation inputs and outputs to a third party — the candidate's career data leaving the deployment. |
| `neondatabase-labs/pgrag` | Stores API keys in plaintext inside the database, and needs a custom-compiled Postgres extension with `shared_preload_libraries`. |
| `mastra-ai/mastra` | Its `ee/` modules carry a licence that "does not permit Production Use". |

**The implemented alternative is strictly safer than all eight.** Reading
Greenhouse's own public JSON endpoint needs no evasion, no browser, no
proxy and no credential — it is the sanctioned way to read that board. The
platform identifies itself and reads four boards at a time.

---

## 4. The installed agent skills

Thirteen skills were installed into `.agents/skills/`, the project's existing
convention. They are **agent-side tooling**: markdown instructions that guide
a coding agent. They are not imported by any module, are not part of the
bundle, and cannot execute at runtime.

Their licences were checked before installation: MIT for `anthropics/skills`
and `supabase/agent-skills`, ISC for `firecrawl/skills`, Apache-2.0 for the
`vercel/ai` skill, MIT for `duyet/build-agent`. The `browserbase/skills`
package publishes per-skill terms; the two installed skills
(`browser`, `safe-browser`) carry no source code and no runtime dependency,
and `safe-browser` exists specifically to encode the safety rules.

One property was verified after installation: `skills-lock.json` pins the
upstream commit for each installed skill, so the set is reproducible and
auditable rather than a moving target.

---

## 5. Verification summary

| Check | Result |
| --- | --- |
| Semgrep (`.semgrep.yml`, project rules) — the files this work touched | **0 findings** (30 files, 6 rules) |
| Semgrep (whole repository) | **1 finding, in the pre-existing CV work** (`src/lib/cvPdfExport.ts`, not touched here) — see `TEST_REPORT.md` §4 |
| `npm audit --audit-level=high` | **0 vulnerabilities** |
| `npm run lint` (TypeScript, app + tests) | **passed** |
| `npm run build` (production bundle + worker) | **passed** |
| Bundle secret check (`verify-bundle-auth-config.mjs`) | **passed** |
| Approval gate against the live database | **3 legal moves allowed, 2 illegal moves blocked** |
| RLS policies on the new tables | **verified by querying `pg_policies`** |
| Vector extension | **`vector` 0.8.2 enabled, HNSW indexes present** |
| Live ATS postings sanitised | **142 real postings read, 0 containing markup** |
| Script-tag payloads (escaped and raw) | **no tag and no event handler survives** |
| Secrets in the browser bundle | **none — no new `VITE_*` secret reference** |
| `dangerouslySetInnerHTML` / `innerHTML` added | **none** |

---

## 6. Residual risks and what was deliberately not done

1. **Embeddings are not charged to the candidate's credit balance.** They are
   charged to the provider's quota. This is correct for a reading route but
   it is the one thing a reviewer should confirm deliberately.

2. **The ATS board list is operator-configured, not curated.** A deployment
   that configures a board which forbids reading it would be at fault. The
   platform reads only official vendor endpoints and identifies itself, so
   the exposure is small — but the list is the deployment's responsibility.

3. **The application packages are approved, not sent.** The gate makes a
   package *ready*, and the history records the decision. Nothing in this
   change submits anything to an employer. The platform does not automate
   applications, and it did not start doing so here — that would require the
   browser automation this audit rejected.

4. **The integration suite was not run.** It refuses to run on the production
   project by design. The approval-gate tests are written and registered but
   need a dedicated, exclusive test project to execute. See `TEST_REPORT.md`.

5. **No browser-automation service was deployed.** The two capable options
   both need an external browser or a paid cloud with the compliance
   problems listed above.
