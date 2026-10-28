#!/usr/bin/env node
/**
 * Wrapper around the official Supabase MCP server (stdio transport).
 *
 * Why this exists: the MCP server needs a Supabase personal access token
 * (sbp_...). Keeping the token out of the MCP client config avoids writing a
 * secret into a tool config file, and follows the convention already used by
 * scripts/read-db-credential.ps1 — the token lives in the Windows Credential
 * Manager, never in the repository.
 *
 * Token resolution order:
 *   1. SUPABASE_ACCESS_TOKEN already in the environment
 *   2. SUPABASE_ACCESS_TOKEN from the local .env file (gitignored)
 *   3. %TEMP%\careerpilot-supabase-token.txt (written by read-db-credential.ps1)
 *   4. scripts/read-db-credential.ps1 (reads the Windows Credential Manager)
 *
 * Project ref resolution order:
 *   1. SUPABASE_PROJECT_REF environment variable
 *   2. .env
 *   3. supabase/.temp/project-ref (the CLI's linked project)
 */

import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const envFile = path.join(repoRoot, '.env');
const tokenFile = path.join(tmpdir(), 'careerpilot-supabase-token.txt');

function readEnvFile() {
  if (!existsSync(envFile)) return {};
  const out = {};
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i === -1) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

const fileEnv = readEnvFile();

function resolveToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  if (fileEnv.SUPABASE_ACCESS_TOKEN) return fileEnv.SUPABASE_ACCESS_TOKEN.trim();
  if (existsSync(tokenFile)) return readFileSync(tokenFile, 'utf8').trim();

  // Last resort: pull it straight out of the Windows Credential Manager.
  const ps = spawn(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(repoRoot, 'scripts', 'read-db-credential.ps1')],
    { stdio: 'ignore', windowsHide: true },
  );
  ps.on('exit', (code) => {
    if (code === 0 && existsSync(tokenFile)) {
      const token = readFileSync(tokenFile, 'utf8').trim();
      if (token) start(token, resolveProjectRef());
    } else {
      console.error('[supabase-mcp] Could not resolve a Supabase access token.');
      process.exit(1);
    }
  });
  return null;
}

function resolveProjectRef() {
  if (process.env.SUPABASE_PROJECT_REF) return process.env.SUPABASE_PROJECT_REF.trim();
  if (fileEnv.SUPABASE_PROJECT_REF) return fileEnv.SUPABASE_PROJECT_REF.trim();
  const linked = path.join(repoRoot, 'supabase', '.temp', 'project-ref');
  if (existsSync(linked)) return readFileSync(linked, 'utf8').trim();
  return null;
}

/**
 * Locates the MCP server entry point.
 *
 * The npm bin shim on Windows is a .ps1 file, which Node cannot exec directly,
 * so we always launch the server with `node` against its real script path.
 */
function resolveServerEntry() {
  const rel = path.join('@supabase', 'mcp-server-supabase', 'dist', 'cli.js');
  const candidates = [];

  if (process.env.SUPABASE_MCP_CLI) candidates.push(process.env.SUPABASE_MCP_CLI);

  // Global npm root without spawning npm.
  if (process.platform === 'win32' && process.env.APPDATA) {
    candidates.push(path.join(process.env.APPDATA, 'npm', 'node_modules', rel));
  } else if (process.env.npm_config_prefix) {
    candidates.push(path.join(process.env.npm_config_prefix, 'lib', 'node_modules', rel));
  }

  // Project-local install.
  candidates.push(path.join(repoRoot, 'node_modules', rel));

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }

  // Last resort: ask npm where its global root is.
  try {
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const root = execFileSync(npmCmd, ['root', '-g'], { encoding: 'utf8', windowsHide: true }).trim();
    const globalEntry = path.join(root, rel);
    if (existsSync(globalEntry)) return globalEntry;
  } catch {
    /* fall through to the error below */
  }

  return null;
}

function start(token, projectRef) {
  const entry = resolveServerEntry();
  if (!entry) {
    console.error('[supabase-mcp] Could not find @supabase/mcp-server-supabase.');
    console.error('[supabase-mcp] Install it with: npm install -g @supabase/mcp-server-supabase');
    process.exit(1);
  }

  const args = [entry];
  if (projectRef) args.push(`--project-ref=${projectRef}`);
  if (process.env.SUPABASE_MCP_READ_ONLY === '1') args.push('--read-only');

  const server = spawn(process.execPath, args, {
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
  });

  server.on('error', (err) => {
    console.error(`[supabase-mcp] Failed to start the MCP server: ${err.message}`);
    console.error('[supabase-mcp] Install it with: npm install -g @supabase/mcp-server-supabase');
    process.exit(1);
  });

  const forward = (signal) => () => server.kill(signal);
  process.on('SIGINT', forward('SIGINT'));
  process.on('SIGTERM', forward('SIGTERM'));
  server.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
}

const token = resolveToken();
if (token) start(token, resolveProjectRef());
