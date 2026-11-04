# Interview Preparation

Question banks, mock interviews, and the practice loop.

## What belongs here

- The question bank and how questions are organised and tagged.
- Interview session flow: select a role/competency → answer → review.
- Self-assessment against a model answer.
- Recording or typed-answer capture.
- Progress across competencies, and what to practise next.
- The link between interview questions and the roadmap's skills.

## Current implementation

`src/components/views/InterviewsView.tsx`, `src/data/interviewBank.ts` (question bank), `server/db/interviewSessions.ts` (session persistence), `server/db/guides.ts`.

**Verified gap:** the question bank and session persistence exist. **No recording, scoring or feedback loop was found.**

## References

| Ref | URL | Note |
| --- | --- | --- |
| V5 | https://www.careerflow.ai/ | "AI Mock Interview" badged "New!" — visible, prominent placement |
| V6 | https://www.tealhq.com/ | "AI Interview Practice" as a named, standalone tool in the feature grid |
| V8 | https://roadmap.sh/ | Interview questions as **links inside roadmap topics** — the model to copy |
| V15 | https://www.techmagic.co/ai-design-patterns/copilot | Right-side side-panel placement for an AI interviewer |

## Design rules

- Interview questions should be reachable from the roadmap topic that needs them. A separate "interviews" surface is a duplicate of the same content.
- Practice is a **loop**: question → answer → self-score against a rubric → next question. A question list without an answer step is a reading list.
- Model answers must not be shown before the user answers — that turns practice into copying.
- Scoring against a rubric is more honest and more useful than an opaque AI grade, and it costs less AI budget.
- Any AI feedback must state which rubric it used and allow disagreement.

## Open work

- Self-assessment loop with a model-answer rubric — gap **G16**.
- Link interview questions into roadmap topics — pairs with gap **G3**.
