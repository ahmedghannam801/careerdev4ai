# Stripe Integration — CareerDev4AI

> **Last updated:** 2026-11-07
> **Business:** https://careerdev4ai.pages.dev
> **Status:** Fully implemented and verified in **test mode**. Live mode is
> intentionally disabled until the account-eligibility blocker in §12 is
> resolved. Card payments are additive: the Vodafone Cash / InstaPay rails are
> untouched.

---

## 1. Verified account state

Checked against the Stripe API with the configured test key:

| Property | Value |
| --- | --- |
| Account id | `acct_1UYr7NGL2qA2rllC` |
| Account country | `US` |
| Default currency | `usd` |
| `charges_enabled` | `false` |
| `details_submitted` | `false` |
| Capabilities | `{}` |
| Test Prices | 9, all `egp`, all `livemode = false` |

Test mode works end to end (customers, Checkout Sessions, invoices, webhooks).
Live mode does not: the account is a US account that has never been activated,
while the business is Egyptian. See §12.

---

## 2. Modes

There are three modes and **no implicit fallback**:

| Condition | Mode | Behaviour |
| --- | --- | --- |
| No `STRIPE_SECRET_KEY` | `disabled` | Every card surface is hidden. Wallet rails keep working. |
| `sk_test_…` / `rk_test_…` | `test` | Test entitlements and test invoices, always labelled. |
| `sk_live_…` / `rk_live_…` **and** `STRIPE_ALLOW_LIVE=true` | `live` | Real money. |
| `sk_live_…` without the opt-in | configuration error | Refused. Never treated as test mode. |

`GET /api/stripe/status` and `GET /api/stripe/diagnostics` return the mode, a
`checkoutReady` flag, and an actionable list of errors naming the exact
variable. They never return a secret.

**Checkout is refused** (`assertStripeCheckoutReady`) unless both a valid key
and `STRIPE_WEBHOOK_SECRET` are present. Money is never taken when there is no
verified path to activation.

---

## 3. Architecture

```
Browser (React 19)
   │  POST /api/stripe/checkout-session   (Supabase JWT)
   ▼
Express API (Cloudflare Pages Worker)
   │  resolve Price by lookup key, validate it against the catalogue
   │  create/reuse Customer, create Checkout Session ──► Stripe API
   │  return hosted URL
   ▼
Browser navigates to checkout.stripe.com ──► payment / 3-D Secure
   │
   │  Stripe ──► POST /api/stripe/webhook   (signature verified)
   ▼
Webhook handler
   ├─ verify HMAC + timestamp tolerance
   ├─ verify livemode / account
   ├─ record event id (idempotency)
   ├─ mirror subscription / invoice / refund / dispute
   └─ grant AI credits through the idempotent ledger RPC
```

The offline flow is unchanged:

```
Offline:  checkout intent → wallet transfer → receipt upload → risk scoring
          → admin settlement → subscription
Stripe:   checkout session → card payment → verified webhook → subscription
Both meet at: getUserEffectivePlan()
```

A Stripe subscription is checked first in entitlements. If a candidate pays by
card while a manual subscription is active, the card plan wins; the manual row
is left for an administrator to reconcile. Silently cancelling a
human-verified payment would be worse.

---

## 4. Catalogue (test mode)

The **lookup key** is the stable contract with the Dashboard. Price ids are
disposable. `npm run stripe:sync` creates anything missing and is safe to
re-run.

| Lookup key | Amount | Type |
| --- | --- | --- |
| `careerdev4ai_student_monthly` | 99.00 EGP | recurring / month |
| `careerdev4ai_student_annual` | 999.00 EGP | recurring / year |
| `careerdev4ai_pro_monthly` | 179.00 EGP | recurring / month |
| `careerdev4ai_pro_annual` | 1790.00 EGP | recurring / year |
| `careerdev4ai_career_plus_monthly` | 299.00 EGP | recurring / month |
| `careerdev4ai_career_plus_annual` | 2990.00 EGP | recurring / year |
| `careerdev4ai_pack_15` | 49.00 EGP | one-time |
| `careerdev4ai_pack_40` | 99.00 EGP | one-time |
| `careerdev4ai_pack_100` | 199.00 EGP | one-time |

