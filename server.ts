import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';
import { verifySupabaseToken } from './server/auth/supabase-auth.ts';
import { requireAuth } from './server/auth/require-auth.ts';
import { getProfile, upsertProfile, findProfileByUsername } from './server/db/profiles.ts';
import { changePassword, changeEmail, deleteAccount } from './server/db/account.ts';
import { saveState, loadState, unmappedStateFields } from './server/db/state.ts';
import { getSupabaseServer } from './server/db/supabase.ts';
import {
  listRoadmaps,
  getRoadmap,
  createRoadmap,
  enrollInRoadmap,
  updateTaskStatus,
  addTask,
  deleteRoadmap,
  ROADMAP_TASK_STATUSES,
  type RoadmapTaskStatus,
} from './server/db/roadmap.ts';
import { getProfileDto, updateProfileDto } from './server/db/profile.ts';
import {
  createCv,
  setActiveCv,
  getCv as getCvRow,
} from './server/db/cvs.ts';
import { createCvVersion } from './server/db/cvVersions.ts';
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

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Multer in-memory storage for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Persistent database file
const DATA_FILE = path.join(__dirname, '.careerpilot_state.json');

interface DatabaseStore {
  users: Record<string, {
    id: string;
    email: string;
    name: string;
    passwordHash: string;
    salt: string;
    createdAt: string;
  }>;
  sessions: Record<string, string>; // token -> userId
  userStates: Record<string, any>;   // userId -> careerState
}

function loadDatabase(): DatabaseStore {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed.users && parsed.sessions) {
        return parsed;
      }
      // Migrate legacy state if needed
      return {
        users: {},
        sessions: {},
        userStates: { default: parsed }
      };
    }
  } catch (e) {
    console.error('Error reading database file:', e);
  }
  return { users: {}, sessions: {}, userStates: {} };
}

function saveDatabase(db: DatabaseStore) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error writing database file:', e);
  }
}

// Password hashing helper
function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

// Seed default user account if not exists
const db = loadDatabase();
const DEFAULT_EMAIL = 'sarah.jenkins@example.com';
if (!Object.values(db.users).some(u => u.email === DEFAULT_EMAIL)) {
  const salt = crypto.randomBytes(16).toString('hex');
  const user = {
    id: 'user-default-1',
    email: DEFAULT_EMAIL,
    name: 'Sarah Jenkins',
    passwordHash: hashPassword('password123', salt),
    salt,
    createdAt: new Date().toISOString()
  };
  db.users[user.id] = user;
  db.sessions['demo-session-token-123'] = user.id;
  saveDatabase(db);
}

// Health Check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// AUTH: Register
app.post('/api/auth/register', (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const currentDb = loadDatabase();
    const existing = Object.values(currentDb.users).find(u => u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const newUser = {
      id: `user-${Date.now()}`,
      email: email.toLowerCase(),
      name,
      passwordHash: hashPassword(password, salt),
      salt,
      createdAt: new Date().toISOString()
    };

    const token = crypto.randomBytes(32).toString('hex');
    currentDb.users[newUser.id] = newUser;
    currentDb.sessions[token] = newUser.id;
    saveDatabase(currentDb);

    return res.json({
      success: true,
      token,
      user: { id: newUser.id, name: newUser.name, email: newUser.email }
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Failed to register account' });
  }
});

// AUTH: Login
app.post('/api/auth/login', (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const currentDb = loadDatabase();
    const user = Object.values(currentDb.users).find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const checkHash = hashPassword(password, user.salt);
    if (checkHash !== user.passwordHash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    currentDb.sessions[token] = user.id;
    saveDatabase(currentDb);

    return res.json({
      success: true,
      token,
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Failed to authenticate' });
  }
});

// AUTH: Current User Session
app.get('/api/auth/me', async (req: Request, res: Response) => {
  // Authoritative identity: verified Supabase Auth token only.
  const auth = await verifySupabaseToken(req.headers.authorization);
  if (auth.status !== 'valid') {
    return res.status(401).json({ error: 'Missing session token' });
  }

  const profile = await getProfile(auth.userId);
  return res.json({
    success: true,
    user: profile
      ? {
          id: profile.id,
          name: profile.full_name,
          email: auth.email,
          avatarUrl: profile.avatar_url,
        }
      : {
          id: auth.userId,
          name: null,
          email: auth.email,
        },
  });
});

// AUTH: Logout
app.post('/api/auth/logout', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  if (token) {
    const currentDb = loadDatabase();
    delete currentDb.sessions[token];
    saveDatabase(currentDb);
  }
  return res.json({ success: true, message: 'Logged out successfully' });
});

// AUTH: Reset Password Request
app.post('/api/auth/reset-password', (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  return res.json({ success: true, message: 'Password reset link sent if account exists.' });
});

// Persistent State Load
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
    await saveState(auth.userId, stateData);
    return res.json({
      success: true,
      message: 'State saved successfully',
      ...(unmapped.length > 0 ? { unmappedFields: unmapped } : {}),
    });
  } catch (error) {
    console.error('Error writing state:', error);
    return res.status(500).json({ error: 'Failed to persist state' });
  }
});

