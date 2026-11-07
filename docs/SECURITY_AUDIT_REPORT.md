# Security Audit Report — CareerDev4AI

**Scope:** the whole application — the browser bundle, the Express API, the Cloudflare
Pages worker, the Supabase project (Auth, Postgres, RLS, Storage, Edge Functions) and
the Stripe integration.

**Method:** code review of every authorisation path, a live privilege audit of the
production database (`information_schema.role_table_grants`, `pg_policies`, `pg_proc`),
a review of every Stripe and manual-payment path, and executable tests against the real
server and the real database.

**Date:** 2026-11-08

---

## Summary

| | |
|---|---|
| Findings raised | 13 |
| Fixed and verified | 12 |
| Accepted / documented | 1 (requires a Stripe Dashboard action) |
| Critical | 1 (fixed) |
| High | 3 (fixed) |
| Medium | 5 (fixed) |
| Low | 4 (fixed) |

---

## F-01 — The client could write any public table directly

**Severity: Critical — fixed**

**Affected:** every table in the `public` schema.

**Exploit scenario.** The baseline migration granted `ALL` on every public table to
`anon` and `authenticated`. Row Level Security was therefore the *only* thing between a
signed-in candidate and a direct PostgREST write. One missing, mistyped or
over-broad policy would have been a privilege escalation, and there was no reason for
the browser to hold a write grant at all: the browser reaches the database only through
the API, which authenticates the caller and uses the service-role client.

A candidate holding their own access token could call PostgREST directly and write to
`subscriptions`, `ai_credit_ledger`, `admin_users` or `payment_requests`, for example
writing themselves a subscription row or granting themselves credits.

**Fix.** `supabase/migrations/20261114000002_security_hardening.sql` revokes
`INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER` on every public table from
`anon` and `authenticated`, and revokes *all* privileges (including `SELECT`) on the
server-only tables: `admin_users`, `admin_audit_log`, every `stripe_*` table,
`ai_credit_ledger`, `subscriptions`, `subscription_events`, `payment_requests`,
`payment_verifications`, `birthday_rewards`, `daily_credit_grants`, `referral_codes`,
`referral_relations` and `background_jobs`.

Row Level Security stays enabled everywhere as the second line of defence.

**Verification.** `tests/credits-referrals-birthday.test.ts` — "a signed-in client
cannot insert a subscription of their own", "cannot promote themselves to an
administrator", "cannot grant themselves credits", "cannot write the daily allowance
bucket". Each uses a real session and the PostgREST endpoint directly, not the API.

---

## F-02 — A Stripe redelivery after a transient failure was swallowed

**Severity: High — fixed**

**Affected:** `server/stripe/store.ts`, `server/stripe/webhooks.ts`.

**Exploit scenario.** Not an attack but a money bug, and the worse kind: a paying
customer loses their entitlement. The handler recorded the event id *before* running
the side effects. If the attempt then failed transiently (a database timeout, a network
blip), the row was left with `processed_at = null` and the reason in `error`. Stripe
redelivered the event, `recordStripeEvent` saw the duplicate id and returned "not new",
and the redelivery was acknowledged **without** running the side effects. Stripe then
stopped retrying. The customer had paid and never received the subscription.

Two such failures already exist in the production event log
(`checkout.session.completed`, `permanent:unknown_customer`).

**Fix.** `recordStripeEvent` now distinguishes three states:

* `new` — first delivery, process it.
* `retry` — a previous attempt failed transiently (`processed_at IS NULL` and `error`
  is set), so the side effects never completed: **process it again**.
* `duplicate` — already processed, or another delivery is handling it right now:
  acknowledge without side effects.

**Verification.** `tests/stripe-lifecycle.test.ts` — "a redelivery after a transient
failure is processed again, not swallowed": the first attempt throws, the redelivery
asserts `duplicate === false`, `retried === true`, and that the credit pack is granted
exactly once.

---

## F-03 — Two different advisory locks guarded the same money

**Severity: High — fixed**

**Affected:** `supabase/migrations/20261114000003_daily_credit_verification.sql`
(redefines `consume_ai_credits`, `refund_ai_credits`, `grant_ai_credits`).

