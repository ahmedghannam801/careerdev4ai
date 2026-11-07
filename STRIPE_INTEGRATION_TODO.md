# Stripe integration — configuration and remaining setup

**This file is the single source of truth for the Stripe configuration of
CareerDev4AI.** If a Stripe value is set anywhere, it is described here.

Status: **integrated, configured locally in test mode, and verified against the
live Stripe test API.** Not yet live — the production activation steps are in
[Going live](#going-live).

---

## 1. How Stripe is integrated

Stripe is reached over its **REST API** with a hand-written client
(`server/stripe/client.ts`). There is no Stripe SDK and no Stripe plugin in
this repository, and that is deliberate:

- The API is served from Cloudflare Pages Functions, which is a Workers
  runtime. A Node-only dependency that resolves into that bundle has broken
  this build before (`body-parser`'s `iconv-lite`), and the Stripe REST API is
  form-encoded over HTTPS, so a focused `fetch` client removes that class of
  failure and keeps the Worker small.
- The card form is Stripe-hosted. No card field is ever rendered by this
  application, which is what keeps the integration in PCI scope SAQ A.

### The Anthropic Stripe plugin

The instruction `/plugin install stripe@anthropic-plugin-directory` is a
Claude Code command and has **not** been applied here — it cannot be, from
this runtime. Availability was checked rather than assumed:

- no Stripe plugin is installed in the repository or the runtime;
- no Stripe connector/App is exposed by the runtime's connector catalogue
  (`mcode-tools connector tools` returns the Matrix and email tools only);
- the `stripe` npm package is not a dependency of this project.

Nothing in the product depends on that plugin: the integration below is
self-contained. If the plugin is installed later it does not change this
code, and the Stripe option in the product appears or not according to the
server-side configuration below — never according to the plugin.

### The files that make up the integration

| File | What it does |
| --- | --- |
| `server/stripe/client.ts` | The REST client. Form-encodes parameters, signs nothing, and remembers the API version Stripe answers with. |
| `server/stripe/config.ts` | Reads the configuration, decides the mode (`disabled` / `test` / `live`), and reports what is missing. |
| `server/stripe/checkoutParams.ts` | The Checkout Studio parameter set for a hosted Checkout Session. |
| `server/stripe/service.ts` | Creates the Checkout Session and the Customer Portal session. |
| `server/stripe/routes.ts` | The HTTP routes, including the webhook. |
| `server/stripe/signature.ts` | Webhook signature verification over the raw body. |
| `server/stripe/webhooks.ts` | Event dispatch, idempotent grants, entitlement and revenue mirroring. |
| `server/stripe/store.ts`, `catalog.ts`, `revenue.ts`, `types.ts` | Persistence, the price catalogue, the revenue mirror, and the shared shapes. |
| `src/lib/stripeApi.ts` | The browser client. It asks the server for a session and follows its URL. |
| `src/components/subscription/CheckoutModal.tsx` | The card rail in the checkout. |

---

## 2. Environment variables

### Required for card checkout to be available

| Variable | Example | Meaning |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | `sk_test_…` / `sk_live_…` | The account's secret key. **Server only.** Never in the browser bundle. |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` | The signing secret of the webhook endpoint. Without it every card checkout is refused, because there would be no verified path from a payment to an activation. |

Both are absent from the browser bundle. `src/lib/stripeApi.ts` never sees a
key; it calls the server and follows the hosted URL it is given.

### Optional

| Variable | Default | Meaning |
| --- | --- | --- |
| `STRIPE_ALLOW_LIVE` | `false` | Must be exactly `true` before a live key is used. A live key without it is a configuration error, never a silent test-mode fallback. |
| `STRIPE_ACCOUNT_ID` | — | `acct_…`. When set, an event that names another account is rejected. |
| `STRIPE_PORTAL_CONFIGURATION_ID` | — | `bpc_…`. A dedicated Customer Portal configuration instead of the account default. |
| `STRIPE_AUTOMATIC_TAX` | `false` | `"true"` turns on Stripe Tax. Requires `STRIPE_TAX_REGISTRATION_CONFIRMED=true`. |
| `STRIPE_TAX_REGISTRATION_CONFIRMED` | — | `"true"` once the tax registrations are confirmed. Without it a warning is reported. |
| `STRIPE_TAX_ID_COLLECTION` | `false` | `"true"` asks for a tax ID at checkout. See [§4](#4-tax-id-collection). |
| `STRIPE_CHECKOUT_UI_MODE` | automatic | `hosted_page` or `hosted`. Overrides the automatic choice. See [§3](#3-ui_mode). |
| `STRIPE_API_BASE` | `https://api.stripe.com` | Only for a mock server or a regional base URL. |
| `SITE_ORIGIN` | `https://careerdev4ai.pages.dev` | The origin the success and cancel URLs are built from. |
| `ALLOWED_ORIGINS` | — | The origins the checkout route accepts a request from. |

### Deployment

`scripts/set-pages-env.mjs` sends the Cloudflare Pages environment. The two
Stripe secrets are **optional** there: they are sent when `.env` names them
and left out when it does not, so a deployment without card payments can
still ship. The rest of the platform is unaffected either way.

---

## 3. The Checkout Session parameters that are sent

The parameter set lives in one place: `server/stripe/checkoutParams.ts`.
Every value below was checked against the Stripe Checkout Session API
reference and then verified against the live test account.

| Parameter | Value | Note |
| --- | --- | --- |
| `mode` | `payment` or `subscription` | Never guessed. `payment` for a one-time credit pack, `subscription` for a recurring plan. |
| `line_items` | the real Price ID, quantity 1 | Resolved from the application's own catalogue. |
| `success_url` | `https://careerdev4ai.pages.dev/#/pricing?stripe=success&session_id={CHECKOUT_SESSION_ID}` | The real origin. |
| `cancel_url` | `https://careerdev4ai.pages.dev/#/pricing?stripe=cancelled` | The real origin. |
| `customer` | the candidate's Stripe customer | Created on the first checkout, mapped to the profile. |
| `client_reference_id` | the profile id | |
| `metadata` | `profile_id`, `plan_code`, `billing_cycle`, `monthly_credits` | Carried into the subscription and the invoice, which is how the grants are attributed. |
| `locale` | `auto` | |
| `billing_address_collection` | `auto` | |
| `ui_mode` | `hosted_page` (see below) | |
| `phone_number_collection` | `{ enabled: false }` | |
| `automatic_tax` | `{ enabled: false }` | Follows `STRIPE_AUTOMATIC_TAX`; off by default. |
| `allow_promotion_codes` | `false` | The platform applies its own coupon; an explicit Stripe promotion code is still passed as `discounts`. |
| `submit_type` | `auto` | **Only in `payment` mode.** Stripe rejects `submit_type` on a subscription session. |
| `payment_method_collection` | `always` | **Only in `subscription` mode.** Stripe rejects it in `payment` mode. |
| `origin_context` | `web` | |
| `integration_identifier` | `hosted_web_0002` | The label Stripe measures this checkout's conversion with. |
| `invoice_creation` | `{ enabled: true, invoice_data: { metadata } }` | **Only in `payment` mode.** Gives a one-time pack a receipt and a revenue row. |
| `payment_intent_data` | `{ metadata }` | **Only in `payment` mode.** Attributes a refund or dispute. |
| `subscription_data` | `{ metadata }` | **Only in `subscription` mode.** |

### 3. `ui_mode`

Stripe renamed the hosted checkout's user-interface mode. From API version
`2026-03-25.dahlia` onwards the value is **`hosted_page`**; before that it is
**`hosted`**, and Stripe rejects the other name outright. The Stripe SDKs that
carry the new naming start at v21.0.0, so "SDK ≥ 21.0.0" and "API version ≥
2026-03-25" are the same rule. This project talks to the REST API rather
than to an SDK, so it decides from the API version Stripe itself reports in
the `Stripe-Version` response header.

The account this project is connected to serves **API version
`2026-10-28.endive`**, which means `hosted_page` is the correct value and
`hosted` is refused:

```text
ERROR: The ui_mode value `hosted` is no longer supported. Use `hosted_page` instead.
```

Two safeguards, because a deployment on an older account must still work:

1. The version is read from Stripe's own responses. The price lookup that
   resolves a Price ID happens before the session is created, so the version
   is normally known by then.
2. If Stripe refuses the value, the session is created again with the other
   name. The check is narrow — only a `400 invalid_request_error` that names
   `ui_mode` — so a real problem with a session is never swallowed.

Set `STRIPE_CHECKOUT_UI_MODE` to pin the value when an account sits on a
version this code cannot infer.

### 4. Tax ID collection

`tax_id_collection` is **off by default**.

This is a correction, not a preference. The integration used to send
`tax_id_collection[enabled]=true` on its own, and on this account that makes
**every** Checkout Session creation fail:

```text
ERROR: Tax ID collection requires updating business name on the customer.
To enable tax ID collection for an existing customer, please set `customer_update[name]` to `auto`.
```

and, with `customer_update[name]` added, it asks for the address as well
before it will accept the session. Verified in test mode:

| Request | Result |
| --- | --- |
| `tax_id_collection[enabled]=true` | **400** — "Tax ID collection requires updating business name on the customer." |
| `tax_id_collection[enabled]=true` + `customer_update[name]=auto` | **400** — "We could not find a valid address on the provided customer." |
| `tax_id_collection[enabled]=true` + `customer_update[name]=auto` + `customer_update[address]=auto` | **200** — the session is created. |
| no `tax_id_collection` | **200** — the session is created. |

So tax ID collection is now opt-in with `STRIPE_TAX_ID_COLLECTION=true`, and
when it is on it travels with the `customer_update` that lets Stripe accept
it. A customer whose name and address must not be overwritten should leave
it off.

---

## 5. The webhook

- **Endpoint:** `POST https://careerdev4ai.pages.dev/api/stripe/webhook`
- **Local:** `npm run stripe:listen` forwards to `http://localhost:3000/api/stripe/webhook` and prints a `whsec_…` value.
- **Signing secret:** `STRIPE_WEBHOOK_SECRET`, taken from the endpoint in the Dashboard.

### Events the handler acts on

| Event | What it does |
| --- | --- |
| `checkout.session.completed`, `checkout.session.async_payment_succeeded` | Activates the subscription or grants the credit pack. |
| `checkout.session.async_payment_failed` | Records the failure. Grants nothing. |
| `customer.subscription.created` / `.updated` / `.deleted` / `.paused` / `.resumed` | Mirrors the subscription and the entitlement. |
| `invoice.paid`, `invoice.payment_succeeded` | Grants the monthly allowance once per invoice. |
| `invoice.payment_failed`, `invoice.payment_action_required`, `invoice.voided`, `invoice.marked_uncollectible` | Records the failure. Grants nothing. |
| `customer.updated`, `customer.deleted` | Mirrors the customer. |
| `refund.created`, `refund.updated`, `refund.failed`, `charge.refunded` | Mirrors the refund. |
| `charge.dispute.created`, `.updated`, `.closed` | Mirrors the dispute. |

### How it is kept safe

- **The signature is verified against the raw request body.** Re-serialising
  the parsed JSON changes whitespace and key order and the signature stops
  matching, so the raw bytes are kept for the check
  (`server/stripe/signature.ts`). The comparison is timing-safe and the
  timestamp is inside a five-minute tolerance.
- **A delivery that cannot be verified is refused with a 400**, not
  acknowledged: answering 200 would tell Stripe to stop retrying a payment
  the candidate has already made.
- **The mode is checked.** An event whose `livemode` does not match the
  server's mode is refused, so a test event sent to a live endpoint cannot
  apply a test entitlement.
- **Processing is idempotent.** Every event is recorded before it is handled;
  a repeat is acknowledged without repeating the side effects. Grants are
  keyed on the PaymentIntent or the invoice id, so the session path and the
  invoice path cannot both grant.
- **Activation is server-side.** The browser is redirected back after a
  payment, but that redirect only asks the server what the state is. Nothing
  is granted by a URL parameter.

---

## 6. The Prices

All eleven Prices exist in the test account and were read back from the
Stripe API. The application never hardcodes them: it resolves a Price by the
lookup key derived from its own catalogue, and `npm run stripe:sync` creates
or updates them.

| Lookup key | Price ID | Amount | Type |
| --- | --- | --- | --- |
| `careerdev4ai_student_monthly` | `price_1UYxSrGL2qA2rllC8p3HryfY` | 99.00 EGP | monthly |
| `careerdev4ai_student_annual` | `price_1UYxSsGL2qA2rllCdbvGTRqr` | 999.00 EGP | yearly |
| `careerdev4ai_pro_monthly` | `price_1UYxStGL2qA2rllCDUtrC9h8` | 179.00 EGP | monthly |
| `careerdev4ai_pro_annual` | `price_1UYxSuGL2qA2rllCmo27sgiE` | 1,790.00 EGP | yearly |
| `careerdev4ai_career_plus_monthly` | `price_1UYxSuGL2qA2rllCtuzhyJcy` | 299.00 EGP | monthly |
| `careerdev4ai_career_plus_annual` | `price_1UYxSvGL2qA2rllCE6VaBnFu` | 2,990.00 EGP | yearly |
| `careerdev4ai_pack_15` | `price_1UYxSwGL2qA2rllCUwwDHj2M` | 49.00 EGP | one-time |
| `careerdev4ai_pack_40` | `price_1UYxSxGL2qA2rllCWgmuDMq7` | 99.00 EGP | one-time |
| `careerdev4ai_pack_100` | `price_1UYxSyGL2qA2rllCygwwa9cE` | 199.00 EGP | one-time |

**No Price ID is missing.** The three credit packs are one-time prices and
the six plans are recurring ones; the checkout mode follows the target, and
Stripe rejects a recurring price in `payment` mode or a one-time price in
`subscription` mode.

---

## 7. How the card option appears

The card rail appears **only** when the server says it is usable. The browser
asks `GET /api/stripe/status` and the option is shown only when
`configured && checkoutReady`, which requires a key **and** a webhook signing
secret **and** no configuration error. When Stripe is unavailable the card
option is not rendered at all, and the Vodafone Cash and InstaPay rails keep
working unchanged. There is no state in which the product offers a payment it
cannot take.

`GET /api/stripe/status` also reports every configuration problem with the
variable name and a sentence explaining it, so the operator does not have to
guess.

---

## 8. Test mode

The local `.env` carries a test key and a test webhook secret, and both were
verified against the live Stripe test API:

- the key authenticates (`GET /v1/prices` → `200`);
- the account serves API version `2026-10-28.endive`;
- all eleven Prices are present and active;
- a Checkout Session is created successfully in **both** modes with the
  parameter set above (`subscription` → `200`, `payment` → `200`), with
  `ui_mode: hosted_page`, the real success and cancel URLs, and the real
  Price IDs;
- the sessions created for the check were expired and the temporary
  verification customer was deleted, so nothing was left behind.

To exercise a payment end to end locally:

```bash
npm run stripe:listen     # in one terminal; copy the whsec_… it prints
npm run dev               # in another
```

Then use a Stripe test card — `4242 4242 4242 4242`, any future expiry, any
CVC and postal code.

---

## 9. Going live

**Stripe is not live.** These steps are still to be done, and until they are
done the card option stays hidden in production.

1. **Create the live products and prices.** Run `npm run stripe:sync` with a
   live key so the lookup keys exist in live mode too. Live Price IDs are
   different from the test ones; the application resolves them by lookup key,
   so no code change is needed.
2. **Create the live webhook endpoint** in the Dashboard, pointing at
   `https://careerdev4ai.pages.dev/api/stripe/webhook`, and subscribe it to
   the events in [§5](#5-the-webhook). Copy its signing secret.
3. **Put the live key and the live webhook secret in the environment**:
   `STRIPE_SECRET_KEY=sk_live_…`, `STRIPE_WEBHOOK_SECRET=whsec_…`, and
   `STRIPE_ALLOW_LIVE=true`. The last one is required: a live key without it
   is a configuration error and card payments stay off.
4. **Deploy the environment**: `node scripts/set-pages-env.mjs`, then
   `npm run cf:deploy`.
5. **Verify the live endpoint** before announcing it:
   - `GET /api/stripe/status` reports `mode: "live"`, `configured: true`,
     `checkoutReady: true` and no errors;
   - a real card checkout reaches Stripe's hosted page and comes back to
     `#/pricing?stripe=success`;
   - the subscription appears in the admin revenue panel, and the entitlement
     is active;
   - the webhook delivery is listed as succeeded in the Dashboard.
6. **Confirm that the Egyptian wallet rails are untouched.** They are a
   separate flow and must keep working while the card rail is live.

---

## 10. What is still missing

| Item | State |
| --- | --- |
| Live Stripe key | **Not set.** Only a test key exists, and it is not deployed to Cloudflare. |
| Live webhook signing secret | **Not set.** The Dashboard endpoint for production has not been created. |
| `STRIPE_ALLOW_LIVE=true` | **Not set.** Deliberately. |
| Live Price IDs | **Not created.** The test Prices exist; run `npm run stripe:sync` with a live key. |
| Live webhook endpoint | **Not created.** |
| Stripe in the production deployment | **Not enabled.** `scripts/set-pages-env.mjs` now sends the two Stripe secrets when `.env` names them; until `.env` names a live pair, the card option stays hidden in production and the wallet rails are unaffected. |

Everything else — the client, the routes, the signature verification, the
idempotent grants, the Checkout Studio parameters, the Prices, the catalogue
sync and the availability mechanism — is implemented and verified.

**Stripe must not be described as production-ready until every line above is
done and step 5 of [§9](#9-going-live) has passed.**
