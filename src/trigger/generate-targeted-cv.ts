// A CV written for one specific job, with the cover letter that goes with it.
//
// This is the slowest thing a candidate does in the studio: the advertisement
// is read, the candidate's record is compared with it, a CV is written for it
// and a letter is written for it. Four steps, two of them a model call.
//
// Doing it in the background means the candidate can close the tab, come back
// tomorrow and find the result waiting, instead of watching a spinner and
// losing the work.
//
// What is written at the end:
//   * a CV version â€” the tailored CV, as an immutable snapshot;
//   * an application package â€” the analysis and the match, so the studio can
//     show why the CV was written the way it was;
//   * a cover letter â€” only when the model produced a real one.
//
// A step that fails does not leave a half-written package behind: the writes
// happen at the end, once everything has succeeded.

import { logger, task } from "@trigger.dev/sdk";
import { JobError, reportStage, runJob, type JobPayload } from "../../server/trigger/runtime.ts";
import {
  analyzeJobDescription,
  buildJobDescriptionMatch,
  generateAtsCvContent,
} from "../../server/cv/jobDescription.ts";
import { generateCoverLetter } from "../../server/cv/coverLetter.ts";
import { ai, getGeminiModel } from "../../server/ai/geminiConfig.ts";
import { getCv } from "../../server/db/cvs.ts";
import { createCvVersion } from "../../server/db/cvVersions.ts";
import { createApplicationPackage } from "../../server/db/applicationPackages.ts";
import { createCoverLetter } from "../../server/db/coverLetters.ts";

interface TargetedCvPayload extends JobPayload {
  cvId?: string | null;
  jobDescription: string;
  language?: string;
  document?: unknown;
}

export const generateTargetedCvTask = task({
  id: "generate-targeted-cv",
  maxDuration: 900,
  // One tailored CV per candidate per source CV at a time.
  concurrency: { perKey: 1 },
  retry: {
    // One retry only. A second attempt costs another unit of the day's
    // allowance, so it is only worth it for a failure that might not repeat.
    maxAttempts: 2,
    minTimeoutInMs: 10_000,
    maxTimeoutInMs: 60_000,
    factor: 2,
  },
  run: async (payload: TargetedCvPayload) =>
    runJob(payload, "reading the job description", async (job) => {
      const profileId = payload.profileId;

      if (!payload.jobDescription || payload.jobDescription.trim().length < 20) {
        throw new JobError(
          'job_description_required',
          'A job description of at least a full sentence is needed.',
        );
      }

      // The CV the candidate is improving must be theirs.
      let sourceCv = null;
      if (payload.cvId) {
        sourceCv = await getCv(profileId, payload.cvId);
        if (!sourceCv) {
          throw new JobError('cv_not_found', 'This CV does not exist, or it is not yours.');
        }
      }

      const hasModel = Boolean(process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY);
      const model = getGeminiModel();
      const language = payload.language === 'ar' ? 'ar' : 'en';

      await reportStage(job.id, 'reading the job description');
      const { analysis } = await analyzeJobDescription(payload.jobDescription, {
        ai: hasModel ? ai : null,
        model,
        language,
      });

      await reportStage(job.id, 'comparing the job with your record');
      const match = await buildJobDescriptionMatch(profileId, analysis, { language });

      await reportStage(job.id, 'writing the CV for this job');
      const outcome = await generateAtsCvContent({
        userId: profileId,
        analysis,
        match,
        document: (payload.document ?? null) as never,
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

      await reportStage(job.id, 'writing the cover letter');
      const coverLetter = await generateCoverLetter({
        userId: profileId,
        candidate: {
          company: analysis.company ?? null,
          jobTitle: analysis.jobTitle ?? sourceCv?.targetRoleTitle ?? null,
          jobDescription: payload.jobDescription,
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
        logger.warn('The cover letter could not be written.', { reason: coverLetter.reason });
      }

      await reportStage(job.id, 'saving the result');
      const company = analysis.company ?? 'the company';
      const role = analysis.jobTitle ?? sourceCv?.targetRoleTitle ?? 'the role';

      const letter = coverLetter.ok
        ? await createCoverLetter(profileId, {
            title: `${role} at ${company}`,
            company,
            role,
            jobDescription: payload.jobDescription.slice(0, 4000),
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
        jobDescription: payload.jobDescription.slice(0, 4000),
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
    }),
});
