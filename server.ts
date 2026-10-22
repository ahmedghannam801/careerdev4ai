import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';
import { verifySupabaseToken } from './server/auth/supabase-auth.ts';

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
import { requireAuth } from './server/auth/require-auth.ts';
import { getProfile, upsertProfile, findProfileByUsername } from './server/db/profiles.ts';
import { changePassword, changeEmail, deleteAccount } from './server/db/account.ts';
import { saveState, loadState, unmappedStateFields } from './server/db/state.ts';
import { getSupabaseServer } from './server/db/supabase.ts';
import {
  listRoadmaps,
  getRoadmap,
  createRoadmap,
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
  deleteNotification,
  clearNotifications,
  NOTIFICATION_TYPES,
  type NotificationType,
} from './server/db/notifications.ts';
import { getProfileDto, updateProfileDto } from './server/db/profile.ts';
import { getPreferences, upsertPreferences } from './server/db/preferences.ts';
import {
  listBookmarks,
  createBookmark,
  deleteBookmark,
} from './server/db/bookmarks.ts';
import {
  listCourses,
  getCourse,
  listLearningItems,
  upsertLearningItem,
  updateLearningItem,
  deleteLearningItem,
} from './server/db/learning.ts';
import { rankCourses, type LearningFormat, type LearningStatus } from './server/learning/recommendation.ts';
import { enrichRecommendationsWithAi } from './server/learning/ai.ts';
import { buildLearningContext } from './server/learning/context.ts';
import {
  uploadCvFile,
  createCvFileDownloadUrl,
  deleteCvFile,
  listCvFiles,
  pathBelongsToUser,
  extensionForMimeType,
  CV_BUCKET,
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

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Do not advertise the framework.
app.disable('x-powered-by');

// Baseline security headers. A strict Content-Security-Policy is deliberately
// not set here: the app loads Google Fonts and Vite injects inline styles, so a
// policy has to be designed and tested with the production build first.
app.use((_req: Request, res: Response, next: () => void) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

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

// Multer in-memory storage for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Initialize Gemini Client
//
// B.3.9 finding P-3: the key is validated at startup so a missing key is
// reported clearly instead of surfacing as a confusing failure on the first
// AI request. The application still starts — the AI routes are the only ones
// that need the key — but the problem is stated plainly at boot.
if (!process.env.GEMINI_API_KEY) {
  console.warn(
    '[server] GEMINI_API_KEY is not set. The AI routes (/api/copilot, ' +
      '/api/analyze-career, /api/optimize-cv, /api/mock-interview, ' +
      '/api/suggest-summary, /api/generate-cover-letter) will fail until it is configured.'
  );
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
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

// The model is configurable so an operator can move to a newer or more
// available Flash model without editing code. The default remains the model
// the product was validated against.
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash';

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

function validateParsedCvPayload(value: unknown): string[] {
  if (!isJsonObject(value)) return ['response is not an object'];
  const errors: string[] = [];
  for (const key of ['fullName', 'email', 'phone', 'location', 'title', 'summary']) {
    if (typeof value[key] !== 'string') errors.push(key);
  }
  for (const key of ['experiences', 'education', 'projects', 'skillsList', 'certifications']) {
    if (!Array.isArray(value[key])) errors.push(key);
  }
  if (Array.isArray(value.experiences)) {
    value.experiences.forEach((entry, index) => {
      if (!isJsonObject(entry)) {
        errors.push(`experiences[${index}]`);
        return;
      }
      for (const key of ['id', 'company', 'role', 'period', 'location']) {
        if (typeof entry[key] !== 'string') errors.push(`experiences[${index}].${key}`);
      }
      if (!isStringArray(entry.bullets)) errors.push(`experiences[${index}].bullets`);
    });
  }
  if (Array.isArray(value.education)) {
    value.education.forEach((entry, index) => {
      if (!isJsonObject(entry)) {
        errors.push(`education[${index}]`);
        return;
      }
      for (const key of ['id', 'institution', 'degree', 'field', 'period', 'gpa']) {
        if (typeof entry[key] !== 'string') errors.push(`education[${index}].${key}`);
      }
    });
  }
  if (Array.isArray(value.projects)) {
    value.projects.forEach((entry, index) => {
      if (!isJsonObject(entry)) {
        errors.push(`projects[${index}]`);
        return;
      }
      for (const key of ['id', 'title', 'role']) {
        if (typeof entry[key] !== 'string') errors.push(`projects[${index}].${key}`);
      }
      for (const key of ['technologies', 'bullets']) {
        if (!isStringArray(entry[key])) errors.push(`projects[${index}].${key}`);
      }
    });
  }
  return errors;
}

function validateAtsPayload(value: unknown): string[] {
  if (!isJsonObject(value)) return ['response is not an object'];
  const errors: string[] = [];
  if (!isNumberInRange(value.overallScore)) errors.push('overallScore');
  if (!isJsonObject(value.breakdown)) {
    errors.push('breakdown');
  } else {
    for (const key of [
      'keywordsMatch',
      'impactAndMetrics',
      'formattingStructure',
      'experienceRelevance',
    ]) {
      if (!isNumberInRange(value.breakdown[key])) errors.push(`breakdown.${key}`);
    }
  }
  for (const key of ['matchedKeywords', 'missingKeywords']) {
    if (!isStringArray(value[key])) errors.push(key);
  }
  if (!Array.isArray(value.actionableImprovements)) {
    errors.push('actionableImprovements');
  } else {
    value.actionableImprovements.forEach((entry, index) => {
      if (!isJsonObject(entry)) {
        errors.push(`actionableImprovements[${index}]`);
        return;
      }
      for (const key of ['section', 'currentText', 'suggestedText', 'reason']) {
        if (typeof entry[key] !== 'string') {
          errors.push(`actionableImprovements[${index}].${key}`);
        }
      }
    });
  }
  return errors;
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

function validateCoverLetterPayload(value: unknown): string[] {
  if (!isJsonObject(value)) return ['response is not an object'];
  const errors: string[] = [];
  if (typeof value.coverLetter !== 'string' || value.coverLetter.trim().length < 100) {
    errors.push('coverLetter');
  }
  if (!isStringArray(value.keyHighlights)) errors.push('keyHighlights');
  return errors;
}

// Health Check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

// CV Upload Pipeline (POST /api/resumes/upload)
app.post('/api/resumes/upload', requireAuth, upload.single('file'), async (req: Request, res: Response) => {
  try {
    let rawText = '';

    if (req.file) {
      const mime = req.file.mimetype;
      const originalName = req.file.originalname.toLowerCase();

      // Check format
      if (!originalName.endsWith('.pdf') && !originalName.endsWith('.txt') && !originalName.endsWith('.docx') && !originalName.endsWith('.json')) {
        return res.status(400).json({ error: 'Unsupported file type. Please upload a .pdf, .docx, or .txt file.' });
      }

      // Extract text content from buffer
      rawText = req.file.buffer.toString('utf-8');
      // Strip non-printable binary characters if raw PDF
      if (originalName.endsWith('.pdf')) {
        rawText = rawText.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ');
      }
    } else if (req.body.text) {
      rawText = req.body.text;
    } else {
      return res.status(400).json({ error: 'No CV file or text provided' });
    }

    if (!rawText || rawText.length < 20) {
      return res.status(400).json({ error: 'Unable to extract sufficient readable text from the document.' });
    }

    const targetRoleTitle = req.body.targetRoleTitle || 'Software Engineer';

    // Parse CV text using Gemini
    const parsePrompt = `Extract and structure the following CV text into JSON matching this exact schema:
{
  "fullName": string,
  "email": string,
  "phone": string,
  "location": string,
  "title": string,
  "summary": string,
  "experiences": [
    {
      "id": string,
      "company": string,
      "role": string,
      "period": string,
      "location": string,
      "bullets": [string]
    }
  ],
  "education": [
    {
      "id": string,
      "institution": string,
      "degree": string,
      "field": string,
      "period": string,
      "gpa": string
    }
  ],
  "projects": [
    {
      "id": string,
      "title": string,
      "role": string,
      "technologies": [string],
      "bullets": [string]
    }
  ],
  "skillsList": [string],
  "certifications": [string]
}

CV Text:
${rawText.slice(0, 8000)}

Return only valid JSON.`;

    let parsedCV: any;
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: parsePrompt,
        config: { responseMimeType: 'application/json' },
      });
      parsedCV = JSON.parse(response.text || '{}');
      const parsedCvErrors = validateParsedCvPayload(parsedCV);
      if (parsedCvErrors.length > 0) {
        throw new Error(`Invalid parsed CV payload: ${parsedCvErrors.join(', ')}`);
      }
    } catch (e) {
      // Never fabricate a parsed CV. Returning invented employers, degrees or
      // contact details would persist false personal data as the user's own.
      // Nothing has been written at this point, so the request fails cleanly.
      console.error('CV parsing unavailable:', e);
      return res.status(503).json({
        error:
          'CV parsing is temporarily unavailable. Your file was not saved; please try again shortly.',
      });
    }

    // Run ATS diagnostic
    const atsPrompt = `Evaluate this parsed CV for the target role "${targetRoleTitle}".
JSON Schema:
{
  "overallScore": number (0-100),
  "breakdown": {
    "keywordsMatch": number,
    "impactAndMetrics": number,
    "formattingStructure": number,
    "experienceRelevance": number
  },
  "matchedKeywords": [string],
  "missingKeywords": [string],
  "actionableImprovements": [
    {
      "section": string,
      "currentText": string,
      "suggestedText": string,
      "reason": string
    }
  ]
}
Parsed CV:
${JSON.stringify(parsedCV)}
Return only valid JSON.`;

    let atsAnalysis: any = null;
    try {
      const atsRes = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: atsPrompt,
        config: { responseMimeType: 'application/json' },
      });
      atsAnalysis = JSON.parse(atsRes.text || '{}');
      const atsErrors = validateAtsPayload(atsAnalysis);
      if (atsErrors.length > 0) {
        throw new Error(`Invalid ATS payload: ${atsErrors.join(', ')}`);
      }
    } catch (e) {
      // The CV itself was parsed successfully. Store it without an ATS
      // analysis rather than returning an invented score.
      console.error('ATS analysis unavailable:', e);
      atsAnalysis = null;
    }

    // Persist the original file, then the CV row and its first version.
    // The parsed content and ATS analysis stay in PostgreSQL; the original file
    // lives in the private 'cv-files' bucket under the caller's own folder.
    const userId = req.authUser!.id;
    let storedFile: { path: string; size: number; fileName: string } | null = null;
    if (req.file) {
      const mimeType = req.file.mimetype;
      const ext = extensionForMimeType(mimeType);
      if (!ext) {
        return res.status(400).json({ error: 'Unsupported file type' });
      }
      if (req.file.size > MAX_CV_FILE_BYTES) {
        return res.status(400).json({ error: 'File exceeds the maximum size' });
      }
      storedFile = await uploadCvFile(
        userId,
        req.file.originalname,
        req.file.buffer,
        mimeType
      );
    }

    const cvName = req.file
      ? `${req.file.originalname.replace(/\.[^/.]+$/, '')} (Uploaded)`
      : 'Uploaded CV';
    const cvRow = await createCv(userId, {
      name: cvName,
      targetRoleTitle: req.body.targetRoleTitle || undefined,
      storagePath: storedFile?.path,
    });
    await setActiveCv(userId, cvRow.id);
    const version = await createCvVersion(userId, {
      cvId: cvRow.id,
      name: cvName,
      targetRoleTitle: req.body.targetRoleTitle || undefined,
      profileJson: parsedCV,
      atsAnalysis,
    });

    return res.json({
      success: true,
      cv: parsedCV,
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

// Buckets are pruned periodically so the map cannot grow without bound.
const rateSweep = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
}, AI_RATE_WINDOW_MS);
// The sweep must not hold the process open.
rateSweep.unref?.();

/**
 * Express middleware that limits a caller to a fixed number of requests per
 * window. Must run AFTER `requireAuth`, so the verified user id is available.
 */
function rateLimit(limit: number, windowMs: number) {
  return (req: Request, res: Response, next: () => void) => {
    const key = req.authUser?.id ?? req.ip ?? 'anonymous';
    const now = Date.now();
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
      });
    }
    next();
  };
}

