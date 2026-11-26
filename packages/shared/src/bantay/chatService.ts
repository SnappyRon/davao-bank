/**
 * Davao Bank — Bantay chat request/response pipeline (Phase 8 · Stage 8N).
 *
 * Pure, Deno-loadable and injectable: the Edge Function supplies real Supabase
 * clients, Deno.env and fetch; Jest supplies mocks. The model is called only after
 * quota and global reservation succeed, and no tools or money/settings RPCs exist.
 */

import {
  BANTAY_CHAT_ACTION_IDS,
  BANTAY_CHAT_CONTEXT_VERSION,
  BANTAY_CHAT_FALLBACK_REPLY,
  BANTAY_CHAT_NO_ARTICLE_REPLY,
  BANTAY_CHAT_HISTORY_LIMIT,
  BANTAY_CHAT_MODEL_ID,
  BANTAY_CHAT_OUT_OF_SCOPE_REPLY,
  BANTAY_CHAT_REFUSAL_REPLY,
  BANTAY_CHAT_RETRY_MAX_MS,
  BANTAY_CHAT_RETRY_MIN_MS,
  BANTAY_CHAT_OTHER_USER_REPLY,
  BANTAY_CHAT_DAILY_LIMIT_REPLY,
  BANTAY_CHAT_MINUTE_LIMIT_REPLY,
  BANTAY_CHAT_STORE,
  BANTAY_CHAT_SYSTEM_PROMPT,
  BANTAY_CHAT_SEED,
  BANTAY_CHAT_THINKING_LEVEL,
  BANTAY_CHAT_TIMEOUT_MS,
  BANTAY_CHAT_TOTAL_TIMEOUT_MS,
  BANTAY_CHAT_MAX_OUTPUT_TOKENS,
  type BantayChatActionId,
  type BantayChatLimitReason,
  type BantayChatSource,
} from './chatConfig.ts';
import { buildChatMaskedContext, NEUTRAL_CHAT_FACTS } from './chatContext.ts';
import {
  chatArticleCacheKey,
  chatArticleText,
  createChatArticleCache,
  findChatArticle,
  type ChatArticleCache,
} from './chatHelp.ts';
import {
  checkChatMessage,
  checkChatSessionId,
  detectChatLanguage,
  detectChatPreRefusal,
  redactChatMessage,
} from './chatRedact.ts';
import { extractGeminiText, GEMINI_API_URL } from './gemini.ts';
import { parseChatModelOutput, validateChatModelOutput } from './chatValidator.ts';

export interface ChatRpcResult<T> {
  data: T | null;
  error: { message?: string } | null;
}

export interface ChatQuery {
  eq(column: string, value: unknown): ChatQuery;
  order(column: string, options?: { ascending?: boolean }): ChatQuery;
  limit(count: number): PromiseLike<ChatRpcResult<unknown[]>>;
  maybeSingle(): PromiseLike<ChatRpcResult<unknown>>;
}

export interface ChatCallerClient {
  auth: {
    getUser(jwt: string): PromiseLike<{
      data: { user: { id: string } } | null;
      error: unknown;
    }>;
  };
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<ChatRpcResult<unknown>>;
  from(table: string): { select(columns: string): ChatQuery };
}

export interface ChatConfigQuery {
  select(columns: string): {
    eq(
      column: string,
      value: unknown
    ): {
      maybeSingle(): PromiseLike<ChatRpcResult<unknown>>;
    };
  };
}

export interface ChatServiceClient {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<ChatRpcResult<unknown>>;
  from?(table: string): ChatConfigQuery;
}

export interface BantayChatDeps {
  body: unknown;
  jwt: string;
  caller: ChatCallerClient;
  service: ChatServiceClient;
  apiKey?: string | null;
  fetchImpl?: typeof fetch;
  cache?: ChatArticleCache;
  contextVersion?: string | null;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  log?: (entry: Record<string, unknown>) => void;
}

export interface BantayChatResponseBody {
  reply: string;
  actions: BantayChatActionId[];
  source: BantayChatSource;
  session_id: string;
  quota_remaining: number;
  limit_reason?: BantayChatLimitReason;
}

export interface BantayChatResult {
  status: number;
  body: BantayChatResponseBody | { error: string };
}

const DAILY_SALT = Math.random().toString(36).slice(2); // in memory only, never logged

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asActionIds(value: unknown): BantayChatActionId[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is BantayChatActionId =>
    (BANTAY_CHAT_ACTION_IDS as readonly unknown[]).includes(id)
  );
}

