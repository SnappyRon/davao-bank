import { recoverTransfer } from '../utils/transferRecovery';
import { executeTransfer } from '@davao-bank/shared';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('dropped transfer response', () => {
  it('retries the actual RPC with the same key after a committed response is lost', async () => {
    const transactions = new Map<string, object>();
    const rpc = jest.fn(async (_name, args) => {
      const key = args.p_idempotency_key;
      const replay = transactions.has(key);
      if (!replay) {
        transactions.set(key, {
          transaction_id: 'one-transaction',
          amount: args.p_amount,
        });
        return { data: null, error: { message: 'TypeError: Network request failed' } };
      }
      return { data: { ...transactions.get(key), idempotent_replay: true }, error: null };
    });
    const checking = jest.fn();
    const reply = await recoverTransfer(
      () =>
        executeTransfer({ rpc } as unknown as SupabaseClient, {
          from_account: 'source',
          to_account_number: '1020000002',
          amount: 100,
          idempotency_key: 'same-request-key',
        }),
      checking,
      async () => {}
    );
    expect(checking).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0][1]).toEqual(rpc.mock.calls[1][1]);
    expect(transactions.size).toBe(1);
    expect(reply.data?.idempotent_replay).toBe(true);
  });

  it('bounds network retries and leaves the unresolved result available to the caller', async () => {
    const send = jest.fn().mockResolvedValue({ data: null, error: 'Failed to fetch' });
    const result = await recoverTransfer(send, jest.fn(), async () => {});
    expect(send).toHaveBeenCalledTimes(3);
    expect(result.error).toBe('Failed to fetch');
  });

  it('does not retry a definitive business rejection', async () => {
    const send = jest.fn().mockResolvedValue({ data: null, error: 'Insufficient funds' });
    await recoverTransfer(send, jest.fn(), async () => {});
    expect(send).toHaveBeenCalledTimes(1);
  });
});
