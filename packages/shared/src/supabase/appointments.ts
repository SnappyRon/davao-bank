import type { SupabaseClient } from '@supabase/supabase-js';
import { toUserMessage } from '../utils/errors';

export type AppointmentStatus = 'booked' | 'cancelled' | 'completed';

export type AppointmentPurpose =
  'account_inquiry' | 'document_pickup' | 'card_assistance' | 'general_banking';

export interface AppointmentPurposeOption {
  code: AppointmentPurpose;
  label: string;
  description: string;
}

export const APPOINTMENT_PURPOSES: ReadonlyArray<AppointmentPurposeOption> = [
  {
    code: 'account_inquiry',
    label: 'Account inquiry',
    description: 'Questions about your savings or checking account',
  },
  {
    code: 'document_pickup',
    label: 'Document pickup',
    description: 'Collect requested statements or certificates',
  },
  {
    code: 'card_assistance',
    label: 'Card assistance',
    description: 'Card replacement or in-branch verification',
  },
  {
    code: 'general_banking',
    label: 'General banking',
    description: 'Speak with a branch representative',
  },
];

export const APPOINTMENTS_SIMULATION_COPY =
  'Simulation — demo branches and slots. No real appointment is booked.';

export interface Branch {
  id: string;
  name: string;
  area: string;
  address: string | null;
  is_active: boolean;
}

export interface OpenAppointmentSlot {
  id: string;
  branch_id: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  available: number;
}

export interface BookAppointmentParams {
  branchId: string;
  slotId: string;
  idempotencyKey: string;
}

export interface BookAppointmentResult {
  id: string;
  status: AppointmentStatus;
  slot_id: string;
  branch_id?: string;
  idempotency_key?: string;
  idempotent_replay: boolean;
}

export interface MyAppointment {
  id: string;
  slot_id: string;
  starts_at: string;
  ends_at: string;
  branch_name: string;
  branch_area: string;
  status: AppointmentStatus;
  staff_note: string | null;
  created_at: string;
}

export interface CancelAppointmentResult {
  success: boolean;
  id: string;
  status: 'cancelled';
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function extractErrorText(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  const obj = error as {
    message?: unknown;
    error_description?: unknown;
    details?: unknown;
  };
  return String(obj.message || obj.error_description || obj.details || '');
}

/**
 * Formats a Date as 'YYYY-MM-DD' in Asia/Manila time.
 */
export function formatManilaDateISO(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

/**
 * Validates that a 'YYYY-MM-DD' string is a real calendar date and not before today in Asia/Manila.
 */
export function validateAppointmentDate(
  isoDate: string,
  now: Date = new Date()
): { valid: boolean; error: string | null } {
  const trimmed = (isoDate || '').trim();
  if (!ISO_DATE_RE.test(trimmed)) {
    return { valid: false, error: 'Enter a valid date in YYYY-MM-DD format.' };
  }
  const [y, m, d] = trimmed.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  if (
    Number.isNaN(utc.getTime()) ||
    utc.getUTCFullYear() !== y ||
    utc.getUTCMonth() !== m - 1 ||
    utc.getUTCDate() !== d
  ) {
    return { valid: false, error: 'Enter a valid calendar date.' };
  }
  const todayManila = formatManilaDateISO(now);
  if (trimmed < todayManila) {
    return { valid: false, error: 'Choose today or a future banking date.' };
  }
  return { valid: true, error: null };
}

/**
 * Returns upcoming consecutive Asia/Manila dates starting from today.
 */
export function getUpcomingManilaDates(
  count: number = 3,
  now: Date = new Date()
): Array<{ isoDate: string; label: string }> {
  const todayIso = formatManilaDateISO(now);
  const [y, m, d] = todayIso.split('-').map(Number);
  const baseUtcMs = Date.UTC(y, m - 1, d, 12, 0, 0);
  const items: Array<{ isoDate: string; label: string }> = [];

  for (let i = 0; i < count; i++) {
    const target = new Date(baseUtcMs + i * 86_400_000);
    const isoDate = formatManilaDateISO(target);
    const shortDate = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      month: 'short',
      day: 'numeric',
    }).format(target);
    const prefix = i === 0 ? 'Today · ' : i === 1 ? 'Tomorrow · ' : '';
    items.push({
      isoDate,
      label: `${prefix}${shortDate}`,
    });
  }

