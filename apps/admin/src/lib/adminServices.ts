/** Presentation helpers for the Phase 9 staff service screens. No writes, no money. */
import { formatReferenceId } from '@davao-bank/shared';
import { sentenceCase } from '@/lib/dashboardDisplay';

export const SERVICE_SIMULATION_LABEL = 'Simulation';
export const SERVICE_REQUEST_SIMULATION_NOTE =
  'Simulation — this request is stored in the demo only. Nothing is sent to a bank.';
export const APPOINTMENT_SIMULATION_NOTE =
  'Simulation — demo branches and slots. No real appointment is booked.';

export type ServiceRequestStatus =
  'submitted' | 'in_review' | 'completed' | 'rejected' | 'cancelled';
export type ServiceRequestType =
  'statement' | 'certificate' | 'card_replacement' | 'account_update' | 'remit_status';
export type AppointmentStatus = 'booked' | 'cancelled' | 'completed';
export type StatusVariant = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

export interface ServiceRequestRow {
  id: string;
  user_id: string;
  type: ServiceRequestType;
  details: Record<string, unknown>;
  status: ServiceRequestStatus;
  staff_note: string | null;
  reference: string;
  created_at: string;
  updated_at: string;
}

export interface AppointmentRow {
  id: string;
  user_id: string;
  user_name: string;
  slot_id: string;
  branch_name: string;
  branch_area: string;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  staff_note: string | null;
  created_at: string;
}

export const SERVICE_REQUEST_STATUSES: readonly ServiceRequestStatus[] = [
  'submitted',
  'in_review',
  'completed',
  'rejected',
  'cancelled',
];

export const SERVICE_REQUEST_TYPES: readonly ServiceRequestType[] = [
  'statement',
  'certificate',
  'card_replacement',
  'account_update',
  'remit_status',
];

export const SERVICE_REQUEST_UPDATE_STATUSES: readonly ServiceRequestStatus[] = [
  'in_review',
  'completed',
  'rejected',
  'cancelled',
];

export const APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  'booked',
  'cancelled',
  'completed',
];

export function isServiceRequestStatus(value: unknown): value is ServiceRequestStatus {
  return (
    typeof value === 'string' &&
    SERVICE_REQUEST_STATUSES.includes(value as ServiceRequestStatus)
  );
}

export function isServiceRequestType(value: unknown): value is ServiceRequestType {
  return (
    typeof value === 'string' &&
    SERVICE_REQUEST_TYPES.includes(value as ServiceRequestType)
  );
}

export function isAppointmentStatus(value: unknown): value is AppointmentStatus {
  return (
    typeof value === 'string' && APPOINTMENT_STATUSES.includes(value as AppointmentStatus)
  );
}

const REQUEST_TYPE_LABELS: Record<ServiceRequestType, string> = {
  statement: 'Statement copy',
  certificate: 'Bank certificate',
  card_replacement: 'Card replacement',
  account_update: 'Account details update',
  remit_status: 'Remittance status',
};

export function serviceRequestTypeLabel(type: string): string {
  return isServiceRequestType(type) ? REQUEST_TYPE_LABELS[type] : sentenceCase(type);
}

export function serviceRequestStatusVariant(status: string): StatusVariant {
  switch (status) {
    case 'completed':
      return 'success';
    case 'submitted':
    case 'in_review':
      return 'warning';
    case 'rejected':
    case 'cancelled':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function appointmentStatusVariant(status: string): StatusVariant {
  switch (status) {
    case 'completed':
      return 'success';
    case 'booked':
      return 'info';
    case 'cancelled':
      return 'danger';
    default:
      return 'neutral';
  }
}

/** Client-facing reference only. A raw UUID is never rendered in the console. */
export function displayReference(value: string | null | undefined): string {
  return value ? formatReferenceId(value) : 'Reference unavailable';
}

/** Show only the last four characters of an opaque customer identifier. */
export function maskCustomerId(value: string | null | undefined): string {
  if (!value) return 'Customer •• ••••';
  return `Customer •• ${formatReferenceId(value).slice(-4)}`;
}

/** Show only the last four digits of an opaque account identifier. */
export function maskAccountId(value: string | null | undefined): string {
  if (!value) return 'Account •• ••••';
  return `Account •• ${formatReferenceId(value).slice(-4)}`;
}

/** Staff never sees a customer's full name in these simulated-service views. */
export function maskCustomerName(value: string | null | undefined): string {
  const parts = (value || 'Customer').trim().split(/\s+/).filter(Boolean);
  return parts.map((part) => `${part.charAt(0)}***`).join(' ');
}

export interface DetailLine {
  label: string;
  value: string;
}

function detailText(details: Record<string, unknown>, key: string): string | null {
  const value = details?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function safeDate(value: string | null): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : 'Date unavailable';
}

/**
 * Whitelists request detail keys. Free text and new contact values are reported
 * only as "provided" so no customer PII is echoed into the staff console.
 */
export function describeRequestDetails(
  type: string,
  details: Record<string, unknown> | null | undefined
): DetailLine[] {
  const safeDetails: Record<string, unknown> = details || {};
  switch (type) {
    case 'statement':
      return [
        { label: 'Account', value: maskAccountId(detailText(safeDetails, 'account_id')) },
        { label: 'From', value: safeDate(detailText(safeDetails, 'start_date')) },
        { label: 'To', value: safeDate(detailText(safeDetails, 'end_date')) },
      ];
    case 'certificate':
      return [
        {
          label: 'Purpose',
          value: detailText(safeDetails, 'purpose') ? 'Provided' : 'Not provided',
        },
      ];
    case 'card_replacement': {
      const last4 = detailText(safeDetails, 'last4');
      return [
        {
          label: 'Reason',
          value: detailText(safeDetails, 'reason') ? 'Provided' : 'Not provided',
        },
        {
          label: 'Card',
          value: last4 && /^\d{4}$/.test(last4) ? `Card •• ${last4}` : 'Card •• ••••',
        },
      ];
    }
    case 'account_update': {
      const field = detailText(safeDetails, 'field');
      const fieldLabel =
        field === 'email'
          ? 'Email'
          : field === 'phone_number'
            ? 'Phone number'
            : 'Contact detail';
      return [
        { label: 'Field', value: fieldLabel },
        {
          label: 'New value',
          value: detailText(safeDetails, 'new_value') ? 'Provided' : 'Not provided',
        },
      ];
    }
    case 'remit_status':
      return [
        {
          label: 'Reference',
          value: detailText(safeDetails, 'reference') ? 'Provided' : 'Not provided',
        },
      ];
    default:
      return [];
  }
}

const DATE_PT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Manila calendar day, used for the appointment date filter. */
export function manilaDateKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = DATE_PT.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value || '';
  const month = parts.find((part) => part.type === 'month')?.value || '';
  const day = parts.find((part) => part.type === 'day')?.value || '';
  return `${year}-${month}-${day}`;
}

export function formatAppointmentTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
