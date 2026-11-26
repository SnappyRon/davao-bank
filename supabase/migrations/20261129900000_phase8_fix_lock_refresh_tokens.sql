-- ==============================================================================
-- Phase 8 · Fix — Bantay lock fails on hosted refresh_tokens type
--
-- Captain-verified hosted failure: lock_my_account raised 42883 because
-- auth.refresh_tokens.user_id is character varying on hosted Supabase while
-- p_user_id is uuid. auth.sessions.user_id is uuid and needs no cast.
--
-- This re-creates public._lock_account from 20261127000000_phase8_bantay_risk.sql
-- byte-identically except for the refresh_tokens predicate cast. Security
-- definer, empty search_path, guards, events, audit and grants are unchanged.
-- No money-engine code is touched. No hosted writes are part of this migration.
-- ==============================================================================

create or replace function public._lock_account(p_user_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    return;
  end if;

  insert into public.security_limits (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  update public.security_limits
  set locked_at = now(), unlock_after = null, updated_at = now()
  where user_id = p_user_id;

  update public.scheduled_payments
  set status = 'paused', updated_at = now()
  where owner_id = p_user_id and status = 'active';

  -- Hosted Supabase uses auth.refresh_tokens and auth.sessions. The tables are
  -- absent in the local PGlite stand-in, so use runtime guards and dynamic SQL.
  if to_regclass('auth.refresh_tokens') is not null then
    execute 'delete from auth.refresh_tokens where user_id = $1::text' using p_user_id;
  end if;
  if to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where user_id = $1' using p_user_id;
  end if;

  perform public._bantay_event(
    p_user_id, 'account_locked', 'high', null,
    jsonb_build_object('reason', coalesce(p_reason, 'customer'))
  );
  perform public.write_audit(
    'account_locked', 'security_limits', p_user_id::text,
    jsonb_build_object('reason', coalesce(p_reason, 'customer'))
  );
end;
$$;

revoke all on function public._lock_account(uuid, text) from public, anon, authenticated;
