# Platform Audit — What Was Found Working Correctly and Must Be Preserved

**Audit date:** 2026-11-01

This report records the parts of CareerPilot AI that are **already right**. They were
verified against the source and the live database, not inferred from the naming.
Nothing here was changed by this audit unless explicitly noted.

This matters as much as the defect list: a platform like this accumulates subtle
correctness that is easy to break while fixing something else. Each item below is
behaviour a future change could quietly undo.

---

## A. The AI grounding layer — the platform's strongest feature

The single most important thing this platform does is **never let a model write
something the user did not do**. That is enforced in code, not by prompt wording.

### A1. The validator is real and it drops, not warns

`server/ai/grounding.ts` builds a *grounding profile* from the user's actual records
(`buildGroundingProfile`) plus the user's own typed text (`withOwnText`), then checks
every model-produced string against it with `findUngroundedClaims`. A claim that
cannot be found is removed by `stripUngroundedSentences` — **only the offending
sentence is lost**, and what was removed is reported back to the user.

`server/cv/jobDescription.ts:361-369` states the contract plainly:

> Every line the model wrote is checked against the candidate's record before it is
> returned, and every id it used is checked against the records the server itself
> loaded. A line that names something the candidate does not have is dropped and
> reported.

**Preserve this.** It is the difference between a career tool and a career fiction
generator.

### A2. The server resolves its own records; the client's ids are never trusted

In `generateAtsCvContent`:

- experiences and projects are loaded from the database **by the verified user id**;
- `experienceIds` / `projectIds` are built from those loaded rows;
- the model's output is filtered with `.filter((entry) => experienceIds.has(entry.id))`.

A client that posts a fabricated id for somebody else's record gets nothing back.
This is the correct shape and it is already in place.

### A3. Skills on the generated CV are filtered against what the user owns

```ts
// server/cv/jobDescription.ts:528-539
const ownedSkillNames = new Set(groundingProfile.skills.map((name) => name.toLowerCase()));
const skills = parsed.skills.filter((skill) => { ... });
```

A skill the job description asks for but the candidate does not have cannot appear.
`keywordsUsed` is filtered the same way, against the actual match report.

### A4. The ATS score is a measurement, not an opinion

`shared/jobDescription.ts` computes the match report deterministically
(`buildAtsMatchReport`) and compares the candidate's record against the
advertisement. The comment at `server/cv/jobDescription.ts:11-13` is explicit:

> The comparison between the two is done by the shared engine, not by a model, so
> the ATS score is a measurement rather than an opinion.

**Preserve this.** A model-invented ATS score would be the most damaging possible
regression in this product.

### A5. The model is told the rules, and the rules are also enforced

`groundingRules()` (`server/ai/grounding.ts:265`) is appended to the system
instruction of every route that writes user-facing prose. The rules state: use only
the candidate data; never invent a company, date, metric, percentage, certification,
course, project or URL; if the data is not enough, say what is missing and stop.

Both layers exist. The prompt reduces how often it happens; the validator makes
certain it cannot survive.

### A6. The job description reading is checked against the pasted text

`groundJobDescriptionAnalysis(parsed, text)` verifies that the model's reading of
the advertisement is supported by the advertisement itself. If the model returns
something unparseable, `extractDeterministicJobDescription` takes over and the
response says `aiUsed: false, fallbackReason: 'invalid_response'` — the client is
told the reading was deterministic, not AI.

### A7. AI failure is honest

Across the AI routes, a missing model, an exhausted quota, a timeout and an invalid
response each produce a **distinct, explicit** outcome — never a fabricated result.
`server/cv/jobDescription.ts:225-264` covers all four. The test suite asserts it
("returns a real answer or an explicit failure, never invents content").

### A8. One provider, one implementation

`@google/genai` is the only AI dependency in `package.json`. There is no second
provider, no provider abstraction with an unimplemented branch, and no mock client
on a production path. **Preserve this** — the brief required it.

---

## B. Learning Hub ranking — relevance is gated by design

`server/learning/recommendation.ts` is a **pure, deterministic** engine. It never
calls a model; the AI layer only receives already-ranked candidates.

