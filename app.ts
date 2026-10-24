/**
 * The CareerPilot AI API, as a framework-level Express application.
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
import { inflateSync, inflateRawSync } from 'node:zlib';
// The *web* build of the SDK is imported deliberately. It is the build the
// browser already receives, it uses `fetch` rather than `google-auth-library`
// (ADC, child processes, the local filesystem), and it therefore runs unchanged
// in Node and in the Workers runtime. The Node build pulls in authentication
// code that is useless here and cannot be bundled for Cloudflare.
import { GoogleGenAI } from '@google/genai/web';
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
import { loadAiCareerContext, buildAiContextBlock } from './server/ai/careerContext.ts';
import {
  consumeDailyAiBudget,
  isQuotaError,
  quotaRetryAfterSeconds,
  refundDailyAiBudget,
} from './server/ai/quota.ts';
import { resolveRole, CATALOG_SKILL_NAMES } from './shared/careerRoles.ts';
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

// Multer in-memory storage for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Accepted CV upload formats.
//
// A file must match BOTH its extension and one of the MIME types declared for
// that extension, so a renamed or crafted upload cannot pass the format check
// under a false identity.
//
// Supported formats: PDF, DOCX, TXT, JSON.
const CV_UPLOAD_TYPES: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.docx': [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'application/octet-stream',
    'application/x-zip-compressed',
  ],
  '.txt': ['text/plain'],
  '.json': ['application/json'],
};
const CV_UPLOAD_TYPE_ERROR =
  'Unsupported file type. Please upload a .pdf, .docx, .txt, or .json file.';

/**
 * Production-grade zero-dependency DOCX text extractor.
 * Reads word/document.xml from OOXML ZIP archive.
 * Preserves tables by converting cells to pipe-delimited text and detects bullet/numbered lists.
 */
function extractTextFromDocx(buffer: Buffer): string {
  let offset = 0;
  while (offset < buffer.length - 4) {
    if (buffer.readUInt32LE(offset) === 0x04034b50) {
      const compression = buffer.readUInt16LE(offset + 8);
      const compressedSize = buffer.readUInt32LE(offset + 18);
      const nameLen = buffer.readUInt16LE(offset + 26);
      const extraLen = buffer.readUInt16LE(offset + 28);
      const name = buffer.toString('utf8', offset + 30, offset + 30 + nameLen);
      const dataStart = offset + 30 + nameLen + extraLen;

      if (name === 'word/document.xml') {
        let xml = '';
        try {
          if (compression === 8) {
            xml = inflateRawSync(buffer.subarray(dataStart, dataStart + compressedSize)).toString('utf8');
          } else if (compression === 0) {
            xml = buffer.subarray(dataStart, dataStart + compressedSize).toString('utf8');
          }
        } catch (e) {
          console.warn('[docx] failed to inflate word/document.xml:', e);
          return '';
        }

        // 1. Convert tables (<w:tbl>) into paragraphs where table cells are joined by " | "
        const processedXml = xml.replace(/<w:tbl\b[^>]*>([\s\S]*?)<\/w:tbl>/g, (_match, tblContent) => {
          const rows = tblContent.match(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g) || [];
          const tablePs: string[] = [];
          for (const row of rows) {
            const cells = row.match(/<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g) || [];
            const cellTexts = cells
              .map((cell: string) => {
                const paragraphs = cell.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) || [];
                return paragraphs
                  .map((p: string) => {
                    const texts = p.match(/<w:t\b[^>]*>([^<]*)<\/w:t>/g) || [];
                    return texts.map((t: string) => t.replace(/<[^>]+>/g, '')).join('');
                  })
                  .join(' ')
                  .trim();
              })
              .filter((t: string) => t.length > 0);

            if (cellTexts.length > 0) {
              tablePs.push(`<w:p><w:r><w:t>${cellTexts.join(' | ')}</w:t></w:r></w:p>`);
            }
          }
          return tablePs.join('');
        });

        // 2. Extract paragraphs, identifying list items (<w:numPr>) and formatting
        const paragraphs = processedXml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) || [];
        const lines = paragraphs
          .map((p) => {
            const isList = /<w:numPr\b[^>]*>/.test(p);
            // Replace <w:tab/> with space and <w:br/> with newline
            const cleanP = p.replace(/<w:tab\b[^>]*\/?>/g, ' ').replace(/<w:br\b[^>]*\/?>/g, '\n');
            const texts = cleanP.match(/<w:t\b[^>]*>([^<]*)<\/w:t>/g) || [];
            let lineText = texts.map((t) => t.replace(/<[^>]+>/g, '')).join('').trim();
            if (lineText && isList && !/^[•\-*]/.test(lineText)) {
              lineText = '• ' + lineText;
            }
            return lineText;
          })
          .filter((line) => line.trim().length > 0);

        return lines.join('\n');
      }
      offset = dataStart + compressedSize;
    } else {
      offset++;
    }
  }
  return '';
}

/**
 * Parses a PDF literal string with balanced and escaped parenthesis handling and octal decoding.
 */
