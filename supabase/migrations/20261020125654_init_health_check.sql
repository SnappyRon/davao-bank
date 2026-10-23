-- Phase 1: Health check scaffold table to verify end-to-end connectivity
-- Deny all by default, allow public read-only access via RLS.

create table public.health_check (
  id integer primary key generated always as identity,
  status text not null,
  checked_at timestamptz not null default now()
);

-- Enable Row Level Security immediately
alter table public.health_check enable row level security;

-- Policy: Allow public (anon and authenticated) SELECT only
create policy "Allow public read access on health_check"
  on public.health_check
  for select
  to anon, authenticated
  using (true);

-- Seed initial connectivity record
insert into public.health_check (status)
values ('ok');
