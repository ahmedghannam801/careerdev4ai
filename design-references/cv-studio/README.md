# CV Studio

The resume builder, tailoring, AI rewrite, and ATS analysis surfaces.

## What belongs here

- CV document structure and section editing.
- The job-description panel (paste a JD, tailor against it).
- AI rewrite and bullet-point suggestions.
- ATS / keyword analysis and the score it produces.
- CV versions and their relationship to applications.
- The paper preview — which must stay paper-white in both themes.
- Export and download.
- Tabbed switching between Resume / Cover Letter / CV.

## Current implementation

`src/components/views/CVStudioView.tsx`, `src/components/cv/JobDescriptionPanel.tsx`, `src/components/ai/AIProcessingModal.tsx`.
Engine: `server/cv/{aiAssist,buildCv,documentExtraction,jobDescription,parseStructuredCv}.ts`, `server/db/{cvs,cvVersions,cvStorage}.ts`, `shared/{cvAiAssist,cvDocument,cvImport,cvProjection,atsAnalysis}.ts`, `shared/jobDescription.ts`.

## References

| Ref | URL | Note |
| --- | --- | --- |
| V6 | https://www.tealhq.com/ | The "one CV per job" model; tabbed Resume / Cover Letter / CV examples; ATS checker and keyword scanner as named tools |
| V2 | https://mafeshsho8l.com/ | Egypt-specific grading; AI rewrite of weak bullets; a free `/try` and a public sample report |
| V3 | https://emekly.com/ | Upload-first entry; inline highlight on surface tiles |
| V5 | https://www.careerflow.ai/ | Resume Optimizer, AI Cover Letter, Resume ATS Score Checker, browser extension |
| V11 | https://www.ncsc.org/sites/default/files/media/document/Dashboard-Design-Guide_0.pdf | The ATS-adjacent principle of not concealing meaning behind a single score |

## Design rules

- **ATS/keyword scores must be explainable.** "68/100" with no breakdown is a trust problem in a product whose whole claim is that it reads CVs the way employers do. Show matched, missing and over-used terms.
- AI-generated text must be **draft-then-refine** — the user edits in place, never "accept a rewrite" as a black box.
- The printed preview uses `--color-print-primary` and stays paper-white in both light and dark. **Do not theme the paper.**
- A CV variant is bound to a job description. Show the match score on the variant.
- Arabic CVs need their own line-height and letter-spacing rules (`visual-decisions.md` §7.4) — ATS parsers are less tolerant of Arabic layout than English.

## Open work

- Bind CV versions to applications — gap **G19**.
- Score explainability for ATS and match — gap **G8**.
- Public no-account CV check — gap **G6**.