function parsePdfLiteralString(str: string, startIdx: number): { text: string; endIdx: number } {
  let result = '';
  let i = startIdx + 1;
  let depth = 1;
  while (i < str.length) {
    const char = str[i];
    if (char === '\\') {
      i++;
      if (i >= str.length) break;
      const next = str[i];
      if (next === 'n') { result += '\n'; i++; }
      else if (next === 'r') { result += '\r'; i++; }
      else if (next === 't') { result += '\t'; i++; }
      else if (next === 'b') { result += '\b'; i++; }
      else if (next === 'f') { result += '\f'; i++; }
      else if (next === '(' || next === ')' || next === '\\') { result += next; i++; }
      else if (/[0-7]/.test(next)) {
        let octal = next;
        i++;
        if (i < str.length && /[0-7]/.test(str[i])) { octal += str[i]; i++; }
        if (i < str.length && /[0-7]/.test(str[i])) { octal += str[i]; i++; }
        result += String.fromCharCode(parseInt(octal, 8));
      } else if (next === '\r' || next === '\n') {
        if (next === '\r' && i + 1 < str.length && str[i + 1] === '\n') i++;
        i++;
      } else {
        result += next;
        i++;
      }
    } else if (char === '(') {
      depth++;
      result += '(';
      i++;
    } else if (char === ')') {
      depth--;
      if (depth === 0) {
        return { text: result, endIdx: i + 1 };
      }
      result += ')';
      i++;
    } else {
      result += char;
      i++;
    }
  }
  return { text: result, endIdx: i };
}

/**
 * Parses a PDF hexadecimal string (< ... >), handling ASCII hex and UTF-16BE / CID.
 */
function parsePdfHexString(str: string, startIdx: number): { text: string; endIdx: number } {
  let hex = '';
  let i = startIdx + 1;
  while (i < str.length) {
    const char = str[i];
    if (char === '>') {
      i++;
      break;
    }
    if (/[0-9a-fA-F]/.test(char)) {
      hex += char;
    }
    i++;
  }
  if (hex.length % 2 !== 0) hex += '0';

  let decoded = '';
  if (hex.length >= 4 && hex.length % 4 === 0) {
    let isUtf16 = false;
    if (hex.slice(0, 4).toUpperCase() === 'FEFF') {
      isUtf16 = true;
      hex = hex.slice(4);
    } else {
      let zeroes = 0;
      for (let j = 0; j < hex.length; j += 4) {
        if (hex.slice(j, j + 2) === '00') zeroes++;
      }
      if (zeroes > (hex.length / 4) * 0.7) {
        isUtf16 = true;
      }
    }

    if (isUtf16) {
      for (let j = 0; j < hex.length; j += 4) {
        const code = parseInt(hex.slice(j, j + 4), 16);
        if (code > 0) decoded += String.fromCharCode(code);
      }
      return { text: decoded, endIdx: i };
    }
  }

  for (let j = 0; j < hex.length; j += 2) {
    const code = parseInt(hex.slice(j, j + 2), 16);
    if (code >= 32 && code <= 126) {
      decoded += String.fromCharCode(code);
    } else if (code === 10 || code === 13 || code === 9) {
      decoded += ' ';
    }
  }
  return { text: decoded, endIdx: i };
}

/**
 * Robust stream text extractor parsing Tj, TJ, and text positioning operators.
 */
function extractTextFromPdfStream(streamText: string): string {
  let output = '';
  let i = 0;
  const len = streamText.length;

  while (i < len) {
    const ch = streamText[i];

    if (ch === '(') {
      const parsed = parsePdfLiteralString(streamText, i);
      i = parsed.endIdx;
      while (i < len && /\s/.test(streamText[i])) i++;
      if (streamText.slice(i, i + 2) === 'Tj') {
        output += parsed.text;
        i += 2;
      } else if (streamText[i] === "'") {
        output += '\n' + parsed.text;
        i += 1;
      } else if (streamText[i] === '"') {
        output += '\n' + parsed.text;
        i += 1;
      } else {
        output += parsed.text + ' ';
      }
      continue;
    }

    if (ch === '<' && streamText[i + 1] !== '<') {
      const parsed = parsePdfHexString(streamText, i);
      i = parsed.endIdx;
      while (i < len && /\s/.test(streamText[i])) i++;
      if (streamText.slice(i, i + 2) === 'Tj') {
        output += parsed.text;
        i += 2;
      } else {
        output += parsed.text + ' ';
      }
      continue;
    }

    if (ch === '[') {
      let j = i + 1;
      let arrayText = '';
      while (j < len && streamText[j] !== ']') {
        if (streamText[j] === '(') {
          const parsed = parsePdfLiteralString(streamText, j);
          arrayText += parsed.text;
          j = parsed.endIdx;
        } else if (streamText[j] === '<' && streamText[j + 1] !== '<') {
          const parsed = parsePdfHexString(streamText, j);
          arrayText += parsed.text;
          j = parsed.endIdx;
        } else if (/[-0-9]/.test(streamText[j])) {
          let numStr = '';
          while (j < len && /[-0-9.]/.test(streamText[j])) {
            numStr += streamText[j];
            j++;
          }
          const num = parseFloat(numStr);
          if (num <= -120) {
            arrayText += ' ';
          }
        } else {
          j++;
        }
      }
      i = j + 1;
      while (i < len && /\s/.test(streamText[i])) i++;
      if (streamText.slice(i, i + 2) === 'TJ') {
        output += arrayText;
        i += 2;
      } else {
        output += arrayText + ' ';
      }
      continue;
    }

    if (ch === 'T' && streamText[i + 1] === '*') {
      output += '\n';
      i += 2;
      continue;
    }
    if (
      ch === 'T' &&
      (streamText[i + 1] === 'd' || streamText[i + 1] === 'D') &&
      (i === 0 || /\s/.test(streamText[i - 1])) &&
      (i + 2 >= len || /\s/.test(streamText[i + 2]))
    ) {
      output += '\n';
      i += 2;
      continue;
    }
    if (
      ch === 'E' &&
      streamText[i + 1] === 'T' &&
      (i === 0 || /\s/.test(streamText[i - 1])) &&
      (i + 2 >= len || /\s/.test(streamText[i + 2]))
    ) {
      output += '\n';
      i += 2;
      continue;
    }

    i++;
  }

  return output;
}