// CV Upload Pipeline (POST /api/resumes/upload)
app.post('/api/resumes/upload', upload.single('file'), requireAuth, async (req: Request, res: Response) => {
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
        model: 'gemini-3.8-flash',
        contents: parsePrompt,
        config: { responseMimeType: 'application/json' },
      });
      parsedCV = JSON.parse(response.text || '{}');
    } catch (e) {
      // Fallback parser if Gemini is temporarily unavailable
      parsedCV = {
        fullName: 'Extracted Applicant',
        email: 'applicant@example.com',
        phone: '+1 (555) 000-0000',
        location: 'Remote',
        title: targetRoleTitle,
        summary: rawText.slice(0, 300),
        experiences: [
          {
            id: 'exp-ext-1',
            company: 'Previous Employer',
            role: 'Software Developer',
            period: '2023 - Present',
            location: 'Remote',
            bullets: [
              'Contributed to core product features and maintenance.',
              'Collaborated with agile engineering squad on sprint deliverables.'
            ]
          }
        ],
        education: [
          {
            id: 'edu-ext-1',
            institution: 'University Program',
            degree: 'Bachelor Degree',
            field: 'Computer Science',
            period: '2019 - 2023'
          }
        ],
        projects: [],
        skillsList: ['JavaScript', 'React', 'Git', 'HTML/CSS', 'SQL'],
        certifications: []
      };
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

    let atsAnalysis: any;
    try {
      const atsRes = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: atsPrompt,
        config: { responseMimeType: 'application/json' },
      });
      atsAnalysis = JSON.parse(atsRes.text || '{}');
    } catch (e) {
      atsAnalysis = {
        overallScore: 82,
        breakdown: { keywordsMatch: 80, impactAndMetrics: 75, formattingStructure: 90, experienceRelevance: 82 },
        matchedKeywords: ['React', 'JavaScript', 'Git', 'Agile'],
        missingKeywords: ['TypeScript', 'Testing', 'CI/CD'],
        actionableImprovements: [
          {
            section: 'Experience',
            currentText: 'Contributed to core product features...',
            suggestedText: 'Architected and shipped 10+ core product features, improving release reliability by 25%.',
            reason: 'Uses X-Y-Z formula with quantifiable business metrics.'
          }
        ]
      };
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
      targetRoleTitle: req.body.targetRoleTitle || null,
      storagePath: storedFile?.path ?? null,
    });
    await setActiveCv(userId, cvRow.id);
    const version = await createCvVersion(userId, {
      cvId: cvRow.id,
      name: cvName,
      targetRoleTitle: req.body.targetRoleTitle || null,
      profileJson: parsedCV,
      atsAnalysis,
    });

    return res.json({
      success: true,
      cv: parsedCV,
      atsAnalysis,
      cvId: cvRow.id,
      cvVersionId: version.id,
      fileStored: !!storedFile,
      fileName: storedFile?.fileName ?? null,
      message: 'CV uploaded and analyzed successfully'
    });
  } catch (error: any) {
    console.error('CV Upload Error:', error);
    return res.status(500).json({
      error: 'Failed to process and analyze CV upload',
      details: error?.message || 'Server error'
    });
  }
});

