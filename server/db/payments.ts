/**
 * Server persistence for payment requests and verifications.
 * Handles Vodafone Cash and InstaPay offline payment workflows.
 */

import { getSupabaseServer } from './supabase.ts';
import type {
  PaymentInstructionsDTO,
  PaymentMethod,
  PaymentRequestDTO,
  PaymentStatus,
  PaymentVerificationDTO,
} from '../../shared/payments.ts';

interface PaymentRequestRow {
  id: string;
  profile_id: string;
  plan_id: string | null;
  billing_cycle: string;
  original_amount_piasters: number;
  discount_amount_piasters: number;
  amount_piasters: number;
  currency: string;
  coupon_id: string | null;
  payment_method: string;
  status: string;
  transaction_reference: string | null;
  sender_phone_or_handle: string | null;
  receipt_storage_path: string | null;
  receipt_filename: string | null;
  receipt_content_type: string | null;
  receipt_size_bytes: number | null;
  receipt_hash: string | null;
  risk_score: number;
  risk_flags: string[];
  idempotency_key: string;
  temporary_access_granted_at: string | null;
  temporary_access_expires_at: string | null;
  review_notes: string | null;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  paid_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
  item_type?: string;
  credit_pack_id?: string | null;
  credits_to_grant?: number | null;
  subscription_plans?:
    | {
        code: string;
        name_en: string;
        name_ar: string;
      }
    | {
        code: string;
        name_en: string;
        name_ar: string;
      }[]
    | null;
}

interface PaymentVerificationRow {
  id: string;
  payment_request_id: string;
  verification_type: string;
  result: string;
  confidence_score: number | null;
  evidence: Record<string, unknown>;
  verifier_type: string;
  admin_user_id: string | null;
  created_at: string;
}

const REQUEST_COLUMNS =
  'id, profile_id, plan_id, billing_cycle, original_amount_piasters, discount_amount_piasters, amount_piasters, currency, coupon_id, payment_method, status, transaction_reference, sender_phone_or_handle, receipt_storage_path, receipt_filename, receipt_content_type, receipt_size_bytes, receipt_hash, risk_score, risk_flags, idempotency_key, temporary_access_granted_at, temporary_access_expires_at, review_notes, rejection_reason, reviewed_by, reviewed_at, paid_at, expires_at, created_at, updated_at, item_type, credit_pack_id, credits_to_grant';

const VERIFICATION_COLUMNS =
  'id, payment_request_id, verification_type, result, confidence_score, evidence, verifier_type, admin_user_id, created_at';

