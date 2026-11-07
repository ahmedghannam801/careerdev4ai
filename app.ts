/**
 * The CareerDev4AI API, as a framework-level Express application.
 *
 * The module builds the app and registers every route; it deliberately does
 * NOT open a port, load `.env`, or serve static assets. Those are entry-point
 * concerns and live in `server.ts` (Node) and `worker/index.ts` (Cloudflare
 * Pages), which mount this same app. Keeping one app definition means local
 * development, the test suite and the deployed runtime always execute identical
 * route code.
 */
import express, { Request, Response } from 'express';
import multer from 'multer';
// The *web* build of the SDK is imported deliberately. It is the build the
// browser already receives, it uses `fetch` rather than `google-auth-library`
// (ADC, child processes, the local filesystem), and it therefore runs unchanged
// in Node and in the Workers runtime. The Node build pulls in authentication
// code that is useless here and cannot be bundled for Cloudflare.
import { GoogleGenAI } from '@google/genai/web';
import { verifySupabaseToken } from './server/auth/supabase-auth.ts';
import {
  assessDocumentQuality,
  extractDocument,
  extractTextDocument,
  type DocumentExtraction,
  type DocumentFormat,
} from './server/cv/documentExtraction.ts';
import { parseStructuredCv } from './server/cv/parseStructuredCv.ts';
// The extraction review: the document, the evidence for every value in it,
// and everything that is wrong with it. It is built without writing
// anything, so the candidate can look before they commit.
import { buildExtractionReview } from './server/cv/extractionReview.ts';
// The reading turned into the document shape, so a caller that only wants to
// look at a CV — the analyzer measuring a file — can have it without the
// candidate adopting anything.
import { parsedCvToProfile } from './server/cv/parsedCvToProfile.ts';
// The write half of the review: the candidate's own records, filled in from
// a document they have accepted.
import { applyReviewedImport } from './server/cv/reviewedImport.ts';
// The document the review screen produces and the import route writes.
import type { CVProfile } from './src/types/career.ts';
// The ATS evaluation lives in its own module because the background task runs
// the same code. One implementation means the score shown in CV Studio and the
// score stored on the version can never drift apart.
import { runAtsAnalysis, validateAtsPayload } from './server/cv/atsAnalysis.ts';
// The measured analysis of a CV. It runs no model, so the score it produces is
// measured from the document rather than described by a provider.
import {
  measureAndRecord,
  measureCvWithStages,
  recordMeasurement,
  resolveAnalysisRequest,
  toStoredAnalysis,
} from './server/cv/cvAnalysis.ts';
import { listCvMeasurements } from './server/db/cvMeasurements.ts';
import { registerBackgroundJobRoutes } from './server/jobs/routes.ts';
import { registerSubscriptionRoutes } from './server/subscriptions/routes.ts';
import { requireEntitlement } from './server/subscriptions/entitlements.ts';
import { requireCredits } from './server/credits/middleware.ts';
import { boundedList } from './server/ai/boundedList.ts';
import { generateCoverLetter } from './server/cv/coverLetter.ts';
import { universalAi, isAnyAiConfigured, getDefaultProvider } from './server/ai/provider.ts';

// Express request augmentation.
//
//  attaches the verified Supabase user to the request and the route
// handlers read it as . TypeScript needs to be told that the
// property exists on the base  type.
//
// The augmentation is additive and optional: a request that has not passed
// through  simply has no user.
//
// B.4:  was not part of the TypeScript program before (the tsconfig
//  listed the  DIRECTORY, not the root  file), so
// none of the server code was ever type-checked. That gap is now closed.
declare global {
  namespace Express {
    interface Request {
      authUser?: { id: string; email?: string };
    }
  }
}
import { requireAuth, requireSession } from './server/auth/require-auth.ts';
import { findProfileByUsername } from './server/db/profiles.ts';
import { changePassword, changeEmail, deleteAccount } from './server/db/account.ts';
import { saveState, loadState, unmappedStateFields } from './server/db/state.ts';
import { getSupabaseServer } from './server/db/supabase.ts';
import {
  listRoadmaps,
  createRoadmapWithTree,
  enrollInRoadmap,
  updateTaskStatus,
  addTask,
  deleteRoadmap,
  ROADMAP_TASK_STATUSES,
  type RoadmapTaskStatus,
  type RoadmapTreePhaseInput,
} from './server/db/roadmap.ts';
import {
  listExperiences,
  getExperience,
  createExperience,
  updateExperience,
  deleteExperience,
} from './server/db/experiences.ts';
import { DateValidationError, parseDate } from './shared/dateRange.ts';
import {
  listEducations,
  getEducation,
  createEducation,
  updateEducation,
  deleteEducation,
} from './server/db/educations.ts';
import {
  getUserSkills,
  resolveSkillId,
  setUserSkillLevel,
  deleteUserSkill,
} from './server/db/userSkills.ts';
import {
  listNotifications,
  createNotification,
  markNotificationRead,
  markAllNotificationsRead,
  recordNotificationClick,
  deleteNotification,
  clearNotifications,
  NOTIFICATION_TYPES,
  type NotificationType,
} from './server/db/notifications.ts';
import { getProfileDto, updateProfileDto } from './server/db/profile.ts';
import { isOnboardingStatus } from './shared/onboarding.ts';
import { recordConsent, resolveConsentState } from './server/db/consents.ts';
import {
  createApplicationPackage,
  listApplicationPackages,
  updateApplicationPackage,
} from './server/db/applicationPackages.ts';
import { PRIVACY_VERSION, TERMS_VERSION } from './shared/legal.ts';
import { hasServerTermsApproval } from './server/legal.ts';
import { resolveTargetRoleWrite } from './server/targetRole.ts';
import { getPreferences, upsertPreferences } from './server/db/preferences.ts';
import { isOrderedCollection, reorderCollection } from './server/db/ordering.ts';
import {
  isResumeLanguage,
  normalizeResumeLanguage,
} from './shared/resumeLanguage.ts';
import {
  getFeedbackState,
  recordFeedbackEvent,
  registerFeedbackSession,
} from './server/db/feedback.ts';
import {
  isFeedbackEventType,
  isFeedbackSource,
} from './shared/feedback.ts';
import {
  listBookmarks,
  createBookmark,
  deleteBookmark,
} from './server/db/bookmarks.ts';
import {
  listCourses,
  getCourse,
  searchCourses,
  type SearchCoursesParams,
  listLearningItems,
  upsertLearningItem,
  updateLearningItem,
  deleteLearningItem,
  listCoursesForAdmin,
  updateCourseForAdmin,
} from './server/db/learning.ts';
import { rankCourses, selectNextStep, type LearningFormat, type LearningStatus } from './server/learning/recommendation.ts';
import { enrichRecommendationsWithAi } from './server/learning/ai.ts';
import { buildLearningContext } from './server/learning/context.ts';
import {
  buildPersonalizedPlan,
  generateAndPersistRoadmap,
  getOrRefreshRoadmap,
  getSkillGapSummary,
  RoadmapGenerationError,
} from './server/roadmap/service.ts';
import {
  listVolunteerOpportunities,
  saveVolunteerOpportunity,
  unsaveVolunteerOpportunity,
  listOpportunitiesForAdmin,
  updateOpportunityForAdmin,
} from './server/db/volunteerOpportunities.ts';
import {
  AdminError,
  archiveAnnouncement,
  createAdmin,
  createAnnouncement,
  deleteAnnouncement,
  getAdminAnalytics,
  getAdminByProfileId,
  listAdmins,
  listAnnouncements,
  listAuditLog,
  logAdminAction,
  previewAnnouncementAudience,
  processDueAnnouncements,
  publishAnnouncement,
  removeAdmin,
  scheduleAnnouncement,
  searchProfiles,
  updateAdmin,
  updateAnnouncement,
} from './server/db/admin.ts';
import {
  requireAdmin,
  requireAnyPermission,
  requirePermission,
} from './server/admin/permissions.ts';
import {
  isAnnouncementAudience,
  isAnnouncementCategory,
  isAnnouncementPriority,
  isAnnouncementStatus,
  isAdminRole,
  normaliseAudienceRules,
  type AnnouncementCategory,
  type AnnouncementPriority,
  type AnnouncementStatus,
  type AudienceRuleGroup,
} from './shared/admin.ts';
import { isLearningResourceType } from './shared/learningResources.ts';
import {
  isOpportunityAudience,
  isOpportunityKind,
  isOpportunityVerificationStatus,
  isParticipationMode,
} from './shared/opportunities.ts';
import { buildCvFromProfile } from './server/cv/buildCv.ts';
import {
  generateCvAssistText,
  generateCvHeadlineSuggestions,
  type CvAssistRequest,
} from './server/cv/aiAssist.ts';
import {
  isCvAssistAction,
  isCvAssistField,
  isCvAssistLength,
  isCvAssistSourceKind,
  isCvAssistTone,
} from './shared/cvAiAssist.ts';
import {
  analyzeJobDescription,
  buildJobDescriptionMatch,
  generateAtsCvContent,
  MAX_JOB_DESCRIPTION_CHARS,
  type ClientCvDocument,
  type JobDescriptionAiClient,
} from './server/cv/jobDescription.ts';
import {
  recommendProjects,
  buildProjectRecommendationContext,
} from './server/projects/recommendation.ts';
import { analyzeProjects } from './server/projects/analysis.ts';
import { MIN_JOB_DESCRIPTION_TEXT_LENGTH, type JobDescriptionAnalysis } from './shared/jobDescription.ts';
import {
  listDismissedGuides,
  dismissGuide,
  resetAllGuides,
} from './server/db/guides.ts';
import { loadAiCareerContext, buildAiContextBlock } from './server/ai/careerContext.ts';
import {
  aiLanguageInstruction,
  normalizeAiLanguage,
  type AiLanguageCode,
} from './shared/aiLanguages.ts';
import {
  groundingRules,
  stripUngroundedSentences,
} from './server/ai/grounding.ts';
import { buildGroundingProfileForUser } from './server/ai/groundingProfile.ts';
import {
  consumeDailyAiBudget,
  isQuotaError,
  quotaRetryAfterSeconds,
  refundDailyAiBudget,
} from './server/ai/quota.ts';
import { CATALOG_SKILL_NAMES } from './shared/careerRoles.ts';
import {
  uploadCvFile,
  createCvFileDownloadUrl,
  deleteCvFile,
  pathBelongsToUser,
  extensionForMimeType,
  MAX_CV_FILE_BYTES,
} from './server/db/cvStorage.ts';
import {
  listCvs,
  getCv,
  createCv,
  updateCv,
  getCv as getCvRow,
  setActiveCv,
  deleteCv,
} from './server/db/cvs.ts';
import {
  listCvVersions,
  getCvVersion,
  createCvVersion,
  updateCvVersion,
  deleteCvVersion,
} from './server/db/cvVersions.ts';
import { uploadPortfolioFile } from './server/db/portfolioStorage.ts';
import {
  type ProjectDifficulty,
  type ProjectStatus,
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
} from './server/db/projects.ts';
import {
  listVolunteerExperiences,
  getVolunteerExperience,
  createVolunteerExperience,
  updateVolunteerExperience,
  deleteVolunteerExperience,
  listVolunteerExperiencesForProject,
} from './server/db/volunteer.ts';
import {
  listEvidence,
  getEvidence,
  createEvidence,
  updateEvidence,
  deleteEvidence,
  EVIDENCE_TYPES,
} from './server/db/evidence.ts';
import {
  listCertifications,
  createCertification,
  updateCertification,
  deleteCertification,
  listLanguages,
  createLanguage,
  updateLanguage,
  deleteLanguage,
  listProfileLinks,
  createProfileLink,
  updateProfileLink,
  deleteProfileLink,
  getCareerIdentity,
  saveCareerIdentity,
  LANGUAGE_PROFICIENCIES,
} from './server/db/profileExtensions.ts';
import {
  listSavedRoles,
  createSavedRole,
  deleteSavedRole,
} from './server/db/savedRoles.ts';
import {
  listJobApplications,
  getJobApplication,
  createJobApplication,
  updateJobApplication,
  deleteJobApplication,
  APPLICATION_STAGES,
} from './server/db/jobApplications.ts';
import {
  listInterviewSessions,
  getInterviewSession,
  createInterviewSession,
  updateInterviewSession,
  deleteInterviewSession,
  INTERVIEW_TYPES,
} from './server/db/interviewSessions.ts';
import {
  listActivities,
  createActivity,
  ACTIVITY_ACTION_TYPES,
  type ActivityActionType,
} from './server/db/activities.ts';
import {
  listSecondaryGoals,
  createSecondaryGoal,
  updateSecondaryGoal,
  deleteSecondaryGoal,
  type SecondaryGoalPriority,
  type SecondaryGoalStatus,
} from './server/db/secondaryGoals.ts';
import {
  listCareerMilestones,
  createCareerMilestone,
  updateCareerMilestone,
  deleteCareerMilestone,
  MILESTONE_CATEGORIES,
  type MilestoneCategory,
} from './server/db/careerMilestones.ts';
import {
  listCoverLetters,
  getCoverLetter,
  createCoverLetter,
  updateCoverLetter,
  deleteCoverLetter,
} from './server/db/coverLetters.ts';
import {
  coursePath,
  opportunityPath,
  resolvePublicPage,
  renderNotFoundPage,
} from './server/seo/publicPages.ts';
import { buildSitemapXml, collectSitemapEntries } from './server/seo/sitemap.ts';
import { buildRobotsTxt } from './server/seo/robots.ts';
import { PUBLIC_PAGE_CSP } from './server/seo/html.ts';
import { submitIndexNow } from './server/seo/indexnow.ts';
import { fetchTrafficReport } from './server/analytics/ga4.ts';
import { VERIFICATION_PATH, verificationFileBody } from './server/seo/verification.ts';
import {
  searchJobs,
  getJobDetails,
  isJobSearchConfigured,
  JobSearchError,
} from './server/jsearch/client.ts';
import {
  JOB_SOURCE_LABEL,
  matchJobToSkills,
  type LiveJob,
} from './shared/jobs.ts';

export const app = express();

// Do not advertise the framework.
app.disable('x-powered-by');

// Baseline security headers.
//
// The document-level Content-Security-Policy lives in `public/_headers`, because
// it only applies to the HTML response served by Pages (the API never returns
// markup). The headers below are the subset that is meaningful on JSON
// responses; HSTS is repeated here so API calls made directly also advertise it.
app.use((_req: Request, res: Response, next: () => void) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  next();
});

// Request body parsing.
//
// This used to be `express.json()` + `express.urlencoded()`. Both come from
// body-parser, which imports iconv-lite; iconv-lite's package.json maps its
// Node-only modules to `false` in the `browser` field, and the Cloudflare
// Pages Functions bundler honours that field. The result was a runtime crash
// ("require_streams(...) is not a function") on the first API request in the
// Workers runtime, even though Node was fine.
//
// The parser below is deliberately small and equivalent for this API: UTF-8
// JSON and form-encoded bodies, a 15 MB ceiling, `req.body` populated the same
// way, and a 400 for malformed JSON. Multipart requests are untouched and are
// still handled by multer on the upload route.
const BODY_LIMIT_BYTES = 15 * 1024 * 1024;

function collectRequestBody(req: Request): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;

    req.on('data', (chunk: Buffer) => {
      if (settled) return;
      size += chunk.length;
      if (size > BODY_LIMIT_BYTES) {
        settled = true;
        const error: any = new Error('Payload too large');
        error.status = 413;
        reject(error);
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    });
    req.on('error', (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

app.use((req: Request, res: Response, next: () => void) => {
  const contentType = String(req.headers['content-type'] ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();

  if (
    req.method === 'GET' ||
    req.method === 'HEAD' ||
    req.method === 'OPTIONS' ||
    (contentType !== 'application/json' &&
      contentType !== 'application/x-www-form-urlencoded')
  ) {
    return next();
  }

  const declaredLength = Number(req.headers['content-length'] ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > BODY_LIMIT_BYTES) {
    return res.status(413).json({ error: 'Payload too large' });
  }

  collectRequestBody(req)
    .then((buffer) => {
      const text = buffer.toString('utf8');
      if (contentType === 'application/json') {
        if (text.length === 0) {
          req.body = {};
          return next();
        }
        try {
          req.body = JSON.parse(text);
        } catch {
          return res.status(400).json({ error: 'Malformed JSON body' });
        }
      } else {
        req.body = Object.fromEntries(new URLSearchParams(text));
      }
      next();
    })
    .catch((error: any) => {
      if (error?.status === 413) {
        return res.status(413).json({ error: 'Payload too large' });
      }
      console.error('Failed to read request body:', error);
      return res.status(400).json({ error: 'Malformed request body' });
    });
});

// CORS (B.3.9 finding P-2).
//
// The API is served from the same origin as the app, so no cross-origin
// access is needed in production. Rather than leaving the behaviour
// undefined — which would silently break if a separate frontend origin were
// ever introduced, or silently open up if a permissive default were added
// later — the allowed origins are declared explicitly.
//
// A request whose Origin is not allowed gets no CORS headers, which the
// browser refuses. Same-origin and server-to-server requests are unaffected.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

app.use((req: Request, res: Response, next: () => void) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') {
    // Preflight is answered here; no route handler needs to run.
    return res.status(204).end();
  }
  next();
});

// Background jobs (Cloudflare Queues).
//
// The feature is a coherent unit — the API that starts a task, the durable
// record of the job and the client that talks to the platform — so it lives in
// its own module and is mounted here.
registerBackgroundJobRoutes(app);

// Server-side scheduler tick.
//
// Announcements scheduled for a future time must publish even when no
// administrator has a browser open. Every isolate checks at most once a minute
// as API traffic arrives; the explicit process-due endpoint can also be called
// by an external scheduler. Tests disable the tick so their timing is exact.
let lastSchedulerTick = 0;
app.use('/api', (req: Request, _res: Response, next: () => void) => {
  if (process.env.ADMIN_SCHEDULER_DISABLED === 'true') return next();
  // The explicit endpoint runs the tick itself (and reports its counts), so
  // running it here as well would schedule the same announcement twice per
  // request. One tick per request is enough.
  if (req.originalUrl.startsWith('/api/admin/announcements/process-due')) return next();
  const now = Date.now();
  if (now - lastSchedulerTick > 60_000) {
    lastSchedulerTick = now;
    void processDueAnnouncements().catch((error) => {
      console.error('Scheduled-announcement tick failed:', error);
    });
  }
  next();
});

// Multer in-memory storage for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Job ads are parsed from memory only and capped below the general CV limit.
const jobDescriptionUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Accepted CV upload formats.
//
// A file must match BOTH its extension and one of the MIME types declared for
// that extension, so a renamed or crafted upload cannot pass the format check
// under a false identity.
//
// Supported formats: PDF, DOCX, DOC, TXT, JSON.
const CV_UPLOAD_TYPES: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.docx': [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'application/octet-stream',
    'application/x-zip-compressed',
  ],
  '.doc': [
    'application/msword',
    'application/vnd.ms-word',
    'application/octet-stream',
  ],
  '.txt': ['text/plain'],
  '.json': ['application/json'],
};
const CV_UPLOAD_TYPE_ERROR =
  'Unsupported file type. Please upload a .pdf, .docx, .doc, .txt, or .json file.';

// Canonical skill lookup map built from CATALOG_SKILL_NAMES
const CANONICAL_SKILL_MAP = new Map<string, string>();
for (const skill of CATALOG_SKILL_NAMES) {
  CANONICAL_SKILL_MAP.set(skill.toLowerCase(), skill);
  const stripped = skill.toLowerCase().replace(/[\s._-]+/g, '');
  if (!CANONICAL_SKILL_MAP.has(stripped)) {
    CANONICAL_SKILL_MAP.set(stripped, skill);
  }
}

const COMMON_SKILL_ALIASES: Record<string, string> = {
  js: 'JavaScript',
  ts: 'TypeScript',
  py: 'Python',
  golang: 'Go',
  reactjs: 'React',
  'react.js': 'React',
  nodejs: 'Node.js',
  'node.js': 'Node.js',
  node: 'Node.js',
  vuejs: 'Vue.js',
  'vue.js': 'Vue.js',
  nextjs: 'Next.js',
  'next.js': 'Next.js',
  postgres: 'PostgreSQL',
  postgresql: 'PostgreSQL',
  mongo: 'MongoDB',
  mongodb: 'MongoDB',
  'ms excel': 'Microsoft Excel',
  excel: 'Microsoft Excel',
  'power bi': 'Power BI',
  powerbi: 'Power BI',
  k8s: 'Kubernetes',
  kube: 'Kubernetes',
  tf: 'Terraform',
  aws: 'AWS',
  'amazon web services': 'AWS',
  gcp: 'Google Cloud',
  'google cloud platform': 'Google Cloud',
  azure: 'Microsoft Azure',
  'ms azure': 'Microsoft Azure',
  'ci/cd': 'CI/CD',
  cicd: 'CI/CD',
  git: 'Git',
  docker: 'Docker',
  graphql: 'GraphQL',
};
for (const [alias, canonical] of Object.entries(COMMON_SKILL_ALIASES)) {
  CANONICAL_SKILL_MAP.set(alias.toLowerCase(), canonical);
  CANONICAL_SKILL_MAP.set(alias.toLowerCase().replace(/[\s._-]+/g, ''), canonical);
}

/**
 * Normalizes a raw skill string to the shared canonical catalogue skill where possible.
 */
function canonicalizeSkill(rawSkill: string): string {
  const trimmed = rawSkill.trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (CANONICAL_SKILL_MAP.has(lower)) {
    return CANONICAL_SKILL_MAP.get(lower)!;
  }
  const stripped = lower.replace(/[\s._-]+/g, '');
  if (CANONICAL_SKILL_MAP.has(stripped)) {
    return CANONICAL_SKILL_MAP.get(stripped)!;
  }
  return trimmed;
}

// Initialize Gemini Client
//
// B.3.9 finding P-3: the key is validated at startup so a missing key is
// reported clearly instead of surfacing as a confusing failure on the first
// AI request. The application still starts — the AI routes are the only ones
// that need the key — but the problem is stated plainly at boot.
if (!isAnyAiConfigured()) {
  console.warn(
    '[server] GEMINI_API_KEY is not set. The AI routes (/api/copilot, ' +
      '/api/analyze-career, /api/optimize-cv, /api/mock-interview, ' +
      '/api/suggest-summary, /api/generate-cover-letter) will fail until it is configured.'
  );
}

let aiClient: GoogleGenAI | null = null;
let aiClientApiKey: string | null = null;

export function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }
  if (!aiClient || aiClientApiKey !== apiKey) {
    aiClientApiKey = apiKey;
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
        // Without a deadline an upstream stall keeps the HTTP request open
        // indefinitely. The SDK turns this into a normal rejection, which the
        // routes convert into their honest 503 response.
        timeout: 45_000,
      },
    });
  }
  return aiClient;
}

/**
 * Lazy facade used by the AI routes.
 *
 * Reading `.models` constructs the client on first use. The browser build of
 * @google/genai (the build the Workers runtime resolves) throws when it is
 * constructed without an API key, so eager construction would prevent the
 * ENTIRE API from loading whenever GEMINI_API_KEY is absent. With this
 * indirection a missing key throws inside the calling route's try/catch, which
 * answers an explicit 503 and leaves every non-AI route working.
 */
const ai = universalAi;

function getActiveAiModel(): string {
  const provider = getDefaultProvider();
  if (provider === 'openrouter') {
    return process.env.OPENROUTER_MODEL?.trim() || 'openrouter/free';
  }
  return getGeminiModel();
}

// The model is configurable so an operator can move to a newer or more
// available Flash model without editing code. Evaluated dynamically so
// Cloudflare Pages environment variables injected per-request are respected.
function getGeminiModel(): string {
  const model = process.env.GEMINI_MODEL?.trim();
  if (!model || model === 'gemini-3.8-flash') {
    return 'gemini-3.1-flash-lite';
  }
  return model;
}

// Structured-output validators.
//
// `responseMimeType: application/json` guarantees parseable JSON, not the
// shape the application asked for. Returning `{}` or a half-filled object as
// if it were a real analysis would be another form of fabricated output, so
// every structured AI route validates the payload before responding.
type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isNumberInRange(value: unknown, min = 0, max = 100): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}

function validateCareerAnalysisPayload(value: unknown): string[] {
  if (!isJsonObject(value)) return ['response is not an object'];
  const errors: string[] = [];
  if (!isNumberInRange(value.matchPercentage)) errors.push('matchPercentage');
  for (const key of [
    'missingExperience',
    'careerRisks',
    'recommendedProjects',
    'recommendedLearning',
  ]) {
    if (!isStringArray(value[key])) errors.push(key);
  }
  if (!Array.isArray(value.strengths)) {
    errors.push('strengths');
  } else {
    value.strengths.forEach((entry, index) => {
      if (!isJsonObject(entry) || typeof entry.skill !== 'string' || typeof entry.note !== 'string') {
        errors.push(`strengths[${index}]`);
      }
    });
  }
  if (!Array.isArray(value.criticalGaps)) {
    errors.push('criticalGaps');
  } else {
    value.criticalGaps.forEach((entry, index) => {
      if (
        !isJsonObject(entry) ||
        typeof entry.skill !== 'string' ||
        !isNumberInRange(entry.current) ||
        !isNumberInRange(entry.target) ||
        typeof entry.reason !== 'string'
      ) {
        errors.push(`criticalGaps[${index}]`);
      }
    });
  }
  if (!isJsonObject(value.nextBestAction)) {
    errors.push('nextBestAction');
  } else {
    for (const key of ['title', 'description', 'reason']) {
      if (typeof value.nextBestAction[key] !== 'string') {
        errors.push(`nextBestAction.${key}`);
      }
    }
    if (!['task', 'course', 'project', 'cv'].includes(String(value.nextBestAction.actionType))) {
      errors.push('nextBestAction.actionType');
    }
  }
  return errors;
}

function validateInterviewPayload(value: unknown): string[] {
  if (!isJsonObject(value)) return ['response is not an object'];
  const errors: string[] = [];
  if (!isNumberInRange(value.score)) errors.push('score');
  for (const key of ['strengths', 'improvements']) {
    if (!isStringArray(value[key])) errors.push(key);
  }
  if (!isJsonObject(value.starEvaluation)) {
    errors.push('starEvaluation');
  } else {
    for (const key of ['situation', 'task', 'action', 'result']) {
      if (typeof value.starEvaluation[key] !== 'string') {
        errors.push(`starEvaluation.${key}`);
      }
    }
  }
  if (typeof value.suggestedAnswer !== 'string') errors.push('suggestedAnswer');
  return errors;
}

function validateSummaryPayload(value: unknown): string[] {
  if (!isJsonObject(value)) return ['response is not an object'];
  if (typeof value.suggestedSummary !== 'string' || value.suggestedSummary.trim().length < 50) {
    return ['suggestedSummary'];
  }
  return [];
}

// Health Check
//
// `modelConfigured` reports WHETHER a model is configured — never the key
// itself. It lets a client (and the test suite) tell "there is no model on
// this server" apart from "the model's quota is exhausted", which are very
// different problems.
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    modelConfigured: isAnyAiConfigured(),
    modelName: getActiveAiModel(),
    providers: {
      gemini: Boolean(process.env.GEMINI_API_KEY),
      openrouter: Boolean(process.env.OPENROUTER_API_KEY),
    },
  });
});

// Persistent State Load
//
// DEPRECATED — read-only. The aggregate payload is a compatibility view for
// the profile/preferences columns only. Every domain that has a dedicated
// endpoint (projects, evidence, CVs, roadmap, skills, experiences, education,
// certifications, languages, links, career identity, saved roles, job
// applications, interviews, activities, secondary goals, milestones, cover
// letters) is read from ITS OWN table, never from this payload.
app.get('/api/state', async (req: Request, res: Response) => {
  try {
    // Authoritative identity: verified Supabase Auth token only.
    const auth = await verifySupabaseToken(req.headers.authorization);
    if (auth.status !== 'valid') {
      return res.status(401).json({ error: 'Invalid or missing session' });
    }
    const state = await loadState(auth.userId);
    return res.json({ success: true, state });
  } catch (error) {
    console.error('Error reading state:', error);
    return res.status(500).json({ error: 'Failed to read server state' });
  }
});

// Persistent State Save
//
// DEPRECATED and NON-DESTRUCTIVE.
//
// This endpoint used to DELETE every one of the caller's `experiences` and
// `educations` rows and re-insert whatever the payload contained. Combined
// with the frontend's demo-seeded initial profile and its unconditional
// auto-sync, that destroyed a real user's employment and education history on
// first load (B.3.8 finding C-1).
//
// The endpoint is kept only as a compatibility shim for the profile and
// preferences columns. It NEVER replaces a collection: the collection-owning
// fields are reported as unmapped so the caller can see they were not applied,
// and the caller must use the dedicated endpoints for them.
app.post('/api/state', async (req: Request, res: Response) => {
  try {
    // Authoritative identity: verified Supabase Auth token only.
    const auth = await verifySupabaseToken(req.headers.authorization);
    if (auth.status !== 'valid') {
      return res.status(401).json({ error: 'Invalid or missing session' });
    }
    const stateData = req.body || {};
    const unmapped = unmappedStateFields(stateData);
    if (unmapped.length > 0) {
      // Report, never silently drop.
      console.warn('Unmapped state fields (no column in current schema):', unmapped.join(', '));
    }
    const { unmappedCollections } = await saveState(auth.userId, stateData);
    if (unmappedCollections.length > 0) {
      // These collections are owned by their own endpoints. They are reported
      // so the caller knows they were NOT applied here — this endpoint never
      // replaces them.
      console.warn(
        'Collections ignored by the aggregate endpoint (use their own endpoints):',
        unmappedCollections.join(', ')
      );
    }
    return res.json({
      success: true,
      message: 'State saved successfully',
      deprecated: true,
      ...(unmapped.length > 0 ? { unmappedFields: unmapped } : {}),
      ...(unmappedCollections.length > 0 ? { unmappedCollections } : {}),
    });
  } catch (error) {
    console.error('Error writing state:', error);
    return res.status(500).json({ error: 'Failed to persist state' });
  }
});