Every checkout validates the resolved Price before creating a Session:
currency must be `egp`, `unit_amount` must equal the application's price in
piasters, the recurring interval must match, the Price must be active, and
`livemode` must match the configured key mode. A Dashboard edit to the wrong
amount is therefore refused, not charged.

To change a price: deactivate the old Price, create the new one with the same
lookup key, re-run the sync.

---

## 5. Data model

Additive only. No existing table is rewritten and the offline tables are
untouched.

Migration `20261113000001_stripe_billing.sql`:

| Table | Purpose |
| --- | --- |
| `stripe_customers` | `profile_id → stripe_customer_id`; one customer per candidate |
| `stripe_subscriptions` | Mirror of Stripe's subscription status, plan, cycle, period, cancellation |
| `stripe_invoices` | Mirror of invoice headers and amounts |
| `stripe_webhook_events` | Event id primary key = idempotency, with processing error |

Migration `20261113000002_stripe_refunds_and_disputes.sql` (additive):

| Change | Purpose |
| --- | --- |
| `stripe_invoices.payment_intent`, `amount_remaining`, `plan_code`, `billing_cycle`, `purchase_kind`, `invoice_created_at`, `last_event_at` | Refund attribution, subscription-vs-pack revenue, out-of-order guard |
| `stripe_subscriptions.ended_at`, `last_event_at` | Correct cancellation time and ordering |
| `stripe_customers.deleted` | `customer.deleted` without deleting the mapping |
| `stripe_refunds` | One row per Stripe Refund, RLS: own rows + admin |
| `stripe_disputes` | One row per dispute, RLS: admin only (finance matter) |

Both migrations are applied to the production Supabase project
`ciihprsfdojzvjnqgbxl`. New tables have RLS enabled; no client role has
`INSERT`/`UPDATE`/`DELETE`.

---

## 6. Lifecycle handling

Every handler is idempotent in its own right, and every mirrored row stores the
`created` timestamp of the last applied event. A delayed older event is
acknowledged without overwriting newer state.

### 6.1 New subscription

1. `POST /api/stripe/checkout-session` with `{ planCode, billingCycle }`.
2. Server resolves the Price, validates it, creates/reuses the Customer, and
   opens a Session with `metadata.profile_id`, `plan_code`, `billing_cycle`,
   `monthly_credits`.
3. Candidate pays on Stripe; 3-D Secure is handled there.
4. `checkout.session.completed` fetches the subscription and mirrors it.
5. `invoice.paid` mirrors the invoice and grants the monthly allowance once per
   invoice id.
6. `getUserEffectivePlan()` returns the paid plan.

A browser landing on the success URL grants nothing. Only a verified event
does.

### 6.2 Renewal

`invoice.paid` with `billing_reason = subscription_cycle` refreshes the period
and grants the allowance under `stripe_invoice_<id>`. A retry or a second
event name (`invoice.payment_succeeded`) cannot double-grant.

### 6.3 Plan change

`customer.subscription.updated` mirrors the new plan and cycle from metadata or
the Price lookup key. Proration invoices (`billing_reason = subscription_update`)
are mirrored for revenue but **do not** grant a second monthly allowance.

### 6.4 Failed payment, dunning and expiration

`invoice.payment_failed` and `invoice.payment_action_required` refresh the
mirror. The subscription enters `past_due`; access is retained while Stripe
retries, per Stripe's dunning. `customer.subscription.deleted` (including
`unpaid` → canceled) ends access. The pricing page shows a "Payment failed /
Update payment method" state that opens the Customer Portal.

### 6.5 Cancellation

