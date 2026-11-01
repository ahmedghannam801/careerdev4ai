# CareerPilot AI — Final Test Report

**Date:** 1 November 2026
**Scope:** UX-intelligence changes (navigation, dashboard, roadmap, learning, volunteering, AI answers, Arabic/RTL, mobile).
**Companion documents:** `CAREERDEV4AI_UX_INTELLIGENCE_AUDIT.md`, `CAREERDEV4AI_UX_IMPLEMENTATION.md`

---

## 1. Verdict

| Gate | Result |
| --- | --- |
| `npm run lint` (`tsc --noEmit`) | **Pass** — 0 errors |
| `npm test` | **Pass** — 548 tests, 546 pass, 2 skipped, 0 fail, 126 suites |
| `npm run build` | **Pass** — `vite build` + worker build, exit 0 |
| Localization coverage | **1098/1098 source strings (100%)** |
| Responsive / RTL | **Pass** — no page-level horizontal overflow at 320/390/768/1000, LTR and RTL |
| Live database | **505 courses (26 Arabic, 43 video/playlist), 49 volunteer opportunities (10 Egypt)** |
| Cleanup | QA harness, QA scripts and QA identity removed; `X-Frame-Options` restored to `DENY`; dev server stopped |

The changes are safe to ship for the UX-intelligence scope, with the caveats in section 7.

---

## 2. Commands and results

### 2.1 Lint

```
> careerpilot-ai@1.0.0 lint
> tsc --noEmit
```

No output, exit 0. This covers the new `src/lib/aiResponse.ts`, `src/components/copilot/AiResponse.tsx`, the rebuilt views, the server ranking changes and the new test file.

### 2.2 Test suite

```
> node tests/runner.mjs
...
ℹ tests 548
ℹ suites 126
ℹ pass 546
ℹ fail 0
ℹ cancelled 0
ℹ skipped 2
ℹ todo 0
ℹ duration_ms 269009
[test] stopping the test server
[test] cleaning up the data this run created
[test] removed 2 catalogue skill row(s) created by this run
[test] .careerpilot_state.json is unchanged
[test] no test identities remain
[test] no orphaned storage objects remain
[test] PASS
```

The suite starts its own isolated API server against the live database, then deletes every identity and storage object it created. The two skips are intentional: they only apply when `GEMINI_API_KEY` is absent, and the key is configured in this environment.

**New tests:** `tests/ai-response.test.ts` adds 14 cases for the shared AI formatter (headings, separators, nested and ordered lists, fenced/unterminated code, quotes, malformed input, Arabic detection, preview truncation). The file is registered in `tests/runner.mjs`, so it runs in every full suite.

**Targeted run of the new file:**

```
$env:TEST_ONLY='ai-response'; npm test
ℹ tests 14
ℹ pass 14
ℹ fail 0
[test] PASS
```

### 2.3 Localization

```
localisation coverage: 1098/1098 source strings (100%)
✔ has an Arabic entry for every translated string
✔ reports the coverage it has achieved
```

### 2.4 Build

```
✓ built in 14.70s
[build-worker] wrote dist\_worker.js (3.27 MiB)
```

Exit 0. One warning remains: the main client chunk (`index-*.js`) is 600.72 kB minified / 158.30 kB gzip, above the 600 kB advisory. This is a pre-existing bundling characteristic, not a functional failure; see section 7.

---

## 3. Database verification

Read-only SQL against the live project after the two additive migrations:

| Metric | Value |
| --- | --- |
| Courses, total | 505 |
| Courses, Arabic | 26 |
| Courses, video or playlist | 43 |
| — Arabic playlists | 26 |
| — English playlists | 13 |
| — English videos | 4 |
| Volunteer opportunities, active | 49 |
| Volunteer opportunities, Egypt | 10 |

Format/language distribution of the whole catalogue:

| Language | Format | Count |
| --- | --- | --- |
| English | tutorial | 244 |
| English | course | 168 |
| English | learning path | 34 |
| **Arabic** | **playlist** | **26** |
| English | professional certificate | 16 |
| English | playlist | 13 |
| English | video | 4 |

The volunteer DTO was also checked directly against the live database:

```
{"rows":49,"egypt":10,"duplicateSkillRows":0}
```

No row with duplicated `skillsGained`/`requiredSkills` reaches React, which removes the duplicate-key warnings seen in the long-running development server (that process predated the server-side de-duplication change).

### 3.1 Resource verification method

- **Playlists:** every YouTube URL was requested against the `oEmbed` endpoint; only responses that resolved to the intended title/channel were inserted.
- **Volunteering:** every application URL was requested live and had to return a valid page before insertion.
- No URL was synthesised, templated or copied from a search result without a successful check.
- Verification reflects the date of insertion; third-party pages can change afterwards.

---

## 4. Responsive and RTL verification

### 4.1 Method

Same-origin iframes at 320, 390, 768 and 1000 CSS pixels. For each view the harness measured:

- `document.documentElement.scrollWidth − clientWidth` (page-level horizontal overflow);
- every visible element's bounding rectangle against the viewport;
- the rectangle and computed transform of each open dialog.

Both `ltr` and `rtl` were exercised. The harness page and its temporary `SAMEORIGIN` header were removed after the checks.

### 4.2 Results

Page-level overflow was **0** for every combination:

| View | 320 | 390 | 768 | 1000 |
| --- | --- | --- | --- | --- |
| Dashboard | 0 | 0 | 0 | 0 |
| Roadmap | 0 | 0 | 0 | 0 |
| Learning | 0 | 0 | 0 | 0 |
| Volunteer | 0 | 0 | 0 | 0 |
| Projects | 0 | 0 | 0 | 0 |
| CV Studio | 0 | 0 | 0 | 0 |
| Profile | 0 | 0 | 0 | 0 |

