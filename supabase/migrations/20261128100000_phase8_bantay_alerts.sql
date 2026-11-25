-- ==============================================================================
-- Phase 8 · Bantay alerts — Realtime stream + Inbox note for high events
--
-- Closes the 8F gap "Realtime toast + Inbox badge for high severity".
-- No applied migration is edited. The protected money functions are untouched.
-- See docs/agents/notes/phase-8-bantay-alerts.md for the byte diff of the
-- re-created _bantay_event and for what could not be verified locally.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Realtime publication. Guarded so a re-run (or an environment where the
--    table was already added) is a no-op. PGlite has no publication, so the
--    guard also keeps npm run test:db working.
--
--    Row visibility is unchanged: public.security_events already has RLS with
--    policy "security_events_select_own" (user_id = auth.uid() or is_admin()).
--    Realtime INSERT payloads are filtered by that policy plus the client's
--    user_id=eq.<caller> channel filter, so a customer only receives own rows.
-- ------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'security_events'
     )
  then
    alter publication supabase_realtime add table public.security_events;
  end if;
end $$;

-- ------------------------------------------------------------------------------
-- 2. _bantay_event re-created from its latest definition
--    (20261127000000_phase8_bantay_risk.sql) with ONE addition: the
--    public.notifications insert. Everything else is byte-identical.
--    The message is curated sentence case; no ids, no JSON facts, and any
--    account reference is masked as "•• 1234".
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

  return v_id;
end;
$$;

revoke all on function public._bantay_event(uuid, text, text, int, jsonb, uuid)
  from public, anon, authenticated;
