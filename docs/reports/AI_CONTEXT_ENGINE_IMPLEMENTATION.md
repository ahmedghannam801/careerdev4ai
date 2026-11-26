# The AI context engine — implementation report

**Scope:** Phases 2–8 of the Career Intelligence Platform brief, delivered as an
enhancement of the existing AI infrastructure. No feature was rebuilt, no
table was dropped or altered destructively, and no UI, subscription,
authentication or integration behaviour was changed.

---

## 1. What the assistant now knows

Before this change each of the nine model call sites assembled its own prompt
from scratch. The result was that the assistant knew a lot about the
candidate and almost nothing about Aionvia: it could not say what a token
costs, which page holds the ATS audit, or whether the Learning Hub invents
courses — and a model that does not know the product will describe one.

The platform now has one instruction, composed from four verified sources:

| Source | Where it lives | What it contributes |
| --- | --- | --- |
| Platform knowledge | `server/ai/platformKnowledge.ts` | 13 entries of product facts, each naming the file that proves it |
| Candidate record | `server/ai/careerContext.ts` | The verified user's own career state, section by section |
| Feature registry | `server/ai/contextEngine.ts` | Persona, which sections that feature needs, which knowledge it gets |
| Rules | `server/ai/contextEngine.ts` | Scope, honesty, formatting, response language — identical for every feature |

Nothing in that list is generated. The knowledge entries are copied from the
code and the migrations that implement them, and a test fails if any of them
quotes a price (prices live in the plans table and are read from the screen).

The rules also settle which reading of a question wins. Asked "how many tokens
does a CV audit cost?", the deployed assistant first answered with market rates
for human CV reviews — true about the world, useless about the product the
candidate was standing in. The `PRODUCT_RULES` block now says that the
Aionvia facts are this product's own documentation, that a question about
tokens, plans or features is a question about those facts, and that a plan
price is never quoted (the Plans screen shows it).

---

## 2. The components

| Brief component | Implementation |
| --- | --- |
| AI Orchestrator | `runAiTask()` and `buildFeatureInstruction()` in `server/ai/contextEngine.ts` |
| Context Builder | `composeSystemInstruction()` — one plain-text instruction per request |
| Profile Retriever | `loadAiCareerContext(userId, { sections })` — reads only the declared sections |
| Knowledge Retriever | `selectPlatformKnowledge({ feature, query, limit })` |
| Platform Knowledge Base | `PLATFORM_KNOWLEDGE` (13 entries, with `source` per entry) |
| Relevance Filter | The keyword/term scorer in `selectPlatformKnowledge`, plus the feature's declared `sections` and `knowledgeLimit` |
| Response Validator | The existing per-feature payload validators, unchanged, plus the existing `stripUngroundedSentences` grounding pass |
| Memory Manager | `server/ai/conversationMemory.ts` + `server/db/aiConversations.ts` |
| Provider Adapter | The existing `server/ai/provider.ts` (Gemini → OpenRouter), now with two defects fixed |

### The request path

```
route (requireAuth)
  └─ runAiTask({ feature, userId: req.authUser.id, prompt, language })
       ├─ buildFeatureInstruction()
       │    ├─ loadAiCareerContext(userId, { sections })   ← only what the feature declared
       │    ├─ selectPlatformKnowledge({ feature, query }) ← always tagged entries + question match
       │    └─ composeSystemInstruction()                  ← role + facts + context + rules + language
       └─ generateContentUnified({ contents, systemInstruction, config })
            └─ provider.ts: Gemini, then OpenRouter, 1 retry, audit log
```

---

## 3. Identity and isolation

* The user id is always `req.authUser!.id`, set by `requireAuth` from the
  access token. No route reads an id from the body, and `runAiTask` throws
  `UnverifiedUserError` when it is given an empty, placeholder or malformed
  id — so a new call site cannot accidentally build a prompt for "whoever".
* The conversation tables carry `profile_id` and their own RLS policies
  (`profile_id = auth.uid()` on select/insert/update/delete).
* A conversation id that belongs to another candidate is answered exactly
  like an id that does not exist (`404`), so the endpoint cannot be used to
  probe for somebody else's threads.
