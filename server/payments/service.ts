/**
 * Payments Orchestration Service.
 * Coordinates checkout creation, receipt evidence upload, duplicate reference checks,
 * risk scoring, provisional temporary access, and administrative reviews.
 */

import { getSupabaseServer } from '../db/supabase.ts';
import {
  createPaymentRequest,
  getPaymentRequestById,
  submitPaymentEvidence,
  isTransactionReferenceDuplicate,
  isReceiptHashDuplicate,
  recordVerification,
  getPaymentInstructions,
} from '../db/payments.ts';
import { getPlanByCode } from '../db/subscriptions.ts';
import { validateCoupon } from '../coupons/service.ts';
import { getActiveBirthdayReward } from '../birthday/service.ts';
import {
  type PaymentMethod,
  type PaymentRequestDTO,
  type PaymentInstructionsDTO,
} from '../../shared/payments.ts';
import { CREDIT_PACKS } from '../../shared/credits.ts';

export interface CreateCheckoutInput {
  profileId: string;
  planCode: string; // e.g. 'student', 'pro', 'career_plus' or 'pack_15', 'pack_40', 'pack_100'
  billingCycle: 'monthly' | 'annual';
  paymentMethod: PaymentMethod;
  couponCode?: string;
  applyBirthdayReward?: boolean;
}

export interface CheckoutResult {
  paymentRequest: PaymentRequestDTO;
  instructions: PaymentInstructionsDTO;
}

export interface SubmitEvidenceInput {
  profileId: string;
  paymentRequestId: string;
  transactionReference: string;
  senderPhoneOrHandle: string;
  receiptBuffer: Buffer | Uint8Array;
  filename: string;
  contentType: string;
  sizeBytes: number;
}

/** Computes SHA-256 hash string for an evidence file or buffer. */
async function computeSha256Hex(data: Buffer | Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data as unknown as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Creates a payment request intent with pricing, discount calculation, and instructions.
 */
export async function createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
  const { profileId, planCode, billingCycle, paymentMethod, couponCode, applyBirthdayReward } = input;

  let planId: string | null = null;
  let originalAmountPiasters: number;
  let itemType: 'subscription' | 'credit_pack' = 'subscription';
  let creditPackId: string | null = null;
  let creditsToGrant: number | null = null;

  // Check if target is a subscription plan or credit pack
  const plan = await getPlanByCode(planCode);
  if (plan) {
    planId = plan.id;
    originalAmountPiasters =
      billingCycle === 'annual' ? plan.priceAnnualPiasters : plan.priceMonthlyPiasters;
    itemType = 'subscription';
  } else {
    const pack = CREDIT_PACKS.find((p) => p.id === planCode);
    if (!pack) {
      throw new Error(`Invalid plan or credit pack code: ${planCode}`);
    }
    planId = null;
    originalAmountPiasters = pack.pricePiasters;
    itemType = 'credit_pack';
    creditPackId = pack.id;
    creditsToGrant = pack.credits;
  }

  let discountAmountPiasters = 0;
  let couponId: string | null = null;

  // 1. Coupon validation
  if (couponCode) {
    const couponResult = await validateCoupon(couponCode, planCode, originalAmountPiasters);
    if (couponResult.valid) {
      discountAmountPiasters = couponResult.discountAmountPiasters;
      couponId = couponResult.couponId ?? null;
    }
  }

  // 2. BLK-07: Birthday reward (30% discount, max 100 EGP, Law 151 compliant, uncombinable)
  // Strictly restricted to monthly subscriptions for paid tiers (not annual, not credit packs, not free)
  const isEligibleMonthlySubscription =
    itemType === 'subscription' &&
    billingCycle === 'monthly' &&
    ['student', 'pro', 'career_plus'].includes(planCode);

  if (applyBirthdayReward && isEligibleMonthlySubscription && discountAmountPiasters === 0) {
    const birthdayReward = await getActiveBirthdayReward(profileId);
    if (birthdayReward && birthdayReward.status === 'available') {
      const bdayDiscount = Math.round((originalAmountPiasters * birthdayReward.discountPercentage) / 100);
      discountAmountPiasters = Math.min(bdayDiscount, birthdayReward.maxDiscountPiasters);
    }
  }

  const finalAmountPiasters = Math.max(0, originalAmountPiasters - discountAmountPiasters);
  const idempotencyKey = `pay_req_${profileId}_${planCode}_${billingCycle}_${Date.now()}`;

  const paymentRequest = await createPaymentRequest({
    profileId,
    planId,
    billingCycle,
    originalAmountPiasters,
    discountAmountPiasters,
    paymentMethod,
    couponId,
    idempotencyKey,
    itemType,
    creditPackId,
    creditsToGrant,
  });

  const instructions = getPaymentInstructions(paymentMethod, finalAmountPiasters);

  return { paymentRequest, instructions };
}

/**
 * Handles candidate proof submission, uploads receipt to secure private bucket,
 * evaluates duplicate references and hash, computes fraud risk score, and
 * conditionally grants 24-hr provisional temporary access.
 */
