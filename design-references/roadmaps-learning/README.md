# Roadmaps & Learning

The roadmap surface, the learning catalogue, and credentials.

## What belongs here

- Roadmap structure and navigation (the roadmap → section → topic → **link** model).
- The learning catalogue: course cards, provider identity, availability, filters.
- Learning rail/carousel layouts.
- Progress states on course and roadmap items.
- Credential surfaces — provider, course, issue date, verification, share.
- Video-first learning presentation.

## Current implementation

`src/components/views/RoadmapView.tsx`, `src/components/views/LearningCenterView.tsx`.
Engine: `server/roadmap/service.ts`, `shared/roadmapGenerator.ts`, `server/db/roadmap.ts`, `server/db/careerMilestones.ts`, `server/learning/{ai,context,recommendation}.ts`, `server/db/learning.ts`, `shared/courseProviders.ts`, `shared/learningCoverage.ts`, `shared/learningCategories.ts`, `shared/learningResources.ts`, `shared/learningLinks.ts`, `shared/trainingResources.ts`.

**Verified structural note:** the roadmap leaf is currently a *task* (`roadmapPhases → milestones → tasks`, read at `src/components/views/ProgressView.tsx:9-10`). It is not yet the link-based model below.

## References

| Ref | URL | Note |
| --- | --- | --- |
| V8 | https://roadmap.sh/ | The reference data model; ⌘K search; `aria-pressed` filter chips; progress on the card |
| V9 | https://www.coursera.org/ | Credential as the paywall event; CDS token discipline; AI-coach side panel inside the learning surface |
| V1 | https://wuzzuftop.com/ | `/courses/` route alongside jobs and freelancing |
| V6 | https://www.tealhq.com/ | Two-column / three-column mega-panel layouts for a large catalogue |

## Design rules

- A roadmap item is a **link** (course, project, article, interview question), not a checkbox. The link is what makes the roadmap navigable.
- Filter chips use `aria-pressed` and the `rounded-full h-8` shape from roadmap.sh.
- Course cards must state provider tier and availability (`free` / `free_audit` / `paid` / `free_course_paid_certificate`) — the vocabulary already exists in `shared/courseProviders.ts`.
- Catalogue surfaces need ⌘K search plus a filter row before any card grid.
- Certificate availability is a **catalogue fact**; a certificate the user earned is a **credential** — do not conflate them.

## Open work

- Change the roadmap leaf from task to link — gap **G3**.
- Filter chips + catalogue search — gap **G10**.
- Credential issuance and verification — gap **G4**.
