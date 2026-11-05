// CV processing, in the background.
//
// The candidate uploads a CV and the interface must not sit on a spinner while
// a document is parsed and a model is asked to score it. The upload itself
// stays a normal request — the file is stored straight away — and the slow
// part happens here:
//
//   1. the stored file is read back;
//   2. the text is extracted and laid out;
//   3. the text is structured into the CV shape the studio shows;
//   4. the model evaluates the CV for the target role;
//   5. a CV version is written with the parsed document and the evaluation.
//
// The evaluation is optional. When the model is unavailable, spends too much,
// or answers with something that is not the expected shape, the version is
// still written — without a score. A missing score is honest; a made-up one is
// not.
//
// The retry policy is deliberately small. One retry, for the failures that are
// worth a second attempt (a network blip, a temporarily overloaded model). A
// document that the model cannot score is not retried, because it would fail
// the same way and cost another unit of the day's allowance.

import { logger, task } from "@trigger.dev/sdk";
import { runJob, reportStage, type JobPayload } from "../../server/trigger/runtime.ts";
import {
  assessDocumentQuality,
  extractDocument,
  type DocumentFormat,
} from "../../server/cv/documentExtraction.ts";
import { parseStructuredCv } from "../../server/cv/parseStructuredCv.ts";
import { runAtsAnalysis } from "../../server/cv/atsAnalysis.ts";
import { ai, getGeminiModel } from "../../server/ai/geminiConfig.ts";
import { getCv } from "../../server/db/cvs.ts";
import { createCvVersion } from "../../server/db/cvVersions.ts";
import { createCvFileDownloadUrl } from "../../server/db/cvStorage.ts";
import { JobError } from "../../server/trigger/runtime.ts";

interface ProcessCvPayload extends JobPayload {
  cvId: string;
  fileName?: string;
}

/** The format the stored file is in, taken from its name. */
function formatOf(path: string, fileName?: string): DocumentFormat {
  const name = (fileName || path).toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx")) return "docx";
  if (name.endsWith(".json")) return "json";
  return "txt";
}

export const processCvTask = task({
  id: "process-cv",
  // Ten minutes of compute is far more than the work needs; it is a ceiling,
  // not a target.
  maxDuration: 600,
  // One run per candidate per CV at a time.
  concurrency: { perKey: 1 },
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 5_000,
    maxTimeoutInMs: 30_000,
    factor: 2,
  },
  run: async (payload: ProcessCvPayload) =>
    runJob(payload, "reading the uploaded CV", async (job) => {
      const profileId = payload.profileId;

      // The CV must belong to the candidate the job belongs to. The API
      // checked this too; the task checks it again because the task is the
      // thing that actually writes.
      const cv = await getCv(profileId, payload.cvId);
      if (!cv) {
        throw new JobError('cv_not_found', 'This CV does not exist, or it is not yours.');
      }
      if (!cv.storagePath) {
        throw new JobError('no_file', 'This CV has no stored file to read.');
      }

      await reportStage(job.id, "reading the uploaded CV");
      const { url } = await createCvFileDownloadUrl(profileId, cv.storagePath);
      const response = await fetch(url);
      if (!response.ok) {
        throw new JobError('file_unreadable', 'The stored CV file could not be read.');
      }
      const bytes = new Uint8Array(await response.arrayBuffer());

      await reportStage(job.id, "reading the text out of the document");
      const extraction = await extractDocument(bytes, formatOf(cv.storagePath, payload.fileName));
      const quality = assessDocumentQuality(extraction);

      if (extraction.status !== 'ok') {
        throw new JobError(
          'document_unreadable',
          extraction.status === 'scanned'
            ? 'This CV is a scanned image. Upload a text-based CV so it can be read.'
            : 'No text could be read from this CV.',
        );
      }

      await reportStage(job.id, "structuring the CV");
      const { cv: parsedCv, metadata } = parseStructuredCv(extraction);

      await reportStage(job.id, "evaluating the CV for the target role");
      const targetRoleTitle = cv.targetRoleTitle || 'the target role';
      const outcome = await runAtsAnalysis({
        parsedCv,
        targetRoleTitle,
        ai: (process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY) ? ai : null,
        model: getGeminiModel(),
      });
      if (outcome.reason === 'model_error') {
        logger.warn('The ATS evaluation was unavailable.', { reason: outcome.reason });
      }

      await reportStage(job.id, "saving the parsed CV");
      const version = await createCvVersion(profileId, {
        cvId: cv.id,
        name: cv.name,
        targetRoleTitle: cv.targetRoleTitle ?? undefined,
        profileJson: parsedCv,
        atsAnalysis: outcome.analysis,
      });
      if (!version) {
        throw new JobError('cv_not_found', 'This CV does not exist, or it is not yours.');
      }

      return {
        cvId: cv.id,
        cvVersionId: version.id,
        analysisAvailable: outcome.analysis !== null,
        analysisReason: outcome.reason,
        quality: quality.quality,
        wordCount: metadata.wordCount,
        warnings: metadata.warnings,
      };
    }),
});
