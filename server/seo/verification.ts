/**
 * The Google Search Console verification file.
 *
 * Google verifies a domain by fetching a file at an exact path and reading
 * the token out of it. The path always ends in `.html`.
 *
 * That last part is the problem. Cloudflare Pages serves `foo.html` at `/foo`
 * and answers `/foo.html` with a permanent redirect to it. A verification
 * check that follows the redirect may pass, and one that does not follow it
 * will fail — and Google asks for the `.html` address specifically.
 *
 * The file is therefore served by the application as well as being published
 * as a static asset: the application answers the exact `.html` path with a
 * 200 and the token, and the static copy serves any deployment that does not
 * run the worker. Both carry the same bytes.
 */

/** The name of the verification file, as Google asks for it. */
export const VERIFICATION_FILE_NAME = 'googleecc4c0f834a5c71c.html';

/** The token the file must contain. */
export const VERIFICATION_TOKEN = 'google-site-verification: googleecc4c0f834a5c71c.html';

/** The path the verification file is served at. */
export const VERIFICATION_PATH = `/${VERIFICATION_FILE_NAME}`;

/** The body of the verification file. */
export function verificationFileBody(): string {
  return `${VERIFICATION_TOKEN}\n`;
}
