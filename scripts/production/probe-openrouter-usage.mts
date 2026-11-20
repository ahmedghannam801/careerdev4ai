/**
 * Reads the usage counters of the OpenRouter key in `.env`.
 *
 * The platform has two AI providers and `universalAi` falls back from Gemini
 * to OpenRouter silently whenever Gemini fails. That silence hides a broken
 * Gemini key: every AI feature keeps working, served by the fallback, and
 * nothing anywhere reports that Gemini is down.
 *
 * The deployed Pages project shares this same OpenRouter key, so the usage
 * counters move when a *production* request was served by the fallback. The
 * counters are therefore a way to tell which provider answered a deployed
 * request without changing anything in production.
 *
 * Usage: npx tsx scripts/production/probe-openrouter-usage.mts
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function readEnv(): Record<string, string> {
  const entries: Record<string, string> = {};
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return entries;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 1) continue;
    entries[trimmed.slice(0, index).trim()] = trimmed
      .slice(index + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }
  return entries;
}

async function main(): Promise<void> {
  const env = readEnv();
  const key = env.OPENROUTER_API_KEY?.trim();
  if (!key) {
    console.log('[probe] OPENROUTER_API_KEY is not set in .env; nothing to read.');
    return;
  }

  const response = await fetch('https://openrouter.ai/api/v1/keys', {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!response.ok) {
    console.log(`[probe] OpenRouter answered ${response.status}; usage is not readable.`);
    return;
  }

  const payload = (await response.json()) as {
    data?: Array<{
      label?: string;
      usage?: number;
      limit_remaining?: number | null;
      usage_daily?: number;
      limit_daily?: number | null;
    }>;
  };
  const keys = payload.data ?? [];
  if (!keys.length) {
    console.log('[probe] OpenRouter returned no key records.');
    return;
  }
  for (const entry of keys) {
    console.log(
      `[probe] label=${entry.label ?? '?'} total=${entry.usage ?? 0} daily=${entry.usage_daily ?? 0} ` +
        `daily_remaining=${entry.limit_daily ?? 'n/a'} total_remaining=${entry.limit_remaining ?? 'n/a'}`
    );
  }
}

main().catch((error) => {
  console.error('[probe] error:', error?.message ?? error);
  process.exitCode = 1;
});