  return items;
}

/**
 * Formats either a plain 'YYYY-MM-DD' date or an ISO timestamp in Asia/Manila (e.g. 'Nov 26, 2026').
 */
export function formatManilaAppointmentDate(isoOrTimestamp: string): string {
  const trimmed = (isoOrTimestamp || '').trim();
  if (!trimmed) return '—';
  if (ISO_DATE_RE.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map(Number);
    const utcNoon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    if (Number.isNaN(utcNoon.getTime())) return trimmed;
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(utcNoon);
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

/**
 * Formats an appointment slot window in Asia/Manila time (e.g. '9:00 AM – 9:30 AM').
 */
export function formatManilaSlotWindow(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return '—';
  }
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

/**
 * Returns true when an appointment is booked and its start time is strictly in the future.
 */
export function isFutureAppointment(
  appointment: Pick<MyAppointment, 'status' | 'starts_at'>,
  nowMs: number = Date.now()
): boolean {
  if (appointment.status !== 'booked') return false;
  const startsMs = Date.parse(appointment.starts_at);
  if (Number.isNaN(startsMs)) return false;
  return startsMs > nowMs;
}

/**
 * Detects whether a booking error means the chosen slot was just taken or is no longer open.
 */
export function isSlotTakenError(error: unknown): boolean {
  const lower = extractErrorText(error).toLowerCase();
  if (!lower) return false;
  return (
    lower.includes('slot is fully booked') ||
    lower.includes('slot just taken') ||
    lower.includes('slot_taken') ||
    lower.includes('slot is in the past') ||
    lower.includes('slot is not active') ||
    lower.includes('appointment slot not found') ||
    lower.includes('slot no longer available')
  );
}

/**
 * Maps appointment RPC errors to safe, sentence-case user copy without money-transfer wording.
 */
export function appointmentErrorMessage(
  error: unknown,
  context: 'load' | 'action' = 'action'
): string {
  const lower = extractErrorText(error).toLowerCase();

  if (
    lower.includes('slot is fully booked') ||
    lower.includes('slot just taken') ||
    lower.includes('slot_taken')
  ) {
    return 'That time slot was just taken. Choose another open slot.';
  }
  if (lower.includes('slot is in the past')) {
    return 'That time slot has already passed. Choose a later open slot.';
  }
  if (
    lower.includes('slot is not active') ||
    lower.includes('appointment slot not found') ||
    lower.includes('slot no longer available')
  ) {
    return 'That time slot is no longer available. Choose another open slot.';
  }
  if (
    lower.includes('already have a booking for this slot') ||
    lower.includes('appointments_one_booked_per_user_per_slot')
  ) {
    return 'You already have a booking for this time slot.';
  }
  if (lower.includes('maximum number of upcoming appointments')) {
    return 'You already have 5 upcoming appointments. Cancel one before booking another.';
  }
  if (lower.includes('branch not found') || lower.includes('branch is not active')) {
    return 'This branch is currently unavailable. Choose another branch.';
  }
  if (lower.includes('only booked appointments can be cancelled')) {
    return 'Only booked appointments can be cancelled.';
  }
  if (lower.includes('cannot cancel a past or ongoing appointment')) {
    return 'Past or ongoing appointments cannot be cancelled.';
  }
  if (lower.includes('appointment not found')) {
    return 'This appointment could not be found.';
  }

  return toUserMessage(error, context === 'load' ? 'load' : 'account');
}

/**
 * Fetches active demo Davao Bank branches via list_branches RPC.
 */
export async function fetchBranches(
  client: SupabaseClient
): Promise<{ data: Branch[] | null; error: string | null }> {
  try {
    const { data, error } = await client.rpc('list_branches');
    if (error) {
      return { data: null, error: error.message };
    }
    const rows = Array.isArray(data) ? (data as Branch[]) : [];
    return { data: rows, error: null };
  } catch (err: unknown) {
    return { data: null, error: extractErrorText(err) || 'Failed to load branches' };
  }
}

/**
 * Fetches open future appointment slots for a branch on a given Asia/Manila date ('YYYY-MM-DD').
 */
export async function fetchOpenAppointmentSlots(
  client: SupabaseClient,
  branchId: string,
  date: string
): Promise<{ data: OpenAppointmentSlot[] | null; error: string | null }> {
  const cleanBranchId = (branchId || '').trim();
  const cleanDate = (date || '').trim();
  if (!cleanBranchId) {
    return { data: null, error: 'Branch is required' };
  }
  if (!ISO_DATE_RE.test(cleanDate)) {
    return { data: null, error: 'Valid date is required' };
  }

  try {
    const { data, error } = await client.rpc('list_open_slots', {
      p_branch_id: cleanBranchId,
      p_date: cleanDate,
    });
    if (error) {
      return { data: null, error: error.message };
    }
    const rows = Array.isArray(data)
      ? (data as Array<Record<string, unknown>>).map((row) => ({
          id: String(row.id ?? ''),
          branch_id: String(row.branch_id ?? cleanBranchId),
          starts_at: String(row.starts_at ?? ''),
          ends_at: String(row.ends_at ?? ''),
          capacity: Number(row.capacity ?? 0),
          available: Number(row.available ?? 0),
        }))
      : [];
    return { data: rows, error: null };
  } catch (err: unknown) {
    return { data: null, error: extractErrorText(err) || 'Failed to load open slots' };
  }
}

/**
 * Books an appointment slot idempotently via book_appointment RPC.
 */
export async function bookBranchAppointment(
  client: SupabaseClient,
  params: BookAppointmentParams
): Promise<{ data: BookAppointmentResult | null; error: string | null }> {
  const branchId = (params.branchId || '').trim();
  const slotId = (params.slotId || '').trim();
  const idempotencyKey = (params.idempotencyKey || '').trim();

  if (!branchId) {
    return { data: null, error: 'Branch is required' };
  }
  if (!slotId) {
    return { data: null, error: 'Appointment slot is required' };
  }
  if (!idempotencyKey) {
    return { data: null, error: 'Idempotency key is required' };
  }

  try {
    const { data, error } = await client.rpc('book_appointment', {
      p_branch_id: branchId,
      p_slot_id: slotId,
      p_idempotency_key: idempotencyKey,
    });
    if (error) {
      return { data: null, error: error.message };
    }
    const raw = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!raw || typeof raw !== 'object' || !raw.id) {
      return { data: null, error: 'Invalid booking response' };
    }
    return {
      data: {
        id: String(raw.id),
        status: (raw.status as AppointmentStatus) || 'booked',
        slot_id: String(raw.slot_id ?? slotId),
        branch_id: raw.branch_id ? String(raw.branch_id) : branchId,
        idempotency_key: raw.idempotency_key
          ? String(raw.idempotency_key)
          : idempotencyKey,
        idempotent_replay: Boolean(raw.idempotent_replay),
      },
      error: null,
    };
  } catch (err: unknown) {
    return { data: null, error: extractErrorText(err) || 'Failed to book appointment' };
  }
}

/**
 * Fetches the signed-in customer's branch appointments via get_my_appointments RPC.
 */
export async function fetchMyAppointments(
  client: SupabaseClient
): Promise<{ data: MyAppointment[] | null; error: string | null }> {
  try {
    const { data, error } = await client.rpc('get_my_appointments');
    if (error) {
      return { data: null, error: error.message };
    }
    const rows = Array.isArray(data) ? (data as MyAppointment[]) : [];
    return { data: rows, error: null };
  } catch (err: unknown) {
    return { data: null, error: extractErrorText(err) || 'Failed to load appointments' };
  }
}

/**
 * Cancels one of the signed-in customer's future booked appointments via cancel_appointment RPC.
 */
export async function cancelBranchAppointment(
  client: SupabaseClient,
  appointmentId: string
): Promise<{ data: CancelAppointmentResult | null; error: string | null }> {
  const cleanId = (appointmentId || '').trim();
  if (!cleanId) {
    return { data: null, error: 'Appointment ID is required' };
  }

  try {
    const { data, error } = await client.rpc('cancel_appointment', {
      p_id: cleanId,
    });
    if (error) {
      return { data: null, error: error.message };
    }
    const raw = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    return {
      data: {
        success: raw?.success !== false,
        id: String(raw?.id ?? cleanId),
        status: 'cancelled',
      },
      error: null,
    };
  } catch (err: unknown) {
    return { data: null, error: extractErrorText(err) || 'Failed to cancel appointment' };
  }
}
