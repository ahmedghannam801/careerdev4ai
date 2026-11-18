# Test Report — CareerDev4AI resource integration

**Date:** 2026-11-18
**Base commit:** `4512d84 fix(jobs): say when the boards were really read`
**Branch:** `main`

Every check below was run in this working tree. Where a check did not run, or
did not pass, that is stated plainly — nothing here is reported as passing
that was not observed to pass.

---

## 1. Summary

| # | Check | Command | Result |
| --- | --- | --- | --- |
| 1 | TypeScript (app + tests) | `npm run lint` | **PASSED** |
| 2 | Unit suite (Vitest) | `npm run test:run` | **PASSED** — 6 files, 36 tests |
| 3 | Database-free suite | `npm run test:logic` | **2 FAILURES — pre-existing, not from this work** (§4) |
| 4 | New unit tests | `node --import tsx --test tests/resource-integration.test.ts` | **PASSED** — 40 tests |
| 5 | Jobs + matching contracts | `node --import tsx --test tests/resource-integration.test.ts tests/jobs-feed-contract.test.ts tests/job-matching.test.ts` | **PASSED** — 51 tests, 0 failures |
| 6 | Browser tests (Playwright) | `npm run test:e2e` | **PASSED** — 1 test |
| 7 | Security scan (Semgrep) | `semgrep scan --config .semgrep.yml --error` | **1 finding — pre-existing, not from this work** (§4) |
| 8 | Security scan on the new code only | same rules, scoped to the 30 changed files | **PASSED** — 0 findings |
| 9 | Dependency audit | `npm audit --audit-level=high` | **PASSED** — 0 vulnerabilities |
| 10 | Production build | `npm run build` | **PASSED** |
| 11 | Bundle secret check | `scripts/verify-bundle-auth-config.mjs` (runs in the build) | **PASSED** |
| 12 | Integration suite (database) | `npm run test:integration` | **NOT RUN — refused by design** (§5) |
| 13 | Live ATS adapter | direct call to the three official endpoints | **PASSED** — 142 postings read, 0 with markup left (§3) |
| 14 | Approval gate on the live database | direct SQL against the migration's trigger | **PASSED** — 3 legal moves allowed, 2 illegal moves blocked |

---

## 2. What was run, in detail

### TypeScript

```
> careerdev4ai@1.0.0 lint
> tsc --noEmit && npm run typecheck:tests

> careerdev4ai@1.0.0 typecheck:tests
> tsc --noEmit -p tsconfig.tests.json
```

Clean, for the application and for the test tree.

### Vitest

```
 Test Files  6 passed (6)
      Tests  36 passed (36)
   Duration  26.91s
```

### The new unit tests

`tests/resource-integration.test.ts` — 40 tests, all passing. They cover:

| Group | What it pins down |
| --- | --- |
| The board list | A board per line and per comma; the company name optional; an unknown provider ignored; a board id with a path in it refused; comments and blank lines ignored; the same board not read twice; nothing configured means nothing read |
| The provenance of a posting | Every source has a label; the provider's board name is read as written; a board the platform does not present is a Google Jobs posting; a declared source the platform presents is accepted; one it does not present is refused; a posting read from a company board says so |
| The description of a posting | Plain text taken as it is; real HTML stripped; **escaped** HTML stripped (the Greenhouse case); no markup left in an escaped posting; a script tag does not survive, escaped or not; an ampersand decoded once and not twice; a list becomes lines; no description means no description |
| The semantic factor | The exact weights are untouched when it does not join them; the total is shared and still a hundred; the exact factors keep their proportions; the factor is added to the breakdown; the contribution is added to the score; a factor that was not evaluated is left out; the terms the two texts share are found; a term the posting does not mention is ignored; the reason says what drove it |
| The approval gate | The four states; a refusal is explained in the interface's own words; a package cannot be approved without having been reviewed |

### The existing jobs contracts

`tests/jobs-feed-contract.test.ts` and `tests/job-matching.test.ts` still pass.
The contract test's assertion was **extended**, not weakened: it now expects
the sixth board and its label, and it still asserts that Wonderin publishes
no feed and that the interface says so.

### Browser tests

```
Running 1 test using 1 worker
  ok 1 e2e\smoke.spec.ts:3:1 › production build loads the public CareerDev4AI landing page (2.5s)
  1 passed (10.1s)
```

### Production build

