---
name: security-review
description: Enforces application security, secret detection, input sanitization, XSS/CSRF prevention, authentication boundaries, and compliance for CareerDev4AI.
---

# Security Review Skill

This skill governs threat modeling, vulnerability prevention, secret detection, access control verification, and secure coding practices across CareerDev4AI.

## When to Use

Activate this skill when:
- Conducting pre-deployment security reviews or auditing git diffs.
- Adding or modifying authentication flows, sessions, or authorization checks.
- Handling file uploads (CVs, resumes in PDF/DOCX) and parsing untrusted user documents.
- Sanitizing user input to prevent Cross-Site Scripting (XSS) and SQL Injection.
- Reviewing Cloudflare Worker headers, CORS configurations, and rate limiting policies.

## CareerDev4AI Security Tenets

1. **Zero Secret Leakage**:
   - Never commit API keys, database passwords, or JWT secrets to Git.
   - Scan git diffs for `.env` variables before committing.
   - Supabase `service_role` keys must NEVER appear in client-side code, `dist/`, or browser network payloads.

2. **Access Control & Row Level Security (RLS)**:
   - Every Supabase table must enforce RLS.
   - Every API endpoint that accesses or mutates user data must verify authentication tokens (`auth.uid()`).
   - Prevent Insecure Direct Object References (IDOR): never trust client-supplied IDs without verifying ownership.

3. **Input Sanitization & Safe Rendering**:
   - Prevent XSS by avoiding `dangerouslySetInnerHTML`.
   - Never render raw unescaped strings in HTML. In React, let JSX escape values safely, and avoid double-escaping entities (`&amp;` becomes raw text).
   - Sanitize and validate file uploads: enforce MIME type checks, maximum file size limits (e.g. 5MB for CVs), and parse PDFs using sandboxed libraries (`unpdf`).

4. **HTTP Security Headers & CORS**:
   - Cloudflare Pages / Workers must return modern security headers:
     - `Content-Security-Policy` (CSP)
     - `X-Content-Type-Options: nosniff`
     - `X-Frame-Options: DENY`
     - `Referrer-Policy: strict-origin-when-cross-origin`
   - Restrict CORS origins to trusted domains (`careerdev4ai.pages.dev` and local development).

## Step-by-Step Security Review Workflow

1. **Inspect Git Diff for Credentials**:
   - Run `git diff` and search for regex patterns: `(api_key|secret|password|bearer|service_role|token)`.
2. **Audit Endpoint Authorization**:
   - For every API route in `server/` and `worker/`, verify whether an auth token is required and validated.
   - Ensure unauthenticated callers receive HTTP 401 Unauthorized or HTTP 403 Forbidden.
3. **Audit Data Serialization**:
   - Verify that internal user credentials, emails, or password hashes are omitted from public profile responses.
4. **Audit Third-Party Dependencies**:
   - Run `npm audit` periodically to identify known CVEs in upstream packages.

## Quality Checklist

- [ ] Are all API secrets and service keys kept in environment variables?
- [ ] Is Row Level Security (RLS) enabled and verified on all tables?
- [ ] Are file uploads restricted to allowed MIME types and file sizes?
- [ ] Are all user inputs sanitized against XSS?
- [ ] Are security headers (`CSP`, `nosniff`, `X-Frame-Options`) configured?

## Common Failure Patterns to Avoid

- **Client-Side Admin Checks**: Checking `user.role === 'admin'` only in the frontend while leaving the backend API endpoint unprotected.
- **Leaked Error Traces**: Returning full database error stack traces containing table names and SQL queries to the browser.
- **Unchecked Redirects**: Accepting open redirect URLs (`returnUrl`) without validating against allowed origin domains.
