// Reading a CV, understanding it, and scoring it against the target role.
//
// The work: fetch the stored file, pull the text out of it, structure what was
// found, ask the model how it reads against the role, and save the result as a
// version of the CV.
//
// The retry policy is deliberately small. One retry, for the failures that are
// worth a second attempt (a network blip, a temporarily overloaded model). A
// document that the model cannot score is not retried, because it would fail
// the same way and cost another unit of the day's allowance.

import { JobError, runJob, type JobContext, type JobPayload } from '../runtime.ts';
import {
  assessDocumentQuality,
  extractDocument,
  type DocumentFormat,
} from '../../cv/documentExtraction.ts';
import { parseStructuredCv } from '../../cv/parseStructuredCv.ts';
import { runAtsAnalysis } from '../../cv/atsAnalysis.ts';
import { ai, getGeminiModel } from '../../ai/geminiConfig.ts';
import { getCv } from '../../db/cvs.ts';
import { createCvVersion } from '../../db/cvVersions.ts';
import { createCvFileDownloadUrl } from '../../db/cvStorage.ts';

interface ProcessCvPayload extends JobPayload {
  cvId: string;
  fileName?: string;
}

/** The format the stored file is in, taken from its name. */
function formatOf(path: string, fileName?: string): DocumentFormat {
  const name = (fileName || path).toLowerCase();
  if (name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.docx')) return 'docx';
  if (name.endsWith('.json')) return 'json';
  return 'txt';
}

export async function processCvTask(
  payload: JobPayload,
  context: JobContext,
): Promise<Record<string, unknown>> {
  const typed = payload as ProcessCvPayload;
  return runJob(typed, context, 'reading the uploaded CV', async (job) => {
    const profileId = typed.profileId;

    // The CV must belong to the candidate the job belongs to. The API
    // checked this too; the task checks it again because the task is the
    // thing that actually writes.
    const cv = await getCv(profileId, typed.cvId);
    if (!cv) {
      throw new JobError('cv_not_found', 'This CV does not exist, or it is not yours.');
    }
    if (!cv.storagePath) {
      throw new JobError('no_file', 'This CV has no stored file to read.');
    }

    await context.reportStage('reading the uploaded CV');
    const { url } = await createCvFileDownloadUrl(profileId, cv.storagePath);
    const response = await fetch(url);
    if (!response.ok) {
      throw new JobError('file_unreadable', 'The stored CV file could not be read.');
    }
    const bytes = new Uint8Array(await response.arrayBuffer());

    await context.reportStage('reading the text out of the document');
    const extraction = await extractDocument(bytes, formatOf(cv.storagePath, typed.fileName));
    const quality = assessDocumentQuality(extraction);

    if (extraction.status !== 'ok') {
      throw new JobError(
        'document_unreadable',
        extraction.status === 'scanned'
          ? 'This CV is a scanned image. Upload a text-based CV so it can be read.'
          : 'No text could be read from this CV.',
      );
    }

    await context.reportStage('structuring the CV');
    const { cv: parsedCv, metadata } = parseStructuredCv(extraction);

    await context.reportStage('evaluating the CV for the target role');
    const targetRoleTitle = cv.targetRoleTitle || 'the target role';
    const outcome = await runAtsAnalysis({
      parsedCv,
      targetRoleTitle,
      ai: (process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY) ? ai : null,
      model: getGeminiModel(),
    });
    if (outcome.reason === 'model_error') {
      console.warn('The ATS evaluation was unavailable.', outcome.reason);
    }

    await context.reportStage('saving the parsed CV');
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
  });
}
