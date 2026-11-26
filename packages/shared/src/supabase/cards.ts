import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Phase 9 cards contract.
 *
 * The RPC names and arguments are the ones pinned by
 * `docs/specs/phase-9-cards-backend.md`. Every read is owner-scoped by the
 * server; no function here writes a table directly or moves money locally.
 */

export type CardStatus = 'active' | 'frozen' | 'replaced' | 'closed';

export interface DigitalDebitCard {
  id: string;
  masked_last4: string;
  expiry_month: number;
  expiry_year: number;
  status: CardStatus;
  online_purchases_enabled: boolean;
  daily_limit_cents: number;
  remaining_card_day_spend_cents: number | null;
  linked_account_id: string;
}

export interface CreditCardSummary {
  id: string | null;
  biller_id: string;
  masked_last4: string;
  credit_limit_cents: number;
  status: CardStatus;
  amount_due_cents: number;
  available_credit_cents: number;
  minimum_due_cents: number;
  due_date: string | null;
  /** Latest seeded statement key, when the backend includes one in the summary. */
  statement_id: string | null;
}

export interface MyCards {
  debit_cards: DigitalDebitCard[];
  credit_card: CreditCardSummary | null;
  statements: CardStatement[];
}

export interface CardStatement {
  id: string;
  period_start: string;
  period_end: string;
  issued_at: string | null;
  due_date: string;
  total_due_cents: number;
  minimum_due_cents: number;
  amount_due_cents: number;
  paid_cents: number;
  payment_reference: string;
}

export interface CardTransaction {
  id: string;
  label: string;
  reference: string;
  amount_cents: number;
  created_at: string | null;
}

export interface RevealedCardSecrets {
  pan: string;
  cvv: string;
  expiry: string;
  display_until: string | null;
}

export interface CardControlResult {
  success: boolean;
  id: string;
  status: CardStatus;
  online_purchases_enabled?: boolean;
  daily_limit_cents?: number;
  idempotent_replay?: boolean;
}

export interface PayCardBillParams {
  fromAccountId: string;
  billerId: string;
  reference: string;
  amountCents: number;
  idempotencyKey: string;
}

export interface PayDemoMerchantParams {
  merchantId: string;
  fromAccountId: string;
  amountCents: number;
  idempotencyKey: string;
}