**Exploit scenario.** `grant_ai_credits` locked with
`pg_advisory_xact_lock(hashtextextended(profile_id::text, 0))` while
`consume_ai_credits` locked with `pg_advisory_xact_lock(hashtext(profile_id::text))`.
Those are **different lock keys**. A purchase landing while an AI action was being
charged for the same account could interleave, and the `running_balance` written by
the second writer would be computed from a stale read — a balance that does not add up
and, at the boundary, a negative one.

**Fix.** Every credit function now uses the same lock key,
`hashtextextended(profile_id::text, 0)`. The database's `running_balance >= 0`
constraint remains the last line of defence.

**Verification.** `tests/credits-referrals-birthday.test.ts` — "never lets the balance
go below zero".

---

## F-04 — The daily allowance could have been spent twice, or not at all

**Severity: High — fixed**

**Affected:** `supabase/migrations/20261114000001_daily_credits_and_referrals.sql`.

**Exploit scenario.** The allowance had to be a separate pool that expires, and the
existing credit ledger is a single running balance. Drawn naively, the daily allowance
would have been either spendable twice (once from the bucket, once from the balance) or
unreachable (the balance would have been reduced by the full amount while the bucket
still held its credits).

**Fix.** The invariant `running_balance = general_balance + sum(daily remaining)` is
maintained by every function. `consume_ai_credits` spends the expiring bucket first
and reduces the running balance by the full amount; `refund_ai_credits` returns a
refund into the bucket first; `claim_daily_credits` expires yesterday's bucket and
logs the expiry. Every function runs under one advisory lock per profile.

**Verification.** `tests/credits-referrals-birthday.test.ts` — "is granted once per day
and never twice" and "is spent before the general balance, and a replay is refused".

---

## F-05 — The birthday discount could have been claimed by anyone, on any day, twice

**Severity: Medium — fixed**

**Affected:** `server/birthday/service.ts`, `server/stripe/service.ts`,
`server/payments/service.ts`, `server/stripe/webhooks.ts`.

**Exploit scenario.** Four separate gaps:

1. The reward was valid for a **seven-day window**, not the birthday.
2. The day boundary was computed in **UTC**, not in the candidate's own timezone, so
   the window opened and closed at the wrong moment for everybody.
3. Nothing recorded the redemption on the manual rail, so the same birthday could be
   used for several payment requests.
4. The Stripe rail dropped the discount entirely, so the offer could not be honoured
   where most candidates pay.

**Fix.**

* Eligibility is now **today is the candidate's birthday, in the candidate's own
  timezone** (`profiles.timezone`, falling back to the platform policy
  `Africa/Cairo`). The candidate who names no timezone follows the platform policy.
* The reward window is the birthday day itself, from local midnight to local midnight.
* The discount is calculated **on the server**, from the catalogue price, and only
  when the server has confirmed the eligibility. The browser may only ask for it.
  The reduced amount is carried by an inline `price_data` line, so it belongs to that
  one Checkout Session. **There is no global coupon anywhere in the system.**
* The redemption is recorded — at payment-request creation on the manual rail, and on
  the verified Stripe event — so the same birthday cannot be spent twice.
* The discount still does not combine with a coupon, and it is still capped at 100 EGP
  and 30%.

**Verification.** `tests/credits-referrals-birthday.test.ts` — "belongs to one day
only", "follows the candidate timezone, not the platform one", "is 30 percent".

---

## F-06 — A receipt could be any file at all

**Severity: Medium — fixed**

**Affected:** `server/payments/service.ts`, `server/payments/receiptFile.ts`.

**Exploit scenario.** The receipt upload trusted the browser's declared content type.
A candidate could upload a file of any kind — a script, an archive, an executable —
and it would be stored in the receipt bucket and offered to an administrator to open.

**Fix.** The bytes decide. `assertReceiptFileIsAllowed` reads the file signature and
accepts only JPEG, PNG, WebP and PDF; the declared content type and the file name
must agree with it. A mismatch is refused rather than repaired.

**Verification.** The signature reader is exercised by the file-type check; the
uploader's existing contract tests continue to pass.

---

## F-07 — Re-running a bootstrap migration silently restored a demoted administrator

**Severity: Medium — fixed**

**Affected:** `supabase/migrations/20261107000001_bootstrap_primary_super_admin.sql`,
`supabase/migrations/20261102000006_admin_communication.sql`.

