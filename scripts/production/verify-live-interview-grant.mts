/**
 * Proves that the live interviewer can actually start a session.
 * ---------------------------------------------------------------------------
 * This mints ONE ephemeral token with the EXISTING Gemini credential and
 * throws it away. It writes nothing, it starts no conversation, and the token
 * is never printed: only its shape and its lifetime are reported.
 *
 * What it proves:
 *
 *   * the Gemini key the platform already uses is valid for the Live API;
 *   * the model identifier the platform asks for is accepted;
 *   * the ephemeral token can be minted at all — which is the step that used
 *     to be missing, and the reason a browser can never be handed the key.
 *
 *   npx tsx scripts/production/verify-live-interview-grant.mts
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { createLiveInterviewGrant } from '../../server/interviews/live.ts';

// The credential is read from the environment file, exactly as the server
// reads it, and it is never printed.
const env = readFileSync(path.join(process.cwd(), '.env'), 'utf8');
const key = env.match(/^GEMINI_API_KEY=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '');
if (!key) {
  console.error('GEMINI_API_KEY is not in .env');
  process.exit(1);
}
process.env.GEMINI_API_KEY = key;

try {
  const grant = await createLiveInterviewGrant({
    roleTitle: 'Data Analyst',
    domain: 'Data & Analytics',
    track: 'data_analysis',
    experienceLevel: 'junior',
    skills: ['SQL', 'Excel', 'Power BI'],
    type: 'technical',
    language: 'en',
    style: 'natural',
  });

  console.log('the session credential was issued');
  console.log('model:', grant.model);
  console.log('api version:', grant.apiVersion);
  console.log('language:', grant.language);
  console.log('type:', grant.type);
  console.log('expires at:', grant.expiresAt);
  // The token itself is never printed, and never leaves this process.
  console.log('token length:', grant.token.length);
  console.log('token prefix is a live-session credential:', grant.token.includes('tokens/'));
} catch (error) {
  console.error('the credential could not be issued:', (error as Error)?.message ?? error);
  process.exit(1);
}