Portal cancellation sets `cancel_at_period_end = true` via
`customer.subscription.updated`; access lasts to the period end.
`customer.subscription.deleted` ends it. Both are mirrored with `ended_at`.

### 6.6 Credit packs

One-time Checkout (`mode = payment`), with:

* `invoice_creation.enabled = true` and `invoice_data.metadata` so the buyer
  gets a receipt and the admin mirror gets a row;
* `payment_intent_data.metadata` so refunds and disputes attribute correctly.

The grant is keyed on the **PaymentIntent** (`stripe_pack_pi_<pi>`). The
Checkout Session event and the resulting `invoice.paid` event therefore grant
exactly once together, even if both arrive. Credits come from the server
catalogue; a metadata value that disagrees is a permanent error, not a larger
grant.

### 6.7 Refunds and disputes

* `refund.created`, `refund.updated`, `refund.failed` and `charge.refunded`
  write the same `stripe_refunds` rows, so neither path double-counts.
* Only `status = succeeded` refunds reduce revenue; `pending` and `failed` are
  visible to the admin but not counted.
* A dispute is recorded in `stripe_disputes` for admin visibility. It is not a
  refund and never claws back credits automatically; the money may still be
  recovered if the dispute is won.
* Credit balances are not decremented on refund. That is a deliberate product
  decision: an administrator reviews the case, and the revenue figures show the
  true net.

### 6.8 Unappliable events

A missing `profile_id`, an unknown credit pack, or metadata that disagrees with
the catalogue is a **permanent** error: the event is recorded with the reason
and acknowledged with `200`, because retrying cannot supply the missing data.
A transient failure (database, Stripe API) is recorded and answered `5xx` so
Stripe retries with backoff.

---

## 7. HTTP surface

| Route | Auth | Purpose |
| --- | --- | --- |
| `POST /api/stripe/checkout-session` | Supabase JWT | Create a hosted Checkout Session |
| `POST /api/stripe/portal-session` | Supabase JWT | Open the Customer Portal |
| `GET /api/stripe/status` | Supabase JWT | Mode, readiness, active and latest subscription |
| `GET /api/stripe/status?validate=1` | Supabase JWT | Additionally validate all 9 Prices |
| `GET /api/stripe/diagnostics` | Supabase JWT | Configuration issues + price validation |
| `POST /api/stripe/webhook` | **Stripe signature only** | Receive and apply events |

Checkout and portal are rate-limited per account (20 / minute); status is
limited at 120 / minute. Redirect origins are restricted to `SITE_ORIGIN` and
`ALLOWED_ORIGINS`; a forged `Origin` cannot turn the endpoint into an open
redirect.

The webhook answers:

| Condition | Status |
| --- | --- |
| Stripe not configured | `503` |
| `STRIPE_WEBHOOK_SECRET` missing | `503` |
| Missing / invalid signature | `400` |
| `livemode` mismatch | `400` |
| `event.account` mismatch (when configured) | `400` |
| Duplicate event id | `200` `{ duplicate: true }` |
| Permanent metadata error | `200` `{ ignored: true }` |
| Transient failure | `500` (Stripe retries) |

---

## 8. Security controls

| Control | Implementation |
| --- | --- |
| No card data in the app | Hosted Checkout + Customer Portal. PCI scope is SAQ A. |
| Webhook authenticity | HMAC-SHA256 over `<timestamp>.<raw body>`, 5-minute tolerance, constant-time compare |
| Raw body preserved | `app.ts` keeps the exact bytes; re-serialising would break the signature |
| Replay / duplicate delivery | `stripe_webhook_events.id` primary key |
| Out-of-order delivery | `last_event_at` guard on subscriptions, invoices, refunds, disputes |
| Double-grant protection | Invoice id for allowances, PaymentIntent for packs |
| Idempotent checkout | Two-minute bucketed `Idempotency-Key` per candidate + target |
| Fail closed | No webhook secret → no checkout; bad signature → `400` |
| Live-mode guard | `sk_live_` refused unless `STRIPE_ALLOW_LIVE=true` |
| Test isolation | Entitlements filter `livemode`; test invoices excluded from revenue |
| Price tampering | Every Price validated against the application catalogue |
| Secret handling | Server-only env; no secret in `.mcp.json`, `wrangler.jsonc`, a `VITE_` variable or logs |