// ---- The order of the CV entries ----
//
// The order of the experience, the education, the certifications, the
// languages and the projects is part of the document, so it is stored rather
// than re-derived from a date on every read.
//
// The collection is chosen from a fixed list on the server, the owner is
// always the verified user id, and the whole collection is renumbered so the
// stored order is always complete.
app.post('/api/profile/reorder', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    if (!isOrderedCollection(body.collection)) {
      return res.status(400).json({ error: 'Invalid collection' });
    }
    if (!Array.isArray(body.ids)) {
      return res.status(400).json({ error: 'Invalid ids' });
    }
    const ids = body.ids
      .filter((id: unknown): id is string => typeof id === 'string')
      .slice(0, 500);
    const order = await reorderCollection(req.authUser!.id, body.collection, ids);
    return res.json({ success: true, collection: body.collection, order });
  } catch (error) {
    console.error('Failed to reorder the collection:', error);
    return res.status(500).json({ error: 'Failed to reorder the collection' });
  }
});

// ---- Experiences ----
//
// Dedicated persistence for public.experiences. The owner is always the
// verified Supabase Auth user id; a client-supplied user id is never used.
app.get('/api/experiences', requireAuth, async (req: Request, res: Response) => {
  try {
    const experiences = await listExperiences(req.authUser!.id);
    return res.json({ success: true, experiences });
  } catch (error) {
    console.error('Failed to list experiences:', error);
    return res.status(500).json({ error: 'Failed to load experiences' });
  }
});

app.get('/api/experiences/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const experience = await getExperience(req.authUser!.id, req.params.id);
    if (!experience) return res.status(404).json({ error: 'Experience not found' });
    return res.json({ success: true, experience });
  } catch (error) {
    console.error('Failed to load experience:', error);
    return res.status(500).json({ error: 'Failed to load experience' });
  }
});

app.post('/api/experiences', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const role = str(body.role, 200);
    if (!role) return res.status(400).json({ error: 'Role is required' });
    const company = str(body.company, 200);
    if (!company) return res.status(400).json({ error: 'Company is required' });
    const experience = await createExperience(req.authUser!.id, {
      role,
      company,
      employmentType: str(body.employmentType, 60) ?? undefined,
      location: str(body.location, 200) ?? undefined,
      startDate: str(body.startDate, 40) ?? undefined,
      endDate: str(body.endDate, 40) ?? undefined,
      isCurrent: typeof body.isCurrent === 'boolean' ? body.isCurrent : undefined,
      description: str(body.description, 5000) ?? undefined,
      achievements: Array.isArray(body.achievements)
        ? body.achievements.filter((a: unknown) => typeof a === 'string').slice(0, 50)
        : undefined,
    });
    return res.status(201).json({ success: true, experience });
  } catch (error) {
    if (error instanceof DateValidationError) {
      return res.status(400).json({ error: error.message, field: error.field });
    }
    console.error('Failed to create experience:', error);
    return res.status(500).json({ error: 'Failed to create experience' });
  }
});

app.patch('/api/experiences/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const body = req.body ?? {};
    const experience = await updateExperience(req.authUser!.id, req.params.id, {
      role: str(body.role, 200) ?? undefined,
      company: str(body.company, 200) ?? undefined,
      employmentType: str(body.employmentType, 60) ?? undefined,
      location: str(body.location, 200) ?? undefined,
      startDate: str(body.startDate, 40) ?? undefined,
      endDate: str(body.endDate, 40) ?? undefined,
      isCurrent: typeof body.isCurrent === 'boolean' ? body.isCurrent : undefined,
      description: str(body.description, 5000) ?? undefined,
      achievements: Array.isArray(body.achievements)
        ? body.achievements.filter((a: unknown) => typeof a === 'string').slice(0, 50)
        : undefined,
    });
    if (!experience) return res.status(404).json({ error: 'Experience not found' });
    return res.json({ success: true, experience });
  } catch (error) {
    if (error instanceof DateValidationError) {
      return res.status(400).json({ error: error.message, field: error.field });
    }
    console.error('Failed to update experience:', error);
    return res.status(500).json({ error: 'Failed to update experience' });
  }
});

app.delete('/api/experiences/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const deleted = await deleteExperience(req.authUser!.id, req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Experience not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete experience:', error);
    return res.status(500).json({ error: 'Failed to delete experience' });
  }
});

// ---- Education ----
//
// Dedicated persistence for public.educations.
app.get('/api/educations', requireAuth, async (req: Request, res: Response) => {
  try {
    const educations = await listEducations(req.authUser!.id);
    return res.json({ success: true, educations });
  } catch (error) {
    console.error('Failed to list educations:', error);
    return res.status(500).json({ error: 'Failed to load education' });
  }
});

app.get('/api/educations/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const education = await getEducation(req.authUser!.id, req.params.id);
    if (!education) return res.status(404).json({ error: 'Education not found' });
    return res.json({ success: true, education });
  } catch (error) {
    console.error('Failed to load education:', error);
    return res.status(500).json({ error: 'Failed to load education' });
  }
});

app.post('/api/educations', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const institution = str(body.institution, 200);
    if (!institution) return res.status(400).json({ error: 'Institution is required' });
    const education = await createEducation(req.authUser!.id, {
      institution,
      degree: str(body.degree, 200) ?? undefined,
      field: str(body.field, 200) ?? undefined,
      startDate: str(body.startDate, 40) ?? undefined,
      endDate: str(body.endDate, 40) ?? undefined,
      isCurrent: typeof body.isCurrent === 'boolean' ? body.isCurrent : undefined,
      description: str(body.description, 5000) ?? undefined,
      gpa: str(body.gpa, 40) ?? undefined,
      coursework: Array.isArray(body.coursework)
        ? body.coursework.filter((c: unknown) => typeof c === 'string').slice(0, 50)
        : undefined,
    });
    return res.status(201).json({ success: true, education });
  } catch (error) {
    if (error instanceof DateValidationError) {
      return res.status(400).json({ error: error.message, field: error.field });
    }
    console.error('Failed to create education:', error);
    return res.status(500).json({ error: 'Failed to create education' });
  }
});

app.patch('/api/educations/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const body = req.body ?? {};
    const education = await updateEducation(req.authUser!.id, req.params.id, {
      institution: str(body.institution, 200) ?? undefined,
      degree: str(body.degree, 200) ?? undefined,
      field: str(body.field, 200) ?? undefined,
      startDate: str(body.startDate, 40) ?? undefined,
      endDate: str(body.endDate, 40) ?? undefined,
      isCurrent: typeof body.isCurrent === 'boolean' ? body.isCurrent : undefined,
      description: str(body.description, 5000) ?? undefined,
      gpa: str(body.gpa, 40) ?? undefined,
      coursework: Array.isArray(body.coursework)
        ? body.coursework.filter((c: unknown) => typeof c === 'string').slice(0, 50)
        : undefined,
    });
    if (!education) return res.status(404).json({ error: 'Education not found' });
    return res.json({ success: true, education });
  } catch (error) {
    if (error instanceof DateValidationError) {
      return res.status(400).json({ error: error.message, field: error.field });
    }
    console.error('Failed to update education:', error);
    return res.status(500).json({ error: 'Failed to update education' });
  }
});

app.delete('/api/educations/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const deleted = await deleteEducation(req.authUser!.id, req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Education not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete education:', error);
    return res.status(500).json({ error: 'Failed to delete education' });
  }
});

// ---- User skills ----
//
// Dedicated persistence for the caller's skill levels (public.user_skills).
// `public.skills` is a GLOBAL catalogue: a skill name is resolved to its
// catalogue id, creating the catalogue row only when it does not exist yet.
app.get('/api/user-skills', requireAuth, async (req: Request, res: Response) => {
  try {
    const skills = await getUserSkills(req.authUser!.id);
    return res.json({ success: true, skills });
  } catch (error) {
    console.error('Failed to list user skills:', error);
    return res.status(500).json({ error: 'Failed to load skills' });
  }
});

app.post('/api/user-skills', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const name = str(body.name, 200);
    if (!name) return res.status(400).json({ error: 'Skill name is required' });
    const proficiency = body.proficiency ?? body.currentLevel ?? body.level;
    if (typeof proficiency !== 'number' || !Number.isInteger(proficiency)) {
      return res.status(400).json({ error: 'Proficiency must be an integer' });
    }
    if (proficiency < 1 || proficiency > 5) {
      return res.status(400).json({ error: 'Proficiency must be between 1 and 5' });
    }

    const skillId = await resolveSkillId(name, str(body.category, 60) ?? undefined);
    if (!skillId) return res.status(400).json({ error: 'Could not resolve skill' });

    const yearsExperience =
      typeof body.yearsExperience === 'number' && Number.isFinite(body.yearsExperience)
        ? body.yearsExperience
        : undefined;

    const skill = await setUserSkillLevel(req.authUser!.id, skillId, {
      proficiency,
      years_experience: yearsExperience,
    });
    return res.status(201).json({ success: true, skill });
  } catch (error) {
    console.error('Failed to save user skill:', error);
    return res.status(500).json({ error: 'Failed to save skill' });
  }
});

app.delete('/api/user-skills/:skillId', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.skillId)) return res.status(400).json({ error: 'Invalid skill id' });
    const deleted = await deleteUserSkill(req.authUser!.id, req.params.skillId);
    if (!deleted) return res.status(404).json({ error: 'Skill not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete user skill:', error);
    return res.status(500).json({ error: 'Failed to delete skill' });
  }
});

/**
 * A small, in-process rate limiter for the AI routes.
 *
 * Those routes call Gemini with the application's key, so an authenticated
 * user could otherwise drive unbounded spend. The limiter is keyed on the
 * VERIFIED user id (never a client-supplied value), so one user cannot exhaust
 * another's budget by spoofing a header.
 *
 * It is deliberately dependency-free: the audit asked for a small, targeted
 * change rather than a new dependency or a new architecture.
 */
interface RateBucket {
  count: number;
  resetAt: number;
}

const AI_RATE_LIMIT = 30;           // requests ...
const AI_RATE_WINDOW_MS = 60_000;   // ... per minute
const rateBuckets = new Map<string, RateBucket>();

// Buckets are pruned lazily, at most once per window, on the next request that
// uses a limiter. A module-level `setInterval` is not portable: the Workers
// runtime rejects timers created in global scope ("Disallowed operation called
// within global scope"), and it would also keep the Node process alive.
let lastRateSweep = Date.now();

function sweepRateBuckets(now: number): void {
  if (now - lastRateSweep < AI_RATE_WINDOW_MS) return;
  lastRateSweep = now;
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
}

/**
 * Express middleware that limits a caller to a fixed number of requests per
 * window. Must run AFTER `requireAuth`, so the verified user id is available.
 */
function rateLimit(limit: number, windowMs: number, namespace = 'global') {
  return (req: Request, res: Response, next: () => void) => {
    const key = `${namespace}:${req.authUser?.id ?? req.ip ?? 'anonymous'}`;
    const now = Date.now();
    sweepRateBuckets(now);
    let bucket = rateBuckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      rateBuckets.set(key, bucket);
    }

    bucket.count += 1;
    if (bucket.count > limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        error: 'Too many requests. Please slow down and try again shortly.',
        code: 'rate_limit',
        retryAfterSeconds,
      });
    }
    next();
  };
}

/** The limiter applied to the Gemini-backed routes. */
const aiRateLimit = rateLimit(AI_RATE_LIMIT, AI_RATE_WINDOW_MS, 'ai');

/**
 * Answers 503 when no model is configured on this server.
 *
 * This runs BEFORE the daily budget is touched: there is no model call to
 * spend budget on, so the caller must be told that the model is unavailable
 * rather than that the quota is exhausted. Consuming budget first would also
 * make the per-user rate limiter look like a shared, project-wide limit.
 */
function modelUnavailable(res: Response): Response {
  return res.status(503).json({
    error:
      'The AI assistant is not configured on this server, so no result was generated. Please try again later.',
    code: 'model_unavailable',
  });
}

/**
 * Consumes units of the daily AI budget for this caller.
 *
 * Returns null when the request may proceed, or the 429 response to send
 * when the daily allowance is used up. The response carries a machine-readable
 * `code`, so a client can tell "your own daily allowance is spent" apart from
 * "the provider's quota is spent" — two different problems with two different
 * remedies.
 *
 * `count` is how many units the route's model calls cost. A route that makes
 * two calls spends two units, so the allowance reflects the requests that
 * actually reach the provider.
 */
function consumeAiBudget(res: Response, userId?: string | null, count = 1): Response | null {
  const budget = consumeDailyAiBudget(userId, { count });
  if (budget.allowed) return null;
  res.setHeader('Retry-After', String(budget.retryAfterSeconds));
  return res.status(429).json({
    error:
      "The AI assistant has reached today's usage limit. Your message was not answered; please try again later.",
    code: 'ai_daily_budget',
    scope: budget.scope,
    retryAfterSeconds: budget.retryAfterSeconds,
  });
}

/**
 * Consumes units of the daily AI budget WITHOUT answering the request.
 *
 * Used by the routes that have a working non-AI fallback (the CV upload
 * falls back to a deterministic parser): when the allowance is spent the
 * model is skipped and the route continues, so the user still gets a result.
 *
 * `count` is how many units the route's model calls cost, so a route that
 * makes two calls spends two units.
 */
function tryConsumeAiBudget(userId?: string | null, count = 1): boolean {
  return consumeDailyAiBudget(userId, { count }).allowed;
}
/**
 * Reports an AI failure honestly.
 *
 * A provider quota error becomes a 429 with a Retry-After header, so the
 * client (and any monitoring) can tell "come back tomorrow" from "try again
 * in a moment". Every other failure is a 503: the caller is told that no
 * result was produced, and no generated content is invented.
 *
 * A provider quota error also gives the daily budget its unit back: the
 * provider refused to serve the request, so it must not count against the
 * application's allowance either.
 */
function respondAiFailure(
  res: Response,
  error: unknown,
  message: string,
  userId?: string | null
): Response {
  console.error('AI request unavailable:', error);
  if (isQuotaError(error)) {
    refundDailyAiBudget(userId);
    const retryAfterSeconds = quotaRetryAfterSeconds(error);
    res.setHeader('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({
      error:
        "The AI assistant has reached today's usage limit. Nothing was generated; please try again later.",
      code: 'provider_quota',
      retryAfterSeconds,
    });
  }
  return res.status(503).json({ error: message, code: 'ai_unavailable' });
}

// CV Upload Pipeline (POST /api/resumes/upload)
//
// This is a staged pipeline, not a single model call:
//
//   1. the real document format is decoded (PDF text layer / DOCX OOXML);
//   2. the extracted text is assessed for quality and scanned/image-only PDFs
//      are rejected with a specific message (OCR is not implemented);
//   3. a deterministic parser builds the structured CV, with evidence and
//      confidence for every field;
//   4. the review UI shows that result and the user confirms it before the
//      import is persisted.
//
// Gemini is used only for the optional ATS diagnostic on the already-parsed CV.
// It is never the parser of record, so a provider failure cannot lose or invent
// the user's CV data. The route still carries the AI limiter for the ATS call.
const parseJobDescriptionUpload = (req: Request, res: Response, next: (error?: unknown) => void) => {
  jobDescriptionUpload.single('file')(req, res, (error: unknown) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Job description files must be 5 MB or smaller.', code: 'FILE_TOO_LARGE' });
    }
    return res.status(400).json({ error: 'The uploaded file could not be accepted.', code: 'INVALID_UPLOAD' });
  });
};

app.post('/api/job-descriptions/extract', requireAuth, aiRateLimit, parseJobDescriptionUpload, async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Choose a TXT, PDF or DOCX file.', code: 'FILE_REQUIRED' });

  const extension = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
  const acceptedTypes: Record<string, string[]> = {
    '.txt': ['text/plain'],
    '.pdf': ['application/pdf'],
    '.docx': [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/zip',
      'application/octet-stream',
      'application/x-zip-compressed',
    ],
  };
  const format = extension.slice(1);
  const mimeTypes = acceptedTypes[extension];
  if (!mimeTypes || !mimeTypes.includes(file.mimetype.toLowerCase())) {
    return res.status(400).json({ error: 'Choose a valid TXT, PDF or DOCX file.', code: 'UNSUPPORTED_FILE_TYPE' });
  }

  try {
    const extraction = await extractDocument(file.buffer, format as DocumentFormat);
    const text = extraction.text.trim();
    if (extraction.status !== 'ok' || text.length < MIN_JOB_DESCRIPTION_TEXT_LENGTH) {
      return res.status(422).json({
        error: 'No readable job description text was found in this file. Try another file or paste the text.',
        code: extraction.status === 'scanned' ? 'SCANNED_DOCUMENT' : 'NO_READABLE_TEXT',
      });
    }
    if (text.length > 200_000) {
      return res.status(413).json({ error: 'The extracted description exceeds 200,000 characters.', code: 'TEXT_TOO_LONG' });
    }
    return res.json({ success: true, text, format, characterCount: text.length });
  } catch {
    return res.status(422).json({ error: 'The job description file could not be parsed.', code: 'DOCUMENT_PARSE_FAILED' });
  }
});

app.post('/api/resumes/upload', requireAuth, aiRateLimit, upload.single('file'), async (req: Request, res: Response) => {
  try {
    let extraction: DocumentExtraction | null = null;

    if (req.file) {
      const originalName = req.file.originalname.toLowerCase();
      // The declared MIME type is compared without its parameters, so
      // 'text/plain; charset=utf-8' still matches 'text/plain'.
      const mimeType = req.file.mimetype.split(';')[0].trim().toLowerCase();
      const dot = originalName.lastIndexOf('.');
      const extension = dot > -1 ? originalName.slice(dot) : '';

      // Check format: the extension must be accepted AND the declared MIME
      // type must be one of the types accepted for that extension.
      const allowedMimeTypes = CV_UPLOAD_TYPES[extension];
      if (!allowedMimeTypes || !allowedMimeTypes.includes(mimeType)) {
        return res.status(400).json({ error: CV_UPLOAD_TYPE_ERROR });
      }

      extraction = await extractDocument(
        req.file.buffer,
        extension.slice(1) as DocumentFormat
      );
    } else {
      const pastedText = str(req.body?.text, 200_000);
      if (!pastedText) {
        return res.status(400).json({ error: 'No CV file or text provided' });
      }
      extraction = extractTextDocument(pastedText);
    }

    // Validate document readability and quality before parsing. A scanned PDF
    // is reported as scanned; it is not silently treated as an empty CV.
    const qualityAssessment = assessDocumentQuality(extraction);

    if (!qualityAssessment.isAcceptable) {
      return res.status(400).json({
        error:
          qualityAssessment.errorMessage ||
          'Unable to extract sufficient readable text from the document.',
        code: qualityAssessment.isScannedPdf ? 'scanned_pdf' : 'unreadable_document',
        isScannedPdf: qualityAssessment.isScannedPdf,
        document: {
          format: extraction.format,
          pageCount: extraction.pageCount,
          layout: extraction.layout,
          characterCount: extraction.characterCount,
          wordCount: extraction.wordCount,
        },
      });
    }

    // The target role comes from the request when the caller supplies it, and
    // otherwise from the user's own profile. There is no hard-coded default
    // role: the fallback is a neutral label, because this endpoint is used
    // for every career domain.
    const requestedRoleTitle = str(req.body?.targetRoleTitle, 200);
    const profileRoleTitle = await getProfileDto(req.authUser!.id)
      .then((profile) => profile?.targetRole ?? null)
      .catch(() => null);
    const targetRoleTitle = requestedRoleTitle ?? profileRoleTitle ?? 'Target role';

    // Stage 3: deterministic structured extraction. This is intentionally the
    // only parser of record; there is no model fallback that can hallucinate a
    // company, date or degree when the provider is unavailable.
    let parsedCV: ReturnType<typeof parseStructuredCv>['cv'];
    let extractionMetadata: ReturnType<typeof parseStructuredCv>['metadata'];
    try {
      const parsed = parseStructuredCv(extraction);
      parsedCV = parsed.cv;
      extractionMetadata = parsed.metadata;
    } catch (parseErr) {
      console.error('Deterministic CV parsing failed:', parseErr);
      return res.status(422).json({
        error:
          'We could read the document but could not recognise its structure. Please review the text or paste your CV content.',
        code: 'parse_failed',
        document: {
          format: extraction.format,
          pageCount: extraction.pageCount,
          layout: extraction.layout,
          characterCount: extraction.characterCount,
          wordCount: extraction.wordCount,
        },
      });
    }

    const hasStructuredContent =
      Boolean(parsedCV.fullName || parsedCV.email || parsedCV.phone) ||
      parsedCV.experiences.length > 0 ||
      parsedCV.education.length > 0 ||
      parsedCV.skillsList.length > 0 ||
      parsedCV.projects.length > 0;

    if (!hasStructuredContent) {
      return res.status(422).json({
        error:
          'We could not identify any CV fields in this document. Please check that it contains your experience, education or skills, or paste your CV text.',
        code: 'no_structured_content',
        document: {
          format: extraction.format,
          pageCount: extraction.pageCount,
          layout: extraction.layout,
          characterCount: extraction.characterCount,
          wordCount: extraction.wordCount,
        },
      });
    }

    // Canonicalize and deduplicate extracted skills against the shared catalogue
    parsedCV.skillsList = Array.from(
      new Set(
        parsedCV.skillsList
          .map((skill) => canonicalizeSkill(skill))
          .filter(Boolean)
      )
    );

    // Run ATS diagnostic.
    //
    // The evaluation itself lives in server/cv/atsAnalysis.ts because the
    // background task runs the same code.
    let atsAnalysis: any = null;
    // The ATS pass draws its own unit from the daily budget. When the
    // allowance is spent, the provider is unavailable or the provider returns
    // an invalid payload, the upload still succeeds but NO score is invented.
    // The version is stored with atsAnalysis = null and CV Studio offers a
    // real retry through /api/optimize-cv.
    const atsBudget = tryConsumeAiBudget(req.authUser!.id);
    if (process.env.GEMINI_API_KEY && atsBudget) {
      const outcome = await runAtsAnalysis({
        parsedCv: parsedCV,
        targetRoleTitle,
        ai,
        model: getGeminiModel(),
      });
      atsAnalysis = outcome.analysis;
      if (!atsAnalysis) {
        console.warn('ATS analysis unavailable:', outcome.reason);
        if (isQuotaError(outcome.error)) refundDailyAiBudget(req.authUser!.id);
      }
    }

    // Persist the original file, then the CV row and its first version.
    const userId = req.authUser!.id;
    let storedFile: { path: string; size: number; fileName: string } | null = null;
    if (req.file) {
      const mimeType = req.file.mimetype.split(';')[0].trim().toLowerCase();
      let storageMime = mimeType;
      if (req.file.originalname.toLowerCase().endsWith('.docx') || mimeType.includes('officedocument') || mimeType.includes('zip')) {
        storageMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      }
      const ext = extensionForMimeType(storageMime);
      if (!ext) {
        return res.status(400).json({ error: CV_UPLOAD_TYPE_ERROR });
      }
      if (req.file.size > MAX_CV_FILE_BYTES) {
        return res.status(400).json({ error: 'File exceeds the maximum size' });
      }
      try {
        storedFile = await uploadCvFile(
          userId,
          req.file.originalname,
          req.file.buffer,
          storageMime
        );
      } catch (uploadErr) {
        console.warn('Storage upload note:', uploadErr);
      }
    }

    const cvName = req.file
      ? `${req.file.originalname.replace(/\.[^/.]+$/, '')} (Uploaded)`
      : 'Uploaded CV';
    const cvRow = await createCv(userId, {
      name: cvName,
      targetRoleTitle: req.body.targetRoleTitle || undefined,
      storagePath: storedFile?.path,
    });
    // The upload does not take over as the candidate's CV. A file that
    // arrives is a file they may want to look at; making it the active CV
    // would replace the one they already have without them asking. The
    // reviewed import is where a document becomes the candidate's CV, and it
    // says so in the response which CV it used.
    const version = await createCvVersion(userId, {
      cvId: cvRow.id,
      name: cvName,
      targetRoleTitle: req.body.targetRoleTitle || undefined,
      profileJson: parsedCV,
      atsAnalysis,
    });
    // The CV was just created for this user, so the ownership check inside
    // createCvVersion must pass. If it does not, the CV and its file are
    // left behind without a version — the request fails instead of
    // returning a half-built upload.
    if (!version) {
      throw new Error('CV version could not be created for the uploaded CV');
    }

    return res.json({
      success: true,
      cv: parsedCV,
      extraction: extractionMetadata,
      extractionQuality: qualityAssessment.quality,
      atsAnalysis,
      analysisAvailable: atsAnalysis !== null,
      cvId: cvRow.id,
      cvVersionId: version.id,
      fileStored: !!storedFile,
      fileName: storedFile?.fileName ?? null,
      message: atsAnalysis
        ? 'CV uploaded and analyzed successfully'
        : 'CV uploaded successfully. ATS analysis is temporarily unavailable; you can retry it from CV Studio.',
    });
  } catch (error: any) {
    console.error('CV Upload Error:', error);
    // The detail is logged server-side, never returned: an upstream message
    // can carry internal paths, provider payloads or stack frames.
    return res.status(500).json({
      error: 'Failed to process and analyze CV upload',
    });
  }
});

// ============================================================
// The extraction review.
//
// The upload route above imports a CV: it reads the document, writes the
// candidate's records and stores a version. The routes below are the other
// order, and they exist because the first one made the candidate a spectator
// of a decision that had already been made.
//
//   extract  — reads the document and writes NOTHING. It returns every
//              value it found, where it found it, how sure it is, and what
//              is wrong with it.
//   section  — reads ONE section again, for a candidate who does not like
//              how the first reading came out.
//   import   — writes the document the candidate has reviewed and accepted.
//
// The three are separate on purpose: the review is a pure function of the
// document, so it can be produced, discarded and produced again without
// touching the account.
// ============================================================

/** Reads the document out of a request, whether it was uploaded or pasted. */
async function readCvDocument(
  req: Request
): Promise<{ extraction: DocumentExtraction; fileName?: string } | { error: string; code: string }> {
  if (req.file) {
    const originalName = req.file.originalname.toLowerCase();
    const mimeType = req.file.mimetype.split(';')[0].trim().toLowerCase();
    const dot = originalName.lastIndexOf('.');
    const extension = dot > -1 ? originalName.slice(dot) : '';

    const allowedMimeTypes = CV_UPLOAD_TYPES[extension];
    if (!allowedMimeTypes || !allowedMimeTypes.includes(mimeType)) {
      return { error: CV_UPLOAD_TYPE_ERROR, code: 'unsupported_type' };
    }

    const extraction = await extractDocument(
      req.file.buffer,
      extension.slice(1) as DocumentFormat
    );
    return { extraction, fileName: req.file.originalname };
  }

  const pastedText = str(req.body?.text, 200_000);
  if (!pastedText) {
    return { error: 'No CV file or text provided', code: 'no_document' };
  }
  return { extraction: extractTextDocument(pastedText) };
}

/**
 * Reads a document and builds its review, without writing anything.
 */
app.post('/api/cv/extract', requireAuth, aiRateLimit, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const read = await readCvDocument(req);
    if ('error' in read) {
      return res.status(400).json({ error: read.error, code: read.code });
    }

    const quality = assessDocumentQuality(read.extraction);
    if (!quality.isAcceptable) {
      return res.status(400).json({
        error:
          quality.errorMessage ||
          'Unable to extract sufficient readable text from the document.',
        code: quality.isScannedPdf ? 'scanned_pdf' : 'unreadable_document',
        isScannedPdf: quality.isScannedPdf,
      });
    }

    const parsed = parseStructuredCv(read.extraction);
    const review = buildExtractionReview(read.extraction, parsed, {
      fileName: read.fileName,
    });

    // The document comes back as well as the review. The review is what the
    // candidate corrects; the document is what a caller that only wants to
    // look at the CV needs. Both are readings: nothing has been written, and
    // the candidate's own CV has not been touched.
    return res.json({
      success: true,
      review,
      document: parsedCvToProfile(parsed.cv),
      extractionQuality: quality.quality,
    });
  } catch (error) {
    console.error('[cv/extract] failed', error);
    return res.status(500).json({
      error: 'The CV could not be read right now.',
      code: 'extraction_failed',
    });
  }
});

/**
 * Reads one section of a document again.
 *
 * The reader is deterministic, so the same document gives the same reading.
 * What this route adds is the section on its own, with its evidence and its
 * issues, so a candidate who is unhappy with one section can look at that
 * section without scrolling past the rest of the document.
 */
app.post('/api/cv/extract/section', requireAuth, aiRateLimit, async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const section = str(body.section, 40);
    if (!section) {
      return res.status(400).json({ error: 'A section is required', code: 'no_section' });
    }

    const text = str(body.text, 200_000);
    if (!text) {
      return res.status(400).json({
        error: 'The document text is required to read a section again.',
        code: 'no_document',
      });
    }

    const extraction = extractTextDocument(text);
    const quality = assessDocumentQuality(extraction);
    if (!quality.isAcceptable) {
      return res.status(400).json({
        error: quality.errorMessage || 'The document text could not be read.',
        code: 'unreadable_document',
      });
    }

    const parsed = parseStructuredCv(extraction);
    const review = buildExtractionReview(extraction, parsed);
    const found = review.sections.find((entry) => entry.key === section);
    if (!found) {
      return res.status(404).json({
        error: 'That section is not one this CV is read into.',
        code: 'unknown_section',
      });
    }

    const issues = review.validation.filter((issue) =>
      issue.path.startsWith(`${section}[`) || issue.path.startsWith(`${section}.`)
    );

    return res.json({ success: true, section: found, issues, summary: review.summary });
  } catch (error) {
    console.error('[cv/extract/section] failed', error);
    return res.status(500).json({
      error: 'That section could not be read again right now.',
      code: 'extraction_failed',
    });
  }
});

/**
 * Writes the reviewed document into the candidate's records.
 *
 * The write is idempotent: every record is matched on its natural key, so
 * sending the same review twice writes once. Nothing the candidate already
 * has is overwritten.
 */
