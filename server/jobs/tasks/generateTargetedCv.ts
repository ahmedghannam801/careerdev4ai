// Writing a CV and a cover letter for one specific job.
//
// The work: read the job description, compare it with the candidate's own
// record, write a CV that answers it, write a cover letter that does the same
// in prose, and save both as one application package.
//
// A step that fails does not leave a half-written package behind: the writes
// happen at the end, once everything has succeeded.

import { JobError, runJob, type JobContext, type JobPayload } from '../runtime.ts';
import {
  analyzeJobDescription,
  buildJobDescriptionMatch,
  generateAtsCvContent,
} from '../../cv/jobDescription.ts';
import { generateCoverLetter } from '../../cv/coverLetter.ts';
import { ai, getGeminiModel } from '../../ai/geminiConfig.ts';
import { getCv } from '../../db/cvs.ts';
import { createCvVersion } from '../../db/cvVersions.ts';
import { createApplicationPackage } from '../../db/applicationPackages.ts';
import { createCoverLetter } from '../../db/coverLetters.ts';

interface TargetedCvPayload extends JobPayload {
  cvId?: string | null;
  jobDescription: string;
  language?: string;
  document?: unknown;
}

export async function generateTargetedCvTask(
  payload: JobPayload,
  context: JobContext,
): Promise<Record<string, unknown>> {
  const typed = payload as TargetedCvPayload;
  return runJob(typed, context, 'reading the job description', async (job) => {
    const profileId = typed.profileId;

    if (!typed.jobDescription || typed.jobDescription.trim().length < 20) {
      throw new JobError(
        'job_description_required',
        'A job description of at least a full sentence is needed.',
      );
    }

    // The CV the candidate is improving must be theirs.
    let sourceCv = null;
    if (typed.cvId) {
      sourceCv = await getCv(profileId, typed.cvId);
      if (!sourceCv) {
        throw new JobError('cv_not_found', 'This CV does not exist, or it is not yours.');
      }
    }

    const hasModel = Boolean(process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY);
    const model = getGeminiModel();
    const language = typed.language === 'ar' ? 'ar' : 'en';

    await context.reportStage('reading the job description');
    const { analysis } = await analyzeJobDescription(typed.jobDescription, {
      ai: hasModel ? ai : null,
      model,
      language,
    });

    await context.reportStage('comparing the job with your record');
    const match = await buildJobDescriptionMatch(profileId, analysis, { language });

    await context.reportStage('writing the CV for this job');
    const outcome = await generateAtsCvContent({
      userId: profileId,
      analysis,
      match,
      document: (typed.document ?? null) as never,
      ai: hasModel ? ai : null,
      model,
      language,
    });
    if (!outcome.ok) {
      throw new JobError(
        outcome.reason,
        'The CV for this job description could not be written. Nothing was changed; please try again shortly.',
      );
    }

    await context.reportStage('writing the cover letter');
    const coverLetter = await generateCoverLetter({
      userId: profileId,
      candidate: {
        company: analysis.company ?? null,
        jobTitle: analysis.jobTitle ?? sourceCv?.targetRoleTitle ?? null,
        jobDescription: typed.jobDescription,
        candidateName: null,
        experiences: [],
        skills: analysis.requiredSkills,
        projects: [],
        tone: 'Professional & Confident',
        language,
      },
      ai: hasModel ? ai : null,
      model,
    });
    if (!coverLetter.ok) {
      // The CV is the valuable half. A cover letter that could not be
      // written is reported, not silently dropped.
      console.warn('The cover letter could not be written.', coverLetter.reason);
    }

    await context.reportStage('saving the result');
    const company = analysis.company ?? 'the company';
    const role = analysis.jobTitle ?? sourceCv?.targetRoleTitle ?? 'the role';

    const letter = coverLetter.ok
      ? await createCoverLetter(profileId, {
          title: `${role} at ${company}`,
          company,
          role,
          jobDescription: typed.jobDescription.slice(0, 4000),
          content: coverLetter.coverLetter ?? '',
          keyHighlights: coverLetter.keyHighlights ?? [],
        })
      : null;

    const version = sourceCv
      ? await createCvVersion(profileId, {
          cvId: sourceCv.id,
          name: `${role} CV`,
          targetRoleTitle: role,
          profileJson: outcome.content,
          atsAnalysis: match,
        })
      : null;

    const applicationPackage = await createApplicationPackage(profileId, {
      jobTitle: role,
      company,
      jobDescription: typed.jobDescription.slice(0, 4000),
      analysis,
      matchAnalysis: match,
      matchScore: match?.score ?? 0,
      language,
      sourceCvId: sourceCv?.id ?? null,
      tailoredCvId: sourceCv?.id ?? null,
      tailoredCvVersionId: version?.id ?? null,
      coverLetterId: letter?.id ?? null,
    });

    return {
      applicationPackageId: applicationPackage.id,
      cvVersionId: version?.id ?? null,
      coverLetterId: letter?.id ?? null,
      matchScore: match?.score ?? null,
      coverLetterWritten: Boolean(letter),
    };
  });
}