```
✓ built in 43.92s
[build-worker] wrote dist\_worker.js (4.26 MiB)
[bundle-auth] the bundle carries the public Supabase configuration and all 4 sign-in methods (entry chunk: index-CzFand6v.js)
```

The chunk-size warning about the 1.1 MB entry chunk is pre-existing and
unrelated to this work.

### Security

Semgrep over the whole repository, with the project's own six rules:

```
Findings: 1 (1 blocking)
  src\lib\cvPdfExport.ts
  javascript-unsafe-innerhtml-assignment
  541┆ paperHolder.innerHTML = paperHtml;
```

Semgrep over **only the files this work touched** — 30 files, including every
new module, the modified shared modules, the route and the interface:

```
Ran 6 rules on 30 files: 0 findings.
```

`npm audit --audit-level=high`: **found 0 vulnerabilities**. No new dependency
was added, so the audit result is unchanged from the baseline.

---

## 3. Live verification, not just unit tests

Two features were verified against real systems rather than only against
fixtures.

### The ATS adapter, against the real vendor endpoints

```
live jobs: 142 | still containing markup: 0
sample: "Figma is growing our team of passionate creatives and builders on a
mission to make design accessible to all. Figma's platform helps teams bring
ideas to life..."
```

142 real postings were read from Greenhouse's public board endpoint, and
every one of them arrived as plain text.

**This found a real bug, which was fixed.** The first implementation stripped
the markup and then decoded the HTML entities. Greenhouse does not send
markup — it sends markup that has been *escaped once*, so the tags arrive as
`&lt;p&gt;` rather than `<p>`. Stripping first therefore found nothing to
remove, and the decoder then *wrote the tags into the text*. Every posting
was arriving carrying the markup the platform meant to remove.

The fix is to decode first and strip afterwards, and to decode `&amp;` last
and only once so that `&amp;lt;` cannot be decoded twice into a `<`.

Three ATS boards were also read end to end during the work:

| Board | Endpoint | Result |
| --- | --- | --- |
| `greenhouse:figma` | `boards-api.greenhouse.io/v1/boards/figma/jobs?content=true` | 142 postings |
| `ashby:attio` | `api.ashbyhq.com/posting-api/job-board/attio` | read |
| `lever:matchgroup` | `api.lever.co/v0/postings/matchgroup?mode=json` | 68 postings |

The `content=true` parameter matters: without it Greenhouse answers with the
metadata alone and every posting arrives with an empty description. That was
also found by the live check and fixed.

### The approval gate, against the live database

The migration was applied to the project's Supabase project and the trigger
was exercised directly:

```
allowed: 3, blocked: 2
```

- `draft → pending_review` — allowed
- `pending_review → approved` — allowed
- `approved → rejected` — **blocked**
- `approved → draft` — allowed
- `draft → approved` — **blocked**

The refusal message is `An application package cannot move from draft to
approved`.

The `vector` extension is enabled and the HNSW indexes exist:

```
extname | extversion
vector  | 0.8.2

job_embeddings_hnsw_idx
profile_embeddings_hnsw_idx
```

The RLS policies on the new tables were read back from `pg_policies` and
confirmed: `job_embeddings` is readable by any signed-in candidate (the
postings are public), `profile_embeddings` is selectable/insertable/updatable
only where `auth.uid() = profile_id`, and `application_package_reviews` is
selectable only where `auth.uid() = profile_id` with no client write policy.

---

## 4. The two failures, and why they are not from this work

The database-free suite reports two failures:

```
✖ has one navigation, not two          (tests/cv-studio.test.ts)
✖ has an Arabic entry for every translated string   (tests/localization.test.ts)
```

**Both are caused by the CV Studio work that was already in progress in this
working tree when this task began.** The evidence:

1. **The first `git status`** taken at the start of this task already listed
   `src/components/views/CVStudioView.tsx`,
   `src/components/cv/studio/CvSectionOrderControl.tsx` and the CV export
   files as modified, and `src/components/cv/studio/CvDraftRecovery.tsx` and
   `src/components/cv/studio/CvSaveStatusIndicator.tsx` as untracked. None of
   them was touched by this work.

2. **The failing assertions are about those files.** The navigation test
   asserts that `CVStudioView.tsx` contains no `<nav>`; the CV work added a
   `<nav>` at line 733 for the mobile editing navigation, and `git diff`
   confirms that line is an addition in the uncommitted CV work.

