# The unified CV workflow — extraction, review and analysis

**Scope.** One workflow for a CV, from the file a candidate already has to
the document they can correct, with the analysis of that document inside the
same place instead of on another page.

**Branch.** `main` · **Status.** Implemented, measured against a labelled
dataset, verified against the live application.

---

## 1. What was actually wrong

The studio had the pieces. It did not have the order.

**The upload decided for the candidate.** `POST /api/resumes/upload` read
the document, wrote the candidate's records and stored a version — and *then*
showed a modal reporting how many fields had been found. Whatever the reader
got wrong was already on their CV by the time they could see it. The modal
offered to import sections that had already been imported.

**Nothing said how sure the reader was.** A field was either there or it was
not. The reader's own confidence scores existed (`CvExtractionMetadata.confidence`)
but they were a per-section number on a document the candidate could not
correct: a name found in a bullet and a name found in the header produced the
same section score.

**Nothing said where a value came from.** The parser kept an evidence list
(`CvEvidence[]`) but never exposed it per field, so "Data Analyst" looked the
same whether it was read from the header or guessed from a bullet.

**There were two ways in, and one of them skipped the review.** The studio
carried an *Import / Paste* button that opened a modal which wrote the CV
straight away, and the new review tab. A candidate who pressed the button
instead of the tab got the old behaviour — including a message refusing a
legacy `.doc` that the new engine reads perfectly well.

**The analyzer was a second place.** `cv-analyzer` and `cv-studio` each had
their own measured analysis, and the studio's analysis tab had a button that
navigated away to the analyzer to do the same work. The candidate's file
lived in one place and its measurement in another.

**The formats were narrower than the product.** PDF, DOCX and TXT were
read; a legacy `.doc` was refused outright with a message telling the
candidate to convert it.

**Arabic CVs were read as one long block.** Every heading pattern in the
parser was English. An Arabic CV produced a name, an email and a phone
number from the header, and nothing else: the section headings were
unrecognised, the months were unparseable, the degrees and certificates were
invisible, and an Arabic location was rejected because the country separator
is `،` and not `,`.

**An upload replaced the CV.** The upload route made its parsed CV the
candidate's active one. A file that arrives is a file they may want to look
at; it must not take the place of the CV they already have.

---

## 2. The order that was built

```
upload ──▶ extract ──▶ REVIEW ──▶ adopt ──▶ measure ──▶ export
             (no write)   ▲                     │
                        └──── read one ─────────┘
                              section again
```

Three server routes, deliberately separate:

| Route | Writes | What it is for |
|---|---|---|
| `POST /api/cv/extract` | nothing | Reads a document and returns every value it found, where it found it, how sure it is, and what is wrong with it. A pure function of the document. |
| `POST /api/cv/extract/section` | nothing | Reads one section again, for a candidate who is unhappy with how the first reading came out. |
| `POST /api/cv/import/reviewed` | the candidate's records | Writes the document they reviewed and accepted. Idempotent. |

The separation is the point. The review can be produced, discarded and
produced again without touching the account, and the only write in the
journey is the one the candidate asked for.

The studio's *Import / Paste* button opens the review tab. There is no
second way in: the modal that imported without a review is gone, and the
client no longer holds a method that could call the old write route.

---

## 3. The extraction pipeline

The specification asks for four stages. Here is where each one lives.

| Stage | What it does | Where |
|---|---|---|
| **A — Document inspection** | The format, the size, the language, whether a PDF has a text layer at all, and how much readable text the document holds. | `server/cv/documentExtraction.ts`, `server/cv/extractionReview.ts` (`detectDocumentQuality`, `detectDocumentLanguage`) |
| **B — Text extraction** | The text in reading order: paragraphs, lists, table rows, dates, an Arabic or English or mixed document, right-to-left without the words being reversed. | `server/cv/documentExtraction.ts`, `server/cv/legacyDoc.ts` |
| **C — Structured extraction** | The sixteen sections, and within them every field, every list entry, and the text each value was read from. | `server/cv/parseStructuredCv.ts`, `server/cv/parsedCvToProfile.ts` |
| **D — Validation** | What is missing, what is duplicated, what contradicts itself, what merely looks odd. | `server/cv/cvValidation.ts` |

Stage D produces a finding, not a correction. Nothing is rewritten behind
the candidate's back; the finding is shown, and the candidate decides.

---

## 4. The formats that are read

