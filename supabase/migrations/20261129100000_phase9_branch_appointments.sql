-- Phase 9 · Branch Appointments (backend, §4.5)
-- Simulated branch appointment booking for fictional Davao Bank branches.
-- No money movement. All RPCs are security definer with set search_path = ''.
-- Revoked from public/anon; executable by authenticated customers (admin RPCs
-- additionally enforce assert_admin_aal2() + is_admin()).
-- Applied after 20261129000000 (service requests).

-- ------------------------------------------------------------------------------
-- 1. Tables
-- ------------------------------------------------------------------------------

-- Branches: fictional Davao Bank branches (Davao areas)
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  area text not null,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Appointment slots: bookable windows at a branch
create table public.appointment_slots (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity int not null check (capacity > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (branch_id, starts_at)
);

-- Appointments: customer bookings against a slot
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  slot_id uuid not null references public.appointment_slots(id) on delete cascade,
  status text not null check (status in ('booked', 'cancelled', 'completed')),
  idempotency_key text,
  staff_note text,
  created_at timestamptz not null default now()
);

-- One booked appointment per user per slot (double-booking guard).
create unique index appointments_one_booked_per_user_per_slot
  on public.appointments(slot_id, user_id)
  where status = 'booked';

-- One idempotency key per user (idempotent replay is caller-scoped).
create unique index appointments_idempotency_key_per_user
  on public.appointments(user_id, idempotency_key)
  where idempotency_key is not null;

create index idx_appointments_user_id on public.appointments(user_id);
create index idx_appointments_slot_id on public.appointments(slot_id);
create index idx_appointment_slots_branch_id on public.appointment_slots(branch_id);

-- ------------------------------------------------------------------------------
-- 2. Row-Level Security (deny by default; read via policy, mutations via RPCs)
-- ------------------------------------------------------------------------------

alter table public.branches enable row level security;
create policy "Authenticated customers can view active branches"
  on public.branches for select
  to authenticated
  using (is_active);
create policy "Admins can view all branches"
  on public.branches for select
  to authenticated
  using (public.is_admin());

alter table public.appointment_slots enable row level security;
create policy "Authenticated customers can view active slots"
  on public.appointment_slots for select
  to authenticated
  using (
    is_active
    and exists (
      select 1 from public.branches b
      where b.id = appointment_slots.branch_id
        and b.is_active
    )
  );
create policy "Admins can view all slots"
  on public.appointment_slots for select
  to authenticated
  using (public.is_admin());

alter table public.appointments enable row level security;
create policy "Users can view own appointments"
  on public.appointments for select
  to authenticated
  using (user_id = auth.uid());
create policy "Admins can view all appointments"
  on public.appointments for select
  to authenticated
  using (public.is_admin());

-- ------------------------------------------------------------------------------
-- 3. Table privileges (read-only for clients; mutations via RPCs only)
-- ------------------------------------------------------------------------------

grant select on public.branches to authenticated;
grant select on public.appointment_slots to authenticated;
grant select on public.appointments to authenticated;
revoke all on public.branches from anon;
revoke all on public.appointment_slots from anon;
revoke insert, update, delete on public.appointments from public, anon, authenticated;
revoke insert, update, delete on public.branches from public, anon, authenticated;
revoke insert, update, delete on public.appointment_slots from public, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 4. Customer RPCs (§4.5)
-- ------------------------------------------------------------------------------

create or replace function public.list_branches()
returns table (
  id uuid,
  name text,
  area text,
  address text,
  is_active boolean
)
language sql
security definer
set search_path = ''
as $$
  select id, name, area, address, is_active
  from public.branches
  where is_active
  order by name;
$$;

