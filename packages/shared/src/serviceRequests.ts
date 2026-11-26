import type { SupabaseClient } from '@supabase/supabase-js';
import { toUserMessage } from './utils/errors';
import { formatReferenceId } from './utils/transactions';

export type ServiceRequestType =
  'statement' | 'certificate' | 'card_replacement' | 'account_update' | 'remit_status';

export type ServiceRequestStatus =
  'submitted' | 'in_review' | 'completed' | 'rejected' | 'cancelled';

export type AccountUpdateField = 'email' | 'phone_number';

export interface StatementRequestDetails {
  account_id: string;
  start_date: string;
  end_date: string;
}

export interface CertificateRequestDetails {
  purpose: string;
}

export interface CardReplacementRequestDetails {
  reason: string;
  last4?: string;
}

export interface AccountUpdateRequestDetails {
  field: AccountUpdateField;
  new_value: string;
}

export interface RemitStatusRequestDetails {
  reference: string;
}

export type ServiceRequestDetails =
  | StatementRequestDetails
  | CertificateRequestDetails
  | CardReplacementRequestDetails
  | AccountUpdateRequestDetails
  | RemitStatusRequestDetails;

export interface ServiceRequest {
  id: string;
  type: ServiceRequestType;
  details: Record<string, unknown>;
  status: ServiceRequestStatus;
  staff_note: string | null;
  reference: string;
  created_at: string;
  updated_at: string;
}

export interface CreateServiceRequestResult {
  id: string;
  type: ServiceRequestType;
  status: ServiceRequestStatus;
  reference: string;
  created_at: string;
}

export interface CancelServiceRequestResult {
  success: boolean;
  id: string;
  status: 'cancelled';
}

export const SERVICE_REQUEST_TYPES: readonly ServiceRequestType[] = [
  'statement',
  'certificate',
  'card_replacement',
  'account_update',
  'remit_status',
];

export function serviceRequestTypeLabel(type: ServiceRequestType | string): string {
  switch (type) {
    case 'statement':
      return 'Statement copy';
    case 'certificate':
      return 'Bank certificate';
    case 'card_replacement':
      return 'Card replacement';
    case 'account_update':
      return 'Account details update';
    case 'remit_status':
      return 'Remittance status inquiry';
    default:
      if (!type) return 'Service request';
      return type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ');
  }
}

export function serviceRequestTypeDescription(type: ServiceRequestType): string {
  switch (type) {
    case 'statement':
      return 'Request a copy of your account statement for a date range.';
    case 'certificate':
      return 'Request a bank certificate for visa, school or employment.';
    case 'card_replacement':
      return 'Report a lost, damaged or expired card.';
    case 'account_update':
      return 'Request an email address or mobile number update.';
    case 'remit_status':
      return 'Track an inward remittance reference (DB-XXXX-XXXX).';
  }
}

export function serviceRequestStatusLabel(status: ServiceRequestStatus | string): string {
  switch (status) {
    case 'submitted':
      return 'Submitted';
    case 'in_review':
      return 'In review';
    case 'completed':
      return 'Ready';
    case 'rejected':
      return 'Declined';
    case 'cancelled':
      return 'Cancelled';
    default:
      if (!status) return 'Submitted';
      return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');
  }
}

export interface RemitTimelineStep {
  label: string;
  state: 'done' | 'current' | 'upcoming' | 'stopped';
}

/**
 * Staged timeline for remittance status inquiries (spec §4.9):
 * Received → Processing → Ready for credit (or Cancelled / Declined).
 */
export function getRemitTimelineSteps(status: ServiceRequestStatus): RemitTimelineStep[] {
  if (status === 'cancelled') {
    return [
      { label: 'Received', state: 'done' },
      { label: 'Cancelled', state: 'stopped' },
    ];
  }
  if (status === 'rejected') {
    return [
      { label: 'Received', state: 'done' },
      { label: 'Processing', state: 'done' },
      { label: 'Declined', state: 'stopped' },
    ];
  }
  if (status === 'completed') {
    return [
      { label: 'Received', state: 'done' },
      { label: 'Processing', state: 'done' },
      { label: 'Ready for credit', state: 'done' },
    ];
  }
  if (status === 'in_review') {
    return [
      { label: 'Received', state: 'done' },
      { label: 'Processing', state: 'current' },
      { label: 'Ready for credit', state: 'upcoming' },
    ];
  }
  return [
    { label: 'Received', state: 'current' },
    { label: 'Processing', state: 'upcoming' },
    { label: 'Ready for credit', state: 'upcoming' },
  ];
}

