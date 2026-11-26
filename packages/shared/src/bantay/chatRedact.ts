/**
 * Davao Bank — Bantay chat input guards and server-side redaction (Stage 8N).
 * Pure and Deno-loadable: no imports, no logging, no network.
 */

import { BANTAY_CHAT_MAX_MESSAGE_CHARS } from './chatConfig.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ChatMessageCheck = { ok: true; message: string } | { ok: false };

/** Trim, bound and reject control characters. Raw errors never reach the user. */
export function checkChatMessage(value: unknown): ChatMessageCheck {
  if (typeof value !== 'string') return { ok: false };
  const message = value.trim();
  if (!message || message.length > BANTAY_CHAT_MAX_MESSAGE_CHARS) return { ok: false };
  if (
    Array.from(message).some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127
    )
  )
    return { ok: false };
  return { ok: true, message };
}

/** Invalid, missing or foreign-format session ids are silently replaced server-side. */
export function checkChatSessionId(value: unknown): string | null {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : null;
}

/**
 * Remove secrets and identifiers before the provider sees the customer's text.
 * Order matters: emails and UUIDs first, then phones, long digit runs, codes and amounts.
 */
export function redactChatMessage(message: string): string {
  return message
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[removed]')
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      '[removed]'
    )
    .replace(/(?:\+63|0)\s?-?\s?9\d{2}[-\s]?\d{3}[-\s]?\d{4}\b/g, '[removed]')
    .replace(/₱\s*(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\.[0-9]+)?/g, '[removed]')
    .replace(/\b\d{10}\b/g, '[removed]')
    .replace(/\b\d{6}\b/g, '[removed]');
}

export type ChatLanguage = 'taglish' | 'english';

const TAGLISH_WORDS =
  /\b(unsaon|paano|nimo|ninyo|ako|ko|mo|ba|kung|ang|sa|gihapon|dayon|matago|ihap|kwarta|dili|pilia|ablihi|makatells|unsay|human|gamit|mahimo|matud|daw|kila|makita)\b/i;

export function detectChatLanguage(message: string): ChatLanguage {
  return TAGLISH_WORDS.test(message) ? 'taglish' : 'english';
}

interface PatternGuard {
  reply: 'refusal' | 'out_of_scope' | 'other_user' | 'secret_request';
}

const GUARDS: Array<{ pattern: RegExp; guard: PatternGuard }> = [
  {
    pattern:
      /\b(ignore|forget|disregard)\b.{0,40}\b(rules|instructions|prompt|system)\b|\bignore previous\b/i,
    guard: { reply: 'refusal' },
  },
  {
    pattern:
      /\b(send|transfer|pay|withdraw|move|deposit)\b.{0,50}(₱\s?\d|\d{4}|\bto\s+••|\bnumber\b)|\b(transfer|send)\s+(money|funds)\s+to\b/i,
    guard: { reply: 'refusal' },
  },
  {
    pattern:
      /\b(unlock|unblock|confirm|approve|change|raise|lower|set)\b.{0,40}\b(account|limit|challenge|payment|password|setting)\b/i,
    guard: { reply: 'refusal' },
  },
  {
    pattern:
      /\b(password|passcode|otp|pin|verification code|one-time code|setup key|card number|secret)\b|\b(what('| i)s|tell me|give me|show me)\b.{0,30}\b(code|password|pin|card)\b/i,
    guard: { reply: 'secret_request' },
  },
  {
    pattern:
      /\b(other|another)\s+(user|customer|person|account)s?\b|\bstaff data\b|\badmin cases?\b|\baudit logs?\b/i,
    guard: { reply: 'other_user' },
  },
  {
    pattern:
      /\b(invest|investment|bitcoin|crypto|forex|loan|buy|sell|hold)\b|\b(usd\/php|exchange rate|interest rate|market)\b.{0,40}\b(up|down|going|predict|will|advice)\b|\bwhat should i do with my money\b/i,
    guard: { reply: 'out_of_scope' },
  },
];

/** Cheap, tested pre-refusal so obvious abuse never reaches the provider. */
export function detectChatPreRefusal(message: string): PatternGuard['reply'] | null {
  for (const { pattern, guard } of GUARDS) {
    if (pattern.test(message)) return guard.reply;
  }
  return null;
}
