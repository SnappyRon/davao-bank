import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchCardStatement,
  fetchCardTransactions,
  fetchMyCards,
  payCardBill,
  payDemoMerchant,
  replaceCard,
  revealCardSecrets,
  setCardDailyLimit,
  setCardFrozen,
  setCardOnlinePurchases,
} from '../supabase/cards';

function makeClient(rpcImpl: jest.Mock): SupabaseClient {
  return { rpc: rpcImpl } as unknown as SupabaseClient;
}

const debitRow = {
  id: 'debit-1',
  masked_last4: '0003',
  expiry_month: 11,
  expiry_year: 2029,
  status: 'active' as const,
  online_purchases_enabled: true,
  daily_limit_cents: 50000000,
  remaining_card_day_spend_cents: 30000000,
  linked_account_id: 'account-1',
  pan_ciphertext: 'must-not-reach-client',
  cvv_ciphertext: 'must-not-reach-client',
};

const creditRow = {
  biller_id: 'biller-1',
  masked_last4: '0099',
  credit_limit_cents: 10000000,
  status: 'active',
  amount_due_cents: 250000,
  available_credit_cents: 9750000,
  minimum_due_cents: 50000,
  due_date: '2026-12-15',
};

describe('Phase 9 cards shared RPC client', () => {
  it('reads masked cards only, keeping encrypted secrets out of the result', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: { debit_cards: [debitRow], credit_card: creditRow },
      error: null,
    });
    const { data, error } = await fetchMyCards(makeClient(rpc));

    expect(rpc).toHaveBeenCalledWith('get_my_cards');
    expect(error).toBeNull();
    expect(data?.debit_cards).toHaveLength(1);
    expect(data?.debit_cards[0].masked_last4).toBe('0003');
    expect(data?.credit_card?.amount_due_cents).toBe(250000);
    expect(JSON.stringify(data)).not.toContain('must-not-reach-client');
    expect(JSON.stringify(data)).not.toContain('pan_ciphertext');
  });

  it('turns an RPC error into a safe error string', async () => {
    const rpc = jest
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'STEP_UP_REQUIRED' } });
    const { data, error } = await fetchMyCards(makeClient(rpc));
    expect(data).toBeNull();
    expect(error).toBe('STEP_UP_REQUIRED');
  });

  it('reads a statement with its derived paid and due amounts', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        id: 'statement-1',
        period_start: '2026-11-01',
        period_end: '2026-11-30',
        issued_at: '2026-11-30T00:00:00Z',
        due_date: '2026-12-15',
        total_due_cents: 500000,
        minimum_due_cents: 100000,
        paid_cents: 250000,
        amount_due_cents: 250000,
        payment_reference: 'DBCC-12345678',
      },
      error: null,
    });
    const { data, error } = await fetchCardStatement(makeClient(rpc), ' statement-1 ');

    expect(rpc).toHaveBeenCalledWith('get_my_card_statement', {
      p_statement_id: 'statement-1',
    });
    expect(error).toBeNull();
    expect(data?.payment_reference).toBe('DBCC-12345678');
    expect(data?.amount_due_cents).toBe(250000);
  });

  it('derives amount due when the statement omits it', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        id: 'statement-2',
        period_start: '2026-10-01',
        period_end: '2026-10-31',
        due_date: '2026-11-15',
        total_due_cents: 400000,
        minimum_due_cents: 80000,
        paid_cents: 150000,
        payment_reference: 'DBCC-87654321',
      },
      error: null,
    });
    const { data } = await fetchCardStatement(makeClient(rpc), 'statement-2');
    expect(data?.amount_due_cents).toBe(250000);
  });

  it('reads card activity with server labels and no raw UUID copy', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [
        {
          id: 'tx-1',
          label: 'Card merchant payment · Durian City Bakery (demo)',
          reference: 'DB-8F04-3910',
          amount_cents: 12500,
          created_at: '2026-11-26T02:00:00Z',
        },
      ],
      error: null,
    });
    const { data } = await fetchCardTransactions(makeClient(rpc), 20);
    expect(rpc).toHaveBeenCalledWith('get_my_card_transactions', { p_limit: 20 });
    expect(data?.[0].label).toBe('Card merchant payment · Durian City Bakery (demo)');
    expect(data?.[0].reference).toBe('DB-8F04-3910');
  });

  it('reveals transient secrets without persisting them', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        pan: '9900000000000003',
        cvv: '123',
        expiry: '11/29',
        display_until: '2026-11-26T02:01:00Z',
      },
      error: null,
    });
    const { data } = await revealCardSecrets(makeClient(rpc), 'debit-1');
    expect(rpc).toHaveBeenCalledWith('reveal_card_secrets', { p_card_id: 'debit-1' });
    expect(data).toEqual({
      pan: '9900000000000003',
      cvv: '123',
      expiry: '11/29',
      display_until: '2026-11-26T02:01:00Z',
    });
  });

  it('rejects an empty card id before calling any RPC', async () => {
    const rpc = jest.fn();
    const { error } = await revealCardSecrets(makeClient(rpc), '   ');
    expect(error).toBe('Card is required');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('calls each audited control RPC with the documented argument names', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { id: 'debit-1' }, error: null });
    const client = makeClient(rpc);

    await setCardFrozen(client, 'debit-1', true, debitRow);
    expect(rpc).toHaveBeenLastCalledWith('set_card_frozen', {
      p_card_id: 'debit-1',
      p_frozen: true,
    });

    await setCardOnlinePurchases(client, 'debit-1', false, debitRow);
    expect(rpc).toHaveBeenLastCalledWith('set_card_online_purchases', {
      p_card_id: 'debit-1',
      p_enabled: false,
    });

    await setCardDailyLimit(client, 'debit-1', 25000000, debitRow);
    expect(rpc).toHaveBeenLastCalledWith('set_card_daily_limit', {
      p_card_id: 'debit-1',
      p_limit_cents: 25000000,
    });

    await replaceCard(client);
    expect(rpc).toHaveBeenLastCalledWith('replace_card');
  });

  it('refuses a daily limit above the engine ceiling before calling the RPC', async () => {
    const rpc = jest.fn();
    const { error } = await setCardDailyLimit(
      makeClient(rpc),
      'debit-1',
      500000001,
      debitRow
    );
    expect(error).toBe('Daily limit must be between ₱0.01 and ₱5,000,000.00');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('pays a card statement through the existing pay_bill RPC', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: { id: 'tx-2', transaction_id: 'tx-2', amount: 250000, success: true },
      error: null,
    });
    const { data, error } = await payCardBill(makeClient(rpc), {
      fromAccountId: 'account-1',
      billerId: 'biller-1',
      reference: 'DBCC-12345678',
      amountCents: 250000,
      idempotencyKey: 'card-bill-attempt-1',
    });

    expect(rpc).toHaveBeenCalledWith('pay_bill', {
      p_from_account: 'account-1',
      p_biller_id: 'biller-1',
      p_biller_reference: 'DBCC-12345678',
      p_amount: 250000,
      p_idempotency_key: 'card-bill-attempt-1',
    });
    expect(error).toBeNull();
    expect(data?.transactionId).toBe('tx-2');
    expect(data?.idempotentReplay).toBe(false);
  });

  it('uses the dedicated merchant RPC for the optional demo purchase', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: { id: 'tx-3', idempotent_replay: true },
      error: null,
    });
    const { data } = await payDemoMerchant(makeClient(rpc), {
      merchantId: 'merchant-1',
      fromAccountId: 'account-1',
      amountCents: 9900,
      idempotencyKey: 'card-merchant-attempt-1',
    });
    expect(rpc).toHaveBeenCalledWith('pay_demo_merchant', {
      p_merchant_id: 'merchant-1',
      p_from_account: 'account-1',
      p_amount_cents: 9900,
      p_idempotency_key: 'card-merchant-attempt-1',
    });
    expect(data?.idempotentReplay).toBe(true);
  });
});
