# AI Interface

The copilot, AI-generated surfaces, and the trust contract around them.

## What belongs here

- The copilot drawer: placement, anatomy, states.
- Context pins — which CV, role, job or roadmap item the AI is currently using.
- The conversation → action handoff.
- AI-assisted surfaces and their distinguishing treatment (`--color-ai`).
- Processing, quota, and error states (`src/components/ai/AIProcessingModal.tsx`).
- The "AI could not determine this" state — uncertainty as a UI state, not an error.
- Receipts: which records the AI used.
- AI-limits disclosure, in-product and public.

## Current implementation

`src/components/copilot/CopilotDrawer.tsx`, `src/components/copilot/AiResponse.tsx`, `src/components/ai/AIProcessingModal.tsx`, `src/components/ai/AiLanguageSelector.tsx`.
Engine: `server/ai/{careerContext,geminiConfig,grounding,groundingProfile,quota}.ts`, `src/translations/parts/aiLanguages.ts`.

**Verified gap:** the copilot exists and the server builds context, but **no UI surfaces which records the AI is using** (gap **G12**) and **no action handoff from a reply into a workspace** (gap **G13**).

## References

| Ref | URL | Note |
| --- | --- | --- |
| V15 | https://www.techmagic.co/ai-design-patterns/copilot | The right-side side-panel standard (Adobe, Shopify, HubSpot, GitLab, Notion, ClickUp) |
| V16 | https://www.parallelhq.com/blog/llm-chat-ux-patterns | Contextual prompt starters; visible, editable context; handoff to a real destination |
| V17 | https://apptension.com/guides/building-ai-copilots-inside-b2b-saas-ux-patterns-permissions-and-workflow-automation-using-a-starter-kit | Context pins; "explain with receipts"; action preview + undo; uncertainty as a UI state |
| V3 | https://emekly.com/ | Dark AI-surface treatment; restrained gold accent on one phrase only |
| V1 | https://wuzzuftop.com/ | Chat-first assistant with correct dialog semantics (`role="dialog"`, `aria-controls`) |
| V9 | https://www.coursera.org/ | AI coach inside the learning surface, not as a separate destination |

## Design rules

- **The AI violet is an accent role, never a second brand colour, and never a primary CTA.** This rule is written into `src/index.css:54-63` and is binding.
- Cap AI violet at ~5% of any screen. If a view reads purple, the role has been misused.
- Every AI surface must be visually distinguishable from a user-owned record — but distinguishable, not alarming.
- The copilot is a **right-side panel**, not a floating bubble over content.
- Uncertainty needs its own state, distinct from both empty and error. Say "I don't know" and name the inputs that would help.
- Show receipts: which CV, which role, which job. This is what stops the "what does *this* mean?" failure in a graph with dozens of entities.
- Every AI reply ends in a real destination: "Open in CV Studio", "Add to roadmap", "Track this application".
- Respect `server/ai/quota.ts` — the limit must be visible before the user hits it, not after.

## Open work

- Context pins and receipts — gap **G12**.
- Conversation → action handoff — gap **G13**.
- The uncertainty state — ux-analysis **S2**.
- ~~Fix `--color-ai-surface` in dark mode~~ — **resolved**; the dark AI set is now `#A893D4` / `#B7A5DE` / `#2A2535` / `#3E3552`. No action.
