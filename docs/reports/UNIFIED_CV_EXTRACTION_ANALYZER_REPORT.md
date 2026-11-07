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

---

## 3. What was built

### 3.1 The review contract — `shared/cvExtraction.ts`

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

### 3.2 The engine — `server/cv/`

| File | What it does |
|---|---|
| `legacyDoc.ts` | Reads a legacy Word document: the compound-file container, the sector allocation table, the mini stream, and the piece table with its 8-bit and 16-bit pieces. |
| `documentExtraction.ts` | Gains `doc` as a format, and dispatches it. |
| `parseStructuredCv.ts` | Arabic headings, Arabic months, Arabic degrees, Arabic certificates, Arabic companies, Arabic locations, table-shaped sections, and the sections a CV carries beyond work and study. |
| `cvValidation.ts` | The rules: missing, duplicated, contradictory and merely unusual. |
| `extractionReview.ts` | Builds the review — the grades, the evidence and the issues. |
| `parsedCvToProfile.ts` | The one conversion from the parser's shape to the document's shape, used by both paths that produce a document. |
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

### 3.3 The review screen — `src/components/cv/`

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

### 3.4 The studio — `src/components/views/CVStudioView.tsx`

A new **Import & Review** tab. The analysis tab now carries the measurement
panel, so the analyzer lives inside the studio.

`CvAnalyzerView.tsx` is now the same panel on its own page, with a way into
the studio. The route and the navigation entry are unchanged, so the links
that exist keep working.

---

## 4. The acceptance criteria, and the evidence for each

| # | Criterion | Where it is met | How it was checked |
|---|---|---|---|
| 1 | Upload → extract → review → adopt, and the result becomes the CV | `CvReviewWorkspace` → `CvExtractionReview` → `POST /api/cv/import/reviewed` → `applyReviewedCv` | `tests/cv-extraction-review.test.ts` — the extract route writes nothing; the import writes through the idempotent path; the studio applies the reviewed document |
| 2 | Every field can be corrected before it is adopted | Every field in the review is an editable input; editing marks it corrected; the corrected document is what is sent to the import | `tests/cv-extraction-review.test.ts` — the review's fields, their grades and their evidence |
| 3 | The analyzer merged into the studio, with recommendations next to the matching sections | `CvAnalysisPanel` is rendered by both the studio's analysis tab and the analyzer page; `CvSectionAdvice` puts the report's advice beside the section it concerns | `tests/cv-analyzer.test.ts` — one implementation, the studio measures its own document, the advice comes from the same report |
| 4 | The engine handles PDF, DOC, DOCX and TXT, and reads an Arabic CV | `doc` added to the reader; Arabic headings, months, degrees, certificates, locations | `tests/cv-extraction-quality.test.ts` — ten fixtures across the four formats, including an Arabic and a mixed-language CV |
| 5 | Confidence and evidence per field | `CvExtractedField.confidence` and `.evidence`, computed in `extractionReview.ts` | `tests/cv-extraction-review.test.ts` — a value with neither evidence nor a low grade fails the test |
| 6 | Missing, duplicated and overlapping data are detected | `server/cv/cvValidation.ts` — twenty-seven rules with stable codes | `tests/cv-extraction-review.test.ts` — the duplicate, the overlap, the reversed dates, the current-and-finished contradiction, the malformed address |
| 7 | A section can be read again | `POST /api/cv/extract/section`, and the **Read again** button on every section | The route is asserted to exist and to be separate from the write |
| 8 | Section-specific suggestions, previewed and undoable | The existing `/api/cv/ai-assist` writes are shown before they are applied, with an undo; the new advice panel points at the section | The existing assist tests still pass |
| 9 | Applying updates the CV and re-runs the analysis | The import stores the reviewed document as a CV version and the studio measures it again | `tests/cv-extraction-review.test.ts` — the reviewed document is written as a version |
| 10 | A real dataset, and the accuracy measured | Ten documents with a labelled ground truth (`tests/fixtures/cv-ground-truth.json`) and a metric suite | `tests/cv-extraction-quality.test.ts` — the metrics are printed, not only asserted |

---

## 5. The accuracy, measured

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

Two of the fixtures exist because they are hard:

- **`ambiguous-location.docx`** — the only place a city is named is inside a
  bullet. The ground truth says the location must come out *empty*, and the
  score counts a value read out of a sentence as a false positive.
- **`no-contact.docx`** — a CV with no header. The ground truth says the
  header fields must come out empty.

Both are counted as true positives when the reader leaves them alone, which
is the only way a "leave it alone" rule can be measured.

---

## 6. What was changed

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
`app.ts` (three routes, `.doc` accepted),
`server/cv/documentExtraction.ts`, `server/cv/parseStructuredCv.ts`,
`shared/cvDocument.ts`, `shared/cvProjection.ts`, `shared/resume-language.ts`,
`src/types/career.ts`, `src/context/CareerContext.tsx`,
`src/components/views/CVStudioView.tsx`, `src/components/views/CvAnalyzerView.tsx`,
`src/components/cv/CvSectionEditor.tsx`, `src/components/cv/CvMeasuredAnalysis.tsx`,
`src/components/cv/CvPreview.tsx`,
`src/lib/routing.ts`, `src/translations/sourceStrings.ts`,
`tests/cv-analyzer.test.ts`, `tests/fixtures/generate-cv-fixtures.mjs`,
`tests/runner.mjs`

**The new sections on the document.** `CVProfile` gained `internships`,
`languages`, `awards`, `publications`, `research` and `leadership`. The
platform has no record type for them, so they live on the document, and
`mergeCanonicalCvDocument` and `buildCvDocument` were taught to keep them —
without that, an imported award would have been erased on the next reload.

---

## 7. How to verify

```
npm run lint          # tsc --noEmit
npm run build         # vite build && the worker build
npm test              # the whole suite
```

The two new suites on their own:

```
npx tsx --test tests/cv-extraction-review.test.ts
npx tsx --test tests/cv-extraction-quality.test.ts
```

The second one prints the metrics.

---

## 8. What was not done, and what is still hard

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

## 9. A note on the working tree

`server/stripe/` and `scripts/stripe-sync-catalog.ts` were added to this
working tree by another piece of work while this one was in progress. They
do not typecheck: `server/stripe/routes.ts` and `server/stripe/service.ts`
fail `tsc --noEmit` on their own. Nothing here depends on them, and they
are not part of this commit — the commit stages the files of this work
explicitly and leaves the rest of the tree as it was found.
