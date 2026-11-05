# Support request — Production deployments are refused for this organisation

**To:** Trigger.dev support (`help@trigger.dev`, or the in-dashboard chat)
**Subject:** Production deployment refused — "Deployments are not available for this organization" (project `proj_kddvwmltmrhauyjyohre`)

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
| Attempts | Six, spread across roughly nine hours, including after the account details were confirmed in the dashboard |

## The organisation record itself does not load

This is the most specific finding, and it points at the organisation rather than
at the project. With a user token for the organisation's own administrator:

| Request | Answer |
| --- | --- |
| `GET /api/v1/orgs/{org}` | `400 {"message":"Unexpected Server Error"}` |
| `GET /api/v1/orgs/{org}/projects` | `200` — the project is listed |
| `GET /api/v1/orgs/{org}/members` | `200` — the admin member is listed |
| `GET /api/v1/orgs` | `200` — the organisation is listed |
| `GET /api/v1/projects/{ref}` | `200` — the project and its organisation are listed |

So the organisation is there, its members are there and its projects are there,
but reading the organisation record itself fails on the server. The deployment
endpoint refuses with an organisation-level message at the point where it would
create the deployment for that organisation, which is consistent with the same
failure.

Could you confirm whether the organisation record needs repair on your side?

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
`mohamedghnnam801@gmail.com`. That account cannot open the organisation: every
attempt to open `https://cloud.trigger.dev/orgs/careerdev4ai-1b85` redirects to
`/orgs/new`, and the organisation's only member is the administrator
`ahmedghannam801@gmail.com` above.

If the organisation is attached to an account that cannot be signed into, that
would explain both the dashboard behaviour and the deployment refusal. Could you
check which account the organisation is attached to?

## What is being asked

1. Please confirm whether Production deployments are enabled for the
   organisation `Careerdev4ai`, and if they are not, what needs to happen for
   them to be.
2. Please look at the organisation record: `GET /api/v1/orgs/{org}` answers
   `400 Unexpected Server Error` while its projects and members answer `200`.
3. The pricing page lists Production and Development environments on the Free
   plan. If a newly created organisation needs an extra step — a verification,
   a billing detail, a wait — please say which.
4. If this is a fault on your side, the organisation was created about nine hours
   before the first attempt, and the project has never had a deployment, which is
   the same shape as the *"Deployments for new project are failing"* issue
   recorded on your status page on 2025-12-05.

## Reproducing it

```bash
npm i -D trigger.dev@4.8.3
npx trigger.dev@latest init -p proj_kddvwmltmrhauyjyohre --yes
npx trigger.dev@latest deploy --prod
```

The build and the upload succeed; the deployment is refused with the message
above.

## A note on secrets

No secret is included in this request. The reproduction above only needs the
personal access token that `trigger.dev login` stores locally. The project's
development secret key is being rotated as a precaution, so it is not quoted
here either.