| Format | How it is read | Layout | Notes |
|---|---|---|---|
| **PDF** | The content streams are decoded and the text is put back in reading order. | Yes | A PDF with no text layer is detected as a scan and reported as one. |
| **DOCX** | The document part is read; paragraphs, runs and tables are walked in order. | Yes | A table is read by its column labels. |
| **DOC** (legacy Word) | The OLE2 compound file is parsed: the header, the FAT built from the DIFAT, the directory, the mini allocation table, the mini stream, the Word information block and the piece table. Each piece is read in the encoding it declares. | No | The binary format carries no layout, so it arrives as a single-column document and the review says so. |
| **TXT** | Read as plain text. | No | |
| **JSON** | A previously saved document. | — | |

**OCR is deliberately absent.** The specification said "if the current tools
support OCR"; they do not. A scanned PDF is detected and reported honestly
as a scan with no text layer, and no OCR dependency was added to the
platform inside this work.

---

## 5. What was built

### 5.1 The review contract — `shared/cvExtraction.ts`

The shape of a review, shared by the server that produces it and the client
that displays it:

- **`CvExtractedField`** — a value, the text it was read from, a confidence
  level, the candidate's decision (`extracted` / `confirmed` / `edited` /
  `rejected` / `missing`) and the reasons it is uncertain.
- **`CvExtractedSection`** — a section of the document, with its fields and
  its entries.
- **`CvValidationIssue`** — something that is wrong, missing or suspicious,
  with a stable code and a path.
- **`CvExtractionSummary`** — the counts the review screen shows at the top.

Two decisions worth naming:

**The confidence is computed, not declared.** A value is `high` when the
document contains it *and* contains it in the section it belongs to; `medium`
when the document contains it somewhere else; `low` when the document does
not contain it at all (the value was assembled rather than copied); and
`needs-review` when the document never stated it. The same document always
produces the same grades.

**The messages are templates.** `"{label}" appears more than once in the
work history.` with the values travelling beside it, not inside it. The
Arabic catalogue is keyed by the English text, so a sentence with the values
already written into it would be a new string every time and would never be
found.

### 5.2 The engine — `server/cv/`

| File | What it does |
|---|---|
| `legacyDoc.ts` | Reads a legacy Word document: the compound-file container, the sector allocation table, the mini stream, and the piece table with its 8-bit and 16-bit pieces. |
| `documentExtraction.ts` | Gains `doc` as a format, and dispatches it. |
| `parseStructuredCv.ts` | Arabic headings, Arabic months, Arabic degrees, Arabic certificates, Arabic companies, Arabic locations, table-shaped sections, and the sections a CV carries beyond work and study. |
| `cvValidation.ts` | The rules: missing, duplicated, contradictory and merely unusual. Twenty-seven of them, each with a stable code. |
| `extractionReview.ts` | Builds the review — the grades, the evidence and the issues. |
| `parsedCvToProfile.ts` | The one conversion from the parser's shape to the document's shape, used by every path that produces a document. |
| `reviewedImport.ts` | The idempotent write. |

**The legacy `.doc` reader is a real reader.** It parses the OLE2 compound
file: the header, the FAT built from the DIFAT, the directory, the mini
allocation table and the mini stream. It then reads the Word information
block, finds the piece table, and reads each piece in the encoding the piece
declares. The fixture in the test suite is written by a companion writer
(`tests/fixtures/legacyDocWriter.mjs`) that produces a genuine compound file,
so the test passes on the bytes and not on an accommodation.

**Arabic is read, not tolerated.** The heading patterns cover the Arabic
names a CV really uses (`الخبرة العملية`, `المؤهلات العلمية`, `التدريبات`,
`العمل التطوعي`, `الجوائز`, `المنشورات`…). The months are recognised in
Arabic and the document keeps its own wording (`يناير 2022 – حتى الآن`). The
degrees, the certificates, the companies and the job titles have Arabic
lexicons, and the location reader accepts the Arabic comma.

**A table is read as a table.** A CV whose body is a table puts the column
label in the first cell of each column. The reader finds the labels, undoes
the layout and reads the values as rows. Without it, the header row became
the work history.

### 5.3 The review screen — `src/components/cv/`

- **`CvReviewWorkspace.tsx`** — the journey: choose a document, read it,
  review it, apply it. The extracted text is kept so one section can be read
  again without uploading the file twice.
