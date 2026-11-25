/**
 * Davao Bank — Bantay AI masked facts builder (Stage 8E).
 *
 * Pure and Deno-loadable: this file intentionally has no imports so the Edge
 * Function can load it directly with an explicit `.ts` specifier.
 * Only allow-listed, coarse values leave this module: no name, email, note,
 * full account number, transaction id or user id can reach the model.
 */

export const BANTAY_EVENT_KINDS = [
  'risky_payment_challenged',
  'risky_payment_confirmed',
  'new_device',
  'signin_failures',
  'code_failures',
  'mfa_changed',
  'password_changed',
  'limit_changed',
  'account_locked',
  'account_unlocked',
] as const;

export type BantayEventKind = (typeof BANTAY_EVENT_KINDS)[number] | 'unknown_event';
export type BantaySeverity = 'info' | 'warning' | 'high';
export type BantayAmountBand =
  'none' | 'under_1000' | '1000_5000' | '5000_10000' | 'over_10000';
export type BantayPayeeStatus = 'none' | 'new' | 'trusted' | 'existing';
export type BantayFrequencyBand = 'none' | 'few' | 'many';
export type BantayHourBand =
  'unknown' | 'early_morning' | 'morning' | 'afternoon' | 'evening' | 'night';
export type BantayDeviceAgeBand = 'unknown' | 'new' | 'established';
export type BantayScoreBand = 'low' | 'elevated' | 'high';
export type BantaySignalName =
  | 'new payee'
  | 'unusual amount'
  | 'rapid payments'
  | 'new device'
  | 'recent security change'
  | 'late hour';

/** The caller passes a security_events row; every other field is ignored. */
export interface BantaySecurityEvent {
  kind: string;
  severity: string;
  score?: number | null;
  facts?: Record<string, unknown> | null;
  created_at?: string | null;
  [key: string]: unknown;
}

/** Structured, masked output. Every string value comes from a fixed allow-list. */
export interface BantayFacts {
  kind: BantayEventKind;
  severity: BantaySeverity;
  amount_band: BantayAmountBand;
  payee_status: BantayPayeeStatus;
  payee_suffix: string;
  frequency_band: BantayFrequencyBand;
  hour_band: BantayHourBand;
  device_age_band: BantayDeviceAgeBand;
  recent_auth_change: boolean;
  score_band: BantayScoreBand;
  signal_names: BantaySignalName[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isTrue(value: unknown): boolean {
  return value === true;
}

function amountBand(value: unknown): BantayAmountBand {
  const centavos = finiteNumber(value);
  if (centavos === null || centavos <= 0) return 'none';
  if (centavos < 100_000) return 'under_1000';
  if (centavos < 500_000) return '1000_5000';
  if (centavos < 1_000_000) return '5000_10000';
  return 'over_10000';
}

function frequencyBand(value: unknown): BantayFrequencyBand {
  const count = finiteNumber(value);
  if (count === null || count < 1) return 'none';
  if (count < 3) return 'few';
  return 'many';
}

/** Asia/Manila has no daylight saving time, so UTC+8 is exact. */
function hourBand(value: unknown): BantayHourBand {
  if (typeof value !== 'string') return 'unknown';
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return 'unknown';
  const hour = (new Date(timestamp).getUTCHours() + 8) % 24;
  if (hour < 5) return 'early_morning';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

function deviceAgeBand(value: unknown): BantayDeviceAgeBand {
  const hours = finiteNumber(value);
  if (hours === null || hours < 0) return 'unknown';
  return hours < 24 ? 'new' : 'established';
}

function scoreBand(value: unknown): BantayScoreBand {
  const score = finiteNumber(value);
  if (score === null) return 'low';
  if (score >= 70) return 'high';
  if (score >= 40) return 'elevated';
  return 'low';
}

/** Keep only the last four digits; anything else becomes the literal 'none'. */
function maskedSuffix(value: unknown): string {
  if (typeof value !== 'string') return 'none';
  const match = /\d{4}$/.exec(value);
  return match ? match[0] : 'none';
}

function knownKind(value: string): BantayEventKind {
  return (BANTAY_EVENT_KINDS as readonly string[]).includes(value)
    ? (value as BantayEventKind)
    : 'unknown_event';
}

function knownSeverity(value: string): BantaySeverity {
  return value === 'warning' || value === 'high' ? value : 'info';
}

/**
 * Convert a raw security event into the only shape the model is allowed to see.
 * Unknown keys in `facts` (including injected note text) are discarded.
 */
export function buildMaskedFacts(event: BantaySecurityEvent): BantayFacts {
  const raw = isRecord(event.facts) ? event.facts : {};
  const amount = amountBand(raw.amount_centavos ?? raw.amount);
  const suffix = maskedSuffix(raw.payee_account_number ?? raw.payee_last4);
  const frequency = frequencyBand(raw.recent_payment_count ?? raw.payments_last_10_min);
  const hour = hourBand(event.created_at ?? raw.hour_local);
  const deviceAge = deviceAgeBand(raw.device_age_hours);
  const authChange =
    isTrue(raw.recent_auth_change) ||
    isTrue(raw.mfa_changed) ||
    isTrue(raw.password_changed);

  let payeeStatus: BantayPayeeStatus = 'none';
  if (isTrue(raw.trusted_payee)) payeeStatus = 'trusted';
  else if (isTrue(raw.new_payee)) payeeStatus = 'new';
  else if (suffix !== 'none') payeeStatus = 'existing';

  const signals: BantaySignalName[] = [];
  if (payeeStatus === 'new') signals.push('new payee');
  if (amount !== 'none' && amount !== 'under_1000') signals.push('unusual amount');
  if (frequency === 'many') signals.push('rapid payments');
  if (deviceAge === 'new') signals.push('new device');
  if (authChange) signals.push('recent security change');
  if (hour === 'early_morning') signals.push('late hour');

  return {
    kind: knownKind(event.kind),
    severity: knownSeverity(event.severity),
    amount_band: amount,
    payee_status: payeeStatus,
    payee_suffix: suffix,
    frequency_band: frequency,
    hour_band: hour,
    device_age_band: deviceAge,
    recent_auth_change: authChange,
    score_band: scoreBand(event.score),
    signal_names: signals,
  };
}
