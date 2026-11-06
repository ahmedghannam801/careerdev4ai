/**
 * Payment API Client
 * Coordinates client-side payment requests, receipt evidence uploads,
 * and user payment history for Vodafone Cash and InstaPay.
 */

import { apiRequest } from './apiClient';
import type {
  PaymentInstructionsDTO,
  PaymentMethod,
  PaymentRequestDTO,
  PaymentVerificationDTO,
} from '../../shared/payments';

export interface CheckoutResponse {
  success: boolean;
  paymentRequest: PaymentRequestDTO;
  instructions: PaymentInstructionsDTO;
}

export interface SubmitEvidenceResponse {
  success: boolean;
  paymentRequest: PaymentRequestDTO;
  provisionalAccessGranted: boolean;
}

export interface PaymentDetailsResponse {
  success: boolean;
  request: PaymentRequestDTO;
  verifications: PaymentVerificationDTO[];
}

export async function createPaymentCheckout(params: {
  planCode: string;
  billingCycle: 'monthly' | 'annual';
  paymentMethod: PaymentMethod;
  couponCode?: string;
  applyBirthdayReward?: boolean;
}): Promise<CheckoutResponse> {
  return apiRequest<CheckoutResponse>('/api/payments/checkout', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function submitPaymentEvidenceForm(formData: FormData): Promise<SubmitEvidenceResponse> {
  return apiRequest<SubmitEvidenceResponse>('/api/payments/evidence', {
    method: 'POST',
    body: formData,
  });
}

export async function fetchMyPaymentRequests(): Promise<PaymentRequestDTO[]> {
  const res = await apiRequest<{ success: boolean; requests: PaymentRequestDTO[] }>(
    '/api/payments/my-requests'
  );
  return res.requests;
}

export async function fetchPaymentRequestDetails(id: string): Promise<PaymentDetailsResponse> {
  return apiRequest<PaymentDetailsResponse>(`/api/payments/requests/${encodeURIComponent(id)}`);
}