The scoring formula is the key design decision:

```
total = 100 × relevance × (0.85 + 0.15 × genericFit)
```

`genericFit` is everything a course's metadata says about it — beginner level,
English, short duration, the preferred format, a free price. Because it is capped at
15 %, **generic metadata can never outweigh relevance**. A course with no role, gap
or roadmap signal lands below 50 and can never be labelled the next step.

### The "Next Best Step" cannot be a generic course

Two independent gates:

1. `isStrongNextStep` requires the score, a minimum relevance **and** a strong signal.
2. `selectNextStep` returns an explicit **exploration mode** with a written reason
   when nothing clears the bar:

> "No catalogue course is strongly aligned with {role} right now. The options below
> are broader exploration, not a recommended next step."

This is exactly what the spec asked for: never present an unrelated generic course as
a directive. The engine is exported at factor level (`scoreCourse`) so the ranking is
testable.

### Skill-name drift is handled

A course that names the same capability differently from the role catalogue is
resolved through `shared/skillMatching.ts` (`createSkillLookup`,
`skillMatchConfidence`), and five phrasings of "SQL" cannot inflate the gap score —
the strongest contribution wins.

---

## C. The roadmap is regenerated safely

`server/db/roadmap.ts` and `server/roadmap/service.ts` implement a careful staged
replacement:

1. `captureTaskProgress(profileId)` captures the learner's progress **before**
   anything is written.
2. A profile has at most one roadmap (`UNIQUE profile_id`), so a replacement cannot
   be a second row. The new tree is written under **negative phase numbers**, which
   `listRoadmaps` never returns.
3. Only after every phase, milestone and task has been inserted and counted is the
   old tree deleted and the staged phases given their real numbers.
4. If anything fails before that swap, the staged rows are removed and **the
   learner's previous roadmap is untouched**.

Progress is carried across by the skill-name + title key. `syncPlanStatuses` copies
the persisted status back onto the freshly generated plan, so a client rendering the
plan never shows a completed step as untouched.

**Preserve this.** It is the difference between "regenerate" and "destroy".

---

## D. The CV is a projection of the records, not a second copy

`shared/cvProjection.ts` is the mechanism that makes §1's "one consistent source of
truth" true:

- A record the user has changes → the document changes, with nobody pressing a button
  (`tests/cv-projection.test.ts`).
- The candidate's **own wording survives** a record change. The candidate's text is
  preferred; the record fills the gap when the candidate wrote nothing.
- A deleted record leaves the document.
- A record the profile never held — imported content still waiting to be imported —
  is kept, distinguished by `isCanonicalRecordId`.

The CV skills are built from `public.user_skills` — the skills the candidate actually
rated or added — and **never** from a target role's requirements. Putting a
requirement on a CV would claim the candidate has a skill they never said they had
(`src/context/CareerContext.tsx:1503-1510`).

---

## E. Security — verified against the live database, not the source alone

### E1. RLS is on every table, with correct owner scoping

Checked directly against `pg_class` and `pg_policies` on the live database:
**43 of 43 tables have RLS enabled.** For each, the policies are scoped to the owner
column of *that* table:

| Table | Owner column | Policy scope |
|---|---|---|
| `cvs`, `evidence_items`, `user_learning_items`, `profile_certifications`, `roadmaps` | `profile_id` | `auth.uid() = profile_id` |
| `experiences`, `user_skills` | `user_id` | `auth.uid() = user_id` |
| `profiles` | `id` | `auth.uid() = id` |

`profiles` additionally has a separate `profiles_select_public` policy
(`is_public = true`) for the public-profile feature — intentional and correctly
scoped.

### E2. The server talks to the database with the service role; the browser does not

- `server/db/supabase.ts` is the **only** place the service-role key is read. It is
  server-side, lazily constructed, and never imported by `src/`.
- The browser uses `VITE_SUPABASE_PUBLISHABLE_KEY` — the modern publishable key, with
  RLS as the enforcement layer. That is the correct Supabase pattern.
- `grep` over `src/` finds **no** reference to the service-role key, the Gemini key,
  or any secret.
