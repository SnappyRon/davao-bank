-- ==============================================================================
-- Phase 8 · Stage 8J — Bantay protective lock (backend)
--
-- Shared contract with the drill/freeze agents: a protective freeze IS the
-- existing 8D lock (public._lock_account(user_id, 'bantay') in
-- 20261127000000_phase8_bantay_risk.sql). Unlocking stays the existing
-- request_unlock()/complete_unlock() (password + TOTP) and admin_unlock_user()
-- paths. Nothing here touches _transfer_core, the ledger, the money handlers,
-- run_due_scheduled_payments, idempotency keys or any step-up check.
--
-- A server-side evaluator runs after every _bantay_event insert. Two distinct
-- high signals inside 15 minutes freeze the customer: code failures, a
-- new-device/signin signal, or a high-risk payment attempt. At most one
-- protective lock is allowed per customer per hour. The evaluator opens or
-- updates a system security case and leaves one exact Inbox notification.
-- No hosted writes and no .env access are part of this migration.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Allow the new internal event kind. All other kinds stay byte-identical.
-- ------------------------------------------------------------------------------
alter table public.security_events drop constraint if exists security_events_kind_check;
alter table public.security_events add constraint security_events_kind_check
  check (kind in (
    'risky_payment_challenged', 'risky_payment_warning', 'risky_payment_confirmed',
    'new_device', 'signin_failures', 'code_failures', 'mfa_changed',
    'password_changed', 'limit_changed', 'account_locked', 'account_unlocked',
    'protective_lock'
  ));

-- ------------------------------------------------------------------------------
-- 2. Small internal ledger: one protective lock per customer per rolling hour.
--    No client role gets any access; the unique key also makes parallel
--    evaluations idempotent.
-- ------------------------------------------------------------------------------
create table if not exists public.bantay_protective_locks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  window_start timestamptz not null,
  event_id uuid null references public.security_events(id) on delete set null,
  case_id uuid null references public.security_cases(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, window_start)
);

alter table public.bantay_protective_locks enable row level security;
revoke all on public.bantay_protective_locks from public, anon, authenticated;
grant all on public.bantay_protective_locks to service_role;

create index if not exists idx_bantay_protective_locks_user_time
  on public.bantay_protective_locks(user_id, created_at desc);

