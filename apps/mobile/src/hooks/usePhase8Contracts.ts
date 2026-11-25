import { useCallback, useEffect, useState } from 'react';
import { toUserMessage } from '@davao-bank/shared';
import { supabase } from '../lib/supabase';

export const DAILY_LIMIT_MIN_CENTAVOS = 100_000; // ₱1,000.00
export const DAILY_LIMIT_MAX_CENTAVOS = 50_000_000; // ₱500,000.00

export interface SecuritySettings {
  daily_transfer_limit_centavos: number;
  spent_today_centavos: number;
  remaining_today_centavos: number;
  locked?: boolean;
  unlock_after?: string | null;
  pending_limit_centavos?: number | null;
  pending_limit_effective_at?: string | null;
}

export interface SecurityEvent {
  id: string;
  kind: string;
  severity: 'info' | 'warning' | 'high';
  score: number | null;
  facts: Record<string, unknown> | null;
  explanation: string | null;
  explanation_source: 'ai' | 'template' | null;
  status: 'open' | 'confirmed_me' | 'reported_not_me' | 'dismissed';
  related_transaction_id: string | null;
  created_at: string;
}

export interface PayeeLookupResult {
  masked_name: string;
  account_type: string;
}

export interface SavedBiller {
  id: string;
  user_id: string;
  biller_id: string;
  reference: string;
  nickname: string;
  due_day: number | null;
  remind: boolean;
  created_at: string;
}

export interface BillReminder {
  id: string;
  biller_id: string;
  biller_name: string;
  nickname: string;
  reference: string;
  due_day: number;
  days_until_due: number;
}

export type MonthlySummaryCategory =
  'money_in' | 'transfers_out' | 'bills' | 'cash_out' | 'adjustments';

export interface MonthlySummaryRow {
  category: MonthlySummaryCategory;
  total_centavos: number;
  count: number;
}

function unwrapSingleRow<T>(data: unknown): T | null {
  if (!data) return null;
  if (Array.isArray(data)) {
    return (data[0] as T | undefined) ?? null;
  }
  return data as T;
}

function extractRawMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const obj = error as {
      message?: unknown;
      error_description?: unknown;
      details?: unknown;
    };
    return String(obj.message || obj.error_description || obj.details || '');
  }
  return '';
}

export function isConfirmationRequired(error: unknown): boolean {
  if (!error) return false;
  const msg = extractRawMessage(error).toLowerCase();
  return msg.includes('confirmation required');
}

export function phase8UserMessage(error: unknown): string {
  const lower = extractRawMessage(error).toLowerCase();
  if (lower.includes('daily limit reached')) {
    return 'Daily limit reached. You can raise your limit in Bantay security center.';
  }
  if (
    lower.includes('daily_transfer_limit') ||
    (lower.includes('100000') && lower.includes('50000000'))
  ) {
    return 'Daily limit must be between ₱1,000.00 and ₱500,000.00.';
  }
  if (lower.includes('account is locked') || lower.includes('account_locked')) {
    return 'Account is locked for outgoing money. Unlock it in Bantay.';
  }
  if (lower.includes('unlock not available yet')) {
    return 'Unlock is not available yet. Please wait for the countdown to complete.';
  }
  if (lower.includes('challenge expired')) {
    return 'Security confirmation expired. Please try again.';
  }
  if (lower.includes('confirmation required')) {
    return 'Confirmation required for this transaction.';
  }
  return toUserMessage(error);
}

function normalizeSecuritySettings(raw: unknown): SecuritySettings | null {
  const row = unwrapSingleRow<Record<string, unknown>>(raw);
  if (!row || typeof row !== 'object') return null;
  if (row.daily_transfer_limit_centavos === undefined) return null;
  return {
    daily_transfer_limit_centavos: Number(row.daily_transfer_limit_centavos) || 0,
    spent_today_centavos: Number(row.spent_today_centavos) || 0,
    remaining_today_centavos: Number(row.remaining_today_centavos) || 0,
    locked: Boolean(row.locked),
    unlock_after: typeof row.unlock_after === 'string' ? row.unlock_after : null,
    pending_limit_centavos:
      row.pending_limit_centavos != null ? Number(row.pending_limit_centavos) : null,
    pending_limit_effective_at:
      typeof row.pending_limit_effective_at === 'string'
        ? row.pending_limit_effective_at
        : null,
  };
}