Element-level checks found no clipped controls after the fixes. The only elements extending past the viewport are the intentionally decorative gradient circles inside Profile cards with `overflow-hidden`; they create no scroll and are not interactive.

### 4.3 Drawers

| Drawer | Viewport | Direction | Result |
| --- | --- | --- | --- |
| Navigation | 320 | RTL | `left 45 → right 320`, inside |
| Navigation | 320 | LTR | `left 0 → right 275`, inside |
| Navigation | 390 | RTL | `left 70 → right 390`, inside |
| Notifications | 320/390 | RTL/LTR | anchored to the inline-end edge, inside |
| Copilot | 320/390 | RTL/LTR | anchored to the inline-end edge, inside |

Note on the earlier "off-screen RTL drawer" reading: the first measurement returned `left: 320, right: 595` because the harness tab was in the background and `requestAnimationFrame` was throttled, so the entrance animation stayed at its hidden transform. After focusing the tab, the dialog animated to `left: 44.8, right: 320` at 320px — fully on screen. The apparent 6px discrepancy on end-anchored drawers is the scrollbar gutter, not a layout defect.

### 4.4 RTL content

The Arabic dashboard was confirmed to render with `dir="rtl"`, `lang="ar"`, translated navigation, translated dashboard labels and Arabic AI suggestion chips.

---

## 5. Functional verification performed

| Area | Check | Result |
| --- | --- | --- |
| Navigation | Five groups, every old route still reachable; bottom bar mirrors groups | Pass |
| Dashboard | Three questions; single Next Best Step; guided-tour hooks present | Pass |
| Roadmap | Stage stepper, derived current stage, expandable stages, 5-action cap, Job Ready derived from completion | Pass |
| Learning | Language badge and filter; filter stored in URL | Pass |
| Learning ranking | Arabic preference and video preference applied as multipliers; English advanced exception | Pass (unit + code inspection) |
| Volunteer | Country/language filters, Egypt count, facts, empty state, Arabic reasons | Pass |
| Volunteer data | 49 rows, 10 Egypt, 0 duplicate skill arrays | Pass |
| AI parser | 14 tests, including malformed input | Pass |
| AI renderer | No raw HTML; links safe | Pass (code inspection + tests) |
| Localization | 100% coverage | Pass |
| Mobile | No page overflow at four widths | Pass |
| Security headers | `X-Frame-Options: DENY` restored | Pass |

---

## 6. Cleanup performed

- `public/qa-harness.html` — deleted.
- `.tmp-qa/apply-migrations.mjs`, `.tmp-qa/make-qa-user.mjs` — deleted.
- QA identity `cp-qa-ui@example.invalid` (`d88ea928-7121-4507-9ed8-489aaf62abd6`) — deleted from Supabase Auth; a follow-up read returned "not found".
- `X-Frame-Options` — restored from `SAMEORIGIN` to `DENY` in `app.ts`.
- Development server — stopped; port 3000 closed.
- No production rows deleted, no RLS policy changed, no secret written to a client file.

---

## 7. Remaining issues and honest limitations

1. **Live AI calls were not exercised end-to-end.**
   The configured Gemini key hit its free-tier daily quota (`429 RESOURCE_EXHAUSTED`, limit 20 requests/day for `gemini-3.6-flash`). The prompt, parser and renderer are covered by tests and code review, but a real model answer was not observed in this session. This is an environment/quota issue, not a code failure. A paid key or a different model will exercise the same path without code changes.

2. **The catalogue is still mostly English and mostly text.**
   26 of 505 courses are Arabic (5.1%); 43 of 505 are video or playlist (8.5%). The ranking now prefers Arabic and video where they exist, but it cannot invent supply. For many roles the best available resource is still an English article. The product explains why when it recommends English for advanced material; it does not pretend Arabic coverage is complete.

3. **Volunteering breadth is limited.**
   49 active opportunities, 10 in Egypt. Links were verified at insertion time, but third-party pages can expire or change. A periodic link check is recommended but was not added in this scope.

4. **Main client chunk exceeds the advisory limit.**
   `index-*.js` is 600.72 kB minified (158.30 kB gzip). The build passes; the warning is a performance follow-up (route-level splitting of the shell/context is the obvious next step), not a correctness issue.

5. **Visual review was measurement-based.**
   The environment had no visible desktop window, so screenshots were unavailable. Verification used DOM geometry, computed styles and text content rather than pixel inspection. Layout overflow, drawer placement and RTL direction are covered; purely aesthetic judgements (spacing rhythm, colour contrast in situ) were not re-reviewed pixel by pixel.

6. **Two tests are skipped by design.**
   They assert the "no model configured" contract and only run when `GEMINI_API_KEY` is absent. They are not failures.

7. **Arabic catalogue coverage is complete for the current source strings, not for future ones.**
   Any new `t('…')` literal still requires an Arabic entry; the localization test enforces this and will fail the suite until the entry is added.

---

## 8. Sign-off

For the UX-intelligence scope described in the audit:

- lint, tests and build pass;
- the live catalogue contains verified Arabic/video resources and Egypt-focused volunteering;
- the dashboard, roadmap, navigation and AI answer surfaces implement the intended hierarchy;
- mobile and RTL behaviour was measured at 320/390/768/1000 with no page-level overflow;
- temporary QA artefacts and identities were removed and the security header was restored.

The remaining items in section 7 are supply-side or environmental. None of them blocks shipping the changes described here, but the English-dominance of the catalogue and the unexercised live AI path should be stated to stakeholders rather than presented as complete.
