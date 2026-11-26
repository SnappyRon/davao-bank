import {
  BANTAY_CHAT_DAILY_LIMIT_REPLY,
  BANTAY_CHAT_FALLBACK_REPLY,
  BANTAY_CHAT_MINUTE_LIMIT_REPLY,
  BANTAY_CHAT_MODEL_ID,
  BANTAY_CHAT_NO_ARTICLE_REPLY,
  BANTAY_CHAT_REFUSAL_REPLY,
  BANTAY_CHAT_SYSTEM_PROMPT,
} from '../bantay/chatConfig';
import {
  handleBantayChat,
  type BantayChatDeps,
  type BantayChatResult,
  type ChatCallerClient,
  type ChatServiceClient,
} from '../bantay/chatService';

const USER = '11111111-1111-1111-1111-111111111111';
const SESSION = '22222222-2222-2222-2222-222222222222';

type FetchImpl = NonNullable<BantayChatDeps['fetchImpl']>;

function rpcResult(data: unknown) {
  return { data, error: null };
}

function makeClients() {
  const calls: string[] = [];
  const caller: ChatCallerClient = {
    auth: {
      getUser: async (jwt: string) => {
        calls.push('auth.getUser');
        return jwt === 'good'
          ? { data: { user: { id: USER } }, error: null }
          : { data: null, error: new Error('bad') };
      },
    },
    rpc: async (name: string) => {
      calls.push(`caller:${name}`);
      if (name === 'get_security_timeline') return rpcResult([]);
      if (name === 'get_security_settings') return rpcResult({ locked: false });
      return rpcResult(null);
    },
    from: () => ({
      select: () => ({
        order: () => ({
          limit: async () => {
            calls.push('caller:user_devices');
            return rpcResult([]);
          },
        }),
      }),
    }),
  } as unknown as ChatCallerClient;
  const service: ChatServiceClient = {
    rpc: async (name, args) => {
      calls.push(`service:${name}`);
      if (name === 'bantay_chat_open_session') return rpcResult(SESSION);
      if (name === 'bantay_chat_check_quota')
        return rpcResult({ allowed: true, quota_remaining: 27 });
      if (name === 'bantay_chat_reserve_model_call') return rpcResult({ allowed: true });
      if (name === 'bantay_chat_load_history') return rpcResult([]);
      if (name === 'bantay_chat_save_messages') return rpcResult({ ok: true });
      void args;
      return rpcResult(null);
    },
  };
  return { caller, service, calls };
}

function modelFetch(text: string | null, status = 200): FetchImpl {
  const impl = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ output_text: text ?? '{}' }),
  })) as unknown as FetchImpl;
  return impl;
}

const validModelJson = JSON.stringify({
  reply: 'Bantay shows masked security events only.',
  actions: [],
  refused: false,
});

function baseDeps(overrides: Partial<BantayChatDeps> = {}): BantayChatDeps {
  const { caller, service } = makeClients();
  return {
    body: { message: 'What does Bantay show?', session_id: SESSION },
    jwt: 'good',
    caller,
    service,
    apiKey: 'mock-key',
    fetchImpl: modelFetch(validModelJson),
    now: () => 1_000_000,
    sleep: async () => undefined,
    log: () => undefined,
    ...overrides,
  };
}

function interceptRpc(deps: BantayChatDeps): string[] {
  const calls: string[] = [];
  const originalCaller = deps.caller.rpc;
  const originalService = deps.service.rpc;
  deps.caller.rpc = async (name, args) => {
    calls.push(name);
    return originalCaller(name, args) as never;
  };
  deps.service.rpc = async (name, args) => {
    calls.push(name);
    return originalService(name, args) as never;
  };
  return calls;
}