function requestId(nowMs: number): string {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${nowMs}-${random}`;
}

async function hashedUserKey(userId: string): Promise<string> {
  if (!globalThis.crypto?.subtle) return 'unavailable';
  try {
    const digest = await globalThis.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`${userId}|${DAILY_SALT}`)
    );
    return Array.from(new Uint8Array(digest))
      .slice(0, 12)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return 'unavailable';
  }
}

function limitReply(reason: BantayChatLimitReason): string {
  if (reason === 'daily_limit') return BANTAY_CHAT_DAILY_LIMIT_REPLY;
  if (reason === 'rate_limited') return BANTAY_CHAT_MINUTE_LIMIT_REPLY;
  return BANTAY_CHAT_FALLBACK_REPLY;
}

function response(
  reply: string,
  actions: BantayChatActionId[],
  source: BantayChatSource,
  sessionId: string,
  remaining: number,
  limitReason?: BantayChatLimitReason
): BantayChatResult {
  const body: BantayChatResponseBody = {
    reply,
    actions,
    source,
    session_id: sessionId,
    quota_remaining: remaining,
  };
  if (limitReason) body.limit_reason = limitReason;
  return { status: 200, body };
}

function fallback(sessionId: string, reason?: BantayChatLimitReason): BantayChatResult {
  return response(
    limitReply(reason ?? 'chat_disabled'),
    [],
    'fallback',
    sessionId,
    0,
    reason
  );
}

interface ProviderResult {
  text: string | null;
  attempts: number;
  blocked: boolean;
  retryable: boolean;
  retryStatus?: number;
}

function retryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

async function requestProvider(
  deps: BantayChatDeps,
  userId: string,
  payload: string,
  apiKey: string,
  startedMs: number
): Promise<ProviderResult> {
  const doFetch = deps.fetchImpl ?? fetch;
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = deps.now ?? Date.now;
  const deadline = startedMs + BANTAY_CHAT_TOTAL_TIMEOUT_MS;
  const body = {
    model: BANTAY_CHAT_MODEL_ID,
    store: BANTAY_CHAT_STORE,
    system_instruction: BANTAY_CHAT_SYSTEM_PROMPT,
    generation_config: {
      seed: BANTAY_CHAT_SEED,
      thinking_level: BANTAY_CHAT_THINKING_LEVEL,
      max_output_tokens: BANTAY_CHAT_MAX_OUTPUT_TOKENS,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'bantay_chat_reply',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              reply: { type: 'string' },
              actions: {
                type: 'array',
                items: { type: 'string', enum: [...BANTAY_CHAT_ACTION_IDS] },
              },
              refused: { type: 'boolean' },
            },
            required: ['reply', 'actions', 'refused'],
            additionalProperties: false,
          },
        },
      },
    },
    input: payload,
  };

  let attempts = 0;
  let retryable = false;
  let retryStatus: number | undefined;
  while (attempts < 2) {
    // Reserve BEFORE every provider attempt, including the retry. Fail closed.
    const reservation = await deps.service.rpc('bantay_chat_reserve_model_call', {
      p_user_id: userId,
    });
    if (
      reservation.error ||
      !isRecord(reservation.data) ||
      reservation.data.allowed !== true
    ) {
      return { text: null, attempts, blocked: true, retryable: false };
    }
    if (now() >= deadline) break;
    attempts += 1;
    try {
      const response = await doFetch(GEMINI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(BANTAY_CHAT_TIMEOUT_MS),
      });
      if (!response.ok) {
        retryable = retryableStatus(response.status);
        retryStatus = response.status;
        if (retryable && attempts < 2 && now() + BANTAY_CHAT_TIMEOUT_MS < deadline) {
          await sleep(
            BANTAY_CHAT_RETRY_MIN_MS +
              Math.floor(
                Math.random() * (BANTAY_CHAT_RETRY_MAX_MS - BANTAY_CHAT_RETRY_MIN_MS + 1)
              )
          );
          continue;
        }
        return { text: null, attempts, blocked: false, retryable, retryStatus };
      }
      const text = extractGeminiText(await response.json());
      return { text, attempts, blocked: false, retryable: false };
    } catch {
      retryable = true;
      if (attempts < 2 && now() + BANTAY_CHAT_TIMEOUT_MS < deadline) {
        await sleep(
          BANTAY_CHAT_RETRY_MIN_MS +
            Math.floor(
              Math.random() * (BANTAY_CHAT_RETRY_MAX_MS - BANTAY_CHAT_RETRY_MIN_MS + 1)
            )
        );
        continue;
      }
      return { text: null, attempts, blocked: false, retryable: true };
    }
  }
  return { text: null, attempts, blocked: false, retryable, retryStatus };
}

/** Validate JWT, quota and every provider call; never call money or settings RPCs. */
export async function handleBantayChat(deps: BantayChatDeps): Promise<BantayChatResult> {
  const now = deps.now ?? Date.now;
  const startedMs = now();
  const log =
    deps.log ?? ((entry: Record<string, unknown>) => console.info(JSON.stringify(entry)));

  const messageCheck = checkChatMessage(
    isRecord(deps.body) ? deps.body.message : undefined
  );
  if (!messageCheck.ok) return { status: 400, body: { error: 'Invalid request' } };
  const originalMessage = messageCheck.message;
  const redactedMessage = redactChatMessage(originalMessage);
  const language = detectChatLanguage(originalMessage);
  const proposedSession = checkChatSessionId(
    isRecord(deps.body) ? deps.body.session_id : undefined
  );

  const auth = await deps.caller.auth.getUser(deps.jwt);
  if (auth.error || !auth.data?.user?.id) {
    return { status: 401, body: { error: 'Unauthorized' } };
  }
  const userId = auth.data.user.id;

  const opened = await deps.service.rpc('bantay_chat_open_session', {
    p_user_id: userId,
    p_existing: proposedSession,
  });
  const sessionId =
    typeof opened.data === 'string' ? opened.data : (proposedSession ?? '');
  if (opened.error || !sessionId) {
    await log({
      function: 'bantay-chat',
      request_id: requestId(startedMs),
      outcome: 'fallback',
      model_id: BANTAY_CHAT_MODEL_ID,
      latency_ms: now() - startedMs,
      attempts: 0,
      action_ids: [],
      user_key: await hashedUserKey(userId),
    });
    return fallback(sessionId);
  }

  const quota = await deps.service.rpc('bantay_chat_check_quota', { p_user_id: userId });
  const quotaData = isRecord(quota.data) ? quota.data : null;
  const reason =
    quotaData && typeof quotaData.reason === 'string'
      ? (quotaData.reason as BantayChatLimitReason)
      : undefined;
  const validReason: BantayChatLimitReason | undefined =
    reason === 'daily_limit' || reason === 'rate_limited' || reason === 'chat_disabled'
      ? reason
      : undefined;
  if (
    quota.error ||
    !quotaData ||
    quotaData.allowed !== true ||
    typeof quotaData.quota_remaining !== 'number'
  ) {
    await log({
      function: 'bantay-chat',
      request_id: requestId(startedMs),
      outcome: 'rate_limited',
      model_id: BANTAY_CHAT_MODEL_ID,
      latency_ms: now() - startedMs,
      attempts: 0,
      action_ids: [],
      user_key: await hashedUserKey(userId),
    });
    return fallback(sessionId, validReason ?? 'chat_disabled');
  }
  const remaining = quotaData.quota_remaining;

  let contextVersion = deps.contextVersion ?? null;
  if (!contextVersion && deps.service.from) {
    const config = await deps.service
      .from('bantay_chat_config')
      .select('context_version')
      .eq('id', true)
      .maybeSingle();
    if (
      !config.error &&
      isRecord(config.data) &&
      typeof config.data.context_version === 'string'
    ) {
      contextVersion = config.data.context_version;
    }
  }
  contextVersion ??= BANTAY_CHAT_CONTEXT_VERSION;

  const save = async (
    reply: string,
    actions: BantayChatActionId[],
    source: BantayChatSource
  ) => {
    const saved = await deps.service.rpc('bantay_chat_save_messages', {
      p_user_id: userId,
      p_session_id: sessionId,
      p_user_message: redactedMessage,
      p_reply: reply,
      p_actions: actions,
      p_source: source,
    });
    return !saved.error;
  };

  const finish = async (
    reply: string,
    actions: BantayChatActionId[],
    source: BantayChatSource,
    attempts: number,
    saved: boolean
  ): Promise<BantayChatResult> => {
    await log({
      function: 'bantay-chat',
      request_id: requestId(startedMs),
      outcome: source,
      model_id: BANTAY_CHAT_MODEL_ID,
      latency_ms: now() - startedMs,
      attempts,
      action_ids: actions,
      user_key: await hashedUserKey(userId),
      saved,
    });
    return response(reply, actions, source, sessionId, remaining);
  };

  const cache = deps.cache ?? createChatArticleCache();
  const article = findChatArticle(originalMessage, language);
  if (article) {
    const key = chatArticleCacheKey(article, language, contextVersion);
    const cached = cache.get(key);
    const reply = cached ?? chatArticleText(article, language);
    if (!cached) cache.set(key, reply);
    const actions: BantayChatActionId[] = [article.action];
    return finish(reply, actions, 'article', 0, await save(reply, actions, 'article'));
  }

  const guard = detectChatPreRefusal(originalMessage);
  if (guard) {
    const refusal =
      guard === 'out_of_scope'
        ? { reply: BANTAY_CHAT_OUT_OF_SCOPE_REPLY, actions: [] }
        : guard === 'other_user'
          ? { reply: BANTAY_CHAT_OTHER_USER_REPLY, actions: [] }
          : { reply: BANTAY_CHAT_REFUSAL_REPLY, actions: ['open_bantay' as const] };
    return finish(
      refusal.reply,
      refusal.actions,
      'refusal',
      0,
      await save(refusal.reply, refusal.actions, 'refusal')
    );
  }

  // A guidance question with no approved article is answered from the fixed
  // no-match reply. The model never fills knowledge-base gaps from general data.
  if (/^(how|unsaon|paano|where|can i|what do i|is there|why)\b/i.test(originalMessage)) {
    const actions: BantayChatActionId[] = ['open_support'];
    return finish(
      BANTAY_CHAT_NO_ARTICLE_REPLY,
      actions,
      'article',
      0,
      await save(BANTAY_CHAT_NO_ARTICLE_REPLY, actions, 'article')
    );
  }

  const [timeline, settings, devices, history] = await Promise.all([
    deps.caller.rpc('get_security_timeline', { p_limit: 5 }),
    deps.caller.rpc('get_security_settings'),
    deps.caller
      .from('user_devices')
      .select('trusted,last_seen_at,first_seen_at')
      .order('last_seen_at', { ascending: false })
      .limit(5),
    deps.service.rpc('bantay_chat_load_history', {
      p_session_id: sessionId,
      p_user_id: userId,
      p_limit: BANTAY_CHAT_HISTORY_LIMIT,
    }),
  ]);

  const masked = buildChatMaskedContext(
    Array.isArray(timeline.data) ? timeline.data : [],
    isRecord(settings.data) ? settings.data : null,
    Array.isArray(devices.data) ? devices.data : []
  );
  const recentHistory = (Array.isArray(history.data) ? history.data : [])
    .filter(isRecord)
    .slice(-BANTAY_CHAT_HISTORY_LIMIT)
    .reverse() // RPC returns newest first; the model receives chronological turns
    .map((row) => ({
      role: row.role === 'assistant' ? 'assistant' : 'user',
      content: typeof row.content === 'string' ? row.content.slice(0, 600) : '',
    }))
    .filter((row) => row.content.length > 0);
  const payload = JSON.stringify({
    masked_context: { ...masked, recent_history: recentHistory },
    user_message: redactedMessage,
    approved_articles: [],
  });

  if (!deps.apiKey) {
    return finish(
      BANTAY_CHAT_FALLBACK_REPLY,
      [],
      'fallback',
      0,
      await save(BANTAY_CHAT_FALLBACK_REPLY, [], 'fallback')
    );
  }

  const provider = await requestProvider(deps, userId, payload, deps.apiKey, startedMs);
  if (provider.blocked) {
    return finish(
      BANTAY_CHAT_FALLBACK_REPLY,
      [],
      'fallback',
      provider.attempts,
      await save(BANTAY_CHAT_FALLBACK_REPLY, [], 'fallback')
    );
  }

  const parsed = provider.text ? parseChatModelOutput(provider.text) : null;
  const validated = parsed
    ? validateChatModelOutput(parsed, {
        facts: masked.events[0]?.facts ?? NEUTRAL_CHAT_FACTS,
      })
    : null;
  if (!validated) {
    return finish(
      BANTAY_CHAT_FALLBACK_REPLY,
      [],
      'fallback',
      provider.attempts,
      await save(BANTAY_CHAT_FALLBACK_REPLY, [], 'fallback')
    );
  }

  const actions = asActionIds(validated.actions);
  const source: BantayChatSource = validated.refused
    ? 'refusal'
    : validated.reply === BANTAY_CHAT_OUT_OF_SCOPE_REPLY
      ? 'refusal'
      : 'ai';
  return finish(
    validated.reply,
    actions,
    source,
    provider.attempts,
    await save(validated.reply, actions, source)
  );
}