/**
 * Formats a service request's server reference or fallback UUID via `formatReferenceId`
 * without duplicating the leading `DB-` prefix.
 */
export function formatServiceRequestReference(
  reference: string | null | undefined,
  fallbackId?: string
): string {
  const trimmed = (reference ?? '').trim();
  if (trimmed) {
    const withoutPrefix = trimmed.replace(/^DB-/i, '');
    const formatted = formatReferenceId(withoutPrefix);
    if (formatted) return formatted;
  }
  return formatReferenceId(fallbackId ?? '');
}

/**
 * Normalizes user-entered remittance reference text toward `DB-XXXX-XXXX`.
 */
export function normalizeRemitReference(raw: string): string {
  const upper = raw.trim().toUpperCase();
  if (!upper) return '';
  if (/^DB-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(upper)) {
    return upper;
  }
  const withoutPrefix = upper.startsWith('DB-')
    ? upper.slice(3)
    : upper.startsWith('DB') && upper.replace(/[^0-9A-Z]/g, '').length === 10
      ? upper.replace(/[^0-9A-Z]/g, '').slice(2)
      : upper;
  const alnum = withoutPrefix.replace(/[^0-9A-Z]/g, '');
  if (alnum.length === 8) {
    return `DB-${alnum.slice(0, 4)}-${alnum.slice(4, 8)}`;
  }
  return upper;
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_RE = /^\+?[0-9\s-]{7,20}$/;
const REMIT_REF_RE = /^DB-[0-9A-Z]{4}-[0-9A-Z]{4}$/;
const LAST4_RE = /^[0-9]{4}$/;
const FULL_CARD_NUMBER_RE = /\b(?:\d[ -]*?){12,19}\b/;

function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

export interface ServiceRequestDraft {
  type: ServiceRequestType;
  accountId: string;
  startDate: string;
  endDate: string;
  purpose: string;
  reason: string;
  last4: string;
  updateField: AccountUpdateField;
  newValue: string;
  remitReference: string;
}

export type ServiceRequestFieldErrors = Partial<
  Record<
    | 'accountId'
    | 'startDate'
    | 'endDate'
    | 'purpose'
    | 'reason'
    | 'last4'
    | 'newValue'
    | 'remitReference',
    string
  >
>;

export type ValidateServiceRequestOutcome =
  | { valid: true; details: ServiceRequestDetails }
  | { valid: false; errors: ServiceRequestFieldErrors };

/**
 * Validates draft inputs client-side against the exact whitelisted schema in
 * `20261129000000_phase9_service_requests.sql` and blocks full card numbers in free text.
 */
export function validateServiceRequestDraft(
  draft: ServiceRequestDraft
): ValidateServiceRequestOutcome {
  const errors: ServiceRequestFieldErrors = {};

  switch (draft.type) {
    case 'statement': {
      const accountId = draft.accountId.trim();
      const startDate = draft.startDate.trim();
      const endDate = draft.endDate.trim();
      if (!accountId) {
        errors.accountId = 'Choose an account.';
      }
      if (!startDate || !isValidIsoDate(startDate)) {
        errors.startDate = 'Enter a valid start date (YYYY-MM-DD).';
      }
      if (!endDate || !isValidIsoDate(endDate)) {
        errors.endDate = 'Enter a valid end date (YYYY-MM-DD).';
      }
      if (!errors.startDate && !errors.endDate && startDate > endDate) {
        errors.endDate = 'End date must be on or after the start date.';
      }
      if (Object.keys(errors).length > 0) return { valid: false, errors };
      return {
        valid: true,
        details: {
          account_id: accountId,
          start_date: startDate,
          end_date: endDate,
        },
      };
    }

    case 'certificate': {
      const purpose = draft.purpose.trim();
      if (!purpose) {
        errors.purpose = 'Enter the purpose for this certificate.';
      } else if (purpose.length > 120) {
        errors.purpose = 'Keep the purpose under 120 characters.';
      } else if (FULL_CARD_NUMBER_RE.test(purpose)) {
        errors.purpose = 'Do not enter a full card or account number.';
      }
      if (Object.keys(errors).length > 0) return { valid: false, errors };
      return {
        valid: true,
        details: { purpose },
      };
    }

    case 'card_replacement': {
      const reason = draft.reason.trim();
      const last4 = draft.last4.trim();
      if (!reason) {
        errors.reason = 'Choose or enter a reason for card replacement.';
      } else if (reason.length > 120) {
        errors.reason = 'Keep the reason under 120 characters.';
      } else if (FULL_CARD_NUMBER_RE.test(reason)) {
        errors.reason = 'Do not enter a full card number.';
      }
      if (last4 && !LAST4_RE.test(last4)) {
        errors.last4 = 'Enter exactly 4 digits, or leave this blank.';
      }
      if (Object.keys(errors).length > 0) return { valid: false, errors };
      const details: CardReplacementRequestDetails = last4
        ? { reason, last4 }
        : { reason };
      return { valid: true, details };
    }

    case 'account_update': {
      const field = draft.updateField;
      const newValue = draft.newValue.trim();
      if (!newValue) {
        errors.newValue =
          field === 'email' ? 'Enter an email address.' : 'Enter a mobile number.';
      } else if (field === 'email' && !EMAIL_RE.test(newValue)) {
        errors.newValue = 'Enter a valid email address.';
      } else if (field === 'phone_number' && !PHONE_RE.test(newValue)) {
        errors.newValue = 'Enter a valid mobile number (7 to 20 digits).';
      }
      if (Object.keys(errors).length > 0) return { valid: false, errors };
      return {
        valid: true,
        details: {
          field,
          new_value: newValue,
        },
      };
    }

    case 'remit_status': {
      const normalized = normalizeRemitReference(draft.remitReference);
      if (!normalized) {
        errors.remitReference = 'Enter a remittance reference.';
      } else if (!REMIT_REF_RE.test(normalized)) {
        errors.remitReference =
          'Use the format DB-XXXX-XXXX (for example, DB-1A2B-3C4D).';
      }
      if (Object.keys(errors).length > 0) return { valid: false, errors };
      return {
        valid: true,
        details: { reference: normalized },
      };
    }
  }
}

/**
 * Maps service-request RPC errors to safe, sentence-case user messages via `toUserMessage`.
 */
export function toServiceRequestErrorMessage(
  error: unknown,
  mode: 'load' | 'action' = 'action'
): string {
  const raw =
    typeof error === 'string'
      ? error
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: unknown }).message ?? '')
        : String(error ?? '');
  const lower = raw.toLowerCase();

  if (lower.includes('daily service request limit reached')) {
    return 'Daily request limit reached. You can submit up to 10 requests per day.';
  }
  if (lower.includes('only submitted requests can be cancelled')) {
    return 'Only submitted requests can be cancelled.';
  }
  if (lower.includes('service request not found')) {
    return 'This service request could not be found.';
  }
  if (lower.includes('suspended or inactive')) {
    return 'Your profile cannot submit service requests right now.';
  }

  return toUserMessage(error, mode === 'load' ? 'load' : 'account');
}

