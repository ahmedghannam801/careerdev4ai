// Positive and negative fixtures for custom security rules in .semgrep.yml.

// ruleid: typescript-no-dynamic-code-execution
eval(userInput);
// ruleid: typescript-no-dynamic-code-execution
new Function(userInput);
// ruleid: typescript-no-dynamic-code-execution
setTimeout("runUnsafe()", 10);
// ok: typescript-no-dynamic-code-execution
setTimeout(() => runSafe(), 10);

// ruleid: hardcoded-token-shaped-credential
const config = { api_key: "sk_live_1234567890abcdef" };
// ok: hardcoded-token-shaped-credential
const configFromEnv = { api_key: process.env.API_KEY };

// ruleid: vite-client-secret-reference
const serviceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
// ok: vite-client-secret-reference
const publicKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ruleid: javascript-unsafe-innerhtml-assignment
element.innerHTML = userContent;
// ok: javascript-unsafe-innerhtml-assignment
element.textContent = userContent;

// ruleid: jwt-decode-is-not-authentication
const claims = jwt.decode(token);
// ok: jwt-decode-is-not-authentication
const verified = await jwt.verify(token, publicKey);