/** The limiter applied to the Gemini-backed routes. */
const aiRateLimit = rateLimit(AI_RATE_LIMIT, AI_RATE_WINDOW_MS);

// AI Copilot with Contextual Page Understanding & Action Proposals
app.post('/api/copilot', requireAuth, aiRateLimit, async (req: Request, res: Response) => {
  try {
    const { userPrompt, context } = req.body;
    if (!userPrompt) {
      return res.status(400).json({ error: 'userPrompt is required' });
    }

    const systemInstruction = `You are CareerPilot Copilot, the world's most capable AI Career Operating System advisor.
You understand the user's complete career graph:
- Active Page/Context: ${context?.activeView || 'dashboard'}
- Persona: ${context?.careerState || 'Professional'}
- Target Role: ${context?.targetRole?.title || 'Engineer'}
- Top Skill Gaps: ${JSON.stringify(context?.skillGaps || [])}
- Active Project: ${context?.activeProjectTitle || 'None'}
- Applications Active: ${context?.applicationsCount || 0}
- Interviews Scheduled: ${context?.interviewsCount || 0}

Rules:
1. Provide concise, highly actionable career strategy.
2. If relevant to the prompt, propose a concrete, structured change to their roadmap or skills.
3. Support Arabic if requested or if prompt is in Arabic.
4. Give 3 short, relevant follow-up suggestions.`;

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
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

      // Intelligent proposed action if user asks to add or change something
      let proposedAction = undefined;
      const lower = userPrompt.toLowerCase();
      if (lower.includes('add') || lower.includes('test') || lower.includes('task') || lower.includes('skill')) {
        proposedAction = {
          id: `prop-${Date.now()}`,
          title: `Focus on ${context?.skillGaps?.[0] || 'Automated Testing'}`,
          description: `Add dedicated milestone drill to close your primary gap for ${context?.targetRole?.title || 'target role'}.`,
          reason: 'Highest leverage improvement to raise your market fit score.',
          type: 'update_task',
          payload: { skill: context?.skillGaps?.[0] || 'Testing' },
          status: 'pending'
        };
      }

      return res.json({
        text: replyText,
        suggestions: [
          'What should I prioritize today?',
          'Audit my CV bullet points',
          'Give me a technical interview question for my target role'
        ],
        proposedAction
      });
    } catch (aiErr: any) {
      // Honesty rule: if the model did not answer, do NOT return canned text
      // that looks like an AI response. The caller is told the assistant is
      // unavailable and can retry; no generated content is invented.
      console.warn('Copilot AI request failed:', aiErr?.message || aiErr);
      return res.status(503).json({
        error:
          'The AI assistant is temporarily unavailable. Your message was not answered by the model; please try again shortly.',
      });
    }
  } catch (error: any) {
    console.error('Copilot API error:', error);
    return res.status(500).json({ error: 'Failed to process copilot request' });
  }
});

