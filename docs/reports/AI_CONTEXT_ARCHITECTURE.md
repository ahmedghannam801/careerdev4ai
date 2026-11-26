# Aionvia AI — architecture audit and context-engine design

Status: audit of `main` at `a3d5200`. This document is the Phase 1 deliverable: what exists,
what is duplicated, what is unsafe, and the design that follows from it.

## 1. Stack

- React + TypeScript + Vite front end (`src/`), Express-compatible API in `app.ts` served by
  `server.ts` in development and by a worker bundle (`worker/`) on Cloudflare Pages.
- Supabase (Postgres + Auth + Storage) accessed **server-side only** through `server/db/*.ts`.
  The browser receives DTOs; it never holds a service-role key.
- The API is the only place a model is called. No provider key is reachable from the bundle.

## 2. What the AI already does

| Feature | Route / module | Model call | User context |
| --- | --- | --- | --- |
| Copilot chat | `POST /api/copilot` (`app.ts:2139`) | yes | full career context |
| Career analysis | `POST /api/analyze-career` (`app.ts:2293`) | yes | client-supplied skills + role title |
| ATS audit | `POST /api/optimize-cv` (`app.ts:2379`) | yes | CV text + grounding profile |
| Mock interview | `POST /api/mock-interview` (`app.ts:2462`) | yes | role title from the client |
| Cover letter | `POST /api/generate-cover-letter` (`app.ts:2620`) | yes | CV text + grounding |
| CV inline assist | `server/cv/aiAssist.ts` (`POST /api/cv/ai-assist`) | yes | CV section text |
| Job description read | `server/cv/jobDescription.ts` | yes | job text |
| Tailored CV | `server/cv/jobDescription.ts` (`POST /api/cv/job-description/generate`) | yes | CV + job text |
| Project analysis | `POST /api/projects/analyze` (`app.ts:3390`) | yes | project draft |
| Live voice interview | `server/interviews/live.ts` | yes (Gemini Live) | role + language |
| Roadmap generation | `POST /api/roadmap/generate` + `server/roadmap/service.ts` | deterministic | — |
| Learning explanations | `server/learning/ai.ts` | yes | learning context |
| Project ideas | `server/projects/recommendation.ts` | yes | profile signals |
| Job matching | `server/jobs/*`, `server/jobs/tasks/aiMentor.ts` | partly | job + profile |

Provider layer: `server/ai/provider.ts` — Gemini (`@google/genai`) with OpenRouter as a
controlled fallback, one retry on transient errors, in-flight de-duplication and an audit log.
Quota: `server/ai/quota.ts` (per-user and per-project daily budget) plus the token ledger
(`server/credits/*`, `shared/credits.ts`).

## 3. What is already right

- The career context is read **server-side for the verified user** (`server/ai/careerContext.ts`).
- Model output is checked against the user's real record (`server/ai/grounding.ts`), and an
  ungrounded sentence is removed rather than shown.
- Language is an explicit, normalised code (`shared/aiLanguages.ts`), not inferred.
- A missing key, an empty answer or a provider failure is reported honestly; no canned text is
  presented as a model answer.
- Learning recommendations are deterministic first; the model may only explain a given candidate.

## 4. Findings

### F1 — the platform does not know itself (high)
No AI prompt tells the model what Aionvia is, which pages exist, what a plan entitles, or what a
token costs. Asked "how many tokens is a premium template?", the model can only guess. This is the
largest source of invented product claims.

### F2 — in-flight de-duplication can cross users (security, high)
`requestDedupeKey()` in `provider.ts` hashes only `contents`, `responseMimeType` and `model`. The
copilot sends `userPrompt` as `contents` and the whole user context as `systemInstruction`, so two
users who type the same sentence in the same second share one in-flight promise and one receives
the other's personalised answer. The system instruction must be part of the key.

### F3 — the fallback provider never receives the system instruction (high)
`universalAi.models.generateContent({ config: { systemInstruction } })` passes the instruction
inside `config` for Gemini, but `callOpenRouterInternal()` reads only `request.systemInstruction`.
Every fallback therefore runs without the career state, the honesty rules and the language
instruction — the exact moment the user most needs them.

### F4 — duplicated prompt scaffolding (medium)
`aiLanguageInstruction()` and `groundingRules()` are pasted into nine inline prompts in `app.ts`,
each with its own phrasing of the honesty rules. Every new rule has to be added in nine places.

### F5 — context is all-or-nothing (medium)
`loadAiCareerContext()` performs twelve reads on every call, including roadmaps and learning,
even for a CV rewrite that needs experience and skills only. Cost and latency follow.

### F6 — no conversation memory (medium)
The copilot is stateless. Follow-ups ("and the second one?") arrive with no referent, and the
browser's transcript is the only history.

### F7 — no scope policy (medium)
Nothing tells the model to keep to career, learning, employability and the platform itself.

### F8 — inline prompts are not grounded in the user (low/medium)
`/api/analyze-career`, `/api/mock-interview` and `/api/optimize-cv` accept the role, the skills and
the CV text from the request body. A modified client can therefore ask for advice about a role the
user has not chosen or skills they do not have. The verified profile is available and unused.

## 5. Database surface used by the AI

`profiles`, `user_skills` (+ `skills` catalogue), `experiences`, `educations`, `projects`,
`volunteer_experiences`, `certifications`, `courses` and `user_learning_items`, `roadmaps`,
`roadmap_phases`/`milestones`/`tasks`, `evidence_items`, `job_applications`, `job_bookmarks`,
`interview_sessions`, `live_interview_sessions`, `cvs`/`cv_versions`, `cover_letters`,
`preferences`, `subscription_plans`, `subscriptions`, `ai_credit_ledger`, `daily_credit_grants`,
`cv_ai_edit_counters`, `ai_credit_failures`, `populations`-free lookups.
All of them are read through `server/db/*` with the caller's id; RLS is enabled on every table and
the server never trusts an id from the body.

## 6. Design

```
  request (verified session, language, feature, prompt)
        |
        v
  AI Orchestrator  (server/ai/contextEngine.ts)
    +-- Context Builder        careerContext.ts, section-filtered
    +-- Knowledge Retriever    platformKnowledge.ts, scored per feature + query
    +-- Scope + honesty policy prompts/policy
    +-- Memory                 aiConversations.ts (last turns + summary)
    +-- Provider Adapter       provider.ts (Gemini -> OpenRouter)
    +-- Response Validator     payload schema + grounding.ts
```

Each feature declares *what it needs* (`sections`, `knowledge`, `role`) instead of assembling its
own prompt. The engine composes the system instruction once, so a new rule lands everywhere.

## 7. Non-negotiables kept from the existing system

- the user id always comes from `requireAuth`; the engine refuses an empty or client-supplied id;
- no service-role key or provider key ever reaches the bundle;
- every AI route keeps its quota and credit behaviour exactly as before;
- a failed call still produces an honest failure, never fabricated content;
- additive migration only; no existing table or policy is weakened.