/**
 * Lists the authenticated customer's own service requests via `get_my_service_requests`.
 */
export async function fetchMyServiceRequests(
  client: SupabaseClient
): Promise<{ data: ServiceRequest[] | null; error: string | null }> {
  try {
    const { data, error } = await client.rpc('get_my_service_requests');
    if (error) {
      return { data: null, error: error.message };
    }
    return { data: (data as ServiceRequest[] | null) ?? [], error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: null, error: message };
  }
}

/**
 * Submits a new customer service request via `create_service_request`.
 */
export async function createServiceRequest(
  client: SupabaseClient,
  params: { type: ServiceRequestType; details: ServiceRequestDetails }
): Promise<{ data: CreateServiceRequestResult | null; error: string | null }> {
  try {
    const { data, error } = await client.rpc('create_service_request', {
      p_type: params.type,
      p_details: params.details,
    });
    if (error) {
      return { data: null, error: error.message };
    }
    return { data: data as CreateServiceRequestResult, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: null, error: message };
  }
}

/**
 * Cancels a submitted customer service request via `cancel_service_request`.
 */
export async function cancelServiceRequest(
  client: SupabaseClient,
  id: string
): Promise<{ data: CancelServiceRequestResult | null; error: string | null }> {
  try {
    const { data, error } = await client.rpc('cancel_service_request', {
      p_id: id,
    });
    if (error) {
      return { data: null, error: error.message };
    }
    return { data: data as CancelServiceRequestResult, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: null, error: message };
  }
}
