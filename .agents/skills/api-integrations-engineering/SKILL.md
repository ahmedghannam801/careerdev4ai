---
name: api-integrations-engineering
description: Governs third-party API integrations, OAuth scopes, rate limiting, retries, data normalization, and honest provider capabilities for CareerDev4AI.
---

# API Integrations Engineering Skill

This skill governs all external API integrations, third-party authentication protocols, job search adapters, educational catalog feeds, and AI model communication in CareerDev4AI.

## When to Use

Activate this skill when:
- Connecting or updating external APIs (Google Gemini API, OpenRouter, JSearch, LinkedIn OAuth).
- Handling API authentication, token exchange, authorization headers, and environment variables.
- Implementing rate limiting, exponential backoff, and circuit breaker patterns.
- Normalizing external data structures into CareerDev4AI canonical models.
- Auditing third-party permissions and ensuring honest representation of integration capabilities.

## Principles of Honest Integrations

1. **Strict OAuth & Permissions Honesty**:
   - Inspect approved developer scopes before claiming or implementing functionality.
   - For example: CareerDev4AI's LinkedIn app scopes are `openid email profile`. This permits sign-in with LinkedIn, but does NOT grant access to LinkedIn Talent Solutions or direct Job Listing APIs.
   - **Never scrape unauthorized services**: Do not use headless browser automation or unauthorized proxies to scrape external platforms.
   - Provide clean, verified deep-links or search entrypoints with explicit query parameters when direct APIs are not approved.

2. **AI Provider Abstraction**:
   - Google Gemini API (`@google/genai`) is the primary AI provider for career reasoning, CV tailoring, and learning guidance.
   - OpenRouter acts as a robust secondary fallback.
   - Never expose raw API keys to the browser; all AI requests must route through protected server endpoints (`/api/ai/*`).

3. **Data Normalization & Error Resilience**:
   - External data (e.g. JSearch job feeds, Coursera courses) must be normalized into typed internal interfaces (`JobPosting`, `CourseItem`).
   - Implement exponential backoff for transient HTTP errors (429 Too Many Requests, 503 Service Unavailable).
   - Gracefully handle empty or malformed API responses without breaking user workflows.

## Step-by-Step Integration Workflow

1. **Verify Credentials & Scopes**:
   - Check environment configuration (`GEMINI_API_KEY`, `RAPIDAPI_KEY`, `LINKEDIN_CLIENT_ID`).
   - Verify that credentials are read securely via `process.env` on server / Cloudflare Worker environment bindings (`env`).
2. **Implement Typed Client Wrapper**:
   - Encapsulate the API in a dedicated server module (`server/integrations/` or `server/db/`).
   - Define strict TypeScript request and response types.
3. **Add Rate Limiting & Timeout Guards**:
   - Wrap fetch calls with timeout abort signals (`AbortSignal.timeout(10000)`).
   - Implement retry logic with jitter for 429 and 5xx responses.
4. **Attribution & Provenance**:
   - Retain provider attribution (e.g. `source: 'jsearch'`, `provider: 'Coursera'`) so users know the origin of the data.

## Quality Checklist

- [ ] Are API credentials kept strictly server-side?
- [ ] Are integration scopes honestly reported without claiming unapproved capabilities?
- [ ] Is error handling robust against 429 rate limits, 500 server errors, and network timeouts?
- [ ] Are external responses validated and sanitized before entering the application state?
- [ ] Does the integration maintain accurate source attribution?

## Common Failure Patterns to Avoid

- **Scope Hallucination**: Assuming general OAuth access grants full read/write access to proprietary partner APIs.
- **Unbounded Retries**: Retrying 4xx errors infinitely, consuming API quotas and causing client hanging.
- **Unsanitized Third-Party Data**: Rendering raw HTML or unescaped strings returned from external APIs.