function toRequestDTO(row: PaymentRequestRow): PaymentRequestDTO {
  const plans = row.subscription_plans;
  const plan = Array.isArray(plans) ? plans[0] : plans;
  const isCreditPack = row.item_type === 'credit_pack';
  return {
    id: row.id,
    profileId: row.profile_id,
    planId: row.plan_id,
    planCode: isCreditPack ? (row.credit_pack_id ?? 'credit_pack') : (plan?.code ?? 'pro'),
    planNameEn: isCreditPack ? `Credit Pack (${row.credits_to_grant ?? 0} Credits)` : (plan?.name_en ?? 'Plan'),
    planNameAr: isCreditPack ? `باقة رصيد (${row.credits_to_grant ?? 0} رصيد)` : (plan?.name_ar ?? 'خطة'),
    itemType: (row.item_type as 'subscription' | 'credit_pack') ?? 'subscription',
    creditPackId: row.credit_pack_id ?? null,
    creditsToGrant: row.credits_to_grant ? Number(row.credits_to_grant) : null,
    billingCycle: (row.billing_cycle ?? 'monthly') as 'monthly' | 'annual',
    originalAmountPiasters: row.original_amount_piasters,
    discountAmountPiasters: row.discount_amount_piasters,
    amountPiasters: row.amount_piasters,
    currency: 'EGP',
    couponId: row.coupon_id,
    paymentMethod: row.payment_method as PaymentMethod,
    status: row.status as PaymentStatus,
    transactionReference: row.transaction_reference,
    senderPhoneOrHandle: row.sender_phone_or_handle,
    receiptStoragePath: row.receipt_storage_path,
    receiptFilename: row.receipt_filename,
    receiptContentType: row.receipt_content_type,
    receiptSizeBytes: row.receipt_size_bytes,
    receiptHash: row.receipt_hash,
    riskScore: Number(row.risk_score ?? 0),
    riskFlags: Array.isArray(row.risk_flags) ? row.risk_flags : [],
    idempotencyKey: row.idempotency_key,
    temporaryAccessGrantedAt: row.temporary_access_granted_at,
    temporaryAccessExpiresAt: row.temporary_access_expires_at,
    reviewNotes: row.review_notes,
    rejectionReason: row.rejection_reason,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    paidAt: row.paid_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toVerificationDTO(row: PaymentVerificationRow): PaymentVerificationDTO {
  return {
    id: row.id,
    paymentRequestId: row.payment_request_id,
    verificationType: row.verification_type as PaymentVerificationDTO['verificationType'],
    result: row.result as PaymentVerificationDTO['result'],
    confidenceScore: row.confidence_score ? Number(row.confidence_score) : null,
    evidence: row.evidence ?? {},
    verifierType: row.verifier_type as 'system' | 'admin',
    adminUserId: row.admin_user_id,
    createdAt: row.created_at,
  };
}

/**
 * Creates a new payment request intent with calculated pricing and 2-hour expiration window.
 */
export async function createPaymentRequest(params: {
  profileId: string;
  planId?: string | null;
  billingCycle: 'monthly' | 'annual';
  paymentMethod: PaymentMethod;
  originalAmountPiasters: number;
  discountAmountPiasters: number;
  couponId?: string | null;
  idempotencyKey: string;
  itemType?: 'subscription' | 'credit_pack';
  creditPackId?: string | null;
  creditsToGrant?: number | null;
}): Promise<PaymentRequestDTO> {
  const finalAmount = Math.max(0, params.originalAmountPiasters - params.discountAmountPiasters);
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2 hours to complete transfer

  const { data, error } = await getSupabaseServer()
    .from('payment_requests')
    .insert({
      profile_id: params.profileId,
      plan_id: params.planId ?? null,
      billing_cycle: params.billingCycle,
      original_amount_piasters: params.originalAmountPiasters,
      discount_amount_piasters: params.discountAmountPiasters,
      amount_piasters: finalAmount,
      currency: 'EGP',
      coupon_id: params.couponId ?? null,
      payment_method: params.paymentMethod,
      status: 'pending',
      idempotency_key: params.idempotencyKey,
      expires_at: expiresAt,
      item_type: params.itemType ?? 'subscription',
      credit_pack_id: params.creditPackId ?? null,
      credits_to_grant: params.creditsToGrant ?? null,
    })
    .select(`${REQUEST_COLUMNS}, subscription_plans(code, name_en, name_ar)`)
    .single();

  if (error) throw error;
  return toRequestDTO(data as unknown as PaymentRequestRow);
}

/**
 * Retrieves a payment request by ID, verifying profile ownership.
 */
export async function getPaymentRequestById(
  requestId: string,
  profileId?: string
): Promise<PaymentRequestDTO | null> {
  let query = getSupabaseServer()
    .from('payment_requests')
    .select(`${REQUEST_COLUMNS}, subscription_plans(code, name_en, name_ar)`)
    .eq('id', requestId);

  if (profileId) {
    query = query.eq('profile_id', profileId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ? toRequestDTO(data as unknown as PaymentRequestRow) : null;
}

/**
 * Lists payment requests for a profile, ordered by newest first.
 */
export async function listPaymentRequestsForUser(profileId: string): Promise<PaymentRequestDTO[]> {
  const { data, error } = await getSupabaseServer()
    .from('payment_requests')
    .select(`${REQUEST_COLUMNS}, subscription_plans(code, name_en, name_ar)`)
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as unknown as PaymentRequestRow[]).map(toRequestDTO);
}

/**
 * Returns an unexpired payment request currently granting temporary access to the candidate.
 */
export async function getActiveTemporaryAccessPayment(
  profileId: string
): Promise<PaymentRequestDTO | null> {
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseServer()
    .from('payment_requests')
    .select(`${REQUEST_COLUMNS}, subscription_plans(code, name_en, name_ar)`)
    .eq('profile_id', profileId)
    .eq('status', 'temporary_access')
    .gt('temporary_access_expires_at', now)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error fetching active temporary access payment:', error);
    return null;
  }
  return data ? toRequestDTO(data as unknown as PaymentRequestRow) : null;
}

/**
 * Submits evidence (reference and receipt) for a pending payment request.
 * Evaluates duplicate references and perceptual hash.
 */
export async function submitPaymentEvidence(params: {
  requestId: string;
  profileId: string;
  transactionReference: string;
  senderPhoneOrHandle: string;
  receiptStoragePath: string;
  receiptFilename: string;
  receiptContentType: string;
  receiptSizeBytes: number;
  receiptHash: string;
  riskScore: number;
  riskFlags: string[];
  grantTemporaryAccess: boolean;
}): Promise<PaymentRequestDTO> {
  const now = new Date();
  const tempExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(); // 24-hr timer

  const nextStatus: PaymentStatus = params.grantTemporaryAccess ? 'temporary_access' : 'under_review';

  const updatePayload: Record<string, unknown> = {
    transaction_reference: params.transactionReference.trim(),
    sender_phone_or_handle: params.senderPhoneOrHandle.trim(),
    receipt_storage_path: params.receiptStoragePath,
    receipt_filename: params.receiptFilename,
    receipt_content_type: params.receiptContentType,
    receipt_size_bytes: params.receiptSizeBytes,
    receipt_hash: params.receiptHash,
    risk_score: params.riskScore,
    risk_flags: params.riskFlags,
    status: nextStatus,
    updated_at: now.toISOString(),
  };

  if (params.grantTemporaryAccess) {
    updatePayload.temporary_access_granted_at = now.toISOString();
    updatePayload.temporary_access_expires_at = tempExpiresAt;
  }

  const { data, error } = await getSupabaseServer()
    .from('payment_requests')
    .update(updatePayload)
    .eq('id', params.requestId)
    .eq('profile_id', params.profileId)
    .select(`${REQUEST_COLUMNS}, subscription_plans(code, name_en, name_ar)`)
    .single();

  if (error) throw error;
  return toRequestDTO(data as unknown as PaymentRequestRow);
}

/**
 * Checks if a transaction reference has been previously used for this method.
 */
export async function isTransactionReferenceDuplicate(
  method: PaymentMethod,
  reference: string,
  excludeRequestId?: string
): Promise<boolean> {
  const cleanRef = reference.trim().toLowerCase();
  let query = getSupabaseServer()
    .from('payment_requests')
    .select('id')
    .eq('payment_method', method)
    .ilike('transaction_reference', cleanRef)
    .in('status', ['paid', 'under_review', 'temporary_access']);

  if (excludeRequestId) {
    query = query.neq('id', excludeRequestId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/**
 * Checks if a receipt file hash has been submitted previously.
 */
export async function isReceiptHashDuplicate(
  receiptHash: string,
  excludeRequestId?: string
): Promise<boolean> {
  let query = getSupabaseServer()
    .from('payment_requests')
    .select('id')
    .eq('receipt_hash', receiptHash)
    .in('status', ['paid', 'under_review', 'temporary_access']);

  if (excludeRequestId) {
    query = query.neq('id', excludeRequestId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/**
 * Records an automated or manual payment verification step.
 */
export async function recordVerification(params: {
  paymentRequestId: string;
  verificationType: PaymentVerificationDTO['verificationType'];
  result: PaymentVerificationDTO['result'];
  confidenceScore?: number | null;
  evidence: Record<string, unknown>;
  verifierType: 'system' | 'admin';
  adminUserId?: string | null;
}): Promise<PaymentVerificationDTO> {
  const { data, error } = await getSupabaseServer()
    .from('payment_verifications')
    .insert({
      payment_request_id: params.paymentRequestId,
      verification_type: params.verificationType,
      result: params.result,
      confidence_score: params.confidenceScore ?? null,
      evidence: params.evidence,
      verifier_type: params.verifierType,
      admin_user_id: params.adminUserId ?? null,
    })
    .select(VERIFICATION_COLUMNS)
    .single();

  if (error) throw error;
  return toVerificationDTO(data as PaymentVerificationRow);
}

/**
 * Lists verifications for a specific payment request.
 */
export async function listVerifications(paymentRequestId: string): Promise<PaymentVerificationDTO[]> {
  const { data, error } = await getSupabaseServer()
    .from('payment_verifications')
    .select(VERIFICATION_COLUMNS)
    .eq('payment_request_id', paymentRequestId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return ((data ?? []) as PaymentVerificationRow[]).map(toVerificationDTO);
}

/**
 * Returns dynamic payment instructions for Egyptian payment rails.
 */
export function getPaymentInstructions(
  method: PaymentMethod,
  amountPiasters: number
): PaymentInstructionsDTO {
  const egp = (amountPiasters / 100).toFixed(0);

  if (method === 'vodafone_cash') {
    const vfWallet = process.env.VODAFONE_CASH_WALLET?.trim() || '01012345678';
    const holder = process.env.VODAFONE_CASH_HOLDER?.trim() || 'CareerDev4AI Operations';
    return {
      method: 'vodafone_cash',
      recipientAccount: vfWallet,
      accountHolderName: holder,
      amountPiasters,
      amountFormatted: `${egp} EGP`,
      instructionsEn: [
        `Open the "Ana Vodafone" app or dial *9*7*${vfWallet}*${egp}#`,
        `Transfer the exact amount of ${egp} EGP to ${vfWallet}`,
        'Take a clear screenshot of the transfer confirmation message showing date, time, and reference number',
        'Enter your sender wallet phone number and the transaction reference below, and upload the screenshot receipt',
      ],
      instructionsAr: [
        `افتح تطبيق "أنا فودافون" أو اطلب الكود *9*7*${vfWallet}*${egp}#`,
        `قم بتحويل المبلغ المطلوب بالضبط (${egp} جنيه مصري) إلى المحفظة: ${vfWallet}`,
        'التقط لقطة شاشة واضحة لرسالة تأكيد التحويل تتضمن التاريخ والوقت ورقم المعاملة',
        'أدخل رقم محفظتك الراسلة ورقم العملية أدناه ثم أرفق صورة الإيصال',
      ],
    };
  }

  const instapayHandle = process.env.INSTAPAY_HANDLE?.trim() || 'careerdev4ai@instapay';
  const instapayHolder = process.env.INSTAPAY_HOLDER?.trim() || 'CareerDev4AI Commercial';

  return {
    method: 'instapay',
    recipientAccount: instapayHandle,
    accountHolderName: instapayHolder,
    amountPiasters,
    amountFormatted: `${egp} EGP`,
    instructionsEn: [
      'Open the InstaPay Egypt application',
      `Send to Instant Payment Address (IPA): ${instapayHandle}`,
      `Confirm recipient name: ${instapayHolder}`,
      `Transfer the exact amount of ${egp} EGP`,
      'Take a full screenshot of the completed transfer receipt displaying the Reference/Transaction ID',
      'Submit the reference ID and upload the receipt image below',
    ],
    instructionsAr: [
      'افتح تطبيق إنستاباي على هاتفك',
      `اختر تحويل إلى عنوان دفع لحظي (IPA): ${instapayHandle}`,
      `تأكد من اسم المستلم: ${instapayHolder}`,
      `قم بتحويل المبلغ بالضبط: ${egp} جنيه مصري`,
      'التقط صورة كاملة لإيصال التحويل الناجح توضح الرقم المرجعي للعملية',
      'أدخل الرقم المرجعي وأرفق صورة الإيصال أدناه',
    ],
  };
}