app.post('/api/cv/import/reviewed', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const cv = body.cv as CVProfile | undefined;
    if (!cv || typeof cv !== 'object') {
      return res.status(400).json({ error: 'A reviewed CV is required', code: 'no_cv' });
    }

    const selected =
      body.selectedSections && typeof body.selectedSections === 'object'
        ? (body.selectedSections as Record<string, boolean>)
        : undefined;

    const result = await applyReviewedImport(req.authUser!.id, cv, selected);

    // The document itself is saved as a version.
    //
    // Some of what a CV carries — an internship, an award, a publication —
    // has no record of its own in the platform, so the version is the only
    // place it can live. Saving it here is what makes the reviewed document
    // survive a refresh, and it is what the analysis is measured against
    // straight afterwards.
    const targetRoleTitle = str(body.targetRoleTitle, 200) ?? undefined;
    const versionName = str(body.versionName, 120) ?? 'Reviewed CV';

    let cvId: string | undefined;
    try {
      const existing = await listCvs(req.authUser!.id);
      const active = existing.find((entry) => entry.isActive) ?? existing[0];
      if (active) {
        cvId = active.id;
      } else {
        const created = await createCv(req.authUser!.id, {
          name: versionName,
          targetRoleTitle,
        });
        cvId = created.id;
      }
      await setActiveCv(req.authUser!.id, cvId);
      const version = await createCvVersion(req.authUser!.id, {
        cvId,
        name: versionName,
        targetRoleTitle,
        profileJson: cv,
      });
      return res.status(result.failed > 0 ? 207 : 200).json({
        ...result,
        cvId,
        cvVersionId: version?.id ?? null,
      });
    } catch (versionError) {
      // The records were written; only the snapshot of the document failed.
      // The candidate is told what happened rather than being shown a
      // failure for work that was done.
      console.error('[cv/import/reviewed] version not saved', versionError);
      return res.status(result.failed > 0 ? 207 : 200).json({
        ...result,
        cvId: cvId ?? null,
        cvVersionId: null,
        versionSaved: false,
      });
    }
  } catch (error) {
    console.error('[cv/import/reviewed] failed', error);
    return res.status(500).json({
      error: 'The reviewed CV could not be saved right now.',
      code: 'import_failed',
    });
  }
});

/**
 * Sensitive account operations (password, email, deletion) verify the current
 * password or destroy the account. They are rate-limited per verified user so
 * a stolen session cannot brute-force the password or hammer the endpoint.
 */
const accountRateLimit = rateLimit(10, 60_000, 'account');

// AI Copilot with Contextual Page Understanding & Action Proposals
app.post('/api/copilot', requireAuth, (req: Request, res: Response, next) => {
  const userPrompt = str(req.body?.userPrompt, 2000);
  if (!userPrompt) {
    return res.status(400).json({ error: 'userPrompt is required' });
  }
  next();
}, aiRateLimit, requireEntitlement('ai_mentor.session'), requireCredits('career_consultation_chat'), async (req: Request, res: Response) => {
  try {
    // The prompt is validated before anything else: it must be a string, and
    // it must be short enough that one request cannot cost an unbounded
    // number of tokens.
    const userPrompt = str(req.body?.userPrompt, 2000);
    if (!userPrompt) {
      return res.status(400).json({ error: 'userPrompt is required' });
    }

    // The career context is read from the DATABASE for the verified user, not
    // taken from the request body. The browser used to send the whole context,
    // which meant the assistant was reasoning about unverified client data
    // and had no roadmap, learning or experience to work from.
    // The response language is an explicit choice, not something inferred
    // from the prompt. It is passed into the context loader so the same
    // instruction appears in every prompt built on this block.
    const language = normalizeAiLanguage(req.body?.language);
    const careerContext = await loadAiCareerContext(req.authUser!.id, { language });
    const contextBlock = buildAiContextBlock(careerContext);

    // The active view is a UI hint, not a career fact, so it is still taken
    // from the client — but it is length-capped and string-typed.
    const activeView = str(req.body?.context?.activeView, 40) ?? 'dashboard';

    // No model on this server means no result can be produced. This is
    // checked before the daily budget is touched, so a missing key is never
    // reported as an exhausted quota.
    if (!isAnyAiConfigured()) {
      return modelUnavailable(res);
    }

    const systemInstruction = `You are CareerDev4AI Copilot, an AI career advisor that works across every career domain — technology, engineering, data, design, product, business, operations, finance, marketing, sales, people and HR, healthcare, education, and legal.
You are given the user's real career state below, read from their CareerDev4AI account.
The user is currently looking at the "${activeView}" screen of the app.

${contextBlock}

Answering rules:
1. Answer the user's actual question first, in one or two sentences. Then add only the detail that helps them act.
2. Match the answer length to the question. A simple question gets a short answer; a plan request can use a numbered sequence.
3. Write in the response language specified in the career state block. Keep industry-standard technical names (SQL, React, CV, ATS) in English. Never mix languages without a reason.
4. Do not use markdown headers (#), bold asterisks (**), horizontal rules (---), tables, or nested bullets. The interface renders plain text with simple lists only.
5. Use a short list only when listing steps or options. At most one level of bullets.
6. When you recommend a learning resource, name it, say why it fits this user, and give the direct link if the state below contains one. Never invent a URL.
7. Ground every claim in the state above. If the information needed is missing, say exactly what is missing instead of guessing.
8. Never assume the user is in a technical role. Use their real target role and domain.
9. End with at most two short follow-up questions or actions, and only when they are genuinely useful.`;

    // Arabic prompts get Arabic suggestions; an English prompt gets English
    // ones. The suggestions are navigational prompts, not answers.
    const promptIsArabic = /[\u0600-\u06FF]/.test(userPrompt);
    const suggestions = promptIsArabic
      ? [
          'ما الخطوة التالية في خطتي؟',
          'اقترح مشروعًا يقوّي مهاراتي',
          'راجع نقاط الضعف في سيرتي الذاتية',
        ]
      : [
          'What should I prioritize today?',
          'Suggest a project that closes my biggest gap',
          'Review the weak points in my CV',
        ];

    const blocked = consumeAiBudget(res, req.authUser!.id);
    if (blocked) return blocked;

    try {
      const response = await ai.models.generateContent({
        model: getGeminiModel(),
        contents: userPrompt,
        config: {
          systemInstruction,
          temperature: 0.7,
        },
      });

      const replyText = response.text?.trim();
      if (!replyText) {
        // An empty model response is still not an answer. Do not replace it
        // with a sentence that reads as if the model had replied.
        return res.status(503).json({
          error:
            'The AI assistant returned an empty response. Your message was not answered; please try again shortly.',
        });
      }

      // Intelligent proposed action if user asks to add or change something.
      // The match uses word boundaries: a plain substring check matched
      // "add" inside "already" and "test" inside "contest".
      let proposedAction = undefined;
      const lower = userPrompt.toLowerCase();
      const asksToAdd = /\b(add|create|track|plan|schedule|set up|set-up|start)\b/.test(lower);
      if (asksToAdd) {
        const focusSkill = careerContext.skillGaps[0]?.name ?? null;
        proposedAction = {
          id: `prop-${Date.now()}`,
          title: focusSkill
            ? `Focus on ${focusSkill}`
            : `Strengthen your ${careerContext.targetRoleTitle ?? 'target role'} profile`,
          description: focusSkill
            ? `Add a dedicated milestone to close your primary gap in ${focusSkill} for ${careerContext.targetRoleTitle ?? 'your target role'}.`
            : `Add a dedicated milestone for the next step towards ${careerContext.targetRoleTitle ?? 'your target role'}.`,
          reason: 'Highest leverage improvement to raise your market fit score.',
          type: 'update_task',
          // The payload carries a real skill name, so a confirmed action
          // creates a skill the user actually has a gap in.
          payload: { skill: focusSkill },
          status: 'pending',
        };
      }

      return res.json({
        text: replyText,
        suggestions,
        proposedAction,
      });
    } catch (aiErr: any) {
      // Honesty rule: if the model did not answer, do NOT return canned text
      // that looks like an AI response. The caller is told the assistant is
      // unavailable and can retry; no generated content is invented.
      console.warn('Copilot AI request failed:', aiErr?.message || aiErr);

      // A provider quota error is reported as 429 with a Retry-After header
      // rather than being flattened into a generic 503, so the client can
      // tell "come back tomorrow" from "try again in a moment". The daily
      // budget is refunded, because the provider never served this request.
      return respondAiFailure(
        res,
        aiErr,
        'The AI assistant is temporarily unavailable. Your message was not answered by the model; please try again shortly.',
        req.authUser!.id
      );
    }
  } catch (error: any) {
    console.error('Copilot API error:', error);
    return res.status(500).json({ error: 'Failed to process copilot request' });
  }
});

// AI Career Analysis Endpoint
app.post('/api/analyze-career', requireAuth, aiRateLimit, requireEntitlement('ats.analysis'), requireCredits('cv_ats_analysis'), async (req: Request, res: Response) => {
  try {
    const { targetRole, careerState } = req.body;
    // The role title falls back to the user's own target role, never to a
    // hard-coded engineering role.
    const resolvedRoleTitle =
      str(targetRole?.title, 200) ??
      (await getProfileDto(req.authUser!.id).then((p) => p?.targetRole ?? null).catch(() => null)) ??
      'the target role';

    // The skills and requirements are bounded: a request cannot send an
    // arbitrarily large payload into the model's context.
    const userSkills = boundedList(req.body?.userSkills, 40, 200);
    const requiredSkills = boundedList(targetRole?.requiredSkills, 40, 200);
    const persona = str(careerState, 80) ?? 'Professional';
    const language = normalizeAiLanguage(req.body?.language);

    const prompt = `Analyze candidate for role "${resolvedRoleTitle}".
Current persona: "${persona}".
${aiLanguageInstruction(language)}
Skills: ${JSON.stringify(userSkills)}.
Required for role: ${JSON.stringify(requiredSkills)}.
Analyse the candidate for this role in this domain. Do not assume a technical or software role; judge the candidate against the requirements of the role that was given.
${groundingRules()}

Return valid JSON schema:
{
  "matchPercentage": number,
  "strengths": [{"skill": string, "note": string}],
  "criticalGaps": [{"skill": string, "current": number, "target": number, "reason": string}],
  "missingExperience": [string],
  "careerRisks": [string],
  "recommendedProjects": [string],
  "recommendedLearning": [string],
  "nextBestAction": {
    "title": string,
    "description": string,
    "reason": string,
    "actionType": "task" | "course" | "project" | "cv"
  }
}`;

    // No model on this server means no analysis can be produced. This is
    // checked before the daily budget is touched, so a missing key is never
    // reported as an exhausted quota.
    if (!isAnyAiConfigured()) {
      return modelUnavailable(res);
    }

    const blocked = consumeAiBudget(res, req.authUser!.id);
    if (blocked) return blocked;

    try {
      const response = await ai.models.generateContent({
        model: getGeminiModel(),
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });
      const payload = JSON.parse(response.text || '{}');
      const payloadErrors = validateCareerAnalysisPayload(payload);
      if (payloadErrors.length > 0) {
        console.error('Career analysis returned an invalid payload:', payloadErrors);
        return res.status(503).json({
          error:
            'Career analysis returned an invalid response. No analysis was accepted; please try again shortly.',
        });
      }
      return res.json(payload);
    } catch (e) {
      // Never fabricate a career analysis. A made-up match percentage and
      // invented skill gaps would be indistinguishable from a real result.
      return respondAiFailure(
        res,
        e,
        'Career analysis is temporarily unavailable. No analysis was generated; please try again shortly.',
        req.authUser!.id
      );
    }
  } catch (error) {
    return res.status(500).json({ error: 'Failed to run career analysis' });
  }
});

// AI CV ATS & Content Optimization Endpoint
app.post('/api/optimize-cv', requireAuth, aiRateLimit, requireEntitlement('cv.tailoring'), requireCredits('cv_tailoring'), async (req: Request, res: Response) => {
  try {
    const { cvText, targetRoleTitle, targetRoleSkills } = req.body;
    const language = normalizeAiLanguage(req.body?.language);
    const prompt = `Evaluate CV for role "${targetRoleTitle}". Required: ${JSON.stringify(targetRoleSkills || [])}.
${aiLanguageInstruction(language)}
CV: ${cvText}
${groundingRules()}
Return JSON schema:
{
  "overallScore": number (integer 0-100),
  "breakdown": { "keywordsMatch": number (integer 0-100), "impactAndMetrics": number (integer 0-100), "formattingStructure": number (integer 0-100), "experienceRelevance": number (integer 0-100) },
  "matchedKeywords": [string],
  "missingKeywords": [string],
  "actionableImprovements": [{ "section": string, "currentText": string, "suggestedText": string, "reason": string }]
}`;

    // No model on this server means no analysis can be produced. This is
    // checked before the daily budget is touched, so a missing key is never
    // reported as an exhausted quota.
    if (!isAnyAiConfigured()) {
      return modelUnavailable(res);
    }

    const blocked = consumeAiBudget(res, req.authUser!.id);
    if (blocked) return blocked;

    try {
      const response = await ai.models.generateContent({
        model: getGeminiModel(),
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });
      const payload = JSON.parse(response.text || '{}');
      const payloadErrors = validateAtsPayload(payload);
      if (payloadErrors.length > 0) {
        console.error('CV optimization returned an invalid payload:', payloadErrors);
        return res.status(503).json({
          error:
            'CV analysis returned an invalid response. No ATS analysis was accepted; please try again shortly.',
        });
      }

      // The model may only suggest rewrites of what the candidate already
      // has. Any suggestion that introduces a company, a metric or a link
      // that is not in their record is removed rather than shown, and the
      // user is told that it happened.
      const grounding = await buildGroundingProfileForUser(req.authUser!.id);
      const removed: string[] = [];
      for (const improvement of payload.actionableImprovements ?? []) {
        if (typeof improvement?.suggestedText !== 'string') continue;
        const result = stripUngroundedSentences(improvement.suggestedText, grounding);
        if (result.removed.length > 0) {
          removed.push(...result.removed.map((claim) => claim.claim));
          improvement.suggestedText = result.text;
        }
      }
      if (removed.length > 0) {
        payload.groundingNotes = {
          removedSuggestions: removed,
          message:
            'Some suggested wording mentioned details that are not in your profile and was removed. Add the detail to your profile first if you want it suggested.',
        };
      }

      return res.json(payload);
    } catch (e) {
      // An invented ATS score and invented "improvements" would be actively
      // harmful: the user could rewrite a CV around a fabricated diagnosis.
      return respondAiFailure(
        res,
        e,
        'CV analysis is temporarily unavailable. No ATS analysis was generated; please try again shortly.',
        req.authUser!.id
      );
    }
  } catch (error) {
    return res.status(500).json({ error: 'Failed to optimize CV' });
  }
});

// AI Mock Interview Evaluation Endpoint
app.post('/api/mock-interview', requireAuth, aiRateLimit, requireEntitlement('interview.mock_simulation'), requireCredits('interview_mock_session'), async (req: Request, res: Response) => {
  try {
    const { roleTitle, interviewType, question, userAnswer } = req.body;
    // Every field that reaches the model is length-capped: a single request
    // must not be able to push an unbounded payload into the context.
    const safeRoleTitle = str(roleTitle, 200) ?? 'the target role';
    const safeType = str(interviewType, 40) ?? 'general';
    const safeQuestion = str(question, 1000) ?? '';
    const safeAnswer = str(userAnswer, 8000) ?? '';
    if (!safeQuestion || !safeAnswer) {
      return res.status(400).json({ error: 'A question and an answer are required' });
    }
    const language = normalizeAiLanguage(req.body?.language);
    const prompt = `Evaluate interview answer for "${safeRoleTitle}". Type: ${safeType}.
${aiLanguageInstruction(language)}
Question: "${safeQuestion}"
Answer: "${safeAnswer}"
${groundingRules()}
Return JSON schema:
{
  "score": number,
  "strengths": [string],
  "improvements": [string],
  "starEvaluation": { "situation": string, "task": string, "action": string, "result": string },
  "suggestedAnswer": string
}`;

    // No model on this server means no evaluation can be produced. This is
    // checked before the daily budget is touched, so a missing key is never
    // reported as an exhausted quota.
    if (!isAnyAiConfigured()) {
      return modelUnavailable(res);
    }

    const blocked = consumeAiBudget(res, req.authUser!.id);
    if (blocked) return blocked;

    try {
      const response = await ai.models.generateContent({
        model: getGeminiModel(),
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });
      const payload = JSON.parse(response.text || '{}');
      const payloadErrors = validateInterviewPayload(payload);
      if (payloadErrors.length > 0) {
        console.error('Interview evaluation returned an invalid payload:', payloadErrors);
        return res.status(503).json({
          error:
            'Interview evaluation returned an invalid response. No feedback was accepted; please try again shortly.',
        });
      }
      return res.json(payload);
    } catch (e) {
      // A fabricated score and a fabricated "model answer" would teach the
      // candidate nothing and could be mistaken for feedback on their answer.
      return respondAiFailure(
        res,
        e,
        'Interview evaluation is temporarily unavailable. No feedback was generated; please try again shortly.',
        req.authUser!.id
      );
    }
  } catch (error) {
    return res.status(500).json({ error: 'Failed to evaluate interview response' });
  }
});
// AI Professional Summary Suggestion
app.post('/api/suggest-summary', requireAuth, aiRateLimit, requireEntitlement('cv.builder'), requireCredits('ai_assist_inline'), async (req: Request, res: Response) => {
  try {
    const { name, targetRoleTitle, careerState, yearsExperience, skills, keyAchievements } = req.body;
    // No hard-coded role: the summary is written for whatever role the user
    // is actually targeting.
    const summaryRoleTitle =
      str(targetRoleTitle, 200) ??
      (await getProfileDto(req.authUser!.id).then((p) => p?.targetRole ?? null).catch(() => null)) ??
      'their target role';
    const safeName = str(name, 200) ?? 'Professional';
    const safeCareerState = str(careerState, 80) ?? 'Professional';
    const safeYears = str(yearsExperience, 40) ?? '3+';
    const safeSkills = boundedList(skills, 40, 120)
      .filter((entry): entry is string => typeof entry === 'string')
      .join(', ') || 'the skills relevant to the target role';
    const safeAchievements = boundedList(keyAchievements, 20, 300)
      .filter((entry): entry is string => typeof entry === 'string')
      .join('; ') || 'High performance, collaborative delivery';
    const language = normalizeAiLanguage(req.body?.language);
    const prompt = `Write a high-impact, professional, authentic 3-4 sentence professional summary for a resume/profile.
Person: ${safeName}
${aiLanguageInstruction(language)}
Target Role: ${summaryRoleTitle}
Career State: ${safeCareerState}
Years of Experience: ${safeYears}
Core Skills: ${safeSkills}
Key Achievements: ${safeAchievements}

Requirements:
- First-person or punchy executive third-person tone.
- Emphasize business impact and mastery of the skills the role actually requires.
${groundingRules()}
- Return JSON: { "suggestedSummary": string }`;

    // No model on this server means no summary can be produced. This is
    // checked before the daily budget is touched, so a missing key is never
    // reported as an exhausted quota.
    if (!isAnyAiConfigured()) {
      return modelUnavailable(res);
    }

    const blocked = consumeAiBudget(res, req.authUser!.id);
    if (blocked) return blocked;

    try {
      const response = await ai.models.generateContent({
        model: getGeminiModel(),
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });
      const payload = JSON.parse(response.text || '{}');
      const payloadErrors = validateSummaryPayload(payload);
      if (payloadErrors.length > 0) {
        console.error('Summary suggestion returned an invalid payload:', payloadErrors);
        return res.status(503).json({
          error:
            'Summary generation returned an invalid response. No summary was accepted; please try again shortly.',
        });
      }

      // A summary is the one part of a CV a hiring manager reads first, so a
      // fabricated employer or metric here is the most damaging kind of
      // invention. The sentence is removed rather than shown.
      if (typeof payload.suggestedSummary === 'string') {
        const grounding = await buildGroundingProfileForUser(req.authUser!.id);
        const result = stripUngroundedSentences(payload.suggestedSummary, grounding);
        if (result.removed.length > 0) {
          payload.suggestedSummary = result.text;
          payload.groundingNotes = {
            removedSuggestions: result.removed.map((claim) => claim.claim),
            message:
              'Part of the summary mentioned details that are not in your profile and was removed. Add the detail to your profile first if you want it used.',
          };
        }
      }
      return res.json(payload);
    } catch (e) {
      // Do not return a generic paragraph as if the model had written it for
      // this candidate. The caller must know that no suggestion was produced.
      return respondAiFailure(
        res,
        e,
        'Summary generation is temporarily unavailable. No suggestion was generated; please try again shortly.',
        req.authUser!.id
      );
    }
  } catch (error) {
    return res.status(500).json({ error: 'Failed to generate summary suggestion' });
  }
});

// AI Cover Letter Generation Endpoint
app.post('/api/generate-cover-letter', requireAuth, aiRateLimit, requireEntitlement('cover_letter.generate'), requireCredits('cover_letter_generation'), async (req: Request, res: Response) => {
  try {
    const { company, jobTitle, jobDescription, candidateName, experiences, skills, projects, tone } = req.body;
    const language = normalizeAiLanguage(req.body?.language);

    // No model on this server means no cover letter can be produced. This is
    // checked before the daily budget is touched, so a missing key is never
    // reported as an exhausted quota.
    if (!isAnyAiConfigured()) {
      return modelUnavailable(res);
    }

    const blocked = consumeAiBudget(res, req.authUser!.id);
    if (blocked) return blocked;

    try {
      // The letter is written by the shared module, which is also what the
      // background task uses. One implementation means the letter the button
      // produces and the letter the task produces are the same letter.
      const result = await generateCoverLetter({
        userId: req.authUser!.id,
        candidate: {
          company,
          jobTitle,
          jobDescription,
          candidateName,
          experiences,
          skills,
          projects,
          tone,
          language,
        },
        ai,
        model: getGeminiModel(),
      });

      if (!result.ok) {
        if (result.reason === 'invalid_response') {
          return res.status(503).json({
            error:
              'Cover letter generation returned an invalid response. No cover letter was accepted; please try again shortly.',
          });
        }
        return respondAiFailure(
          res,
          new Error('The model did not produce a cover letter.'),
          'Cover letter generation is temporarily unavailable. No cover letter was generated; please try again shortly.',
          req.authUser!.id
        );
      }

      return res.json({
        coverLetter: result.coverLetter,
        keyHighlights: result.keyHighlights,
        ...(result.groundingNotes ? { groundingNotes: result.groundingNotes } : {}),
      });
    } catch (e) {
      // A cover letter full of claims the candidate never supplied is the most
      // dangerous fallback in the product: it could be sent to an employer.
      return respondAiFailure(
        res,
        e,
        'Cover letter generation is temporarily unavailable. No cover letter was generated; please try again shortly.',
        req.authUser!.id
      );
    }
  } catch (error) {
    return res.status(500).json({ error: 'Failed to generate cover letter' });
  }
});

// The measured analysis of the candidate's CV.
//
// This route measures the document; it does not describe it. Nothing here
// calls a model, so the analysis is the same every time, it costs no quota,
// and it is available whether or not a provider is configured. The AI routes
// beside it keep their own contract: they return the model's answer or an
// explicit failure, and they never answer with something of their own.
//
// The session is required; the legal acceptance is not. The measurement is
// counted on the platform from the candidate's own document, so nothing is sent
// to a third party and nothing of theirs is used on their behalf.
app.post('/api/cv/analysis', requireSession, async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const request = await resolveAnalysisRequest(req.authUser!.id, body);

    if (!request.document) {
      if (request.problem === 'unknown_version') {
        return res.status(404).json({
          error: 'That CV version was not found.',
          code: 'unknown_version',
        });
      }
      return res.status(400).json({
        error: 'A CV is required before it can be measured.',
        code: 'document_required',
      });
    }

    const measured = await measureAndRecord(req.authUser!.id, {
      cv: request.document,
      cvId: request.cvId,
      cvVersionId: request.cvVersionId,
      targetRoleTitle: request.targetRoleTitle,
      targetRoleSkills: request.targetRoleSkills,
      jobDescription: request.jobDescription ?? undefined,
    });

    if (!measured) {
      return res.status(422).json({
        error: 'This CV could not be read, so there is nothing to measure yet.',
        code: 'document_unreadable',
      });
    }

    return res.json({
      success: true,
      analysis: measured.report,
      // The stored shape, so a caller that already knows how to read a score
      // can read this one without learning anything new.
      atsAnalysis: toStoredAnalysis(measured.report),
      // The record of this run, when it was about a stored CV. A re-analysis
      // is a new record; it never replaces the earlier one.
      measurementId: measured.measurementId,
    });
  } catch (error) {
    console.error('[cv/analysis] failed', error);
    return res.status(500).json({
      error: 'The CV could not be measured right now.',
      code: 'analysis_failed',
    });
  }
});

// The same measurement, with the stages as they happen.
//
// The stages are not decoration: each one is reported after the work it names
// has actually been done, so the list the candidate watches is the list the
// measurement really went through. The stream carries the same result the
// plain route returns — the two read the same document and run the same
// measurement.
app.post('/api/cv/analysis/stream', requireSession, async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const request = await resolveAnalysisRequest(req.authUser!.id, body);

    if (!request.document) {
      res.status(request.problem === 'unknown_version' ? 404 : 400);
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          error:
            request.problem === 'unknown_version'
              ? 'That CV version was not found.'
              : 'A CV is required before it can be measured.',
          code: request.problem ?? 'document_required',
        })
      );
      return;
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-transform');
    res.setHeader('Connection', 'keep-alive');
    // Ask any proxy in front of the application not to buffer the stream.
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const report = await measureCvWithStages(
      {
        cv: request.document,
        targetRoleTitle: request.targetRoleTitle,
        targetRoleSkills: request.targetRoleSkills,
        jobDescription: request.jobDescription ?? undefined,
      },
      (stage) => {
        send('stage', stage);
      }
    );

    if (!report) {
      send('error', {
        code: 'document_unreadable',
        error: 'This CV could not be read, so there is nothing to measure yet.',
      });
      res.end();
      return;
    }

    const measurementId = await recordMeasurement(req.authUser!.id, {
      cvId: request.cvId,
      cvVersionId: request.cvVersionId,
      targetRoleTitle: request.targetRoleTitle,
      jobDescription: request.jobDescription,
      report,
    });

    send('complete', {
      analysis: report,
      atsAnalysis: toStoredAnalysis(report),
      measurementId,
    });
    res.end();
  } catch (error) {
    console.error('[cv/analysis/stream] failed', error);
    if (res.headersSent) {
      // The stream is already open, so the failure is reported inside it
      // rather than as a status code.
      send('error', {
        code: 'analysis_failed',
        error: 'The CV could not be measured right now.',
      });
      res.end();
      return;
    }
    res.status(500).json({
      error: 'The CV could not be measured right now.',
      code: 'analysis_failed',
    });
  }
});

// The history of the measured analyses: the newest first, and never replacing
// an earlier run.
app.get('/api/cv/analyses', requireSession, async (req: Request, res: Response) => {
  try {
    const cvId = typeof req.query.cvId === 'string' ? req.query.cvId : undefined;
    const measurements = await listCvMeasurements(req.authUser!.id, {
      cvId: cvId && isUuid(cvId) ? cvId : undefined,
    });
    return res.json({ success: true, measurements });
  } catch (error) {
    console.error('[cv/analyses] failed', error);
    return res.status(500).json({
      error: 'The analysis history could not be read right now.',
      code: 'history_failed',
    });
  }
});

// AI-assisted writing for one CV field.
//
// The model writes from the candidate's own record: the record is read from
// the database for the verified user id, and the answer is checked back
// against it before it is returned. The client cannot talk the model into a
// career the candidate does not have.
app.post('/api/cv/ai-assist', requireAuth, aiRateLimit, requireEntitlement('cv.builder'), (req: Request, res: Response, next) => {
  const body = req.body ?? {};
  if (!isCvAssistField(body.field)) {
    return res.status(400).json({ error: 'A valid CV field is required' });
  }
  if (body.ai === false) {
    return next();
  }
  return requireCredits('ai_assist_inline')(req as any, res, next);
}, async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const field = body.field;
    if (!isCvAssistField(field)) {
      return res.status(400).json({ error: 'A valid CV field is required' });
    }

    const sourceKind = isCvAssistSourceKind(body.sourceKind) ? body.sourceKind : undefined;
    const sourceId = str(body.sourceId, 64) ?? undefined;

    // Headline suggestions are their own mode. They are deterministic first,
    // and the model only adds options on top. That is why this branch runs
    // before the "no model configured" check: a candidate without an AI key
    // still gets usable headlines.
    if (field === 'headline' && body.suggestions === true) {
      const request = {
        targetRoleTitle: str(body.targetRoleTitle, 200) ?? undefined,
        additionalTargetRoles: boundedList(body.additionalTargetRoles, 5, 120)
          .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0),
        language: normalizeAiLanguage(body.language),
      };

      const wantsAi = body.ai !== false && isAnyAiConfigured();
      if (!wantsAi) {
        const outcome = await generateCvHeadlineSuggestions(
          req.authUser!.id,
          request,
          null,
          null
        );
        return res.json({ success: true, ...outcome });
      }

      // The model is optional here. When the daily allowance is spent the
      // deterministic options are still returned, so the studio never shows
      // a quota error where a useful answer exists.
      if (!tryConsumeAiBudget(req.authUser!.id)) {
        const outcome = await generateCvHeadlineSuggestions(
          req.authUser!.id,
          request,
          null,
          null
        );
        return res.json({
          success: true,
          ...outcome,
          fallbackReason:
            "The AI assistant has reached today's usage limit, so locally generated headline options are shown.",
        });
      }

      const outcome = await generateCvHeadlineSuggestions(
        req.authUser!.id,
        request,
        ai,
        getGeminiModel()
      );
      return res.json({ success: true, ...outcome });
    }

    // No model on this server means no text can be produced. This is checked
    // before the daily budget is touched, so a missing key is never reported
    // as an exhausted quota.
    if (!isAnyAiConfigured()) {
      return modelUnavailable(res);
    }

    const request: CvAssistRequest = {
      field,
      action: isCvAssistAction(body.action) ? body.action : undefined,
      sourceKind,
      sourceId,
      context: str(body.context, 1200) ?? undefined,
      existingText: str(body.existingText, 4000) ?? undefined,
      targetRoleTitle: str(body.targetRoleTitle, 200) ?? undefined,
      tone: isCvAssistTone(body.tone) ? body.tone : undefined,
      length: isCvAssistLength(body.length) ? body.length : undefined,
      language: normalizeAiLanguage(body.language),
      attempt: typeof body.attempt === 'number' && Number.isFinite(body.attempt)
        ? Math.max(0, Math.min(20, Math.floor(body.attempt)))
        : 0,
    };

    const blocked = consumeAiBudget(res, req.authUser!.id);
    if (blocked) return blocked;

    try {
      const outcome = await generateCvAssistText(
        req.authUser!.id,
        request,
        ai,
        getGeminiModel()
      );

      if (!outcome.ok) {
        if (outcome.reason === 'source_not_found') {
          return res.status(404).json({
            error:
              'That item could not be found in your records, so nothing was written. Reload the page and try again.',
          });
        }
        return res.status(503).json({
          error:
            'The AI assistant returned an invalid response. Nothing was written; please try again shortly.',
        });
      }

      return res.json({
        success: true,
        text: outcome.result.text,
        bullets: outcome.result.bullets,
        removedClaims: outcome.result.removedClaims,
        groundingNote: outcome.result.groundingNote,
      });
    } catch (error) {
      // Never substitute invented text for a failed model call. The candidate
      // is told that nothing was written.
      return respondAiFailure(
        res,
        error,
        'AI assistance is temporarily unavailable. Nothing was written; please try again shortly.',
        req.authUser!.id
      );
    }
  } catch (error) {
    console.error('CV assist error:', error);
    return res.status(500).json({ error: 'Failed to write this CV section' });
  }
});