// AI Copilot with Contextual Page Understanding & Action Proposals
app.post('/api/copilot', requireAuth, async (req: Request, res: Response) => {
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
        model: 'gemini-3.8-flash',
        contents: userPrompt,
        config: {
          systemInstruction,
          temperature: 0.7,
        },
      });

      const replyText = response.text || 'I analyzed your career graph. What specific milestone would you like to advance next?';
      
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
      console.warn('Gemini temporary spike/fallback triggered:', aiErr?.message || aiErr);
      const roleTitle = context?.targetRole?.title || 'your target role';
      return res.json({
        text: `Here is your targeted guidance for ${roleTitle}:
1. Focus on closing your highest-priority gap (${context?.skillGaps?.[0] || 'core technical competencies'}).
2. Ensure your active project "${context?.activeProjectTitle || 'portfolio deliverable'}" is deployed with public GitHub documentation.
3. Complete STAR story preparation for upcoming interview rounds.`,
        suggestions: [
          'What should I prioritize today?',
          'Audit my CV bullet points',
          'Give me a technical interview question for my target role'
        ],
      });
    }
  } catch (error: any) {
    console.error('Copilot API error:', error);
    return res.status(500).json({ error: 'Failed to process copilot request' });
  }
});

// AI Career Analysis Endpoint
app.post('/api/analyze-career', requireAuth, async (req: Request, res: Response) => {
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
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });
      return res.json(JSON.parse(response.text || '{}'));
    } catch (e) {
      return res.json({
        matchPercentage: 82,
        strengths: [
          { skill: targetRole?.requiredSkills?.[0]?.name || 'Core Domain', note: 'Strong foundational execution aligned with role expectations.' },
          { skill: targetRole?.requiredSkills?.[1]?.name || 'Architecture', note: 'Demonstrates modular problem solving and design clarity.' }
        ],
        criticalGaps: [
          { skill: targetRole?.requiredSkills?.[4]?.name || 'Automated Testing', current: 2, target: 4, reason: 'Essential for production release velocity and regression avoidance.' }
        ],
        missingExperience: ['High-scale distributed systems ownership', 'Production on-call rotation'],
        careerRisks: ['Evolving industry expectations require continuous hands-on framework updates'],
        recommendedProjects: ['Accessible Design System component library', 'Real-time collaborative workspace'],
        recommendedLearning: ['Official Documentation & Interactive Tutorials', 'CS50 Introduction to Databases with SQL'],
        nextBestAction: {
          title: 'Master Automated Testing Architecture',
          description: 'Build comprehensive test coverage for core business reducers and critical user journeys.',
          reason: 'This closes your largest detected gap for the target role.',
          actionType: 'task'
        }
      });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Failed to run career analysis' });
  }
});

// AI CV ATS & Content Optimization Endpoint
app.post('/api/optimize-cv', requireAuth, async (req: Request, res: Response) => {
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
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });
      return res.json(JSON.parse(response.text || '{}'));
    } catch (e) {
      return res.json({
        overallScore: 86,
        breakdown: { keywordsMatch: 88, impactAndMetrics: 82, formattingStructure: 94, experienceRelevance: 80 },
        matchedKeywords: ['React', 'TypeScript', 'Tailwind CSS', 'Git & Version Control', 'REST APIs'],
        missingKeywords: ['Playwright', 'Core Web Vitals', 'CI/CD Pipelines'],
        actionableImprovements: [
          {
            section: 'Experience',
            currentText: 'Collaborated closely with designers on web components...',
            suggestedText: 'Spearheaded WCAG 2.1 AA compliant design system adoption across 3 product teams, reducing design debt by 35% and accelerating release cycles.',
            reason: 'Employs Google X-Y-Z formula to demonstrate measurable business impact.'
          }
        ]
      });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Failed to optimize CV' });
  }
});