No payment secret or card field is ever written to a log line. Webhook logs
carry the event id and type only.

---

## 9. What was built

```
server/stripe/
  config.ts      modes, validation, lookup keys, live guard
  client.ts      fetch-based Stripe REST client (Workers-safe, zero deps)
  signature.ts   Web Crypto HMAC verification
  catalog.ts     application prices → Stripe Products/Prices + price validation
  service.ts     customer, Checkout, Customer Portal, billing summary
  webhooks.ts    event dispatch, subscription/invoice/refund/dispute handling
  store.ts       Supabase mirror reads/writes, ordering guards
  revenue.ts     pure admin revenue aggregation
  routes.ts      HTTP routes, rate limiting, webhook verification
  types.ts       minimal Stripe object shapes

supabase/migrations/20261113000001_stripe_billing.sql
supabase/migrations/20261113000002_stripe_refunds_and_disputes.sql
scripts/stripe-sync-catalog.ts
src/lib/stripeApi.ts
src/components/subscription/CheckoutModal.tsx   card rail, fail-closed
src/components/views/PricingView.tsx            status, portal return, AR + EN
src/components/admin/AdminRevenuePanel.tsx      range filter, refunds, disputes
src/lib/adminApi.ts                             revenue types and date filter
src/translations/parts/subscriptions.ts         Arabic strings
tests/stripe-billing.test.ts
tests/stripe-lifecycle.test.ts
```

Changed: `app.ts` (raw body + route registration),
`server/subscriptions/entitlements.ts` (Stripe plan is considered first),
`server/subscriptions/service.ts`, `server/subscriptions/routes.ts` (admin
revenue uses `server/stripe/revenue.ts`), `package.json`, `.env.example`,
`tests/runner.mjs`.

### UI behaviour

* Pricing page: card option appears only when `checkoutReady`; status badge for
  `active`/`trialing`, `past_due`, `unpaid`, `incomplete`, `canceled`, `paused`;
  renewal / cancellation / end date; "Update payment method" when collection
  failed; "Manage billing" opens the portal; returning from the portal
  (`?billing=portal`) refreshes subscription and credits and shows a notice.
* Checkout result: `?stripe=success|cancelled` shows a banner and refreshes
  state; it never activates anything.
* Arabic and English strings, responsive layout, no Stripe branding when the
  integration is disabled.
* Admin: date range, net / gross / refunds / transaction counts, method split,
  subscription-vs-pack split, pending and failed counts, disputes, recent card
  invoices and refunds, wallet transactions with references. Test invoices are
  listed and labelled, never added to revenue. `requireAdmin` +
  `revenue.read` are enforced server-side.

---

## 10. Configuration

Server-only secrets (never a `VITE_` prefix):

| Variable | Required | Meaning |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | yes (for card) | `sk_test_…` or `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | yes (for card) | `whsec_…` for the endpoint below |
| `STRIPE_ACCOUNT_ID` | recommended | `acct_…`; reject events from another account |
| `STRIPE_ALLOW_LIVE` | live only | Must be `true` before a live key is used |
| `STRIPE_PORTAL_CONFIGURATION_ID` | optional | `bpc_…` dedicated portal configuration |
| `STRIPE_AUTOMATIC_TAX` | optional | `true` only once registrations are confirmed |
| `STRIPE_TAX_REGISTRATION_CONFIRMED` | optional | Acknowledgement for the tax warning |
| `SITE_ORIGIN` | recommended | Canonical HTTPS origin |
| `ALLOWED_ORIGINS` | optional | Extra trusted origins, comma-separated |

---

## 11. Test-mode webhook (created)

| Property | Value |
| --- | --- |
| Endpoint id | `we_1UYyJrGL2qA2rllCQKVio77R` |
| URL | `https://careerdev4ai.pages.dev/api/stripe/webhook` |
| Mode | test (`livemode = false`) |
| Events | 23 |

