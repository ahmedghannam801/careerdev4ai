/**
 * Connects this deployment to Resend.
 *
 * What it does, in order, and why in this order:
 *
 *   1. reads the API key from `RESEND_API_KEY` or from a `.resend-key` file the
 *      owner drops in the repository root (the file is deleted once the key has
 *      been stored, so it is never left lying around);
 *   2. asks Resend which domains this account has verified, because the shared
 *      `@resend.dev` sender only delivers to the account owner and a verified
 *      domain is what makes the platform able to mail anybody;
 *   3. sends one real message to the recipient configured for the deployment,
 *      using the same code path the admin screen uses, so a passed check means
 *      the screen will work;
 *   4. only after that succeeds, writes the key to `.env` and `.dev.vars` and
 *      uploads it to the Cloudflare Pages project as a production secret;
 *   5. reports what it found and what it changed, without printing the key.
 *
 * Nothing is written before step 3 succeeds: a key that Resend rejects is not
 * worth storing anywhere.
 *
 * Run it with `npm run resend:connect`.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildTestEmail, isEmailAddress, sendEmail } from '../server/email/resend.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY_FILE = path.join(ROOT, '.resend-key');
const API = 'https://api.resend.com';

/** The project the deployment publishes to. */
const PAGES_PROJECT = 'aionvia';

function readKeyFile(): string | undefined {
  if (!fs.existsSync(KEY_FILE)) return undefined;
  const line = fs
    .readFileSync(KEY_FILE, 'utf8')
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith('re_'));
  return line;
}

/**
 * A sender read back from a file, or nothing.
 *
 * A stale `RESEND_FROM` is the most likely thing to be in that file and the
 * most likely thing to break every send, so it is checked before it is reused.
 */
function usableSender(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const address = /<([^>]+)>/.exec(value)?.[1] ?? value;
  return isEmailAddress(address.trim()) ? value.trim() : undefined;
}

/** Reads one value out of a dotenv-style file, without interpreting it. */
function readEnvValue(file: string, name: string): string | undefined {
  if (!fs.existsSync(file)) return undefined;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.startsWith(`${name}=`)) continue;
    return trimmed.slice(name.length + 1).trim();
  }
  return undefined;
}

/**
 * Sets a value in a dotenv-style file, keeping every other line untouched.
 *
 * The file is rewritten only when the value actually differs, so running the
 * script twice does not churn the file or invalidate anything watching it.
 */
function writeEnvValue(file: string, name: string, value: string): boolean {
  const exists = fs.existsSync(file);
  const contents = exists ? fs.readFileSync(file, 'utf8') : '';
  const lines = contents.length ? contents.split(/\r?\n/) : [];
  const index = lines.findIndex((line) => line.trim().startsWith(`${name}=`));

  if (index >= 0) {
    if (lines[index] === `${name}=${value}`) return false;
    lines[index] = `${name}=${value}`;
  } else {
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    lines.push(`${name}=${value}`, '');
  }

  fs.writeFileSync(file, lines.join('\n'));
  return true;
}

async function listVerifiedDomains(apiKey: string): Promise<string[]> {
  const response = await fetch(`${API}/domains`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    throw new Error(`Resend rejected the key (HTTP ${response.status}).`);
  }
  const payload = (await response.json()) as { data?: Array<{ name?: string; status?: string }> };
  return (payload.data ?? [])
    .filter((domain) => domain.status === 'verified' && typeof domain.name === 'string')
    .map((domain) => domain.name!);
}

/**
 * Uploads one production secret.
 *
 * The project's own Wrangler is used rather than a command from the PATH, so
 * the secret goes to the same project the deployment script publishes to. The
 * value arrives on stdin: Wrangler reads it there, and it never becomes an
 * argument that a process list would show.
 */
function uploadSecret(name: string, value: string): { ok: boolean; detail: string } {
  const wrangler = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  const result = spawnSync(
    process.execPath,
    [wrangler, 'pages', 'secret', 'put', name, '--project-name', PAGES_PROJECT],
    { cwd: ROOT, input: `${value}\n`, encoding: 'utf8', timeout: 180_000 },
  );
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  const detail = output.split(/\r?\n/).filter(Boolean).pop() ?? '';
  return { ok: result.status === 0, detail };
}

