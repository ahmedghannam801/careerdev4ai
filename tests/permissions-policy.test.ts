/**
 * The browser permissions the product actually uses.
 *
 * The live voice interview asks for the microphone. A `Permissions-Policy`
 * that disables the microphone for the document is enforced by the browser
 * BEFORE the page's own permission prompt, so the user is never asked and the
 * app only sees `NotAllowedError`. That is exactly how the interview failed
 * in production: the header said `microphone=()`.
 *
 * The policy must stay least-privilege: the camera and geolocation are not
 * used anywhere, and they stay disabled. The microphone is allowed for this
 * origin only.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');

function read(relative: string): string {
  return readFileSync(join(ROOT, relative), 'utf8');
}

describe('Permissions-Policy', () => {
  it('allows the microphone for the app itself in the Pages headers', () => {
    const headers = read('public/_headers');
    assert.match(headers, /Permissions-Policy:\s*camera=\(\),\s*microphone=\(self\),\s*geolocation=\(\)/);
    assert.doesNotMatch(headers, /microphone=\(\)/);
  });

  it('allows the microphone for the app itself on API responses', () => {
    const server = read('app.ts');
    assert.match(
      server,
      /Permissions-Policy',\s*'camera=\(\), microphone=\(self\), geolocation=\(\)'/
    );
    assert.doesNotMatch(server, /microphone=\(\)/);
  });

  it('keeps the camera and geolocation disabled', () => {
    for (const source of [read('public/_headers'), read('app.ts')]) {
      assert.match(source, /camera=\(\)/);
      assert.match(source, /geolocation=\(\)/);
    }
  });
});

describe('the CSP the live interviewer needs', () => {
  it('lets the browser open the Gemini Live socket and load the PCM worklet', () => {
    const headers = read('public/_headers');
    const csp = headers.match(/Content-Security-Policy:\s*([^\n]+)/)?.[1] ?? '';

    // The token is spent from the browser, so the socket is a browser
    // connection. Without these origins the interview fails after the
    // microphone opens, which is harder to diagnose than a permission error.
    assert.match(csp, /connect-src[^;]*https:\/\/generativelanguage\.googleapis\.com/);
    assert.match(csp, /connect-src[^;]*wss:\/\/generativelanguage\.googleapis\.com/);
    // The PCM worklet is registered from a Blob URL.
    assert.match(csp, /script-src[^;]*blob:/);
    assert.match(csp, /worker-src[^;]*blob:/);
  });
});