// ============================================================
// The job description flow.
//
// A job description is read, compared against the candidate's own record,
// and a CV is written for it. Two rules run through all of it.
//
// The job description is the employer's text, not the candidate's. It says
// what the job needs; the candidate's records say what they have. The two
// are compared, never merged, so a requirement the candidate cannot support
// is reported as missing rather than written onto their CV.
//
// The ATS score is measured, not asserted. It is computed by the shared
// engine from the candidate's real skills and real text, so it cannot be a
// model's opinion of how well the candidate matches.
//
// The model is optional on the analysis route: without it the
// deterministic reader still produces an analysis and a score, and the CV
// studio keeps working. On the generation route the model is required,
// because there is nothing to fall back to — and when it fails, the
// candidate's document is left exactly as it was.
// ============================================================

/**
 * Reads the job description out of a request body.
 *
 * A short paste is refused: an advertisement of a few words carries no
 * requirements, and a score computed against it would be meaningless.
 */
function readJobDescription(body: unknown): { ok: true; text: string } | { ok: false } {
  const text = str((body as { jobDescription?: unknown })?.jobDescription, MAX_JOB_DESCRIPTION_CHARS);
  if (!text || text.trim().length < 20) return { ok: false };
  return { ok: true, text: text.trim() };
}

/**
 * Reads an optional job description for the project routes.
 *
 * The project routes accept the pasted description so the recommendations can
 * be aimed at it. It is analysed on the server and the analysis is checked
 * against the pasted text, so the client cannot hand the engine a
 * description of a role that was never read.
 */
async function readOptionalJobDescription(
  body: unknown,
  options: { ai: JobDescriptionAiClient | null; model: string; language: AiLanguageCode }
): Promise<JobDescriptionAnalysis | null> {
  const read = readJobDescription(body);
  if (!read.ok) return null;
  const { analysis } = await analyzeJobDescription(read.text, options);
  return analysis;
}

// Reads a job description and reports what it asks for.
app.post('/api/cv/job-description/analyze', requireAuth, aiRateLimit, requireEntitlement('job_description.analysis'), requireCredits('job_description_analysis'), async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const read = readJobDescription(body);
    if (!read.ok) {
      return res.status(400).json({
        error: 'Paste the job description to analyse. At least a full sentence is needed.',
      });
    }

    const language = normalizeAiLanguage(body.language);

    // The model's reading of the advertisement is an improvement, not a
    // requirement. When it is unavailable the deterministic reader still
    // produces an analysis and a score, so the studio keeps working.
    //
    // The allowance is only spent when there is a real call to make, so a
    // server with no model configured never burns a candidate's daily budget.
    const hasModel = isAnyAiConfigured();
    const aiBudget = hasModel ? tryConsumeAiBudget(req.authUser!.id) : false;
    const client: JobDescriptionAiClient | null = hasModel && aiBudget ? ai : null;

    const { analysis, aiUsed, fallbackReason } = await analyzeJobDescription(read.text, {
      ai: client,
      model: getGeminiModel(),
      language,
    });

    // A model that failed before it served the request did not spend the
    // allowance either.
    if (fallbackReason === 'model_error') {
      refundDailyAiBudget(req.authUser!.id);
    }

    const match = await buildJobDescriptionMatch(req.authUser!.id, analysis, { language });

    return res.json({
      success: true,
      analysis,
      match,
      aiUsed,
      aiFallbackReason: fallbackReason,
    });
  } catch (error) {
    console.error('Job description analysis error:', error);
    return res.status(500).json({ error: 'Failed to analyse the job description' });
  }
});

// Writes the CV for a job description.
//
// This route makes two model calls — one to read the advertisement and one to
// write the CV — so it costs two units of the daily allowance. The candidate's
// document is only touched by the client, after the content has been checked,
// so a failure here leaves their CV exactly as it was.
app.post('/api/cv/job-description/generate', requireAuth, aiRateLimit, requireEntitlement('cv.tailoring'), requireCredits('cv_tailoring'), async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const read = readJobDescription(body);
    if (!read.ok) {
      return res.status(400).json({
        error: 'Paste the job description to write a CV for. At least a full sentence is needed.',
      });
    }

    const language = normalizeAiLanguage(body.language);

    // The candidate's current document. It is used as the candidate's own
    // writing, so the model improves it rather than replacing it. The ids in
    // it are never trusted: the records are resolved from the database.
    const document = (body.cv ?? null) as ClientCvDocument | null;

    if (!isAnyAiConfigured()) {
      return modelUnavailable(res);
    }

    const blocked = consumeAiBudget(res, req.authUser!.id, 2);
    if (blocked) return blocked;

    try {
      const { analysis } = await analyzeJobDescription(read.text, {
        ai,
        model: getGeminiModel(),
        language,
      });
      const match = await buildJobDescriptionMatch(req.authUser!.id, analysis, { language });

      const outcome = await generateAtsCvContent({
        userId: req.authUser!.id,
        analysis,
        match,
        document,
        ai,
        model: getGeminiModel(),
        language,
      });

      if (!outcome.ok) {
        return res.status(503).json({
          error:
            'The CV for this job description could not be written. Nothing was changed; please try again shortly.',
          code: 'invalid_response',
        });
      }

      return res.json({
        success: true,
        analysis,
        match,
        cv: outcome.content,
      });
    } catch (error) {
      // Nothing is written on a failed call, so the candidate's CV is
      // untouched and the studio keeps working.
      return respondAiFailure(
        res,
        error,
        'The CV for this job description could not be written. Nothing was changed; please try again shortly.',
        req.authUser!.id
      );
    }
  } catch (error) {
    console.error('Job description CV error:', error);
    return res.status(500).json({ error: 'Failed to write the CV for this job description' });
  }
});

// Recommends the projects that would help this candidate most.
//
// The deterministic recommendation is always produced: it comes from the
// candidate's own record and the role catalogue's curated portfolio work. The
// model only rewrites the plans, and a plan it fails to produce keeps the
// deterministic one.
app.post('/api/projects/recommendations', requireAuth, aiRateLimit, requireCredits('project_analysis'), async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const language = normalizeAiLanguage(body.language);

    const limitRaw = body.limit === undefined || body.limit === null ? undefined : Number(body.limit);
    const limit =
      limitRaw === undefined || !Number.isFinite(limitRaw)
        ? undefined
        : Math.max(1, Math.min(6, Math.floor(limitRaw)));

    // Reading an optional pasted job description costs one unit, and writing
    // the plans costs another.
    const hasModel = isAnyAiConfigured();
    const hasJobDescription = readJobDescription(body).ok;
    const aiBudget = hasModel
      ? tryConsumeAiBudget(req.authUser!.id, hasJobDescription ? 2 : 1)
      : false;
    const client: JobDescriptionAiClient | null = hasModel && aiBudget ? ai : null;

    const jobDescription = await readOptionalJobDescription(body, {
      ai: client,
      model: getGeminiModel(),
      language,
    });

    const result = await recommendProjects({
      userId: req.authUser!.id,
      jobDescription,
      ai: client,
      model: getGeminiModel(),
      language,
      limit,
    });

    return res.json({
      success: true,
      plans: result.plans,
      aiUsed: result.aiUsed,
      aiFallbackReason: result.aiFallbackReason,
      context: {
        targetRoleTitle: result.context.targetRoleTitle,
        careerLevel: result.context.careerLevel,
        openSkillGaps: result.context.openSkillGaps,
        coveredSkills: result.context.coveredSkills,
        roadmapSkills: result.context.roadmapSkills,
        learningInProgress: result.context.learningInProgress,
        completedCourses: result.context.completedCourses,
        existingProjectCount: result.context.existingProjects.length,
        jobDescriptionTitle: result.context.jobDescriptionTitle,
      },
    });
  } catch (error) {
    console.error('Project recommendation error:', error);
    return res.status(500).json({ error: 'Failed to recommend projects' });
  }
});

// Checks the projects the candidate already has.
//
// The problems are read out of the records. The model only improves the
// wording of the suggestions, and it never decides that a problem exists.
app.post('/api/projects/analyze', requireAuth, aiRateLimit, requireCredits('project_analysis'), async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const language = normalizeAiLanguage(body.language);

    const hasModel = isAnyAiConfigured();
    const aiBudget = hasModel ? tryConsumeAiBudget(req.authUser!.id) : false;
    const client: JobDescriptionAiClient | null = hasModel && aiBudget ? ai : null;

    const context = await buildProjectRecommendationContext(req.authUser!.id);

    const result = await analyzeProjects({
      userId: req.authUser!.id,
      context,
      ai: client,
      model: getGeminiModel(),
      language,
    });

    return res.json({
      success: true,
      reports: result.reports,
      aiUsed: result.aiUsed,
      aiFallbackReason: result.aiFallbackReason,
    });
  } catch (error) {
    console.error('Project analysis error:', error);
    return res.status(500).json({ error: 'Failed to analyse your projects' });
  }
});

// Check username availability
app.get('/api/profile/check-username', async (req: Request, res: Response) => {
  try {
    const raw = req.query.username as string;
    if (!raw) return res.status(400).json({ error: 'Username required' });
    if (raw.length > 100) return res.status(400).json({ error: 'Username is too long' });
    const username = raw.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '').slice(0, 30);

    // Group A: PostgreSQL is the only source. Uniqueness is enforced by the
    // existing profiles_username_key unique index.
    const existing = await findProfileByUsername(username);
    const isTaken = !!existing;

    return res.json({
      username,
      available: !isTaken && username.length >= 3,
      message: isTaken
        ? 'Username is already taken'
        : username.length < 3
          ? 'Username must be at least 3 characters'
          : 'Username is available'
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to validate username' });
  }
});

// Public profile endpoint
app.get('/api/profile/public/:username', async (req: Request, res: Response) => {
  try {
    const username = req.params.username.toLowerCase();
    // Group A: PostgreSQL is the only source for the lookup.
    const profile = await findProfileByUsername(username);
    if (!profile) {
      return res.status(404).json({ error: 'Public profile not found' });
    }

    // Privacy gate. `profiles.is_public` IS a real column (boolean NOT NULL
    // DEFAULT false): it is exposed by ProfileDTO.isPublic and is writable
    // through PATCH /api/profile. A profile that has not opted in is private.
    //
    // 404 rather than 403: a 403 would confirm that the username exists,
    // which is itself a disclosure.
    if (!profile.is_public) {
      return res.status(404).json({ error: 'Public profile not found' });
    }

    const { data: experiences } = await getSupabaseServer()
      .from('experiences')
      .select('company, job_title, location, start_date, end_date, is_current')
      .eq('user_id', profile.id);
    const { data: educations } = await getSupabaseServer()
      .from('educations')
      .select('institution, degree, field_of_study, start_date, end_date, is_current')
      .eq('user_id', profile.id);
    const { data: userSkills } = await getSupabaseServer()
      .from('user_skills')
      .select('proficiency, skill:skills(name, category)')
      .eq('user_id', profile.id);
    const { data: certifications } = await getSupabaseServer()
      .from('profile_certifications')
      .select('name, issuer, issue_date, expiry_date, url')
      .eq('profile_id', profile.id);
    const { data: projects } = await getSupabaseServer()
      .from('projects')
      .select('title, description, repository_url, demo_url')
      .eq('profile_id', profile.id);
    // B.4 finding L-2: the public view hard-coded `location: null` and an
    // empty `links` map even though the profile row and the profile_links
    // table both carry them. A public profile therefore showed no location
    // and no professional links.
    const { data: publicLinks } = await getSupabaseServer()
      .from('profile_links')
      .select('kind, url')
      .eq('profile_id', profile.id);
    const linkMap: Record<string, string> = {};
    for (const link of publicLinks ?? []) {
      if (link && typeof link.kind === 'string' && typeof link.url === 'string') {
        // Defense in depth for rows written before URL validation existed.
        const safe = parseHttpUrl(link.url, 1000);
        if (safe.valid && safe.value) linkMap[link.kind] = safe.value;
      }
    }

    const safeProfile = {
      name: profile.full_name,
      preferredName: profile.full_name,
      headline: profile.target_role,
      avatarUrl:
        typeof profile.avatar_url === 'string' && /^avatar-[0-9]{2}$/.test(profile.avatar_url.trim())
          ? profile.avatar_url.trim()
          : parseHttpUrl(profile.avatar_url, 1000).value,
      location: profile.location,
      targetRole: profile.target_role,
      careerState: profile.user_type,
      experiences: (experiences ?? []).map((e: any) => ({
        company: e.company,
        role: e.job_title,
        location: e.location,
        startDate: e.start_date,
        endDate: e.end_date,
        isCurrent: e.is_current,
      })),
      education: (educations ?? []).map((e: any) => ({
        institution: e.institution,
        degree: e.degree,
        field: e.field_of_study,
        startDate: e.start_date,
        endDate: e.end_date,
        isCurrent: e.is_current,
      })),
      certifications: (certifications ?? []).map((c: any) => ({
        name: c.name,
        issuer: c.issuer ?? undefined,
        issueDate: c.issue_date ?? undefined,
        expiryDate: c.expiry_date ?? undefined,
        credentialUrl: parseHttpUrl(c.url, 1000).value,
      })),
      skills: (userSkills ?? []).map((us: any) => ({
        name: us.skill?.name,
        level: us.proficiency,
        category: us.skill?.category,
      })),
      projects: (projects ?? []).map((p: any) => ({
        title: p.title,
        description: p.description ?? undefined,
        repositoryUrl: parseHttpUrl(p.repository_url, 1000).value,
        demoUrl: parseHttpUrl(p.demo_url, 1000).value,
      })),
      links: linkMap,
    };
    return res.json({ success: true, profile: safeProfile });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to retrieve public profile' });
  }
});

// Account: Change Password
app.post('/api/account/change-password', requireAuth, accountRateLimit, async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password required' });
    }
    // The project's own minimum, enforced here as well as by Supabase Auth, so
    // a weak password is rejected with a clear reason even when the hosted
    // leaked-password protection is not available on the project's plan.
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ error: 'The new password must be at least 8 characters long' });
    }

    const result = await changePassword(req.authUser!.id, currentPassword, newPassword);
    if (!result.ok) {
      return res.status(400).json({ error: result.error || 'Failed to update password' });
    }

    return res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update password' });
  }
});

// Account: Change Email
app.post('/api/account/change-email', requireAuth, accountRateLimit, async (req: Request, res: Response) => {
  try {
    const { newEmail, currentPassword } = req.body;
    if (!newEmail || !newEmail.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!currentPassword) {
      return res.status(400).json({ error: 'Current password is required to change email' });
    }

    const result = await changeEmail(req.authUser!.id, newEmail.toLowerCase(), currentPassword);
    if (!result.ok) {
      return res.status(409).json({ error: result.error || 'Failed to update email' });
    }

    return res.json({ success: true, email: newEmail.toLowerCase(), message: 'Email updated successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update email' });
  }
});

// Account: Delete Account
app.post('/api/account/delete', requireAuth, accountRateLimit, async (req: Request, res: Response) => {
  try {
    // Target is exclusively the verified Supabase Auth user id.
    const result = await deleteAccount(req.authUser!.id);
    if (!result.ok) {
      return res.status(500).json({ error: result.error || 'Failed to delete account' });
    }

    return res.json({ success: true, message: 'Account and associated career data deleted successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete account' });
  }
});

// ============================================================
// Versioned legal consent.
//
// These two routes are the only protected endpoints reachable without a
// current acceptance (see server/auth/require-auth.ts). They are what the
// consent screen uses to discover the current versions and to record an
// acceptance. The server decides the version; a client cannot name its own.
// ============================================================

app.get('/api/consent', requireAuth, async (req: Request, res: Response) => {
  try {
    // The resolver also honours an acceptance carried in the user's metadata
    // by a registration that required email confirmation.
    const consent = await resolveConsentState(req.authUser!.id);
    return res.json({ success: true, consent });
  } catch (error) {
    console.error('Failed to read consent state:', error);
    return res.status(500).json({ error: 'Failed to load consent status' });
  }
});

app.post('/api/consent', requireAuth, async (req: Request, res: Response) => {
  try {
    const { accepted, termsVersion, privacyVersion, source } = req.body ?? {};

    if (!hasServerTermsApproval()) {
      return res.status(503).json({
        error: 'Approved Terms content is not available. Consent cannot be recorded yet.',
        code: 'LEGAL_CONTENT_UNAVAILABLE',
      });
    }

    if (accepted !== true) {
      return res.status(400).json({
        error: 'You must accept the Terms & Conditions and Privacy Policy to continue',
        code: 'CONSENT_NOT_ACCEPTED',
      });
    }

    if (termsVersion !== TERMS_VERSION || privacyVersion !== PRIVACY_VERSION) {
      return res.status(409).json({
        error: 'The Terms & Conditions or Privacy Policy changed. Please review and accept the current versions.',
        code: 'CONSENT_VERSION_MISMATCH',
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
      });
    }

    const allowedSources = new Set(['registration', 'reconsent', 'settings']);
    await recordConsent(req.authUser!.id, {
      source: allowedSources.has(source) ? source : 'reconsent',
    });

    const consent = await resolveConsentState(req.authUser!.id);
    return res.json({ success: true, consent });
  } catch (error) {
    console.error('Failed to record consent:', error);
    return res.status(500).json({ error: 'Failed to record consent' });
  }
});

// ============================================================
// B.3.6 — Domain endpoints for the previously broken domains.
// Ownership is always the verified Supabase Auth user id; a
// client-supplied userId/profileId is never used as the authority.
// ============================================================

const str = (v: unknown, max = 500): string | null =>
  typeof v === 'string' && v.length > 0 && v.length <= max ? v : null;
const isUuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
/** A calendar date in ISO form, e.g. "2026-03-01". */
const isIsoDate = (v: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(v);
/**
 * A list of trimmed, non-empty strings, capped in both count and length.
 *
 * Used for the free-text lists a volunteer stint carries (responsibilities,
 * achievements, skills) so a hostile body cannot store unbounded strings.
 */
const stringList = (v: unknown, maxItems: number, maxLength: number): string[] =>
  Array.isArray(v)
    ? v
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim().slice(0, maxLength))
        .filter((item) => item.length > 0)
        .slice(0, maxItems)
    : [];
/** A list of uuids, capped in count. Non-uuid entries are dropped. */
const uuidList = (v: unknown, maxItems: number): string[] =>
  Array.isArray(v)
    ? v.filter((item): item is string => typeof item === 'string' && isUuid(item)).slice(0, maxItems)
    : [];

/**
 * Accepts only absolute http(s) URLs for fields that are rendered as links.
 *
 * Without this check a stored value such as `javascript:alert(1)` would be
 * emitted as an href in the public profile and in the owner's views. An empty
 * value is allowed (it clears the field); anything else that is not a valid
 * http(s) URL is rejected by the caller.
 */
function parseHttpUrl(
  value: unknown,
  max = 1000
): { valid: boolean; value?: string } {
  if (value === undefined || value === null || value === '') {
    return { valid: true, value: undefined };
  }
  if (typeof value !== 'string' || value.length > max) {
    return { valid: false };
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return { valid: true, value: undefined };
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false };
    }
    return { valid: true, value: parsed.toString() };
  } catch {
    return { valid: false };
  }
}

/**
 * Validates and normalizes a roadmap tree sent by the client.
 *
 * Everything is length-capped and the task status is checked against the
 * server's own allow-list, so an arbitrary payload cannot reach the database.
 * Malformed entries are skipped rather than failing the whole request.
 */
function parseRoadmapTree(raw: unknown): RoadmapTreePhaseInput[] {
  if (!Array.isArray(raw)) return [];
  const phases: RoadmapTreePhaseInput[] = [];

  for (const phaseRaw of raw.slice(0, 50)) {
    if (!phaseRaw || typeof phaseRaw !== 'object') continue;
    const phase = phaseRaw as Record<string, unknown>;
    const title = str(phase.title, 200);
    if (!title) continue;
    const phaseNumber =
      typeof phase.phaseNumber === 'number' && Number.isInteger(phase.phaseNumber)
        ? phase.phaseNumber
        : phases.length + 1;

    const milestones: RoadmapTreePhaseInput['milestones'] = [];
    for (const milestoneRaw of Array.isArray(phase.milestones) ? phase.milestones.slice(0, 50) : []) {
      if (!milestoneRaw || typeof milestoneRaw !== 'object') continue;
      const milestone = milestoneRaw as Record<string, unknown>;
      const milestoneTitle = str(milestone.title, 200);
      if (!milestoneTitle) continue;

      const tasks: RoadmapTreePhaseInput['milestones'][number]['tasks'] = [];
      for (const taskRaw of Array.isArray(milestone.tasks) ? milestone.tasks.slice(0, 200) : []) {
        if (!taskRaw || typeof taskRaw !== 'object') continue;
        const task = taskRaw as Record<string, unknown>;
        const taskTitle = str(task.title, 300);
        if (!taskTitle) continue;
        const status = str(task.status, 30) as RoadmapTaskStatus | null;
        tasks.push({
          title: taskTitle,
          description: str(task.description, 5000) ?? undefined,
          status: status && ROADMAP_TASK_STATUSES.includes(status) ? status : 'not_started',
          skillName: str(task.skillName, 200) ?? undefined,
          deadline: str(task.deadline, 40) ?? undefined,
          resourceId: str(task.resourceId, 100) ?? undefined,
          resourceTitle: str(task.resourceTitle, 200) ?? undefined,
          estimatedHours:
            typeof task.estimatedHours === 'number' && Number.isInteger(task.estimatedHours)
              ? task.estimatedHours
              : undefined,
        });
      }

      milestones.push({
        title: milestoneTitle,
        description: str(milestone.description, 5000) ?? undefined,
        tasks,
      });
    }

    phases.push({
      phaseNumber,
      title,
      description: str(phase.description, 5000) ?? undefined,
      isUnlocked: typeof phase.isUnlocked === 'boolean' ? phase.isUnlocked : true,
      milestones,
    });
  }

  return phases;
}

// ---- Notifications ----
//
// The drawer used to render two hard-coded entries that lived only in React
// state. The notifications are now real rows, owned by the caller.
app.get('/api/notifications', requireAuth, async (req: Request, res: Response) => {
  try {
    const notifications = await listNotifications(req.authUser!.id);
    return res.json({ success: true, notifications });
  } catch (error) {
    console.error('Failed to list notifications:', error);
    return res.status(500).json({ error: 'Failed to load notifications' });
  }
});

app.post('/api/notifications', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const title = str(body.title, 200);
    if (!title) return res.status(400).json({ error: 'Title is required' });
    const type = str(body.type, 40) as NotificationType | null;
    if (type && !NOTIFICATION_TYPES.includes(type)) {
      return res.status(400).json({ error: 'Invalid type' });
    }
    const notification = await createNotification(req.authUser!.id, {
      title,
      message: str(body.message, 1000) ?? undefined,
      type: type ?? undefined,
      linkView: str(body.linkView, 60) ?? undefined,
    });
    return res.status(201).json({ success: true, notification });
  } catch (error) {
    console.error('Failed to create notification:', error);
    return res.status(500).json({ error: 'Failed to create notification' });
  }
});

app.patch('/api/notifications/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const marked = await markNotificationRead(req.authUser!.id, req.params.id);
    if (!marked) return res.status(404).json({ error: 'Notification not found' });
    const notifications = await listNotifications(req.authUser!.id);
    return res.json({ success: true, notifications });
  } catch (error) {
    console.error('Failed to mark notification read:', error);
    return res.status(500).json({ error: 'Failed to update notification' });
  }
});

app.post('/api/notifications/:id/click', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const result = await recordNotificationClick(req.authUser!.id, req.params.id);
    if (!result.found) return res.status(404).json({ error: 'Notification not found' });
    return res.json({ success: true, linkView: result.linkView });
  } catch (error) {
    console.error('Failed to record notification click:', error);
    return res.status(500).json({ error: 'Failed to record the notification click' });
  }
});

app.post('/api/notifications/read-all', requireAuth, async (req: Request, res: Response) => {
  try {
    const count = await markAllNotificationsRead(req.authUser!.id);
    const notifications = await listNotifications(req.authUser!.id);
    return res.json({ success: true, marked: count, notifications });
  } catch (error) {
    console.error('Failed to mark notifications read:', error);
    return res.status(500).json({ error: 'Failed to update notifications' });
  }
});

app.delete('/api/notifications', requireAuth, async (req: Request, res: Response) => {
  try {
    const count = await clearNotifications(req.authUser!.id);
    return res.json({ success: true, cleared: count });
  } catch (error) {
    console.error('Failed to clear notifications:', error);
    return res.status(500).json({ error: 'Failed to clear notifications' });
  }
});

app.delete('/api/notifications/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const deleted = await deleteNotification(req.authUser!.id, req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Notification not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete notification:', error);
    return res.status(500).json({ error: 'Failed to delete notification' });
  }
});

// ---- Activities ----
app.get('/api/activities', requireAuth, async (req: Request, res: Response) => {
  try {
    const actionType = str(req.query.actionType, 40) as ActivityActionType | null;
    if (actionType && !ACTIVITY_ACTION_TYPES.includes(actionType)) {
      return res.status(400).json({ error: 'Invalid actionType' });
    }
    const limitRaw = req.query.limit;
    const limit = typeof limitRaw === 'string' ? Number.parseInt(limitRaw, 10) : undefined;
    if (limit !== undefined && (!Number.isFinite(limit) || limit < 1 || limit > 500)) {
      return res.status(400).json({ error: 'Invalid limit' });
    }
    const activities = await listActivities(req.authUser!.id, {
      limit,
      actionType: actionType ?? undefined,
    });
    return res.json({ success: true, activities });
  } catch (error) {
    console.error('Failed to list activities:', error);
    return res.status(500).json({ error: 'Failed to load activities' });
  }
});

app.post('/api/activities', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const actionType = str(body.actionType, 40) as ActivityActionType | null;
    if (!actionType || !ACTIVITY_ACTION_TYPES.includes(actionType)) {
      return res.status(400).json({ error: 'Invalid actionType' });
    }
    const title = str(body.title, 200);
    if (!title) return res.status(400).json({ error: 'Title is required' });
    const activity = await createActivity(req.authUser!.id, {
      actionType,
      title,
      subtitle: str(body.subtitle, 300) ?? undefined,
      relatedObject: str(body.relatedObject, 200) ?? undefined,
      linkView: str(body.linkView, 60) ?? undefined,
    });
    return res.status(201).json({ success: true, activity });
  } catch (error) {
    console.error('Failed to create activity:', error);
    return res.status(500).json({ error: 'Failed to create activity' });
  }
});

// ---- Secondary Goals ----
app.get('/api/secondary-goals', requireAuth, async (req: Request, res: Response) => {
  try {
    const goals = await listSecondaryGoals(req.authUser!.id);
    return res.json({ success: true, goals });
  } catch (error) {
    console.error('Failed to list secondary goals:', error);
    return res.status(500).json({ error: 'Failed to load secondary goals' });
  }
});

app.post('/api/secondary-goals', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const title = str(body.title, 200);
    if (!title) return res.status(400).json({ error: 'Title is required' });
    const priority = str(body.priority, 10) as SecondaryGoalPriority | null;
    if (priority && !['high', 'medium', 'low'].includes(priority)) {
      return res.status(400).json({ error: 'Invalid priority' });
    }
    const status = str(body.status, 20) as SecondaryGoalStatus | null;
    if (status && !['active', 'achieved', 'paused'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const progressPercent = body.progressPercent;
    if (
      progressPercent !== undefined &&
      (typeof progressPercent !== 'number' ||
        !Number.isInteger(progressPercent) ||
        progressPercent < 0 ||
        progressPercent > 100)
    ) {
      return res.status(400).json({ error: 'Invalid progressPercent' });
    }
    const goal = await createSecondaryGoal(req.authUser!.id, {
      title,
      description: str(body.description, 2000) ?? undefined,
      priority: priority ?? undefined,
      deadline: str(body.deadline, 40) ?? undefined,
      status: status ?? undefined,
      progressPercent: (progressPercent ?? undefined) as number | undefined,
    });
    return res.status(201).json({ success: true, goal });
  } catch (error) {
    console.error('Failed to create secondary goal:', error);
    return res.status(500).json({ error: 'Failed to create secondary goal' });
  }
});

app.patch('/api/secondary-goals/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const body = req.body ?? {};
    const priority = str(body.priority, 10) as SecondaryGoalPriority | null;
    if (priority && !['high', 'medium', 'low'].includes(priority)) {
      return res.status(400).json({ error: 'Invalid priority' });
    }
    const status = str(body.status, 20) as SecondaryGoalStatus | null;
    if (status && !['active', 'achieved', 'paused'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const progressPercent = body.progressPercent;
    if (
      progressPercent !== undefined &&
      (typeof progressPercent !== 'number' ||
        !Number.isInteger(progressPercent) ||
        progressPercent < 0 ||
        progressPercent > 100)
    ) {
      return res.status(400).json({ error: 'Invalid progressPercent' });
    }
    const goal = await updateSecondaryGoal(req.authUser!.id, req.params.id, {
      title: str(body.title, 200) ?? undefined,
      description:
        body.description === null ? undefined : (str(body.description, 2000) ?? undefined),
      priority: priority ?? undefined,
      deadline: body.deadline === null ? undefined : (str(body.deadline, 40) ?? undefined),
      status: status ?? undefined,
      progressPercent: (progressPercent ?? undefined) as number | undefined,
    });
    if (!goal) return res.status(404).json({ error: 'Secondary goal not found' });
    return res.json({ success: true, goal });
  } catch (error) {
    console.error('Failed to update secondary goal:', error);
    return res.status(500).json({ error: 'Failed to update secondary goal' });
  }
});