Subscribed events:

```
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
invoice.paid
invoice.payment_succeeded
invoice.payment_failed
invoice.payment_action_required
invoice.voided
invoice.marked_uncollectible
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
customer.subscription.paused
customer.subscription.resumed
customer.updated
customer.deleted
refund.created
refund.updated
refund.failed
charge.refunded
charge.dispute.created
charge.dispute.updated
charge.dispute.closed
```

The signing secret is stored in `.env` locally and **must also** be stored as a
Cloudflare Pages secret before deployment:

```bash
npx wrangler pages secret put STRIPE_SECRET_KEY     --project-name careerdev4ai
npx wrangler pages secret put STRIPE_WEBHOOK_SECRET --project-name careerdev4ai
npx wrangler pages secret put STRIPE_ACCOUNT_ID     --project-name careerdev4ai
```

`STRIPE_ALLOW_LIVE` must **not** be set while the account is unactivated.

---

## 12. Live-mode blocker (external)

Live mode is not reachable today, and it will not be forced:

* The Stripe account (`acct_1UYr7NGL2qA2rllC`) is registered as a **US**
  account with `charges_enabled = false` and `details_submitted = false`.
* The operating business is **Egyptian**. Stripe does not onboard Egyptian
  entities directly in the standard platform flow.
* Misrepresenting the entity, fabricating documents, or setting
  `STRIPE_ALLOW_LIVE=true` on an unactivated account would be fraud or a
  guaranteed failure. None of that is done here.

Legitimate paths, in order of preference:

1. **A real US/other supported entity** — complete Stripe activation for that
   entity (legal name, address, EIN/registration, bank account, beneficial
   owner), then create live Prices and a live webhook, and set
   `STRIPE_ALLOW_LIVE=true`.
2. **A supported entity in a Stripe-available country** that genuinely operates
   the business.
3. **Use Stripe as a payment method on another compliant platform** — e.g. a
   merchant-of-record that supports Egyptian sellers — and integrate that
   provider instead. This is a provider decision, not something to do silently.

Until one of these is true, test mode plus the wallet rails is the correct
production state, and every card surface reports test mode clearly.

---

## 13. Runbook

```bash
# Local
npm run lint
npx tsx --test tests/stripe-billing.test.ts tests/stripe-lifecycle.test.ts
npm run dev

# Catalogue
npm run stripe:sync                 # safe to re-run

# Local webhooks
npm run stripe:listen               # put the printed whsec_… in .env

# Delivery smoke test against the deployed endpoint: Stripe creates a real
# signed test event and reports whether the endpoint accepted it.
npx --yes @stripe/cli@latest trigger checkout.session.completed
```

Production deploy:

```bash
npm run cf:deploy                   # vite build + worker bundle + pages deploy
```

Then verify:

```bash
curl -s https://careerdev4ai.pages.dev/ | head
# GET /api/stripe/status and /api/stripe/diagnostics require a signed-in user
```

Webhook verification is confirmed from the Stripe Dashboard → Developers →
Webhooks → the endpoint above → recent deliveries (all `200`) and by resending
a test event.

### Production verification (2026-11-07)