* Server-side reads still go through the service-role client, as the rest of
  `server/db/` does; the browser never receives an id or a row that is not its
  own, and no provider key or service-role key is in the bundle.

---

## 4. Defects fixed in the provider

**F2 — the in-flight dedupe could merge two users' requests.**
`requestDedupeKey()` keyed on `contents + responseMimeType + model` only. Two
candidates who typed the same sentence in the same second shared one promise,
and one of them received the other's personalised answer. The key now includes
a fingerprint of the system instruction (hashed: the instruction is personal
and is not put in a key). `server/ai/provider.ts`.

**F3 — the OpenRouter fallback lost the system instruction.**
`callOpenRouterInternal()` read only `request.systemInstruction`, while every
caller passes the instruction in `config.systemInstruction` (the Google SDK
shape). On the fallback provider the assistant therefore ran with no career
state, no honesty rules and no language instruction — precisely when the
primary provider had already failed. It now reads both, and the
`universalAi.models.generateContent` shim lifts the config value to the field
the adapter reads. `server/ai/provider.ts`.

**F4 — the primary Gemini path dropped the system instruction entirely.**
Found in production, not in review. The context engine sends the instruction
as `request.systemInstruction`; `callGeminiInternal()` forwarded only
`request.config` to the SDK, which reads the instruction from inside that
config. The field was therefore silently discarded on the provider that serves
almost every call, and the model answered as a bare chatbot: no persona, no
candidate record, no honesty rules — the conversation memory built here was
reaching a model that had never been told who it was. The two shapes are now
reconciled in one exported function, `resolveGeminiConfig()`, pinned by
`tests/provider-system-instruction.test.ts`. `server/ai/provider.ts`.

---

## 5. What each AI feature now receives

| Feature | Route / module | Sections | Knowledge |
| --- | --- | --- | --- |
| Copilot chat | `/api/copilot` | all 12 | copilot, general |
| Career analysis | `/api/analyze-career` | identity, role, skills, experience, education, projects, applications | general, jobs |
| ATS audit | `/api/optimize-cv` | identity, role, skills, experience, education, projects, certifications | cv, ats |
| CV inline writing | `/api/cv/ai-assist` | identity, role, skills, experience, education | cv |
| Job-description reading | `/api/cv/job-description/analyze` | identity, role, skills, experience, education, certifications | cv, ats, jobs |
| CV tailoring | `/api/cv/job-description/generate` | same as above (one instruction for both model calls) | cv, ats, jobs |
| Cover letter | `/api/generate-cover-letter` | identity, role, skills, experience, education, projects | cv, jobs |
| Mock interview feedback | `/api/mock-interview` | identity, role, skills, experience | interview |
| Professional summary | `/api/suggest-summary` | identity, role, skills, experience, education | cv |
| Project review | `/api/projects/analyze` | identity, role, skills, projects | projects |
| Learning explanations | `server/learning/ai.ts` | its own deterministic context (unchanged) + platform facts | learning |
| Live voice interview | `server/interviews/live.ts` | its own record-derived brief (unchanged) | — |

Two features are deliberately left on their existing architecture. The live
interviewer's brief is already built from the verified record and is bound
into an ephemeral token, so adding a second instruction source would weaken
it; and the Learning Hub's explanation layer must see exactly the candidates
the deterministic engine chose, so it keeps its own context and gains only
the platform facts.

---

## 6. Conversation memory

New migration: `supabase/migrations/20261201000001_ai_conversations.sql`.
Additive only — two new tables, three indexes, seven policies. No existing
table, column or row is touched.

| Table | Purpose |
| --- | --- |
| `ai_conversations` | one row per thread: owner, feature, title, language, rolling summary, `summarized_count` |
| `ai_messages` | the turns: owner, thread, `role` (`user`/`assistant`), content, time |

* The last 12 turns are sent verbatim; older ones are compressed.
* The summary is deterministic (no model call), bounded to 1,200 characters,
  rebuilt from the whole thread on a window boundary, and stored on the
  thread. It cannot introduce a fact that was not in the conversation.
* A failed model call stores nothing: a half-question never becomes history.
* A storage failure is logged and does not cost the candidate the answer they
  already received.