/**
 * Extracts readable text streams from PDF buffers using stream inflation and structure-aware parsing.
 */
function extractTextFromPdf(buffer: Buffer): string {
  let text = '';
  const bufStr = buffer.toString('binary');
  const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamRegex.exec(bufStr)) !== null) {
    const rawStream = Buffer.from(match[1], 'binary');
    let decompressed: Buffer | null = null;
    try {
      decompressed = inflateSync(rawStream);
    } catch {
      try {
        decompressed = inflateRawSync(rawStream);
      } catch {
        decompressed = rawStream;
      }
    }
    if (decompressed) {
      const streamText = decompressed.toString('latin1');
      const extracted = extractTextFromPdfStream(streamText);
      if (extracted.trim()) {
        text += extracted + '\n\n';
      }
    }
  }

  if (text.trim().length < 50) {
    const rawVisible = buffer
      .toString('utf8')
      .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
      .replace(/\s+/g, ' ');
    if (rawVisible.length > text.length) {
      text = rawVisible;
    }
  }

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * Assesses the extraction quality of an uploaded CV.
 * Catches scanned/image PDFs, unreadable documents, binary garbage, and non-CV text.
 */
function assessDocumentQuality(
  rawText: string,
  fileExtension?: string,
  fileSize?: number
): {
  isAcceptable: boolean;
  isScannedPdf: boolean;
  quality: 'high' | 'medium' | 'low' | 'failed';
  errorMessage?: string;
} {
  const trimmed = rawText.trim();
  const totalLength = trimmed.length;

  // 1. Scanned / image-only PDF check
  if (fileExtension === '.pdf' && fileSize && fileSize > 25000 && totalLength < 80) {
    return {
      isAcceptable: false,
      isScannedPdf: true,
      quality: 'failed',
      errorMessage:
        'We could not extract readable text from this document. It appears to be a scanned or image-based PDF. Automated text extraction without OCR is not supported for scanned images. Please upload a text-based PDF or DOCX, or paste your CV text directly.',
    };
  }

  // 2. Minimum readable characters
  if (totalLength < 50) {
    return {
      isAcceptable: false,
      isScannedPdf: false,
      quality: 'failed',
      errorMessage:
        'We could not reliably read this CV. The document has insufficient readable text. Please upload a clearer PDF or DOCX, or paste your CV text directly.',
    };
  }

  // 3. Printable character ratio (avoid binary noise)
  const printableMatches = trimmed.match(/[\x20-\x7E\n\r\t\u00A0-\u024F\u0600-\u06FF]/g) || [];
  const printableRatio = printableMatches.length / totalLength;
  if (printableRatio < 0.6) {
    return {
      isAcceptable: false,
      isScannedPdf: false,
      quality: 'failed',
      errorMessage:
        'The uploaded document could not be decoded into readable text. Please check the file encoding or upload a standard DOCX/PDF.',
    };
  }

  // 4. CV signal detection
  const cvSignalRegex =
    /\b(experience|education|skills|projects|employment|curriculum\s+vitae|resume|qualification|university|college|bachelor|master|degree|engineer|analyst|developer|manager|specialist|consultant|responsibilities|achievements)\b/i;
  const contactSignalRegex =
    /\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\+?\d[\d\s.-]{8,}\d|linkedin\.com|github\.com)\b/i;

  const hasCvSignals = cvSignalRegex.test(trimmed);
  const hasContact = contactSignalRegex.test(trimmed);

  if (!hasCvSignals && !hasContact && totalLength < 300) {
    return {
      isAcceptable: false,
      isScannedPdf: false,
      quality: 'failed',
      errorMessage:
        'The uploaded document does not appear to be a CV or resume. Please upload a valid resume.',
    };
  }

  let quality: 'high' | 'medium' | 'low' = 'low';
  if (totalLength > 400 && hasCvSignals && hasContact) {
    quality = 'high';
  } else if (totalLength > 200 && (hasCvSignals || hasContact)) {
    quality = 'medium';
  }

  return { isAcceptable: true, isScannedPdf: false, quality };
}

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

/**
 * Deterministic CV parser used when document text is extracted and
 * Gemini is offline, rate-limited, or unavailable. Never invents data.
 */
