# Support request — Production deployments are refused for this organisation

**To:** Trigger.dev support (`help@trigger.dev`, or the in-dashboard chat)
**Subject:** Production deployment refused — "Deployments are not available for this organization" (projects `proj_kddvwmltmrhauyjyohre` and `proj_ocrvfiyhenpmtexfsbmj`)

---

## The problem

`trigger deploy --prod` builds the project and uploads the deployment files
successfully, and then refuses to create the deployment:

```
Trigger.dev (4.8.3)
------------------------------------------------------
T  Deploying to prod
|  Checking your account details
|  Retrieved your account details for ahmedghannam801@gmail.com
|  Building trigger code
|  Successfully built code
|  Preparing deployment files
|  Deployment files ready (3.27 MB)
|  Uploading deployment files
|  Deployment files uploaded
|  Failed to initialize deployment

x  Deployments are not available for this organization.

—  Deployment failed
```

The build succeeds and the 3.27 MB artifact uploads successfully. Only the
creation of the deployment record is refused, and the message names the
*organisation* rather than the project.

## The identifiers

| | |
| --- | --- |
| Project ref | `proj_kddvwmltmrhauyjyohre` |
| Project name / slug | `careerdev4ai` / `careerdev4ai-GkIu` |
| Organisation | `Careerdev4ai` (slug `careerdev4ai-1b85`, id `cmw2a5f5t00fcn10iysrbjso5`) |
| Organisation admin | `ahmedghannam801@gmail.com` (user id `cmw2a4tz300fbn10iytmldsor`, role `ADMIN`) |
| Account | `ahmedghannam801@gmail.com` |
| Runtime | `node-24` |
| CLI | `trigger.dev` 4.8.3 (the current published version) |
| SDK packages | `@trigger.dev/sdk`, `@trigger.dev/build`, `@trigger.dev/core` all 4.8.3 |
| Organisation created | 2026-11-04, 15:37:06 UTC |
| Project initialised | 2026-11-04, 15:44:55 UTC |
| Attempts | Eight: six on this organisation over roughly nine hours (including after the account details were confirmed), and two on the second organisation below — the most recent one on 2026-11-05, after the application was moved onto that project |

## The same refusal happens on a second, brand-new organisation

This is the finding that narrows it down. On 2026-11-04 a second account was
signed in to the dashboard, it completed the "Confirm your details" step, and a
new organisation and project were created through the dashboard itself:

| | First organisation | Second organisation |
| --- | --- | --- |
| Account | `ahmedghannam801@gmail.com` | `mohamedghnnam801@gmail.com` |
| Organisation | `Careerdev4ai` (`careerdev4ai-1b85`) | `careerdev4ai` (`careerdev4ai-765b`) |
| Project | `proj_kddvwmltmrhauyjyohre` | `proj_ocrvfiyhenpmtexfsbmj` |
| Created | 2026-11-04 15:37 UTC | 2026-11-04 21:11 UTC |
| Account details confirmed | yes | yes |
| Free plan | `409 "Organization is already activated"` | `409 "Organization is already activated"` |
| Build and upload | succeed | succeed |
| Deployment | `x Deployments are not available for this organization.` | `x Deployments are not available for this organization.` |

The second organisation is hours old, belongs to a different account, and has
never had a deployment either — and it is refused with the identical message.
So the refusal is not caused by the age of the organisation, by the project, by
the account's history, or by anything that was done to the first organisation.
Both organisations reach the same gate.

Please confirm what that gate is and what enables deployments for an
organisation on the Free plan.

## The live application now runs on the second organisation

Because the first organisation cannot be signed into, the application was moved
onto the second one. As of 2026-11-05 the production web application triggers
its background jobs on `proj_ocrvfiyhenpmtexfsbmj` with a development secret key
that belongs to that project, and a real `match-jobs` run completes end to end
through the deployed site. The first organisation is no longer used by the
application.

This makes the refusal more clearly a platform-side gate rather than a
project-side one: the project that *is* in use now is exactly the one whose
Production deployment is refused.

## A request about a key that has to be revoked

The development secret key of the **first** project
(`proj_kddvwmltmrhauyjyohre`, organisation `careerdev4ai-1b85`) was disclosed
outside the organisation and is therefore being treated as compromised. It has
been replaced in the application, but it cannot be revoked from the dashboard,
because the only member of that organisation is
`ahmedghannam801@gmail.com` and that account cannot be signed into.

Could you please **revoke the development secret key(s) of
`proj_kddvwmltmrhauyjyohre`**? Its value is deliberately not quoted in this
message. The key name in the dashboard is the one that was used by the deployed
application before the move. Revoking it would close the last remaining way to
use the exposed credential.

## The organisation detail endpoint fails for every organisation

With a user token for the owner of the organisation:

| Request | Answer |
| --- | --- |
| `GET /api/v1/orgs/{org}` | `400 {"message":"Unexpected Server Error"}` |
| `GET /api/v1/orgs/{org}/projects` | `200` — the project is listed |
| `GET /api/v1/orgs/{org}/members` | `200` — the admin member is listed |
| `GET /api/v1/orgs` | `200` — the organisation is listed |
| `GET /api/v1/projects/{ref}` | `200` — the project and its organisation are listed |

The same `400` is returned for the second organisation, so it looks like a
fault in that endpoint rather than anything to do with one organisation. It is
mentioned here in case it is related to the deployment gate.

## What has already been checked

Each of these was checked directly against the platform's API, so none of them
is a guess:

- **The Free plan is active.** `POST /api/v1/orgs/{org}/activate-free-plan`
  answers `409 {"error":"Organization is already activated"}` — the same answer
  the Trigger.dev CLI treats as "the plan is already there".
- **The Free plan includes Production.** The pricing page lists
  `concurrentRuns.production = 20` and `queueSizeLimits.deployed = 10000` for
  the free plan, so a Production deployment is meant to be included.
- **The project is initialised.** `POST /api/v1/projects/{ref}/init` returns
  `initializedAt: 2026-11-04T15:44:55.410Z`.
- **The credential works.** The build and the artifact upload both succeed with
  the same personal access token, and `GET /api/v1/projects/runtimes`,
  `GET /api/v1/orgs`, `GET /api/v1/platform-notifications` and
  `GET /api/v1/whoami` all answer `200`.
- **The Production environment exists.** `GET /api/v1/projects/{ref}/prod`
  answers `200`, and `GET /api/v1/deployments/latest` answers
  `404 {"error":"Deployment not found"}` — consistent with a project that has
  never had a deployment, which is what we are trying to create.
- **There is no deployment to promote instead.** `GET /api/v1/deployments/latest`
  returns 404, and `GET /api/v1/projects/runtimes` shows
  `"environment": {"slug": "prod"}, "deployment": null`.
- **Nothing is wrong with the platform right now.**
  `GET /api/v1/remote-build-provider-status` answers
  `{"status":"operational","message":"Depot is operational"}`, and
  status.trigger.dev reports every component operational on 2026-11-04.
- **The platform raises no objection to this organisation.**
  `GET /api/v1/platform-notifications` answers `{"notification": null}` for both
  the account and the project — no incident notice, no onboarding warning, no
  plan restriction.
- **The CLI is current.** `npm view trigger.dev version` and
  `npm view @trigger.dev/sdk version` both return `4.8.3`, which is what is
  installed.
- **The account details have been confirmed in the dashboard.** The dashboard
  asked the account to confirm its details before it would show anything; that
  form has been submitted, and the refusal is unchanged.

## One more thing worth checking

The dashboard session that completed the account confirmation belongs to
`mohamedghnnam801@gmail.com`, which is a different account from the one that
owns this organisation: every attempt to open
`https://cloud.trigger.dev/orgs/careerdev4ai-1b85` from that session redirects to
`/orgs/new`, and this organisation's only member is the administrator
`ahmedghannam801@gmail.com` above.

The two accounts are both ours, so this is not a request to move anything — but
if the organisation is attached to an account record that cannot be signed into,
that would be worth knowing, because it would also explain why the deployment
refusal does not lift. Could you check which account the organisation is
attached to?

## What is being asked

1. Please confirm whether Production deployments are enabled for an
   organisation on the Free plan, and if they are not, what enables them.
   Two separate organisations, on two separate accounts, are both refused with
   the same message.
2. The pricing page lists Production and Development environments on the Free
   plan (`concurrentRuns.production = 20`, `queueSizeLimits.deployed = 10000`),
   and it also says the Free plan "requires a verified GitHub account". If a
   verified GitHub account is what the deployment gate is waiting for, please
   say so — we have not been able to find a step for it.
3. Please look at `GET /api/v1/orgs/{org}`, which answers `400 Unexpected Server
   Error` for every organisation we can reach.
4. If this is a fault on your side, both organisations were created on
   2026-11-04 and neither has ever had a deployment, which is the same shape as
   the *"Deployments for new project are failing"* issue recorded on your status
   page on 2025-12-05.
5. Please revoke the development secret key(s) of `proj_kddvwmltmrhauyjyohre`,
   as described above. The application no longer uses that project, so the key
   has no remaining legitimate use.

## Reproducing it

```bash
npm i -D trigger.dev@4.8.3
npx trigger.dev@latest init -p proj_kddvwmltmrhauyjyohre --yes
npx trigger.dev@latest deploy --prod
```

and, on the second organisation (the one the application now uses):

```bash
npx trigger.dev@latest deploy --prod -p proj_ocrvfiyhenpmtexfsbmj
```

The build and the upload succeed in both cases; the deployment is refused with
the message above.

## A note on secrets

No secret is included in this request. The reproduction above only needs the
personal access token that `trigger.dev login` stores locally. The development
secret key of the first project has been replaced and its value is not quoted
here; the key of the project the application now uses is also not quoted.
