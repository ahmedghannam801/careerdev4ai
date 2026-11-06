/**
 * Coupon Definitions and Validation Service.
 * Validates promotional codes, expiry windows, plan applicability, and discount amounts.
 */

import { getSupabaseServer } from '../db/supabase.ts';

export interface CouponValidationResult {
  valid: boolean;
  couponId?: string;
  code?: string;
  discountAmountPiasters: number;
  reason?: string;
}

interface CouponRow {
  id: string;
  code: string;
  discount_percent: number | null;
  discount_amount_piasters: number | null;
  max_discount_piasters: number | null;
  applicable_plans: string[] | null;
  min_amount_piasters: number;
  max_uses: number | null;
  uses_count: number;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
}

/**
 * Validates a coupon code against a target plan and purchase amount.
 */
export async function validateCoupon(
  code: string,
  planCode: string,
  originalAmountPiasters: number
): Promise<CouponValidationResult> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) {
    return { valid: false, discountAmountPiasters: 0, reason: 'Coupon code cannot be empty' };
  }

  const { data, error } = await getSupabaseServer()
    .from('coupon_definitions')
    .select('*')
    .eq('code', normalized)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) {
    return { valid: false, discountAmountPiasters: 0, reason: 'Invalid or expired coupon code' };
  }

  const coupon = data as CouponRow;
  const now = new Date().toISOString();

  // 1. Time validity
  if (coupon.valid_from && coupon.valid_from > now) {
    return { valid: false, discountAmountPiasters: 0, reason: 'Coupon is not yet active' };
  }
  if (coupon.valid_until && coupon.valid_until < now) {
    return { valid: false, discountAmountPiasters: 0, reason: 'Coupon has expired' };
  }

  // 2. Usage limits
  if (coupon.max_uses !== null && coupon.uses_count >= coupon.max_uses) {
    return { valid: false, discountAmountPiasters: 0, reason: 'Coupon usage limit has been reached' };
  }

  // 3. Minimum order amount
  if (originalAmountPiasters < coupon.min_amount_piasters) {
    const minEgp = (coupon.min_amount_piasters / 100).toFixed(0);
    return {
      valid: false,
      discountAmountPiasters: 0,
      reason: `Coupon requires a minimum order amount of ${minEgp} EGP`,
    };
  }

  // 4. Applicable plan check
  if (coupon.applicable_plans && coupon.applicable_plans.length > 0) {
    if (!coupon.applicable_plans.includes(planCode)) {
      return {
        valid: false,
        discountAmountPiasters: 0,
        reason: `Coupon is not valid for the ${planCode} plan`,
      };
    }
  }

  // 5. Calculate discount
  let discount = 0;
  if (coupon.discount_percent !== null) {
    discount = Math.round((originalAmountPiasters * coupon.discount_percent) / 100);
    if (coupon.max_discount_piasters !== null) {
      discount = Math.min(discount, coupon.max_discount_piasters);
    }
  } else if (coupon.discount_amount_piasters !== null) {
    discount = Math.min(coupon.discount_amount_piasters, originalAmountPiasters);
  }

  return {
    valid: true,
    couponId: coupon.id,
    code: coupon.code,
    discountAmountPiasters: Math.max(0, discount),
  };
}