3. **The missing Arabic strings are all in the CV files.** The 18 strings
   still missing are `Recover draft`, `Could not save your latest changes.`,
   `Show this section on the CV`, `Preparing fonts...` and the rest — all of
   them from `CvDraftRecovery.tsx`, `CvSaveStatusIndicator.tsx`,
   `CvSectionOrderControl.tsx` and `CVStudioView.tsx`.

4. **The failures reproduce with this work removed.** Stashing only this
   work's source changes and re-running the two files reproduces both
   failures exactly, with the CV work still in the tree:

   ```
   ✖ has one navigation, not two
   ✖ has an Arabic entry for every translated string
   ```

5. **This work's own string was fixed.** The localisation test initially also
   reported `Semantic match` — the label this work adds. It was given its
   Arabic entry (`التطابق الدلالي`), and the missing list went from 19 to 18.

The Semgrep finding is the same story: `src/lib/cvPdfExport.ts` line 541
assigns `paperHolder.innerHTML = paperHtml`, and `git diff` confirms that
line is an addition in the uncommitted CV export work.

**The CV work was deliberately not touched.** It belongs to another piece of
work in progress, and "fixing" it here would either edit someone else's
unfinished feature or paper over a test that is correctly reporting a real
inconsistency. It is left exactly as it was found.

---

## 5. The integration suite was not run

`npm run test:integration` **was not run**, and this is a deliberate
limitation of the environment rather than an oversight.

The suite refuses to start unless it is pointed at a dedicated, exclusive,
disposable Supabase project. `tests/env.mjs` enforces this by comparing the
project reference in `SUPABASE_URL` with the production reference and
refusing when they are the same:

```js
if (urlProjectRef === projectRefFromUrl(productionUrl)) {
  throw new Error('Unsafe Supabase test configuration: integration tests are forbidden on the production Supabase project.');
}
```

In this environment `.env.test` points at the production project
(`ciihprsfdojzvjnqgbxl`), which is the same reference as
`wrangler.jsonc`'s `VITE_SUPABASE_URL`. The suite therefore refuses to run —
correctly.

**What this means for the new tests:**

`tests/application-approval.test.ts` — 10 tests against the running API and
the live database — is **written and registered** (it is listed in
`tests/runner.mjs`, so it will run in the opt-in integration job) but has
**not been executed**.

To be explicit about what is and is not proven:

| Behaviour | Proven by | Executed here |
| --- | --- | --- |
| The trigger refuses `draft → approved` | direct SQL against the live database | **yes** |
| The trigger refuses `approved → rejected` | direct SQL against the live database | **yes** |
| The trigger records every decision | direct SQL against the live database | **yes** |
| The route returns 409 with an explanation | the integration test | **no** |
| The route refuses another candidate's package | the integration test | **no** |
| The route refuses an unknown action | the integration test | **no** |
| An anonymous caller is refused | the integration test | **no** |

The route logic itself is small and its state machine is covered by the unit
tests, but the six route behaviours above are **unverified by execution**.
They should be run before this reaches production.

Running them requires a dedicated Supabase test project and:

```
SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
SUPABASE_TEST_PROJECT_REF, SUPABASE_TEST_PROJECT_EXCLUSIVE=true
```

---

## 6. What was not tested, and why

| Not tested | Why |
| --- | --- |
| The semantic factor against real embeddings | It needs a `GEMINI_API_KEY` and a paid model call, and it writes to the production database's vector tables. The scoring logic, the term comparison and the reason text are covered by unit tests; the provider call itself is not exercised here. |
| The aggregation of two live sources at once | It needs a paid JSearch key and a configured `JOB_ATS_BOARDS`. Each source was verified separately against its real endpoint; the merge and deduplicate logic is straightforward and is exercised by the type checker. |
| The integration suite | §5 — the environment forbids it, by design. |
| The two failing checks | §4 — they belong to other, unrelated work. |

---

## 7. Reproducing these results

```bash
npm run lint            # typecheck, app and tests
npm run test:run        # Vitest
npm run test:logic      # the database-free suite
npm run test:e2e        # Playwright
npm run build           # production bundle, worker, and the bundle secret check
npm audit --audit-level=high
semgrep scan --config .semgrep.yml --error
```

The three new test files are:

```bash
node --import tsx --test tests/resource-integration.test.ts
node --import tsx --test tests/resource-integration.test.ts tests/jobs-feed-contract.test.ts tests/job-matching.test.ts
```

And the integration file, once a dedicated test project exists:

```bash
TEST_ONLY=application-approval npm run test:integration
```