| Check | Result |
| --- | --- |
| Deployed commit | `4127533` (Stripe work `8fc6efd`, CLI fix `d4eb5ec`, raw-body wiring restored after an unrelated commit dropped it) |
| Deployment id | `30086f63-1b55-49dd-8468-f197961ec255` |
| Production root | `200`, app shell served |
| `/api/stripe/status` unauthenticated | `401` (route present, auth enforced) |
| `/api/stripe/diagnostics` unauthenticated | `401` |
| `/api/stripe/checkout-session` unauthenticated | `401` |
| `/api/stripe/webhook` with a forged signature | `400` (secret configured, signature enforced) |
| Pages secrets | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_ACCOUNT_ID` stored encrypted |
| Real signed test event (`stripe trigger checkout.session.completed`) | `pending_webhooks = 0`; recorded in `stripe_webhook_events` and acknowledged as `permanent:unknown_customer` because a trigger event carries no `profile_id` — the expected, safe outcome |
| Deployed bundle | contains the new pricing (`Billing updated`, `Update payment method`, `checkoutReady`) and admin (`Net collected revenue`, `Recent card refunds`) strings |

Note: the project's Git-connected Pages build fails on every commit (it
precedes this work). Production is deployed with the direct-upload workflow
(`npm run cf:deploy`, i.e. `wrangler pages deploy dist`), which is what
produced the successful deployment above. The Git build should be fixed in
the Cloudflare dashboard (build command and environment) before relying on
push-to-deploy.

---

## 14. Test plan

Automatic (no key, no database):

* `tests/stripe-billing.test.ts` — form encoding, catalogue, lookup-key round
  trip (including `career_plus`), signature accept/tamper/stale/missing.
* `tests/stripe-lifecycle.test.ts` — paid and unpaid checkout, duplicate event
  ids, cross-event exactly-once pack grant, metadata tamper rejection, unknown
  customer acknowledgement, invoice allowance, proration, failed invoice,
  cancellation, refund attribution, dispute recording, config validation,
  price validation, revenue aggregation and date filtering.

Manual in test mode:

| Test | How | Expected |
| --- | --- | --- |
| Successful subscription | `4242 4242 4242 4242` | `active` plan, allowance granted once |
| 3-D Secure | `4000 0025 0000 3155` | challenge completes, plan active |
| Declined card | `4000 0000 0000 9995` | `invoice.payment_failed`, no plan |
| Renewal | `stripe trigger invoice.paid` or test clock | period refreshed, one allowance |
| Duplicate webhook | `stripe events resend <id>` | `duplicate: true`, no double grant |
| Forged webhook | bad signature | `400` |
| Cancel | Portal → cancel | access to period end, then `canceled` |
| Credit pack | buy `pack_40` | +40 credits once, invoice visible |
| Refund | refund the pack in the Dashboard | admin sees it, revenue nets once |
| Offline coexistence | active manual + card purchase | card plan wins, no data loss |
| RLS | second signed-in user | cannot read the first user's rows |

---

## 15. Go-live checklist

- [ ] Entity and country resolved; Stripe activated (`charges_enabled = true`)
- [ ] `STRIPE_ALLOW_LIVE=true` and live key + live `whsec_` set as Pages secrets
- [ ] Live webhook endpoint created with the 23 events above
- [ ] Live Prices created (`npm run stripe:sync` with the live key)
- [ ] Tax registrations confirmed, or `STRIPE_AUTOMATIC_TAX` left off
- [ ] Customer Portal configured in the Dashboard
- [ ] Refund / dispute playbook with an owner and an SLA
- [ ] Custom domain in front of `pages.dev` (recommended before live)
- [ ] Terms / privacy / receipts updated to describe card payments
- [x] Admin revenue reads `payment_requests`, `stripe_invoices`, `stripe_refunds`
      and `stripe_disputes`
- [x] Test-mode invoices excluded from revenue and labelled

---

## 16. Deliberate non-goals

* **Connect** — no third party receives money.
* **Custom card form / Elements** — Checkout keeps PCI scope at SAQ A.
* **Storing card data** — never.
* **Replacing the wallet rails** — they serve candidates Stripe cannot reach.
* **Duplicating Stripe Billing locally** — the mirror holds only what the UI
  needs; Stripe remains the source of truth.
* **Auto-clawback of credits on refund** — an administrator reviews it; revenue
  reflects the net.
* **Native-app custom-scheme return** — the purchase is unaffected because the
  webhook, not the redirect, grants access.
