-- ==============================================================================
-- Davao Bank — Phase 2: Database Schema, Roles, Triggers & Row-Level Security
-- Core Financial Ledger, Profiles, Accounts, Audit, and Access Control
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Tables (§3.1)
-- ------------------------------------------------------------------------------

-- Profiles: Customer & Staff User Attributes linked to auth.users
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  role text not null default 'customer' check (role in ('customer', 'admin')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now()
);

-- Accounts: Deposit & Savings Accounts owned by profiles
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  account_number text unique not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'savings' check (type in ('savings', 'checking')),
  currency text not null default 'PHP',
  status text not null default 'active' check (status in ('active', 'frozen', 'closed')),
  created_at timestamptz not null default now()
);

-- Transactions: Immutable Transaction Envelopes
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('transfer', 'deposit', 'withdrawal', 'adjustment', 'reversal')),
  status text not null default 'completed' check (status in ('pending', 'completed', 'failed', 'reversed')),
  initiated_by uuid references public.profiles(id),
  idempotency_key text unique,
  reference text,
  created_at timestamptz not null default now()
);

-- Ledger Entries: Double-entry / balanced movements in integer minor units (centavos)
create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  direction text not null check (direction in ('debit', 'credit')),
  amount bigint not null check (amount > 0),
  created_at timestamptz not null default now()
);

-- Transfers: Explicit peer-to-peer transfer mapping between distinct accounts
create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  from_account uuid not null references public.accounts(id),
  to_account uuid not null references public.accounts(id),
  amount bigint not null check (amount > 0),
  check (from_account <> to_account)
);

-- Audit Logs: Append-only system activity and security log
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_role text,
  action text not null,
  entity text,
  entity_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- Notifications: Customer alerts & system notices
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------------------
-- 2. Indexes (§3.1)
-- ------------------------------------------------------------------------------
create index idx_accounts_user_id on public.accounts(user_id);
create index idx_accounts_account_number on public.accounts(account_number);
create index idx_ledger_entries_account_id on public.ledger_entries(account_id);
create index idx_ledger_entries_transaction_id on public.ledger_entries(transaction_id);
create index idx_transactions_idempotency_key on public.transactions(idempotency_key);
create index idx_notifications_user_id on public.notifications(user_id);
create index idx_transfers_transaction_id on public.transfers(transaction_id);
create index idx_transfers_from_account on public.transfers(from_account);
create index idx_transfers_to_account on public.transfers(to_account);

-- ------------------------------------------------------------------------------
-- 3. Role Helper Function (§3.2 — avoid RLS recursion)
-- ------------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

grant execute on function public.is_admin() to authenticated;

-- ------------------------------------------------------------------------------
-- 4. User Signup Provisioning Trigger (§3.3)
-- ------------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_full_name text;
  v_phone text;
  v_account_number text;
  v_exists boolean;
begin
  -- Extract metadata safely if supplied during sign up
  v_full_name := coalesce(new.raw_user_meta_data->>'full_name', 'Customer');
  v_phone := new.raw_user_meta_data->>'phone';

  -- 1. Create matching profile
  insert into public.profiles (id, full_name, phone, role, status)
  values (new.id, v_full_name, v_phone, 'customer', 'active')
  on conflict (id) do nothing;

  -- 2. Generate unique 10-digit Davao Bank account number (10XXXXXXXX)
  loop
    v_account_number := '10' || lpad(floor(random() * 100000000)::text, 8, '0');
    select exists (
      select 1 from public.accounts where account_number = v_account_number
    ) into v_exists;
    exit when not v_exists;
  end loop;

  -- 3. Provision one default savings account
  insert into public.accounts (account_number, user_id, type, currency, status)
  values (v_account_number, new.id, 'savings', 'PHP', 'active');

  return new;
end;
$$;