New endpoints (all `requireAuth`, all scoped to the verified user):

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/ai/conversations` | the candidate's 20 most recent threads |
| GET | `/api/ai/conversations/:id` | one thread and up to 100 turns (404 when not theirs) |
| DELETE | `/api/ai/conversations/:id` | deletes the thread and its turns |

`/api/copilot` accepts an optional `conversationId` and returns the id it used,
so the client continues the same thread. The browser holds only that id.

---

## 7. Performance and cost

* A feature reads only the sections it declared. The CV writer reads five
  groups instead of twelve.
* Knowledge is retrieved per request with a hard `limit` per feature (2–6
  entries), never the whole base.
* No private data is cached and no response is shared across users. The
  in-flight dedupe is now per-instruction, i.e. per user.
* Entitlements are untouched: token weights, daily budgets, plan allowances
  and the `requireCredits` gates were not modified, and every refund path
  that existed still runs.
* Memory maintenance costs one count query per reply and a full read once per
  six exchanges.

---

## 8. Tests

New file: `tests/ai-context-engine.test.ts` — 25 tests, no database, no model.

| Area | What is asserted |
| --- | --- |
| Knowledge base | every entry complete and unique, required entries present, **no price is quoted anywhere in it** |
| Retrieval | feature tagging, question-driven retrieval, the limit is honoured, nothing is returned twice |
| Composer | honesty and scope rules on every feature, language instruction present, rules placed after the facts, JSON variant, no stray headings |
| Registry | every feature defined, no undeclared section, focused tasks read strictly less than the copilot |
| Context block | narrowed sections really omit data, the full block carries every area |
| Identity | empty/placeholder ids refused, `UnverifiedUserError` thrown before any work |
| Scope hint | career questions never flagged, clearly unrelated messages get a note and no refusal |
| Memory | empty first message, recent-turns window, deterministic bounded summary, summarisation threshold |

Full gates:

```
npm run lint        ✓  (tsc --noEmit + tsc -p tsconfig.tests.json)
npm run test:logic  ✓  1654 tests (was 1629; +25)
npx vitest run      ✓  17 files, 104 tests
npm run build       ✓
```

---

## 9. Database migration

```bash
# review, then apply to the target project
npx supabase db push --dry-run
npx supabase db push
```

Applied to the linked project (`ciihprsfdojzvjnqgbxl`) on 2026-11-26. The CLI
could not open the direct database connection from this network ("IPv6 is not
supported on your current network"), so the same file was executed through the
Management API inside one transaction, and its version was recorded in
`supabase_migrations.schema_migrations` so a later `db push` skips it.
Verified afterwards: both tables exist, `relrowsecurity` is true on each, and
the seven policies (four on conversations, three on messages) are present.

Rollback (only if the feature is withdrawn):

```sql
drop table if exists public.ai_messages;
drop table if exists public.ai_conversations;
```

Dropping them loses conversation history and nothing else: no other table
references either one.

---

## 10. Environment variables

None added. The engine uses the providers already configured
(`GEMINI_API_KEY`, optional `OPENROUTER_API_KEY`, optional `GEMINI_MODEL`).

---

## 11. Unresolved / deliberately deferred

1. **Egyptian Arabic dialect.** The product's response languages are English,
   Modern Standard Arabic, French, German and Spanish (`shared/aiLanguages.ts`).
   A dialect option is a product decision plus translation work, so the
   assistant speaks MSA and the interface's Arabic today. Adding `ar-EG` means
   one entry in that catalogue and one instruction line — no engine change.
2. **`/api/analyze-career`, `/api/mock-interview` and `/api/optimize-cv` still
   accept a role title or CV text from the client.** That is intentional (the
   candidate may analyse an ad-hoc role, or audit a CV that is not saved yet)
   and the verified record now travels alongside it, but a caller can still
   describe a role that is not theirs to ask about.
3. **No UI for the thread list yet.** The memory is complete and exposed over
   the API; the Copilot panel keeps one thread per session and resumes it. A
   history panel is a UI change, not an architecture change.
4. **Response validation beyond payload shape.** Structural validation and
   grounding removal are in place; a full semantic verifier would need labelled
   data and is out of scope for this phase.
5. **Cost telemetry per feature.** The provider audit log records model and
   provider per call; per-feature token accounting would need a new column and
   is not needed to keep the current budgets honest.