// AI Career Analysis Endpoint
app.post('/api/analyze-career', requireAuth, aiRateLimit, async (req: Request, res: Response) => {
  try {
    const { targetRole, userSkills, careerState } = req.body;

    const prompt = `Analyze candidate for role "${targetRole?.title || 'Software Engineer'}".
Current persona: "${careerState || 'Professional'}".
Skills: ${JSON.stringify(userSkills || [])}.
Required for role: ${JSON.stringify(targetRole?.requiredSkills || [])}.

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

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
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
      console.error('Career analysis unavailable:', e);
      return res.status(503).json({
        error:
          'Career analysis is temporarily unavailable. No analysis was generated; please try again shortly.',
      });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Failed to run career analysis' });
  }
});

// AI CV ATS & Content Optimization Endpoint
app.post('/api/optimize-cv', requireAuth, aiRateLimit, async (req: Request, res: Response) => {
  try {
    const { cvText, targetRoleTitle, targetRoleSkills } = req.body;
    const prompt = `Evaluate CV for role "${targetRoleTitle}". Required: ${JSON.stringify(targetRoleSkills || [])}.
CV: ${cvText}
Return JSON schema:
{
  "overallScore": number,
  "breakdown": { "keywordsMatch": number, "impactAndMetrics": number, "formattingStructure": number, "experienceRelevance": number },
  "matchedKeywords": [string],
  "missingKeywords": [string],
  "actionableImprovements": [{ "section": string, "currentText": string, "suggestedText": string, "reason": string }]
}`;

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
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
      return res.json(payload);
    } catch (e) {
      // An invented ATS score and invented "improvements" would be actively
      // harmful: the user could rewrite a CV around a fabricated diagnosis.
      console.error('CV optimization unavailable:', e);
      return res.status(503).json({
        error:
          'CV analysis is temporarily unavailable. No ATS analysis was generated; please try again shortly.',
      });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Failed to optimize CV' });
  }
});

// AI Mock Interview Evaluation Endpoint
app.post('/api/mock-interview', requireAuth, aiRateLimit, async (req: Request, res: Response) => {
  try {
    const { roleTitle, interviewType, question, userAnswer } = req.body;
    const prompt = `Evaluate interview answer for "${roleTitle}". Type: ${interviewType}.
Question: "${question}"
Answer: "${userAnswer}"
Return JSON schema:
{
  "score": number,
  "strengths": [string],
  "improvements": [string],
  "starEvaluation": { "situation": string, "task": string, "action": string, "result": string },
  "suggestedAnswer": string
}`;

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
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
      console.error('Interview evaluation unavailable:', e);
      return res.status(503).json({
        error:
          'Interview evaluation is temporarily unavailable. No feedback was generated; please try again shortly.',
      });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Failed to evaluate interview response' });
  }
});
// AI Professional Summary Suggestion
app.post('/api/suggest-summary', requireAuth, aiRateLimit, async (req: Request, res: Response) => {
  try {
    const { name, targetRoleTitle, careerState, yearsExperience, skills, keyAchievements } = req.body;
    const prompt = `Write a high-impact, professional, authentic 3-4 sentence professional summary for a resume/profile.
Person: ${name || 'Professional'}
Target Role: ${targetRoleTitle || 'Software Engineer'}
Career State: ${careerState || 'Professional'}
Years of Experience: ${yearsExperience || '3+'}
Core Skills: ${Array.isArray(skills) ? skills.join(', ') : 'Software Engineering'}
Key Achievements: ${Array.isArray(keyAchievements) ? keyAchievements.join('; ') : 'High performance, agile collaboration'}

Requirements:
- First-person or punchy executive third-person tone.
- Emphasize business impact and technical mastery.
- Do not invent non-existent companies or fabricated awards.
- Return JSON: { "suggestedSummary": string }`;

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
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
      return res.json(payload);
    } catch (e) {
      // Do not return a generic paragraph as if the model had written it for
      // this candidate. The caller must know that no suggestion was produced.
      console.error('Summary suggestion unavailable:', e);
      return res.status(503).json({
        error:
          'Summary generation is temporarily unavailable. No suggestion was generated; please try again shortly.',
      });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Failed to generate summary suggestion' });
  }
});

// AI Cover Letter Generation Endpoint
app.post('/api/generate-cover-letter', requireAuth, aiRateLimit, async (req: Request, res: Response) => {
  try {
    const { company, jobTitle, jobDescription, candidateName, experiences, skills, projects, tone } = req.body;
    const prompt = `Write a tailored, compelling cover letter for:
Candidate: ${candidateName || 'Candidate'}
Company: ${company}
Role: ${jobTitle}
Tone: ${tone || 'Professional & Confident'}
Job Requirements/Context: ${jobDescription || 'Standard requirements'}
Candidate Relevant Background:
- Experiences: ${JSON.stringify(experiences || [])}
- Core Skills: ${JSON.stringify(skills || [])}
- Key Projects: ${JSON.stringify(projects || [])}

Rules:
1. Ground every claim strictly in candidate's provided experiences and projects. DO NOT invent false metrics or companies.
2. Structure: Strong hook expressing excitement for ${company}, high-relevance achievement showcase directly matching the job, and proactive closing.
3. Keep it under 350 words.
4. Return JSON: { "coverLetter": string, "keyHighlights": [string] }`;

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });
      const payload = JSON.parse(response.text || '{}');
      const payloadErrors = validateCoverLetterPayload(payload);
      if (payloadErrors.length > 0) {
        console.error('Cover letter returned an invalid payload:', payloadErrors);
        return res.status(503).json({
          error:
            'Cover letter generation returned an invalid response. No cover letter was accepted; please try again shortly.',
        });
      }
      return res.json(payload);
    } catch (e) {
      // A cover letter full of claims the candidate never supplied is the most
      // dangerous fallback in the product: it could be sent to an employer.
      console.error('Cover letter generation unavailable:', e);
      return res.status(503).json({
        error:
          'Cover letter generation is temporarily unavailable. No cover letter was generated; please try again shortly.',
      });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Failed to generate cover letter' });
  }
});

// Check username availability
app.get('/api/profile/check-username', async (req: Request, res: Response) => {
  try {
    const raw = req.query.username as string;
    if (!raw) return res.status(400).json({ error: 'Username required' });
    const username = raw.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '');

    // Group A: PostgreSQL is the only source. Uniqueness is enforced by the
    // existing profiles_username_key unique index.
    const existing = await findProfileByUsername(username);
    const isTaken = !!existing;

    return res.json({
      username,
      available: !isTaken && username.length >= 3,
      message: isTaken ? 'Username is already taken' : 'Username is available'
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
        linkMap[link.kind] = link.url;
      }
    }

    const safeProfile = {
      name: profile.full_name,
      preferredName: profile.full_name,
      headline: profile.target_role,
      bio: profile.bio,
      avatarUrl: profile.avatar_url,
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
        credentialUrl: c.url ?? undefined,
      })),
      skills: (userSkills ?? []).map((us: any) => ({
        name: us.skill?.name,
        level: us.proficiency,
        category: us.skill?.category,
      })),
      projects: (projects ?? []).map((p: any) => ({
        title: p.title,
        description: p.description ?? undefined,
        repositoryUrl: p.repository_url ?? undefined,
        demoUrl: p.demo_url ?? undefined,
      })),
      links: linkMap,
    };
    return res.json({ success: true, profile: safeProfile });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to retrieve public profile' });
  }
});

// Account: Change Password
app.post('/api/account/change-password', async (req: Request, res: Response) => {
  try {
    // Authoritative identity: verified Supabase Auth token only.
    const auth = await verifySupabaseToken(req.headers.authorization);
    if (auth.status !== 'valid') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password required' });
    }

    const result = await changePassword(auth.userId, currentPassword, newPassword);
    if (!result.ok) {
      return res.status(400).json({ error: result.error || 'Failed to update password' });
    }

    return res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update password' });
  }
});

// Account: Change Email
app.post('/api/account/change-email', async (req: Request, res: Response) => {
  try {
    const auth = await verifySupabaseToken(req.headers.authorization);
    if (auth.status !== 'valid') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { newEmail, currentPassword } = req.body;
    if (!newEmail || !newEmail.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!currentPassword) {
      return res.status(400).json({ error: 'Current password is required to change email' });
    }

    const result = await changeEmail(auth.userId, newEmail.toLowerCase(), currentPassword);
    if (!result.ok) {
      return res.status(409).json({ error: result.error || 'Failed to update email' });
    }

    return res.json({ success: true, email: newEmail.toLowerCase(), message: 'Email updated successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update email' });
  }
});

// Account: Delete Account
app.post('/api/account/delete', async (req: Request, res: Response) => {
  try {
    const auth = await verifySupabaseToken(req.headers.authorization);
    if (auth.status !== 'valid') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Target is exclusively the verified Supabase Auth user id.
    const result = await deleteAccount(auth.userId);
    if (!result.ok) {
      return res.status(500).json({ error: result.error || 'Failed to delete account' });
    }

    return res.json({ success: true, message: 'Account and associated career data deleted successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete account' });
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
      repositoryUrl: str(body.repositoryUrl, 500) ?? undefined,
      demoUrl: str(body.demoUrl, 500) ?? undefined,
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
    const project = await updateProject(req.authUser!.id, req.params.id, {
      title: str(body.title, 200) ?? undefined,
      goal: body.goal === null ? undefined : (str(body.goal, 4000) ?? undefined),
      description:
        body.description === null ? undefined : (str(body.description, 20000) ?? undefined),
      difficulty: str(body.difficulty, 30) as ProjectDifficulty | undefined,
      status: str(body.status, 30) as ProjectStatus | undefined,
      repositoryUrl:
        body.repositoryUrl === null ? undefined : (str(body.repositoryUrl, 500) ?? undefined),
      demoUrl: body.demoUrl === null ? undefined : (str(body.demoUrl, 500) ?? undefined),
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
    const item = await createEvidence(req.authUser!.id, {
      title,
      type: (type ?? undefined) as (typeof EVIDENCE_TYPES)[number] | undefined,
      description: str(body.description, 20000) ?? undefined,
      url: str(body.url, 500) ?? undefined,
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
    const item = await updateEvidence(req.authUser!.id, req.params.id, {
      title: str(body.title, 200) ?? undefined,
      type: (type ?? undefined) as (typeof EVIDENCE_TYPES)[number] | undefined,
      description:
        body.description === null ? undefined : (str(body.description, 20000) ?? undefined),
      url: body.url === null ? undefined : (str(body.url, 500) ?? undefined),
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
    if (issueDate && Number.isNaN(new Date(issueDate).getTime())) {
      return res.status(400).json({ error: 'Invalid issueDate' });
    }
    const expiryDate = str(body.expiryDate, 40);
    if (expiryDate && Number.isNaN(new Date(expiryDate).getTime())) {
      return res.status(400).json({ error: 'Invalid expiryDate' });
    }
    const certification = await createCertification(req.authUser!.id, {
      name,
      issuer: str(body.issuer, 200) ?? undefined,
      issueDate: issueDate ?? undefined,
      expiryDate: expiryDate ?? undefined,
      url: str(body.url, 500) ?? undefined,
      credentialId: str(body.credentialId, 200) ?? undefined,
    });
    return res.status(201).json({ success: true, certification });
  } catch (error) {
    console.error('Failed to create certification:', error);
    return res.status(500).json({ error: 'Failed to create certification' });
  }
});

app.patch('/api/certifications/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const body = req.body ?? {};
    const certification = await updateCertification(req.authUser!.id, req.params.id, {
      name: str(body.name, 200) ?? undefined,
      issuer: body.issuer === null ? undefined : (str(body.issuer, 200) ?? undefined),
      issueDate: str(body.issueDate, 40) ?? undefined,
      expiryDate: str(body.expiryDate, 40) ?? undefined,
      url: body.url === null ? undefined : (str(body.url, 500) ?? undefined),
      credentialId:
        body.credentialId === null ? undefined : (str(body.credentialId, 200) ?? undefined),
    });
    if (!certification) return res.status(404).json({ error: 'Certification not found' });
    return res.json({ success: true, certification });
  } catch (error) {
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
    const url = str(body.url, 500);
    if (!url) return res.status(400).json({ error: 'URL is required' });
    const link = await createProfileLink(req.authUser!.id, {
      kind,
      label: str(body.label, 200) ?? undefined,
      url,
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
    const link = await updateProfileLink(req.authUser!.id, req.params.id, {
      kind: str(body.kind, 60) ?? undefined,
      label: body.label === null ? undefined : (str(body.label, 200) ?? undefined),
      url: str(body.url, 500) ?? undefined,
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
    const profile = await updateProfileDto(req.authUser!.id, {
      fullName: str(body.fullName, 200) ?? undefined,
      preferredName:
        body.preferredName === null ? undefined : (str(body.preferredName, 200) ?? undefined),
      username: body.username === null ? undefined : (str(body.username, 100) ?? undefined),
      avatarUrl: body.avatarUrl === null ? undefined : (str(body.avatarUrl, 1000) ?? undefined),
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
      targetRole: body.targetRole === null ? undefined : (str(body.targetRole, 200) ?? undefined),
      targetIndustry:
        body.targetIndustry === null ? undefined : (str(body.targetIndustry, 200) ?? undefined),
      userType: (userType ?? undefined) as string | undefined,
      onboardingCompleted:
        typeof body.onboardingCompleted === 'boolean' ? body.onboardingCompleted : undefined,
      isPublic: typeof body.isPublic === 'boolean' ? body.isPublic : undefined,
      // The professional links are a keyed set (linkedin, github, ...); they
      // are replaced as a whole so a removed link is actually removed.
      ...(body.links && typeof body.links === 'object'
        ? {
            links: Object.fromEntries(
              Object.entries(body.links as Record<string, unknown>).map(([kind, url]) => [
                kind,
                typeof url === 'string' ? url : '',
              ])
            ),
          }
        : {}),
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
// public.user_preferences holds the three settings that belong to the account
// rather than to the browser: the theme, the interface language and the
// notification switch. They follow the user to another device.
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
    const updates: { theme?: string; language?: string; notifications_enabled?: boolean } = {};

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
        notificationsEnabled: saved.notifications_enabled,
      },
    });
  } catch (error) {
    console.error('Failed to save preferences:', error);
    return res.status(500).json({ error: 'Failed to save preferences' });
  }
});

// ---- Job bookmarks ----
//
// The job catalogue is static (src/data/jobsData.ts), so a bookmark stores
// only the catalogue id: there is no duplicated job data that could drift
// from the catalogue. The owner is always the verified user id.
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
app.post('/api/learning/recommendations', requireAuth, aiRateLimit, async (req: Request, res: Response) => {
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

    const limitRaw = body.limit;
    const limit = limitRaw === undefined || limitRaw === null ? undefined : Number(limitRaw);
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 20)) {
      return res.status(400).json({ error: 'limit must be between 1 and 20' });
    }

    const built = await buildLearningContext(req.authUser!.id, {
      targetRoleId: str(body.targetRoleId, 120) ?? undefined,
      targetRoleTitle: str(body.targetRoleTitle, 200) ?? undefined,
      language: language as 'en' | 'ar' | undefined,
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
        aiUsed: false,
        aiFallbackReason: null,
        generatedAt: new Date().toISOString(),
      };
    } else {
      result = await enrichRecommendationsWithAi(deterministic, built.context, {
        ai: process.env.GEMINI_API_KEY ? ai : null,
        model: GEMINI_MODEL,
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

// Mount Vite in dev or static files in production
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CareerPilot AI Server running on port ${PORT}`);
  });
}

startServer();
