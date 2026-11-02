# The Admin Center traffic dashboard — Google credential and setup

The Admin Center reads the GA4 property back from the server and draws the
traffic panel from it. This file describes the credential it uses, why it
changed, and exactly what an operator has to do.

---

## 1. What changed

The dashboard used to authenticate with a **service account and its private
key** (`GA4_PROPERTY_ID`, `GA4_SERVICE_ACCOUNT_EMAIL`, `GA4_PRIVATE_KEY`).

That mechanism cannot be used any more:

- the organisation runs the policy `iam.disableServiceAccountKeyCreation`, so
  a service-account JSON key cannot be created, and the policy must stay;
- a private key is a credential that never expires and can only be withdrawn
  by deleting it in the Google console, and a key file has to be copied
  between systems by hand;
- the browser measurement (`G-KVH4XKTE23`) is unaffected — it never used the
  server credential.

The dashboard now authenticates with an **OAuth 2.0 client and a refresh
token**, exchanged for a short-lived access token on the server on demand.

| | Before | Now |
|---|---|---|
| Long-lived credential | service-account private key (PEM) | OAuth refresh token (revocable, scoped read-only) |
| Credential used for each read | self-signed JWT, signed on the server | access token, valid one hour |
| Where the credential lives | environment variable on the server | environment variable on the server |
| Browser | never saw it | never sees it |
| Withdrawn by | deleting the key in the console | revoking the client's access, or deleting the client |

---

## 2. Why Workload Identity Federation is not used

Google's Workload Identity Federation was the first candidate, and the
Workload Identity Pool and its OIDC provider for CareerDev4AI already exist.
It cannot be completed from this deployment, and the reason is the runtime,
not the configuration.

For a federated principal, Google Security Token Service needs a **signed
OIDC ID token** from the external issuer. That means the workload must be
able to:

1. mint a JWT signed with a key it controls, and
2. publish the issuer's discovery document and JWKS so Google can verify it.

The Cloudflare Workers/Pages runtime provides neither. The Workers runtime
exposes no OIDC-token binding, no workload-identity binding and no signing
key material to the application — the only bindings that exist are the
documented ones (KV, D1, R2, Durable Objects, Queues, service bindings, and
so on). A Worker has no filesystem path a token could be read from either.

So the only way to make Google accept a Cloudflare-issued assertion would be
to **build a custom OIDC issuer inside the application**, which means storing
a signing key in the deployment and publishing a JWKS endpoint. That is the
same long-lived private key the change was meant to remove, in a worse place:
a key that signs *identities* rather than one that signs a single request.

The Workload Identity Federation path stays open for a future workload that
runs on Google infrastructure (Cloud Run, GKE, Cloud Build), where Google's
own metadata server provides the assertion and no key exists at all. It is
not usable from Cloudflare Pages.

---

## 3. The architecture in use

```
 browser (Admin Center)                Cloudflare Pages Worker              Google
 ───────────────────────               ─────────────────────────            ─────
  TrafficAnalyticsPanel   ──HTTPS──►   /api/admin/analytics/traffic
   (no credential)            ▲        requireAuth → requireAdmin
                              │        → requirePermission('analytics.read')
                              │                 │
                              │                 ▼
                              │        server/analytics/ga4.ts
                              │          · refresh token ──► POST https://oauth2.googleapis.com/token
                              │          · access token  ──► POST https://analyticsdata.googleapis.com/
                              │                              v1beta/properties/{id}:runReport
                              │        numbers only
                              └──────────────────────────────────────────────
```

- the refresh token lives only in the Worker environment;
- the access token is kept in memory for the length of its life (one hour),
  and asked for again when it expires or when Google rejects it;
- the report is cached for ten minutes, so a refresh of the panel does not
  spend Data API quota;
- the browser receives numbers, and never a token, a secret or a key.

---

## 4. Google Cloud — exact steps

### 4.1 The OAuth client

1. Open **Google Cloud Console → APIs & Services → Credentials** in the
   project that will hold the integration (any project of the organisation
   may hold it; the GA4 property itself does not have to live in the same
   project).
2. **Create credentials → OAuth client ID**.
3. **Application type: Web application.** The OAuth 2.0 Playground only
   accepts a web-application client.
4. **Name:** `CareerDev4AI Admin Traffic`.
5. **Authorized redirect URIs:** add exactly

   ```
   https://developers.google.com/oauthplayground
   ```

6. **Create**, and note the **Client ID** and the **Client secret**.

### 4.2 The consent screen