-- Trigger firing after user creation in Supabase auth.users
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------------------------
-- 5. Append-Only Audit Infrastructure (§3.5)
-- ------------------------------------------------------------------------------
create or replace function public.write_audit(
  p_action text,
  p_entity text default null,
  p_entity_id text default null,
  p_metadata jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_log_id uuid;
  v_role text;
begin
  select role into v_role from public.profiles where id = auth.uid();
  insert into public.audit_logs (actor_id, actor_role, action, entity, entity_id, metadata)
  values (auth.uid(), coalesce(v_role, 'system'), p_action, p_entity, p_entity_id, p_metadata)
  returning id into v_log_id;
  return v_log_id;
end;
$$;

grant execute on function public.write_audit(text, text, text, jsonb) to authenticated;

-- Audit trigger on account status changes
create or replace function public.audit_account_changes()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if (old.status is distinct from new.status) then
    perform public.write_audit(
      'account_status_changed',
      'accounts',
      new.id::text,
      jsonb_build_object(
        'account_number', new.account_number,
        'old_status', old.status,
        'new_status', new.status
      )
    );
  end if;
  return new;
end;
$$;

create trigger trigger_audit_account_status
  after update on public.accounts
  for each row execute function public.audit_account_changes();

-- Audit trigger on profile role changes
create or replace function public.audit_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if (old.role is distinct from new.role) then
    perform public.write_audit(
      'profile_role_changed',
      'profiles',
      new.id::text,
      jsonb_build_object(
        'user_id', new.id,
        'old_role', old.role,
        'new_role', new.role
      )
    );
  end if;
  return new;
end;
$$;

create trigger trigger_audit_profile_role
  after update on public.profiles
  for each row execute function public.audit_profile_changes();

-- ------------------------------------------------------------------------------
-- 6. Balance Read-Model View (§3.4)
-- ------------------------------------------------------------------------------
create or replace view public.account_balances
with (security_invoker = true)
as
select
  a.id as account_id,
  a.user_id,
  a.account_number,
  a.type,
  a.currency,
  a.status,
  coalesce(
    sum(case when le.direction = 'credit' then le.amount else -le.amount end),
    0
  )::bigint as balance,
  count(le.id)::int as ledger_entry_count,
  max(le.created_at) as last_activity_at
from public.accounts a
left join public.ledger_entries le on le.account_id = a.id
group by a.id, a.user_id, a.account_number, a.type, a.currency, a.status;

-- ------------------------------------------------------------------------------
-- 7. Row-Level Security Policies (§4 — Enable on EVERY table, deny by default)
-- ------------------------------------------------------------------------------

-- 7.1 Profiles
alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

create policy "Users can update own profile"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = 'customer');

create policy "Admins can view all profiles"
  on public.profiles
  for select
  to authenticated
  using (public.is_admin());

create policy "Admins can update all profiles"
  on public.profiles
  for update
  to authenticated
  using (public.is_admin());

-- 7.2 Accounts
alter table public.accounts enable row level security;

create policy "Users can view own accounts"
  on public.accounts
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Admins can view all accounts"
  on public.accounts
  for select
  to authenticated
  using (public.is_admin());

-- 7.3 Transactions
alter table public.transactions enable row level security;

create policy "Users can view transactions touching own accounts"
  on public.transactions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.ledger_entries le
      join public.accounts a on a.id = le.account_id
      where le.transaction_id = transactions.id
        and a.user_id = auth.uid()
    )
  );

create policy "Admins can view all transactions"
  on public.transactions
  for select
  to authenticated
  using (public.is_admin());

-- 7.4 Ledger Entries
alter table public.ledger_entries enable row level security;

create policy "Users can view ledger entries on own accounts"
  on public.ledger_entries
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.accounts a
      where a.id = ledger_entries.account_id
        and a.user_id = auth.uid()
    )
  );

create policy "Admins can view all ledger entries"
  on public.ledger_entries
  for select
  to authenticated
  using (public.is_admin());

-- 7.5 Transfers
alter table public.transfers enable row level security;

create policy "Users can view transfers involving own accounts"
  on public.transfers
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.accounts a
      where (a.id = transfers.from_account or a.id = transfers.to_account)
        and a.user_id = auth.uid()
    )
  );

create policy "Admins can view all transfers"
  on public.transfers
  for select
  to authenticated
  using (public.is_admin());

-- 7.6 Audit Logs (admin read-only, append-only via security definer functions)
alter table public.audit_logs enable row level security;

create policy "Admins can view audit logs"
  on public.audit_logs
  for select
  to authenticated
  using (public.is_admin());

-- 7.7 Notifications
alter table public.notifications enable row level security;

create policy "Users can view own notifications"
  on public.notifications
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can update own notifications"
  on public.notifications
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Admins can view all notifications"
  on public.notifications
  for select
  to authenticated
  using (public.is_admin());
