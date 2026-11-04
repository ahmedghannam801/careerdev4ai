# Portfolio & Projects

The user's public profile, their projects, and the evidence they accumulate.

## What belongs here

- The public profile (`#/profile/<username>`), readable without a session.
- The profile's sections and their ordering.
- Projects: creation, status, description, links.
- Evidence and volunteer impact records.
- Sharing and discovery: OG meta, share buttons, indexing.
- The design of a portfolio a hiring manager will actually read.

## Current implementation

`src/components/views/PublicProfileView.tsx` (read-only public profile with experiences, education, certifications, skills, projects), `src/components/views/ProfileView.tsx`, `src/components/views/ProjectsView.tsx`, `src/components/views/EvidenceView.tsx`, `src/components/views/VolunteerView.tsx`.
Engine: `server/db/{profile,profiles,profileExtensions,projects,evidence,skillEvidence,volunteer,volunteerOpportunities}.ts`, `shared/profileLinks.ts`, `server/projects/{analysis,recommendation}.ts`.
Routing: `src/lib/routing.ts:13,106-110` — `#/profile/<username>` resolves without a session. SEO: `server/seo/publicPages.ts`, `server/seo/config.ts`.

**Verified note:** the public profile type already declares `PublicCertification` — the schema for credentials is half-built and waiting on gap **G4**.

## References

| Ref | URL | Note |
| --- | --- | --- |
| V24 | https://colorlib.com/wp/developer-portfolios/ | Work before biography; 3–5 real projects; résumé one click away |
| V25 | https://devbio.me/blogs/developer-portfolio-examples-2026.md | Live proof over typed claims; a résumé generated from the same data so it cannot drift |
| V23 | https://dribbble.com/tags/career-dashboard | Layout vocabulary for a portfolio that also carries metrics |
| V1 | https://wuzzuftop.com/ | Freelance and volunteer as distinct, named destinations |

## Design rules

- **Show the work before the biography.** Projects and evidence lead; the profile summary follows.
- A profile that claims a skill must link to the evidence behind it. The whole point of `server/db/evidence.ts` and `server/db/skillEvidence.ts` is that claims are backed.
- 3–6 projects with depth beats a long shallow list.
- The public profile is the **top-of-funnel artefact** — it is what a recruiter sees. It must look like the product's own brand, not like a generic CV.
- Portfolio surfaces are the one place where a full-width, generous layout is appropriate, even inside the app shell.
- Arabic: the profile is the surface most likely to contain mixed English/Arabic content (company names, English job titles). Apply `dir="auto"` isolation per `visual-decisions.md` §7.5.

## Open work

- Share buttons and OG meta for the profile route — gap **G23**.
- Surface earned certifications here once gap **G4** lands.
- Volunteer-impact positioning ("impact evidence", not "a second job board") — gap **G18**.