-- ------------------------------------------------------------------------------
-- 3. Evaluator. Internal only: no EXECUTE for anon or authenticated. The
--    claimed ledger row is inserted BEFORE _lock_account so the account_locked
--    event re-entering _bantay_event cannot cause a second freeze.
-- ------------------------------------------------------------------------------
create or replace function public._bantay_maybe_protective_lock(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signals int := 0;
  v_categories text[] := '{}'::text[];
  v_lock_id uuid;
  v_event_id uuid;
  v_case_id uuid;
begin
  if p_user_id is null then
    return false;
  end if;

  -- Rate limit: one protective lock per customer per rolling hour.
  if exists (
    select 1 from public.bantay_protective_locks
    where user_id = p_user_id and created_at > now() - interval '1 hour'
  ) then
    return false;
  end if;

  -- Never stack a protective freeze on an existing lock of any kind.
  if exists (
    select 1 from public.security_limits
    where user_id = p_user_id and locked_at is not null
  ) then
    return false;
  end if;

  -- Distinct high-signal categories inside the rolling 15-minute window.
  if exists (
    select 1 from public.security_events
    where user_id = p_user_id and kind = 'code_failures'
      and severity = 'high'
      and created_at >= now() - interval '15 minutes'
  ) then
    v_signals := v_signals + 1;
    v_categories := array_append(v_categories, 'C1');
  end if;

  if exists (
    select 1 from public.security_events
    where user_id = p_user_id and kind in ('new_device', 'signin_failures')
      and created_at >= now() - interval '15 minutes'
  ) then
    v_signals := v_signals + 1;
    v_categories := array_append(v_categories, 'C2');
  end if;

  if exists (
    select 1 from public.security_events
    where user_id = p_user_id and kind = 'risky_payment_challenged'
      and severity = 'high'
      and created_at >= now() - interval '15 minutes'
  ) then
    v_signals := v_signals + 1;
    v_categories := array_append(v_categories, 'C3');
  end if;

  if v_signals < 2 then
    return false;
  end if;

  -- Claim the hour first: concurrent evaluations collapse to one row.
  insert into public.bantay_protective_locks (user_id, window_start)
  values (p_user_id, date_trunc('hour', now()))
  on conflict (user_id, window_start) do nothing
  returning id into v_lock_id;

  if v_lock_id is null then
    return false;
  end if;

  -- Insert the event directly: routing it through _bantay_event at high
  -- severity would add a second, generic account_alert notification.
  insert into public.security_events (user_id, kind, severity, score, facts)
  values (
    p_user_id, 'protective_lock', 'high', 100,
    jsonb_build_object(
      'signals', v_signals,
      'categories', to_jsonb(v_categories),
      'window_minutes', 15,
      'reason', 'protective'
    )
  )
  returning id into v_event_id;

  update public.bantay_protective_locks
  set event_id = v_event_id where id = v_lock_id;

  -- Reuse the existing staff case path: update an open system case if one
  -- exists, otherwise open it. No new case machinery.
  select id into v_case_id
  from public.security_cases
  where user_id = p_user_id and opened_by = 'system'
    and status in ('open', 'investigating')
  order by created_at desc
  limit 1;

  if v_case_id is null then
    insert into public.security_cases
      (user_id, opened_by, event_id, status, staff_note)
    values (
      p_user_id, 'system', v_event_id, 'open',
      'Bantay froze outgoing money after unusual activity. Review the security events before lifting the hold.'
    )
    returning id into v_case_id;
  else
    update public.security_cases
    set event_id = v_event_id,
        updated_at = now(),
        staff_note = concat(
          coalesce(staff_note, ''),
          ' Updated after another protective-lock episode.'
        )
    where id = v_case_id;
  end if;

  update public.bantay_protective_locks
  set case_id = v_case_id where id = v_lock_id;
  update public.security_events
  set facts = facts || jsonb_build_object('case_id', v_case_id)
  where id = v_event_id;

  -- The freeze itself is the existing 8D lock, with no new guard call sites.
  perform public._lock_account(p_user_id, 'bantay');

  insert into public.notifications (user_id, type, message)
  values (
    p_user_id,
    'bantay_protective_lock',
    'We froze your account to protect your money. No money can leave until you confirm it''s you. Davao Bank will never ask you to move your money.'
  );

  perform public.write_audit(
    'protective_lock', 'security_limits', p_user_id::text,
    jsonb_build_object(
      'event_id', v_event_id,
      'case_id', v_case_id,
      'signals', v_signals,
      'window_minutes', 15
    )
  );

  return true;
end;
$$;

revoke all on function public._bantay_maybe_protective_lock(uuid)
  from public, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 4. _bantay_event re-created from its latest definition
--    (20261128100000_phase8_bantay_alerts.sql) with ONE addition: a guarded
--    call to the evaluator. Lock, unlock and protective events themselves never
--    re-enter it. Everything else is byte-identical.
-- ------------------------------------------------------------------------------
create or replace function public._bantay_event(
  p_user_id uuid,
  p_kind text,
  p_severity text default 'info',
  p_score int default null,
  p_facts jsonb default '{}'::jsonb,
  p_related_transaction_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_user_id is null then
    return null;
  end if;

  insert into public.security_events
    (user_id, kind, severity, score, facts, related_transaction_id)
  values
    (p_user_id, p_kind, p_severity, p_score, coalesce(p_facts, '{}'::jsonb), p_related_transaction_id)
  returning id into v_id;

  -- ONE ADDITION: high events (and lock/unlock events at any severity) also
  -- leave a calm Inbox note. Lock/unlock are always worth telling the customer
  -- about, even though the lock helper logs them as 'info'.
  if p_severity = 'high' or p_kind in ('account_locked', 'account_unlocked') then
    insert into public.notifications (user_id, type, message)
    values (
      p_user_id,
      'account_alert',
      case p_kind
        when 'risky_payment_challenged' then
          'A payment to ' || coalesce(
            '•• ' || nullif(right(coalesce(
              nullif(p_facts ->> 'payee_suffix', 'none'),
              p_facts ->> 'to_account_number', ''), 4), ''),
            'a payee'
          ) || ' needed extra confirmation. No money was sent until you confirmed it.'
        when 'risky_payment_confirmed' then
          'You confirmed a payment to ' || coalesce(
            '•• ' || nullif(right(coalesce(
              nullif(p_facts ->> 'payee_suffix', 'none'),
              p_facts ->> 'to_account_number', ''), 4), ''),
            'a payee'
          ) || ' after an extra check. No further action is needed.'
        when 'risky_payment_warning' then
          'A payment looked unusual and Bantay showed a warning.'
        when 'new_device' then
          'A new device signed in to your account. If this wasn’t you, lock your account in Bantay.'
        when 'signin_failures' then
          'Several sign-in attempts failed. If these weren’t yours, change your password in Profile.'
        when 'code_failures' then
          'Several verification codes were entered incorrectly. If this wasn’t you, review your security settings.'
        when 'mfa_changed' then
          'Your two-step verification settings changed. If this wasn’t you, lock your account in Bantay.'
        when 'password_changed' then
          'Your password changed. If this wasn’t you, lock your account in Bantay.'
        when 'limit_changed' then
          'Your daily transfer limit changed. If this wasn’t you, review your limits in Bantay.'
        when 'account_locked' then
          'Your account is locked for outgoing money. You can still sign in and unlock it in Bantay.'
        when 'account_unlocked' then
          'Your account is unlocked. Outgoing money is available again.'
        else
          'Bantay recorded a security event on your account. Review it in Bantay.'
      end
    );
  end if;

  -- Recursion guard: the lock/unlock path writes these kinds; they must not
  -- re-enter the evaluator (an unlock with recent signals must not re-freeze).
  if p_kind not in ('protective_lock', 'account_locked', 'account_unlocked') then
    perform public._bantay_maybe_protective_lock(p_user_id);
  end if;

  return v_id;
end;
$$;

revoke all on function public._bantay_event(uuid, text, text, int, jsonb, uuid)
  from public, anon, authenticated;