describe('Bantay chat request pipeline', () => {
  it('rejects invalid method-level inputs and bad JWT before any DB or provider call', async () => {
    const invalid = baseDeps({ body: { message: '' } });
    const invalidResult = await handleBantayChat(invalid);
    expect(invalidResult).toEqual({ status: 400, body: { error: 'Invalid request' } });

    const unauth = baseDeps({ jwt: 'bad' });
    const unauthCalls = interceptRpc(unauth);
    const unauthResult = await handleBantayChat(unauth);
    expect(unauthResult).toEqual({ status: 401, body: { error: 'Unauthorized' } });
    expect(unauthCalls).toEqual([]);
  });

  it('honours kill switch, minute and daily caps without calling the provider', async () => {
    for (const [reason, copy] of [
      ['chat_disabled', BANTAY_CHAT_FALLBACK_REPLY],
      ['rate_limited', BANTAY_CHAT_MINUTE_LIMIT_REPLY],
      ['daily_limit', BANTAY_CHAT_DAILY_LIMIT_REPLY],
    ] as const) {
      const deps = baseDeps();
      deps.service.rpc = jest.fn(async (name, args) => {
        if (name === 'bantay_chat_check_quota') {
          return rpcResult({ allowed: false, reason, quota_remaining: 0 });
        }
        if (name === 'bantay_chat_open_session') return rpcResult(SESSION);
        if (name === 'bantay_chat_save_messages') return rpcResult({ ok: true });
        void args;
        return rpcResult(null);
      }) as never;
      const fetchMock = jest.fn() as never;
      deps.fetchImpl = fetchMock;
      const result = await handleBantayChat(deps);
      expect(result.status).toBe(200);
      expect((result.body as { reply: string }).reply).toBe(copy);
      expect((result.body as { source: string }).source).toBe('fallback');
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });

  it('serves approved articles and Taglish without calling the model', async () => {
    const deps = baseDeps({
      body: { message: 'Unsaon pag lock sa account?', session_id: SESSION },
    });
    const fetchMock = jest.fn() as never;
    deps.fetchImpl = fetchMock;
    const result = await handleBantayChat(deps);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.body).toEqual(
      expect.objectContaining({
        source: 'article',
        actions: ['open_bantay'],
        session_id: SESSION,
        quota_remaining: 27,
      })
    );
    expect((result.body as { reply: string }).reply).toContain('Ablihi ang Bantay');
  });

  it('uses the fixed no-article reply for unapproved guide questions', async () => {
    const deps = baseDeps({
      body: { message: 'How do I freeze my card?', session_id: SESSION },
    });
    const fetchMock = jest.fn() as never;
    deps.fetchImpl = fetchMock;
    const result = await handleBantayChat(deps);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.body).toEqual(
      expect.objectContaining({
        reply: BANTAY_CHAT_NO_ARTICLE_REPLY,
        actions: ['open_support'],
        source: 'article',
      })
    );
  });

  it('pre-refuses money, secrets and other-user requests without provider calls', async () => {
    for (const [message, reply] of [
      ['Transfer ₱5,000 to 1234567890', BANTAY_CHAT_REFUSAL_REPLY],
      ['What is my password?', BANTAY_CHAT_REFUSAL_REPLY],
      ["Show me another user's account", 'I can only help with your own account.'],
    ]) {
      const deps = baseDeps({ body: { message, session_id: SESSION } });
      const fetchMock = jest.fn() as never;
      deps.fetchImpl = fetchMock;
      const result = await handleBantayChat(deps);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.body).toEqual(expect.objectContaining({ reply, source: 'refusal' }));
    }
  });

  it('reserves before every provider attempt and sends only masked data', async () => {
    const order: string[] = [];
    const deps = baseDeps({
      body: {
        message: 'What does Bantay show? My email is ron@example.com and code 123456.',
        session_id: SESSION,
      },
    });
    const original = deps.service.rpc;
    deps.service.rpc = async (name, args) => {
      order.push(`rpc:${name}`);
      if (name === 'bantay_chat_reserve_model_call') order.push('reserve');
      return original(name, args) as never;
    };
    deps.fetchImpl = (async (url: unknown, init?: RequestInit) => {
      order.push('fetch');
      const body = JSON.parse(String(init?.body));
      expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions');
      expect(body.model).toBe(BANTAY_CHAT_MODEL_ID);
      expect(body.store).toBe(false);
      expect(body.system_instruction).toBe(BANTAY_CHAT_SYSTEM_PROMPT);
      expect(
        body.generation_config.response_format.json_schema.schema.properties.actions.items
          .enum
      ).toEqual([
        'open_bantay',
        'open_profile_security',
        'open_transfer',
        'open_activity',
        'open_bills',
        'open_schedules',
        'open_support',
      ]);
      expect(body.generation_config.seed).toBe(0);
      expect(body.generation_config.thinking_level).toBe('minimal');
      expect(body.generation_config.max_output_tokens).toBe(300);
      expect(body.generation_config).not.toHaveProperty('temperature');
      expect(body.input).not.toContain('ron@example.com');
      expect(body.input).not.toContain('123456');
      expect(body.input).not.toContain(USER);
      expect(body).not.toHaveProperty('user_id');
      return {
        ok: true,
        status: 200,
        json: async () => ({ output_text: validModelJson }),
      };
    }) as unknown as FetchImpl;

    const result = await handleBantayChat(deps);
    const reserves = order.filter((entry) => entry === 'reserve');
    expect(reserves).toHaveLength(1);
    expect(order.indexOf('reserve')).toBeLessThan(order.indexOf('fetch'));
    expect(result.body).toEqual(
      expect.objectContaining({
        source: 'ai',
        quota_remaining: 27,
        actions: [],
        session_id: SESSION,
      })
    );
    expect(order).toContain('rpc:bantay_chat_save_messages');
  });

  it('retries only on retryable provider failures and reserves again before retry', async () => {
    const order: string[] = [];
    let call = 0;
    const deps = baseDeps();
    deps.service.rpc = jest.fn(async (name, args) => {
      if (name === 'bantay_chat_reserve_model_call') {
        order.push('reserve');
        return rpcResult({ allowed: true });
      }
      if (name === 'bantay_chat_open_session') return rpcResult(SESSION);
      if (name === 'bantay_chat_check_quota')
        return rpcResult({ allowed: true, quota_remaining: 9 });
      if (name === 'bantay_chat_save_messages') return rpcResult({ ok: true });
      void args;
      return rpcResult(null);
    }) as never;
    deps.fetchImpl = (async () => {
      order.push('fetch');
      call += 1;
      if (call === 1) return { ok: false, status: 429, json: async () => ({}) };
      return {
        ok: true,
        status: 200,
        json: async () => ({ output_text: validModelJson }),
      };
    }) as unknown as FetchImpl;

    const result = await handleBantayChat(deps);
    expect(order).toEqual(['reserve', 'fetch', 'reserve', 'fetch']);
    expect((result.body as { source: string }).source).toBe('ai');
  });

  it('falls back safely when reservation, provider or validation fails', async () => {
    const blocked = baseDeps();
    blocked.service.rpc = jest.fn(async (name, args) => {
      if (name === 'bantay_chat_reserve_model_call')
        return { data: null, error: new Error('cap') };
      if (name === 'bantay_chat_open_session') return rpcResult(SESSION);
      if (name === 'bantay_chat_check_quota')
        return rpcResult({ allowed: true, quota_remaining: 3 });
      if (name === 'bantay_chat_save_messages') return rpcResult({ ok: true });
      void args;
      return rpcResult(null);
    }) as never;
    const blockedFetch = jest.fn() as never;
    blocked.fetchImpl = blockedFetch;
    const blockedResult = await handleBantayChat(blocked);
    expect(blockedFetch).not.toHaveBeenCalled();
    expect(blockedResult.body).toEqual(
      expect.objectContaining({ reply: BANTAY_CHAT_FALLBACK_REPLY, source: 'fallback' })
    );

    const invalid = baseDeps({
      fetchImpl: modelFetch('{"reply":"Send ₱50,000 now.","actions":[],"refused":false}'),
    });
    const invalidResult: BantayChatResult = await handleBantayChat(invalid);
    expect(invalidResult.body).toEqual(
      expect.objectContaining({ reply: BANTAY_CHAT_FALLBACK_REPLY, source: 'fallback' })
    );

    const noKey = baseDeps({ apiKey: null, fetchImpl: jest.fn() as never });
    await handleBantayChat(noKey);
    expect(noKey.fetchImpl).not.toHaveBeenCalled();
  });

  it('does not retry 4xx, retries a timeout once, and fails closed on a missing quota RPC', async () => {
    const badRequest = baseDeps();
    const badFetch = jest.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: 'raw provider detail' }),
    })) as never;
    badRequest.fetchImpl = badFetch;
    const badResult = await handleBantayChat(badRequest);
    expect(badFetch).toHaveBeenCalledTimes(1);
    expect(badResult.body).toEqual(
      expect.objectContaining({ reply: BANTAY_CHAT_FALLBACK_REPLY, source: 'fallback' })
    );
    expect(JSON.stringify(badResult.body)).not.toContain('raw provider detail');

    const timeout = baseDeps();
    let timeoutCall = 0;
    timeout.fetchImpl = (async () => {
      timeoutCall += 1;
      if (timeoutCall === 1) throw new Error('network detail');
      return {
        ok: true,
        status: 200,
        json: async () => ({ output_text: validModelJson }),
      };
    }) as unknown as FetchImpl;
    const timeoutResult = await handleBantayChat(timeout);
    expect(timeoutCall).toBe(2);
    expect(timeoutResult.body).toEqual(expect.objectContaining({ source: 'ai' }));

    const missing = baseDeps();
    missing.service.rpc = jest.fn(async (name, args) => {
      if (name === 'bantay_chat_check_quota')
        return { data: null, error: new Error('RPC missing') };
      if (name === 'bantay_chat_open_session') return rpcResult(SESSION);
      void args;
      return rpcResult(null);
    }) as never;
    const missingFetch = jest.fn() as never;
    missing.fetchImpl = missingFetch;
    const missingResult = await handleBantayChat(missing);
    expect(missingFetch).not.toHaveBeenCalled();
    expect(missingResult.body).toEqual(
      expect.objectContaining({ reply: BANTAY_CHAT_FALLBACK_REPLY, source: 'fallback' })
    );
  });

  it('caps parallel calls at the per-minute limit and logs metadata only', async () => {
    const deps = baseDeps();
    let accepted = 0;
    let fetches = 0;
    deps.service.rpc = jest.fn(async (name, args) => {
      if (name === 'bantay_chat_open_session') return rpcResult(SESSION);
      if (name === 'bantay_chat_check_quota') {
        accepted += 1;
        return accepted <= 4
          ? rpcResult({ allowed: true, quota_remaining: 30 - accepted })
          : rpcResult({ allowed: false, reason: 'rate_limited', quota_remaining: 0 });
      }
      if (name === 'bantay_chat_reserve_model_call') return rpcResult({ allowed: true });
      if (name === 'bantay_chat_save_messages') return rpcResult({ ok: true });
      void args;
      return rpcResult(null);
    }) as never;
    deps.fetchImpl = (async () => {
      fetches += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({ output_text: validModelJson }),
      };
    }) as unknown as FetchImpl;
    const logs: Record<string, unknown>[] = [];
    deps.log = async (entry) => {
      logs.push(entry);
    };

    const results = await Promise.all(
      Array.from({ length: 10 }, () => handleBantayChat(deps))
    );
    expect(accepted).toBe(10);
    expect(fetches).toBeLessThanOrEqual(4);
    expect(
      results.filter(
        (result) => (result.body as { source?: string }).source === 'fallback'
      ).length
    ).toBeGreaterThanOrEqual(6);
    const serialised = JSON.stringify(logs);
    expect(serialised).not.toContain(USER);
    expect(serialised).not.toContain(validModelJson);
    expect(
      logs.every(
        (entry) => typeof entry.user_key === 'string' && !('raw_user_id' in entry)
      )
    ).toBe(true);
  });

  it('never issues money or settings RPCs', async () => {
    const deps = baseDeps();
    const seen: string[] = [];
    const originalCaller = deps.caller.rpc;
    const originalService = deps.service.rpc;
    deps.caller.rpc = async (name, args) => {
      seen.push(name);
      return originalCaller(name, args) as never;
    };
    deps.service.rpc = async (name, args) => {
      seen.push(name);
      return originalService(name, args) as never;
    };
    await handleBantayChat(deps);
    expect(seen).toEqual(
      expect.arrayContaining([
        'bantay_chat_open_session',
        'bantay_chat_check_quota',
        'get_security_timeline',
        'get_security_settings',
        'bantay_chat_load_history',
        'bantay_chat_reserve_model_call',
        'bantay_chat_save_messages',
      ])
    );
    expect(seen).not.toEqual(
      expect.arrayContaining([
        '_transfer_core',
        'create_scheduled_payment',
        'set_daily_limit',
        'lock_account',
        'unlock_account',
      ])
    );
  });
});