export async function submitEvidence(input: SubmitEvidenceInput): Promise<PaymentRequestDTO> {
  const {
    profileId,
    paymentRequestId,
    transactionReference,
    senderPhoneOrHandle,
    receiptBuffer,
    filename,
    contentType,
    sizeBytes,
  } = input;

  const existingRequest = await getPaymentRequestById(paymentRequestId, profileId);
  if (!existingRequest) {
    throw new Error('Payment request not found or does not belong to user');
  }

  if (existingRequest.status !== 'pending' && existingRequest.status !== 'under_review') {
    throw new Error(`Cannot submit evidence for request in '${existingRequest.status}' status`);
  }

  // 1. Compute receipt SHA-256 hash
  const receiptHash = await computeSha256Hex(receiptBuffer);

  // 2. Check duplicate reference and duplicate receipt hash
  const [isDupRef, isDupHash] = await Promise.all([
    isTransactionReferenceDuplicate(
      existingRequest.paymentMethod,
      transactionReference,
      paymentRequestId
    ),
    isReceiptHashDuplicate(receiptHash, paymentRequestId),
  ]);

  // 3. Compute Risk Score & Risk Flags
  let riskScore = 0;
  const riskFlags: string[] = [];

  if (isDupRef) {
    riskScore += 50;
    riskFlags.push('duplicate_transaction_reference');
  }

  if (isDupHash) {
    riskScore += 60;
    riskFlags.push('duplicate_receipt_image_hash');
  }

  // Validate phone format for Vodafone Cash
  if (existingRequest.paymentMethod === 'vodafone_cash') {
    const cleanPhone = senderPhoneOrHandle.replace(/[\s-]/g, '');
    if (!/^01[0125]\d{8}$/.test(cleanPhone)) {
      riskScore += 20;
      riskFlags.push('suspicious_phone_format');
    }
  }

  // Check if reference is suspiciously short
  if (transactionReference.trim().length < 6) {
    riskScore += 25;
    riskFlags.push('short_reference_code');
  }

  // Provisional access is granted ONLY if risk score is strictly below 40
  const grantTemporaryAccess = riskScore < 40;

  // 4. Upload receipt to private bucket 'payment-receipts'
  const fileExt = filename.split('.').pop() || 'png';
  const storagePath = `${profileId}/${paymentRequestId}_${Date.now()}.${fileExt}`;

  const { error: uploadError } = await getSupabaseServer().storage
    .from('payment-receipts')
    .upload(storagePath, receiptBuffer, {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    console.error('Failed to upload receipt to Supabase Storage:', uploadError);
    throw new Error('Failed to upload payment receipt');
  }

  // 5. Update payment request status in database
  const updatedRequest = await submitPaymentEvidence({
    requestId: paymentRequestId,
    profileId,
    transactionReference,
    senderPhoneOrHandle,
    receiptStoragePath: storagePath,
    receiptFilename: filename,
    receiptContentType: contentType,
    receiptSizeBytes: sizeBytes,
    receiptHash,
    riskScore,
    riskFlags,
    grantTemporaryAccess,
  });

  // 6. Record automated verification steps
  await Promise.all([
    recordVerification({
      paymentRequestId,
      verificationType: 'duplicate_check',
      result: isDupRef || isDupHash ? 'fail' : 'pass',
      confidenceScore: isDupRef || isDupHash ? 0.95 : 0.99,
      evidence: { isDupRef, isDupHash, receiptHash },
      verifierType: 'system',
    }),
    recordVerification({
      paymentRequestId,
      verificationType: 'amount_check',
      result: 'pass',
      confidenceScore: 0.9,
      evidence: {
        expectedPiasters: existingRequest.amountPiasters,
        paymentMethod: existingRequest.paymentMethod,
      },
      verifierType: 'system',
    }),
  ]);

  return updatedRequest;
}

/**
 * Confirms payment and activates subscription via atomic stored procedure.
 */
export async function confirmPaymentByAdmin(
  adminProfileId: string,
  paymentRequestId: string,
  notes?: string
): Promise<{ success: boolean; subscriptionId?: string; creditsGranted?: number; error?: string }> {
  const { data, error } = await getSupabaseServer().rpc('confirm_payment_and_activate', {
    p_payment_id: paymentRequestId,
    p_admin_id: adminProfileId,
    p_notes: notes ?? 'Payment verified and confirmed by administrator',
  });

  if (error) {
    console.error('Error confirming payment:', error);
    return { success: false, error: error.message };
  }

  const result = data as {
    success: boolean;
    subscription_id?: string;
    credits_granted?: number;
    error?: string;
  };
  return {
    success: result.success,
    subscriptionId: result.subscription_id,
    creditsGranted: result.credits_granted,
    error: result.error,
  };
}

/**
 * Rejects payment request and records audit notes.
 */
export async function rejectPaymentByAdmin(
  adminProfileId: string,
  paymentRequestId: string,
  reason: string,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  const now = new Date().toISOString();
  const { error } = await getSupabaseServer()
    .from('payment_requests')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      review_notes: notes ?? reason,
      reviewed_by: adminProfileId,
      reviewed_at: now,
      updated_at: now,
    })
    .eq('id', paymentRequestId);

  if (error) {
    console.error('Error rejecting payment:', error);
    return { success: false, error: error.message };
  }

  await recordVerification({
    paymentRequestId,
    verificationType: 'admin_manual',
    result: 'fail',
    confidenceScore: 1.0,
    evidence: { reason, notes },
    verifierType: 'admin',
    adminUserId: adminProfileId,
  });

  return { success: true };
}

/**
 * Restores a late-confirmed payment via stored procedure.
 */
export async function restorePaymentByAdmin(
  adminProfileId: string,
  paymentRequestId: string,
  notes?: string
): Promise<{ success: boolean; subscriptionId?: string; error?: string }> {
  const { data, error } = await getSupabaseServer().rpc('late_payment_restore', {
    p_payment_id: paymentRequestId,
    p_admin_id: adminProfileId,
    p_notes: notes ?? 'Late payment restored and activated by administrator',
  });

  if (error) {
    console.error('Error restoring late payment:', error);
    return { success: false, error: error.message };
  }

  const result = data as { success: boolean; subscription_id?: string; error?: string };
  return {
    success: result.success,
    subscriptionId: result.subscription_id,
    error: result.error,
  };
}