- `vite.config.ts` has no `define` block that could inline a secret into the bundle.

### E3. Authentication verifies the token with the auth server

`server/auth/supabase-auth.ts` calls `client.auth.getUser(token)` — a **server-side
verification request to Supabase Auth** — not `jwt.decode`, which would be forgeable.
Results are cached with a TTL and in-flight verifications are shared, so a dashboard
that fires many requests at once does not send a burst.

### E4. The verified user id is the only identity source

`server/auth/require-auth.ts` states it in the source:

> The verified Supabase user id is the ONLY identity source. A client-supplied user
> id in the body, query, or route params is never used for authorization.

Every route resolves the owner from `req.authUser!.id`. The routes that read an
identifier from the request body (`/api/profile`, the learning items, the bookmarks)
filter by the session user regardless.

### E5. Authenticated responses are not cached

`requireAuth` sets `Cache-Control: no-store` on every authenticated response, so a
browser cannot show a stale list — for example a CV version created after the cache
entry was written.

### E6. The CV file bucket is private and owner-scoped

`storage.buckets` on the live database:

- `cv-files` — `public: false`
- `file_size_limit` 10 MB
- `allowed_mime_types` restricted to pdf / doc / docx / txt / json
- four `storage.objects` policies, each requiring
  `storage_object_owner(name) = auth.uid()`

### E7. The routes that are open are open on purpose

`/api/health` (a liveness probe), `/api/learning/catalog` (public catalogue content),
`/api/profile/check-username` (availability) and `/api/profile/public/:username`
(the public-profile feature). The two aggregate `/api/state` routes are **not**
open — they verify the token themselves with `verifySupabaseToken` rather than using
the `requireAuth` middleware, and `/api/state` POST is explicitly non-destructive: it
never replaces a collection, and reports the collections it ignored.

### E8. The legacy state file is guarded

`.careerpilot_state.json` is a compatibility artefact. The test runner snapshots it
before the run and fails if the suite modified it, then removes it if the server
bootstrap created it. The runner also sweeps leftover test identities and catalogue
skill rows created by an interrupted run, and verifies that nothing remains.

---

## F. Navigation, localisation and the design system

### F1. The URL is the state of the application

`src/lib/routing.ts` provides `buildRouteHash`, `parseRouteHash`, `isKnownRoute` and
`resolveRouteId`. `src/App.tsx` writes the hash on navigation, listens for
`hashchange`, and **corrects an unknown route** with `history.replaceState` so the
URL always says what is on screen. Views carry their tab and filter state in the
hash too (`useRouteParam`), so a refresh reopens the same page. `tests/routing.test.ts`
covers it.

### F2. RTL is handled with logical properties

`dir` is set on the root from the account's language as soon as it is known
(`src/context/CareerContext.tsx:2309`). The codebase uses `ps-`, `pe-`, `ms-`, `me-`,
`text-start` and `text-end` throughout — logical properties that flip automatically.
Before this audit only seven physical utilities remained; all seven are now logical.

### F3. One provider, one design language

`src/index.css` defines the tokens — surfaces, text, borders, accents, the print
colour — and every view consumes them through `var(--…)`. There are no ad-hoc
colours, no TODO/FIXME markers, and **no mock, fake, placeholder or dummy data**
anywhere in `src/`, `server/` or `shared/`. There are also no dead controls: no
`onClick={() => {}}` and no `href="#"`.

---

## G. The data model protects the user's history

- **Dates are normalised at the database boundary.** `server/db/dates.ts` rejects
  contradictions (an end date before a start date) while accepting history — a role
  that ended years ago is normal; a role that ends before it starts is not.
  `tests/historical-dates.test.ts` covers it.
- **The importer never overwrites.** `shared/cvImport.ts` (`planPersonalImport`)
  decides per field whether the document is more authoritative than the profile, and
  existing values win by default.
- **The scan is not disguised.** A scanned PDF with no text layer is detected
  explicitly and reported as scanned — OCR is not implemented and the platform says
  so rather than pretending the document was unreadable for an unrelated reason.
- **The document the platform builds says what is missing.** A CV with no contact
  block parses and reports the missing fields rather than inventing them.
