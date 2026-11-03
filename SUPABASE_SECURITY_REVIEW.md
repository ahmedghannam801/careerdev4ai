# Supabase Security Review — CareerDev4AI

Scope: read-only inspection of the connected project (`careerdev4ai`) plus the
repository changes made for this review. Nothing in production data, accounts,
authentication providers, AI providers or branding was changed.

## 1. Row Level Security and data isolation (verified)

Every user-scoped table has RLS enabled and owner-scoped policies:

| Table | RLS | Policy shape |
|---|---|---|
| `public.profiles` | enabled | `auth.uid() = id` |
| `public.cvs` | enabled | `auth.uid() = profile_id` |
| `public.cv_versions` | enabled | owner through `cvs.profile_id` |
| `public.application_packages` | enabled | `auth.uid() = profile_id` |
| `public.user_consents` | enabled | `auth.uid() = user_id` |
| `public.roadmap_tasks` | enabled | owner through `roadmaps.profile_id` |
| `storage.objects` | enabled | `bucket_id = 'cv-files'` and `storage_object_owner(name) = auth.uid()` |

The CV bucket `cv-files` is private (`public = false`), limited to 10 MB, and
accepts only PDF, DOC/DOCX, plain text and JSON. A user can read, write and
delete only their own objects.

## 2. `admin_audit_log` — closed to the browser, reachable only by admins

**Finding (advisor `rls_enabled_no_policy`, INFO level).** The table has RLS
enabled and no client policy. The Supabase linter reports this as a finding.

**Investigation.** The audit trail is written and read only through the server:

- `server/db/admin.ts` → `logAdminAction()` writes with the service-role client.
- `server/db/admin.ts` → `listAuditLog()` reads with the service-role client.
- The only route that exposes it is `GET /api/admin/audit`, guarded by
  `requireAuth` → `requireAdmin` → `requirePermission('audit.read')`.
- The Admin Center UI reads it through that route (`src/lib/adminApi.ts`), never
  directly from the browser.

So the absence of a client policy is intentional: the trail is never exposed to
ordinary users, and the RLS state (no policy) denies every client request.

**Residual risk that was fixed.** The table nevertheless carried full table
grants for `anon` and `authenticated`. RLS alone was the only thing standing
between the trail and a signed-in user; had the table's RLS ever been disabled
or altered by mistake, every administrator action would have become readable
and writable by any signed-in user.

Migration `supabase/migrations/20261104000001_admin_audit_log_grants.sql` now
revokes those grants:

```sql
REVOKE ALL ON public.admin_audit_log FROM anon;
REVOKE ALL ON public.admin_audit_log FROM authenticated;
```

After the change the only roles holding privileges on the table are
`service_role` (the server) and `postgres` (the owner). No client policy was
created, no audit record is exposed to ordinary users, and the Admin Center
keeps working through the permission-checked API. The advisor entry remains as
an informational notice, because the deliberate state of this table is
"RLS on, no client policy".

## 3. Leaked password protection — plan-restricted, cannot be enabled here

**Finding (advisor `auth_leaked_password_protection`, WARN level).** Supabase
Auth does not currently check new passwords against the Have I Been Pwned list.

**Availability.** Supabase documents leaked password protection as
[available on the Pro Plan and above](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
It is an Auth provider setting, not a database object.

**Why it was not switched on in this session.** The available tooling for this
project reaches the database and the public API keys; it does not expose the
Auth provider configuration, and no Supabase Management API token (with
`project:write`) is available in this environment. Enabling the setting
therefore requires the project owner, in one of two ways:

1. Dashboard → Project Settings → Authentication → Providers → Email → enable
   "Prevent use of leaked passwords" (requires the Pro plan).
2. Management API: `PATCH /v1/projects/{ref}/config/auth` with
   `"security":{"leaked_password_protection": true}` using a personal access
   token that has `project:write`.

**Plan-independent hardening applied in the repository.** So the rule still
holds on a plan without the hosted feature:

- `src/context/CareerContext.tsx` — registration rejects a password shorter
  than 8 characters before the request is sent, and the reason is shown in the
  candidate's language.
- `app.ts` (`POST /api/account/change-password`) — the server rejects a new
  password shorter than 8 characters with a clear 400.
- `src/components/auth/PasswordRecoveryModal.tsx` already required 8
  characters for a new password.

The minimum of 8 characters follows the Supabase guidance ("anything less than
8 characters is not recommended").

## 4. Administrative permissions

Every administrative route is guarded by `requireAuth` + `requireAdmin` +
`requirePermission(...)` on the server; the Admin Center tabs are a
convenience, not the boundary. Roles (`super_admin`, `content_admin`,
`moderator`) and their permissions are resolved on the server from the
`admin_users` table, and a disabled administrator loses every permission. The
existing test suite asserts this ("administrative access is server-enforced",
"administrator management", "moderation reports", "delivery ledger and
analytics").

## 5. Outstanding items for the project owner

1. Enable leaked password protection (Pro plan and above) — see section 3.
2. Confirm the password strength settings (minimum length, required character
   classes) in the same Auth settings page.
3. Keep `admin_audit_log` free of client policies; the grants are revoked and
   the table is intentionally server-only.
