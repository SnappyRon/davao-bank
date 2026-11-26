import {
  BANTAY_CHAT_ACTION_IDS,
  BANTAY_CHAT_MAX_MESSAGE_LENGTH,
  classifyBantayChatError,
  createBantayChatClient,
  normalizeBantayChatMessage,
  normalizeBantayChatResponse,
  type BantayChatTransport,
} from '../bantay/chat';

type TransportResult = { data: unknown; error: unknown | null };

function makeTransport(overrides: Partial<BantayChatTransport> = {}) {
  const invoke = jest.fn(
    async (
      _name: string,
      _options: { body: Record<string, unknown> }
    ): Promise<TransportResult> => ({
      data: {
        reply: 'Open Bantay to review your security.',
        actions: ['open_bantay'],
        source: 'ai',
        session_id: 'session-1',
        quota_remaining: 29,
      },
      error: null,
    })
  );
  const rpc = jest.fn(
    async (
      _name: string,
      _params: Record<string, unknown>
    ): Promise<TransportResult> => ({ data: null, error: null })
  );
  return { invoke, rpc, transport: { invoke, rpc, ...overrides } };
}

describe('Phase 8 · Stage 8O — Bantay chat shared client', () => {
  it('sends only the frozen request fields and returns a normalised response', async () => {
    const { invoke, transport } = makeTransport();
    const client = createBantayChatClient(transport);

    const result = await client.send({
      message: '  How do I lock my account?  ',
      session_id: 'session-1',
      history: 'client history is never accepted',
    } as never);

    expect(invoke).toHaveBeenCalledWith('bantay-chat', {
      body: { message: 'How do I lock my account?', session_id: 'session-1' },
    });
    expect(result).toEqual({
      ok: true,
      data: {
        reply: 'Open Bantay to review your security.',
        actions: ['open_bantay'],
        source: 'ai',
        session_id: 'session-1',
        quota_remaining: 29,
      },
    });
  });

  it('omits an absent session id and rejects empty, oversized or control-character messages', async () => {
    const { invoke, transport } = makeTransport();
    const client = createBantayChatClient(transport);

    expect((await client.send({ message: 'Hello' })).ok).toBe(true);
    expect(invoke.mock.calls[0][1].body).toEqual({ message: 'Hello' });

    expect(await client.send({ message: '  ' })).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(
      await client.send({ message: 'a'.repeat(BANTAY_CHAT_MAX_MESSAGE_LENGTH + 1) })
    ).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(await client.send({ message: 'hello\u0000there' })).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('clamps untrusted actions and sources, and keeps a zero quota', () => {
    expect(
      normalizeBantayChatResponse({
        reply: 'Answer from the guide.',
        actions: ['open_admin', 'open_bantay', 'open_transfer'],
        source: 'system',
        session_id: 's',
        quota_remaining: 0,
      })
    ).toEqual({
      reply: 'Answer from the guide.',
      actions: ['open_bantay'],
      source: 'fallback',
      session_id: 's',
      quota_remaining: 0,
    });
    expect(normalizeBantayChatResponse({ reply: '', session_id: 's' })).toBeNull();
    expect(BANTAY_CHAT_ACTION_IDS).toHaveLength(7);
    expect(normalizeBantayChatMessage('ok')).toBe('ok');
  });

  it('maps transport failures to safe failure reasons without raw text', async () => {
    expect(classifyBantayChatError({ message: 'Network request failed' })).toBe(
      'offline'
    );
    expect(classifyBantayChatError({ status: 429 })).toBe('rate_limited');
    expect(classifyBantayChatError({ message: 'daily chat limit reached' })).toBe(
      'daily_limit'
    );
    expect(classifyBantayChatError({ message: 'provider returned secret value' })).toBe(
      'server'
    );

    const { transport, invoke } = makeTransport();
    invoke.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } });
    const client = createBantayChatClient(transport);
    expect(await client.send({ message: 'Hello' })).toEqual({
      ok: false,
      reason: 'offline',
    });
  });

  it('clears through the authenticated RPC and reports failure without mutating state', async () => {
    const { rpc, transport } = makeTransport();
    const client = createBantayChatClient(transport);

    expect(await client.clear('session-1')).toBe(true);
    expect(rpc).toHaveBeenCalledWith('bantay_chat_clear', { p_session_id: 'session-1' });

    rpc.mockResolvedValueOnce({ data: null, error: { message: 'permission denied' } });
    expect(await client.clear('session-1')).toBe(false);
    expect(await client.clear('')).toBe(false);
  });
});
