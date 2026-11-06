/**
 * Server persistence for subscriptions and subscription plans.
 * All mutations enforce user ownership via verified profileId.
 */

import { getSupabaseServer } from './supabase.ts';
import type {
  BillingCycle,
  SubscriptionDTO,
  SubscriptionPlanCode,
  SubscriptionPlanDTO,
  SubscriptionStatus,
} from '../../shared/subscriptions.ts';

interface SubscriptionPlanRow {
  id: string;
  code: string;
  name_en: string;
  name_ar: string;
  description_en: string | null;
  description_ar: string | null;
  price_monthly_piasters: number;
  price_annual_piasters: number;
  currency: string;
  monthly_ai_credits: number;
  features: Record<string, unknown>;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface SubscriptionRow {
  id: string;
  profile_id: string;
  plan_id: string;
  billing_cycle: string;
  status: string;
  current_period_starts_at: string;
  current_period_ends_at: string;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  ended_at: string | null;
  latest_payment_id: string | null;
  auto_renew: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  subscription_plans?: SubscriptionPlanRow | SubscriptionPlanRow[] | null;
}

const PLAN_COLUMNS =
  'id, code, name_en, name_ar, description_en, description_ar, price_monthly_piasters, price_annual_piasters, currency, monthly_ai_credits, features, sort_order, is_active, created_at, updated_at';

const SUBSCRIPTION_COLUMNS =
  'id, profile_id, plan_id, billing_cycle, status, current_period_starts_at, current_period_ends_at, cancelled_at, cancellation_reason, ended_at, latest_payment_id, auto_renew, metadata, created_at, updated_at';

function toPlanDTO(row: SubscriptionPlanRow): SubscriptionPlanDTO {
  return {
    id: row.id,
    code: row.code as SubscriptionPlanCode,
    nameEn: row.name_en,
    nameAr: row.name_ar,
    descriptionEn: row.description_en,
    descriptionAr: row.description_ar,
    priceMonthlyPiasters: row.price_monthly_piasters,
    priceAnnualPiasters: row.price_annual_piasters,
    currency: 'EGP',
    monthlyAiCredits: row.monthly_ai_credits,
    features: row.features ?? {},
    sortOrder: row.sort_order,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSubscriptionDTO(row: SubscriptionRow, planRow?: SubscriptionPlanRow): SubscriptionDTO {
  const plans = row.subscription_plans;
  const resolvedPlan = planRow ?? (Array.isArray(plans) ? plans[0] : plans);
  return {
    id: row.id,
    profileId: row.profile_id,
    planId: row.plan_id,
    planCode: (resolvedPlan?.code ?? 'free') as SubscriptionPlanCode,
    planNameEn: resolvedPlan?.name_en ?? 'Free Explorer',
    planNameAr: resolvedPlan?.name_ar ?? 'المستكشف المجاني',
    billingCycle: (row.billing_cycle ?? 'monthly') as BillingCycle,
    status: (row.status ?? 'active') as SubscriptionStatus,
    currentPeriodStartsAt: row.current_period_starts_at,
    currentPeriodEndsAt: row.current_period_ends_at,
    cancelledAt: row.cancelled_at,
    cancellationReason: row.cancellation_reason,
    endedAt: row.ended_at,
    latestPaymentId: row.latest_payment_id,
    autoRenew: row.auto_renew ?? false,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Lists all active subscription plans ordered by display sort. */
export async function listActivePlans(): Promise<SubscriptionPlanDTO[]> {
  const { data, error } = await getSupabaseServer()
    .from('subscription_plans')
    .select(PLAN_COLUMNS)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return ((data ?? []) as SubscriptionPlanRow[]).map(toPlanDTO);
}

/** Retrieves a subscription plan by code (e.g. 'student', 'pro'). */
export async function getPlanByCode(code: string): Promise<SubscriptionPlanDTO | null> {
  const { data, error } = await getSupabaseServer()
    .from('subscription_plans')
    .select(PLAN_COLUMNS)
    .eq('code', code)
    .maybeSingle();

  if (error) throw error;
  return data ? toPlanDTO(data as SubscriptionPlanRow) : null;
}

/** Retrieves a subscription plan by ID. */
export async function getPlanById(planId: string): Promise<SubscriptionPlanDTO | null> {
  const { data, error } = await getSupabaseServer()
    .from('subscription_plans')
    .select(PLAN_COLUMNS)
    .eq('id', planId)
    .maybeSingle();

  if (error) throw error;
  return data ? toPlanDTO(data as SubscriptionPlanRow) : null;
}

/**
 * Returns the candidate's active subscription, or null if on default Free tier.
 */
export async function getActiveSubscription(profileId: string): Promise<SubscriptionDTO | null> {
  const { data, error } = await getSupabaseServer()
    .from('subscriptions')
    .select(`${SUBSCRIPTION_COLUMNS}, subscription_plans(${PLAN_COLUMNS})`)
    .eq('profile_id', profileId)
    .eq('status', 'active')
    .gt('current_period_ends_at', new Date().toISOString())
    .maybeSingle();

  if (error) throw error;
  return data ? toSubscriptionDTO(data as unknown as SubscriptionRow) : null;
}

/**
 * Lists the subscription history for a profile, newest first.
 */
export async function listSubscriptionsForUser(profileId: string): Promise<SubscriptionDTO[]> {
  const { data, error } = await getSupabaseServer()
    .from('subscriptions')
    .select(`${SUBSCRIPTION_COLUMNS}, subscription_plans(${PLAN_COLUMNS})`)
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as unknown as SubscriptionRow[]).map((row) => toSubscriptionDTO(row));
}

/**
 * Cancels auto-renew on the candidate's active subscription.
 */
export async function cancelSubscription(
  profileId: string,
  subscriptionId: string,
  reason?: string
): Promise<SubscriptionDTO | null> {
  const { data, error } = await getSupabaseServer()
    .from('subscriptions')
    .update({
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason ?? 'User requested cancellation',
      auto_renew: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', subscriptionId)
    .eq('profile_id', profileId)
    .eq('status', 'active')
    .select(`${SUBSCRIPTION_COLUMNS}, subscription_plans(${PLAN_COLUMNS})`)
    .maybeSingle();

  if (error) throw error;
  return data ? toSubscriptionDTO(data as unknown as SubscriptionRow) : null;
}