create or replace function public.list_open_slots(
  p_branch_id uuid,
  p_date date
)
returns table (
  id uuid,
  branch_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  capacity int,
  available int
)
language sql
security definer
set search_path = ''
as $$
  select
    s.id,
    s.branch_id,
    s.starts_at,
    s.ends_at,
    s.capacity,
    (s.capacity - coalesce(b.booked, 0)) as available
  from public.appointment_slots s
  left join (
    select slot_id, count(*) as booked
    from public.appointments
    where status = 'booked'
    group by slot_id
  ) b on b.slot_id = s.id
  where s.branch_id = p_branch_id
    and s.is_active
    and exists (
      select 1 from public.branches br
      where br.id = p_branch_id and br.is_active
    )
    and (s.starts_at at time zone 'Asia/Manila')::date = p_date
    and s.starts_at > now()
    and (s.capacity - coalesce(b.booked, 0)) > 0
  order by s.starts_at;
$$;

create or replace function public.book_appointment(
  p_branch_id uuid,
  p_slot_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_slot record;
  v_branch record;
  v_existing record;
  v_booked int;
  v_user_booked int;
  v_appointment_id uuid;
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  -- Idempotency key is required.
  if p_idempotency_key is null or p_idempotency_key = '' then
    raise exception 'Idempotency key is required';
  end if;

  -- Idempotent replay: return the existing booking made by this caller with this key.
  select * into v_existing
  from public.appointments
  where idempotency_key = p_idempotency_key
    and user_id = v_caller_id;

  if found then
    return jsonb_build_object(
      'id', v_existing.id,
      'status', v_existing.status,
      'slot_id', v_existing.slot_id,
      'idempotent_replay', true
    );
  end if;

  -- Serialize concurrent bookings for the same slot.
  select * into v_slot
  from public.appointment_slots
  where id = p_slot_id
  for update;

  if not found then
    raise exception 'Appointment slot not found';
  end if;

  select * into v_branch
  from public.branches
  where id = p_branch_id;

  if not found then
    raise exception 'Branch not found';
  end if;

  if not v_branch.is_active then
    raise exception 'Branch is not active';
  end if;

  if not v_slot.is_active then
    raise exception 'Slot is not active';
  end if;

  if v_slot.branch_id <> p_branch_id then
    raise exception 'Slot does not belong to this branch';
  end if;

  -- Slot must be in the future.
  if v_slot.starts_at <= now() then
    raise exception 'Slot is in the past';
  end if;

  -- Capacity: slot must not be fully booked.
  select count(*) into v_booked
  from public.appointments
  where slot_id = p_slot_id and status = 'booked';

  if v_booked >= v_slot.capacity then
    raise exception 'Slot is fully booked';
  end if;

  -- Per-user limit: max 5 upcoming booked appointments.
  select count(*) into v_user_booked
  from public.appointments a
  join public.appointment_slots s on s.id = a.slot_id
  where a.user_id = v_caller_id
    and a.status = 'booked'
    and s.starts_at > now();

  if v_user_booked >= 5 then
    raise exception 'You already have the maximum number of upcoming appointments';
  end if;

  -- Same user cannot book the same slot twice (also enforced by unique index).
  select count(*) into v_booked
  from public.appointments
  where slot_id = p_slot_id
    and user_id = v_caller_id
    and status = 'booked';

  if v_booked > 0 then
    raise exception 'You already have a booking for this slot';
  end if;

  insert into public.appointments (user_id, slot_id, status, idempotency_key)
  values (v_caller_id, p_slot_id, 'booked', p_idempotency_key)
  returning id into v_appointment_id;

  perform public.write_audit(
    'appointment_booked',
    'appointments',
    v_appointment_id::text,
    jsonb_build_object('user_id', v_caller_id, 'slot_id', p_slot_id, 'branch_id', p_branch_id)
  );

  insert into public.notifications (user_id, type, message)
  values (
    v_caller_id,
    'appointment_booked',
    'Your Davao Bank branch appointment is booked.'
  );

  return jsonb_build_object(
    'id', v_appointment_id,
    'status', 'booked',
    'slot_id', p_slot_id,
    'branch_id', p_branch_id,
    'idempotency_key', p_idempotency_key,
    'idempotent_replay', false
  );
end;
$$;

create or replace function public.get_my_appointments()
returns table (
  id uuid,
  slot_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  branch_name text,
  branch_area text,
  status text,
  staff_note text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  return query
  select
    a.id,
    a.slot_id,
    s.starts_at,
    s.ends_at,
    br.name,
    br.area,
    a.status,
    a.staff_note,
    a.created_at
  from public.appointments a
  join public.appointment_slots s on s.id = a.slot_id
  join public.branches br on br.id = s.branch_id
  where a.user_id = v_caller_id
  order by s.starts_at desc;
end;
$$;

create or replace function public.cancel_appointment(
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_app record;
  v_slot record;
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_app
  from public.appointments
  where id = p_id
  for update;

  if not found then
    raise exception 'Appointment not found';
  end if;

  if v_app.user_id <> v_caller_id then
    raise exception 'Unauthorized to cancel this appointment';
  end if;

  if v_app.status <> 'booked' then
    raise exception 'Only booked appointments can be cancelled';
  end if;

  select * into v_slot
  from public.appointment_slots
  where id = v_app.slot_id;

  if not found then
    raise exception 'Slot not found';
  end if;

  -- Future only: slot must not have started.
  if v_slot.starts_at <= now() then
    raise exception 'Cannot cancel a past or ongoing appointment';
  end if;

  update public.appointments
  set status = 'cancelled'
  where id = p_id;

  perform public.write_audit(
    'appointment_cancelled',
    'appointments',
    p_id::text,
    jsonb_build_object('user_id', v_caller_id, 'slot_id', v_app.slot_id)
  );

  insert into public.notifications (user_id, type, message)
  values (
    v_caller_id,
    'appointment_cancelled',
    'Your Davao Bank branch appointment was cancelled.'
  );

  return jsonb_build_object('success', true, 'id', p_id, 'status', 'cancelled');
end;
$$;

grant execute on function public.list_branches() to authenticated;
grant execute on function public.list_open_slots(uuid, date) to authenticated;
grant execute on function public.book_appointment(uuid, uuid, text) to authenticated;
grant execute on function public.get_my_appointments() to authenticated;
grant execute on function public.cancel_appointment(uuid) to authenticated;

-- ------------------------------------------------------------------------------
-- 5. Admin RPCs (§4.5) — aal2 via assert_admin_aal2() + is_admin(), audit row
-- ------------------------------------------------------------------------------

create or replace function public.admin_list_appointments(
  p_status text default null
)
returns table (
  id uuid,
  user_id uuid,
  user_name text,
  slot_id uuid,
  branch_name text,
  branch_area text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  staff_note text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
begin
  perform public.assert_admin_aal2();
  if not public.is_admin() then
    raise exception 'Admin privilege required';
  end if;

  perform public.write_audit(
    'admin_list_appointments',
    'appointments',
    null,
    jsonb_build_object('admin_id', v_caller_id, 'status_filter', p_status)
  );

  return query
  select
    a.id,
    a.user_id,
    p.full_name,
    a.slot_id,
    br.name,
    br.area,
    s.starts_at,
    s.ends_at,
    a.status,
    a.staff_note,
    a.created_at
  from public.appointments a
  join public.appointment_slots s on s.id = a.slot_id
  join public.branches br on br.id = s.branch_id
  join public.profiles p on p.id = a.user_id
  where p_status is null or a.status = p_status
  order by s.starts_at desc;
end;
$$;

create or replace function public.admin_update_appointment(
  p_id uuid,
  p_status text,
  p_staff_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_app record;
  v_old_status text;
  v_user_id uuid;
begin
  perform public.assert_admin_aal2();
  if not public.is_admin() then
    raise exception 'Admin privilege required';
  end if;

  select * into v_app
  from public.appointments
  where id = p_id
  for update;

  if not found then
    raise exception 'Appointment not found';
  end if;

  v_old_status := v_app.status;
  v_user_id := v_app.user_id;

  if p_status is null or p_status not in ('booked', 'cancelled', 'completed') then
    raise exception 'Invalid status';
  end if;

  if v_app.status = p_status then
    raise exception 'Appointment is already %', p_status;
  end if;

  -- Re-booking (to 'booked') must revalidate slot capacity and the per-user cap
  -- under the same locks as book_appointment, so an admin cannot overbook.
  if p_status = 'booked' then
    declare
      v_slot record;
      v_booked int;
      v_user_booked int;
    begin
      select * into v_slot
      from public.appointment_slots
      where id = v_app.slot_id
      for update;

      if not found then
        raise exception 'Slot not found';
      end if;

      if not v_slot.is_active then
        raise exception 'Slot is not active';
      end if;

      if v_slot.starts_at <= now() then
        raise exception 'Slot is in the past';
      end if;

      select count(*) into v_booked
      from public.appointments
      where slot_id = v_app.slot_id and status = 'booked';

      if v_booked >= v_slot.capacity then
        raise exception 'Slot is fully booked';
      end if;

      select count(*) into v_user_booked
      from public.appointments a
      join public.appointment_slots s on s.id = a.slot_id
      where a.user_id = v_user_id
        and a.status = 'booked'
        and s.starts_at > now();

      if v_user_booked >= 5 then
        raise exception 'User already has the maximum number of upcoming appointments';
      end if;
    end;
  end if;

  update public.appointments
  set status = p_status,
      staff_note = coalesce(nullif(trim(p_staff_note), ''), v_app.staff_note)
  where id = p_id;

  perform public.write_audit(
    'admin_update_appointment',
    'appointments',
    p_id::text,
    jsonb_build_object(
      'admin_id', v_caller_id,
      'user_id', v_user_id,
      'old_status', v_old_status,
      'new_status', p_status,
      'staff_note', p_staff_note
    )
  );

  insert into public.notifications (user_id, type, message)
  values (
    v_user_id,
    'appointment_updated',
    'Your Davao Bank branch appointment status was updated to ' || initcap(p_status) || '.'
  );

  return jsonb_build_object(
    'success', true,
    'id', p_id,
    'old_status', v_old_status,
    'new_status', p_status
  );
end;
$$;

revoke all on function public.list_branches() from public, anon, authenticated;
revoke all on function public.list_open_slots(uuid, date) from public, anon, authenticated;
revoke all on function public.book_appointment(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.get_my_appointments() from public, anon, authenticated;
revoke all on function public.cancel_appointment(uuid) from public, anon, authenticated;
revoke all on function public.admin_list_appointments(text) from public, anon, authenticated;
revoke all on function public.admin_update_appointment(uuid, text, text) from public, anon, authenticated;

grant execute on function public.list_branches() to authenticated;
grant execute on function public.list_open_slots(uuid, date) to authenticated;
grant execute on function public.book_appointment(uuid, uuid, text) to authenticated;
grant execute on function public.get_my_appointments() to authenticated;
grant execute on function public.cancel_appointment(uuid) to authenticated;
grant execute on function public.admin_list_appointments(text) to authenticated;
grant execute on function public.admin_update_appointment(uuid, text, text) to authenticated;

-- ------------------------------------------------------------------------------
-- 6. Seed demo branches and slots (fictional Davao Bank branches)
-- ------------------------------------------------------------------------------

insert into public.branches (name, area, address) values
  ('Davao Bank – City Main (Demo)', 'Poblacion, Davao City', 'CM Recto St, Poblacion, Davao City 8000'),
  ('Davao Bank – Buhangin (Demo)', 'Buhangin, Davao City', 'Buhangin Commercial Center, Davao City'),
  ('Davao Bank – Matina (Demo)', 'Matina, Davao City', 'Matina Town Center, Davao City');

-- Slots: 09:00–11:00 Manila (30 min, capacity 2) for today + next 2 days.
insert into public.appointment_slots (branch_id, starts_at, ends_at, capacity)
select
  b.id,
  (((now() at time zone 'Asia/Manila')::date + d.day) + time '09:00' + (t.slot * interval '30 minutes')) at time zone 'Asia/Manila',
  ((((now() at time zone 'Asia/Manila')::date + d.day) + time '09:00' + (t.slot * interval '30 minutes')) + interval '30 minutes') at time zone 'Asia/Manila',
  2
from public.branches b
cross join generate_series(0, 2) as d(day)
cross join generate_series(0, 4) as t(slot)
where b.is_active;
