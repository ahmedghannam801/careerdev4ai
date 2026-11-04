# Career Intelligence

Assessment, skill gap, target roles, and the career graph that connects them.

## What belongs here

- The assessment experience (questions, archetypes, traits, scoring).
- Skill-gap computation and its visualisation.
- Target-role selection and the role catalogue (`shared/careerRoles.ts`, `shared/careerDomains.ts`).
- Skill matching against live opportunities (`shared/skillMatching.ts`).
- The career graph: skills → learning → projects → evidence → roles → applications.
- Career plan and milestone surfaces (`src/components/views/CareerPlanView.tsx`, `MyCareerView.tsx`).
- Score explainability — the breakdown behind every number.

## Current implementation

`src/components/views/CareerAnalysisView.tsx`, `MyCareerView.tsx`, `CareerPlanView.tsx`, `src/components/brand/CareerJourneyVisual.tsx`.
Engine: `shared/skillGap.ts`, `shared/skillMatching.ts`, `shared/targetRoleSelection.ts`, `shared/careerSearch.ts`, `shared/careerDomains.ts`, `shared/careerRoles.ts`, `shared/roles/*.ts`.

## References

| Ref | URL | Note |
| --- | --- | --- |
| V7 | https://www.careerexplorer.com/ | Assessment → matches → **library**; the results must feed a destination, not a dead-end report |
| V1 | https://wuzzuftop.com/ | "AI MATCH" badge and a labelled skills-match bar |
| V3 | https://emekly.com/ | One quantified hero object instead of a tile grid |
| V8 | https://roadmap.sh/ | Structured progression (roadmap → sections → topics → links) as the model for the graph |

## Design rules

- **Every score is explainable.** A bare number is not a recommendation. Show the top three contributing factors and the single biggest fix (gap **G8**).
- Scores are rendered as labelled match bars, never as unlabelled bars.
- The graph is the product. Every surface should let the user see *why* one node connects to another.
- Assessment output must land in a real destination — Roles, Roadmap, Skills — not a results screen that stops the journey.

## Open work

- Score explainability UI — gap **G8**.
- Interactive career-graph visualisation — gap **G9**.
- 01/02/03 stepper on the assessment path — ux-analysis **P3**.