app.delete('/api/secondary-goals/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const deleted = await deleteSecondaryGoal(req.authUser!.id, req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Secondary goal not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete secondary goal:', error);
    return res.status(500).json({ error: 'Failed to delete secondary goal' });
  }
});

// ---- Career Milestones ----
app.get('/api/career-milestones', requireAuth, async (req: Request, res: Response) => {
  try {
    const milestones = await listCareerMilestones(req.authUser!.id);
    return res.json({ success: true, milestones });
  } catch (error) {
    console.error('Failed to list career milestones:', error);
    return res.status(500).json({ error: 'Failed to load career milestones' });
  }
});

app.post('/api/career-milestones', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const title = str(body.title, 200);
    if (!title) return res.status(400).json({ error: 'Title is required' });
    const category = str(body.category, 30) as MilestoneCategory | null;
    if (!category || !MILESTONE_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    const dateAchieved = str(body.dateAchieved, 40);
    if (!dateAchieved || Number.isNaN(new Date(dateAchieved).getTime())) {
      return res.status(400).json({ error: 'A valid dateAchieved is required' });
    }
    const milestone = await createCareerMilestone(req.authUser!.id, {
      title,
      category,
      dateAchieved,
      notes: str(body.notes, 2000) ?? undefined,
      verified: typeof body.verified === 'boolean' ? body.verified : undefined,
    });
    return res.status(201).json({ success: true, milestone });
  } catch (error) {
    console.error('Failed to create career milestone:', error);
    return res.status(500).json({ error: 'Failed to create career milestone' });
  }
});

app.patch('/api/career-milestones/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const body = req.body ?? {};
    const category = str(body.category, 30) as MilestoneCategory | null;
    if (category && !MILESTONE_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    const dateAchieved = str(body.dateAchieved, 40);
    if (dateAchieved && Number.isNaN(new Date(dateAchieved).getTime())) {
      return res.status(400).json({ error: 'Invalid dateAchieved' });
    }
    const milestone = await updateCareerMilestone(req.authUser!.id, req.params.id, {
      title: str(body.title, 200) ?? undefined,
      category: category ?? undefined,
      dateAchieved: dateAchieved ?? undefined,
      notes: body.notes === null ? undefined : (str(body.notes, 2000) ?? undefined),
      verified: typeof body.verified === 'boolean' ? body.verified : undefined,
    });
    if (!milestone) return res.status(404).json({ error: 'Career milestone not found' });
    return res.json({ success: true, milestone });
  } catch (error) {
    console.error('Failed to update career milestone:', error);
    return res.status(500).json({ error: 'Failed to update career milestone' });
  }
});

app.delete('/api/career-milestones/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const deleted = await deleteCareerMilestone(req.authUser!.id, req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Career milestone not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete career milestone:', error);
    return res.status(500).json({ error: 'Failed to delete career milestone' });
  }
});

// ---- Cover Letters ----
app.get('/api/cover-letters', requireAuth, async (req: Request, res: Response) => {
  try {
    const coverLetters = await listCoverLetters(req.authUser!.id);
    return res.json({ success: true, coverLetters });
  } catch (error) {
    console.error('Failed to list cover letters:', error);
    return res.status(500).json({ error: 'Failed to load cover letters' });
  }
});

app.get('/api/cover-letters/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const coverLetter = await getCoverLetter(req.authUser!.id, req.params.id);
    if (!coverLetter) return res.status(404).json({ error: 'Cover letter not found' });
    return res.json({ success: true, coverLetter });
  } catch (error) {
    console.error('Failed to get cover letter:', error);
    return res.status(500).json({ error: 'Failed to load cover letter' });
  }
});

app.post('/api/cover-letters', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const title = str(body.title, 200);
    const company = str(body.company, 200);
    const role = str(body.role, 200);
    const content = str(body.content, 100000);
    if (!title) return res.status(400).json({ error: 'Title is required' });
    if (!company) return res.status(400).json({ error: 'Company is required' });
    if (!role) return res.status(400).json({ error: 'Role is required' });
    if (!content) return res.status(400).json({ error: 'Content is required' });
    const keyHighlights = Array.isArray(body.keyHighlights)
      ? body.keyHighlights.filter((v: unknown): v is string => typeof v === 'string').slice(0, 50)
      : [];
    const applicationId = str(body.applicationId, 40);
    if (applicationId && !isUuid(applicationId)) {
      return res.status(400).json({ error: 'Invalid applicationId' });
    }
    const coverLetter = await createCoverLetter(req.authUser!.id, {
      title,
      company,
      role,
      jobDescription: str(body.jobDescription, 20000) ?? undefined,
      content,
      keyHighlights,
      targetJobId: str(body.targetJobId, 60) ?? undefined,
      applicationId: applicationId ?? undefined,
    });
    return res.status(201).json({ success: true, coverLetter });
  } catch (error) {
    console.error('Failed to create cover letter:', error);
    return res.status(500).json({ error: 'Failed to create cover letter' });
  }
});

app.patch('/api/cover-letters/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const body = req.body ?? {};
    const applicationId = str(body.applicationId, 40);
    if (applicationId && !isUuid(applicationId)) {
      return res.status(400).json({ error: 'Invalid applicationId' });
    }
    const keyHighlights = Array.isArray(body.keyHighlights)
      ? body.keyHighlights.filter((v: unknown): v is string => typeof v === 'string').slice(0, 50)
      : undefined;
    const coverLetter = await updateCoverLetter(req.authUser!.id, req.params.id, {
      title: str(body.title, 200) ?? undefined,
      company: str(body.company, 200) ?? undefined,
      role: str(body.role, 200) ?? undefined,
      jobDescription:
        body.jobDescription === null ? undefined : (str(body.jobDescription, 20000) ?? undefined),
      content: str(body.content, 100000) ?? undefined,
      keyHighlights,
      targetJobId:
        body.targetJobId === null ? undefined : (str(body.targetJobId, 60) ?? undefined),
      applicationId: body.applicationId === null ? undefined : (applicationId ?? undefined),
    });
    if (!coverLetter) return res.status(404).json({ error: 'Cover letter not found' });
    return res.json({ success: true, coverLetter });
  } catch (error) {
    console.error('Failed to update cover letter:', error);
    return res.status(500).json({ error: 'Failed to update cover letter' });
  }
});

app.delete('/api/cover-letters/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const deleted = await deleteCoverLetter(req.authUser!.id, req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Cover letter not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete cover letter:', error);
    return res.status(500).json({ error: 'Failed to delete cover letter' });
  }
});

// ============================================================
// B.3.7 — Core domain endpoints (CV, portfolio, profile extensions,
// jobs, interviews). Ownership is always the verified Supabase Auth user id.
// ============================================================

// ---- CVs ----
app.get('/api/cvs', requireAuth, async (req: Request, res: Response) => {
  try {
    const cvs = await listCvs(req.authUser!.id);
    return res.json({ success: true, cvs });
  } catch (error) {
    console.error('Failed to list CVs:', error);
    return res.status(500).json({ error: 'Failed to load CVs' });
  }
});

app.get('/api/cvs/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const cv = await getCv(req.authUser!.id, req.params.id);
    if (!cv) return res.status(404).json({ error: 'CV not found' });
    return res.json({ success: true, cv });
  } catch (error) {
    console.error('Failed to get CV:', error);
    return res.status(500).json({ error: 'Failed to load CV' });
  }
});

app.post('/api/cvs', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const name = str(body.name, 200);
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const storagePath = str(body.storagePath, 500) ?? undefined;
    if (storagePath && !pathBelongsToUser(req.authUser!.id, storagePath)) {
      return res.status(400).json({ error: 'Invalid storagePath' });
    }
    const cv = await createCv(req.authUser!.id, {
      name,
      targetRoleTitle: str(body.targetRoleTitle, 200) ?? undefined,
      storagePath,
    });
    return res.status(201).json({ success: true, cv });
  } catch (error) {
    console.error('Failed to create CV:', error);
    return res.status(500).json({ error: 'Failed to create CV' });
  }
});

app.patch('/api/cvs/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const body = req.body ?? {};
    const storagePath =
      body.storagePath === null ? undefined : (str(body.storagePath, 500) ?? undefined);
    if (storagePath && !pathBelongsToUser(req.authUser!.id, storagePath)) {
      return res.status(400).json({ error: 'Invalid storagePath' });
    }
    const cv = await updateCv(req.authUser!.id, req.params.id, {
      name: str(body.name, 200) ?? undefined,
      targetRoleTitle:
        body.targetRoleTitle === null ? undefined : (str(body.targetRoleTitle, 200) ?? undefined),
      storagePath,
      isActive: typeof body.isActive === 'boolean' ? body.isActive : undefined,
    });
    if (!cv) return res.status(404).json({ error: 'CV not found' });
    return res.json({ success: true, cv });
  } catch (error) {
    console.error('Failed to update CV:', error);
    return res.status(500).json({ error: 'Failed to update CV' });
  }
});

app.delete('/api/cvs/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    // Read the row first so the stored file can be removed with it (no orphans).
    const existing = await getCvRow(req.authUser!.id, req.params.id);
    if (!existing) return res.status(404).json({ error: 'CV not found' });

    const deleted = await deleteCv(req.authUser!.id, req.params.id);
    if (!deleted) return res.status(404).json({ error: 'CV not found' });

    if (existing.storagePath) {
      try {
        await deleteCvFile(req.authUser!.id, existing.storagePath);
      } catch (storageError) {
        // The row is already gone; report the orphaned object so it can be swept.
        console.error('Failed to remove CV file from storage:', storageError);
      }
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete CV:', error);
    return res.status(500).json({ error: 'Failed to delete CV' });
  }
});

// Download a stored CV file: returns a short-lived signed URL for the caller's
// own file only. Another user's file id yields 404, never a URL.
app.get('/api/cvs/:id/file', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const cv = await getCvRow(req.authUser!.id, req.params.id);
    if (!cv) return res.status(404).json({ error: 'CV not found' });
    if (!cv.storagePath) return res.status(404).json({ error: 'No file stored for this CV' });
    const signed = await createCvFileDownloadUrl(req.authUser!.id, cv.storagePath);
    return res.json({
      success: true,
      url: signed.url,
      expiresIn: signed.expiresIn,
      fileName: cv.name,
    });
  } catch (error) {
    console.error('Failed to create CV download URL:', error);
    return res.status(500).json({ error: 'Failed to load CV file' });
  }
});

// ---- CV versions ----
app.get('/api/cv-versions', requireAuth, async (req: Request, res: Response) => {
  try {
    const versions = await listCvVersions(req.authUser!.id);
    return res.json({ success: true, versions });
  } catch (error) {
    console.error('Failed to list CV versions:', error);
    return res.status(500).json({ error: 'Failed to load CV versions' });
  }
});

app.get('/api/cv-versions/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const version = await getCvVersion(req.authUser!.id, req.params.id);
    if (!version) return res.status(404).json({ error: 'CV version not found' });
    return res.json({ success: true, version });
  } catch (error) {
    console.error('Failed to get CV version:', error);
    return res.status(500).json({ error: 'Failed to load CV version' });
  }
});

app.post('/api/cv-versions', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const cvId = str(body.cvId, 40);
    if (!cvId || !isUuid(cvId)) return res.status(400).json({ error: 'A valid cvId is required' });
    const name = str(body.name, 200);
    if (!name) return res.status(400).json({ error: 'Name is required' });
    // The CV must belong to the authenticated profile.
    const cv = await getCv(req.authUser!.id, cvId);
    if (!cv) return res.status(404).json({ error: 'CV not found' });
    const version = await createCvVersion(req.authUser!.id, {
      cvId,
      name,
      targetRoleTitle: str(body.targetRoleTitle, 200) ?? undefined,
      profileJson: body.profileJson ?? null,
      atsAnalysis: body.atsAnalysis ?? null,
    });
    // createCvVersion re-checks ownership internally; a null result means the
    // CV is not the caller's, so nothing was created.
    if (!version) return res.status(404).json({ error: 'CV not found' });
    return res.status(201).json({ success: true, version });
  } catch (error) {
    console.error('Failed to create CV version:', error);
    return res.status(500).json({ error: 'Failed to create CV version' });
  }
});

app.patch('/api/cv-versions/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const body = req.body ?? {};
    const version = await updateCvVersion(req.authUser!.id, req.params.id, {
      name: str(body.name, 200) ?? undefined,
      targetRoleTitle:
        body.targetRoleTitle === null ? undefined : (str(body.targetRoleTitle, 200) ?? undefined),
      profileJson: body.profileJson ?? undefined,
      atsAnalysis: body.atsAnalysis ?? undefined,
    });
    if (!version) return res.status(404).json({ error: 'CV version not found' });
    return res.json({ success: true, version });
  } catch (error) {
    console.error('Failed to update CV version:', error);
    return res.status(500).json({ error: 'Failed to update CV version' });
  }
});

app.delete('/api/cv-versions/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const deleted = await deleteCvVersion(req.authUser!.id, req.params.id);
    if (!deleted) return res.status(404).json({ error: 'CV version not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete CV version:', error);
    return res.status(500).json({ error: 'Failed to delete CV version' });
  }
});

// ---- Saved job application packages ----
// A package keeps the advertisement, its analysis, the deterministic match
// report and links to the user's own CV versions together. User ownership is
// always taken from the verified Supabase token, never from the request body.
app.get('/api/application-packages', requireAuth, async (req: Request, res: Response) => {
  try {
    const packages = await listApplicationPackages(req.authUser!.id);
    return res.json({ success: true, packages });
  } catch (error) {
    console.error('Failed to list application packages:', error);
    return res.status(500).json({ error: 'Failed to load saved applications' });
  }
});

app.post('/api/application-packages', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const jobDescription = str(body.jobDescription, 40000);
    if (!jobDescription || jobDescription.trim().length < 20) {
      return res.status(400).json({ error: 'A job description of at least 20 characters is required' });
    }
    if (!body.analysis || typeof body.analysis !== 'object' || Array.isArray(body.analysis)) {
      return res.status(400).json({ error: 'A valid job analysis is required' });
    }
    if (!body.matchAnalysis || typeof body.matchAnalysis !== 'object' || Array.isArray(body.matchAnalysis)) {
      return res.status(400).json({ error: 'A valid match analysis is required' });
    }
    const matchScore = Number(body.matchScore);
    if (!Number.isInteger(matchScore) || matchScore < 0 || matchScore > 100) {
      return res.status(400).json({ error: 'Match score must be an integer from 0 to 100' });
    }

    const sourceCvId = body.sourceCvId == null ? null : str(body.sourceCvId, 40);
    if (sourceCvId && (!isUuid(sourceCvId) || !(await getCv(req.authUser!.id, sourceCvId)))) {
      return res.status(404).json({ error: 'Source CV not found' });
    }
    const tailoredCvVersionId = body.tailoredCvVersionId == null ? null : str(body.tailoredCvVersionId, 40);
    if (tailoredCvVersionId && (!isUuid(tailoredCvVersionId) || !(await getCvVersion(req.authUser!.id, tailoredCvVersionId)))) {
      return res.status(404).json({ error: 'Tailored CV version not found' });
    }
    const coverLetterId = body.coverLetterId == null ? null : str(body.coverLetterId, 40);
    if (coverLetterId && (!isUuid(coverLetterId) || !(await getCoverLetter(req.authUser!.id, coverLetterId)))) {
      return res.status(404).json({ error: 'Cover letter not found' });
    }

    const saved = await createApplicationPackage(req.authUser!.id, {
      jobTitle: str(body.jobTitle, 200),
      company: str(body.company, 200),
      jobDescription,
      analysis: body.analysis,
      matchAnalysis: body.matchAnalysis,
      matchScore,
      language: str(body.language, 12),
      sourceCvId,
      tailoredCvVersionId,
      coverLetterId,
    });
    return res.status(201).json({ success: true, package: saved });
  } catch (error) {
    console.error('Failed to save application package:', error);
    return res.status(500).json({ error: 'Failed to save this application' });
  }
});

app.patch('/api/application-packages/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const body = req.body ?? {};
    const updates: Record<string, unknown> = {};
    if (body.jobTitle !== undefined) updates.jobTitle = body.jobTitle === null ? null : str(body.jobTitle, 200);
    if (body.company !== undefined) updates.company = body.company === null ? null : str(body.company, 200);
    if (body.language !== undefined) updates.language = body.language === null ? null : str(body.language, 12);
    if (body.matchScore !== undefined) {
      const score = Number(body.matchScore);
      if (!Number.isInteger(score) || score < 0 || score > 100) return res.status(400).json({ error: 'Invalid match score' });
      updates.matchScore = score;
    }
    if (body.analysis !== undefined) updates.analysis = body.analysis;
    if (body.matchAnalysis !== undefined) updates.matchAnalysis = body.matchAnalysis;

    const sourceCvId = body.sourceCvId == null ? body.sourceCvId : str(body.sourceCvId, 40);
    if (sourceCvId !== undefined) {
      if (sourceCvId !== null && (!isUuid(sourceCvId) || !(await getCv(req.authUser!.id, sourceCvId)))) {
        return res.status(404).json({ error: 'Source CV not found' });
      }
      updates.sourceCvId = sourceCvId;
    }
    const tailoredCvVersionId = body.tailoredCvVersionId == null ? body.tailoredCvVersionId : str(body.tailoredCvVersionId, 40);
    if (tailoredCvVersionId !== undefined) {
      if (tailoredCvVersionId !== null && (!isUuid(tailoredCvVersionId) || !(await getCvVersion(req.authUser!.id, tailoredCvVersionId)))) {
        return res.status(404).json({ error: 'Tailored CV version not found' });
      }
      updates.tailoredCvVersionId = tailoredCvVersionId;
    }
    const coverLetterId = body.coverLetterId == null ? body.coverLetterId : str(body.coverLetterId, 40);
    if (coverLetterId !== undefined) {
      if (coverLetterId !== null && (!isUuid(coverLetterId) || !(await getCoverLetter(req.authUser!.id, coverLetterId)))) {
        return res.status(404).json({ error: 'Cover letter not found' });
      }
      updates.coverLetterId = coverLetterId;
    }
    const saved = await updateApplicationPackage(req.authUser!.id, req.params.id, updates);
    if (!saved) return res.status(404).json({ error: 'Application package not found' });
    return res.json({ success: true, package: saved });
  } catch (error) {
    console.error('Failed to update application package:', error);
    return res.status(500).json({ error: 'Failed to update this application' });
  }
});

// ---- Projects ----
app.get('/api/projects', requireAuth, async (req: Request, res: Response) => {
  try {
    const projects = await listProjects(req.authUser!.id);
    return res.json({ success: true, projects });
  } catch (error) {
    console.error('Failed to list projects:', error);
    return res.status(500).json({ error: 'Failed to load projects' });
  }
});

app.get('/api/projects/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const project = await getProject(req.authUser!.id, req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    return res.json({ success: true, project });
  } catch (error) {
    console.error('Failed to get project:', error);
    return res.status(500).json({ error: 'Failed to load project' });
  }
});

app.post('/api/projects', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const title = str(body.title, 200);
    if (!title) return res.status(400).json({ error: 'Title is required' });
    const difficulty = str(body.difficulty, 30);
    if (difficulty && !['Beginner', 'Intermediate', 'Advanced'].includes(difficulty)) {
      return res.status(400).json({ error: 'Invalid difficulty' });
    }
    const status = str(body.status, 30);
    if (status && !['idea', 'planned', 'in_progress', 'completed', 'published'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const repositoryUrl = parseHttpUrl(body.repositoryUrl, 500);
    const demoUrl = parseHttpUrl(body.demoUrl, 500);
    if (!repositoryUrl.valid) {
      return res.status(400).json({ error: 'repositoryUrl must be an http(s) URL' });
    }
    if (!demoUrl.valid) {
      return res.status(400).json({ error: 'demoUrl must be an http(s) URL' });
    }
    const project = await createProject(req.authUser!.id, {
      title,
      goal: str(body.goal, 4000) ?? undefined,
      description: str(body.description, 20000) ?? undefined,
      difficulty: (difficulty ?? undefined) as 'Beginner' | 'Intermediate' | 'Advanced' | undefined,
      status: status as
        | 'idea'
        | 'planned'
        | 'in_progress'
        | 'completed'
        | 'published'
        | undefined,
      repositoryUrl: repositoryUrl.value,
      demoUrl: demoUrl.value,
      documentation: str(body.documentation, 500) ?? undefined,
      tasks: Array.isArray(body.tasks)
        ? body.tasks.filter((v: unknown): v is string => typeof v === 'string').slice(0, 100)
        : [],
      deliverables: Array.isArray(body.deliverables)
        ? body.deliverables.filter((v: unknown): v is string => typeof v === 'string').slice(0, 100)
        : [],
      skills: Array.isArray(body.skills)
        ? body.skills.filter((v: unknown): v is string => typeof v === 'string').slice(0, 50)
        : [],
      category: (str(body.category, 50) as any) ?? 'personal',
      role: str(body.role, 100) ?? undefined,
      responsibilities: Array.isArray(body.responsibilities)
        ? body.responsibilities.filter((v: unknown): v is string => typeof v === 'string').slice(0, 100)
        : [],
      startDate: str(body.startDate, 40) ?? undefined,
      isFeatured: typeof body.isFeatured === 'boolean' ? body.isFeatured : false,
      includeInPortfolio: typeof body.includeInPortfolio === 'boolean' ? body.includeInPortfolio : true,
      thumbnailUrl: parseHttpUrl(body.thumbnailUrl, 1000).value,
      screenshots: Array.isArray(body.screenshots)
        ? body.screenshots.filter((v: unknown): v is string => typeof v === 'string').slice(0, 20)
        : [],
    });
    return res.status(201).json({ success: true, project });
  } catch (error) {
    console.error('Failed to create project:', error);
    return res.status(500).json({ error: 'Failed to create project' });
  }
});

app.patch('/api/projects/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const body = req.body ?? {};
    const repositoryUrl =
      body.repositoryUrl === undefined || body.repositoryUrl === null
        ? { valid: true, value: undefined }
        : parseHttpUrl(body.repositoryUrl, 500);
    const demoUrl =
      body.demoUrl === undefined || body.demoUrl === null
        ? { valid: true, value: undefined }
        : parseHttpUrl(body.demoUrl, 500);
    if (!repositoryUrl.valid) {
      return res.status(400).json({ error: 'repositoryUrl must be an http(s) URL' });
    }
    if (!demoUrl.valid) {
      return res.status(400).json({ error: 'demoUrl must be an http(s) URL' });
    }
    const project = await updateProject(req.authUser!.id, req.params.id, {
      title: str(body.title, 200) ?? undefined,
      goal: body.goal === null ? undefined : (str(body.goal, 4000) ?? undefined),
      description:
        body.description === null ? undefined : (str(body.description, 20000) ?? undefined),
      difficulty: str(body.difficulty, 30) as ProjectDifficulty | undefined,
      status: str(body.status, 30) as ProjectStatus | undefined,
      repositoryUrl: repositoryUrl.value,
      demoUrl: demoUrl.value,
      documentation:
        body.documentation === null ? undefined : (str(body.documentation, 500) ?? undefined),
      tasks: Array.isArray(body.tasks)
        ? body.tasks.filter((v: unknown): v is string => typeof v === 'string').slice(0, 100)
        : undefined,
      deliverables: Array.isArray(body.deliverables)
        ? body.deliverables.filter((v: unknown): v is string => typeof v === 'string').slice(0, 100)
        : undefined,
      skills: Array.isArray(body.skills)
        ? body.skills.filter((v: unknown): v is string => typeof v === 'string').slice(0, 50)
        : undefined,
      category: body.category ? (str(body.category, 50) as any) : undefined,
      role: body.role !== undefined ? (str(body.role, 100) ?? undefined) : undefined,
      responsibilities: Array.isArray(body.responsibilities)
        ? body.responsibilities.filter((v: unknown): v is string => typeof v === 'string').slice(0, 100)
        : undefined,
      startDate: body.startDate !== undefined ? (str(body.startDate, 40) ?? undefined) : undefined,
      isFeatured: typeof body.isFeatured === 'boolean' ? body.isFeatured : undefined,
      includeInPortfolio: typeof body.includeInPortfolio === 'boolean' ? body.includeInPortfolio : undefined,
      thumbnailUrl: body.thumbnailUrl !== undefined ? parseHttpUrl(body.thumbnailUrl, 1000).value : undefined,
      screenshots: Array.isArray(body.screenshots)
        ? body.screenshots.filter((v: unknown): v is string => typeof v === 'string').slice(0, 20)
        : undefined,
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    return res.json({ success: true, project });
  } catch (error) {
    console.error('Failed to update project:', error);
    return res.status(500).json({ error: 'Failed to update project' });
  }
});

app.delete('/api/projects/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const deleted = await deleteProject(req.authUser!.id, req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Project not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete project:', error);
    return res.status(500).json({ error: 'Failed to delete project' });
  }
});

app.post('/api/portfolio/upload', requireAuth, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }
    const uploaded = await uploadPortfolioFile(
      req.authUser!.id,
      req.file.originalname,
      req.file.buffer,
      req.file.mimetype
    );
    return res.status(201).json({ success: true, file: uploaded });
  } catch (error: any) {
    console.error('Failed to upload portfolio file:', error);
    return res.status(400).json({ error: error?.message || 'Failed to upload file' });
  }
});

// The OTHER direction of the volunteer <-> project link: which volunteering
// stints a project is evidence for. Ownership is the verified user id, so a
// project that is not the caller's returns nothing.
app.get('/api/projects/:id/volunteer', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const volunteer = await listVolunteerExperiencesForProject(req.authUser!.id, req.params.id);
    return res.json({ success: true, volunteer });
  } catch (error) {
    console.error('Failed to load the volunteering for a project:', error);
    return res.status(500).json({ error: 'Failed to load volunteering' });
  }
});

// ---- Volunteer opportunities ----
//
// The catalogue of real volunteering programmes a user can apply to, ranked
// for the signed-in user. The ranking never hides a row: the full catalogue
// is always returned, with the reason for the order shown alongside.
app.get('/api/volunteer/opportunities', requireAuth, async (req: Request, res: Response) => {
  try {
    const opportunities = await listVolunteerOpportunities(req.authUser!.id);
    const category = str(req.query?.category, 60);
    const filtered = category
      ? opportunities.filter((opportunity) => opportunity.category === category)
      : opportunities;
    return res.json({
      success: true,
      opportunities: filtered,
      total: opportunities.length,
      categories: Array.from(new Set(opportunities.map((item) => item.category))).sort(),
    });
  } catch (error) {
    console.error('Failed to load volunteer opportunities:', error);
    return res.status(500).json({ error: 'Failed to load volunteer opportunities' });
  }
});

app.post('/api/volunteer/opportunities/:id/save', requireAuth, async (req: Request, res: Response) => {
  try {
    const opportunityId = str(req.params.id, 120);
    if (!opportunityId) return res.status(400).json({ error: 'Invalid opportunity id' });
    await saveVolunteerOpportunity(req.authUser!.id, opportunityId);
    return res.json({ success: true, saved: true });
  } catch (error) {
    console.error('Failed to save the volunteer opportunity:', error);
    return res.status(500).json({ error: 'Failed to save the opportunity' });
  }
});

app.delete('/api/volunteer/opportunities/:id/save', requireAuth, async (req: Request, res: Response) => {
  try {
    const opportunityId = str(req.params.id, 120);
    if (!opportunityId) return res.status(400).json({ error: 'Invalid opportunity id' });
    await unsaveVolunteerOpportunity(req.authUser!.id, opportunityId);
    return res.json({ success: true, saved: false });
  } catch (error) {
    console.error('Failed to remove the saved volunteer opportunity:', error);
    return res.status(500).json({ error: 'Failed to remove the opportunity' });
  }
});

// ---- Guided tour state ----
//
// Which first-use hints the user has already dismissed. The client uses this
// to show a tour once, not on every visit.
app.get('/api/guides', requireAuth, async (req: Request, res: Response) => {
  try {
    const dismissed = await listDismissedGuides(req.authUser!.id);
    return res.json({ success: true, dismissed });
  } catch (error) {
    console.error('Failed to load guide state:', error);
    return res.status(500).json({ error: 'Failed to load guide state' });
  }
});

app.post('/api/guides/:key/dismiss', requireAuth, async (req: Request, res: Response) => {
  try {
    const key = str(req.params.key, 60);
    if (!key) return res.status(400).json({ error: 'Invalid guide key' });
    const dismissal = await dismissGuide(req.authUser!.id, key);
    return res.json({ success: true, dismissal });
  } catch (error) {
    console.error('Failed to dismiss the guide:', error);
    return res.status(500).json({ error: 'Failed to dismiss the guide' });
  }
});

app.post('/api/guides/reset', requireAuth, async (req: Request, res: Response) => {
  try {
    await resetAllGuides(req.authUser!.id);
    return res.json({ success: true, message: 'All guided tours reset successfully' });
  } catch (error) {
    console.error('Failed to reset guides:', error);
    return res.status(500).json({ error: 'Failed to reset guides' });
  }
});

// ---- CV built from real profile data ----
//
// Assembles a CV from the user's own records. It never invents a company, a
// date, a skill, a certificate or a metric; the `missing` list reports what
// the user still needs to supply.
app.get('/api/cv/build', requireAuth, async (req: Request, res: Response) => {
  try {
    const cv = await buildCvFromProfile(req.authUser!.id, {
      email: req.authUser?.email ?? null,
    });
    return res.json({ success: true, cv });
  } catch (error) {
    console.error('Failed to build the CV:', error);
    return res.status(500).json({ error: 'Failed to build the CV' });
  }
});

// ---- Volunteer experience ----
//
// A volunteer stint is its own domain: it has an organisation, a role, a
// duration, responsibilities, achievements and the skills it gave the user.
// It is deliberately kept out of `public.experiences`, which holds employment
// and feeds the CV builder.
//
// Ownership is always the verified Supabase user id. A link to a project is
// only accepted when that project belongs to the same user.
app.get('/api/volunteer', requireAuth, async (req: Request, res: Response) => {
  try {
    const volunteer = await listVolunteerExperiences(req.authUser!.id);
    return res.json({ success: true, volunteer });
  } catch (error) {
    console.error('Failed to list volunteer experience:', error);
    return res.status(500).json({ error: 'Failed to load volunteer experience' });
  }
});