- **`CvExtractionReview.tsx`** — the review itself: the counts, the issues,
  the sections, and a field per row with its grade and the text it came
  from. Every field is editable; editing one marks it corrected. A section
  can be skipped, which keeps it off the CV rather than deleting what the
  candidate already had.
- **`CvAnalysisPanel.tsx`** — the measurement, as one component. The studio's
  analysis tab and the analyzer page both render it, so they cannot drift
  apart.
- **`CvSectionAdvice.tsx`** + `shared/cvSectionAdvice.ts` — the advice next
  to the section it is about. The measurement produces one report; the
  editor puts each piece of advice beside the section the candidate would
  change to answer it.

### 5.4 The studio — `src/components/views/CVStudioView.tsx`

A new **Import & Review** tab. The analysis tab now carries the measurement
panel, so the analyzer lives inside the studio.

`CvAnalyzerView.tsx` is now the same panel on its own page, with a way into
the studio. The route and the navigation entry are unchanged, so the links
that exist keep working.

---

## 6. The acceptance criteria, and the evidence for each

The criteria as the specification states them:

| # | Criterion | Where it is met | How it was checked |
|---|---|---|---|
| 1 | The candidate's upload produces a structured extraction | `POST /api/cv/extract`, `server/cv/parseStructuredCv.ts` | `tests/cv-extraction-quality.test.ts` — ten documents, every section and field found |
| 2 | Every value can be reviewed and corrected inside CV Studio | `CvExtractionReview.tsx` — every field is an editable input, and editing marks it corrected | `tests/cv-extraction-review.test.ts` — the review's fields, their grades and their evidence |
| 3 | Nothing is invented for what is missing | A value the document never stated is `needs-review`, not a guess; the import only writes what was accepted | `tests/cv-extraction-review.test.ts` — a missing field stays missing, and `no-contact.docx` scores as correct precisely because the reader leaves it alone |
| 4 | The candidate can go back to the source inside the original file | `CvExtractedField.evidence` — the text the value was read from, and the block it was read from | `tests/cv-extraction-review.test.ts` — a value with neither evidence nor a grade fails |
| 5 | ATS analysis runs inside CV Studio | The studio's analysis tab renders `CvAnalysisPanel` | `tests/cv-analyzer.test.ts` — the studio measures its own document |
| 6 | A job description can be added and the fit analysed | `JobDescriptionPanel` in the studio, unchanged, and the measurement takes the description with it | The existing pipeline and studio suites still pass |
| 7 | A recommendation can be applied and the analysis re-run | The studio's **Run ATS Audit** and **Re-analyze**; the import stores the reviewed document as a version and the studio measures it again | `tests/cv-extraction-review.test.ts` — the reviewed document is written as a version |
| 8 | The separate CV Analyzer is not needed | The analyzer page renders the same panel as the studio; the route and the navigation entry remain, so nothing breaks | `tests/cv-analyzer.test.ts` — one implementation, rendered by both |
| 9 | The data survives a refresh, and a sign-out and a sign-in | The document is stored as a CV version and the platform records are written to the database | `tests/cv-extraction-review.test.ts` — the import writes through the database, and the projection keeps the sections the platform has no record type for |
| 10 | The export and the templates keep working | `Print / Export PDF` is unchanged; `CvPreview` renders the new sections, so they are printed too | `tests/cv-preview.test.ts` and the studio suites still pass |

And the ten criteria this work was set out against:

| # | Criterion | Where it is met | How it was checked |
|---|---|---|---|
| 1 | Upload → extract → review → adopt, and the result becomes the CV | `CvReviewWorkspace` → `CvExtractionReview` → `POST /api/cv/import/reviewed` → `applyReviewedCv` | The extract route writes nothing; the import writes through the idempotent path; the studio applies the reviewed document |
| 2 | Every field can be corrected before it is adopted | Every field in the review is an editable input; the corrected document is what is sent to the import | The review's fields, their grades and their evidence |
| 3 | The analyzer merged into the studio, with recommendations next to the matching sections | `CvAnalysisPanel` is rendered by both the studio's analysis tab and the analyzer page; `CvSectionAdvice` puts the report's advice beside the section it concerns | One implementation, the studio measures its own document, the advice comes from the same report |
| 4 | The engine handles PDF, DOC, DOCX and TXT, and reads an Arabic CV | `doc` added to the reader; Arabic headings, months, degrees, certificates, locations | Ten fixtures across the four formats, including an Arabic and a mixed-language CV |
| 5 | Confidence and evidence per field | `CvExtractedField.confidence` and `.evidence`, computed in `extractionReview.ts` | A value with neither evidence nor a low grade fails the test |
| 6 | Missing, duplicated and overlapping data are detected | `server/cv/cvValidation.ts` — twenty-seven rules with stable codes | The duplicate, the overlap, the reversed dates, the current-and-finished contradiction, the malformed address |
| 7 | A section can be read again | `POST /api/cv/extract/section`, and the **Read again** button on every section | The route is asserted to exist and to be separate from the write |
| 8 | Section-specific suggestions, previewed and undoable | The existing `/api/cv/ai-assist` writes are shown before they are applied, with a discard; the new advice panel points at the section | The existing assist tests still pass |
| 9 | Applying updates the CV and re-runs the analysis | The import stores the reviewed document as a CV version and the studio measures it again | The reviewed document is written as a version |
| 10 | A real dataset, and the accuracy measured | Ten documents with a labelled ground truth (`tests/fixtures/cv-ground-truth.json`) and a metric suite | The metrics are printed, not only asserted |

---

## 7. The accuracy, measured

The dataset is ten documents, generated as real files — two PDFs, seven
DOCX packages and one legacy compound file — each with a ground truth
written by reading the document, not by reading the parser's output.

```
section detection: precision 100%, recall 100%, F1 100%
field values:      precision 100%, recall 100%, F1 100%
list entries:      precision 100%, recall 100%, F1 100%
```

The metrics are printed by the test on every run, so a regression shows up
as a number rather than as a failure somebody has to read a stack trace to
understand.

The dataset covers what the specification listed: an English CV, an Arabic
CV, a mixed-language CV, a two-column CV in both PDF and DOCX, a multi-page
PDF, a CV whose body is a table, a legacy `.doc`, and a CV with the awkward
cases — two roles at the same company, two roles that overlap in time, a role
with no dates, and the sections a CV carries beyond work and study.

Two of the fixtures exist because they are hard:

- **`ambiguous-location.docx`** — the only place a city is named is inside a
  bullet. The ground truth says the location must come out *empty*, and the
  score counts a value read out of a sentence as a false positive.
- **`no-contact.docx`** — a CV with no header. The ground truth says the
  header fields must come out empty.

Both are counted as true positives when the reader leaves them alone, which
is the only way a "leave it alone" rule can be measured.

The one case the specification listed that is not in the dataset is the
scanned PDF: with no OCR there is no text to extract from one, so a fixture
would measure nothing.

---

## 8. The analyzer inside the studio

The analyzer was merged by extracting one panel rather than by deleting the
page. `CvAnalysisPanel` holds the measurement; the studio's analysis tab
and the analyzer page both render it.

What that preserved:

- **The route and the navigation entry.** `#/cv-analyzer` still resolves and
  is still in the shell, so every existing link keeps working.
- **Every measurement the platform already made.** The ATS score, the
  formatting issues, the section completeness, the keyword analysis, the
  skills match, the experience relevance, the missing keywords, the content
  quality, the readability and the recommendations.
- **The two scores stay two scores.** The measured score and the model's ATS
  score come from different systems and are never shown as one number.
- **The history.** Every run is a row, so *Earlier measurements* lists what
  was measured before.

What changed:

- **The studio's analysis tab does not need the analyzer page.** It measures
  the document the studio is working on, in place. The analyzer page is kept —
  the route is in use, the navigation entry points at it, and it is the one
  place that measures a *file* the candidate has but has not adopted — and the
  link at the end of the studio's analysis tab still reaches it.
- **The advice sits beside the section.** `CvSectionAdvice` places each
  finding next to the section that would answer it, so the candidate does
  not have to carry a finding from one tab to another.
- **A file that is measured is not adopted.** The analyzer's upload used to
  post to the upload route, which created a CV and made it the active one.
  It now only reads the file and measures the document it holds. Measuring a
  file must not replace the CV the candidate already has.

---

## 9. The AI credits

No new deduction system was created. The platform's existing mechanisms were
used as they are.

| Route | Model call | Daily AI allowance | Subscription credits |
|---|---|---|---|
| `POST /api/cv/extract` | none | not spent | none |
| `POST /api/cv/extract/section` | none | not spent | none |
| `POST /api/cv/import/reviewed` | none | not spent | none |
| `POST /api/cv/analysis` (the measurement) | none | not spent | none |
| `POST /api/cv/ai-assist` (the writing) | yes | one unit, as before | `requireCredits('ai_assist_inline')`, as before |

