-- ==============================================================================
-- Davao Bank — Phase 5 Stage D: QR Send & Request Money
-- Payment Requests Schema, Server-Authoritative Integrity, RLS, and Anti-Leak
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Payment Requests Table (§D.3)
-- ------------------------------------------------------------------------------

create table if not exists public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  requester_account uuid not null references public.accounts(id),
  payer_account_number text not null,
  payer_user_id uuid not null references public.profiles(id),
  amount bigint not null check (amount > 0),
  note text check (char_length(note) <= 60),
  status text not null default 'pending' check (status in ('pending', 'paid', 'declined', 'cancelled', 'expired')),
  transaction_id uuid unique null references public.transactions(id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  responded_at timestamptz null
);

create index if not exists idx_payment_requests_requester on public.payment_requests(requester_id);
create index if not exists idx_payment_requests_payer on public.payment_requests(payer_user_id);
create index if not exists idx_payment_requests_status on public.payment_requests(status);

alter table public.payment_requests enable row level security;

-- Authenticated select: Requester, Payer, or Staff Admin can view requests
drop policy if exists "payment_requests_select_party" on public.payment_requests;
create policy "payment_requests_select_party"
  on public.payment_requests
  for select
  to authenticated
  using (
    requester_id = auth.uid()
    or payer_user_id = auth.uid()
    or public.is_admin()
  );

-- No client insert, update, or delete policies: all writes strictly mediated through SECURITY DEFINER RPCs

-- ------------------------------------------------------------------------------
-- 2. Create Payment Request (§D.3)
-- ------------------------------------------------------------------------------