app.get('/api/volunteer/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const volunteer = await getVolunteerExperience(req.authUser!.id, req.params.id);
    if (!volunteer) return res.status(404).json({ error: 'Volunteer experience not found' });
    return res.json({ success: true, volunteer });
  } catch (error) {
    console.error('Failed to load volunteer experience:', error);
    return res.status(500).json({ error: 'Failed to load volunteer experience' });
  }
});

app.post('/api/volunteer', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const organization = str(body.organization, 200);
    if (!organization) return res.status(400).json({ error: 'Organisation is required' });
    const role = str(body.role, 200);
    if (!role) return res.status(400).json({ error: 'Role is required' });

    const startDate = str(body.startDate, 20);
    const endDate = str(body.endDate, 20);
    if (startDate && !isIsoDate(startDate)) {
      return res.status(400).json({ error: 'startDate must be an ISO date (YYYY-MM-DD)' });
    }
    if (endDate && !isIsoDate(endDate)) {
      return res.status(400).json({ error: 'endDate must be an ISO date (YYYY-MM-DD)' });
    }
    if (startDate && endDate && endDate < startDate) {
      return res.status(400).json({ error: 'endDate must not be before startDate' });
    }
    const isCurrent = body.isCurrent === true;
    if (isCurrent && endDate) {
      return res.status(400).json({ error: 'A current volunteering stint cannot have an end date' });
    }

    const volunteer = await createVolunteerExperience(req.authUser!.id, {
      organization,
      role,
      location: str(body.location, 200) ?? undefined,
      startDate: startDate ?? undefined,
      endDate: endDate ?? undefined,
      isCurrent,
      description: str(body.description, 4000) ?? undefined,
      responsibilities: stringList(body.responsibilities, 50, 500),
      achievements: stringList(body.achievements, 50, 500),
      skills: stringList(body.skills, 50, 120),
      projectIds: uuidList(body.projectIds, 50),
    });
    return res.status(201).json({ success: true, volunteer });
  } catch (error) {
    console.error('Failed to create volunteer experience:', error);
    return res.status(500).json({ error: 'Failed to create volunteer experience' });
  }
});

app.patch('/api/volunteer/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const body = req.body ?? {};

    const organization =
      body.organization === undefined ? undefined : (str(body.organization, 200) ?? undefined);
    if (body.organization !== undefined && !organization) {
      return res.status(400).json({ error: 'Organisation is required' });
    }
    const role = body.role === undefined ? undefined : (str(body.role, 200) ?? undefined);
    if (body.role !== undefined && !role) {
      return res.status(400).json({ error: 'Role is required' });
    }
    const startDate = body.startDate === undefined ? undefined : str(body.startDate, 20);
    if (body.startDate !== undefined && startDate && !isIsoDate(startDate)) {
      return res.status(400).json({ error: 'startDate must be an ISO date (YYYY-MM-DD)' });
    }
    const endDate = body.endDate === undefined ? undefined : str(body.endDate, 20);
    if (body.endDate !== undefined && endDate && !isIsoDate(endDate)) {
      return res.status(400).json({ error: 'endDate must be an ISO date (YYYY-MM-DD)' });
    }
    if (startDate && endDate && endDate < startDate) {
      return res.status(400).json({ error: 'endDate must not be before startDate' });
    }
    if (body.isCurrent === true && endDate) {
      return res.status(400).json({ error: 'A current volunteering stint cannot have an end date' });
    }

    const volunteer = await updateVolunteerExperience(req.authUser!.id, req.params.id, {
      organization,
      role,
      location: body.location === undefined ? undefined : (str(body.location, 200) ?? ''),
      startDate: body.startDate === undefined ? undefined : (startDate ?? ''),
      endDate: body.endDate === undefined ? undefined : (endDate ?? ''),
      isCurrent: typeof body.isCurrent === 'boolean' ? body.isCurrent : undefined,
      description: body.description === undefined ? undefined : (str(body.description, 4000) ?? ''),
      responsibilities:
        body.responsibilities === undefined ? undefined : stringList(body.responsibilities, 50, 500),
      achievements:
        body.achievements === undefined ? undefined : stringList(body.achievements, 50, 500),
      skills: body.skills === undefined ? undefined : stringList(body.skills, 50, 120),
      projectIds: body.projectIds === undefined ? undefined : uuidList(body.projectIds, 50),
    });
    if (!volunteer) return res.status(404).json({ error: 'Volunteer experience not found' });
    return res.json({ success: true, volunteer });
  } catch (error) {
    console.error('Failed to update volunteer experience:', error);
    return res.status(500).json({ error: 'Failed to update volunteer experience' });
  }
});

app.delete('/api/volunteer/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const deleted = await deleteVolunteerExperience(req.authUser!.id, req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Volunteer experience not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete volunteer experience:', error);
    return res.status(500).json({ error: 'Failed to delete volunteer experience' });
  }
});

// ---- Evidence ----
app.get('/api/evidence', requireAuth, async (req: Request, res: Response) => {
  try {
    const evidence = await listEvidence(req.authUser!.id);
    return res.json({ success: true, evidence });
  } catch (error) {
    console.error('Failed to list evidence:', error);
    return res.status(500).json({ error: 'Failed to load evidence' });
  }
});

app.get('/api/evidence/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const item = await getEvidence(req.authUser!.id, req.params.id);
    if (!item) return res.status(404).json({ error: 'Evidence not found' });
    return res.json({ success: true, evidence: item });
  } catch (error) {
    console.error('Failed to get evidence:', error);
    return res.status(500).json({ error: 'Failed to load evidence' });
  }
});

app.post('/api/evidence', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const title = str(body.title, 200);
    if (!title) return res.status(400).json({ error: 'Title is required' });
    const type = str(body.type, 30);
    if (type && !EVIDENCE_TYPES.includes(type as (typeof EVIDENCE_TYPES)[number])) {
      return res.status(400).json({ error: 'Invalid type' });
    }
    const projectId = str(body.projectId, 40);
    if (projectId && !isUuid(projectId)) {
      return res.status(400).json({ error: 'Invalid projectId' });
    }
    const dateAdded = str(body.dateAdded, 40);
    if (dateAdded && Number.isNaN(new Date(dateAdded).getTime())) {
      return res.status(400).json({ error: 'Invalid dateAdded' });
    }
    const evidenceUrl = parseHttpUrl(body.url, 500);
    if (!evidenceUrl.valid) {
      return res.status(400).json({ error: 'url must be an http(s) URL' });
    }
    const item = await createEvidence(req.authUser!.id, {
      title,
      type: (type ?? undefined) as (typeof EVIDENCE_TYPES)[number] | undefined,
      description: str(body.description, 20000) ?? undefined,
      url: evidenceUrl.value,
      verified: typeof body.verified === 'boolean' ? body.verified : undefined,
      dateAdded: dateAdded ?? undefined,
      projectId: projectId ?? undefined,
      skillNames: Array.isArray(body.skillNames)
        ? body.skillNames.filter((v: unknown): v is string => typeof v === 'string').slice(0, 50)
        : [],
    });
    return res.status(201).json({ success: true, evidence: item });
  } catch (error) {
    console.error('Failed to create evidence:', error);
    return res.status(500).json({ error: 'Failed to create evidence' });
  }
});

app.patch('/api/evidence/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const body = req.body ?? {};
    const type = str(body.type, 30);
    if (type && !EVIDENCE_TYPES.includes(type as (typeof EVIDENCE_TYPES)[number])) {
      return res.status(400).json({ error: 'Invalid type' });
    }
    const projectId = str(body.projectId, 40);
    if (projectId && !isUuid(projectId)) {
      return res.status(400).json({ error: 'Invalid projectId' });
    }
    const evidenceUrl =
      body.url === undefined || body.url === null
        ? { valid: true, value: undefined }
        : parseHttpUrl(body.url, 500);
    if (!evidenceUrl.valid) {
      return res.status(400).json({ error: 'url must be an http(s) URL' });
    }
    const item = await updateEvidence(req.authUser!.id, req.params.id, {
      title: str(body.title, 200) ?? undefined,
      type: (type ?? undefined) as (typeof EVIDENCE_TYPES)[number] | undefined,
      description:
        body.description === null ? undefined : (str(body.description, 20000) ?? undefined),
      url: evidenceUrl.value,
      verified: typeof body.verified === 'boolean' ? body.verified : undefined,
      dateAdded: str(body.dateAdded, 40) ?? undefined,
      projectId: projectId ?? undefined,
      skillNames: Array.isArray(body.skillNames)
        ? body.skillNames.filter((v: unknown): v is string => typeof v === 'string').slice(0, 50)
        : undefined,
    });
    if (!item) return res.status(404).json({ error: 'Evidence not found' });
    return res.json({ success: true, evidence: item });
  } catch (error) {
    console.error('Failed to update evidence:', error);
    return res.status(500).json({ error: 'Failed to update evidence' });
  }
});

app.delete('/api/evidence/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const deleted = await deleteEvidence(req.authUser!.id, req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Evidence not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete evidence:', error);
    return res.status(500).json({ error: 'Failed to delete evidence' });
  }
});

// ---- Profile extensions: certifications ----
app.get('/api/certifications', requireAuth, async (req: Request, res: Response) => {
  try {
    const certifications = await listCertifications(req.authUser!.id);
    return res.json({ success: true, certifications });
  } catch (error) {
    console.error('Failed to list certifications:', error);
    return res.status(500).json({ error: 'Failed to load certifications' });
  }
});

app.post('/api/certifications', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const name = str(body.name, 200);
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const issueDate = str(body.issueDate, 40);
    if (issueDate && !parseDate(issueDate).date && !parseDate(issueDate).isCurrent) {
      return res.status(400).json({ error: 'Invalid issueDate' });
    }
    const expiryDate = str(body.expiryDate, 40);
    if (expiryDate && !parseDate(expiryDate).date && !parseDate(expiryDate).isCurrent) {
      return res.status(400).json({ error: 'Invalid expiryDate' });
    }
    const certificationUrl = parseHttpUrl(body.url, 500);
    if (!certificationUrl.valid) {
      return res.status(400).json({ error: 'url must be an http(s) URL' });
    }
    const attachmentUrl = parseHttpUrl(body.attachmentUrl, 1000);
    if (!attachmentUrl.valid) {
      return res.status(400).json({ error: 'attachmentUrl must be an http(s) URL' });
    }
    const certification = await createCertification(req.authUser!.id, {
      name,
      issuer: str(body.issuer, 200) ?? undefined,
      issueDate: issueDate ?? undefined,
      expiryDate: expiryDate ?? undefined,
      url: certificationUrl.value,
      credentialId: str(body.credentialId, 200) ?? undefined,
      description: str(body.description, 2000) ?? undefined,
      attachmentUrl: attachmentUrl.value,
      skillNames: Array.isArray(body.skillNames)
        ? body.skillNames.filter((v: unknown): v is string => typeof v === 'string').slice(0, 30)
        : undefined,
    });
    return res.status(201).json({ success: true, certification });
  } catch (error) {
    if (error instanceof DateValidationError) {
      return res.status(400).json({ error: error.message, field: error.field });
    }
    console.error('Failed to create certification:', error);
    return res.status(500).json({ error: 'Failed to create certification' });
  }
});

app.patch('/api/certifications/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const body = req.body ?? {};
    const certificationUrl =
      body.url === undefined || body.url === null
        ? { valid: true, value: undefined }
        : parseHttpUrl(body.url, 500);
    if (!certificationUrl.valid) {
      return res.status(400).json({ error: 'url must be an http(s) URL' });
    }
    const attachmentUrl =
      body.attachmentUrl === undefined || body.attachmentUrl === null
        ? { valid: true, value: undefined }
        : parseHttpUrl(body.attachmentUrl, 1000);
    if (!attachmentUrl.valid) {
      return res.status(400).json({ error: 'attachmentUrl must be an http(s) URL' });
    }
    const certification = await updateCertification(req.authUser!.id, req.params.id, {
      name: str(body.name, 200) ?? undefined,
      issuer: body.issuer === null ? undefined : (str(body.issuer, 200) ?? undefined),
      issueDate: str(body.issueDate, 40) ?? undefined,
      expiryDate: str(body.expiryDate, 40) ?? undefined,
      url: certificationUrl.value,
      credentialId:
        body.credentialId === null ? undefined : (str(body.credentialId, 200) ?? undefined),
      description: body.description !== undefined ? (str(body.description, 2000) ?? undefined) : undefined,
      attachmentUrl: attachmentUrl.value,
      skillNames: Array.isArray(body.skillNames)
        ? body.skillNames.filter((v: unknown): v is string => typeof v === 'string').slice(0, 30)
        : undefined,
    });
    if (!certification) return res.status(404).json({ error: 'Certification not found' });
    return res.json({ success: true, certification });
  } catch (error) {
    if (error instanceof DateValidationError) {
      return res.status(400).json({ error: error.message, field: error.field });
    }
    console.error('Failed to update certification:', error);
    return res.status(500).json({ error: 'Failed to update certification' });
  }
});

app.delete('/api/certifications/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const deleted = await deleteCertification(req.authUser!.id, req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Certification not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete certification:', error);
    return res.status(500).json({ error: 'Failed to delete certification' });
  }
});

// ---- Profile extensions: languages ----
app.get('/api/languages', requireAuth, async (req: Request, res: Response) => {
  try {
    const languages = await listLanguages(req.authUser!.id);
    return res.json({ success: true, languages });
  } catch (error) {
    console.error('Failed to list languages:', error);
    return res.status(500).json({ error: 'Failed to load languages' });
  }
});

app.post('/api/languages', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const name = str(body.name, 100);
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const proficiency = str(body.proficiency, 30);
    if (
      proficiency &&
      !LANGUAGE_PROFICIENCIES.includes(proficiency as (typeof LANGUAGE_PROFICIENCIES)[number])
    ) {
      return res.status(400).json({ error: 'Invalid proficiency' });
    }
    const language = await createLanguage(req.authUser!.id, {
      name,
      proficiency: (proficiency ?? undefined) as (typeof LANGUAGE_PROFICIENCIES)[number] | undefined,
    });
    return res.status(201).json({ success: true, language });
  } catch (error) {
    console.error('Failed to create language:', error);
    return res.status(500).json({ error: 'Failed to create language' });
  }
});

app.patch('/api/languages/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const body = req.body ?? {};
    const proficiency = str(body.proficiency, 30);
    if (
      proficiency &&
      !LANGUAGE_PROFICIENCIES.includes(proficiency as (typeof LANGUAGE_PROFICIENCIES)[number])
    ) {
      return res.status(400).json({ error: 'Invalid proficiency' });
    }
    const language = await updateLanguage(req.authUser!.id, req.params.id, {
      name: str(body.name, 100) ?? undefined,
      proficiency: (proficiency ?? undefined) as (typeof LANGUAGE_PROFICIENCIES)[number] | undefined,
    });
    if (!language) return res.status(404).json({ error: 'Language not found' });
    return res.json({ success: true, language });
  } catch (error) {
    console.error('Failed to update language:', error);
    return res.status(500).json({ error: 'Failed to update language' });
  }
});

app.delete('/api/languages/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const deleted = await deleteLanguage(req.authUser!.id, req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Language not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete language:', error);
    return res.status(500).json({ error: 'Failed to delete language' });
  }
});

// ---- Profile extensions: links ----
app.get('/api/profile-links', requireAuth, async (req: Request, res: Response) => {
  try {
    const links = await listProfileLinks(req.authUser!.id);
    return res.json({ success: true, links });
  } catch (error) {
    console.error('Failed to list profile links:', error);
    return res.status(500).json({ error: 'Failed to load profile links' });
  }
});

app.post('/api/profile-links', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const kind = str(body.kind, 60);
    if (!kind) return res.status(400).json({ error: 'Kind is required' });
    const parsedUrl = parseHttpUrl(body.url, 500);
    if (!parsedUrl.valid || !parsedUrl.value) {
      return res.status(400).json({ error: 'URL must be an http(s) URL' });
    }
    const link = await createProfileLink(req.authUser!.id, {
      kind,
      label: str(body.label, 200) ?? undefined,
      url: parsedUrl.value,
    });
    return res.status(201).json({ success: true, link });
  } catch (error) {
    console.error('Failed to create profile link:', error);
    return res.status(500).json({ error: 'Failed to create profile link' });
  }
});

app.patch('/api/profile-links/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const body = req.body ?? {};
    const parsedUrl =
      body.url === undefined || body.url === null
        ? { valid: true, value: undefined }
        : parseHttpUrl(body.url, 500);
    if (!parsedUrl.valid) {
      return res.status(400).json({ error: 'URL must be an http(s) URL' });
    }
    const link = await updateProfileLink(req.authUser!.id, req.params.id, {
      kind: str(body.kind, 60) ?? undefined,
      // `null` is a request to clear the custom label. A missing key means
      // "leave it alone"; an empty string means the same as `null`, because a
      // blank label is not a label.
      label:
        body.label === undefined
          ? undefined
          : body.label === null
            ? null
            : (str(body.label, 200)?.trim() || null),
      url: parsedUrl.value,
    });
    if (!link) return res.status(404).json({ error: 'Profile link not found' });
    return res.json({ success: true, link });
  } catch (error) {
    console.error('Failed to update profile link:', error);
    return res.status(500).json({ error: 'Failed to update profile link' });
  }
});

app.delete('/api/profile-links/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const deleted = await deleteProfileLink(req.authUser!.id, req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Profile link not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete profile link:', error);
    return res.status(500).json({ error: 'Failed to delete profile link' });
  }
});

// ---- Profile extensions: career identity ----
app.get('/api/career-identity', requireAuth, async (req: Request, res: Response) => {
  try {
    const identity = await getCareerIdentity(req.authUser!.id);
    return res.json({ success: true, identity });
  } catch (error) {
    console.error('Failed to load career identity:', error);
    return res.status(500).json({ error: 'Failed to load career identity' });
  }
});

app.put('/api/career-identity', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const identity = await saveCareerIdentity(req.authUser!.id, {
      whoYouAre: str(body.whoYouAre, 5000) ?? undefined,
      whereYoureGoing: str(body.whereYoureGoing, 5000) ?? undefined,
      why: str(body.why, 5000) ?? undefined,
      whatYoureMissing: str(body.whatYoureMissing, 5000) ?? undefined,
      whatYoureBuilding: str(body.whatYoureBuilding, 5000) ?? undefined,
      howYourePresenting: str(body.howYourePresenting, 5000) ?? undefined,
      whereApplying: str(body.whereApplying, 5000) ?? undefined,
    });
    return res.json({ success: true, identity });
  } catch (error) {
    console.error('Failed to save career identity:', error);
    return res.status(500).json({ error: 'Failed to save career identity' });
  }
});

// ---- Saved roles ----
app.get('/api/saved-roles', requireAuth, async (req: Request, res: Response) => {
  try {
    const roles = await listSavedRoles(req.authUser!.id);
    return res.json({ success: true, roles });
  } catch (error) {
    console.error('Failed to list saved roles:', error);
    return res.status(500).json({ error: 'Failed to load saved roles' });
  }
});

app.post('/api/saved-roles', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const roleId = str(body.roleId, 100);
    if (!roleId) return res.status(400).json({ error: 'roleId is required' });
    const title = str(body.title, 200);
    if (!title) return res.status(400).json({ error: 'Title is required' });
    const role = await createSavedRole(req.authUser!.id, {
      roleId,
      title,
      category: str(body.category, 100) ?? undefined,
      level: str(body.level, 30) ?? undefined,
      payload: body.payload ?? null,
    });
    return res.status(201).json({ success: true, role });
  } catch (error) {
    console.error('Failed to save role:', error);
    return res.status(500).json({ error: 'Failed to save role' });
  }
});

app.delete('/api/saved-roles/:roleId', requireAuth, async (req: Request, res: Response) => {
  try {
    const roleId = str(req.params.roleId, 100);
    if (!roleId) return res.status(400).json({ error: 'Invalid roleId' });
    const deleted = await deleteSavedRole(req.authUser!.id, roleId);
    if (!deleted) return res.status(404).json({ error: 'Saved role not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete saved role:', error);
    return res.status(500).json({ error: 'Failed to delete saved role' });
  }
});

// ---- Job applications ----
app.get('/api/job-applications', requireAuth, async (req: Request, res: Response) => {
  try {
    const applications = await listJobApplications(req.authUser!.id);
    return res.json({ success: true, applications });
  } catch (error) {
    console.error('Failed to list job applications:', error);
    return res.status(500).json({ error: 'Failed to load job applications' });
  }
});

app.get('/api/job-applications/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const application = await getJobApplication(req.authUser!.id, req.params.id);
    if (!application) return res.status(404).json({ error: 'Application not found' });
    return res.json({ success: true, application });
  } catch (error) {
    console.error('Failed to get job application:', error);
    return res.status(500).json({ error: 'Failed to load job application' });
  }
});

app.post('/api/job-applications', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const company = str(body.company, 200);
    if (!company) return res.status(400).json({ error: 'Company is required' });
    const role = str(body.role, 200);
    if (!role) return res.status(400).json({ error: 'Role is required' });
    const stage = str(body.stage, 30);
    if (stage && !APPLICATION_STAGES.includes(stage as (typeof APPLICATION_STAGES)[number])) {
      return res.status(400).json({ error: 'Invalid stage' });
    }
    const appliedDate = str(body.appliedDate, 40);
    if (appliedDate && Number.isNaN(new Date(appliedDate).getTime())) {
      return res.status(400).json({ error: 'Invalid appliedDate' });
    }
    const nextActionDate = str(body.nextActionDate, 40);
    if (nextActionDate && Number.isNaN(new Date(nextActionDate).getTime())) {
      return res.status(400).json({ error: 'Invalid nextActionDate' });
    }
    const application = await createJobApplication(req.authUser!.id, {
      jobId: str(body.jobId, 100) ?? undefined,
      company,
      role,
      location: str(body.location, 200) ?? undefined,
      workMode: str(body.workMode, 50) ?? undefined,
      stage: (stage ?? undefined) as (typeof APPLICATION_STAGES)[number] | undefined,
      appliedDate: appliedDate ?? undefined,
      nextAction: str(body.nextAction, 500) ?? undefined,
      nextActionDate: nextActionDate ?? undefined,
      notes: str(body.notes, 20000) ?? undefined,
      salaryDiscussed: str(body.salaryDiscussed, 100) ?? undefined,
      interviewStageDetails: str(body.interviewStageDetails, 500) ?? undefined,
    });
    return res.status(201).json({ success: true, application });
  } catch (error) {
    console.error('Failed to create job application:', error);
    return res.status(500).json({ error: 'Failed to create job application' });
  }
});

app.patch('/api/job-applications/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const body = req.body ?? {};
    const stage = str(body.stage, 30);
    if (stage && !APPLICATION_STAGES.includes(stage as (typeof APPLICATION_STAGES)[number])) {
      return res.status(400).json({ error: 'Invalid stage' });
    }
    const application = await updateJobApplication(req.authUser!.id, req.params.id, {
      jobId: body.jobId === null ? undefined : (str(body.jobId, 100) ?? undefined),
      company: str(body.company, 200) ?? undefined,
      role: str(body.role, 200) ?? undefined,
      location: body.location === null ? undefined : (str(body.location, 200) ?? undefined),
      workMode: body.workMode === null ? undefined : (str(body.workMode, 50) ?? undefined),
      stage: (stage ?? undefined) as (typeof APPLICATION_STAGES)[number] | undefined,
      appliedDate: str(body.appliedDate, 40) ?? undefined,
      nextAction: body.nextAction === null ? undefined : (str(body.nextAction, 500) ?? undefined),
      nextActionDate: str(body.nextActionDate, 40) ?? undefined,
      notes: body.notes === null ? undefined : (str(body.notes, 20000) ?? undefined),
      salaryDiscussed:
        body.salaryDiscussed === null ? undefined : (str(body.salaryDiscussed, 100) ?? undefined),
      interviewStageDetails:
        body.interviewStageDetails === null
          ? undefined
          : (str(body.interviewStageDetails, 500) ?? undefined),
    });
    if (!application) return res.status(404).json({ error: 'Application not found' });
    return res.json({ success: true, application });
  } catch (error) {
    console.error('Failed to update job application:', error);
    return res.status(500).json({ error: 'Failed to update job application' });
  }
});

app.delete('/api/job-applications/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const deleted = await deleteJobApplication(req.authUser!.id, req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Application not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete job application:', error);
    return res.status(500).json({ error: 'Failed to delete job application' });
  }
});

// ---- Interview sessions ----
app.get('/api/interviews', requireAuth, async (req: Request, res: Response) => {
  try {
    const sessions = await listInterviewSessions(req.authUser!.id);
    return res.json({ success: true, sessions });
  } catch (error) {
    console.error('Failed to list interview sessions:', error);
    return res.status(500).json({ error: 'Failed to load interview sessions' });
  }
});

app.get('/api/interviews/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const session = await getInterviewSession(req.authUser!.id, req.params.id);
    if (!session) return res.status(404).json({ error: 'Interview session not found' });
    return res.json({ success: true, session });
  } catch (error) {
    console.error('Failed to get interview session:', error);
    return res.status(500).json({ error: 'Failed to load interview session' });
  }
});

app.post('/api/interviews', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const question = str(body.question, 20000);
    if (!question) return res.status(400).json({ error: 'Question is required' });
    const type = str(body.type, 30);
    if (type && !INTERVIEW_TYPES.includes(type as (typeof INTERVIEW_TYPES)[number])) {
      return res.status(400).json({ error: 'Invalid type' });
    }
    const session = await createInterviewSession(req.authUser!.id, {
      roleTitle: str(body.roleTitle, 200) ?? undefined,
      type: (type ?? undefined) as (typeof INTERVIEW_TYPES)[number] | undefined,
      question,
      userAnswer: str(body.userAnswer, 20000) ?? undefined,
      aiFeedback: body.aiFeedback ?? null,
    });
    return res.status(201).json({ success: true, session });
  } catch (error) {
    console.error('Failed to create interview session:', error);
    return res.status(500).json({ error: 'Failed to create interview session' });
  }
});

app.patch('/api/interviews/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const body = req.body ?? {};
    const type = str(body.type, 30);
    if (type && !INTERVIEW_TYPES.includes(type as (typeof INTERVIEW_TYPES)[number])) {
      return res.status(400).json({ error: 'Invalid type' });
    }
    const session = await updateInterviewSession(req.authUser!.id, req.params.id, {
      roleTitle: body.roleTitle === null ? undefined : (str(body.roleTitle, 200) ?? undefined),
      type: (type ?? undefined) as (typeof INTERVIEW_TYPES)[number] | undefined,
      question: str(body.question, 20000) ?? undefined,
      userAnswer: body.userAnswer === null ? undefined : (str(body.userAnswer, 20000) ?? undefined),
      aiFeedback: body.aiFeedback ?? undefined,
    });
    if (!session) return res.status(404).json({ error: 'Interview session not found' });
    return res.json({ success: true, session });
  } catch (error) {
    console.error('Failed to update interview session:', error);
    return res.status(500).json({ error: 'Failed to update interview session' });
  }
});

app.delete('/api/interviews/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const deleted = await deleteInterviewSession(req.authUser!.id, req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Interview session not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete interview session:', error);
    return res.status(500).json({ error: 'Failed to delete interview session' });
  }
});
// ============================================================
// B.3.7.1 — Roadmap (dedicated endpoints; the roadmap tables are the
// source of truth, not the aggregate /api/state payload).
// ============================================================
app.get('/api/roadmap', requireAuth, async (req: Request, res: Response) => {
  try {
    const roadmaps = await listRoadmaps(req.authUser!.id);
    return res.json({ success: true, roadmaps, roadmap: roadmaps[0] ?? null });
  } catch (error) {
    console.error('Failed to load roadmap:', error);
    return res.status(500).json({ error: 'Failed to load roadmap' });
  }
});

app.post('/api/roadmap', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const title = str(body.title, 200);
    if (!title) return res.status(400).json({ error: 'Title is required' });

    // The whole roadmap tree may be sent in one call: phases -> milestones ->
    // tasks. It is written bottom-up so every foreign key is satisfied, and
    // the returned roadmap carries the REAL database ids.
    //
    // A profile has at most one roadmap (UNIQUE profile_id), so creating one
    // always REPLACES the previous roadmap — otherwise the insert would
    // violate the unique constraint. The replacement happens in both branches.
    const phases = parseRoadmapTree(body.phases);

    const roadmap = await createRoadmapWithTree(req.authUser!.id, {
      title,
      targetRoleTitle: str(body.targetRoleTitle, 200) ?? undefined,
      isEnrolled: typeof body.isEnrolled === 'boolean' ? body.isEnrolled : undefined,
      phases,
    });

    return res.status(201).json({ success: true, roadmap });
  } catch (error) {
    console.error('Failed to create roadmap:', error);
    return res.status(500).json({ error: 'Failed to create roadmap' });
  }
});

// ---------------------------------------------------------------------------
// Personalised roadmap.
//
// The plan is generated on the server from the user's target role and their
// own skill ratings, then persisted so progress survives a reload. The
// generator lives in shared/roadmapGenerator.ts; this route only does I/O.
// ---------------------------------------------------------------------------
app.get('/api/roadmap/personalized', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await getOrRefreshRoadmap(req.authUser!.id);
    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Choose a target role to generate a roadmap',
        code: 'no_target_role',
      });
    }
    return res.json({
      success: true,
      roadmap: result.roadmap,
      plan: result.plan,
      regenerated: result.regenerated,
    });
  } catch (error) {
    console.error('Failed to build the personalised roadmap:', error);
    return res.status(500).json({ error: 'Failed to build the roadmap' });
  }
});

app.post('/api/roadmap/generate', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await generateAndPersistRoadmap(req.authUser!.id, {
      isEnrolled: typeof req.body?.isEnrolled === 'boolean' ? req.body.isEnrolled : undefined,
    });
    return res.json({
      success: true,
      roadmap: result.roadmap,
      plan: result.plan,
    });
  } catch (error) {
    if (error instanceof RoadmapGenerationError) {
      const status = error.code === 'no_target_role' ? 400 : 422;
      return res.status(status).json({ success: false, error: error.message, code: error.code });
    }
    console.error('Failed to regenerate the roadmap:', error);
    return res.status(500).json({ error: 'Failed to regenerate the roadmap' });
  }
});