export async function fetchSecuritySettings(): Promise<{
  data: SecuritySettings | null;
  error: unknown;
}> {
  const { data, error } = await supabase.rpc('get_security_settings');
  if (error) return { data: null, error };
  return { data: normalizeSecuritySettings(data), error: null };
}

export async function setDailyLimitRpc(p_limit_centavos: number): Promise<{
  data: SecuritySettings | null;
  error: unknown;
}> {
  const { data, error } = await supabase.rpc('set_daily_limit', { p_limit_centavos });
  if (error) return { data: null, error };
  return { data: normalizeSecuritySettings(data), error: null };
}

export async function lockMyAccountRpc(): Promise<{
  data: unknown;
  error: unknown;
}> {
  const { data, error } = await supabase.rpc('lock_my_account');
  return { data, error };
}

export async function requestUnlockRpc(): Promise<{
  data: SecuritySettings | null;
  error: unknown;
}> {
  const { data, error } = await supabase.rpc('request_unlock');
  if (error) return { data: null, error };
  return { data: normalizeSecuritySettings(data), error: null };
}

export async function completeUnlockRpc(): Promise<{
  data: SecuritySettings | null;
  error: unknown;
}> {
  const { data, error } = await supabase.rpc('complete_unlock');
  if (error) return { data: null, error };
  return { data: normalizeSecuritySettings(data), error: null };
}

export async function fetchSecurityTimeline(limit = 50): Promise<{
  data: SecurityEvent[];
  error: unknown;
}> {
  if (typeof supabase.rpc !== 'function') {
    return { data: [], error: null };
  }
  const { data, error } = await supabase.rpc('get_security_timeline', {
    p_limit: limit,
  });
  if (error) return { data: [], error };
  const rows = Array.isArray(data) ? data : [];
  return { data: rows as SecurityEvent[], error: null };
}

export async function markEventRpc(
  eventId: string,
  status: 'confirmed_me' | 'reported_not_me'
): Promise<{ error: unknown }> {
  const { error } = await supabase.rpc('mark_event', {
    p_event_id: eventId,
    p_status: status,
  });
  return { error };
}

export async function confirmRiskyPaymentRpc(
  idempotencyKey: string
): Promise<{ data: unknown; error: unknown }> {
  const { data, error } = await supabase.rpc('confirm_risky_payment', {
    p_idempotency_key: idempotencyKey,
  });
  return { data, error };
}

export async function registerDeviceRpc(
  installId: string,
  label?: string
): Promise<{ error: unknown }> {
  if (typeof supabase.rpc !== 'function') {
    return { error: null };
  }
  const { error } = await supabase.rpc('register_device', {
    p_install_id: installId,
    p_label: label ?? null,
  });
  return { error };
}

export async function registerPasswordChangeRpc(): Promise<{ error: unknown }> {
  if (typeof supabase.rpc !== 'function') {
    return { error: null };
  }
  const { error } = await supabase.rpc('register_password_change');
  return { error };
}

export async function explainBantayEvent(
  eventId: string
): Promise<{ explanation?: string; explanation_source?: string; error?: unknown }> {
  try {
    if (typeof supabase.functions?.invoke !== 'function') {
      return {};
    }
    const { data, error } = await supabase.functions.invoke('bantay-explain', {
      body: { event_id: eventId },
    });
    if (error) return { error };
    return {
      explanation: typeof data?.explanation === 'string' ? data.explanation : undefined,
      explanation_source:
        typeof data?.explanation_source === 'string'
          ? data.explanation_source
          : undefined,
    };
  } catch (err) {
    return { error: err };
  }
}

export async function fetchPayeeLookup(accountNumber: string): Promise<{
  data: PayeeLookupResult | null;
  error: unknown;
}> {
  if (typeof supabase.rpc !== 'function') {
    return { data: null, error: null };
  }
  const { data, error } = await supabase.rpc('lookup_payee', {
    p_account_number: accountNumber.trim(),
  });
  if (error) return { data: null, error };
  const row = unwrapSingleRow<Record<string, unknown>>(data);
  if (!row || typeof row.masked_name !== 'string') {
    return { data: null, error: null };
  }
  return {
    data: {
      masked_name: row.masked_name,
      account_type: typeof row.account_type === 'string' ? row.account_type : '',
    },
    error: null,
  };
}