create or replace function public.create_payment_request(
  p_requester_account uuid,
  p_payer_account_number text,
  p_amount bigint,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_caller_id uuid := auth.uid();
  v_caller_profile record;
  v_req_acc record;
  v_payer_acc record;
  v_clean_payer_acc_num text;
  v_clean_note text;
  v_daily_count int;
  v_request_id uuid;
  v_expires_at timestamptz := now() + interval '7 days';
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  -- 1. Verify caller profile active
  select * into v_caller_profile
  from public.profiles
  where id = v_caller_id;

  if not found or v_caller_profile.status <> 'active' then
    raise exception 'Your profile is suspended or inactive';
  end if;

  -- 2. Verify requester account belongs to caller and is active
  select * into v_req_acc
  from public.accounts
  where id = p_requester_account;

  if not found or v_req_acc.user_id <> v_caller_id then
    raise exception 'You do not own the requesting account';
  end if;

  if v_req_acc.status <> 'active' then
    raise exception 'Requesting account is not active';
  end if;

  -- 3. Validate amount
  if p_amount is null or p_amount <= 0 then
    raise exception 'Requested amount must be greater than zero';
  end if;

  if p_amount > 50000000 then -- PHP 500,000 max single request cap
    raise exception 'Requested amount exceeds maximum transfer limit of PHP 500,000.00';
  end if;

  -- 4. Validate and resolve payer account
  v_clean_payer_acc_num := trim(p_payer_account_number);
  if not (v_clean_payer_acc_num ~ '^[0-9]{10}$') then
    raise exception 'Invalid payer account number. Must be a 10-digit Davao Bank account number.';
  end if;

  select * into v_payer_acc
  from public.accounts
  where account_number = v_clean_payer_acc_num;

  if not found then
    raise exception 'Payer account number not found';
  end if;

  if v_payer_acc.status <> 'active' then
    raise exception 'Payer account is not active';
  end if;

  -- 5. Payer cannot be caller
  if v_payer_acc.user_id = v_caller_id then
    raise exception 'Cannot request money from your own account';
  end if;

  -- 6. Validate note (max 60 chars)
  if p_note is not null then
    v_clean_note := trim(p_note);
    if char_length(v_clean_note) > 60 then
      raise exception 'Note exceeds maximum length of 60 characters';
    end if;
    if v_clean_note = '' then
      v_clean_note := null;
    end if;
  end if;

  -- 7. Daily rate limit: at most 10 requests per user per day in Philippine Time
  select count(*) into v_daily_count
  from public.payment_requests
  where requester_id = v_caller_id
    and created_at >= (now() at time zone 'Asia/Manila')::date::timestamptz;

  if v_daily_count >= 10 then
    raise exception 'Daily payment request limit reached (maximum 10 requests per day)';
  end if;

  -- 8. Insert payment request
  insert into public.payment_requests (
    requester_id,
    requester_account,
    payer_account_number,
    payer_user_id,
    amount,
    note,
    status,
    expires_at
  ) values (
    v_caller_id,
    p_requester_account,
    v_clean_payer_acc_num,
    v_payer_acc.user_id,
    p_amount,
    v_clean_note,
    'pending',
    v_expires_at
  )
  returning id into v_request_id;

  -- 9. Audit trail (never logs counterparty names)
  perform public.write_audit(
    'payment_request_created',
    'payment_requests',
    v_request_id::text,
    jsonb_build_object(
      'amount', p_amount,
      'payer_account', v_clean_payer_acc_num,
      'requester_account', v_req_acc.account_number
    )
  );

  -- 10. Notify payer (Account number only, preserving recipient privacy)
  insert into public.notifications (user_id, type, message)
  values (
    v_payer_acc.user_id,
    'payment_request_received',
    'You received a payment request of PHP ' || trim(to_char(p_amount / 100.0, 'FM999,999,990.00')) ||
    ' from account ' || v_req_acc.account_number || coalesce(' · ' || v_clean_note, '')
  );

  return jsonb_build_object(
    'success', true,
    'id', v_request_id,
    'amount', p_amount,
    'payer_account_number', v_clean_payer_acc_num,
    'status', 'pending',
    'expires_at', v_expires_at
  );
end;
$$;

grant execute on function public.create_payment_request(uuid, text, bigint, text) to authenticated;

-- ------------------------------------------------------------------------------
-- 3. Pay Payment Request (§D.3)
-- ------------------------------------------------------------------------------

create or replace function public.pay_payment_request(
  p_request_id uuid,
  p_from_account uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_caller_id uuid := auth.uid();
  v_req record;
  v_from_acc record;
  v_tx_res jsonb;
  v_tx_id uuid;
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  -- 1. Lock payment request row FIRST to prevent race conditions & duplicate payment
  select * into v_req
  from public.payment_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Payment request not found';
  end if;

  -- 2. Verify caller is the designated payer
  if v_req.payer_user_id <> v_caller_id then
    raise exception 'Unauthorized to pay this payment request';
  end if;

  -- 3. Verify status
  if v_req.status <> 'pending' then
    raise exception 'Payment request is no longer pending (status: %)', v_req.status;
  end if;

  -- 4. Check expiry
  if now() >= v_req.expires_at then
    update public.payment_requests
    set status = 'expired'
    where id = p_request_id;

    raise exception 'Payment request has expired';
  end if;

  -- 5. Verify source account ownership
  select * into v_from_acc
  from public.accounts
  where id = p_from_account;

  if not found or v_from_acc.user_id <> v_caller_id then
    raise exception 'You do not own the payment source account';
  end if;

  if v_from_acc.status <> 'active' then
    raise exception 'Source payment account is not active';
  end if;

  -- 6. Execute atomic transfer via Single Money Engine (_transfer_core)
  v_tx_res := public._transfer_core(
    v_caller_id,
    p_from_account,
    v_req.requester_account,
    v_req.amount,
    p_idempotency_key,
    coalesce('Request: ' || v_req.note, 'Payment request response'),
    'transfer'
  );

  v_tx_id := (v_tx_res->>'transaction_id')::uuid;

  -- 7. Update payment request status in the SAME transaction
  update public.payment_requests
  set status = 'paid',
      transaction_id = v_tx_id,
      responded_at = now()
  where id = p_request_id;

  -- 8. Audit trail
  perform public.write_audit(
    'payment_request_paid',
    'payment_requests',
    p_request_id::text,
    jsonb_build_object(
      'transaction_id', v_tx_id,
      'amount', v_req.amount,
      'payer_account', v_from_acc.account_number
    )
  );

  -- 9. Notify requester
  insert into public.notifications (user_id, type, message)
  values (
    v_req.requester_id,
    'payment_request_paid',
    'Your payment request of PHP ' || trim(to_char(v_req.amount / 100.0, 'FM999,999,990.00')) ||
    ' was paid by account ' || v_from_acc.account_number
  );

  return jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'transaction_id', v_tx_id,
    'status', 'paid',
    'transfer_result', v_tx_res
  );
end;
$$;

grant execute on function public.pay_payment_request(uuid, uuid, text) to authenticated;

-- ------------------------------------------------------------------------------
-- 4. Decline Payment Request (§D.3)
-- ------------------------------------------------------------------------------

create or replace function public.decline_payment_request(
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_caller_id uuid := auth.uid();
  v_req record;
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_req
  from public.payment_requests
  where id = p_id
  for update;

  if not found then
    raise exception 'Payment request not found';
  end if;

  if v_req.payer_user_id <> v_caller_id then
    raise exception 'Unauthorized to decline this request';
  end if;

  if v_req.status <> 'pending' then
    return jsonb_build_object('success', true, 'id', p_id, 'status', v_req.status);
  end if;

  update public.payment_requests
  set status = 'declined',
      responded_at = now()
  where id = p_id;

  perform public.write_audit(
    'payment_request_declined',
    'payment_requests',
    p_id::text,
    jsonb_build_object('declined_by', v_caller_id)
  );

  insert into public.notifications (user_id, type, message)
  values (
    v_req.requester_id,
    'payment_request_declined',
    'Your payment request of PHP ' || trim(to_char(v_req.amount / 100.0, 'FM999,999,990.00')) ||
    ' was declined.'
  );

  return jsonb_build_object('success', true, 'id', p_id, 'status', 'declined');
end;
$$;

grant execute on function public.decline_payment_request(uuid) to authenticated;

-- ------------------------------------------------------------------------------
-- 5. Cancel Payment Request (§D.3)
-- ------------------------------------------------------------------------------

create or replace function public.cancel_payment_request(
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_caller_id uuid := auth.uid();
  v_req record;
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_req
  from public.payment_requests
  where id = p_id
  for update;

  if not found then
    raise exception 'Payment request not found';
  end if;

  if v_req.requester_id <> v_caller_id and not public.is_admin() then
    raise exception 'Unauthorized to cancel this request';
  end if;

  if v_req.status <> 'pending' then
    return jsonb_build_object('success', true, 'id', p_id, 'status', v_req.status);
  end if;

  update public.payment_requests
  set status = 'cancelled',
      responded_at = now()
  where id = p_id;

  perform public.write_audit(
    'payment_request_cancelled',
    'payment_requests',
    p_id::text,
    jsonb_build_object('cancelled_by', v_caller_id)
  );

  return jsonb_build_object('success', true, 'id', p_id, 'status', 'cancelled');
end;
$$;

grant execute on function public.cancel_payment_request(uuid) to authenticated;

-- ------------------------------------------------------------------------------
-- 6. Expire Due Payment Requests (§D.3)
-- Internal batch job. Revoked from clients.
-- ------------------------------------------------------------------------------

create or replace function public.expire_due_payment_requests()
returns int
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_count int := 0;
begin
  update public.payment_requests
  set status = 'expired'
  where status = 'pending'
    and now() >= expires_at;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.expire_due_payment_requests() from public, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 7. Automated Daily Expiry Cron
-- ------------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('davao-expire-payment-requests');
    exception when others then
      -- ignore if not previously registered
    end;

    perform cron.schedule(
      'davao-expire-payment-requests',
      '0 0 * * *', -- daily at midnight
      'select public.expire_due_payment_requests()'
    );
  end if;
end;
$$;