6. Open **APIs & Services → OAuth consent screen**.
7. Set the **publishing status to `In production`**. This matters: while the
   status is `Testing`, Google issues refresh tokens that **expire after
   seven days**, and the dashboard would stop a week later with
   `invalid_grant`. `In production` does **not** require Google to verify the
   app; verification and publishing status are two different things.
8. If the organisation uses Google Workspace or Cloud Identity, an **Internal**
   user type avoids the consent warning entirely.

### 4.3 The property access

9. Open **Google Analytics → Admin → Property access management** of the
   property `GA4_PROPERTY_ID` and add the **Google account that will be
   authorised in step 4.4**, with the role **Read & analyze**.
   (The service account that used to be added here is no longer needed and
   may be removed.)

### 4.4 The refresh token

10. Open **<https://developers.google.com/oauthplayground>**.
11. Click the **gear icon** (top right) and tick **Use your own OAuth
    credentials**.
12. Set **OAuth flow: Server-side** and **Access type: Offline** — offline is
    what produces a refresh token.
13. Enter the **OAuth Client ID** and **OAuth Client secret** from step 4.1.
14. In **Step 1**, add the scope

    ```
    https://www.googleapis.com/auth/analytics.readonly
    ```

15. **Authorize APIs**, sign in with the account from step 4.3, and accept.
16. In **Step 2**, click **Exchange authorization code for tokens**.
17. Copy the **refresh token** — it is the long string in the response. This
    is the value of `GA4_REFRESH_TOKEN`.
18. Remove `https://developers.google.com/oauthplayground` from the client's
    authorized redirect URIs if you no longer need to repeat this step. At
    least one redirect URI must remain.

---

## 5. Cloudflare — exact configuration

Four server-only values. Two of them are secrets; none of them may be given a
`VITE_` prefix, because that prefix inlines a value into the browser bundle.

| Variable | Secret | Production value |
|---|---|---|
| `GA4_PROPERTY_ID` | no | `561985329` |
| `GA4_CLIENT_ID` | no | `856821259465-mrek8gh066huqo3mntg4p6lindlgdki5.apps.googleusercontent.com` |
| `GA4_CLIENT_SECRET` | **yes** | the OAuth client secret — stored in Cloudflare only, never in this repository |
| `GA4_REFRESH_TOKEN` | **yes** | the refresh token from step 4.4 — stored in Cloudflare only, never in this repository |

### With Wrangler

```bash
# secrets
npx wrangler pages secret put GA4_CLIENT_SECRET  --project-name careerdev4ai
npx wrangler pages secret put GA4_REFRESH_TOKEN --project-name careerdev4ai

# plain values (they are not secret, but secrets work as well)
npx wrangler pages secret put GA4_PROPERTY_ID --project-name careerdev4ai
npx wrangler pages secret put GA4_CLIENT_ID    --project-name careerdev4ai
```

### Or with the dashboard

**Cloudflare Dashboard → Workers & Pages → careerdev4ai → Settings →
Environment variables → Add**, for **Production** (and **Preview** if the
preview deployment should show traffic too):

| Variable | Type | Value |
|---|---|---|
| `GA4_PROPERTY_ID` | Text | the numeric property id |
| `GA4_CLIENT_ID` | Text | the OAuth client id |
| `GA4_CLIENT_SECRET` | Secret | the OAuth client secret |
| `GA4_REFRESH_TOKEN` | Secret | the refresh token |

### What to remove

If the deployment still carries the old variables, **delete them**:

- `GA4_SERVICE_ACCOUNT_EMAIL`
- `GA4_PRIVATE_KEY`

The code no longer reads them, and a secret that nothing uses is still a
secret that can leak.

> **Note on the production project.** The production project also carried a
> variable literally named `PROPERTY ID` — with a space, and without the
> `GA4_` prefix. No code ever read it (the application reads
> `process.env.GA4_PROPERTY_ID`), so it was dead configuration, and it has
> been deleted. The four variables above are the complete list.

---

## 6. Verification — exact commands

### 6.1 The credential works (run locally, nothing is printed but the result)

```bash
export GA4_CLIENT_ID='123…apps.googleusercontent.com'
export GA4_CLIENT_SECRET='…'
export GA4_REFRESH_TOKEN='…'

curl -s -X POST https://oauth2.googleapis.com/token \
  -d grant_type=refresh_token \
  -d "client_id=$GA4_CLIENT_ID" \
  -d "client_secret=$GA4_CLIENT_SECRET" \
  -d "refresh_token=$GA4_REFRESH_TOKEN"
```

