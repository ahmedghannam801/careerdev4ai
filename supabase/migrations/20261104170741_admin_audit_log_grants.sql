-- Defence in depth for the administrator audit trail.
--
-- The trail is written and read only through the server: `logAdminAction` and
-- `listAuditLog` use the service-role client, and the only route that exposes
-- it (`GET /api/admin/audit`) requires an authenticated administrator with the
-- `audit.read` permission.
--
-- Row Level Security is already enabled on the table with no client policy, so
-- a browser request with the anon or authenticated key reads nothing. The
-- table privileges granted to those two roles are the remaining unnecessary
-- surface: if the table's RLS were ever disabled by mistake, every
-- administrator action would become readable by any signed-in user, and
-- writable by anyone.
--
-- Revoking those grants removes that path entirely. The server path
-- (service_role) and the owner's path (postgres) keep their privileges, so
-- the audit trail and the Admin Center keep working unchanged.

REVOKE ALL ON public.admin_audit_log FROM anon;
REVOKE ALL ON public.admin_audit_log FROM authenticated;