function parseCvTextDeterministically(rawText: string, targetRoleTitle: string): JsonObject {
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let email = '';
  let phone = '';
  let location = '';
  let fullName = '';
  let linkedin = '';
  let github = '';
  let website = '';
  const title = targetRoleTitle || '';

  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
  const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\+?\d[\d\s.-]{8,}\d/;
  const locationRegex = /\b([A-Z][a-zA-Z\s.-]+,\s*[A-Z]{2}\b|[A-Z][a-zA-Z\s.-]+,\s*[A-Z][a-zA-Z\s]+)/;
  const linkedinRegex = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:in|profile)\/([a-zA-Z0-9_-]+)/i;
  const githubRegex = /(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_-]+)/i;
  const urlRegex = /https?:\/\/[^\s]+/i;

  for (const line of lines.slice(0, 20)) {
    if (!email && emailRegex.test(line)) {
      email = line.match(emailRegex)![0];
    }
    if (!phone && phoneRegex.test(line)) {
      phone = line.match(phoneRegex)![0].trim();
    }
    if (!location && locationRegex.test(line)) {
      location = line.match(locationRegex)![0].trim();
    }
    if (!linkedin && linkedinRegex.test(line)) {
      linkedin = line.match(linkedinRegex)![0];
    }
    if (!github && githubRegex.test(line)) {
      github = line.match(githubRegex)![0];
    }
    if (!website && urlRegex.test(line) && !line.includes('linkedin.com') && !line.includes('github.com')) {
      website = line.match(urlRegex)![0];
    }
  }

  // Name extraction: first non-contact line with 2-4 capitalized words
  for (const line of lines.slice(0, 6)) {
    const clean = line.replace(/^[#*\s_-]+/, '').replace(/[#*\s_-]+$/, '').trim();
    if (
      clean.length > 2 &&
      clean.length < 50 &&
      !emailRegex.test(clean) &&
      !phoneRegex.test(clean) &&
      !urlRegex.test(clean) &&
      !/resume|curriculum|vitae|\bcv\b|profile|summary|experience|portfolio/i.test(clean) &&
      /^[A-Z][a-zA-Z'.\-]+(?:\s+[A-Z][a-zA-Z'.\-]+){1,3}$/.test(clean)
    ) {
      fullName = clean;
      break;
    }
  }

  const sections: Record<string, string[]> = {
    header: [],
    summary: [],
    experience: [],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
    languages: [],
  };

  let currentSection = 'header';
  const headingMap = [
    { regex: /^(?:professional\s+)?summary|career\s+objective|profile|about(?:\s+me)?\b/i, key: 'summary' },
    { regex: /^(?:work\s+|professional\s+)?experience|employment(?:\s+history)?|work\s+history|career\s+history\b/i, key: 'experience' },
    { regex: /^education|academic(?:\s+background|\s+history)?|qualifications\b/i, key: 'education' },
    { regex: /^(?:technical\s+|core\s+)?skills|core\s+competencies|technologies|tools(?:\s+&\s+tech)?\b/i, key: 'skills' },
    { regex: /^(?:key\s+|personal\s+|technical\s+)?projects|portfolio\b/i, key: 'projects' },
    { regex: /^certifications|certificates|licenses|credentials|courses\b/i, key: 'certifications' },
    { regex: /^languages(?:\s+spoken|\s+proficiency)?\b/i, key: 'languages' },
  ];

  for (const line of lines) {
    const clean = line.replace(/^[\s#*_-]+/, '').replace(/[\s#*_-]+$/, '').trim();
    let matched = false;
    if (clean.length < 40) {
      for (const h of headingMap) {
        if (h.regex.test(clean)) {
          currentSection = h.key;
          matched = true;
          break;
        }
      }
    }
    if (!matched) {
      sections[currentSection].push(line);
    }
  }

  // Only real summary text from the document
  const summary = sections.summary.join(' ').slice(0, 1500).trim();

  // Skills normalized through canonical skill map
  const rawSkillsText = sections.skills.join(', ');
  const rawSkillsList = Array.from(
    new Set(
      rawSkillsText
        .split(/[,•|·\n\r/]/)
        .map((s) => s.replace(/^[*\s\-•]+/, '').replace(/[:]$/, '').trim())
        .filter((s) => s.length >= 2 && s.length <= 40 && !headingMap.some((h) => h.regex.test(s)))
    )
  );
  const skillsList = Array.from(new Set(rawSkillsList.map(canonicalizeSkill).filter(Boolean))).slice(0, 30);

  const experiences: Array<{
    id: string;
    company: string;
    role: string;
    period: string;
    location: string;
    bullets: string[];
  }> = [];

  const expLines = sections.experience;
  let currExp: (typeof experiences)[0] | null = null;
  const dateRangeRegex =
    /\b((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?|\d{1,2}[\/.-])?\s*(?:19\d\d|20\d\d))\s*(?:–|-|to|until)\s*(Present|Current|Now|(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?|\d{1,2}[\/.-])?\s*(?:19\d\d|20\d\d)))/i;

  for (const line of expLines) {
    const isBullet = /^[•\-*]/.test(line);
    const dateMatch = line.match(dateRangeRegex);

    if (!isBullet && (dateMatch || line.includes(' | '))) {
      if (currExp && (currExp.company || currExp.role)) {
        experiences.push(currExp);
      }
      const parts = line.split(/[-–|]/).map((p) => p.trim());
      const comp = parts[0] || '';
      const r = parts[1] || '';
      const period = dateMatch ? dateMatch[0].trim() : parts[2] || '';

      currExp = {
        id: 'exp-' + Math.random().toString(36).slice(2, 9),
        company: comp.replace(dateRangeRegex, '').trim(),
        role: r.replace(dateRangeRegex, '').trim(),
        period,
        location: '',
        bullets: [],
      };
    } else if (currExp && isBullet) {
      const bulletText = line.replace(/^[•\-*\s]+/, '').trim();
      if (bulletText) currExp.bullets.push(bulletText);
    } else if (currExp && line.trim().length > 0) {
      if (!currExp.role && line.length < 50 && !currExp.bullets.length) {
        currExp.role = line.trim();
      } else {
        currExp.bullets.push(line.trim());
      }
    }
  }
  if (currExp && (currExp.company || currExp.role)) {
    experiences.push(currExp);
  }

  const education: Array<{
    id: string;
    institution: string;
    degree: string;
    field: string;
    period: string;
    gpa: string;
  }> = [];

  const eduLines = sections.education;
  for (const line of eduLines) {
    if (line.length > 5) {
      const yearMatch = line.match(/\b(19\d\d|20\d\d)\b/);
      const degreeMatch = line.match(
        /\b(bachelor|master|ph\.?d|b\.?s\.?|m\.?s\.?|b\.?a\.?|m\.?b\.?a\.?|diploma|associate)\b[^\n,–|]*/i
      );
      const parts = line.split(/[-–|,]/).map((p) => p.trim());

      education.push({
        id: 'edu-' + Math.random().toString(36).slice(2, 9),
        institution: parts[0] || line,
        degree: degreeMatch ? degreeMatch[0].trim() : '',
        field: '',
        period: yearMatch ? yearMatch[0] : '',
        gpa: '',
      });
      if (education.length >= 4) break;
    }
  }

  const projects: Array<{
    id: string;
    title: string;
    role: string;
    technologies: string[];
    bullets: string[];
  }> = [];

  let currProj: (typeof projects)[0] | null = null;
  for (const line of sections.projects) {
    const isBullet = /^[•\-*]/.test(line);
    if (!isBullet && line.length > 3 && line.length < 80) {
      if (currProj) projects.push(currProj);
      currProj = {
        id: 'proj-' + Math.random().toString(36).slice(2, 9),
        title: line.replace(/^[#*\s-]+/, '').trim(),
        role: '',
        technologies: [],
        bullets: [],
      };
    } else if (currProj && isBullet) {
      const bulletText = line.replace(/^[•\-*\s]+/, '').trim();
      if (bulletText) currProj.bullets.push(bulletText);
    } else if (currProj && line.trim().length > 0) {
      currProj.bullets.push(line.trim());
    }
  }
  if (currProj) projects.push(currProj);

  const certifications = sections.certifications
    .map((c) => c.replace(/^[•\-*\s]+/, '').trim())
    .filter((c) => c.length > 2 && c.length < 100)
    .slice(0, 10);

  return {
    fullName,
    email,
    phone,
    location,
    title: title || experiences[0]?.role || '',
    summary,
    linkedin,
    github,
    website,
    experiences,
    education,
    projects,
    skillsList,
    certifications,
  };
}

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

let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }
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
const ai = {
  get models() {
    return getAiClient().models;
  },
};

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
//
// `modelConfigured` reports WHETHER a model is configured — never the key
// itself. It lets a client (and the test suite) tell "there is no model on
// this server" apart from "the model's quota is exhausted", which are very
// different problems.
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    modelConfigured: Boolean(process.env.GEMINI_API_KEY),
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
 * Consumes one unit of the daily AI budget for this caller.
 *
 * Returns null when the request may proceed, or the 429 response to send
 * when the daily allowance is used up. The response carries a machine-readable
 * `code`, so a client can tell "your own daily allowance is spent" apart from
 * "the provider's quota is spent" — two different problems with two different
 * remedies.
 */
function consumeAiBudget(res: Response, userId?: string | null): Response | null {
  const budget = consumeDailyAiBudget(userId);
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
 * Consumes one unit of the daily AI budget WITHOUT answering the request.
 *
 * Used by the routes that have a working non-AI fallback (the CV upload
 * falls back to a deterministic parser): when the allowance is spent the
 * model is skipped and the route continues, so the user still gets a result.
 */
function tryConsumeAiBudget(userId?: string | null): boolean {
  return consumeDailyAiBudget(userId).allowed;
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
// The route makes up to two Gemini calls (parsing and ATS analysis), so it
// carries the same limiter as the other AI routes. Without it, repeated
// uploads were the cheapest way to exhaust the project's daily quota.
app.post('/api/resumes/upload', requireAuth, aiRateLimit, upload.single('file'), async (req: Request, res: Response) => {
  try {
    let rawText = '';

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

      // Extract text content from buffer
      if (extension === '.docx') {
        rawText = extractTextFromDocx(req.file.buffer);
      } else if (extension === '.pdf') {
        rawText = extractTextFromPdf(req.file.buffer);
      } else {
        rawText = req.file.buffer.toString('utf-8');
      }
    } else if (req.body.text) {
      rawText = req.body.text;
    } else {
      return res.status(400).json({ error: 'No CV file or text provided' });
    }

    // Validate document readability and quality
    const qualityAssessment = assessDocumentQuality(
      rawText,
      req.file ? req.file.originalname.slice(req.file.originalname.lastIndexOf('.')).toLowerCase() : undefined,
      req.file?.size
    );

    if (!qualityAssessment.isAcceptable) {
      return res.status(400).json({
        error:
          qualityAssessment.errorMessage ||
          'Unable to extract sufficient readable text from the document.',
        isScannedPdf: qualityAssessment.isScannedPdf,
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
    // Resolved through the shared catalogue so the deterministic ATS
    // fallback uses the keywords that actually matter for this role.
    const catalogueRole = resolveRole(targetRoleTitle);

    // Parse CV text using Gemini with strict JSON schema and deterministic fallback
    const parsePrompt = `You are a professional, high-accuracy CV/resume parser.
Extract and structure the following CV text into JSON matching this exact schema:
{
  "documentType": "cv",
  "fullName": string,
  "email": string,
  "phone": string,
  "location": string,
  "title": string,
  "summary": string,
  "linkedin": string,
  "github": string,
  "website": string,
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

CRITICAL RULES:
1. Extract ONLY facts explicitly stated in the CV.
2. NEVER invent, fabricate, hallucinate or guess any details (companies, dates, degrees, projects, skills). If a field or section is not in the text, return an empty string "" or empty array [].
3. If the text does not appear to be a CV or resume (e.g. invoice, source code, terms of service), set "documentType" to "not_a_cv".
4. For dates: use "Month YYYY" or "YYYY" where available. If currently working, set period to "YYYY - Present". Never invent days or months if only the year is stated.
5. In skillsList: extract individual canonical skill names. Avoid long sentences.

CV Text:
${rawText.slice(0, 12000)}

Return only valid JSON.`;

    let parsedCV: any = null;
    let geminiFailed = false;

    // The daily AI budget is spent only when a model call is actually made.
    // When the allowance is used up the upload still succeeds: the
    // deterministic parser below produces the CV without the model.
    const parseBudget = tryConsumeAiBudget(req.authUser!.id);

    if (process.env.GEMINI_API_KEY && parseBudget) {
      try {
        const response = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: parsePrompt,
          config: { responseMimeType: 'application/json' },
        });
        parsedCV = JSON.parse(response.text || '{}');
        if (parsedCV?.documentType === 'not_a_cv') {
          return res.status(400).json({
            error: 'The uploaded document does not appear to be a CV or resume.',
          });
        }
        const parsedCvErrors = validateParsedCvPayload(parsedCV);
        if (parsedCvErrors.length > 0) {
          throw new Error(`Invalid parsed CV payload: ${parsedCvErrors.join(', ')}`);
        }
      } catch (e: any) {
        if (e?.message?.includes('not appear to be a CV')) throw e;
        console.warn('Gemini CV parsing unavailable or rate-limited; falling back to deterministic extraction:', e);
        // The provider never served this request, so the daily budget gets
        // its unit back.
        if (isQuotaError(e)) refundDailyAiBudget(req.authUser!.id);
        geminiFailed = true;
      }
    } else {
      geminiFailed = true;
    }

    if (!parsedCV || geminiFailed) {
      try {
        parsedCV = parseCvTextDeterministically(rawText, targetRoleTitle);
        const fallbackErrors = validateParsedCvPayload(parsedCV);
        if (fallbackErrors.length > 0) {
          throw new Error(`Deterministic parsed CV invalid: ${fallbackErrors.join(', ')}`);
        }
      } catch (fallbackErr) {
        console.error('CV parsing unavailable:', fallbackErr);
        return res.status(503).json({
          error:
            'CV parsing is temporarily unavailable. Your file was not saved; please try again shortly.',
        });
      }
    }

    // Canonicalize and deduplicate extracted skills against the shared catalogue
    if (parsedCV && Array.isArray(parsedCV.skillsList)) {
      parsedCV.skillsList = Array.from(
        new Set(
          parsedCV.skillsList
            .map((s: string) => (typeof s === 'string' ? canonicalizeSkill(s) : ''))
            .filter(Boolean)
        )
      );
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
    // The ATS pass is a second model call, so it draws its own unit from the
    // daily budget. When the allowance is spent the deterministic diagnostic
    // below is used instead — the upload still succeeds.
    const atsBudget = tryConsumeAiBudget(req.authUser!.id);
    if (process.env.GEMINI_API_KEY && !geminiFailed && atsBudget) {
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
        console.warn('ATS analysis unavailable:', e);
        if (isQuotaError(e)) refundDailyAiBudget(req.authUser!.id);
        atsAnalysis = null;
      }
    }

    if (!atsAnalysis) {
      // Deterministic ATS diagnostic based on the role's own keywords. The
      // list used to be a hard-coded JavaScript/React/Python set, which
      // scored a CV for an HR or finance role against the wrong vocabulary.
      const lowerText = rawText.toLowerCase();
      const sampleKeywords = (
        catalogueRole
          ? [
              ...catalogueRole.requiredSkills.map((skill) => skill.name),
              ...catalogueRole.preferredSkills.map((skill) => skill.name),
              ...catalogueRole.tools,
            ]
          : []
      )
        .map((keyword) => keyword.toLowerCase())
        .filter((keyword) => keyword.length >= 3)
        .slice(0, 12);
      if (sampleKeywords.length === 0) {
        // No catalogue role: fall back to the section structure only, and say
        // so rather than inventing a keyword score.
        atsAnalysis = {
          overallScore: 50,
          breakdown: {
            keywordsMatch: 0,
            impactAndMetrics: 50,
            formattingStructure: 85,
            experienceRelevance: 50,
          },
          matchedKeywords: [],
          missingKeywords: [],
          actionableImprovements: [
            {
              section: 'skills',
              currentText: '',
              suggestedText: 'Set a target role so the keyword diagnostic can be tailored',
              reason: 'A target role is required for a meaningful keyword check',
            },
          ],
        };
      } else {
        const matched = sampleKeywords.filter((k) => lowerText.includes(k));
        const missing = sampleKeywords.filter((k) => !lowerText.includes(k)).slice(0, 3);
        const score = Math.min(95, Math.max(50, Math.round(50 + (matched.length / sampleKeywords.length) * 45)));
        atsAnalysis = {
          overallScore: score,
          breakdown: {
            keywordsMatch: Math.min(100, matched.length * 12),
            impactAndMetrics: 75,
            formattingStructure: 85,
            experienceRelevance: 80,
          },
          matchedKeywords: matched,
          missingKeywords: missing,
          actionableImprovements: missing.map((m) => ({
            section: 'skills',
            currentText: '',
            suggestedText: `Consider showcasing experience with ${m}`,
            reason: `Frequently requested for ${targetRoleTitle} roles`,
          })),
        };
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
    await setActiveCv(userId, cvRow.id);
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

/**
 * Sensitive account operations (password, email, deletion) verify the current
 * password or destroy the account. They are rate-limited per verified user so
 * a stolen session cannot brute-force the password or hammer the endpoint.
 */
const accountRateLimit = rateLimit(10, 60_000, 'account');

// AI Copilot with Contextual Page Understanding & Action Proposals
app.post('/api/copilot', requireAuth, aiRateLimit, async (req: Request, res: Response) => {
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
    const careerContext = await loadAiCareerContext(req.authUser!.id);
    const contextBlock = buildAiContextBlock(careerContext);

    // The active view is a UI hint, not a career fact, so it is still taken
    // from the client — but it is length-capped and string-typed.
    const activeView = str(req.body?.context?.activeView, 40) ?? 'dashboard';

    // No model on this server means no result can be produced. This is
    // checked before the daily budget is touched, so a missing key is never
    // reported as an exhausted quota.
    if (!process.env.GEMINI_API_KEY) {
      return modelUnavailable(res);
    }

    const systemInstruction = `You are CareerPilot Copilot, an AI career advisor that works across every career domain — technology, engineering, data, design, product, business, operations, finance, marketing, sales, people and HR, healthcare, education, and legal.
You are given the user's real career state below, read from their CareerPilot account.
The user is currently looking at the "${activeView}" screen of the app.

${contextBlock}

Rules:
1. Provide concise, highly actionable career strategy grounded in the state above.
2. If the user asks you to change something, propose a concrete, structured change to their roadmap or skills.
3. Never assume the user is in a technical role. Use their actual target role and domain.
4. Support Arabic if requested or if the prompt is in Arabic.
5. Give 3 short, relevant follow-up suggestions.
6. If you do not have the information to answer accurately, say what is missing instead of guessing.`;

    const blocked = consumeAiBudget(res, req.authUser!.id);
    if (blocked) return blocked;

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
        suggestions: [
          'What should I prioritize today?',
          'Audit my CV bullet points',
          'Give me an interview question for my target role',
        ],
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
app.post('/api/analyze-career', requireAuth, aiRateLimit, async (req: Request, res: Response) => {
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

    const prompt = `Analyze candidate for role "${resolvedRoleTitle}".
Current persona: "${persona}".
Skills: ${JSON.stringify(userSkills)}.
Required for role: ${JSON.stringify(requiredSkills)}.
Analyse the candidate for this role in this domain. Do not assume a technical or software role; judge the candidate against the requirements of the role that was given.

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
    if (!process.env.GEMINI_API_KEY) {
      return modelUnavailable(res);
    }

    const blocked = consumeAiBudget(res, req.authUser!.id);
    if (blocked) return blocked;

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

    // No model on this server means no analysis can be produced. This is
    // checked before the daily budget is touched, so a missing key is never
    // reported as an exhausted quota.
    if (!process.env.GEMINI_API_KEY) {
      return modelUnavailable(res);
    }

    const blocked = consumeAiBudget(res, req.authUser!.id);
    if (blocked) return blocked;

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
app.post('/api/mock-interview', requireAuth, aiRateLimit, async (req: Request, res: Response) => {
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
    const prompt = `Evaluate interview answer for "${safeRoleTitle}". Type: ${safeType}.
Question: "${safeQuestion}"
Answer: "${safeAnswer}"
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
    if (!process.env.GEMINI_API_KEY) {
      return modelUnavailable(res);
    }

    const blocked = consumeAiBudget(res, req.authUser!.id);
    if (blocked) return blocked;

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
app.post('/api/suggest-summary', requireAuth, aiRateLimit, async (req: Request, res: Response) => {
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
    const prompt = `Write a high-impact, professional, authentic 3-4 sentence professional summary for a resume/profile.
Person: ${safeName}
Target Role: ${summaryRoleTitle}
Career State: ${safeCareerState}
Years of Experience: ${safeYears}
Core Skills: ${safeSkills}
Key Achievements: ${safeAchievements}

Requirements:
- First-person or punchy executive third-person tone.
- Emphasize business impact and mastery of the skills the role actually requires.
- Do not invent non-existent companies or fabricated awards.
- Return JSON: { "suggestedSummary": string }`;

    // No model on this server means no summary can be produced. This is
    // checked before the daily budget is touched, so a missing key is never
    // reported as an exhausted quota.
    if (!process.env.GEMINI_API_KEY) {
      return modelUnavailable(res);
    }

    const blocked = consumeAiBudget(res, req.authUser!.id);
    if (blocked) return blocked;

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
app.post('/api/generate-cover-letter', requireAuth, aiRateLimit, async (req: Request, res: Response) => {
  try {
    const { company, jobTitle, jobDescription, candidateName, experiences, skills, projects, tone } = req.body;
    // Everything that reaches the model is bounded.
    const safeCompany = str(company, 200) ?? 'the company';
    const safeJobTitle = str(jobTitle, 200) ?? 'the role';
    const safeJobDescription = str(jobDescription, 4000) ?? 'Standard requirements';
    const safeCandidateName = str(candidateName, 200) ?? 'Candidate';
    const safeTone = str(tone, 80) ?? 'Professional & Confident';
    const safeExperiences = boundedList(experiences, 20, 400);
    const safeSkills = boundedList(skills, 40, 120);
    const safeProjects = boundedList(projects, 20, 400);
    const prompt = `Write a tailored, compelling cover letter for:
Candidate: ${safeCandidateName}
Company: ${safeCompany}
Role: ${safeJobTitle}
Tone: ${safeTone}
Job Requirements/Context: ${safeJobDescription}
Candidate Relevant Background:
- Experiences: ${JSON.stringify(safeExperiences)}
- Core Skills: ${JSON.stringify(safeSkills)}
- Key Projects: ${JSON.stringify(safeProjects)}

Rules:
1. Ground every claim strictly in candidate's provided experiences and projects. DO NOT invent false metrics or companies.
2. Structure: Strong hook expressing excitement for ${safeCompany}, high-relevance achievement showcase directly matching the job, and proactive closing.
3. Keep it under 350 words.
4. Return JSON: { "coverLetter": string, "keyHighlights": [string] }`;

    // No model on this server means no cover letter can be produced. This is
    // checked before the daily budget is touched, so a missing key is never
    // reported as an exhausted quota.
    if (!process.env.GEMINI_API_KEY) {
      return modelUnavailable(res);
    }

    const blocked = consumeAiBudget(res, req.authUser!.id);
    if (blocked) return blocked;

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
 * Bounds a list that is about to be embedded in an AI prompt.
 *
 * The count and each entry's length are both capped, so a single request
 * cannot push an unbounded payload into the model's context and consume the
 * project's daily quota.
 */
const boundedList = (value: unknown, maxItems: number, maxItemLength: number): unknown[] => {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).map((entry) => {
    if (typeof entry === 'string') return entry.slice(0, maxItemLength);
    if (entry && typeof entry === 'object') {
      // Keep the shape but bound every string inside it.
      const bounded: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(entry as Record<string, unknown>)) {
        bounded[key] = typeof item === 'string' ? item.slice(0, maxItemLength) : item;
      }
      return bounded;
    }
    return entry;
  });
};

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
    if (issueDate && Number.isNaN(new Date(issueDate).getTime())) {
      return res.status(400).json({ error: 'Invalid issueDate' });
    }
    const expiryDate = str(body.expiryDate, 40);
    if (expiryDate && Number.isNaN(new Date(expiryDate).getTime())) {
      return res.status(400).json({ error: 'Invalid expiryDate' });
    }
    const certificationUrl = parseHttpUrl(body.url, 500);
    if (!certificationUrl.valid) {
      return res.status(400).json({ error: 'url must be an http(s) URL' });
    }
    const certification = await createCertification(req.authUser!.id, {
      name,
      issuer: str(body.issuer, 200) ?? undefined,
      issueDate: issueDate ?? undefined,
      expiryDate: expiryDate ?? undefined,
      url: certificationUrl.value,
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
    const certificationUrl =
      body.url === undefined || body.url === null
        ? { valid: true, value: undefined }
        : parseHttpUrl(body.url, 500);
    if (!certificationUrl.valid) {
      return res.status(400).json({ error: 'url must be an http(s) URL' });
    }
    const certification = await updateCertification(req.authUser!.id, req.params.id, {
      name: str(body.name, 200) ?? undefined,
      issuer: body.issuer === null ? undefined : (str(body.issuer, 200) ?? undefined),
      issueDate: str(body.issueDate, 40) ?? undefined,
      expiryDate: str(body.expiryDate, 40) ?? undefined,
      url: certificationUrl.value,
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
      label: body.label === null ? undefined : (str(body.label, 200) ?? undefined),
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
      targetRole: body.targetRole === null ? undefined : (str(body.targetRole, 200) ?? undefined),
      targetIndustry:
        body.targetIndustry === null ? undefined : (str(body.targetIndustry, 200) ?? undefined),
      userType: (userType ?? undefined) as string | undefined,
      onboardingCompleted:
        typeof body.onboardingCompleted === 'boolean' ? body.onboardingCompleted : undefined,
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
// A bookmark stores only an opaque external job id. The current release has
// no live job feed, so a normal client has no bookmarks; the endpoint remains
// for a future provider. The owner is always the verified user id.
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
      // The AI enrichment is optional: the deterministic ranking is always
      // returned. It still draws on the daily budget, so it cannot be used to
      // drain the project's allowance.
      const aiBudget = tryConsumeAiBudget(req.authUser!.id);
      result = await enrichRecommendationsWithAi(deterministic, built.context, {
        ai:
          process.env.GEMINI_API_KEY && aiBudget ? getAiClient() : null,
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