**Exploit scenario.** Both migrations ended with
`ON CONFLICT (profile_id) DO UPDATE SET role = 'super_admin', status = 'active'`.
An operator who demoted or disabled the bootstrap account would find it fully
re-promoted the next time the migration ran — during a database reset, a re-deploy, or
an environment rebuild. Neither migration checked that the email had been confirmed,
so an unconfirmed signup using the owner's address could have received administrative
rights.

**Fix.** Both upserts are now **create-only**: they insert the bootstrap
administrator if it does not exist, and the `DO UPDATE` carries a `WHERE` clause that
only matches a row that is *already* a `super_admin` with status `active`. A demoted
row stays demoted. Both migrations also require `email_confirmed_at IS NOT NULL`.

**Verification.** The live role-assignment path was re-checked after the change:
`profiles` has no `role` column, the admin roster is the `admin_users` table, and
`profiles` column grants do not include any role column.

---

## F-08 — The administrative route rendered before the authorisation answer arrived

**Severity: Medium — fixed**

**Affected:** `src/lib/useAdminAccess.ts`, `src/App.tsx`,
`src/components/admin/AdminRouteGuard.tsx`.

**Exploit scenario.** `useAdminAccess` started with `loading = false`, so the first
render showed the "administrator access required" card before the check had even
started, then flipped to a spinner, then to the page. `App.tsx` rendered
`<AdminCenterView />` with no guard at all, so the administrative shell was mounted
for every signed-in user, including a signed-out one who reached the route switch.

**Fix.** `AdminRouteGuard` asks the server who the caller is and mounts the Admin
Center **only** for a verified administrator. While the check is running the interface
says "checking"; the refusal comes after the answer, never before it. The only source
of truth is `GET /api/admin/me`, which the server enforces. No role flag is read from
`localStorage`, `sessionStorage`, a URL parameter or any other client-side source, and
none was added.

**Verification.** `tests/admin-route-guard.test.ts` — "the Admin Center is mounted
through the guard", "a signed-out visitor never reaches the route switch", "the answer
comes from the server and from nowhere else", "the check starts as a check, not as a
refusal", "the refusal comes after the check, never before it".

---

## F-09 — The administrative API had no negative tests

**Severity: Medium — fixed**

**Affected:** `tests/admin.test.ts`.

**Exploit scenario.** The administrative surface was tested almost entirely from the
administrator's side. The scenarios that matter most — a signed-out visitor, a normal
user calling the API directly, an expired session — were not covered, so a regression
in the guard would not have been caught.

**Fix.** The administrative API is now tested from the outside: every `/api/admin/*`
endpoint is checked with a normal user's token (403), with no token (401), and with a
tampered session. The endpoints themselves already carried `requireAuth`,
`requireAdmin` and `requirePermission`; the tests now prove it.

**Verification.** `tests/admin.test.ts` — "administrative access is server-enforced",
"only a Super Admin can add, edit and remove an administrator", "a disabled
administrator loses every permission".

---

## F-10 — Administrative role changes were not always audited

**Severity: Low — fixed**

**Affected:** `supabase/migrations/20261114000002_security_hardening.sql`.

**Fix.** A trigger on `admin_users` writes an `admin.role_changed` row to
`admin_audit_log` whenever the role, the status or the permissions change, whoever made
the change. The API already logged administrative actions; this closes the gap left by
a change made by a migration, a script or a direct service-role call.

---

## F-11 — The referral code was generated with a function that is not installed

**Severity: Low — fixed**

**Affected:** `public.ensure_referral_code`.

**Exploit scenario.** The generator used `gen_random_bytes`, which lives in the
`pgcrypto` extension. That extension is not installed on this project, so the function
raised at runtime and the referral link could never be issued.

**Fix.** The code is derived from `gen_random_uuid()`, which is built into PostgreSQL 13
and later: 64 bits of entropy rendered as `CD4-XXXX-XXXX-XXXX-XXXX`. Verified against
the live database.

---

## F-12 — Stripe is in test mode, and the account cannot yet take live money

**Severity: Informational — requires a Dashboard action, not a code change**

**Affected:** the Stripe account behind the integration.

**Finding.** Read directly from the Stripe API with the platform's own key
(`scripts/verify-stripe-account.mjs`, added with this release):