export interface CardPaymentResult {
  success: boolean;
  id: string | null;
  transactionId: string | null;
  reference: string | null;
  amountCents: number;
  idempotentReplay: boolean;
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function asOptionalString(value: unknown): string | null {
  const text = asString(value, '');
  return text.length > 0 ? text : null;
}

function pick(record: JsonRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function asCardStatus(value: unknown): CardStatus {
  const text = asString(value, 'active');
  if (text === 'frozen' || text === 'replaced' || text === 'closed') return text;
  return 'active';
}

function normalizeDebitCard(value: unknown): DigitalDebitCard | null {
  const row = asRecord(value);
  if (!row) return null;
  const id = asString(pick(row, 'id', 'card_id'));
  const masked = asString(pick(row, 'masked_last4', 'last4'));
  if (!id || !masked) return null;
  const online = pick(row, 'online_purchases_enabled');
  return {
    id,
    masked_last4: masked,
    expiry_month: asNumber(pick(row, 'expiry_month'), 1),
    expiry_year: asNumber(pick(row, 'expiry_year'), new Date().getFullYear()),
    status: asCardStatus(pick(row, 'status')),
    online_purchases_enabled: online === undefined ? true : Boolean(online),
    daily_limit_cents: asNumber(pick(row, 'daily_limit_cents'), 0),
    remaining_card_day_spend_cents:
      pick(row, 'remaining_card_day_spend_cents', 'remaining_daily_spend_cents') ===
      undefined
        ? null
        : asNumber(
            pick(row, 'remaining_card_day_spend_cents', 'remaining_daily_spend_cents'),
            0
          ),
    linked_account_id: asString(pick(row, 'linked_account_id')),
  };
}

function normalizeCreditCard(value: unknown): CreditCardSummary | null {
  const row = asRecord(value);
  if (!row) return null;
  const billerId = asString(pick(row, 'biller_id'));
  const masked = asString(pick(row, 'masked_last4', 'last4'));
  if (!billerId || !masked) return null;
  const totalDue = asNumber(pick(row, 'amount_due_cents', 'total_due_cents'), 0);
  return {
    id: asOptionalString(pick(row, 'id', 'user_id')),
    biller_id: billerId,
    masked_last4: masked,
    credit_limit_cents: asNumber(pick(row, 'credit_limit_cents'), 0),
    status: asCardStatus(pick(row, 'status')),
    amount_due_cents: totalDue,
    available_credit_cents: asNumber(
      pick(row, 'available_credit_cents'),
      Math.max(asNumber(pick(row, 'credit_limit_cents'), 0) - totalDue, 0)
    ),
    minimum_due_cents: asNumber(pick(row, 'minimum_due_cents'), 0),
    due_date: asOptionalString(pick(row, 'due_date')),
    statement_id: asOptionalString(
      pick(row, 'statement_id', 'latest_statement_id', 'current_statement_id')
    ),
  };
}

function normalizeMyCards(value: unknown): MyCards {
  const row = asRecord(value);
  if (!row) return { debit_cards: [], credit_card: null, statements: [] };
  const rawDebit = pick(row, 'debit_cards', 'debitCards');
  const debitRows = Array.isArray(rawDebit) ? rawDebit : [];
  const rawCredit = pick(row, 'credit_card', 'creditCard');
  const creditCard =
    normalizeCreditCard(rawCredit) ??
    normalizeCreditCard(row.credit ?? row.simulated_credit ?? null);
  const rawStatements = pick(row, 'statements', 'card_statements');
  const statements = (Array.isArray(rawStatements) ? rawStatements : [])
    .map(normalizeStatement)
    .filter((statement): statement is CardStatement => statement !== null);
  const latest = normalizeStatement(
    pick(row, 'latest_statement', 'current_statement', 'statement')
  );
  if (latest && !statements.some((statement) => statement.id === latest.id)) {
    statements.unshift(latest);
  }
  return {
    debit_cards: debitRows
      .map(normalizeDebitCard)
      .filter((card): card is DigitalDebitCard => card !== null),
    credit_card: creditCard,
    statements,
  };
}

function normalizeStatement(value: unknown): CardStatement | null {
  const row = asRecord(value);
  if (!row) return null;
  const id = asString(pick(row, 'id', 'statement_id'));
  const reference = asString(pick(row, 'payment_reference'));
  if (!id || !reference) return null;
  const total = asNumber(pick(row, 'total_due_cents'), 0);
  const paid = asNumber(pick(row, 'paid_cents'), 0);
  return {
    id,
    period_start: asString(pick(row, 'period_start')),
    period_end: asString(pick(row, 'period_end')),
    issued_at: asOptionalString(pick(row, 'issued_at')),
    due_date: asString(pick(row, 'due_date')),
    total_due_cents: total,
    minimum_due_cents: asNumber(pick(row, 'minimum_due_cents'), 0),
    amount_due_cents: asNumber(pick(row, 'amount_due_cents'), Math.max(total - paid, 0)),
    paid_cents: paid,
    payment_reference: reference,
  };
}

function normalizeCardTransaction(value: unknown): CardTransaction | null {
  const row = asRecord(value);
  if (!row) return null;
  const label = asString(pick(row, 'label', 'description', 'title'));
  if (!label) return null;
  return {
    id: asString(pick(row, 'id', 'transaction_id')),
    label,
    reference: asString(pick(row, 'reference', 'formatted_reference')),
    amount_cents: asNumber(pick(row, 'amount_cents', 'amount_centavos'), 0),
    created_at: asOptionalString(pick(row, 'created_at')),
  };
}

function normalizeControlResult(
  value: unknown,
  fallbackId: string,
  previous: Partial<DigitalDebitCard> = {}
): CardControlResult {
  const row = asRecord(value);
  return {
    success: row?.success !== false,
    id: asString(pick(row ?? {}, 'id', 'card_id'), fallbackId),
    status: asCardStatus(pick(row ?? {}, 'status', 'state') ?? previous.status),
    online_purchases_enabled:
      row && pick(row, 'online_purchases_enabled') !== undefined
        ? Boolean(pick(row, 'online_purchases_enabled'))
        : previous.online_purchases_enabled,
    daily_limit_cents:
      row && pick(row, 'daily_limit_cents') !== undefined
        ? asNumber(pick(row, 'daily_limit_cents'))
        : previous.daily_limit_cents,
    idempotent_replay: Boolean(row?.idempotent_replay),
  };
}

function normalizePaymentResult(
  value: unknown,
  fallbackAmount: number
): CardPaymentResult {
  const row = asRecord(value);
  const id = asOptionalString(pick(row ?? {}, 'id', 'transaction_id'));
  return {
    success: row?.success !== false,
    id,
    transactionId: asOptionalString(pick(row ?? {}, 'transaction_id', 'id')),
    reference: asOptionalString(pick(row ?? {}, 'reference')),
    amountCents: asNumber(pick(row ?? {}, 'amount', 'amount_cents'), fallbackAmount),
    idempotentReplay: Boolean(row?.idempotent_replay),
  };
}

function failure(error: unknown, fallback: string): string {
  if (typeof error === 'string' && error.length > 0) return error;
  if (error instanceof Error && error.message) return error.message;
  const row = asRecord(error);
  const message = asString(pick(row ?? {}, 'message', 'error_description'), '');
  return message || fallback;
}

function requireId(value: string, _label: string): string | null {
  const clean = (value || '').trim();
  return clean.length > 0 ? clean : null;
}

/** Reads all cards and the simulated credit summary for the signed-in customer. */
export async function fetchMyCards(
  client: SupabaseClient
): Promise<{ data: MyCards | null; error: string | null }> {
  try {
    const { data, error } = await client.rpc('get_my_cards');
    if (error) return { data: null, error: failure(error, 'Cards could not be loaded') };
    return { data: normalizeMyCards(data), error: null };
  } catch (err) {
    return { data: null, error: failure(err, 'Cards could not be loaded') };
  }
}

/** Reads one owned credit statement with its derived payment totals. */
export async function fetchCardStatement(
  client: SupabaseClient,
  statementId: string
): Promise<{ data: CardStatement | null; error: string | null }> {
  const id = requireId(statementId, 'statement');
  if (!id) return { data: null, error: 'Statement is required' };
  try {
    const { data, error } = await client.rpc('get_my_card_statement', {
      p_statement_id: id,
    });
    if (error)
      return { data: null, error: failure(error, 'Statement could not be loaded') };
    const row = Array.isArray(data) ? data[0] : data;
    return { data: normalizeStatement(row), error: null };
  } catch (err) {
    return { data: null, error: failure(err, 'Statement could not be loaded') };
  }
}

/** Reads card-related activity with server-produced, readable labels. */
export async function fetchCardTransactions(
  client: SupabaseClient,
  limit = 50
): Promise<{ data: CardTransaction[] | null; error: string | null }> {
  try {
    const { data, error } = await client.rpc('get_my_card_transactions', {
      p_limit: limit,
    });
    if (error)
      return { data: null, error: failure(error, 'Card activity could not be loaded') };
    const rows = Array.isArray(data) ? data : [];
    return {
      data: rows
        .map(normalizeCardTransaction)
        .filter((row): row is CardTransaction => row !== null),
      error: null,
    };
  } catch (err) {
    return { data: null, error: failure(err, 'Card activity could not be loaded') };
  }
}

/** Reveals transient fake PAN/CVV after the server's step-up guard succeeds. */
export async function revealCardSecrets(
  client: SupabaseClient,
  cardId: string
): Promise<{ data: RevealedCardSecrets | null; error: string | null }> {
  const id = requireId(cardId, 'card');
  if (!id) return { data: null, error: 'Card is required' };
  try {
    const { data, error } = await client.rpc('reveal_card_secrets', { p_card_id: id });
    if (error)
      return { data: null, error: failure(error, 'Card details could not be revealed') };
    const row = Array.isArray(data) ? data[0] : data;
    const record = asRecord(row);
    if (!record || !asString(pick(record, 'pan'))) {
      return { data: null, error: 'Card details could not be revealed' };
    }
    return {
      data: {
        pan: asString(pick(record, 'pan')),
        cvv: asString(pick(record, 'cvv')),
        expiry: asString(pick(record, 'expiry')),
        display_until: asOptionalString(pick(record, 'display_until')),
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: failure(err, 'Card details could not be revealed') };
  }
}

/** Freezes or unfreezes a card. The RPC enforces step-up and writes the audit row. */
export async function setCardFrozen(
  client: SupabaseClient,
  cardId: string,
  frozen: boolean,
  previous: Partial<DigitalDebitCard> = {}
): Promise<{ data: CardControlResult | null; error: string | null }> {
  const id = requireId(cardId, 'card');
  if (!id) return { data: null, error: 'Card is required' };
  try {
    const { data, error } = await client.rpc('set_card_frozen', {
      p_card_id: id,
      p_frozen: frozen,
    });
    if (error) return { data: null, error: failure(error, 'Card could not be updated') };
    return {
      data: normalizeControlResult(data, id, {
        ...previous,
        status: frozen ? 'frozen' : 'active',
      }),
      error: null,
    };
  } catch (err) {
    return { data: null, error: failure(err, 'Card could not be updated') };
  }
}

/** Changes the online-purchases toggle through the audited control RPC. */
export async function setCardOnlinePurchases(
  client: SupabaseClient,
  cardId: string,
  enabled: boolean,
  previous: Partial<DigitalDebitCard> = {}
): Promise<{ data: CardControlResult | null; error: string | null }> {
  const id = requireId(cardId, 'card');
  if (!id) return { data: null, error: 'Card is required' };
  try {
    const { data, error } = await client.rpc('set_card_online_purchases', {
      p_card_id: id,
      p_enabled: enabled,
    });
    if (error) return { data: null, error: failure(error, 'Card could not be updated') };
    return {
      data: normalizeControlResult(data, id, {
        ...previous,
        online_purchases_enabled: enabled,
      }),
      error: null,
    };
  } catch (err) {
    return { data: null, error: failure(err, 'Card could not be updated') };
  }
}

/** Changes the additional card-day cap (never above the engine ceiling). */
export async function setCardDailyLimit(
  client: SupabaseClient,
  cardId: string,
  limitCents: number,
  previous: Partial<DigitalDebitCard> = {}
): Promise<{ data: CardControlResult | null; error: string | null }> {
  const id = requireId(cardId, 'card');
  if (!id) return { data: null, error: 'Card is required' };
  if (!Number.isInteger(limitCents) || limitCents <= 0 || limitCents > 500000000) {
    return { data: null, error: 'Daily limit must be between ₱0.01 and ₱5,000,000.00' };
  }
  try {
    const { data, error } = await client.rpc('set_card_daily_limit', {
      p_card_id: id,
      p_limit_cents: limitCents,
    });
    if (error)
      return { data: null, error: failure(error, 'Card limit could not be updated') };
    return {
      data: normalizeControlResult(data, id, {
        ...previous,
        daily_limit_cents: limitCents,
      }),
      error: null,
    };
  } catch (err) {
    return { data: null, error: failure(err, 'Card limit could not be updated') };
  }
}

/** Supersedes the current debit card with a fresh fake, Luhn-invalid card. */
export async function replaceCard(
  client: SupabaseClient
): Promise<{ data: CardControlResult | null; error: string | null }> {
  try {
    const { data, error } = await client.rpc('replace_card');
    if (error) return { data: null, error: failure(error, 'Card could not be replaced') };
    return {
      data: normalizeControlResult(data, '', { status: 'active' }),
      error: null,
    };
  } catch (err) {
    return { data: null, error: failure(err, 'Card could not be replaced') };
  }
}

/**
 * Pays a simulated credit statement through the existing `pay_bill` RPC.
 * No new money RPC and no client-side balance write.
 */
export async function payCardBill(
  client: SupabaseClient,
  params: PayCardBillParams
): Promise<{ data: CardPaymentResult | null; error: string | null }> {
  const from = requireId(params.fromAccountId, 'account');
  const biller = requireId(params.billerId, 'biller');
  const reference = (params.reference || '').trim();
  const key = (params.idempotencyKey || '').trim();
  if (!from || !biller || !reference || !key) {
    return { data: null, error: 'Payment details are incomplete' };
  }
  if (!Number.isInteger(params.amountCents) || params.amountCents <= 0) {
    return { data: null, error: 'Enter an amount greater than zero' };
  }
  try {
    const { data, error } = await client.rpc('pay_bill', {
      p_from_account: from,
      p_biller_id: biller,
      p_biller_reference: reference,
      p_amount: params.amountCents,
      p_idempotency_key: key,
    });
    if (error)
      return { data: null, error: failure(error, 'Card payment could not be completed') };
    return {
      data: normalizePaymentResult(data, params.amountCents),
      error: null,
    };
  } catch (err) {
    return { data: null, error: failure(err, 'Card payment could not be completed') };
  }
}

/**
 * Optional demo merchant purchase: `pay_demo_merchant` delegates to the
 * unchanged transfer engine, so all Bantay guards and idempotency still apply.
 */
export async function payDemoMerchant(
  client: SupabaseClient,
  params: PayDemoMerchantParams
): Promise<{ data: CardPaymentResult | null; error: string | null }> {
  const merchant = requireId(params.merchantId, 'merchant');
  const from = requireId(params.fromAccountId, 'account');
  const key = (params.idempotencyKey || '').trim();
  if (!merchant || !from || !key) {
    return { data: null, error: 'Payment details are incomplete' };
  }
  if (!Number.isInteger(params.amountCents) || params.amountCents <= 0) {
    return { data: null, error: 'Enter an amount greater than zero' };
  }
  try {
    const { data, error } = await client.rpc('pay_demo_merchant', {
      p_merchant_id: merchant,
      p_from_account: from,
      p_amount_cents: params.amountCents,
      p_idempotency_key: key,
    });
    if (error)
      return { data: null, error: failure(error, 'Card payment could not be completed') };
    return {
      data: normalizePaymentResult(data, params.amountCents),
      error: null,
    };
  } catch (err) {
    return { data: null, error: failure(err, 'Card payment could not be completed') };
  }
}
