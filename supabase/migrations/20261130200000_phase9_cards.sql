-- Phase 9 · Stage 9H — Cards backend
--
-- Local-only implementation of docs/specs/phase-9-cards-backend.md (commit
-- phase-9-card-invest-design). One simulated digital debit card linked to a
-- customer's PHP savings account, one simulated credit card backed by a seeded
-- demo biller, and server-enforced controls. No real PAN or CVV exists: every
-- number is a generator-produced, Luhn-invalid fake value. Only fake values
-- are encrypted at rest, and only the step-up reveal RPC decrypts them.
--
-- Money moves ONLY through public.transfer / public.pay_bill and therefore the
-- unchanged _transfer_core. Nothing here changes the ledger, idempotency keys
-- or run_due_scheduled_payments.

create extension if not exists pgcrypto;

-- Server-side key material. On a hosted Supabase project this prefers a Vault
-- secret named "phase9_cards_key"; the generated database GUC is the fallback
-- used by local PGlite runs and by seeding. The key protects fake values only.
do $$
declare
  v_key text;
begin
  v_key := nullif(current_setting('app.cards_encryption_key', true), '');
  if coalesce(v_key, '') = '' then
    v_key := md5(gen_random_uuid()::text || gen_random_uuid()::text || clock_timestamp()::text);
    perform set_config('app.cards_encryption_key', v_key, false);
    execute format('alter database %I set app.cards_encryption_key = %L', current_database(), v_key);
  end if;
  if to_regclass('vault.decrypted_secrets') is not null then
    begin
      execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 order by created_at desc limit 1'
        into v_key using 'phase9_cards_key';
    exception when others then
      v_key := nullif(current_setting('app.cards_encryption_key', true), '');
    end;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.digital_debit_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  linked_account_id uuid not null references public.accounts(id),
  masked_last4 text not null check (masked_last4 ~ '^[0-9]{4}$'),
  expiry_month smallint not null check (expiry_month between 1 and 12),
  expiry_year smallint not null check (expiry_year between 2026 and 2100),
  status text not null default 'active' check (status in ('active', 'frozen', 'replaced')),
  online_purchases_enabled boolean not null default true,
  daily_limit_cents bigint not null check (daily_limit_cents > 0 and daily_limit_cents <= 500000000),
  pan_ciphertext bytea not null,
  cvv_ciphertext bytea not null,
  replaced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists digital_debit_cards_one_usable_per_account
  on public.digital_debit_cards (linked_account_id)
  where status in ('active', 'frozen');
create index if not exists digital_debit_cards_user_id_idx
  on public.digital_debit_cards (user_id);