/**
 * Owner decision D9: used ONLY on the Transfer Review step to confirm the
 * masked recipient name before authorizing.
 */
export function usePayeeLookup(accountNumber: string) {
  const [payee, setPayee] = useState<PayeeLookupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const retry = useCallback(() => {
    setRetryCount((n) => n + 1);
  }, []);

  useEffect(() => {
    const cleaned = accountNumber.trim();
    if (!cleaned) {
      setPayee(null);
      setError(null);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    void fetchPayeeLookup(cleaned)
      .then((res) => {
        if (!active) return;
        if (res.error) {
          setPayee(null);
          setError(phase8UserMessage(res.error));
        } else {
          setPayee(res.data);
          setError(null);
        }
      })
      .catch((err) => {
        if (!active) return;
        setPayee(null);
        setError(phase8UserMessage(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [accountNumber, retryCount]);

  return { payee, loading, error, retry };
}

export async function fetchSavedBillers(): Promise<{
  data: SavedBiller[];
  error: unknown;
}> {
  const { data, error } = await supabase
    .from('saved_billers')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return { data: [], error };
  const rows = Array.isArray(data) ? data : [];
  const valid = rows.filter(
    (r): r is SavedBiller =>
      Boolean(r) &&
      typeof r.id === 'string' &&
      typeof r.biller_id === 'string' &&
      typeof r.reference === 'string' &&
      typeof r.nickname === 'string'
  );
  return { data: valid, error: null };
}

export async function saveBillerRecord(input: {
  biller_id: string;
  reference: string;
  nickname: string;
  due_day: number | null;
  remind: boolean;
}): Promise<{ error: unknown }> {
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData?.user?.id) {
    return { error: authError ?? new Error('Not authenticated') };
  }
  const { error } = await supabase.from('saved_billers').insert({
    user_id: userData.user.id,
    biller_id: input.biller_id,
    reference: input.reference.trim(),
    nickname: input.nickname.trim(),
    due_day: input.due_day,
    remind: input.remind,
  });
  return { error };
}

export async function updateSavedBillerRecord(
  id: string,
  patch: { nickname: string; due_day: number | null; remind: boolean }
): Promise<{ error: unknown }> {
  const { error } = await supabase
    .from('saved_billers')
    .update({
      nickname: patch.nickname.trim(),
      due_day: patch.due_day,
      remind: patch.remind,
    })
    .eq('id', id);
  return { error };
}

export async function deleteSavedBillerRecord(id: string): Promise<{ error: unknown }> {
  const { error } = await supabase.from('saved_billers').delete().eq('id', id);
  return { error };
}

export async function fetchBillReminders(): Promise<{
  data: BillReminder[];
  error: unknown;
}> {
  if (typeof supabase.rpc !== 'function') {
    return { data: [], error: null };
  }
  const { data, error } = await supabase.rpc('get_bill_reminders');
  if (error) return { data: [], error };
  const rows = Array.isArray(data) ? data : [];
  const valid: BillReminder[] = rows
    .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === 'object')
    .map((r, idx) => ({
      id: String(r.id ?? r.saved_biller_id ?? `reminder-${idx}`),
      biller_id: String(r.biller_id ?? ''),
      biller_name: String(r.biller_name ?? r.name ?? 'Biller'),
      nickname: String(r.nickname ?? r.biller_name ?? 'Saved biller'),
      reference: String(r.reference ?? ''),
      due_day: Number(r.due_day ?? 1),
      days_until_due: Number(r.days_until_due ?? 0),
    }))
    .filter((r) => r.biller_id.length > 0);
  return { data: valid, error: null };
}

export async function fetchMonthlySummary(monthIso: string): Promise<{
  data: MonthlySummaryRow[];
  error: unknown;
}> {
  const { data, error } = await supabase.rpc('get_monthly_summary', {
    p_month: monthIso,
  });
  if (error) return { data: [], error };
  const rows = Array.isArray(data) ? data : [];
  const normalized: MonthlySummaryRow[] = rows
    .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === 'object')
    .map((r) => ({
      category: String(r.category ?? 'money_in') as MonthlySummaryCategory,
      total_centavos: Number(r.total_centavos ?? 0) || 0,
      count: Number(r.count ?? 0) || 0,
    }));
  return { data: normalized, error: null };
}