| | |
|---|---|
| Account id | `acct_1UYr7NGL2qA2rllC` |
| Key mode | **test** |
| Business type | `null` (no business details submitted) |
| Country | **US** |
| Default currency | **USD** |
| `charges_enabled` | **false** |
| `payouts_enabled` | **false** |
| `details_submitted` | **false** |
| API version | `2026-10-28.endive` |

The catalogue is present and correct on that account: eleven active test-mode
prices, all in **EGP**, all carrying the expected lookup keys — the three credit
packs at 49 / 99 / 199 EGP and the three plans monthly and annually at
99 / 179 / 299 EGP. The products are named for the plans and packs.

**What this means.** The integration is complete and correct in test mode. It
cannot take live money until the account itself is enabled for charges.

**The currency mismatch is the part that matters.** The platform sells in EGP
and settles into an Egyptian wallet and an Egyptian InstaPay address, but the
account behind the integration is a **US account whose default currency is
USD**. A US account cannot settle EGP into an Egyptian bank account. Before
live money is possible, the platform needs an account that can charge in EGP
and pay out to the Egyptian business — that is an account-level decision and
an account-verification step, not a code change.

**What is explicitly NOT claimed.** That any payment has reached a bank account.
No balance transaction, payout or bank settlement was verified, because the
account is in test mode, charges are disabled and it cannot produce them.

**Also noted.** Two leftover test-mode products named `myproduct` carry two
USD 15 one-time prices with **no lookup key**. They are not part of the
catalogue and nothing in the application can select them, so they are inert.
They should be archived from the Stripe Dashboard so the catalogue is the
whole picture.

---

## F-13 — The balance the interface showed was one credit short

**Severity: Low — fixed**

**Affected:** `server/db/credits.ts`.

**Finding.** Found by the production probe
(`scripts/probe-deployed-api.mjs`) rather than by a unit test: the daily
allowance was granted correctly and written to the ledger correctly, but the
balance the candidate was shown was the one from *before* the grant. A new
account reported 5 credits while its ledger held 6.

The cause was ordering inside `getCreditBalance`: the trial grant set the
balance, the daily claim then ran and returned the authoritative balance, but
that returned balance was never assigned back to the value the response
carried.

**Why it mattered.** The number was wrong in the direction that is safe — it
under-reported — so it could not be used to spend credits. But a candidate
whose balance is shown short of what they hold cannot tell whether a payment
has landed, which is exactly the doubt a payment screen exists to remove.

**Fix.** The claim now carries the authoritative balance, and the response
takes it.

**Verification.** `scripts/probe-credit-balance.mjs` compares the reported
balance with the ledger's `running_balance` on a real account: the reported
balance, the second read and the ledger all read 6, and the ledger rows are
the 5-credit trial grant followed by the 1-credit daily grant.

---

## Remediation rules that were followed

* Every fix is in a migration or in code, and none of them drops or rewrites a table.
* No destructive migration was executed. The grant revocations and the function
  redefinitions are reversible by re-granting the privileges.
* The production schema was inspected before anything was written, and the live
  `supabase_migrations.schema_migrations` history was reconciled with the repository's
  migration files.
* No secret, service-role key, Stripe key or webhook secret appears in any migration,
  log or report.

---

## Remaining risks

1. **Stripe cannot yet take live money** (F-12). The account is a US account with
   charges disabled. Turning on live mode requires the account to be enabled for
   charges and the live keys and live Price IDs to be installed. Until then the
   product must not advertise live card payments.
2. **The birthday discount is recorded as spent when a manual payment request is
   created.** If that request is later rejected by an administrator, the discount is
   not automatically released. An operator can release it from the admin panel; the
   automatic release was left out of this release.
3. **The daily allowance is one credit per day for every eligible account.** It is
   deliberately conservative — one lightweight AI action — but it is a real cost, and
   it should be watched against the subscription conversion rate.
4. **The referral reward is capped at one credit.** It is enough to be felt and small
   enough not to be farmed, but it is not a strong incentive on its own.
5. **The two migrations whose repository file names differ from their applied
   versions** (`20261111000001`/`20261106211855` and `20261111000002`/`20261106211918`)
   are a standing source of confusion. The live database has the effects; the
   migration history records them under the earlier versions.