// The skill gap picture for the user's target role, with priorities.
app.get('/api/skill-gaps', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await getSkillGapSummary(req.authUser!.id);
    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Choose a target role to see your skill gaps',
        code: 'no_target_role',
      });
    }
    return res.json({ success: true, ...result });
  } catch (error) {
    console.error('Failed to compute skill gaps:', error);
    return res.status(500).json({ error: 'Failed to compute skill gaps' });
  }
});

// A preview of the plan without writing anything, so the UI can show what
// would change before the user commits to it.
app.get('/api/roadmap/preview', requireAuth, async (req: Request, res: Response) => {
  try {
    const plan = await buildPersonalizedPlan(req.authUser!.id);
    return res.json({ success: true, plan });
  } catch (error) {
    if (error instanceof RoadmapGenerationError) {
      return res.status(400).json({ success: false, error: error.message, code: error.code });
    }
    console.error('Failed to preview the roadmap:', error);
    return res.status(500).json({ error: 'Failed to preview the roadmap' });
  }
});

app.post('/api/roadmap/enroll', requireAuth, async (req: Request, res: Response) => {
  try {
    const roadmap = await enrollInRoadmap(req.authUser!.id);
    if (!roadmap) return res.status(404).json({ error: 'No roadmap to enroll in' });
    return res.json({ success: true, roadmap });
  } catch (error) {
    console.error('Failed to enroll in roadmap:', error);
    return res.status(500).json({ error: 'Failed to enroll in roadmap' });
  }
});

app.patch('/api/roadmap/tasks/:taskId', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.taskId)) return res.status(400).json({ error: 'Invalid id' });
    const status = str(req.body?.status, 30) as RoadmapTaskStatus | null;
    if (!status || !ROADMAP_TASK_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const updated = await updateTaskStatus(req.authUser!.id, req.params.taskId, status);
    if (!updated) return res.status(404).json({ error: 'Task not found' });
    const roadmaps = await listRoadmaps(req.authUser!.id);
    return res.json({ success: true, roadmaps, roadmap: roadmaps[0] ?? null });
  } catch (error) {
    console.error('Failed to update roadmap task:', error);
    return res.status(500).json({ error: 'Failed to update roadmap task' });
  }
});

app.post(
  '/api/roadmap/phases/:phaseId/milestones/:milestoneId/tasks',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      if (!isUuid(req.params.phaseId)) return res.status(400).json({ error: 'Invalid phase id' });
      if (!isUuid(req.params.milestoneId))
        return res.status(400).json({ error: 'Invalid milestone id' });
      const body = req.body ?? {};
      const title = str(body.title, 200);
      if (!title) return res.status(400).json({ error: 'Title is required' });
      const status = str(body.status, 30) as RoadmapTaskStatus | null;
      if (status && !ROADMAP_TASK_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      const task = await addTask(
        req.authUser!.id,
        req.params.phaseId,
        req.params.milestoneId,
        {
          title,
          description: str(body.description, 5000) ?? undefined,
          status: status ?? undefined,
          skillId: str(body.skillId, 40) ?? undefined,
          skillName: str(body.skillName, 200) ?? undefined,
          deadline: str(body.deadline, 40) ?? undefined,
          resourceId: str(body.resourceId, 100) ?? undefined,
          resourceTitle: str(body.resourceTitle, 200) ?? undefined,
          evidenceId: str(body.evidenceId, 40) ?? undefined,
          estimatedHours:
            typeof body.estimatedHours === 'number' && Number.isInteger(body.estimatedHours)
              ? body.estimatedHours
              : undefined,
        }
      );
      if (!task) return res.status(404).json({ error: 'Milestone not found' });
      return res.status(201).json({ success: true, task });
    } catch (error) {
      console.error('Failed to add roadmap task:', error);
      return res.status(500).json({ error: 'Failed to add roadmap task' });
    }
  }
);

app.delete('/api/roadmap', requireAuth, async (req: Request, res: Response) => {
  try {
    const deleted = await deleteRoadmap(req.authUser!.id);
    if (!deleted) return res.status(404).json({ error: 'No roadmap found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete roadmap:', error);
    return res.status(500).json({ error: 'Failed to delete roadmap' });
  }
});

// ============================================================
// B.3.7.1 — Dedicated profile API (replaces the aggregate /api/state for the
// profile; ownership is always the verified Supabase user id).
// ============================================================
app.get('/api/profile', requireAuth, async (req: Request, res: Response) => {
  try {
    const profile = await getProfileDto(req.authUser!.id);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    return res.json({ success: true, profile });
  } catch (error) {
    console.error('Failed to load profile:', error);
    return res.status(500).json({ error: 'Failed to load profile' });
  }
});

// Centralized Career Context Aggregation
app.get('/api/career-context', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.authUser!.id;
    const [
      profile,
      preferences,
      roadmap,
      skills,
      experiences,
      educations,
      projects,
      evidence,
      certifications,
      applications,
      learningItems,
    ] = await Promise.all([
      getProfileDto(userId),
      getPreferences(userId).catch(() => null),
      listRoadmaps(userId).catch(() => []),
      getUserSkills(userId).catch(() => []),
      listExperiences(userId).catch(() => []),
      listEducations(userId).catch(() => []),
      listProjects(userId).catch(() => []),
      listEvidence(userId).catch(() => []),
      listCertifications(userId).catch(() => []),
      listJobApplications(userId).catch(() => []),
      listLearningItems(userId).catch(() => []),
    ]);

    return res.json({
      success: true,
      context: {
        profile,
        careerGoal: profile?.careerGoal || null,
        targetRole: profile?.targetRole || null,
        skills,
        experience: experiences,
        education: educations,
        projects,
        evidence,
        certifications,
        roadmap,
        learningProgress: learningItems,
        preferences,
        applications,
      },
    });
  } catch (error) {
    console.error('Failed to load career context:', error);
    return res.status(500).json({ error: 'Failed to load career context' });
  }
});

app.patch('/api/profile', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const userType = str(body.userType, 30);
    // B.4 finding H-4: this allow-list must match the CareerState vocabulary
    // in src/types/career.ts. It previously listed 'graduate', 'working' and
    // 'career_shift', none of which the onboarding UI can produce, so every
    // onboarding submission was rejected with 400.
    if (
      userType &&
      ![
        'student',
        'fresh_graduate',
        'working_professional',
        'career_switcher',
        'exploring',
      ].includes(userType)
    ) {
      return res.status(400).json({ error: 'Invalid userType' });
    }

    const isAvatarId =
      typeof body.avatarUrl === 'string' && /^avatar-[0-9]{2}$/.test(body.avatarUrl.trim());
    const avatarUrl =
      body.avatarUrl === undefined || body.avatarUrl === null
        ? { valid: true, value: undefined }
        : isAvatarId
          ? { valid: true, value: body.avatarUrl.trim() }
          : parseHttpUrl(body.avatarUrl, 1000);
    if (!avatarUrl.valid) {
      return res.status(400).json({ error: 'avatarUrl must be a valid avatar ID or http(s) URL' });
    }

    // The public URL uses the username verbatim, so keep it to the documented
    // vocabulary and length instead of trusting the client-side input filter.
    let username: string | undefined;
    if (body.username !== undefined && body.username !== null) {
      const candidate = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
      if (!/^[a-z0-9_-]{3,30}$/.test(candidate)) {
        return res
          .status(400)
          .json({ error: 'Username must be 3-30 lowercase letters, numbers, hyphens or underscores' });
      }
      username = candidate;
    }

    // Professional links are rendered as clickable hrefs, including on the
    // public profile, so every non-empty value must be an absolute http(s) URL.
    // An empty string is meaningful: it removes that kind.
    let sanitizedLinks: Record<string, string> | undefined;
    if (body.links !== undefined) {
      if (!body.links || typeof body.links !== 'object' || Array.isArray(body.links)) {
        return res.status(400).json({ error: 'links must be an object' });
      }
      sanitizedLinks = {};
      for (const [kind, raw] of Object.entries(body.links as Record<string, unknown>)) {
        if (raw === undefined || raw === null || raw === '') {
          sanitizedLinks[kind] = '';
          continue;
        }
        const parsed = parseHttpUrl(raw, 1000);
        if (!parsed.valid || !parsed.value) {
          return res.status(400).json({ error: `links.${kind} must be an http(s) URL` });
        }
        sanitizedLinks[kind] = parsed.value;
      }
    }

    // The target role is a hierarchical selection: level 1 is a career domain
    // and level 2 is a specialisation (a catalogue role). The pair is
    // validated HERE, on the server, so an unknown domain, an unknown
    // specialisation or a specialisation from another domain can never be
    // stored — regardless of what the client sent.
    const targetRoleWrite = resolveTargetRoleWrite({
      domainId: body.targetRoleDomain,
      roleId: body.targetRoleId,
      title: body.targetRole,
    });
    if (!targetRoleWrite.ok) {
      return res
        .status(targetRoleWrite.status)
        .json({ error: targetRoleWrite.error, code: targetRoleWrite.code });
    }
    // The canonical title is what is persisted. The parent domain is stored
    // next to it so the hierarchy survives a logout/login, and it is only
    // written when the caller did not state an industry of its own.
    const explicitIndustry = body.targetIndustry !== undefined;
    const targetRoleTitle = targetRoleWrite.value?.title;
    const targetIndustry =
      targetRoleWrite.value && !explicitIndustry
        ? targetRoleWrite.value.domainLabel
        : body.targetIndustry === null
          ? undefined
          : (str(body.targetIndustry, 200) ?? undefined);

    const profile = await updateProfileDto(req.authUser!.id, {
      fullName: str(body.fullName, 200) ?? undefined,
      preferredName:
        body.preferredName === null ? undefined : (str(body.preferredName, 200) ?? undefined),
      username,
      avatarUrl: avatarUrl.value,
      phone: body.phone === null ? undefined : (str(body.phone, 60) ?? undefined),
      location: body.location === null ? undefined : (str(body.location, 200) ?? undefined),
      city: body.city === null ? undefined : (str(body.city, 100) ?? undefined),
      country: body.country === null ? undefined : (str(body.country, 100) ?? undefined),
      timezone: body.timezone === null ? undefined : (str(body.timezone, 100) ?? undefined),
      currentTitle: body.currentTitle === null ? undefined : (str(body.currentTitle, 200) ?? undefined),
      currentPosition:
        body.currentPosition === null ? undefined : (str(body.currentPosition, 200) ?? undefined),
      currentCompany:
        body.currentCompany === null ? undefined : (str(body.currentCompany, 200) ?? undefined),
      yearsOfExperience:
        body.yearsOfExperience === null
          ? undefined
          : (str(body.yearsOfExperience, 50) ?? undefined),
      headline: body.headline === null ? undefined : (str(body.headline, 300) ?? undefined),
      bio: body.bio === null ? undefined : (str(body.bio, 20000) ?? undefined),
      professionalSummary:
        body.professionalSummary === null
          ? undefined
          : (str(body.professionalSummary, 20000) ?? undefined),
      careerGoal: body.careerGoal === null ? undefined : (str(body.careerGoal, 2000) ?? undefined),
      customGoalText:
        body.customGoalText === null ? undefined : (str(body.customGoalText, 2000) ?? undefined),
      targetRole: targetRoleTitle === undefined ? undefined : targetRoleTitle,
      targetIndustry,
      userType: (userType ?? undefined) as string | undefined,
      onboardingCompleted:
        typeof body.onboardingCompleted === 'boolean' ? body.onboardingCompleted : undefined,
      // The status is validated against the shared vocabulary rather than
      // stored verbatim, so an unknown value can never reach the database.
      onboardingStatus: isOnboardingStatus(body.onboardingStatus)
        ? body.onboardingStatus
        : undefined,
      onboardingStep:
        typeof body.onboardingStep === 'number' &&
        Number.isFinite(body.onboardingStep) &&
        body.onboardingStep >= 0
          ? Math.floor(body.onboardingStep)
          : undefined,
      isPublic: typeof body.isPublic === 'boolean' ? body.isPublic : undefined,
      // The professional links are a keyed set (linkedin, github, ...); they
      // are replaced as a whole so a removed link is actually removed.
      ...(sanitizedLinks ? { links: sanitizedLinks } : {}),
    });
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    return res.json({ success: true, profile });
  } catch (error) {
    console.error('Failed to update profile:', error);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ---- Preferences (the settings that belong to the ACCOUNT) ----
//
// public.user_preferences holds the four settings that belong to the account
// rather than to the browser: the theme, the interface language, the resume
// language and the notification switch. They follow the user to another
// device.
//
// The interface language and the resume language are separate on purpose. The
// interface language decides what the product says; the resume language
// decides what the CV says, and it must never move the interface.
//
// The remaining settings in the interface (the reminder toggles, the AI
// personalisation controls) are per-device UI preferences and deliberately
// stay in local state.
app.get('/api/preferences', requireAuth, async (req: Request, res: Response) => {
  try {
    const preferences = await getPreferences(req.authUser!.id);
    return res.json({
      success: true,
      preferences: preferences
        ? {
            theme: preferences.theme,
            language: preferences.language,
            resumeLanguage: normalizeResumeLanguage(preferences.resume_language),
            notificationsEnabled: preferences.notifications_enabled,
          }
        : null,
    });
  } catch (error) {
    console.error('Failed to load preferences:', error);
    return res.status(500).json({ error: 'Failed to load preferences' });
  }
});

app.patch('/api/preferences', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const updates: {
      theme?: string;
      language?: string;
      resume_language?: string;
      notifications_enabled?: boolean;
    } = {};

    if (body.theme !== undefined) {
      const theme = str(body.theme, 20);
      if (!theme || !['light', 'dark', 'system'].includes(theme)) {
        return res.status(400).json({ error: 'Invalid theme' });
      }
      updates.theme = theme;
    }
    if (body.language !== undefined) {
      const language = str(body.language, 10);
      if (!language || !['en', 'ar'].includes(language)) {
        return res.status(400).json({ error: 'Invalid language' });
      }
      updates.language = language;
    }
    // The resume language is validated against the shared vocabulary rather
    // than against a list written out here, so the two cannot drift apart.
    if (body.resumeLanguage !== undefined) {
      if (!isResumeLanguage(body.resumeLanguage)) {
        return res.status(400).json({ error: 'Invalid resume language' });
      }
      updates.resume_language = body.resumeLanguage;
    }
    if (body.notificationsEnabled !== undefined) {
      if (typeof body.notificationsEnabled !== 'boolean') {
        return res.status(400).json({ error: 'Invalid notificationsEnabled' });
      }
      updates.notifications_enabled = body.notificationsEnabled;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No settings to update' });
    }

    const saved = await upsertPreferences(req.authUser!.id, updates);
    return res.json({
      success: true,
      preferences: {
        theme: saved.theme,
        language: saved.language,
        resumeLanguage: normalizeResumeLanguage(saved.resume_language),
        notificationsEnabled: saved.notifications_enabled,
      },
    });
  } catch (error) {
    console.error('Failed to save preferences:', error);
    return res.status(500).json({ error: 'Failed to save preferences' });
  }
});

// ---- Feedback invitations ----
//
// The feedback form is Google's, and its address is a constant in
// `shared/feedback.ts`. The server never receives the answers: it stores only
// the decision state that implements the frequency policy — when an invitation
// was shown, dismissed or opened, and how many active sessions the account has
// had. See the migration `20261106000002_feedback_invitation_state.sql`.
//
// Only the three events named in the shared vocabulary are accepted, and only
// the four known surfaces count as a source. Any other value is rejected
// rather than stored, so the analytics dimension stays clean.
const feedbackEventRateLimit = rateLimit(30, 60_000, 'feedback');

app.get('/api/feedback', requireAuth, async (req: Request, res: Response) => {
  try {
    const state = await getFeedbackState(req.authUser!.id);
    return res.json({ success: true, state });
  } catch (error) {
    console.error('Failed to load feedback state:', error);
    return res.status(500).json({ error: 'Failed to load feedback state' });
  }
});

app.post('/api/feedback/session', requireAuth, async (req: Request, res: Response) => {
  try {
    const { state, counted } = await registerFeedbackSession(req.authUser!.id);
    return res.json({ success: true, state, counted });
  } catch (error) {
    console.error('Failed to register feedback session:', error);
    return res.status(500).json({ error: 'Failed to register feedback session' });
  }
});

app.post(
  '/api/feedback/event',
  requireAuth,
  feedbackEventRateLimit,
  async (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      if (!isFeedbackEventType(body.type)) {
        return res.status(400).json({ error: 'Invalid feedback event' });
      }
      if (!isFeedbackSource(body.source)) {
        return res.status(400).json({ error: 'Invalid feedback source' });
      }

      const state = await recordFeedbackEvent(
        req.authUser!.id,
        body.type,
        body.source
      );
      return res.json({ success: true, state });
    } catch (error) {
      console.error('Failed to record feedback event:', error);
      return res.status(500).json({ error: 'Failed to record feedback event' });
    }
  }
);

// ---- Live job vacancies ----
//
// Real postings, aggregated from public job boards by the job provider. The
// provider credential stays on this server and is never sent to the browser.
//
// Every vacancy is returned with a match against the candidate's own verified
// skills, so the interface can explain the fit rather than assert it. A
// vacancy whose posting lists no comparable skill returns no score at all
// instead of a flattering default.
const jobSearchRateLimit = rateLimit(20, 60_000, 'jobs');

/** The candidate's own skill names, used to explain a match. */
async function loadCandidateSkillNames(userId: string): Promise<string[]> {
  try {
    const rows = await getUserSkills(userId);
    return rows
      .map((row) => row.skill?.name)
      .filter((name): name is string => typeof name === 'string' && name.trim().length > 0);
  } catch (error) {
    // A failure to read the candidate's skills must not fail the search: the
    // vacancies are still real, only the explanation is missing.
    console.error('Failed to load candidate skills for job matching:', error);
    return [];
  }
}

/** Answers a provider failure with a state the interface can explain. */
function sendJobSearchError(res: Response, error: JobSearchError): void {
  if (error.retryAfterSeconds !== null) {
    res.setHeader('Retry-After', String(error.retryAfterSeconds));
  }
  res.status(error.status).json({
    success: false,
    error: error.message,
    code: error.code,
    retryAfterSeconds: error.retryAfterSeconds,
  });
}

app.get('/api/jobs/search', requireAuth, jobSearchRateLimit, async (req: Request, res: Response) => {
  try {
    if (!isJobSearchConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Live job search is not configured on this server.',
        code: 'not_configured',
      });
    }

    const result = await searchJobs({ ...(req.query as Record<string, unknown>) });
    const candidateSkills = await loadCandidateSkillNames(req.authUser!.id);

    const jobs = result.jobs.map((job: LiveJob) => ({
      job,
      match: matchJobToSkills(job, candidateSkills, CATALOG_SKILL_NAMES),
    }));

    return res.json({
      success: true,
      jobs,
      quota: result.quota,
      cached: result.cached,
      source: JOB_SOURCE_LABEL,
    });
  } catch (error) {
    if (error instanceof JobSearchError) {
      return sendJobSearchError(res, error);
    }
    console.error('Failed to search live jobs:', error);
    return res.status(500).json({ error: 'Failed to search live jobs' });
  }
});

// The provider's identifier for one vacancy.
app.get('/api/jobs/:jobId', requireAuth, jobSearchRateLimit, async (req: Request, res: Response) => {
  try {
    if (!isJobSearchConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Live job search is not configured on this server.',
        code: 'not_configured',
      });
    }

    const jobId = str(req.params.jobId, 120);
    if (!jobId) return res.status(400).json({ error: 'Invalid job id' });

    const job = await getJobDetails(jobId);
    if (!job) return res.status(404).json({ success: false, error: 'Job not found' });

    const candidateSkills = await loadCandidateSkillNames(req.authUser!.id);
    return res.json({
      success: true,
      job,
      match: matchJobToSkills(job, candidateSkills, CATALOG_SKILL_NAMES),
      source: JOB_SOURCE_LABEL,
    });
  } catch (error) {
    if (error instanceof JobSearchError) {
      return sendJobSearchError(res, error);
    }
    console.error('Failed to load job details:', error);
    return res.status(500).json({ error: 'Failed to load job details' });
  }
});

// ---- Job bookmarks ----
//
// A bookmark stores only an opaque external job id, taken from the live feed.
// The owner is always the verified user id.
app.get('/api/bookmarks', requireAuth, async (req: Request, res: Response) => {
  try {
    const bookmarks = await listBookmarks(req.authUser!.id);
    return res.json({ success: true, bookmarks });
  } catch (error) {
    console.error('Failed to load bookmarks:', error);
    return res.status(500).json({ error: 'Failed to load bookmarks' });
  }
});

app.post('/api/bookmarks', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const jobId = str(body.jobId, 100);
    if (!jobId) return res.status(400).json({ error: 'jobId is required' });
    const bookmark = await createBookmark(req.authUser!.id, jobId);
    return res.status(201).json({ success: true, bookmark });
  } catch (error) {
    console.error('Failed to save bookmark:', error);
    return res.status(500).json({ error: 'Failed to save bookmark' });
  }
});

app.delete('/api/bookmarks/:jobId', requireAuth, async (req: Request, res: Response) => {
  try {
    const jobId = str(req.params.jobId, 100);
    if (!jobId) return res.status(400).json({ error: 'Invalid jobId' });
    const deleted = await deleteBookmark(req.authUser!.id, jobId);
    if (!deleted) return res.status(404).json({ error: 'Bookmark not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete bookmark:', error);
    return res.status(500).json({ error: 'Failed to delete bookmark' });
  }
});

// ===========================================================================
// B.5 — AI Learning Hub
// ===========================================================================

const LEARNING_STATUSES: LearningStatus[] = ['saved', 'in_progress', 'completed', 'dismissed'];
const LEARNING_FORMATS: LearningFormat[] = [
  'course',
  'professional_certificate',
  'learning_path',
  'tutorial',
  'video',
  'playlist',
];
const LEARNING_BUDGETS = ['free_only', 'low', 'any'] as const;

// The catalogue is public reference data. It contains no user state and no
// secrets, and is intentionally cacheable.
app.get('/api/learning/catalog', async (_req: Request, res: Response) => {
  try {
    const courses = await listCourses();
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.json({ courses, count: courses.length });
  } catch (error) {
    console.error('Failed to load learning catalogue:', error);
    return res.status(500).json({ error: 'Failed to load learning catalogue' });
  }
});

// Full-featured backend learning search with filtering, sorting, pagination and facets.
app.get('/api/learning/search', async (req: Request, res: Response) => {
  try {
    const {
      q,
      level,
      language,
      format,
      availability,
      provider,
      category,
      roleSlug,
      hasCertificate,
      minDuration,
      maxDuration,
      limit,
      offset,
      sortBy,
      sortOrder,
    } = req.query;

    const params: SearchCoursesParams = {
      q: typeof q === 'string' ? q : undefined,
      level: typeof level === 'string' ? level : undefined,
      language: typeof language === 'string' ? language : undefined,
      format: typeof format === 'string' ? format : undefined,
      availability: typeof availability === 'string' ? availability : undefined,
      provider: typeof provider === 'string' ? provider : undefined,
      category: typeof category === 'string' ? category : undefined,
      roleSlug: typeof roleSlug === 'string' ? roleSlug : undefined,
      hasCertificate: hasCertificate === 'true' ? true : hasCertificate === 'false' ? false : undefined,
      minDuration: minDuration ? Number(minDuration) : undefined,
      maxDuration: maxDuration ? Number(maxDuration) : undefined,
      limit: limit ? Number(limit) : 20,
      offset: offset ? Number(offset) : 0,
      sortBy: typeof sortBy === 'string' ? (sortBy as any) : undefined,
      sortOrder: typeof sortOrder === 'string' ? (sortOrder as any) : undefined,
    };

    const result = await searchCourses(params);
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.json(result);
  } catch (error) {
    console.error('Failed to search learning catalogue:', error);
    return res.status(500).json({ error: 'Failed to search learning catalogue' });
  }
});

// The user's own learning state. The owner is always req.authUser.id; a
// profile_id in the request body is ignored.
app.get('/api/learning/items', requireAuth, async (req: Request, res: Response) => {
  try {
    const items = await listLearningItems(req.authUser!.id);
    return res.json({ items });
  } catch (error) {
    console.error('Failed to load learning items:', error);
    return res.status(500).json({ error: 'Failed to load learning items' });
  }
});

app.post('/api/learning/items', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const courseId = str(body.courseId, 120);
    if (!courseId) return res.status(400).json({ error: 'Invalid courseId' });

    const status = str(body.status, 30) as LearningStatus | null;
    if (!status || !LEARNING_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid learning status' });
    }

    const progressPercent =
      body.progressPercent === undefined || body.progressPercent === null
        ? undefined
        : Number(body.progressPercent);
    if (
      progressPercent !== undefined &&
      (!Number.isFinite(progressPercent) || progressPercent < 0 || progressPercent > 100)
    ) {
      return res.status(400).json({ error: 'progressPercent must be between 0 and 100' });
    }

    const notes =
      body.notes === null ? null : (str(body.notes, 2000) ?? undefined);
    if (body.notes !== undefined && body.notes !== null && notes === undefined) {
      return res.status(400).json({ error: 'notes is too long' });
    }
    const recommendationReason =
      body.recommendationReason === null
        ? null
        : (str(body.recommendationReason, 1000) ?? undefined);

    const course = await getCourse(courseId);
    if (!course) return res.status(404).json({ error: 'Course not found' });

    const item = await upsertLearningItem(req.authUser!.id, {
      courseId,
      status,
      progressPercent: progressPercent === undefined ? undefined : Math.round(progressPercent),
      notes,
      recommendationReason,
    });
    return res.status(201).json({ success: true, item });
  } catch (error) {
    console.error('Failed to save learning item:', error);
    return res.status(500).json({ error: 'Failed to save learning item' });
  }
});

app.patch('/api/learning/items/:courseId', requireAuth, async (req: Request, res: Response) => {
  try {
    const courseId = str(req.params.courseId, 120);
    if (!courseId) return res.status(400).json({ error: 'Invalid courseId' });
    const body = req.body ?? {};

    const status =
      body.status === undefined ? undefined : (str(body.status, 30) as LearningStatus | null);
    if (body.status !== undefined && (!status || !LEARNING_STATUSES.includes(status))) {
      return res.status(400).json({ error: 'Invalid learning status' });
    }

    const progressPercent =
      body.progressPercent === undefined || body.progressPercent === null
        ? undefined
        : Number(body.progressPercent);
    if (
      progressPercent !== undefined &&
      (!Number.isFinite(progressPercent) || progressPercent < 0 || progressPercent > 100)
    ) {
      return res.status(400).json({ error: 'progressPercent must be between 0 and 100' });
    }

    const notes =
      body.notes === null ? null : (str(body.notes, 2000) ?? undefined);
    if (body.notes !== undefined && body.notes !== null && notes === undefined) {
      return res.status(400).json({ error: 'notes is too long' });
    }
    const recommendationReason =
      body.recommendationReason === null
        ? null
        : (str(body.recommendationReason, 1000) ?? undefined);

    const item = await updateLearningItem(req.authUser!.id, courseId, {
      status: status ?? undefined,
      progressPercent: progressPercent === undefined ? undefined : Math.round(progressPercent),
      notes,
      recommendationReason,
    });
    if (!item) return res.status(404).json({ error: 'Learning item not found' });
    return res.json({ success: true, item });
  } catch (error) {
    console.error('Failed to update learning item:', error);
    return res.status(500).json({ error: 'Failed to update learning item' });
  }
});

app.delete('/api/learning/items/:courseId', requireAuth, async (req: Request, res: Response) => {
  try {
    const courseId = str(req.params.courseId, 120);
    if (!courseId) return res.status(400).json({ error: 'Invalid courseId' });
    const deleted = await deleteLearningItem(req.authUser!.id, courseId);
    if (!deleted) return res.status(404).json({ error: 'Learning item not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete learning item:', error);
    return res.status(500).json({ error: 'Failed to delete learning item' });
  }
});

/**
 * Deterministic recommendations plus an optional AI explanation layer.
 *
 * The request may carry presentation preferences only. Career data comes from
 * the authenticated user's persisted profile, skills, roadmap and learning
 * state, and the AI only sees the already-ranked candidates.
 */
app.post('/api/learning/recommendations', requireAuth, aiRateLimit, requireCredits('learning_recommendation'), async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};

    const weeklyHoursRaw = body.weeklyHours;
    const weeklyHours =
      weeklyHoursRaw === undefined || weeklyHoursRaw === null ? undefined : Number(weeklyHoursRaw);
    if (weeklyHours !== undefined && (!Number.isFinite(weeklyHours) || weeklyHours < 1 || weeklyHours > 40)) {
      return res.status(400).json({ error: 'weeklyHours must be between 1 and 40' });
    }

    const budget = body.budget === undefined ? undefined : str(body.budget, 20);
    if (budget !== undefined && !LEARNING_BUDGETS.includes(budget as (typeof LEARNING_BUDGETS)[number])) {
      return res.status(400).json({ error: 'Invalid budget preference' });
    }

    const preferredFormat =
      body.preferredFormat === undefined ? undefined : str(body.preferredFormat, 40);
    if (
      preferredFormat !== undefined &&
      preferredFormat !== 'any' &&
      !LEARNING_FORMATS.includes(preferredFormat as LearningFormat)
    ) {
      return res.status(400).json({ error: 'Invalid learning format preference' });
    }

    const language = body.language === undefined ? undefined : str(body.language, 5);
    if (language !== undefined && language !== 'en' && language !== 'ar') {
      return res.status(400).json({ error: 'language must be en or ar' });
    }

    // The AI explanation language is an explicit choice. An unknown code is
    // normalised rather than rejected, because a stale browser preference must
    // never make the Learning Hub unusable.
    const aiLanguage =
      body.aiLanguage === undefined ? undefined : normalizeAiLanguage(body.aiLanguage);

    const limitRaw = body.limit;
    const limit = limitRaw === undefined || limitRaw === null ? undefined : Number(limitRaw);
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 20)) {
      return res.status(400).json({ error: 'limit must be between 1 and 20' });
    }

    const built = await buildLearningContext(req.authUser!.id, {
      targetRoleId: str(body.targetRoleId, 120) ?? undefined,
      targetRoleTitle: str(body.targetRoleTitle, 200) ?? undefined,
      language: language as 'en' | 'ar' | undefined,
      aiLanguage,
      preferredFormat: preferredFormat as LearningFormat | 'any' | undefined,
      weeklyHours,
      budget: budget as (typeof LEARNING_BUDGETS)[number] | undefined,
      focusSkill: str(body.focusSkill, 80) ?? undefined,
      limit,
    });

    const deterministic = rankCourses(built.courses, built.context, { limit: built.limit });
    let result;
    if (body.ai === false) {
      result = {
        recommendations: deterministic,
        ...selectNextStep(deterministic, built.context),
        aiUsed: false,
        aiFallbackReason: null,
        generatedAt: new Date().toISOString(),
      };
    } else {
      // The AI enrichment is optional: the deterministic ranking is always
      // returned. It still draws on the daily budget, so it cannot be used to
      // drain the project's allowance.
      const aiBudget = tryConsumeAiBudget(req.authUser!.id);
      result = await enrichRecommendationsWithAi(deterministic, built.context, {
        ai:
          isAnyAiConfigured() && aiBudget ? universalAi : null,
        model: getGeminiModel(),
      });
    }

    return res.json({
      ...result,
      context: {
        careerGoal: built.context.careerGoal,
        targetRoleSlug: built.context.targetRole?.slug ?? null,
        targetRoleTitle: built.context.targetRole?.title ?? null,
        experienceLevel: built.context.experienceLevel,
        weeklyHours: built.context.weeklyHours,
        budget: built.context.budget,
        preferredFormat: built.context.preferredFormat,
        skillGapCount: built.context.userSkills.filter((skill) => skill.gap > 0).length,
        roadmapSkillCount: built.context.roadmapSkills.length,
      },
    });
  } catch (error) {
    console.error('Failed to generate learning recommendations:', error);
    return res.status(500).json({ error: 'Failed to generate learning recommendations' });
  }
});

