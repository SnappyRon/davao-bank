-- ==============================================================================
-- Davao Bank — Phase 5 Stage B: Everyday Extras
-- Saved Recipients & Account Statements
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Saved Recipients Table & RLS
-- ------------------------------------------------------------------------------
create table if not exists public.saved_recipients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  account_number text not null,
  nickname text not null check (char_length(nickname) between 1 and 40),
  created_at timestamptz not null default now(),
  constraint uq_saved_recipients_owner_account unique (owner_id, account_number)
);

create index if not exists idx_saved_recipients_owner
  on public.saved_recipients(owner_id);

alter table public.saved_recipients enable row level security;

-- RLS: Owners can view their own saved recipients
create policy "Owners can view own saved recipients"
  on public.saved_recipients
  for select
  to authenticated
  using (owner_id = auth.uid());

-- RLS: Owners can delete their own saved recipients
create policy "Owners can delete own saved recipients"
  on public.saved_recipients
  for delete
  to authenticated
  using (owner_id = auth.uid());

-- RLS: Owners can update nickname only
create policy "Owners can update own saved recipient nickname"
  on public.saved_recipients
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Note: No INSERT policy is created for client roles (public, anon, authenticated).
-- All recipient insertions MUST go through public.add_saved_recipient() for validation & limits.

