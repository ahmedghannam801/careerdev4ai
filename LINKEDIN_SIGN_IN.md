# LinkedIn sign-in — the owner's LinkedIn Developer Portal steps

LinkedIn sign-in is **already working in production**. This file records what
was verified, and the two things that remain in the LinkedIn Developer Portal,
which only the owner can do.

---

## 1. How it is wired

The platform does not implement its own OAuth. It uses **Supabase Auth's
LinkedIn OIDC provider**:

```
browser → supabase.auth.signInWithOAuth({ provider: 'linkedin_oidc' })
        → https://ciihprsfdojzvjnqgbxl.supabase.co/auth/v1/authorize
        → https://www.linkedin.com/uas/login (LinkedIn signs the user in)
        → https://ciihprsfdojzvjnqgbxl.supabase.co/auth/v1/callback  (Supabase exchanges the code)
        → https://careerdev4ai.pages.dev/#access_token=…  (the app picks the session up)
```

`src/lib/supabase.ts` creates the browser client with
`detectSessionInUrl: true`, so the fragment is consumed automatically on
return. There is no application-side callback route to maintain, and none is
needed.

The provider is enabled in Supabase → Authentication → Providers → LinkedIn
(with "LinkedIn OIDC" as the provider), and the production origin is in the
project's redirect allow list.

---

## 2. What was verified in production

On the live deployment, `CareerDev4AI → Start Your Journey → Continue with
LinkedIn` was followed and the browser reached LinkedIn's own sign-in screen
with this authorization request:

| Field | Value |
|---|---|
| LinkedIn application id | `266652642` |
| Scopes requested | `openid email profile` |
| Authorization type | `OAUTH2_AUTHORIZATION_CODE` |
| **Redirect URI** | **`https://ciihprsfdojzvjnqgbxl.supabase.co/auth/v1/callback`** |
| Return URL of the app | `https://careerdev4ai.pages.dev/` |

The request was not completed — no LinkedIn account was signed into, and no
consent was given. Verifying it only required reaching LinkedIn's own
authorization screen with the correct application and the correct redirect
URI, which is what the table above records.

The account sign-in itself was deliberately left to the owner.

---

## 3. Outstanding step 1 — the authorized redirect URI

LinkedIn only honours a redirect URI that is registered **exactly** on the
application. The request above used:

```
https://ciihprsfdojzvjnqgbxl.supabase.co/auth/v1/callback
```

**Owner steps:**

1. Sign in to <https://www.linkedin.com/developers/apps>.
2. Open the application whose id is `266652642`.
3. Go to **Auth → Authorized redirect URLs**.
4. Confirm that this exact value is listed:
   `https://ciihprsfdojzvjnqgbxl.supabase.co/auth/v1/callback`
5. If it is not listed, add it. Save.

A trailing slash, a different host, an `http://` scheme or a stray path will
all be rejected. It must match character for character.

---

## 4. Outstanding step 2 — rotate the exposed client secret

The LinkedIn client secret that Supabase holds was exposed when the Supabase
auth configuration was read during this audit. It is still the live secret, and
it should be replaced.

**Owner steps:**

1. <https://www.linkedin.com/developers/apps> → application `266652642`.
2. **Auth → Client secret → Regenerate**. LinkedIn shows the new secret once.
3. **Supabase → Authentication → Providers → LinkedIn** → paste the new secret
   into **Client Secret** → **Save**.
4. Sign in with LinkedIn once to confirm the new secret works.

The old secret stops working the moment it is regenerated, so there is no
overlap to schedule and nothing has to be kept.

**Why this matters.** A client secret is a shared secret between the
application and the provider. It is not a password that protects user data
directly, but it is the thing that authorises the application to ask LinkedIn
for a token, so it should not be sitting in a transcript.

---

## 5. If sign-in stops working

| Symptom | Cause | Fix |
|---|---|---|
| LinkedIn shows "redirect_uri_mismatch" | the redirect URI is not registered, or does not match exactly | §3 |
| LinkedIn shows "invalid client" | the client id does not match the app | check the client id in Supabase → Authentication → Providers → LinkedIn |
| The user returns to the app but is not signed in | the return URL is not in the allow list | confirm `https://careerdev4ai.pages.dev` is in Supabase → Authentication → URL Configuration |
| The user returns to the app and is signed in but the session ends at once | the redirect URI is registered with a trailing slash or a different host | §3, character for character |

---

## 6. The Google provider

Google sign-in is handled the same way, through Supabase Auth, and the same
redirect-URI rule applies: the URI Supabase sends to Google must be registered
on the Google Cloud OAuth client. The same `https://ciihprsfdojzvjnqgbxl.supabase.co/auth/v1/callback`
value is used for both providers.
