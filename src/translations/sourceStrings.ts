/**
 * Arabic string catalogue.
 *
 * The application renders English source text directly in the components.
 * Rather than inventing an unrelated key for every literal — which would
 * decouple the translation from the text it translates and make it easy to
 * drift — the Arabic catalogue is keyed by the English source string itself.
 *
 * `translate('Your roadmap')` looks the string up here and returns the Arabic
 * when the interface is in Arabic. When a string is missing, the English
 * source is returned unchanged, so a missing translation degrades to English
 * rather than to a broken label.
 *
 * The catalogue is split into one file per area of the product. Each area owns
 * its own file, so the translations can be written and reviewed in parallel
 * without two people editing the same file.
 */

import { adminAr } from './parts/admin.ts';
import { analyticsAr } from './parts/analytics.ts';
import { appShellAr } from './parts/appShell.ts';
import { applicationsAr } from './parts/applications.ts';
import { backgroundJobsAr } from './parts/backgroundJobs.ts';
import { applicationWorkflowAr } from './parts/applicationWorkflow.ts';
import { commonAr } from './parts/common.ts';
import { careerAr } from './parts/career.ts';
import { cvAr } from './parts/cv.ts';
import { dashboardAr } from './parts/dashboard.ts';
import { discoveryAr } from './parts/discovery.ts';
import { interviewsAr } from './parts/interviews.ts';
import { jobsAr } from './parts/jobs.ts';
import { landingAr } from './parts/landing.ts';
import { learningAr } from './parts/learning.ts';
import { profileAr } from './parts/profile.ts';
import { projectsAr } from './parts/projects.ts';
import { roadmapAr } from './parts/roadmap.ts';
import { settingsAr } from './parts/settings.ts';
import { skillsAr } from './parts/skills.ts';
import { volunteerAr } from './parts/volunteer.ts';

/** The Arabic catalogue, keyed by the English source string. */
export const AR_STRINGS: Record<string, string> = {
  ...commonAr,
  ...appShellAr,
  ...adminAr,
  ...analyticsAr,
  ...discoveryAr,
  ...dashboardAr,
  ...landingAr,
  ...applicationsAr,
  ...backgroundJobsAr,
  ...applicationWorkflowAr,
  ...careerAr,
  ...roadmapAr,
  ...skillsAr,
  ...learningAr,
  ...interviewsAr,
  ...jobsAr,
  ...projectsAr,
  ...volunteerAr,
  ...cvAr,
  ...profileAr,
  ...settingsAr,
};

/**
 * Translates a source string.
 *
 * Returns the Arabic when the interface is in Arabic and the string is in
 * the catalogue. Returns the source string otherwise, so English is always
 * a correct answer.
 */
export function translate(source: string, language: 'en' | 'ar'): string {
  if (language !== 'ar') return source;
  return AR_STRINGS[source] ?? source;
}

/**
 * Reports the source strings that have no Arabic translation.
 *
 * Used by the localisation test, which fails when a string is missing, and
 * by the settings screen, which shows the user what is still untranslated.
 */
export function missingArabicStrings(sources: string[]): string[] {
  return sources.filter((source) => !AR_STRINGS[source]);
}