/* ========================================================================== */
/* Admin hierarchy and Admin Communication Center                             */
/* ========================================================================== */

function adminFailure(res: Response, error: unknown) {
  if (error instanceof AdminError) {
    return res.status(error.status).json({ error: error.message });
  }
  console.error('Admin request failed:', error);
  return res.status(500).json({ error: 'The administrative request failed' });
}

// The signed-in caller's own admin row. A normal user gets `admin: null`; this
// is what the shell uses to decide whether the Admin Center exists for them.
app.get('/api/admin/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const admin = await getAdminByProfileId(req.authUser!.id);
    return res.json({ success: true, admin });
  } catch (error) {
    return adminFailure(res, error);
  }
});

app.get(
  '/api/admin/analytics',
  requireAuth,
  requireAdmin,
  requirePermission('analytics.read'),
  async (_req: Request, res: Response) => {
    try {
      const analytics = await getAdminAnalytics();
      return res.json({ success: true, analytics });
    } catch (error) {
      return adminFailure(res, error);
    }
  }
);

// The traffic report. It reads the Google Analytics property through the Data
// API, which authenticates with a service account held on the server. When
// those credentials are not configured the endpoint still answers, with
// `connected: false` and the reason — the dashboard then explains how to
// connect rather than showing an empty page.
app.get(
  '/api/admin/analytics/traffic',
  requireAuth,
  requireAdmin,
  requirePermission('analytics.read'),
  async (_req: Request, res: Response) => {
    try {
      const traffic = await fetchTrafficReport();
      return res.json({ success: true, traffic });
    } catch (error) {
      return adminFailure(res, error);
    }
  }
);

/* ------------------------------ Administrators ---------------------------- */

app.get(
  '/api/admin/admins',
  requireAuth,
  requireAdmin,
  requirePermission('admin.manage'),
  async (_req: Request, res: Response) => {
    try {
      return res.json({ success: true, admins: await listAdmins() });
    } catch (error) {
      return adminFailure(res, error);
    }
  }
);

app.post(
  '/api/admin/admins',
  requireAuth,
  requireAdmin,
  requirePermission('admin.manage'),
  async (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      const email = str(body.email, 320);
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'A valid email address is required' });
      }
      const role = str(body.role, 40);
      if (!role || !isAdminRole(role)) {
        return res.status(400).json({ error: 'Unknown admin role' });
      }
      const permissions = stringList(body.permissions, 30, 60);
      const admin = await createAdmin(
        { email, role, permissions },
        req.admin?.profileId ?? null
      );
      await logAdminAction(req.admin!, {
        action: 'admin.created',
        entityType: 'admin_user',
        entityId: admin.id,
        metadata: { email: admin.email, role: admin.role },
      });
      return res.status(201).json({ success: true, admin });
    } catch (error) {
      return adminFailure(res, error);
    }
  }
);

app.patch(
  '/api/admin/admins/:id',
  requireAuth,
  requireAdmin,
  requirePermission('admin.manage'),
  async (req: Request, res: Response) => {
    try {
      const id = str(req.params.id, 80);
      if (!id || !isUuid(id)) return res.status(400).json({ error: 'Invalid administrator id' });
      const body = req.body ?? {};

      const role = body.role === undefined ? undefined : str(body.role, 40);
      if (role !== undefined && (!role || !isAdminRole(role))) {
        return res.status(400).json({ error: 'Unknown admin role' });
      }
      const status = body.status === undefined ? undefined : str(body.status, 20);
      if (status !== undefined && status !== 'active' && status !== 'disabled') {
        return res.status(400).json({ error: 'Unknown admin status' });
      }
      const permissions =
        body.permissions === undefined ? undefined : stringList(body.permissions, 30, 60);
      const fullName =
        body.fullName === null ? null : (str(body.fullName, 160) ?? undefined);

      const admin = await updateAdmin(id, { role, status, permissions, fullName });
      await logAdminAction(req.admin!, {
        action: 'admin.updated',
        entityType: 'admin_user',
        entityId: admin.id,
        metadata: { role: admin.role, status: admin.status },
      });
      return res.json({ success: true, admin });
    } catch (error) {
      return adminFailure(res, error);
    }
  }
);

app.delete(
  '/api/admin/admins/:id',
  requireAuth,
  requireAdmin,
  requirePermission('admin.manage'),
  async (req: Request, res: Response) => {
    try {
      const id = str(req.params.id, 80);
      if (!id || !isUuid(id)) return res.status(400).json({ error: 'Invalid administrator id' });
      await removeAdmin(id);
      await logAdminAction(req.admin!, {
        action: 'admin.removed',
        entityType: 'admin_user',
        entityId: id,
      });
      return res.json({ success: true });
    } catch (error) {
      return adminFailure(res, error);
    }
  }
);

/* ------------------------- Announcement delivery -------------------------- */

app.get(
  '/api/admin/announcements',
  requireAuth,
  requireAdmin,
  requirePermission('announcements.read'),
  async (req: Request, res: Response) => {
    try {
      const announcements = await listAnnouncements({
        status:
          typeof req.query.status === 'string' && isAnnouncementStatus(req.query.status)
            ? (req.query.status as AnnouncementStatus)
            : undefined,
        category:
          typeof req.query.category === 'string' && isAnnouncementCategory(req.query.category)
            ? (req.query.category as AnnouncementCategory)
            : undefined,
        priority:
          typeof req.query.priority === 'string' && isAnnouncementPriority(req.query.priority)
            ? (req.query.priority as AnnouncementPriority)
            : undefined,
        limit: 300,
      });
      return res.json({ success: true, announcements });
    } catch (error) {
      return adminFailure(res, error);
    }
  }
);

function httpUrl(value: unknown, field: string): string | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;
  const text = str(value, 1000);
  if (!text) return null;
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw new AdminError(`${field} must be a complete URL`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new AdminError(`${field} must use http or https`);
  }
  return parsed.toString();
}

function readRules(value: unknown): AudienceRuleGroup[] | undefined {
  if (value === undefined) return undefined;
  try {
    const rules = normaliseAudienceRules(value);
    // An explicitly supplied, non-empty rule list that normalises to nothing
    // (every condition empty or blank) must never silently become "everyone".
    // That is the one direction a malformed audience must not fail in.
    if (Array.isArray(value) && value.length > 0 && rules.length === 0) {
      throw new AdminError('Each targeting group needs at least one non-empty condition');
    }
    return rules;
  } catch (error) {
    throw new AdminError(
      error instanceof Error ? error.message : 'Invalid targeting rules'
    );
  }
}

function readAnnouncementInput(body: Record<string, unknown>, partial: boolean) {
  const title = body.title === undefined ? undefined : (str(body.title, 200) ?? undefined);
  const text = body.body === undefined ? undefined : (str(body.body, 5000) ?? undefined);
  const priority =
    body.priority === undefined ? undefined : (str(body.priority, 20) ?? undefined);
  const category =
    body.category === undefined ? undefined : (str(body.category, 40) ?? undefined);
  const audienceType =
    body.audienceType === undefined ? undefined : (str(body.audienceType, 40) ?? undefined);
  const audienceValues =
    body.audienceValues === undefined ? undefined : stringList(body.audienceValues, 500, 200);
  const audienceRules = readRules(body.audienceRules);
  const linkView =
    body.linkView === null ? null : (str(body.linkView, 120) ?? undefined);

  if (!partial) {
    if (!title) throw new AdminError('A title is required');
    if (!text) throw new AdminError('A message is required');
    if (audienceType !== undefined && (!audienceType || !isAnnouncementAudience(audienceType))) {
      throw new AdminError('A valid audience is required');
    }
    if (!audienceRules && (!audienceType || audienceType === 'all')) {
      // Everyone is a valid audience; no extra value list is needed.
    } else if (!audienceRules && (!audienceType || !isAnnouncementAudience(audienceType))) {
      throw new AdminError('A valid audience is required');
    }
  } else {
    if (body.title !== undefined && !title) throw new AdminError('A title is required');
    if (body.body !== undefined && !text) throw new AdminError('A message is required');
    if (
      audienceType !== undefined &&
      (!audienceType || !isAnnouncementAudience(audienceType))
    ) {
      throw new AdminError('A valid audience is required');
    }
  }

  if (priority !== undefined && (!priority || !isAnnouncementPriority(priority))) {
    throw new AdminError('Unknown announcement priority');
  }
  if (category !== undefined && (!category || !isAnnouncementCategory(category))) {
    throw new AdminError('Unknown announcement category');
  }

  const imageUrl = httpUrl(body.imageUrl, 'Image URL');
  const thumbnailUrl = httpUrl(body.thumbnailUrl, 'Thumbnail URL');
  const ctaUrl = httpUrl(body.ctaUrl, 'CTA URL');
  const ctaText = body.ctaText === null ? null : (str(body.ctaText, 80) ?? undefined);
  const publishAt = body.publishAt === null ? null : (str(body.publishAt, 60) ?? undefined);
  const expiresAt = body.expiresAt === null ? null : (str(body.expiresAt, 60) ?? undefined);

  for (const [value, label] of [
    [publishAt, 'Publish date'],
    [expiresAt, 'Expiration date'],
  ] as const) {
    if (value && !Number.isFinite(new Date(value).getTime())) {
      throw new AdminError(`${label} is not a valid date`);
    }
  }
  if (publishAt && expiresAt && new Date(expiresAt) <= new Date(publishAt)) {
    throw new AdminError('The expiration date must be after the publish date');
  }

  return {
    title,
    body: text,
    priority: priority as AnnouncementPriority | undefined,
    category: category as AnnouncementCategory | undefined,
    audienceType: audienceType as
      | 'all'
      | 'users'
      | 'target_role'
      | 'target_industry'
      | 'user_type'
      | 'country'
      | undefined,
    audienceValues,
    audienceRules,
    linkView,
    imageUrl,
    thumbnailUrl,
    ctaText,
    ctaUrl,
    publishAt,
    expiresAt,
  };
}

app.post(
  '/api/admin/announcements/preview',
  requireAuth,
  requireAdmin,
  requireAnyPermission(['announcements.read', 'announcements.write']),
  async (req: Request, res: Response) => {
    try {
      const input = readAnnouncementInput(req.body ?? {}, true);
      const preview = await previewAnnouncementAudience({
        audienceType: input.audienceType,
        audienceValues: input.audienceValues,
        audienceRules: input.audienceRules,
      });
      return res.json({ success: true, preview });
    } catch (error) {
      return adminFailure(res, error);
    }
  }
);

app.post(
  '/api/admin/announcements/process-due',
  requireAuth,
  requireAdmin,
  requirePermission('announcements.publish'),
  async (req: Request, res: Response) => {
    try {
      const processed = await processDueAnnouncements();
      await logAdminAction(req.admin!, {
        action: 'announcement.scheduler_run',
        entityType: 'announcement',
        metadata: processed,
      });
      return res.json({ success: true, ...processed });
    } catch (error) {
      return adminFailure(res, error);
    }
  }
);

app.post(
  '/api/admin/announcements',
  requireAuth,
  requireAdmin,
  requirePermission('announcements.write'),
  async (req: Request, res: Response) => {
    try {
      const input = readAnnouncementInput(req.body ?? {}, false);
      const announcement = await createAnnouncement(
        {
          title: input.title!,
          body: input.body!,
          priority: input.priority,
          category: input.category,
          audienceType: input.audienceType,
          audienceValues: input.audienceValues,
          audienceRules: input.audienceRules,
          linkView: input.linkView,
          imageUrl: input.imageUrl,
          thumbnailUrl: input.thumbnailUrl,
          ctaText: input.ctaText,
          ctaUrl: input.ctaUrl,
          publishAt: input.publishAt,
          expiresAt: input.expiresAt,
        },
        req.admin!
      );
      await logAdminAction(req.admin!, {
        action: 'announcement.created',
        entityType: 'announcement',
        entityId: announcement.id,
        metadata: { audienceType: announcement.audienceType },
      });
      return res.status(201).json({ success: true, announcement });
    } catch (error) {
      return adminFailure(res, error);
    }
  }
);

app.patch(
  '/api/admin/announcements/:id',
  requireAuth,
  requireAdmin,
  requirePermission('announcements.write'),
  async (req: Request, res: Response) => {
    try {
      const id = str(req.params.id, 80);
      if (!id || !isUuid(id)) return res.status(400).json({ error: 'Invalid announcement id' });
      const input = readAnnouncementInput(req.body ?? {}, true);
      const announcement = await updateAnnouncement(id, input);
      await logAdminAction(req.admin!, {
        action: 'announcement.updated',
        entityType: 'announcement',
        entityId: announcement.id,
      });
      return res.json({ success: true, announcement });
    } catch (error) {
      return adminFailure(res, error);
    }
  }
);

app.post(
  '/api/admin/announcements/:id/publish',
  requireAuth,
  requireAdmin,
  requirePermission('announcements.publish'),
  async (req: Request, res: Response) => {
    try {
      const id = str(req.params.id, 80);
      if (!id || !isUuid(id)) return res.status(400).json({ error: 'Invalid announcement id' });
      const announcement = await publishAnnouncement(id);
      await logAdminAction(req.admin!, {
        action: 'announcement.published',
        entityType: 'announcement',
        entityId: announcement.id,
        metadata: { recipients: announcement.recipientCount },
      });
      return res.json({ success: true, announcement });
    } catch (error) {
      return adminFailure(res, error);
    }
  }
);

app.post(
  '/api/admin/announcements/:id/schedule',
  requireAuth,
  requireAdmin,
  requirePermission('announcements.publish'),
  async (req: Request, res: Response) => {
    try {
      const id = str(req.params.id, 80);
      if (!id || !isUuid(id)) return res.status(400).json({ error: 'Invalid announcement id' });
      const publishAt = str(req.body?.publishAt, 60);
      if (!publishAt) return res.status(400).json({ error: 'A publish date is required' });
      const announcement = await scheduleAnnouncement(id, publishAt);
      await logAdminAction(req.admin!, {
        action: 'announcement.scheduled',
        entityType: 'announcement',
        entityId: announcement.id,
        metadata: { publishAt: announcement.publishAt },
      });
      return res.json({ success: true, announcement });
    } catch (error) {
      return adminFailure(res, error);
    }
  }
);

app.post(
  '/api/admin/announcements/:id/archive',
  requireAuth,
  requireAdmin,
  requirePermission('announcements.publish'),
  async (req: Request, res: Response) => {
    try {
      const id = str(req.params.id, 80);
      if (!id || !isUuid(id)) return res.status(400).json({ error: 'Invalid announcement id' });
      const announcement = await archiveAnnouncement(id);
      await logAdminAction(req.admin!, {
        action: 'announcement.archived',
        entityType: 'announcement',
        entityId: announcement.id,
      });
      return res.json({ success: true, announcement });
    } catch (error) {
      return adminFailure(res, error);
    }
  }
);

app.delete(
  '/api/admin/announcements/:id',
  requireAuth,
  requireAdmin,
  requirePermission('announcements.write'),
  async (req: Request, res: Response) => {
    try {
      const id = str(req.params.id, 80);
      if (!id || !isUuid(id)) return res.status(400).json({ error: 'Invalid announcement id' });
      await deleteAnnouncement(id);
      await logAdminAction(req.admin!, {
        action: 'announcement.deleted',
        entityType: 'announcement',
        entityId: id,
      });
      return res.json({ success: true });
    } catch (error) {
      return adminFailure(res, error);
    }
  }
);

/* ------------------------- Targeting and audit ---------------------------- */

app.get(
  '/api/admin/users',
  requireAuth,
  requireAdmin,
  requireAnyPermission(['users.read', 'announcements.write']),
  async (req: Request, res: Response) => {
    try {
      const query = typeof req.query.query === 'string' ? req.query.query.slice(0, 100) : '';
      return res.json({ success: true, users: await searchProfiles(query) });
    } catch (error) {
      return adminFailure(res, error);
    }
  }
);

app.get(
  '/api/admin/audit',
  requireAuth,
  requireAdmin,
  requirePermission('audit.read'),
  async (req: Request, res: Response) => {
    try {
      const limitRaw = Number(req.query.limit ?? 100);
      const limit = Number.isFinite(limitRaw) ? limitRaw : 100;
      return res.json({ success: true, entries: await listAuditLog(limit) });
    } catch (error) {
      return adminFailure(res, error);
    }
  }
);

// A moderator can report content they reviewed. The report is a real,
// persisted audit entry: it is not a client-side flag, and a Super Admin can
// read it in the audit tab. No report can modify the content itself.
const REPORT_ENTITY_TYPES = ['announcement', 'opportunity', 'course', 'profile', 'other'];

app.post(
  '/api/admin/reports',
  requireAuth,
  requireAdmin,
  requirePermission('moderation.write'),
  async (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      const entityType = str(body.entityType, 40);
      if (!entityType || !REPORT_ENTITY_TYPES.includes(entityType)) {
        return res.status(400).json({ error: 'Unknown report entity type' });
      }
      const reason = str(body.reason, 1000);
      if (!reason) return res.status(400).json({ error: 'A reason is required' });
      const entityId =
        body.entityId === undefined || body.entityId === null
          ? undefined
          : (str(body.entityId, 120) ?? undefined);

      await logAdminAction(req.admin!, {
        action: 'moderation.reported',
        entityType,
        entityId,
        metadata: { reason },
      });
      return res.status(201).json({ success: true });
    } catch (error) {
      return adminFailure(res, error);
    }
  }
);

/* -------------------------- Opportunity review ---------------------------- */

app.get(
  '/api/admin/opportunities',
  requireAuth,
  requireAdmin,
  requirePermission('opportunities.read'),
  async (_req: Request, res: Response) => {
    try {
      return res.json({
        success: true,
        opportunities: await listOpportunitiesForAdmin(),
      });
    } catch (error) {
      return adminFailure(res, error);
    }
  }
);

app.patch(
  '/api/admin/opportunities/:id',
  requireAuth,
  requireAdmin,
  requirePermission('opportunities.write'),
  async (req: Request, res: Response) => {
    try {
      const id = str(req.params.id, 120);
      if (!id) return res.status(400).json({ error: 'Invalid opportunity id' });
      const body = req.body ?? {};

      if (
        body.verificationStatus !== undefined &&
        (!str(body.verificationStatus, 40) ||
          !isOpportunityVerificationStatus(String(body.verificationStatus)))
      ) {
        return res.status(400).json({ error: 'Unknown verification status' });
      }
      if (body.kind !== undefined && !isOpportunityKind(String(body.kind))) {
        return res.status(400).json({ error: 'Unknown opportunity kind' });
      }
      if (
        body.participationMode !== undefined &&
        !isParticipationMode(String(body.participationMode))
      ) {
        return res.status(400).json({ error: 'Unknown participation mode' });
      }
      if (body.deadline !== undefined && body.deadline !== null) {
        const deadline = str(body.deadline, 10);
        if (!deadline || !isIsoDate(deadline)) {
          return res.status(400).json({ error: 'deadline must be an ISO date or null' });
        }
      }

      const audiences =
        body.audiences === undefined
          ? undefined
          : stringList(body.audiences, 10, 40).filter(isOpportunityAudience);
      const tags =
        body.tags === undefined ? undefined : stringList(body.tags, 20, 40);

      const verificationStatus =
        body.verificationStatus === undefined
          ? undefined
          : (String(body.verificationStatus) as
              | 'http'
              | 'pending'
              | 'verified'
              | 'rejected');

      const patch = {
        isActive: typeof body.isActive === 'boolean' ? body.isActive : undefined,
        verificationStatus,
        verifiedAt:
          verificationStatus === 'verified' && body.verifiedAt === undefined
            ? new Date().toISOString()
            : body.verifiedAt === null
              ? null
              : (str(body.verifiedAt, 40) ?? undefined),
        isFeatured:
          typeof body.isFeatured === 'boolean' ? body.isFeatured : undefined,
        deadline: body.deadline === null ? null : (str(body.deadline, 10) ?? undefined),
        kind: body.kind as
          | 'volunteering'
          | 'student_activity'
          | 'youth_program'
          | 'career_development'
          | 'competition'
          | 'entrepreneurship'
          | 'fellowship'
          | 'internship'
          | 'academic'
          | 'technology'
          | undefined,
        participationMode: body.participationMode as
          | 'onsite'
          | 'online'
          | 'hybrid'
          | undefined,
        audiences,
        eligibility:
          body.eligibility === null ? null : (str(body.eligibility, 1000) ?? undefined),
        sourceUrl:
          body.sourceUrl === null ? null : (str(body.sourceUrl, 500) ?? undefined),
        thumbnailUrl:
          body.thumbnailUrl === null ? null : (str(body.thumbnailUrl, 500) ?? undefined),
        organizationType:
          body.organizationType === null
            ? null
            : (str(body.organizationType, 80) ?? undefined),
        tags,
        title: str(body.title, 200) ?? undefined,
        description: str(body.description, 2000) ?? undefined,
        location: str(body.location, 200) ?? undefined,
        commitment:
          body.commitment === null ? null : (str(body.commitment, 200) ?? undefined),
      };

      const opportunity = await updateOpportunityForAdmin(id, patch);
      if (!opportunity) return res.status(404).json({ error: 'Opportunity not found' });
      await logAdminAction(req.admin!, {
        action: 'opportunity.updated',
        entityType: 'opportunity',
        entityId: id,
        metadata: { verificationStatus: opportunity.verificationStatus },
      });
      // The opportunity has a public page. When it is live, the search
      // engines are told that the page changed, so they recrawl it instead of
      // waiting for the next crawl cycle. A failure here never fails the
      // update: the catalogue change has already been saved.
      if (opportunity.live) {
        void submitIndexNow([opportunityPath(id), '/opportunities']);
      }
      return res.json({ success: true, opportunity });
    } catch (error) {
      return adminFailure(res, error);
    }
  }
);

/* ----------------------------- Learning review ---------------------------- */

app.get(
  '/api/admin/learning',
  requireAuth,
  requireAdmin,
  requirePermission('learning.read'),
  async (_req: Request, res: Response) => {
    try {
      return res.json({ success: true, courses: await listCoursesForAdmin() });
    } catch (error) {
      return adminFailure(res, error);
    }
  }
);

app.patch(
  '/api/admin/learning/:id',
  requireAuth,
  requireAdmin,
  requirePermission('learning.write'),
  async (req: Request, res: Response) => {
    try {
      const id = str(req.params.id, 120);
      if (!id) return res.status(400).json({ error: 'Invalid course id' });
      const body = req.body ?? {};

      if (
        body.resourceType !== undefined &&
        body.resourceType !== null &&
        !isLearningResourceType(String(body.resourceType))
      ) {
        return res.status(400).json({ error: 'Unknown resource type' });
      }

      const course = await updateCourseForAdmin(id, {
        resourceType:
          body.resourceType === null
            ? null
            : body.resourceType === undefined
              ? undefined
              : (String(body.resourceType) as
                  | 'video_course'
                  | 'video_playlist'
                  | 'course'
                  | 'article'
                  | 'documentation'
                  | 'pdf'
                  | 'book'
                  | 'workshop'
                  | 'lecture'),
        isFeatured:
          typeof body.isFeatured === 'boolean' ? body.isFeatured : undefined,
        thumbnailUrl:
          body.thumbnailUrl === null ? null : (str(body.thumbnailUrl, 500) ?? undefined),
        description:
          body.description === null ? null : (str(body.description, 2000) ?? undefined),
        hasCertificate:
          typeof body.hasCertificate === 'boolean' ? body.hasCertificate : undefined,
        certificateIncluded:
          typeof body.certificateIncluded === 'boolean'
            ? body.certificateIncluded
            : undefined,
      });
      if (!course) return res.status(404).json({ error: 'Course not found' });
      await logAdminAction(req.admin!, {
        action: 'learning.updated',
        entityType: 'course',
        entityId: id,
        metadata: { isFeatured: course.isFeatured, resourceType: course.resourceType },
      });
      // The course has a public page. The search engines are told that it
      // changed, so they recrawl it. A failed submission never fails the
      // update: the catalogue change has already been saved.
      void submitIndexNow([coursePath(id), '/learning']);
      return res.json({ success: true, course });
    } catch (error) {
      return adminFailure(res, error);
    }
  }
);

/* -------------------------------------------------------------------------- */
/* Subscriptions, Payments & Credits Routes                                   */
/* -------------------------------------------------------------------------- */
registerSubscriptionRoutes(app);


/* -------------------------------------------------------------------------- */
/* Public SEO pages                                                           */
/* -------------------------------------------------------------------------- */
//
// The application routes by hash (`/#/dashboard`), and a fragment is never
// sent to the server. Without these routes a crawler would receive the same
// empty application document for every URL, and there would be nothing to
// index.
//
// The routes below publish the catalogues the platform already owns — the
// career catalogue, the learning catalogue and the volunteering catalogue —
// as clean, server-rendered pages with their own title, description, canonical
// URL, Open Graph tags and structured data.
//
// They are registered here, in the shared Express application, so that the
// local server, the test suite and the deployed Cloudflare Pages worker all
// serve exactly the same pages.
const publicPageHandler = async (req: Request, res: Response) => {
  try {
    const page = await resolvePublicPage(req.path);
    if (!page) {
      // A path that looks like a public page but names nothing. The answer is
      // a real 404, not the application's home document: a soft 404 would tell
      // a crawler that the URL exists and put it into the index.
      res.setHeader('Content-Security-Policy', PUBLIC_PAGE_CSP);
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      return res.status(404).type('html').send(renderNotFoundPage());
    }
    res.setHeader('Content-Security-Policy', PUBLIC_PAGE_CSP);
    res.setHeader(
      'Cache-Control',
      page.status === 503 ? 'no-store' : 'public, max-age=0, must-revalidate'
    );
    if (page.status === 503) res.setHeader('Retry-After', '86400');
    return res.status(page.status).type('html').send(page.html);
  } catch (error) {
    console.error('Public page failed to render:', error);
    return res.status(500).type('html').send(renderNotFoundPage());
  }
};

app.get('/about', publicPageHandler);
app.get('/terms', publicPageHandler);
app.get('/privacy', publicPageHandler);
app.get('/careers', publicPageHandler);
app.get('/careers/:slug', publicPageHandler);
app.get('/learning', publicPageHandler);
app.get('/learning/course/:id', publicPageHandler);
app.get('/learning/category/:slug', publicPageHandler);
app.get('/opportunities', publicPageHandler);
app.get('/opportunities/:id', publicPageHandler);

// The sitemap is generated from the same catalogue the pages are built from,
// so the two can never drift apart.
app.get('/sitemap.xml', async (_req: Request, res: Response) => {
  try {
    const entries = await collectSitemapEntries();
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.type('application/xml').send(buildSitemapXml(entries));
  } catch (error) {
    console.error('Sitemap generation failed:', error);
    return res.status(500).type('text/plain').send('Sitemap unavailable');
  }
});

// robots.txt points at the sitemap and keeps the machine-facing surfaces out
// of the crawler's way. It is a crawl instruction, not an access control —
// every private area is protected by authentication.
app.get('/robots.txt', (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.type('text/plain').send(buildRobotsTxt());
});

// The Search Console verification file.
//
// Google asks for the file at a path that ends in `.html`. The Pages asset
// binding answers that path with a permanent redirect to the same file
// without the extension, and a verification check that does not follow the
// redirect would fail. The application answers the exact path instead.
app.get(VERIFICATION_PATH, (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.type('text/plain').send(verificationFileBody());
});

// Unknown API routes must not fall through to the SPA.
//
// The production build serves index.html for every unmatched path, which is
// the right behaviour for a client-side route but wrong for the API: an
// unknown /api/... path would answer 200 with HTML instead of 404 with JSON.
// This handler runs before the SPA fallback and covers every API path.
app.use('/api', (req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Terminal error handler (B.4 finding H-1).
//
// Express's DEFAULT error handler serialises the thrown error — including
// `err.stack` — into the response body as HTML. A rejected upload therefore
// answered 500 with a full stack trace containing the server's filesystem
// paths. The detail is still logged server-side, but the browser only ever
// receives a generic JSON message.
app.use((err: any, req: Request, res: Response, next: (e?: unknown) => void) => {
  if (res.headersSent) return next(err);

  // Multer's own errors: the file was too large, or the field count / field
  // name was wrong. These are client mistakes, not server faults.
  if (err?.name === 'MulterError') {
    const code = err?.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    const message =
      err?.code === 'LIMIT_FILE_SIZE'
        ? 'File exceeds the maximum size'
        : 'Malformed upload';
    return res.status(code).json({ error: message });
  }

  // A malformed JSON body is rejected by express.json() with a SyntaxError.
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }

  console.error('Unhandled request error:', err);
  return res.status(500).json({ error: 'Internal server error' });
});