The reading of a document is deterministic: it parses the file the candidate
uploaded and compares it against rules. There is no model in it, so there
is nothing to spend and nothing to charge for. The writing features still
draw on the same daily allowance and the same credit entitlement they always
did.

The three review routes carry the platform's existing per-user rate limiter,
which is keyed on the verified user id. It is there because parsing a
document is real work per request; it is not a charge.

---

## 10. The security results

| Check | Result |
|---|---|
| The three review routes without a session | **401** on the live site. A route that was not deployed would answer 404. |
| The review route writes nothing | The route is asserted to hold no write call; the import is the only write, and it is behind `requireAuth`. |
| The import is idempotent | Every record is matched on its natural key, so the same review applied twice writes once. `alreadyApplied` says so. |
| The import never overwrites | The header is filled only where it is empty, and nothing the candidate already has is replaced. |
| The import never deletes | A section the candidate turns off is left alone rather than removed from their CV. |
| The account email is never touched | The email is not a profile field, so the import cannot reach it. |
| A file that only claims to be a Word document | Refused on its content: the reader checks the compound-file signature before it reads anything out of it. |
| A PDF with no text layer | Detected and reported as a scan, not returned as an empty document. |
| The internal detail of a failure | Logged, never returned. An upstream message can carry internal paths or provider payloads. |

---

## 11. What was changed

**New — the engine**
`shared/cvExtraction.ts`, `shared/cvSectionAdvice.ts`,
`server/cv/legacyDoc.ts`, `server/cv/cvValidation.ts`,
`server/cv/extractionReview.ts`, `server/cv/parsedCvToProfile.ts`,
`server/cv/reviewedImport.ts`

**New — the interface**
`src/components/cv/CvExtractionReview.tsx`,
`src/components/cv/CvReviewWorkspace.tsx`,
`src/components/cv/CvAnalysisPanel.tsx`,
`src/components/cv/CvSectionAdvice.tsx`, `src/lib/cvExtractionApi.ts`,
`src/translations/parts/cvExtraction.ts`

**New — the tests**
`tests/cv-extraction-review.test.ts`, `tests/cv-extraction-quality.test.ts`,
`tests/fixtures/cv-ground-truth.json`, `tests/fixtures/legacyDocWriter.mjs`

**Changed**
`app.ts` (three routes, `.doc` accepted, and the upload route no longer
takes over as the active CV),
`server/cv/documentExtraction.ts`, `server/cv/parseStructuredCv.ts`,
`shared/cvDocument.ts`, `shared/cvProjection.ts`, `shared/resumeLanguage.ts`,
`src/types/career.ts`, `src/context/CareerContext.tsx`,
`src/components/views/CVStudioView.tsx`, `src/components/views/CvAnalyzerView.tsx`,
`src/components/cv/CvSectionEditor.tsx`, `src/components/cv/CvMeasuredAnalysis.tsx`,
`src/components/cv/CvPreview.tsx`, `src/components/cv/CvAnalysisPanel.tsx`,
`src/lib/routing.ts`, `src/translations/sourceStrings.ts`,
`tests/cv-analyzer.test.ts`, `tests/security.test.ts`,
`tests/fixtures/generate-cv-fixtures.mjs`, `tests/runner.mjs`

**Removed**
`src/components/cv/CVImportModal.tsx`, and with it the three client methods
that only it used — `uploadCvFile`, `pasteCvText` and
`importExtractedCvData`. They posted to the old upload route, and the
reviewed import replaced them.

**The new sections on the document.** `CVProfile` gained `internships`,
`languages`, `awards`, `publications`, `research` and `leadership`. The
platform has no record type for them, so they live on the document, and
`mergeCanonicalCvDocument` and `buildCvDocument` were taught to keep them —
without that, an imported award would have been erased on the next reload.

---

## 12. How to verify

```
npm run lint          # tsc --noEmit
npm run build         # vite build && the worker build
npm run build:jobs    # the jobs worker
npm test              # the whole suite
```

The two new suites on their own:

```
npx tsx --test tests/cv-extraction-review.test.ts
npx tsx --test tests/cv-extraction-quality.test.ts
```

The second one prints the metrics.