async function main() {
  const apiKey = (process.env.RESEND_API_KEY ?? readKeyFile() ?? '').trim();
  if (!apiKey.startsWith('re_')) {
    console.error(
      [
        'No Resend API key found.',
        '',
        'Create one at https://resend.com/api-keys (sending access is enough),',
        `then paste it on its own line in ${path.relative(ROOT, KEY_FILE)} and run this again.`,
        'The file is deleted once the key has been stored.',
      ].join('\n'),
    );
    process.exitCode = 1;
    return;
  }

  const recipient =
    readEnvValue(path.join(ROOT, '.env'), 'RESEND_TEST_RECIPIENT') ??
    process.env.RESEND_TEST_RECIPIENT;
  if (!isEmailAddress(recipient)) {
    console.error('RESEND_TEST_RECIPIENT is not a usable address, so there is nowhere to send the check.');
    process.exitCode = 1;
    return;
  }

  const domains = await listVerifiedDomains(apiKey);
  const existingSender = usableSender(readEnvValue(path.join(ROOT, '.env'), 'RESEND_FROM'));
  // A verified domain is what lets the platform mail anyone. `noreply@` is the
  // conventional transactional mailbox: it promises no conversation, so a
  // reply that is never read is not a broken promise.
  const discoveredSender = domains.length ? `Aionvia <noreply@${domains[0]}>` : undefined;
  const sender = existingSender ?? discoveredSender;

  const message = buildTestEmail(recipient);
  const send = await sendEmail(
    {
      to: recipient,
      subject: message.subject,
      html: message.html,
      text: message.text,
    },
    `aionvia-connect/${Date.now()}`,
    // The key and the sender are passed in because neither is stored yet: they
    // are stored only once Resend has accepted a message with them.
    { sender, apiKey },
  );

  if (!send.ok) {
    console.error(
      send.status === null
        ? 'The request to Resend failed before it reached the API.'
        : `Resend refused the test message (HTTP ${send.status}). Check that the key is a sending key and that the sender address belongs to a verified domain.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Test message accepted by Resend (${send.id}).`);

  const written: string[] = [];
  if (writeEnvValue(path.join(ROOT, '.env'), 'RESEND_API_KEY', apiKey)) written.push('.env');
  if (writeEnvValue(path.join(ROOT, '.dev.vars'), 'RESEND_API_KEY', apiKey)) {
    written.push('.dev.vars');
  }
  if (sender) {
    if (writeEnvValue(path.join(ROOT, '.env'), 'RESEND_FROM', sender)) written.push('.env (sender)');
    if (writeEnvValue(path.join(ROOT, '.dev.vars'), 'RESEND_FROM', sender)) {
      written.push('.dev.vars (sender)');
    }
  }

  console.log(written.length ? `Updated ${written.join(', ')}.` : 'Local files already up to date.');
  console.log(sender ? `Sending from ${sender}.` : 'Sending from the shared test address: only the account owner can receive it.');

  const keyUpload = uploadSecret('RESEND_API_KEY', apiKey);
  console.log(
    keyUpload.ok
      ? `Uploaded RESEND_API_KEY to the ${PAGES_PROJECT} production secrets.`
      : `Could not upload RESEND_API_KEY (${keyUpload.detail}). Run: npx wrangler pages secret put RESEND_API_KEY --project-name ${PAGES_PROJECT}`,
  );

  if (sender) {
    const senderUpload = uploadSecret('RESEND_FROM', sender);
    console.log(
      senderUpload.ok
        ? `Uploaded RESEND_FROM to the ${PAGES_PROJECT} production secrets.`
        : `Could not upload RESEND_FROM (${senderUpload.detail}).`,
    );
  }

  if (fs.existsSync(KEY_FILE)) {
    fs.rmSync(KEY_FILE);
    console.log('Removed the key file.');
  }

  console.log('Redeploy for the new secrets to reach the running deployment: npm run cf:deploy');
}

await main();
