# Outstanding legal fields — for owner approval

The published legal copy is the operator's, not the platform's. This file names
the **exact** places where the wording is still incomplete, what decision each
one needs, and where the approved wording goes.

**No legal wording has been drafted here.** Writing it is a legal decision, not
an engineering one, and inventing it would be worse than leaving the gap
visible. Each item below states what is missing and what has to be decided.

---

## Where the published text lives

| Document | Source of truth | Published at | Version |
|---|---|---|---|
| Terms & Conditions | `shared/legal.ts` → `TERMS_DOCUMENT` | `/terms` | `TERMS_VERSION = '2026-11-04'` |
| Privacy and analytics | `server/seo/publicPages.ts` → `buildPrivacyPage()` | `/privacy` | `PRIVACY_VERSION = '2026-11-03'` |

Both are live and reachable. The Terms were supplied and approved by the
operator on 4 November 2026, which is why `TERMS_DOCUMENT.approved` is `true`
and the consent gate opens normally.

---

## Item 1 — Terms, section 14 "Governing Law"

**Current text** (`shared/legal.ts`, section 14):

> These Terms shall be interpreted in accordance with applicable laws.
>
> The applicable governing law and dispute resolution arrangements must be
> specified in the final legally approved version before publication.

**What is missing:** the sentence is a placeholder that says so. Two decisions
are outstanding.

1. **Governing law.** The jurisdiction whose law governs the Terms, and
   whether that is the law of the operator's place of establishment, of the
   user's place, or of some other specified jurisdiction.
2. **Dispute resolution.** The mechanism, and the forum or venue. The usual
   choices are exclusive court jurisdiction, arbitration, or a staged
   "negotiation first, then a named forum" wording. If arbitration is chosen,
   the seat and the rules need naming too.

**What to supply:** the replacement body of section 14, and nothing else. The
heading stays "14. Governing Law".

---

## Item 2 — Terms, section 15 "Contact Information"

**Current text** (`shared/legal.ts`, section 15):

> For questions, complaints, or requests concerning these Terms, please
> contact the CareerDev4AI platform administration through the official contact
> channels published on our website.
>
> By using CareerDev4AI, you acknowledge that you have read and understood
> these Terms of Service.

**What is missing:** the section refers to "the official contact channels"
instead of naming an address for legal notices. The website currently publishes
`ahmedghannam801@gmail.com` (the address shown in Settings, in the footer and
in the public site's contact block), so this is a matter of stating it in the
Terms rather than inventing one.

**What to supply:** the named address and, if a different address is to be used
for legal notices specifically, the named address for legal notices. Decide
whether the published support address is also the legal-notice address.

---

## Item 3 — Privacy page, the job provider (raised by the live feed)

The Live Jobs integration sends the visitor's **search terms, location and
filters** to the job provider (JSearch), which is a third party outside the
platform's control. The Terms already cover this generally in section 8
(*Third-Party Services* — "integrations"), but the public privacy page
describes the measurement only, and says nothing about the job provider.

**What is missing:** one short section on the Privacy page stating that a job
search is sent to the job provider, that the provider is not part of the
platform, and that the platform is not a party to any application.

**What to supply:** approval of that statement. The wording is an operational
description of what the code already does, so it is a decision about
disclosure rather than about law — but it is the operator's to approve.

**Why it matters now:** this was not true before the live feed existed. The
Privacy page was accurate when it was written and would become inaccurate by
omission if the live feed shipped without this line.

---

## Applying approved wording

### 1. Edit the text

* Terms → `shared/legal.ts`, the `body` of the relevant section in
  `TERMS_DOCUMENT.sections`.
* Privacy → `server/seo/publicPages.ts`, the `body` of `buildPrivacyPage()`.

### 2. Bump the version

```ts
// shared/legal.ts
export const TERMS_VERSION = '2026-11-05';   // today's date of approval
```

```ts
// shared/legal.ts
export const PRIVACY_VERSION = '2026-11-05';
```

**Why the bump is not optional.** The version is the consent contract. A user
who accepted `2026-11-04` has *not* accepted the new wording. Bumping the
version invalidates every current acceptance and re-gates the platform, so
every user is asked to accept the new text — which is the intended behaviour
and the reason the version exists.

**Do not** edit the wording without bumping the version. The platform would
then show new terms to users whose recorded acceptance points at the old ones.
That is the one failure mode the versioning exists to prevent.

### 3. What happens on the next release

* Every user is shown the consent screen again on their next request.
* Existing acceptance rows stay in `public.user_consents` as history. **Do not
  delete them.** The history is the audit trail of who accepted what, and when.
* `tests/consent-gate.test.ts` and `tests/legal.test.ts` run against the
  version, so the change is covered by the suite.

### 4. Verify

```bash
npm test
```

Then, after the release:

* `/terms` shows the new wording.
* A signed-in user is asked to accept again.
* The acceptance is recorded with the new version and `source: 'reconsent'`.

---

## What is deliberately **not** here

* **No drafted legal text.** The gaps above are named, not filled.
* **No `approved: false`.** The Terms are approved and published. Reverting
  that flag would close the platform behind the consent gate for every user
  and would be a release decision, not a documentation one.
* **No invented governing law or jurisdiction.** Choosing one is the
  operator's legal decision.
* **No invented company name, registration number or registered address.**
