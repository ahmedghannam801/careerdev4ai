/**
 * Reads and updates the Supabase Auth URL configuration for the project.
 *
 * `SITE_URL` is the canonical origin Supabase redirects to after an email
 * confirmation, a password recovery or an OAuth callback. `URI_ALLOW_LIST`
 * is the set of origins a redirect is allowed to target.
 *
 * Usage:
 *   node scripts/supabase-auth-urls.mjs            # show the current config
 *   node scripts/supabase-auth-urls.mjs --set      # apply the Aionvia values
 */

import 'dotenv/config';

const PROJECT_REF = 'ciihprsfdojzvjnqgbxl';
const API = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`;

const NEW_SITE_URL = 'https://aionvia.pages.dev';

/**
 * The redirect allowlist.
 *
 * The new origin is the canonical one. The previous origins stay listed for
 * the length of the migration: password-recovery and email-confirmation links
 * that were already delivered to a user's inbox point at the old host, and
 * Supabase rejects a redirect whose target is not on this list.
 *
 * `com.careerpilot.ai://auth/callback` is the native application deep link.
 * The scheme is bound to an installed application id and cannot be renamed.
 */
const NEW_ALLOW_LIST = [
  'https://aionvia.pages.dev',
  'https://aionvia.pages.dev/',
  'https://aionvia.pages.dev/**',
  'https://*.aionvia.pages.dev/**',
  // The origin the platform was served from before the rebrand. Kept only so
  // links already delivered by email keep working while they age out.
  'https://roadmapak.pages.dev',
  'https://roadmapak.pages.dev/',
  'https://roadmapak.pages.dev/**',
  'https://*.roadmapak.pages.dev/**',
  'https://careerdev4ai.pages.dev',
  'https://careerdev4ai.pages.dev/',
  'https://careerdev4ai.pages.dev/**',
  'https://careerpilot4ai.pages.dev',
  'https://careerpilot4ai.pages.dev/',
  'https://careerpilot4ai.pages.dev/**',
  'http://localhost:3000',
  'http://localhost:3000/',
  'http://localhost:3000/**',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3000/**',
  'com.careerpilot.ai://auth/callback',
].join(',');

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN is not set.');
  process.exitCode = 1;
} else {
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const current = await fetch(API, { headers });
  if (!current.ok) {
    console.error(`GET ${API} -> ${current.status} ${await current.text()}`);
    process.exitCode = 1;
  } else {
    const config = await current.json();
    console.log('--- current Supabase Auth URL configuration ---');
    console.log('site_url           :', config.site_url);
    console.log('uri_allow_list     :', JSON.stringify(config.uri_allow_list));
    console.log('external_email     :', config.external_email_enabled);
    console.log('mailer_autoconfirm :', config.mailer_autoconfirm);

    if (process.argv.includes('--set')) {
      const patch = await fetch(API, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          site_url: NEW_SITE_URL,
          uri_allow_list: NEW_ALLOW_LIST,
        }),
      });
      console.log('');
      console.log(`PATCH -> ${patch.status}`);
      if (!patch.ok) {
        console.error(await patch.text());
        process.exitCode = 1;
      } else {
        const updated = await patch.json();
        console.log('site_url       :', updated.site_url);
        console.log('uri_allow_list :', JSON.stringify(updated.uri_allow_list));
      }
    }
  }
}
