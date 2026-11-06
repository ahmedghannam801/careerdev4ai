/**
 * Shared Payment Domain Models and Types
 * Authoritative types for Vodafone Cash and InstaPay offline payment processing.
 */

export const PAYMENT_METHODS = ['vodafone_cash', 'instapay'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = [
  'pending',
  'under_review',
  'temporary_access',
  'paid',
  'rejected',
  'expired',
  'refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, { en: string; ar: string }> = {
  vodafone_cash: { en: 'Vodafone Cash', ar: 'فودافون كاش' },
  instapay: { en: 'InstaPay', ar: 'إنستاباي' },
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, { en: string; ar: string }> = {
  pending: { en: 'Pending Submission', ar: 'في انتظار الإرسال' },
  under_review: { en: 'Under Review', ar: 'قيد المراجعة' },
  temporary_access: { en: 'Provisional Access (24h)', ar: 'وصول مؤقت (٢٤ ساعة)' },
  paid: { en: 'Confirmed & Paid', ar: 'تم التأكيد والدفع' },
  rejected: { en: 'Rejected', ar: 'مرفوض' },
  expired: { en: 'Expired', ar: 'منتهي الصلاحية' },
  refunded: { en: 'Refunded', ar: 'تم استرداد المبلغ' },
};

export interface PaymentRequestDTO {
  id: string;
  profileId: string;
  itemType?: 'subscription' | 'credit_pack';
  creditPackId?: string | null;
  creditsToGrant?: number | null;
  planId: string | null;
  planCode: string;
  planNameEn: string;
  planNameAr: string;
  billingCycle: 'monthly' | 'annual';
  originalAmountPiasters: number;
  discountAmountPiasters: number;
  amountPiasters: number;
  currency: 'EGP';
  couponId: string | null;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  transactionReference: string | null;
  senderPhoneOrHandle: string | null;
  receiptStoragePath: string | null;
  receiptFilename: string | null;
  receiptContentType: string | null;
  receiptSizeBytes: number | null;
  receiptHash: string | null;
  riskScore: number;
  riskFlags: string[];
  idempotencyKey: string;
  temporaryAccessGrantedAt: string | null;
  temporaryAccessExpiresAt: string | null;
  reviewNotes: string | null;
  rejectionReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  paidAt: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentVerificationDTO {
  id: string;
  paymentRequestId: string;
  verificationType: 'ocr' | 'duplicate_check' | 'amount_check' | 'admin_manual' | 'admin_confirm';
  result: 'pass' | 'fail' | 'inconclusive';
  confidenceScore: number | null;
  evidence: Record<string, unknown>;
  verifierType: 'system' | 'admin';
  adminUserId: string | null;
  createdAt: string;
}

export interface CreatePaymentRequestInput {
  planCode: string;
  billingCycle: 'monthly' | 'annual';
  paymentMethod: PaymentMethod;
  couponCode?: string;
}

export interface SubmitPaymentEvidenceInput {
  paymentRequestId: string;
  transactionReference: string;
  senderPhoneOrHandle: string;
}

export interface PaymentInstructionsDTO {
  method: PaymentMethod;
  recipientAccount: string;
  accountHolderName: string;
  amountPiasters: number;
  amountFormatted: string;
  instructionsEn: string[];
  instructionsAr: string[];
}

