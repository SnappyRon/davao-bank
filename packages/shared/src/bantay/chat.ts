/**
 * Phase 8 · Stage 8O — Bantay AI chat client.
 *
 * Framework-neutral transport client for the `bantay-chat` Edge Function. The
 * request/response shape follows docs/specs/phase-8-bantay-chat-spec.md §2.2.
 * No provider key, prompt or chat history is ever handled here: the client only
 * sends a message plus the server-issued session id.
 */

export const BANTAY_CHAT_ACTION_IDS = [
  'open_bantay',
  'open_profile_security',
  'open_transfer',
  'open_activity',
  'open_bills',
  'open_schedules',
  'open_support',
] as const;

export type BantayChatActionId = (typeof BANTAY_CHAT_ACTION_IDS)[number];
export type BantayChatSource = 'ai' | 'article' | 'fallback' | 'refusal';
export type BantayChatFailureReason =
  'invalid' | 'offline' | 'rate_limited' | 'daily_limit' | 'server';

export const BANTAY_CHAT_MAX_MESSAGE_LENGTH = 500;

export interface BantayChatRequest {
  message: string;
  session_id?: string;
}

export interface BantayChatResponse {
  reply: string;
  actions: BantayChatActionId[];
  source: BantayChatSource;
  session_id: string;
  /** 0 means the daily quota is exhausted; NaN means the server omitted it. */
  quota_remaining: number;
}

export type BantayChatResult =
  { ok: true; data: BantayChatResponse } | { ok: false; reason: BantayChatFailureReason };

/** Minimal transport shape so the shared client stays usable from RN and Deno. */
export interface BantayChatTransport {
  invoke(
    name: string,
    options: { body: Record<string, unknown> }
  ): Promise<{ data: unknown; error: unknown | null }>;
  rpc(
    name: string,
    params: Record<string, unknown>
  ): Promise<{ data: unknown; error: unknown | null }>;
}

export interface BantayChatClient {
  send(request: BantayChatRequest): Promise<BantayChatResult>;
  clear(sessionId: string): Promise<boolean>;
}

const SOURCES: readonly BantayChatSource[] = ['ai', 'article', 'fallback', 'refusal'];

/** Avoids a control-character regex so lint stays clean and intent is explicit. */
function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

function isActionId(value: unknown): value is BantayChatActionId {
  return (
    typeof value === 'string' &&
    (BANTAY_CHAT_ACTION_IDS as readonly string[]).includes(value)
  );
}

/** Trims and clamps the message before it leaves the device. */
export function normalizeBantayChatMessage(message: unknown): string | null {
  if (typeof message !== 'string') return null;
  const trimmed = message.trim();
  if (!trimmed || trimmed.length > BANTAY_CHAT_MAX_MESSAGE_LENGTH) return null;
  if (hasControlCharacters(trimmed)) return null;
  return trimmed;
}

/**
 * Narrows an untrusted function payload to the frozen response contract. An
 * unknown action id or source is dropped/defaulted rather than rendered.
 */
export function normalizeBantayChatResponse(raw: unknown): BantayChatResponse | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.reply !== 'string' || !value.reply.trim()) return null;
  if (typeof value.session_id !== 'string' || !value.session_id) return null;

  const actions = Array.isArray(value.actions)
    ? value.actions.filter(isActionId).slice(0, 1)
    : [];
  const source = SOURCES.find((candidate) => candidate === value.source) ?? 'fallback';
  const quota =
    typeof value.quota_remaining === 'number' && Number.isFinite(value.quota_remaining)
      ? Math.max(0, Math.floor(value.quota_remaining))
      : Number.NaN;

  return {
    reply: value.reply,
    actions,
    source,
    session_id: value.session_id,
    quota_remaining: quota,
  };
}

/** Classifies transport failures without exposing raw provider/database text. */
export function classifyBantayChatError(error: unknown): BantayChatFailureReason {
  const details = (error ?? {}) as { status?: number; message?: string; code?: string };
  const message = String(details.message || details.code || '').toLowerCase();

  if (/network|fetch|offline|connection|aborted/.test(message)) return 'offline';
  if (
    details.status === 429 ||
    /rate.?limit|too many requests|per minute/.test(message)
  ) {
    return 'rate_limited';
  }
  if (/daily|quota|limit reached/.test(message)) return 'daily_limit';
  return 'server';
}

export function createBantayChatClient(transport: BantayChatTransport): BantayChatClient {
  return {
    async send(request: BantayChatRequest): Promise<BantayChatResult> {
      const message = normalizeBantayChatMessage(request?.message);
      if (!message) return { ok: false, reason: 'invalid' };

      const body: Record<string, unknown> = { message };
      if (typeof request?.session_id === 'string' && request.session_id) {
        body.session_id = request.session_id;
      }

      try {
        const { data, error } = await transport.invoke('bantay-chat', { body });
        if (error) return { ok: false, reason: classifyBantayChatError(error) };
        const response = normalizeBantayChatResponse(data);
        return response ? { ok: true, data: response } : { ok: false, reason: 'server' };
      } catch (error) {
        return { ok: false, reason: classifyBantayChatError(error) };
      }
    },

    async clear(sessionId: string): Promise<boolean> {
      if (!sessionId) return false;
      try {
        const { error } = await transport.rpc('bantay_chat_clear', {
          p_session_id: sessionId,
        });
        return !error;
      } catch {
        return false;
      }
    },
  };
}