The whole suite takes about twenty minutes — it runs its files one at a
time against one server and the live database — so it is worth starting it
and letting it finish rather than watching it.

---

## 13. What was not done, and what is still hard

- **OCR is not implemented.** A scanned PDF is detected and reported as a
  scan with no text layer, and the candidate is told so. The specification
  said "if the current tools support OCR"; they do not, and adding a native
  OCR dependency is not a change to make inside this work.
- **A `.doc` carries no layout.** The binary format has no layout to read,
  so a legacy Word document arrives as a single-column text document and the
  review says so. The text itself is read properly.
- **A CV whose body is a table is read by its column labels.** It works for
  the labels a CV really uses (`Period`, `Role`, `Company`, `Location`, and
  their Arabic equivalents), and a table with no recognisable labels is read
  as ordinary lines — with the grades that produces.
- **A table of contents is not skipped.** A CV with a contents page is read
  as a CV with an extra section. The review is where the candidate removes
  it.
- **The advice panel shows the report's own findings.** It places them next
  to the section they concern; it does not write new advice.
- **The import fills the header in only where it is empty.** Nothing the
  candidate already has is overwritten, which is why the import is safe to
  repeat but also why it will not correct a heading they got wrong earlier.
- **The ten metrics are measured on ten documents.** They are exact on this
  dataset, which is also how it is easy to be exact: the ground truth was
  written for documents the reader can be expected to read. A CV that is
  unlike the dataset will do worse, and the per-field grades are what tell
  the candidate where.

---

## 14. The commits

The CV work is one commit:

```
eaac3f2  feat(cv): one workflow from an uploaded CV to the CV the candidate reviews
```

It holds the contract, the engine, the review screen, the three routes, the
merged analyzer, the dataset and the metric suite — thirty-six files.

**The Stripe billing work happened alongside it.** It was written into this
working tree by another piece of work while this work was in progress, and it
is now on `main` in its own right:

```
8fc6efd  feat(stripe): card checkout, subscription lifecycle and revenue reporting
d4eb5ec  fix(stripe): forward local webhooks with the Stripe CLI package
7f4e366  docs(stripe): record the production verification of the card integration
4127533  fix(stripe): wire the raw body and the webhook routes into app.ts
```

For most of this work the two shared files — `app.ts` and `tests/runner.mjs`
— had to be staged without the other work's blocks, because committing them
whole would have pushed a `main` whose `app.ts` imported a directory that was
not committed. The copies were written with the same line-ending filter
`git add` applies (`core.autocrlf=true`, no `.gitattributes`), hashed with
`git hash-object --path`, and put into the index with `git update-index`. The
working tree was never edited: the other work's lines stayed where they were
found.

`7f4e366` is the exception, and it is worth being precise about. That commit
belongs to the Stripe work, and its message is its own. It also carries the
second half of this work — the removal of the superseded import modal, the
client methods that only it used, the change that stops an upload replacing
the candidate's active CV, the `.doc` test, and this report — because that
workstream committed an index this work had already staged. The code in it is
this work's; the message is not.

**What was checked, on the commits rather than on the working tree:**

- `tsc --noEmit` passes on the pushed tree. It was run in a separate worktree
  checked out at the commit, so nothing could be satisfied by a file that was
  not committed.
- The build was made in that same worktree, and the bundle was searched for
  the billing code: the only occurrences of the word were the pre-existing
  `"e.g. Stripe, Linear, Vercel"` example in the business-tools field.
- The deployed bundle was compared with the built one, and the routes were
  called against the live site.

---

## 15. The deployment

`main` is what Cloudflare Pages serves. The deployment that carries this work
is `30086f63` on the `careerdev4ai` project, and the canonical
`careerdev4ai.pages.dev` serves it.

What was verified against the live site:

- `GET /` answers 200 and loads the application.
- The served entry chunk carries the new review screen — `Import & Review`,
  `Read again`, `Where this came from`, `Apply this CV` and `Accept the
  high-confidence values`.
- `POST /api/cv/extract`, `POST /api/cv/extract/section`,
  `POST /api/cv/import/reviewed`, `POST /api/cv/analysis` and
  `POST /api/resumes/upload` all answer **401** without a session. That is
  the answer a route that exists and is private gives; a route that was not
  deployed would answer 404.

The deployment carries the Stripe work as well, because `main` does: the
Stripe work was committed and pushed by the work that owns it, and a
deployment that left it out would be serving something other than the
branch.