create table if not exists public.demo_merchants (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null check (category in ('retail', 'food', 'online', 'other')),
  settlement_account_id uuid not null unique references public.accounts(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.credit_cards (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  -- The demo biller is shared by all customers; one card per owner is
  -- enforced by the user_id primary key, not by a unique biller_id.
  biller_id uuid not null references public.billers(id),
  masked_last4 text not null check (masked_last4 ~ '^[0-9]{4}$'),
  credit_limit_cents bigint not null check (credit_limit_cents > 0),
  status text not null default 'active' check (status in ('active', 'frozen', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_card_statements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.credit_cards(user_id) on delete cascade,
  period_start date not null,
  period_end date not null,
  issued_at timestamptz not null default now(),
  due_date date not null,
  total_due_cents bigint not null check (total_due_cents > 0),
  minimum_due_cents bigint not null check (minimum_due_cents > 0 and minimum_due_cents <= total_due_cents),
  payment_reference text not null unique check (payment_reference ~ '^DBCC-[0-9]{8}$'),
  constraint credit_card_statements_period_check check (period_end >= period_start)
);

create index if not exists credit_cards_biller_id_idx
  on public.credit_cards (biller_id);
create index if not exists credit_card_statements_user_id_idx
  on public.credit_card_statements (user_id);

-- ---------------------------------------------------------------------------
-- RLS: owners read masked metadata; there are no client write grants.
-- ---------------------------------------------------------------------------

alter table public.digital_debit_cards enable row level security;
alter table public.demo_merchants enable row level security;
alter table public.credit_cards enable row level security;
alter table public.credit_card_statements enable row level security;

revoke all on public.digital_debit_cards from public, anon, authenticated;
revoke all on public.demo_merchants from public, anon, authenticated;
revoke all on public.credit_cards from public, anon, authenticated;
revoke all on public.credit_card_statements from public, anon, authenticated;
grant select on public.digital_debit_cards to authenticated;
grant select on public.demo_merchants to authenticated;
grant select on public.credit_cards to authenticated;
grant select on public.credit_card_statements to authenticated;
grant all on public.digital_debit_cards to service_role;
grant all on public.demo_merchants to service_role;
grant all on public.credit_cards to service_role;
grant all on public.credit_card_statements to service_role;

drop policy if exists "phase9_cards_debit_select_own" on public.digital_debit_cards;
create policy "phase9_cards_debit_select_own"
  on public.digital_debit_cards for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "phase9_cards_merchant_select_active" on public.demo_merchants;
create policy "phase9_cards_merchant_select_active"
  on public.demo_merchants for select to authenticated
  using (is_active = true);

drop policy if exists "phase9_cards_credit_select_own" on public.credit_cards;
create policy "phase9_cards_credit_select_own"
  on public.credit_cards for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "phase9_cards_statement_select_own" on public.credit_card_statements;
create policy "phase9_cards_statement_select_own"
  on public.credit_card_statements for select to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Internal helpers (never executable by client roles)
-- ---------------------------------------------------------------------------

create or replace function public._phase9_cards_key()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  v_key := nullif(current_setting('app.cards_encryption_key', true), '');
  if v_key is null and to_regclass('vault.decrypted_secrets') is not null then
    begin
      execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 order by created_at desc limit 1'
        into v_key using 'phase9_cards_key';
    exception when others then
      v_key := null;
    end;
  end if;
  if coalesce(v_key, '') = '' then
    raise exception 'PHASE9_CARDS_KEY_MISSING';
  end if;
  return v_key;
end;
$$;

create or replace function public._phase9_cards_encrypt(p_value text)
returns bytea
language sql
stable
security definer
set search_path = public, extensions
as $$
  select pgp_sym_encrypt(p_value, public._phase9_cards_key());
$$;

create or replace function public._phase9_cards_decrypt(p_value bytea)
returns text
language sql
stable
security definer
set search_path = public, extensions
as $$
  select pgp_sym_decrypt(p_value, public._phase9_cards_key());
$$;

-- Luhn check digit for a digit-only body. Doubling starts at the rightmost
-- digit, as required when appending a check digit.
create or replace function public._phase9_luhn_check_digit(p_body text)
returns integer
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_sum integer := 0;
  v_digit integer;
  v_double boolean := true;
  i integer;
begin
  if p_body is null or p_body !~ '^[0-9]+$' then
    raise exception 'PHASE9_CARDS_INVALID_LUHN_BODY';
  end if;
  for i in reverse length(p_body)..1 loop
    v_digit := substring(p_body from i for 1)::integer;
    if v_double then
      v_digit := v_digit * 2;
      if v_digit > 9 then
        v_digit := v_digit - 9;
      end if;
    end if;
    v_sum := v_sum + v_digit;
    v_double := not v_double;
  end loop;
  return (10 - (v_sum % 10)) % 10;
end;
$$;

-- 9900 0000 0000 00N with a deliberately wrong final digit (correct Luhn
-- check digit + 1 mod 10). All 100 values fail Luhn by construction.
create or replace function public._phase9_fake_pan(p_seed integer)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select '99000000000000' || ((greatest(0, least(9, coalesce(p_seed, 0))))::text)
         || (((public._phase9_luhn_check_digit('99000000000000' || greatest(0, least(9, coalesce(p_seed, 0)))::text) + 1) % 10)::text);
$$;

create or replace function public._phase9_fake_cvv(p_seed integer)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select lpad((((abs(coalesce(p_seed, 0)) * 37 + 123) % 900) + 100)::text, 3, '0');
$$;

create or replace function public._phase9_cards_spend_today(p_account_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(le.amount), 0)::bigint
  from public.ledger_entries le
  join public.demo_merchants m on m.settlement_account_id = le.account_id
  join public.transfers tr on tr.transaction_id = le.transaction_id
  where le.direction = 'credit'
    and tr.from_account = p_account_id
    and le.created_at >= (((now() at time zone 'Asia/Manila')::date)::timestamp at time zone 'Asia/Manila');
$$;

create or replace function public._phase9_cards_paid_for_statement(p_statement_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_biller_account uuid;
  v_paid bigint := 0;
begin
  select s.user_id, b.account_id
    into v_user_id, v_biller_account
  from public.credit_card_statements s
  join public.credit_cards cc on cc.user_id = s.user_id
  join public.billers b on b.id = cc.biller_id
  where s.id = p_statement_id;

  if not found then
    return 0;
  end if;

  -- A paid statement is derived from ledger movement only. Reversals carry
  -- opposite entries and are included through reverses_transaction_id, so an
  -- admin reversal restores the amount due without storing a card balance.
  with originals as (
    select bp.transaction_id
    from public.bill_payments bp
    join public.accounts a on a.id = bp.payer_account
    where bp.biller_reference = (
        select payment_reference from public.credit_card_statements where id = p_statement_id
      )
      and a.user_id = v_user_id
  ), relevant as (
    select transaction_id as id from originals
    union
    select t.id
    from public.transactions t
    join originals o on o.transaction_id = t.reverses_transaction_id
  )
  select coalesce(sum(case when le.direction = 'credit' then le.amount else -le.amount end), 0)::bigint
    into v_paid
  from public.ledger_entries le
  join relevant r on r.id = le.transaction_id
  where le.account_id = v_biller_account;

  return v_paid;
end;
$$;

-- Customer copy uses the same shape as packages/shared formatReferenceId().
create or replace function public._phase9_format_reference(p_id uuid)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select 'DB-'
    || upper(substring(regexp_replace(p_id::text, '[^a-zA-Z0-9]', '', 'g') from 1 for 4))
    || '-'
    || upper(substring(regexp_replace(p_id::text, '[^a-zA-Z0-9]', '', 'g') from 5 for 4));
$$;

create or replace function public._phase9_cards_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_phase9_cards_debit_touch on public.digital_debit_cards;
create trigger trg_phase9_cards_debit_touch
  before update on public.digital_debit_cards
  for each row execute function public._phase9_cards_touch_updated_at();

drop trigger if exists trg_phase9_cards_credit_touch on public.credit_cards;
create trigger trg_phase9_cards_credit_touch
  before update on public.credit_cards
  for each row execute function public._phase9_cards_touch_updated_at();

-- A card may only link a caller-owned, active PHP savings account.
create or replace function public._phase9_cards_check_linked_account()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_owner uuid;
  v_type text;
  v_currency text;
  v_status text;
begin
  select user_id, type, currency, status
    into v_owner, v_type, v_currency, v_status
  from public.accounts
  where id = new.linked_account_id;

  if not found then
    raise exception 'Linked account not found';
  end if;
  if v_owner <> new.user_id then
    raise exception 'Linked account does not belong to the card owner';
  end if;
  if v_type <> 'savings' or v_currency <> 'PHP' or v_status <> 'active' then
    raise exception 'Card requires an active PHP savings account';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_phase9_cards_check_linked_account on public.digital_debit_cards;
create trigger trg_phase9_cards_check_linked_account
  before insert or update of linked_account_id, user_id on public.digital_debit_cards
  for each row execute function public._phase9_cards_check_linked_account();

revoke all on function public._phase9_cards_key() from public, anon, authenticated, service_role;
revoke all on function public._phase9_cards_encrypt(text) from public, anon, authenticated, service_role;
revoke all on function public._phase9_cards_decrypt(bytea) from public, anon, authenticated, service_role;
revoke all on function public._phase9_luhn_check_digit(text) from public, anon, authenticated, service_role;
revoke all on function public._phase9_fake_pan(integer) from public, anon, authenticated, service_role;
revoke all on function public._phase9_fake_cvv(integer) from public, anon, authenticated, service_role;
revoke all on function public._phase9_cards_spend_today(uuid) from public, anon, authenticated, service_role;
revoke all on function public._phase9_cards_paid_for_statement(uuid) from public, anon, authenticated, service_role;
revoke all on function public._phase9_format_reference(uuid) from public, anon, authenticated, service_role;
revoke all on function public._phase9_cards_touch_updated_at() from public, anon, authenticated, service_role;
revoke all on function public._phase9_cards_check_linked_account() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Customer read RPCs (no step-up; owner-scoped, masked data only)
-- ---------------------------------------------------------------------------

create or replace function public.get_my_cards()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_debits jsonb;
  v_credit jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', d.id,
      'masked_last4', d.masked_last4,
      'display_number', '•••• ' || d.masked_last4,
      'expiry_month', d.expiry_month,
      'expiry_year', d.expiry_year,
      'status', d.status,
      'online_purchases_enabled', d.online_purchases_enabled,
      'daily_limit_cents', d.daily_limit_cents,
      'remaining_daily_cents', greatest(d.daily_limit_cents - public._phase9_cards_spend_today(d.linked_account_id), 0),
      'linked_account_last4', right(a.account_number, 4)
    ) order by d.created_at), '[]'::jsonb)
  into v_debits
  from public.digital_debit_cards d
  join public.accounts a on a.id = d.linked_account_id
  where d.user_id = v_uid;

  select jsonb_build_object(
      'masked_last4', cc.masked_last4,
      'display_number', '•••• ' || cc.masked_last4,
      'credit_limit_cents', cc.credit_limit_cents,
      'status', cc.status,
      'amount_due_cents', coalesce((
        select sum(greatest(s.total_due_cents - public._phase9_cards_paid_for_statement(s.id), 0))
        from public.credit_card_statements s where s.user_id = v_uid
      ), 0),
      'available_credit_cents', greatest(cc.credit_limit_cents - coalesce((
        select sum(greatest(s.total_due_cents - public._phase9_cards_paid_for_statement(s.id), 0))
        from public.credit_card_statements s where s.user_id = v_uid
      ), 0), 0)
    )
  into v_credit
  from public.credit_cards cc
  where cc.user_id = v_uid;

  return jsonb_build_object(
    'debit_cards', v_debits,
    'credit_card', v_credit,
    'notice', 'Simulation — virtual card. Payments use play money and a demo biller; no credit is extended.'
  );
end;
$$;

create or replace function public.get_my_card_statement(p_statement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row record;
  v_paid bigint;
  v_payments jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select s.*, cc.masked_last4, cc.credit_limit_cents
    into v_row
  from public.credit_card_statements s
  join public.credit_cards cc on cc.user_id = s.user_id
  where s.id = p_statement_id and s.user_id = v_uid;

  if not found then
    return null;
  end if;

  v_paid := public._phase9_cards_paid_for_statement(p_statement_id);

  select coalesce(jsonb_agg(jsonb_build_object(
      'reference_id', public._phase9_format_reference(t.id),
      'label', 'Card payment · Davao Bank Card (simulation)',
      'amount_cents', le.amount,
      'created_at', t.created_at
    ) order by t.created_at desc), '[]'::jsonb)
  into v_payments
  from public.bill_payments bp
  join public.billers b on b.id = bp.biller_id
  join public.transactions t on t.id = bp.transaction_id
  join public.ledger_entries le on le.transaction_id = t.id and le.direction = 'debit' and le.account_id = bp.payer_account
  where bp.biller_reference = v_row.payment_reference
    and bp.payer_account in (select id from public.accounts where user_id = v_uid);

  return jsonb_build_object(
    'id', v_row.id,
    'masked_last4', v_row.masked_last4,
    'period_start', v_row.period_start,
    'period_end', v_row.period_end,
    'issued_at', v_row.issued_at,
    'due_date', v_row.due_date,
    'total_due_cents', v_row.total_due_cents,
    'minimum_due_cents', v_row.minimum_due_cents,
    'paid_cents', v_paid,
    'amount_due_cents', greatest(v_row.total_due_cents - v_paid, 0),
    'payment_reference', v_row.payment_reference,
    'payments', v_payments
  );
end;
$$;

create or replace function public.get_my_card_transactions(p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  with raw_rows as (
    select
      t.created_at,
      jsonb_build_object(
        'reference_id', public._phase9_format_reference(t.id),
        'type', 'card_merchant_payment',
        'label', 'Card merchant payment · ' || m.name,
        'amount_cents', le.amount,
        'created_at', t.created_at
      ) as item
    from public.transfers tr
    join public.transactions t on t.id = tr.transaction_id
    join public.accounts a on a.id = tr.from_account
    join public.demo_merchants m on m.settlement_account_id = tr.to_account
    join public.ledger_entries le on le.transaction_id = t.id and le.account_id = tr.from_account and le.direction = 'debit'
    where a.user_id = v_uid and t.reference like 'Card merchant:%'
    union all
    select
      t.created_at,
      jsonb_build_object(
        'reference_id', public._phase9_format_reference(t.id),
        'type', 'card_payment',
        'label', 'Card payment · Davao Bank Card (simulation)',
        'amount_cents', le.amount,
        'created_at', t.created_at
      ) as item
    from public.bill_payments bp
    join public.billers b on b.id = bp.biller_id
    join public.credit_cards cc on cc.biller_id = b.id
    join public.accounts a on a.id = bp.payer_account
    join public.transactions t on t.id = bp.transaction_id
    join public.ledger_entries le on le.transaction_id = t.id and le.account_id = bp.payer_account and le.direction = 'debit'
    where a.user_id = v_uid and cc.user_id = v_uid
  ), limited as (
    select item, created_at from raw_rows order by created_at desc limit v_limit
  )
  select coalesce(jsonb_agg(item order by created_at desc), '[]'::jsonb)
    into v_result
  from limited;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sensitive controls: all require money step-up, all audited without values
-- ---------------------------------------------------------------------------

create or replace function public.reveal_card_secrets(p_card_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_card record;
  v_pan text;
  v_cvv text;
begin
  perform public.assert_money_step_up();
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_card
  from public.digital_debit_cards
  where id = p_card_id and user_id = v_uid and status in ('active', 'frozen');

  if not found then
    return null;
  end if;

  v_pan := public._phase9_cards_decrypt(v_card.pan_ciphertext);
  v_cvv := public._phase9_cards_decrypt(v_card.cvv_ciphertext);

  perform public.write_audit(
    'card_secrets_revealed', 'digital_debit_cards', v_card.id::text,
    jsonb_build_object('card_id', v_card.id, 'linked_account_id', v_card.linked_account_id, 'result', 'shown')
  );

  return jsonb_build_object(
    'pan', v_pan,
    'cvv', v_cvv,
    'expiry', lpad(v_card.expiry_month::text, 2, '0') || '/' || right(v_card.expiry_year::text, 2),
    'display_until', now() + interval '30 seconds'
  );
end;
$$;

create or replace function public.set_card_frozen(p_card_id uuid, p_frozen boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_card record;
  v_status text;
begin
  perform public.assert_money_step_up();
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_card
  from public.digital_debit_cards
  where id = p_card_id and user_id = v_uid and status in ('active', 'frozen');

  if not found then
    return null;
  end if;

  v_status := case when p_frozen then 'frozen' else 'active' end;
  update public.digital_debit_cards set status = v_status where id = v_card.id;

  perform public.write_audit(
    case when p_frozen then 'card_frozen' else 'card_unfrozen' end,
    'digital_debit_cards', v_card.id::text,
    jsonb_build_object('card_id', v_card.id, 'from_status', v_card.status, 'to_status', v_status)
  );

  return jsonb_build_object('id', v_card.id, 'status', v_status);
end;
$$;

create or replace function public.set_card_online_purchases(p_card_id uuid, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_card record;
begin
  perform public.assert_money_step_up();
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_card
  from public.digital_debit_cards
  where id = p_card_id and user_id = v_uid and status in ('active', 'frozen');

  if not found then
    return null;
  end if;

  update public.digital_debit_cards
    set online_purchases_enabled = p_enabled
  where id = v_card.id;

  perform public.write_audit(
    'card_online_purchases_changed', 'digital_debit_cards', v_card.id::text,
    jsonb_build_object('card_id', v_card.id, 'enabled', p_enabled)
  );

  return jsonb_build_object('id', v_card.id, 'online_purchases_enabled', p_enabled);
end;
$$;

create or replace function public.set_card_daily_limit(p_card_id uuid, p_limit_cents bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_card record;
begin
  perform public.assert_money_step_up();
  if p_limit_cents is null or p_limit_cents <= 0 or p_limit_cents > 500000000 then
    raise exception 'Daily limit must be between 1 and 500000000 centavos';
  end if;
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_card
  from public.digital_debit_cards
  where id = p_card_id and user_id = v_uid and status in ('active', 'frozen');

  if not found then
    return null;
  end if;

  update public.digital_debit_cards set daily_limit_cents = p_limit_cents where id = v_card.id;

  perform public.write_audit(
    'card_daily_limit_changed', 'digital_debit_cards', v_card.id::text,
    jsonb_build_object('card_id', v_card.id, 'from_cents', v_card.daily_limit_cents, 'to_cents', p_limit_cents)
  );

  return jsonb_build_object('id', v_card.id, 'daily_limit_cents', p_limit_cents);
end;
$$;

create or replace function public.replace_card()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_old record;
  v_new_id uuid;
  v_seed integer;
  v_pan text;
begin
  perform public.assert_money_step_up();
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_old
  from public.digital_debit_cards
  where user_id = v_uid and status in ('active', 'frozen')
  order by created_at desc limit 1;

  if not found then
    return null;
  end if;

  update public.digital_debit_cards
    set status = 'replaced', replaced_at = now()
  where id = v_old.id;

  v_seed := (right(v_old.masked_last4, 1)::integer + 1 + floor(random() * 9)::integer) % 10;
  v_pan := public._phase9_fake_pan(v_seed);

  insert into public.digital_debit_cards (
    user_id, linked_account_id, masked_last4, expiry_month, expiry_year,
    status, online_purchases_enabled, daily_limit_cents, pan_ciphertext, cvv_ciphertext
  ) values (
    v_old.user_id, v_old.linked_account_id, right(v_pan, 4),
    v_old.expiry_month, v_old.expiry_year, 'active', true,
    v_old.daily_limit_cents,
    public._phase9_cards_encrypt(v_pan),
    public._phase9_cards_encrypt(public._phase9_fake_cvv(v_seed))
  )
  returning id into v_new_id;

  perform public.write_audit(
    'card_replaced', 'digital_debit_cards', v_new_id::text,
    jsonb_build_object('old_card_id', v_old.id, 'new_card_id', v_new_id, 'linked_account_id', v_old.linked_account_id)
  );

  return jsonb_build_object(
    'id', v_new_id,
    'masked_last4', right(v_pan, 4),
    'display_number', '•••• ' || right(v_pan, 4),
    'status', 'active'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Debit card demo merchant payment: validates controls, then uses transfer
-- ---------------------------------------------------------------------------

create or replace function public.pay_demo_merchant(
  p_merchant_id uuid,
  p_from_account uuid,
  p_amount_cents bigint,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_merchant record;
  v_card record;
  v_remaining bigint;
  v_result jsonb;
begin
  perform public.assert_money_step_up();
  if v_uid is null then
    raise exception 'Authentication required';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 500000000 then
    raise exception 'Invalid amount';
  end if;

  select * into v_merchant
  from public.demo_merchants
  where id = p_merchant_id and is_active = true;
  if not found then
    raise exception 'Demo merchant not found';
  end if;

  select d.* into v_card
  from public.digital_debit_cards d
  join public.accounts a on a.id = d.linked_account_id
  where d.linked_account_id = p_from_account
    and a.user_id = v_uid
    and a.status = 'active'
    and a.currency = 'PHP'
    and a.type = 'savings'
    and d.user_id = v_uid
    and d.status = 'active';

  if not found then
    raise exception 'No active card is linked to this account';
  end if;
  if v_merchant.category = 'online' and not v_card.online_purchases_enabled then
    raise exception 'Online purchases are turned off for this card';
  end if;

  v_remaining := greatest(v_card.daily_limit_cents - public._phase9_cards_spend_today(v_card.linked_account_id), 0);
  if p_amount_cents > v_remaining then
    raise exception 'Card daily limit reached';
  end if;

  perform public.write_audit(
    'card_merchant_payment_started', 'digital_debit_cards', v_card.id::text,
    jsonb_build_object(
      'card_id', v_card.id, 'merchant_id', v_merchant.id,
      'amount_cents', p_amount_cents, 'idempotency_key', p_idempotency_key
    )
  );

  v_result := public.transfer(
    p_from_account,
    v_merchant.settlement_account_id,
    p_amount_cents,
    p_idempotency_key,
    'Card merchant: ' || v_merchant.name
  );
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers: defense in depth for cards, no new money RPC for credit
-- ---------------------------------------------------------------------------

create or replace function public.enforce_card_merchant_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant record;
  v_from_account uuid;
  v_idempotency_key text;
  v_initiated_by uuid;
  v_card record;
  v_spent bigint;
begin
  if new.direction <> 'credit' then
    return new;
  end if;

  select * into v_merchant
  from public.demo_merchants
  where settlement_account_id = new.account_id and is_active = true;
  if not found then
    return new;
  end if;

  select tr.from_account, t.idempotency_key, t.initiated_by
    into v_from_account, v_idempotency_key, v_initiated_by
  from public.transfers tr
  join public.transactions t on t.id = tr.transaction_id
  where tr.transaction_id = new.transaction_id;
  if not found then
    raise exception 'Card merchant settlement requires a card transfer';
  end if;

  select d.* into v_card
  from public.digital_debit_cards d
  join public.accounts a on a.id = d.linked_account_id
  where d.linked_account_id = v_from_account
    and a.user_id = d.user_id
    and d.status in ('active', 'frozen')
  order by d.created_at desc limit 1;

  if not found or v_card.status <> 'active' then
    raise exception 'Card is frozen, replaced or missing for this merchant payment';
  end if;

  -- pay_demo_merchant writes an audited intent before calling the unchanged
  -- transfer RPC. A bare transfer to a merchant account has no such intent and
  -- cannot settle, even if it impersonates the reference text.
  if not exists (
    select 1
    from public.audit_logs al
    where al.action = 'card_merchant_payment_started'
      and al.entity = 'digital_debit_cards'
      and al.entity_id = v_card.id::text
      and al.actor_id = v_initiated_by
      and al.metadata->>'idempotency_key' = v_idempotency_key
      and al.metadata->>'merchant_id' = v_merchant.id::text
      and (al.metadata->>'amount_cents')::bigint = new.amount
  ) then
    raise exception 'Card merchant settlement requires the card payment RPC';
  end if;

  if v_merchant.category = 'online' and not v_card.online_purchases_enabled then
    raise exception 'Online purchases are turned off for this card';
  end if;

  select coalesce(sum(le.amount), 0)::bigint
    into v_spent
  from public.ledger_entries le
  join public.demo_merchants m on m.settlement_account_id = le.account_id
  join public.transfers tr on tr.transaction_id = le.transaction_id
  where le.direction = 'credit'
    and tr.from_account = v_card.linked_account_id
    and le.created_at >= (((now() at time zone 'Asia/Manila')::date)::timestamp at time zone 'Asia/Manila');

  if v_spent > v_card.daily_limit_cents then
    raise exception 'Card daily limit reached';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_phase9_cards_enforce_merchant on public.ledger_entries;
create trigger trg_phase9_cards_enforce_merchant
  after insert on public.ledger_entries
  for each row execute function public.enforce_card_merchant_rules();

create or replace function public.enforce_credit_card_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card record;
  v_statement record;
  v_biller_account uuid;
  v_payer_owner uuid;
  v_payment_amount bigint;
  v_prior_paid bigint;
begin
  if exists (select 1 from public.bill_payments where transaction_id = new.transaction_id) then
    return new;
  end if;

  select cc.* into v_card
  from public.credit_cards cc
  where cc.biller_id = new.biller_id;
  if not found then
    return new;
  end if;

  select s.* into v_statement
  from public.credit_card_statements s
  where s.user_id = v_card.user_id and s.payment_reference = new.biller_reference;
  if not found then
    raise exception 'Card statement not found for this reference';
  end if;

  select user_id into v_payer_owner from public.accounts where id = new.payer_account;
  if v_payer_owner is distinct from v_card.user_id then
    raise exception 'Card payment must come from the statement owner''s account';
  end if;

  select account_id into v_biller_account from public.billers where id = new.biller_id;

  select amount into v_payment_amount
  from public.ledger_entries
  where transaction_id = new.transaction_id
    and account_id = v_biller_account
    and direction = 'credit';
  if not found then
    raise exception 'Card payment ledger entry is missing';
  end if;

  -- Net prior payments, including reversals, so a reversed payment frees up
  -- the statement allowance instead of blocking a corrected payment.
  with originals as (
    select bp.transaction_id
    from public.bill_payments bp
    join public.accounts a on a.id = bp.payer_account
    where bp.biller_reference = new.biller_reference
      and a.user_id = v_card.user_id
      and bp.transaction_id <> new.transaction_id
  ), relevant as (
    select transaction_id as id from originals
    union
    select t.id
    from public.transactions t
    join originals o on o.transaction_id = t.reverses_transaction_id
  )
  select coalesce(sum(case when le.direction = 'credit' then le.amount else -le.amount end), 0)::bigint
    into v_prior_paid
  from public.ledger_entries le
  join relevant r on r.id = le.transaction_id
  where le.account_id = v_biller_account;

  if v_prior_paid + v_payment_amount > v_statement.total_due_cents then
    raise exception 'Card payment exceeds the amount due';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_phase9_cards_enforce_credit_payment on public.bill_payments;
create trigger trg_phase9_cards_enforce_credit_payment
  before insert on public.bill_payments
  for each row execute function public.enforce_credit_card_payment();

revoke all on function public.enforce_card_merchant_rules() from public, anon, authenticated, service_role;
revoke all on function public.enforce_credit_card_payment() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Staff views: aal2 first, then admin role. Never PAN/CVV.
-- ---------------------------------------------------------------------------

create or replace function public.admin_list_cards(p_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := auth.uid();
  v_result jsonb;
begin
  perform public.assert_admin_aal2();
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;

  select coalesce(jsonb_agg(item order by sort_key), '[]'::jsonb)
  into v_result
  from (
    select 1 as sort_key, jsonb_build_object(
      'kind', 'debit', 'user_id', d.user_id, 'card_id', d.id,
      'masked_last4', d.masked_last4, 'display_number', '•••• ' || d.masked_last4,
      'status', d.status, 'online_purchases_enabled', d.online_purchases_enabled,
      'daily_limit_cents', d.daily_limit_cents,
      'linked_account_last4', right(a.account_number, 4)
    ) as item
    from public.digital_debit_cards d
    join public.accounts a on a.id = d.linked_account_id
    where p_user_id is null or d.user_id = p_user_id
    union all
    select 2, jsonb_build_object(
      'kind', 'credit', 'user_id', cc.user_id, 'card_id', cc.user_id,
      'masked_last4', cc.masked_last4, 'display_number', '•••• ' || cc.masked_last4,
      'status', cc.status, 'credit_limit_cents', cc.credit_limit_cents
    )
    from public.credit_cards cc
    where p_user_id is null or cc.user_id = p_user_id
  ) cards;

  perform public.write_audit(
    'admin_card_viewed', 'cards', coalesce(p_user_id::text, 'all'),
    jsonb_build_object('staff_id', v_staff, 'target_user_id', p_user_id, 'result', 'masked_only')
  );
  return v_result;
end;
$$;

create or replace function public.admin_get_card_activity(p_user_id uuid, p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_result jsonb;
begin
  perform public.assert_admin_aal2();
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;

  with raw_rows as (
    select t.created_at, jsonb_build_object(
      'reference_id', public._phase9_format_reference(t.id), 'type', 'card_merchant_payment',
      'label', 'Card merchant payment · ' || m.name,
      'amount_cents', le.amount, 'created_at', t.created_at
    ) as item
    from public.transfers tr
    join public.transactions t on t.id = tr.transaction_id
    join public.accounts a on a.id = tr.from_account
    join public.demo_merchants m on m.settlement_account_id = tr.to_account
    join public.ledger_entries le on le.transaction_id = t.id and le.account_id = tr.from_account and le.direction = 'debit'
    where a.user_id = p_user_id and t.reference like 'Card merchant:%'
    union all
    select t.created_at, jsonb_build_object(
      'reference_id', public._phase9_format_reference(t.id), 'type', 'card_payment',
      'label', 'Card payment · Davao Bank Card (simulation)',
      'amount_cents', le.amount, 'created_at', t.created_at
    )
    from public.bill_payments bp
    join public.billers b on b.id = bp.biller_id
    join public.credit_cards cc on cc.biller_id = b.id
    join public.accounts a on a.id = bp.payer_account
    join public.transactions t on t.id = bp.transaction_id
    join public.ledger_entries le on le.transaction_id = t.id and le.account_id = bp.payer_account and le.direction = 'debit'
    where a.user_id = p_user_id and cc.user_id = p_user_id
  ), limited as (
    select item, created_at from raw_rows order by created_at desc limit v_limit
  )
  select coalesce(jsonb_agg(item order by created_at desc), '[]'::jsonb) into v_result from limited;

  perform public.write_audit(
    'admin_card_viewed', 'card_activity', p_user_id::text,
    jsonb_build_object('staff_id', auth.uid(), 'target_user_id', p_user_id, 'result', 'activity_only')
  );
  return v_result;
end;
$$;

create or replace function public.admin_card_summary()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform public.assert_admin_aal2();
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;

  select jsonb_build_object(
    'debit_active', (select count(*) from public.digital_debit_cards where status = 'active'),
    'debit_frozen', (select count(*) from public.digital_debit_cards where status = 'frozen'),
    'debit_replaced', (select count(*) from public.digital_debit_cards where status = 'replaced'),
    'credit_active', (select count(*) from public.credit_cards where status = 'active'),
    'demo_merchant_volume_cents', coalesce((
      select sum(le.amount)
      from public.ledger_entries le
      join public.demo_merchants m on m.settlement_account_id = le.account_id
      where le.direction = 'credit'
    ), 0)
  ) into v_result;

  perform public.write_audit(
    'admin_card_viewed', 'card_summary', 'aggregate',
    jsonb_build_object('staff_id', auth.uid(), 'result', 'aggregate_only')
  );
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Service-role seeding hook (used by scripts/seed.ts and local PGlite tests)
-- ---------------------------------------------------------------------------

create or replace function public.phase9_seed_cards(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_system uuid;
  v_account uuid;
  v_account_no text;
  v_card_account uuid;
  v_biller_id uuid;
  v_biller_account uuid;
  v_merchant_id uuid;
  v_card_id uuid;
  v_credit_masked text;
  v_seed integer;
  v_pan text;
  v_ref text;
  v_period_end date := (now() at time zone 'Asia/Manila')::date;
begin
  select id into v_system from public.profiles where role = 'system' order by created_at limit 1;
  if not found then
    raise exception 'System profile is required to seed card settlement accounts';
  end if;

  select a.id into v_card_account
  from public.accounts a
  where a.user_id = p_user_id and a.type = 'savings' and a.currency = 'PHP' and a.status = 'active'
  order by a.created_at limit 1;
  if not found then
    raise exception 'Customer needs an active PHP savings account before cards can be seeded';
  end if;

  -- Seed the single credit-card demo biller and its system-owned settlement account.
  select id, account_id into v_biller_id, v_biller_account
  from public.billers where name = 'Davao Bank Card (simulation)';
  if not found then
    loop
      v_account_no := '10' || lpad(floor(random() * 100000000)::bigint::text, 8, '0');
      exit when not exists (select 1 from public.accounts where account_number = v_account_no);
    end loop;
    insert into public.accounts (user_id, account_number, type, currency, status)
    values (v_system, v_account_no, 'checking', 'PHP', 'active')
    returning id into v_biller_account;
    insert into public.billers (name, category, account_id, reference_label, reference_pattern, is_active)
    values (
      'Davao Bank Card (simulation)', 'other', v_biller_account,
      'Statement reference', '^DBCC-[0-9]{8}$', true
    )
    returning id into v_biller_id;
  end if;

  -- Seed active demo merchants (one online, to exercise the online toggle).
  if not exists (select 1 from public.demo_merchants where name = 'Durian City Bakery (demo)') then
    loop
      v_account_no := '10' || lpad(floor(random() * 100000000)::bigint::text, 8, '0');
      exit when not exists (select 1 from public.accounts where account_number = v_account_no);
    end loop;
    insert into public.accounts (user_id, account_number, type, currency, status)
    values (v_system, v_account_no, 'checking', 'PHP', 'active')
    returning id into v_account;
    insert into public.demo_merchants (name, category, settlement_account_id, is_active)
    values ('Durian City Bakery (demo)', 'food', v_account, true);
  end if;

  if not exists (select 1 from public.demo_merchants where name = 'Davao Online Market (demo)') then
    loop
      v_account_no := '10' || lpad(floor(random() * 100000000)::bigint::text, 8, '0');
      exit when not exists (select 1 from public.accounts where account_number = v_account_no);
    end loop;
    insert into public.accounts (user_id, account_number, type, currency, status)
    values (v_system, v_account_no, 'checking', 'PHP', 'active')
    returning id into v_account;
    insert into public.demo_merchants (name, category, settlement_account_id, is_active)
    values ('Davao Online Market (demo)', 'online', v_account, true);
  end if;

  -- One usable debit card per account; replacement rows stay for history.
  if not exists (
    select 1 from public.digital_debit_cards
    where linked_account_id = v_card_account and status in ('active', 'frozen')
  ) then
    v_seed := floor(random() * 10)::integer;
    v_pan := public._phase9_fake_pan(v_seed);
    insert into public.digital_debit_cards (
      user_id, linked_account_id, masked_last4, expiry_month, expiry_year,
      status, online_purchases_enabled, daily_limit_cents, pan_ciphertext, cvv_ciphertext
    ) values (
      p_user_id, v_card_account, right(v_pan, 4),
      extract(month from (v_period_end + interval '1 year'))::integer,
      extract(year from (v_period_end + interval '1 year'))::integer,
      'active', true, 50000000,
      public._phase9_cards_encrypt(v_pan),
      public._phase9_cards_encrypt(public._phase9_fake_cvv(v_seed))
    );
  end if;

  -- One simulated credit card per customer, with a display-only demo limit.
  if not exists (select 1 from public.credit_cards where user_id = p_user_id) then
    v_seed := floor(random() * 10)::integer;
    v_pan := public._phase9_fake_pan(v_seed);
    v_credit_masked := right(v_pan, 4);
    insert into public.credit_cards (user_id, biller_id, masked_last4, credit_limit_cents, status)
    values (p_user_id, v_biller_id, v_credit_masked, 15000000, 'active');

    loop
      v_ref := 'DBCC-' || lpad(
        left(regexp_replace(md5(p_user_id::text || clock_timestamp()::text), '[^0-9]', '', 'g'), 8),
        8, '0'
      );
      exit when not exists (select 1 from public.credit_card_statements where payment_reference = v_ref);
    end loop;
    insert into public.credit_card_statements (
      user_id, period_start, period_end, issued_at, due_date,
      total_due_cents, minimum_due_cents, payment_reference
    ) values (
      p_user_id, v_period_end - interval '30 days', v_period_end, now(), v_period_end + interval '15 days',
      1250000, 125000, v_ref
    );
  end if;

  select id into v_card_id
  from public.digital_debit_cards
  where linked_account_id = v_card_account and status in ('active', 'frozen')
  order by created_at desc limit 1;

  return jsonb_build_object(
    'user_id', p_user_id,
    'debit_card_id', v_card_id,
    'debit_masked_last4', (select masked_last4 from public.digital_debit_cards where id = v_card_id),
    'credit_masked_last4', (select masked_last4 from public.credit_cards where user_id = p_user_id),
    'biller_id', v_biller_id,
    'merchant_count', (select count(*) from public.demo_merchants)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on function public.get_my_cards() from public, anon;
revoke all on function public.get_my_card_statement(uuid) from public, anon;
revoke all on function public.get_my_card_transactions(integer) from public, anon;
revoke all on function public.reveal_card_secrets(uuid) from public, anon;
revoke all on function public.set_card_frozen(uuid, boolean) from public, anon;
revoke all on function public.set_card_online_purchases(uuid, boolean) from public, anon;
revoke all on function public.set_card_daily_limit(uuid, bigint) from public, anon;
revoke all on function public.replace_card() from public, anon;
revoke all on function public.pay_demo_merchant(uuid, uuid, bigint, text) from public, anon;
revoke all on function public.admin_list_cards(uuid) from public, anon;
revoke all on function public.admin_get_card_activity(uuid, integer) from public, anon;
revoke all on function public.admin_card_summary() from public, anon;
revoke all on function public.phase9_seed_cards(uuid) from public, anon, authenticated;

grant execute on function public.get_my_cards() to authenticated;
grant execute on function public.get_my_card_statement(uuid) to authenticated;
grant execute on function public.get_my_card_transactions(integer) to authenticated;
grant execute on function public.reveal_card_secrets(uuid) to authenticated;
grant execute on function public.set_card_frozen(uuid, boolean) to authenticated;
grant execute on function public.set_card_online_purchases(uuid, boolean) to authenticated;
grant execute on function public.set_card_daily_limit(uuid, bigint) to authenticated;
grant execute on function public.replace_card() to authenticated;
grant execute on function public.pay_demo_merchant(uuid, uuid, bigint, text) to authenticated;
grant execute on function public.admin_list_cards(uuid) to authenticated;
grant execute on function public.admin_get_card_activity(uuid, integer) to authenticated;
grant execute on function public.admin_card_summary() to authenticated;
grant execute on function public.phase9_seed_cards(uuid) to service_role;