-- ------------------------------------------------------------------------------
-- 2. add_saved_recipient Server Function (§B.1)
-- Validates active status, limits (max 50, max 20/day), prohibits own-account,
-- and never leaks counterparty name.
-- ------------------------------------------------------------------------------
create or replace function public.add_saved_recipient(
  p_account_number text,
  p_nickname text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_caller_id uuid := auth.uid();
  v_caller_profile record;
  v_target_acc record;
  v_clean_acc_num text;
  v_clean_nick text;
  v_recipient_count integer;
  v_daily_count integer;
  v_new_id uuid;
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  -- 1. Verify caller profile is active
  select * into v_caller_profile
  from public.profiles
  where id = v_caller_id;

  if not found or v_caller_profile.status <> 'active' then
    raise exception 'Your profile is suspended or inactive';
  end if;

  v_clean_acc_num := trim(p_account_number);
  v_clean_nick := trim(p_nickname);

  if char_length(v_clean_nick) < 1 or char_length(v_clean_nick) > 40 then
    raise exception 'Nickname must be between 1 and 40 characters';
  end if;

  -- 2. Limit: at most 50 saved recipients per user
  select count(*) into v_recipient_count
  from public.saved_recipients
  where owner_id = v_caller_id;

  if v_recipient_count >= 50 then
    raise exception 'Cannot save more than 50 recipients';
  end if;

  -- 3. Limit: at most 20 adds per 24 hours
  select count(*) into v_daily_count
  from public.saved_recipients
  where owner_id = v_caller_id
    and created_at >= (now() - interval '24 hours');

  if v_daily_count >= 20 then
    raise exception 'Daily saved recipient limit reached';
  end if;

  -- 4. Target account validation
  select * into v_target_acc
  from public.accounts
  where account_number = v_clean_acc_num;

  if not found or v_target_acc.status <> 'active' then
    raise exception 'Recipient account does not exist or is not active';
  end if;

  -- 5. Prohibit saving own account
  if v_target_acc.user_id = v_caller_id then
    raise exception 'Cannot save your own account as a recipient';
  end if;

  -- 6. Insert saved recipient
  begin
    insert into public.saved_recipients (
      owner_id, account_number, nickname
    ) values (
      v_caller_id, v_clean_acc_num, v_clean_nick
    )
    returning id into v_new_id;
  exception
    when unique_violation then
      raise exception 'Account number % is already saved in your recipients', v_clean_acc_num;
  end;

  -- 7. Audit log (without counterparty user details/name)
  perform public.write_audit(
    'saved_recipient_added',
    'saved_recipients',
    v_new_id::text,
    jsonb_build_object(
      'account_number', v_clean_acc_num,
      'nickname', v_clean_nick
    )
  );

  return jsonb_build_object(
    'success', true,
    'id', v_new_id,
    'account_number', v_clean_acc_num,
    'nickname', v_clean_nick
  );
end;
$$;

grant execute on function public.add_saved_recipient(text, text) to authenticated;

-- ------------------------------------------------------------------------------
-- 3. get_account_statement Server Function (§B.2)
-- Returns reconciled opening balance, period transaction rows, and closing balance.
-- ------------------------------------------------------------------------------
create or replace function public.get_account_statement(
  p_account_id uuid,
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_caller_id uuid := auth.uid();
  v_acc record;
  v_from_ts timestamptz;
  v_to_ts timestamptz;
  v_opening_balance bigint;
  v_closing_balance bigint;
  v_tx_rows jsonb;
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  -- 1. Ownership & permission check
  select * into v_acc
  from public.accounts
  where id = p_account_id;

  if not found then
    raise exception 'Account not found';
  end if;

  if v_acc.user_id <> v_caller_id and not public.is_admin() then
    raise exception 'Unauthorized to access this account statement';
  end if;

  -- 2. Date range validation
  if p_from > p_to then
    raise exception 'Start date cannot be after end date';
  end if;

  if (p_to - p_from) > 366 then
    raise exception 'Statement period cannot exceed 1 year (366 days)';
  end if;

  -- Asia/Manila (+08:00) bounds
  v_from_ts := (p_from::text || ' 00:00:00+08')::timestamptz;
  v_to_ts := ((p_to + 1)::text || ' 00:00:00+08')::timestamptz;

  -- 3. Opening balance: sum of ledger entries strictly before v_from_ts
  select coalesce(sum(case when direction = 'credit' then amount else -amount end), 0)
  into v_opening_balance
  from public.ledger_entries
  where account_id = p_account_id
    and created_at < v_from_ts;

  -- 4. Transactions in range
  select coalesce(jsonb_agg(row_data order by (row_data->>'created_at')::timestamptz asc), '[]'::jsonb)
  into v_tx_rows
  from (
    select jsonb_build_object(
      'id', le.id,
      'transaction_id', t.id,
      'account_id', a.id,
      'account_number', a.account_number,
      'type', t.type,
      'direction', le.direction,
      'amount', le.amount,
      'signed_amount', case when le.direction = 'credit' then le.amount else -le.amount end,
      'status', t.status,
      'reference', t.reference,
      'counterparty_account_number', case
        when t.type = 'transfer' and tr.from_account = a.id then to_acc.account_number
        when t.type = 'transfer' and tr.to_account = a.id then from_acc.account_number
        else null
      end,
      'created_at', t.created_at
    ) as row_data
    from public.ledger_entries le
    join public.transactions t on t.id = le.transaction_id
    join public.accounts a on a.id = le.account_id
    left join public.transfers tr on tr.transaction_id = t.id
    left join public.accounts to_acc on to_acc.id = tr.to_account
    left join public.accounts from_acc on from_acc.id = tr.from_account
    where le.account_id = p_account_id
      and t.created_at >= v_from_ts
      and t.created_at < v_to_ts
  ) sub;

  -- 5. Closing balance: sum of all ledger entries strictly before v_to_ts
  -- Guarantees opening_balance + sum(period_entries) = closing_balance
  select coalesce(sum(case when direction = 'credit' then amount else -amount end), 0)
  into v_closing_balance
  from public.ledger_entries
  where account_id = p_account_id
    and created_at < v_to_ts;

  return jsonb_build_object(
    'account_id', p_account_id,
    'account_number', v_acc.account_number,
    'period_from', p_from,
    'period_to', p_to,
    'opening_balance', v_opening_balance,
    'closing_balance', v_closing_balance,
    'transactions', v_tx_rows
  );
end;
$$;

grant execute on function public.get_account_statement(uuid, date, date) to authenticated;
