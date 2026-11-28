-- Migration: 20261203000001_free_platform.sql
-- Description: Withdraw the database's ability to turn money into access.
--
-- WHY THIS EXISTS
-- ---------------
-- Aionvia is a free platform at the moment. The application no longer sells
-- anything: there is no checkout, no payment gateway, no plan catalogue and
-- no credit balance that gates a feature. Every one of those was already
-- removed in code — the routes are not mounted and the screens that offered
-- them are gone.
--
-- This file is the backstop underneath that. It does NOT delete anything and
-- it does NOT change a single row. It withdraws the EXECUTE privilege on the
-- four stored procedures whose only purpose is to turn a payment into access,
-- so that no route, no forgotten admin button and no manual call can put a
-- paid entitlement or a paid credit grant back into a free platform.
--
-- WHAT IS DELIBERATELY LEFT ALONE
-- -------------------------------
--
--   * Every payment, subscription and credit TABLE stays, with every row it
--     holds. Those rows are the platform's financial history: they are what
--     the administration screens report on, and they are what an accountant
--     would ask for. Nothing here drops, truncates or rewrites them.
--
--   * `expire_subscriptions()` and `expire_temporary_access()` keep their
--     privilege. They GRANT nothing — they mark a lapsed subscription as
--     expired, which keeps the historical record truthful. A subscription
--     whose period has ended must say so whether or not the platform still
--     sells periods, and freezing the rows in a stale 'active' state would be
--     the worse lie.
--
--   * `grant_ai_credits()` keeps its privilege. It is how the daily allowance
--     and the referral reward are granted, neither of which is a payment.
--
--   * RLS is not touched at all. No policy anywhere in this schema reads a
--     subscription status, a plan code or a credit balance, so no policy can
--     block a free user and none needs changing.
--
-- HOW TO TURN MONETIZATION BACK ON
-- --------------------------------
-- Re-grant the four privileges. That is the whole reversal, and it is
-- written out at the bottom of this file so that it does not have to be
-- reconstructed. The application code reads the same switch
-- (`shared/platformAccess.ts`), so the two come back together.

-- ---------------------------------------------------------------------------
-- 1. The payment -> access procedures
-- ---------------------------------------------------------------------------

-- The gateway's entitlement writer. It creates or activates the subscription
-- row that a confirmed card payment buys.
REVOKE EXECUTE ON FUNCTION public.activate_xpay_subscription(uuid, text, text, timestamptz, timestamptz, text, jsonb) FROM service_role;

-- The administrator's manual grant of AI credits. A grant is the platform's
-- own money operation, and there is no balance for it to top up.
REVOKE EXECUTE ON FUNCTION public.admin_grant_ai_credits(uuid, uuid, integer, text, text) FROM service_role;

-- The legacy offline-payment procedures: a confirmed Vodafone Cash or
-- InstaPay transfer, which activated a subscription and granted its monthly
-- allowance.
REVOKE EXECUTE ON FUNCTION public.confirm_payment_and_activate(uuid, uuid, text) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.confirm_credit_pack_payment(uuid, uuid, text) FROM service_role;

-- ---------------------------------------------------------------------------
-- 2. The comment that says why
-- ---------------------------------------------------------------------------

COMMENT ON FUNCTION public.activate_xpay_subscription(uuid, text, text, timestamptz, timestamptz, text, jsonb) IS
  'Activates a subscription bought through the payment gateway. Withdrawn while the platform is free: money must not be able to grant access. Re-grant with: GRANT EXECUTE ON FUNCTION public.activate_xpay_subscription(uuid, text, text, timestamptz, timestamptz, text, jsonb) TO service_role;';

COMMENT ON FUNCTION public.admin_grant_ai_credits(uuid, uuid, integer, text, text) IS
  'Grants AI credits to a profile from the administration screens. Withdrawn while the platform is free: a grant is a money operation and there is no balance for it to top up. Re-grant with: GRANT EXECUTE ON FUNCTION public.admin_grant_ai_credits(uuid, uuid, integer, text, text) TO service_role;';

COMMENT ON FUNCTION public.confirm_payment_and_activate(uuid, uuid, text) IS
  'Confirms an offline payment and activates the subscription it bought. Withdrawn while the platform is free. Re-grant with: GRANT EXECUTE ON FUNCTION public.confirm_payment_and_activate(uuid, uuid, text) TO service_role;';

COMMENT ON FUNCTION public.confirm_credit_pack_payment(uuid, uuid, text) IS
  'Confirms an offline payment for a credit pack and grants the pack. Withdrawn while the platform is free. Re-grant with: GRANT EXECUTE ON FUNCTION public.confirm_credit_pack_payment(uuid, uuid, text) TO service_role;';

-- ===========================================================================
-- REVERSAL
-- ===========================================================================
--
-- Run these four statements to put the paid release back. Nothing else in
-- this migration needs undoing: it grants no privilege and changes no row.
--
--   GRANT EXECUTE ON FUNCTION public.activate_xpay_subscription(uuid, text, text, timestamptz, timestamptz, text, jsonb) TO service_role;
--   GRANT EXECUTE ON FUNCTION public.admin_grant_ai_credits(uuid, uuid, integer, text, text) TO service_role;
--   GRANT EXECUTE ON FUNCTION public.confirm_payment_and_activate(uuid, uuid, text) TO service_role;
--   GRANT EXECUTE ON FUNCTION public.confirm_credit_pack_payment(uuid, uuid, text) TO service_role;
--
-- The application-side switch is one line:
--
--   shared/platformAccess.ts -> export const MONETIZATION_ENABLED = true;
--
-- ===========================================================================