Expected: `{"access_token":"ya29…","expires_in":3599,"scope":"…"}`.
An `invalid_grant` means the refresh token is wrong, revoked, or was minted
while the consent screen was still in `Testing`.

### 6.2 The property is readable

```bash
export GA4_PROPERTY_ID='123456789'
export ACCESS_TOKEN='ya29…'   # from the call above

curl -s -X POST \
  "https://analyticsdata.googleapis.com/v1beta/properties/$GA4_PROPERTY_ID:runReport" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"dateRanges":[{"startDate":"7daysAgo","endDate":"today"}],"metrics":[{"name":"activeUsers"}]}'
```

Expected: a JSON answer with `rows` and `rowCount`. A `403` means the
account behind the refresh token has no **Read & analyze** access to the
property.

### 6.3 The deployment is configured

```bash
npx wrangler pages secret list --project-name careerdev4ai
```

Expected: `GA4_CLIENT_SECRET`, `GA4_REFRESH_TOKEN`, `GA4_PROPERTY_ID` and
`GA4_CLIENT_ID` are listed. Only the names are shown.

### 6.4 The route is protected

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  https://careerdev4ai.pages.dev/api/admin/analytics/traffic
```

Expected: `401`. The route requires a session, an administrator role and the
`analytics.read` permission.

### 6.5 The panel

Sign in as an administrator, open **Admin Center → Traffic**. The panel
shows the numbers, or a "not connected" message naming the four variables.

---

## 7. The Workload Identity Pool and its provider

**Keep them, but bind nothing to them** — or delete them. They cannot be
used by this deployment, and the important thing is that they must not be
left in a state where something can use them.

A provider grants nothing by itself: access comes from an IAM binding on the
pool or the provider (for example `roles/iam.workloadIdentityUser`). The
check that matters is therefore the policy, not the provider.

```bash
POOL='<pool-id>'
PROVIDER='<provider-id>'
PROJECT='<project-id>'

# Is anything allowed to impersonate through the pool?
gcloud iam workload-identity-pools get-iam-policy "$POOL" \
  --project="$PROJECT" --location=global

# … or through the provider?
gcloud iam workload-identity-pools providers get-iam-policy "$PROVIDER" \
  --project="$PROJECT" --location=global --workload-identity-pool="$POOL"

# What issuer does the provider trust?
gcloud iam workload-identity-pools providers describe "$PROVIDER" \
  --project="$PROJECT" --location=global --workload-identity-pool="$POOL"
```

- If both policies are **empty**, the pool and the provider are inert. Keeping
  them is harmless, and they are there for a future workload that runs on
  Google infrastructure. **Recommended.**
- If either policy grants a role to a service account or to a principal set,
  remove that binding: with a broad attribute condition, whoever can produce
  a token from the trusted issuer would be able to impersonate that service
  account.
- If the provider was created **only** for this Cloudflare integration and no
  Google-hosted workload will ever use it, **delete it** — it can only ever be
  a source of confusion:

  ```bash
  gcloud iam workload-identity-pools providers delete "$PROVIDER" \
    --project="$PROJECT" --location=global --workload-identity-pool="$POOL"
  ```

Nothing in the application depends on the pool or the provider, so either
choice leaves the dashboard working.

---

## 8. When something goes wrong

| What the panel says | What it means | What to do |
|---|---|---|
| `Google Analytics is not connected…` | one of the four variables is missing or empty | set it (§5) and redeploy |
| `invalid_grant` | the refresh token was refused: revoked, six months unused, minted while the consent screen was in `Testing`, or the account changed its password | repeat §4.4 after setting the consent screen to `In production` (§4.2) |
| `invalid_client` | the client id or the client secret is wrong, or the client was deleted | check `GA4_CLIENT_ID` / `GA4_CLIENT_SECRET` |
| `does not include … analytics.readonly` | the authorisation was granted without the read-only scope | repeat §4.4 with the scope of step 4.4 |
| `no read access to this property (403)` | the authorised account has no **Read & analyze** on the property | add it in §4.3 |
| `does not know this property id (404)` | `GA4_PROPERTY_ID` is wrong | copy it from the property's URL in GA4 Admin |
| `rate-limiting (429)` | the Data API quota of the property is spent | wait; the panel caches its report for ten minutes |

A refresh token can also stop working when the account that granted it
changes its password, when the account's third-party access is withdrawn in
Google Account → Security → Third-party connections, or when the client is
deleted. In every case the fix is the same: repeat §4.4 and update
`GA4_REFRESH_TOKEN`.
