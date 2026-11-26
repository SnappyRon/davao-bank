/**
 * Davao Bank — Bantay chat masked context (Stage 8N).
 * Every field sent to the provider is coarse and allow-listed. Raw facts, notes,
 * device labels, ids, exact centavos and timestamps never reach this module's output.
 */

import { BANTAY_CHAT_AMOUNT_BANDS } from './chatConfig.ts';
import { buildMaskedFacts, type BantayFacts } from './facts.ts';

export interface ChatTimelineEvent {
  kind?: unknown;
  severity?: unknown;
  score?: unknown;
  facts?: Record<string, unknown> | null;
  status?: unknown;
  created_at?: string | null;
}

export interface ChatSecuritySettings {
  daily_transfer_limit_centavos?: unknown;
  remaining_today_centavos?: unknown;
  locked?: unknown;
  unlock_after?: string | null;
  pending_limit_centavos?: unknown;
  pending_limit_effective_at?: string | null;
}

export interface ChatDeviceRow {
  trusted?: unknown;
  last_seen_at?: string | null;
  first_seen_at?: string | null;
}

export type ChatEventStatus = 'open' | 'confirmed_me' | 'reported_not_me' | 'dismissed';
export type ChatAgeBand = 'today' | 'this_week' | 'older';
export type ChatCountBand = 'none' | 'few' | 'several' | 'many';
export type ChatUnlockState = 'none' | 'pending' | 'available';

export interface ChatMaskedEvent {
  facts: BantayFacts;
  status: ChatEventStatus;
  age_band: ChatAgeBand;
}

export interface ChatMaskedContext {
  events: ChatMaskedEvent[];
  limits: { limit_band: string; remaining_band: string };
  locked: boolean;
  unlock_state: ChatUnlockState;
  device_count_band: ChatCountBand;
  trusted_count_band: ChatCountBand;
  newest_device_age_band: ChatAgeBand;
}

const EVENT_STATUSES: readonly ChatEventStatus[] = [
  'open',
  'confirmed_me',
  'reported_not_me',
  'dismissed',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Only the four approved peso bands may leave this function. */
export function chatAmountBand(value: unknown): string {
  const amount = finiteNumber(value);
  if (amount === null || amount <= 0) return 'none';
  if (amount < 100_000) return BANTAY_CHAT_AMOUNT_BANDS[0];
  if (amount < 500_000) return BANTAY_CHAT_AMOUNT_BANDS[1];
  if (amount < 1_000_000) return BANTAY_CHAT_AMOUNT_BANDS[2];
  return BANTAY_CHAT_AMOUNT_BANDS[3];
}

export function chatAgeBand(timestamp: unknown, nowMs = Date.now()): ChatAgeBand {
  if (typeof timestamp !== 'string') return 'older';
  const time = Date.parse(timestamp);
  if (!Number.isFinite(time)) return 'older';
  const hours = (nowMs - time) / 3_600_000;
  if (hours < 24) return 'today';
  if (hours < 24 * 7) return 'this_week';
  return 'older';
}

export function chatCountBand(count: number): ChatCountBand {
  if (count <= 0) return 'none';
  if (count <= 2) return 'few';
  if (count <= 5) return 'several';
  return 'many';
}

export function chatEventStatus(value: unknown): ChatEventStatus {
  return typeof value === 'string' && EVENT_STATUSES.includes(value as ChatEventStatus)
    ? (value as ChatEventStatus)
    : 'open';
}

export function chatUnlockState(
  settings: ChatSecuritySettings | null | undefined,
  nowMs = Date.now()
): ChatUnlockState {
  if (settings?.locked !== true) return 'none';
  const after = settings.unlock_after;
  if (typeof after !== 'string' || !Number.isFinite(Date.parse(after))) return 'pending';
  return Date.parse(after) <= nowMs ? 'available' : 'pending';
}

/**
 * Reduce caller-owned rows to the smallest safe provider payload. Unknown keys in
 * `facts`, free text and ids are discarded by buildMaskedFacts.
 */
export function buildChatMaskedContext(
  events: readonly unknown[] | null | undefined,
  settings: ChatSecuritySettings | null | undefined,
  devices: readonly unknown[] | null | undefined,
  nowMs = Date.now()
): ChatMaskedContext {
  const safeEvents = (Array.isArray(events) ? events : [])
    .filter(isRecord)
    .slice(0, 5)
    .map((event) => ({
      facts: buildMaskedFacts(event as Parameters<typeof buildMaskedFacts>[0]),
      status: chatEventStatus(event.status),
      age_band: chatAgeBand(event.created_at, nowMs),
    }));

  const safeDevices = (Array.isArray(devices) ? devices : []).filter(isRecord);
  const trusted = safeDevices.filter((device) => device.trusted === true).length;
  const newest = safeDevices.reduce<string | null>((latest, device) => {
    const value = device.last_seen_at;
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return latest;
    return latest === null || Date.parse(value) > Date.parse(latest) ? value : latest;
  }, null);

  return {
    events: safeEvents,
    limits: {
      limit_band: chatAmountBand(settings?.daily_transfer_limit_centavos),
      remaining_band: chatAmountBand(settings?.remaining_today_centavos),
    },
    locked: settings?.locked === true,
    unlock_state: chatUnlockState(settings, nowMs),
    device_count_band: chatCountBand(safeDevices.length),
    trusted_count_band: chatCountBand(trusted),
    newest_device_age_band: newest ? chatAgeBand(newest, nowMs) : 'older',
  };
}

/** A neutral facts object for validator reuse when no event is referenced. */
export const NEUTRAL_CHAT_FACTS: BantayFacts = {
  kind: 'unknown_event',
  severity: 'info',
  amount_band: 'none',
  payee_status: 'none',
  payee_suffix: 'none',
  frequency_band: 'none',
  hour_band: 'unknown',
  device_age_band: 'unknown',
  recent_auth_change: false,
  score_band: 'low',
  signal_names: [],
};
