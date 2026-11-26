/**
 * Davao Bank — strict Bantay chat output validator (Stage 8N).
 * Extends the Stage 8E validators: parse, base safety, strip, PII, actions,
 * claimed actions and refusal consistency. Any failure returns the fixed fallback.
 */

import {
  BANTAY_CHAT_ALLOWED_AMOUNT_TOKENS,
  BANTAY_CHAT_OUT_OF_SCOPE_REPLY,
  BANTAY_CHAT_REFUSAL_REPLY,
  isBantayChatActionId,
  type BantayChatActionId,
} from './chatConfig.ts';
import { isSafeExplanation, isValidExplanationForFacts } from './gemini.ts';
import { NEUTRAL_CHAT_FACTS } from './chatContext.ts';
import type { BantayFacts } from './facts.ts';

export interface ChatModelOutput {
  reply: string;
  actions: string[];
  refused: boolean;
}

export type ValidatedChatOutput = {
  valid: true;
  reply: string;
  actions: BantayChatActionId[];
  refused: boolean;
};

export interface ChatValidationOptions {
  facts?: BantayFacts;
  articleText?: string | null;
  maxChars?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Strip one optional code fence, then parse strictly (no extra keys). */
export function parseChatModelOutput(raw: string): ChatModelOutput | null {
  let text = raw.trim();
  if (text.startsWith('```')) {
    text = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const keys = Object.keys(parsed).sort();
  if (keys.join(',') !== 'actions,refused,reply') return null;
  if (typeof parsed.reply !== 'string') return null;
  if (typeof parsed.refused !== 'boolean') return null;
  if (
    !Array.isArray(parsed.actions) ||
    parsed.actions.some((action) => typeof action !== 'string')
  )
    return null;
  return {
    reply: parsed.reply,
    actions: parsed.actions as string[],
    refused: parsed.refused,
  };
}

/** Return `changed` when unsafe markup was present — the caller must fall back. */
export function stripUnsafeChatText(text: string): { text: string; changed: boolean } {
  const stripped = text
    .replace(/\[[^\]]+\]\([^)]+\)/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/`/g, '')
    .replace(/(?:https?:\/\/|www\.)[^\s)]+/gi, '');
  return { text: stripped.trim(), changed: stripped !== text };
}

function amountsAreBands(text: string): boolean {
  const tokens = text.match(/₱\s*[\d,]+(?:\s*[–-]\s*₱?\s*[\d,]+)?/g) ?? [];
  const allowed: readonly string[] = BANTAY_CHAT_ALLOWED_AMOUNT_TOKENS;
  return tokens.every((token) => {
    const normalised = token.replace(/\s+/g, '').replace(/-/g, '–').replace(/₱₱/g, '₱');
    return allowed.includes(normalised as (typeof allowed)[number]);
  });
}

const PII_PATTERNS = [
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/,
  /\+63\b/,
  /\b\d{10}\b/,
  /\b\d{6}\b/,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
  /\u2022{2}\s*\d{4}/,
  /\b\d{4}-\d{2}-\d{2}\b/,
];

const CLAIMED_ACTION_PATTERNS = [
  /\b(i've|i have|ive)\s+(sent|moved|transferred|paid|locked|unlocked|changed|confirmed|cancelled)\b/i,
  /\byour\s+(limit|account|setting|payment)\s+is\s+now\b/i,
  /\b(i|we)\s+(have\s+)?(done|completed)\s+(it|that|the)\b/i,
];

function normaliseForFidelity(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** An article answer may only rephrase the article, never add steps or claims. */
export function isFaithfulToArticle(reply: string, articleText: string): boolean {
  const article = normaliseForFidelity(articleText);
  const sentences = reply
    .split(/(?<=[.!?])\s+/)
    .map(normaliseForFidelity)
    .filter(Boolean);
  return (
    sentences.length > 0 && sentences.every((sentence) => article.includes(sentence))
  );
}

export function validateChatModelOutput(
  output: ChatModelOutput,
  options: ChatValidationOptions = {}
): ValidatedChatOutput | null {
  const maxChars = options.maxChars ?? 500;
  const reply = output.reply.trim();
  if (!reply || reply.length > maxChars) return null;
  if (reply.includes('!')) return null;
  if (!isSafeExplanation(reply)) return null;
  // Chat replaces exact ₱ amounts with coarse bands. Validate the rest with the
  // Stage 8E facts validator, then apply the stricter four-phrase amount check.
  const withoutAmounts = reply.replace(/₱\s*[\d,]+(?:\s*[–-]\s*₱?\s*[\d,]+)?/g, '₱band');
  if (!isValidExplanationForFacts(withoutAmounts, options.facts ?? NEUTRAL_CHAT_FACTS))
    return null;
  if (stripUnsafeChatText(reply).changed) return null;
  if (!amountsAreBands(reply)) return null;
  if (PII_PATTERNS.some((pattern) => pattern.test(reply))) return null;
  if (CLAIMED_ACTION_PATTERNS.some((pattern) => pattern.test(reply))) return null;
  if (options.articleText && !isFaithfulToArticle(reply, options.articleText))
    return null;

  const seen = new Set<string>();
  const actions: BantayChatActionId[] = [];
  for (const action of output.actions) {
    if (seen.has(action)) continue;
    seen.add(action);
    if (!isBantayChatActionId(action)) return null;
    actions.push(action);
  }
  if (actions.length > 1) return null;

  if (output.refused) {
    if (reply !== BANTAY_CHAT_REFUSAL_REPLY && reply !== BANTAY_CHAT_OUT_OF_SCOPE_REPLY)
      return null;
    if (reply === BANTAY_CHAT_OUT_OF_SCOPE_REPLY) {
      return { valid: true, reply, actions: [], refused: true };
    }
    if (actions.some((action) => action !== 'open_bantay' && action !== 'open_support'))
      return null;
  }

  return { valid: true, reply, actions, refused: output.refused };
}