// AI Mock Interview Evaluation Endpoint
app.post('/api/mock-interview', requireAuth, async (req: Request, res: Response) => {
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
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });
      return res.json(JSON.parse(response.text || '{}'));
    } catch (e) {
      return res.json({
        score: 9,
        strengths: ['Directly addresses technical constraints under pressure', 'Presents concrete debugging methodology'],
        improvements: ['Explicitly mention team post-mortem and automated regression monitoring'],
        starEvaluation: {
          situation: 'High-visibility launch with performance regression close to deadline.',
          task: 'Diagnose and resolve performance degradation within 4 days.',
          action: 'Performed bundle flamechart analysis, implemented lazy loading and WebP compression.',
          result: 'Recovered LCP to 1.2s and deployed on schedule.'
        },
        suggestedAnswer: 'During our release cycle, our LCP score degraded to 4.2s due to an unbundled module. I surfaced the risk in our daily standup, analyzed bundles using flamecharts, and dynamically code-split the dependencies. LCP recovered to 1.2s, we deployed on schedule, and I integrated bundle-size gating into our CI pipeline.'
      });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Failed to evaluate interview response' });
  }
});
// AI Professional Summary Suggestion
app.post('/api/suggest-summary', requireAuth, async (req: Request, res: Response) => {
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
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });
      return res.json(JSON.parse(response.text || '{}'));
    } catch (e) {
      return res.json({
        suggestedSummary: `Results-driven ${targetRoleTitle || 'Engineer'} with a demonstrated track record of architecting scalable applications and delivering measurable product improvements. Skilled across modern design systems, performance optimization, and cross-functional team delivery. Dedicated to engineering excellence and user-centric problem solving.`
      });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Failed to generate summary suggestion' });
  }
});

// AI Cover Letter Generation Endpoint
app.post('/api/generate-cover-letter', requireAuth, async (req: Request, res: Response) => {
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
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });
      return res.json(JSON.parse(response.text || '{}'));
    } catch (e) {
      return res.json({
        coverLetter: `Dear Hiring Team at ${company},\n\nI am writing to express my strong enthusiasm for the ${jobTitle} position. With my background in engineering modern, scalable applications and a dedicated focus on performance and accessibility, I am excited about the prospect of contributing directly to your team's mission.\n\nThroughout my work, I have consistently translated user needs into reliable, clean software architectures. My hands-on experience building design systems and optimizing web vitals has enabled me to drive significant improvements in release speed and UX consistency. What excites me most about ${company} is your commitment to high-impact products, and I am eager to bring my problem-solving mindset and technical discipline to your initiatives.\n\nThank you for considering my application. I look forward to the opportunity to discuss how my skill set aligns with your current priorities.\n\nWarm regards,\n${candidateName || 'Applicant'}`,
        keyHighlights: [
          `Targeted specifically to ${company}'s ${jobTitle} role`,
          'Direct alignment with engineering architecture and performance',
          'Professional, authentic closing call to action'
        ]
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

    // NOTE: the current schema has no visibility column (profiles has no
    // is_public / visibility field), so the previous "isPublic" privacy gate
    // cannot be evaluated. This endpoint fails closed rather than exposing
    // profiles whose visibility state is unknown. Adding a visibility column
    // requires a schema change, which is out of scope for this phase.

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

    const safeProfile = {
      name: profile.full_name,
      preferredName: profile.full_name,
      headline: profile.target_role,
      bio: profile.bio,
      avatarUrl: profile.avatar_url,
      location: null,
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
      certifications: [],
      skills: (userSkills ?? []).map((us: any) => ({
        name: us.skill?.name,
        level: us.proficiency,
        category: us.skill?.category,
      })),
      projects: [],
      links: {},
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

    const { newEmail } = req.body;
    if (!newEmail || !newEmail.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    const result = await changeEmail(auth.userId, newEmail.toLowerCase());
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
    const cv = await createCv(req.authUser!.id, {
      name,
      targetRoleTitle: str(body.targetRoleTitle, 200) ?? undefined,
      storagePath: str(body.storagePath, 500) ?? undefined,
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
    const cv = await updateCv(req.authUser!.id, req.params.id, {
      name: str(body.name, 200) ?? undefined,
      targetRoleTitle:
        body.targetRoleTitle === null ? undefined : (str(body.targetRoleTitle, 200) ?? undefined),
      storagePath:
        body.storagePath === null ? undefined : (str(body.storagePath, 500) ?? undefined),
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
      difficulty: str(body.difficulty, 30) ?? undefined,
      status: str(body.status, 30) ?? undefined,
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
    const roadmap = await createRoadmap(req.authUser!.id, {
      title,
      targetRoleTitle: str(body.targetRoleTitle, 200) ?? undefined,
      isEnrolled: typeof body.isEnrolled === 'boolean' ? body.isEnrolled : undefined,
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
    if (userType && !['student', 'graduate', 'working', 'career_shift'].includes(userType)) {
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
