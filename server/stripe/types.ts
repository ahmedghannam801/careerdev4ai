/**
 * Minimal Stripe object shapes used by this integration.
 *
 * Only the fields the application actually reads are declared. Stripe objects
 * carry many more properties; keeping the surface small means an API addition
 * can never silently change how the code behaves.
 */

export interface StripeMetadata {
  [key: string]: string | undefined;
}

export interface StripeCustomer {
  id: string;
  email: string | null;
  metadata: StripeMetadata;
  livemode: boolean;
  deleted?: boolean;
}

export interface StripePrice {
  id: string;
  product: string;
  currency: string;
  unit_amount: number | null;
  lookup_key: string | null;
  active: boolean;
  livemode: boolean;
  recurring: { interval: 'day' | 'week' | 'month' | 'year'; interval_count: number } | null;
  metadata: StripeMetadata;
}

export interface StripeProduct {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  metadata: StripeMetadata;
}

export interface StripeSubscriptionItem {
  id: string;
  price: StripePrice;
  quantity: number | null;
}

export interface StripeSubscription {
  id: string;
  customer: string;
  status:
    | 'active'
    | 'trialing'
    | 'past_due'
    | 'canceled'
    | 'unpaid'
    | 'incomplete'
    | 'incomplete_expired'
    | 'paused';
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end: boolean;
  canceled_at: number | null;
  ended_at: number | null;
  trial_end: number | null;
  latest_invoice: string | null;
  livemode: boolean;
  metadata: StripeMetadata;
  items: { data: StripeSubscriptionItem[] };
}

export interface StripeCheckoutSession {
  id: string;
  object: 'checkout.session';
  mode: 'payment' | 'subscription' | 'setup';
  customer: string | null;
  subscription: string | null;
  payment_intent: string | null;
  payment_status: 'paid' | 'unpaid' | 'no_payment_required';
  client_reference_id: string | null;
  metadata: StripeMetadata;
  url: string | null;
  livemode: boolean;
}

export interface StripeInvoice {
  id: string;
  object: 'invoice';
  customer: string | null;
  subscription: string | null;
  payment_intent: string | null;
  status: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void' | null;
  billing_reason:
    | 'subscription_create'
    | 'subscription_cycle'
    | 'subscription_update'
    | 'subscription_threshold'
    | 'manual'
    | 'upcoming'
    | 'quote_accept'
    | null;
  number: string | null;
  currency: string;
  amount_due: number;
  amount_paid: number;
  amount_remaining: number;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  period_start: number;
  period_end: number;
  paid: boolean;
  livemode: boolean;
  created: number;
  metadata: StripeMetadata;
}

export interface StripeRefund {
  id: string;
  object: 'refund';
  amount: number;
  currency: string;
  charge: string | null;
  payment_intent: string | null;
  status: 'pending' | 'requires_action' | 'succeeded' | 'failed' | 'canceled' | null;
  reason: string | null;
  metadata: StripeMetadata;
  livemode: boolean;
  created: number;
}

export interface StripeCharge {
  id: string;
  object: 'charge';
  customer: string | null;
  invoice: string | null;
  payment_intent: string | null;
  amount: number;
  amount_refunded: number;
  currency: string;
  refunded: boolean;
  status: string | null;
  livemode: boolean;
  metadata: StripeMetadata;
}

export interface StripeDispute {
  id: string;
  object: 'dispute';
  charge: string | null;
  payment_intent: string | null;
  amount: number;
  currency: string;
  status: string | null;
  reason: string | null;
  livemode: boolean;
  created: number;
  metadata?: StripeMetadata;
}

export interface StripeEvent<T = unknown> {
  id: string;
  object: 'event';
  type: string;
  api_version: string | null;
  livemode: boolean;
  created: number;
  /** Present on Connect endpoints; absent for a direct account event. */
  account?: string | null;
  data: { object: T };
}

/** A row of `public.stripe_subscriptions`. */
export interface StripeSubscriptionRow {
  id: string;
  profile_id: string;
  customer_id: string;
  plan_code: string;
  billing_cycle: 'monthly' | 'annual';
  status: string;
  price_id: string | null;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  ended_at: string | null;
  trial_end: string | null;
  livemode: boolean;
  metadata: Record<string, unknown>;
  last_event_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StripeCustomerRow {
  profile_id: string;
  stripe_customer_id: string;
  email: string | null;
  livemode: boolean;
  deleted: boolean;
  created_at: string;
  updated_at: string;
}

/** A row of `public.stripe_invoices`. */
export interface StripeInvoiceRow {
  id: string;
  profile_id: string | null;
  customer_id: string | null;
  subscription_id: string | null;
  payment_intent: string | null;
  status: string | null;
  billing_reason: string | null;
  number: string | null;
  currency: string;
  amount_due: number;
  amount_paid: number;
  amount_remaining: number;
  paid: boolean;
  plan_code: string | null;
  billing_cycle: 'monthly' | 'annual' | null;
  purchase_kind: 'subscription' | 'credit_pack' | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  period_start: string | null;
  period_end: string | null;
  invoice_created_at: string | null;
  livemode: boolean;
  last_event_at: string | null;
  created_at: string;
  updated_at: string;
}

/** A row of `public.stripe_refunds`. */
export interface StripeRefundRow {
  id: string;
  profile_id: string | null;
  customer_id: string | null;
  invoice_id: string | null;
  charge_id: string | null;
  payment_intent: string | null;
  amount: number;
  currency: string;
  status: string | null;
  reason: string | null;
  livemode: boolean;
  refund_created_at: string | null;
  last_event_at: string | null;
  created_at: string;
  updated_at: string;
}

/** A row of `public.stripe_disputes`. */
export interface StripeDisputeRow {
  id: string;
  profile_id: string | null;
  customer_id: string | null;
  charge_id: string | null;
  payment_intent: string | null;
  amount: number;
  currency: string;
  status: string | null;
  reason: string | null;
  livemode: boolean;
  dispute_created_at: string | null;
  last_event_at: string | null;
  created_at: string;
  updated_at: string;
}
