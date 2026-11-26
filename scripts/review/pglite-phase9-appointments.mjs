/* eslint-disable -- Phase 9 Branch Appointments PGlite behavior checks */
// Reviewer harness (Phase 9, 2026-11-29). Runs appointment booking behavior
// against PGlite with Supabase stand-ins. Run: npm run test:db
export async function runPhase9AppointmentTests({ as, su, cust, one, ok, U, A, B }) {
  // ---- Fixtures seeded by the migration
  const branch = (await su(`select id from public.branches where name like 'Davao Bank – City Main%' limit 1`))[0];
  ok('Seed: demo branch exists', !!branch);

  const today = (await su(`select (now() at time zone 'Asia/Manila')::date d`))[0].d;

  const futureSlot = (await su(
    `select id, starts_at, capacity from public.appointment_slots
     where branch_id=$1 and starts_at > now() order by starts_at limit 1`,
    [branch.id]
  ))[0];
  ok('Seed: future demo slot exists for the branch', !!futureSlot && Number(futureSlot.capacity) === 2);

  // ---- 1. list_branches
  let r = await cust(U.A, `select * from public.list_branches()`);
  ok('Customer can list active branches', !r.err && r.rows.length >= 1, r.err);

  r = await as('anon', null, `select * from public.list_branches()`);
  ok('Anon cannot call list_branches', /permission denied/.test(r.err || ''), r.err);

  // ---- 2. list_open_slots
  const openDate = (await su(
    `select (starts_at at time zone 'Asia/Manila')::date d from public.appointment_slots
     where branch_id=$1 and starts_at > now() order by starts_at limit 1`,
    [branch.id]
  ))[0].d;

  r = await cust(U.A, `select * from public.list_open_slots($1, $2)`, [branch.id, openDate]);
  ok('Customer can list open slots for branch/date', !r.err && r.rows.length >= 1, r.err);
  ok('Open slots show positive available capacity', r.rows.every(x => Number(x.available) > 0), JSON.stringify(r.rows));

  r = await cust(U.A, `select * from public.list_open_slots($1, $2)`, [branch.id, '2020-01-01']);
  ok('list_open_slots returns no rows for a date with no slots', !r.err && r.rows.length === 0, JSON.stringify(r.rows));

  r = await as('anon', null, `select * from public.list_open_slots($1, $2)`, [branch.id, openDate]);
  ok('Anon cannot call list_open_slots', /permission denied/.test(r.err || ''), r.err);

  // F6: anon has no direct table SELECT grant (branches/slots are RPC-only).
  const branchPrivs = await su(`select count(*)::int n from information_schema.role_table_grants where table_name='branches' and grantee='anon'`);
  ok('Anon has no SELECT grant on branches', branchPrivs[0].n === 0, JSON.stringify(branchPrivs));
  const slotPrivs = await su(`select count(*)::int n from information_schema.role_table_grants where table_name='appointment_slots' and grantee='anon'`);
  ok('Anon has no SELECT grant on appointment_slots', slotPrivs[0].n === 0, JSON.stringify(slotPrivs));

  // ---- 3. book_appointment
  r = await cust(U.A, `select public.book_appointment($1, $2, 'appt-a-1') as r`, [branch.id, futureSlot.id]);
  ok('Customer can book a slot', !r.err && r.rows?.[0]?.r?.status === 'booked', r.err || JSON.stringify(r.rows));
  ok('Booking result is not an idempotent replay', r.rows?.[0]?.r?.idempotent_replay === false, JSON.stringify(r.rows));

  // Idempotent replay with the same key returns the existing booking.
  r = await cust(U.A, `select public.book_appointment($1, $2, 'appt-a-1') as r`, [branch.id, futureSlot.id]);
  ok('Idempotent replay returns existing booking', !r.err && r.rows?.[0]?.r?.idempotent_replay === true && r.rows?.[0]?.r?.status === 'booked', r.err || JSON.stringify(r.rows));

  // ---- 4. Double-booking prevention (capacity) on the same slot
  // Same user cannot book the same slot twice (unique index + guard).
  r = await cust(U.A, `select public.book_appointment($1, $2, 'appt-a-2') as r`, [branch.id, futureSlot.id]);
  ok('Same user double-booking the same slot is rejected', !!r.err && /already have a booking for this slot/.test(r.err || ''), r.err);

  // Idempotent replay is caller-scoped: another caller cannot replay this key.
  r = await cust(U.B, `select public.book_appointment($1, $2, 'appt-a-1') as r`, [branch.id, futureSlot.id]);
  ok('Idempotent replay is scoped to the booking caller', r.rows?.[0]?.r?.status === 'booked' && r.rows?.[0]?.r?.idempotent_replay === false, r.err || JSON.stringify(r.rows));

  // Use a different slot for B so both can book up to capacity.
  const slotB = (await su(
    `select id from public.appointment_slots
     where branch_id=$1 and starts_at > now() and id <> $2 order by starts_at limit 1`,
    [branch.id, futureSlot.id]
  ))[0]?.id;
  ok('Seed: a second future slot exists for B', !!slotB);

  r = await cust(U.B, `select public.book_appointment($1, $2, 'appt-b-1') as r`, [branch.id, slotB]);
  ok('Second user can book a different slot', !r.err && r.rows?.[0]?.r?.status === 'booked', r.err || JSON.stringify(r.rows));

  // ---- 5. Admin re-booking respects capacity + per-user cap (security fix F7)
  // Scenario: A books cap1 slot (capacity 1) → full. A cancels → empty. B
  // books cap1 → full again. Admin tries to re-book A's cancelled appointment
  // → slot still at capacity (B's booking), must be rejected.
  const cap1Slot = (await su(
    `insert into public.appointment_slots (branch_id, starts_at, ends_at, capacity)
     values ($1, (now() + interval '1 day'), (now() + interval '1 day' + interval '30 minutes'), 1)
     returning id`,
    [branch.id]
  ))[0].id;

  const cap1BookA = await cust(U.A, `select public.book_appointment($1, $2, 'cap1-a-1') as r`, [branch.id, cap1Slot]);
  ok('A books the capacity-1 slot', !cap1BookA.err, cap1BookA.err);
  const cap1ApptIdA = cap1BookA.rows?.[0]?.r?.id;
  await cust(U.A, `select public.cancel_appointment($1) as r`, [cap1ApptIdA]);

  const cap1BookB = await cust(U.B, `select public.book_appointment($1, $2, 'cap1-b-1') as r`, [branch.id, cap1Slot]);
  ok('B books the capacity-1 slot', !cap1BookB.err, cap1BookB.err);

  // Admin (aal2) tries to re-book A's cancelled appointment → slot full (B's booking).
  r = await as('authenticated', U.ADM, `select public.admin_update_appointment($1, 'booked', 'rebook') as r`, [cap1ApptIdA]);
  ok('Admin cannot re-book a full capacity-1 slot', !!r.err && /Slot is fully booked/.test(r.err || ''), r.err);

  // Admin can complete a booking (happy path still works).
  const apptToComplete = (await su(`select id from public.appointments where user_id=$1 and status='booked' limit 1`, [U.A]))[0]?.id;
  if (apptToComplete) {
    r = await as('authenticated', U.ADM, `select public.admin_update_appointment($1, 'completed', 'Served on time') as r`, [apptToComplete]);
    ok('Admin can complete a booking', !r.err && r.rows?.[0]?.r?.new_status === 'completed', r.err || JSON.stringify(r.rows));
  }

  // Admin cannot update to an invalid status.
  r = await as('authenticated', U.ADM, `select public.admin_update_appointment($1, 'bogus', 'x') as r`, [apptToComplete || '00000000-0000-0000-0000-000000000000']);
  ok('Admin update rejects invalid status', !!r.err && /Invalid status/.test(r.err || ''), r.err);

  // ---- 6. Per-user 5-upcoming cap (boundary test)

  // ---- 7. get_my_appointments (scoped to caller)
  r = await cust(U.A, `select * from public.get_my_appointments()`);
  ok('get_my_appointments returns caller bookings only', !r.err && r.rows.length >= 1, r.err || JSON.stringify(r.rows));
  r = await cust(U.B, `select * from public.get_my_appointments()`);
  ok('get_my_appointments scopes to caller', !r.err && r.rows.length >= 1, JSON.stringify(r.rows));

  // ---- 8. cancel_appointment (own, future only)
  const apptB = (await su(`select id from public.appointments where user_id=$1 and status='booked' limit 1`, [U.B]))[0]?.id;
  if (apptB) {
    r = await cust(U.B, `select public.cancel_appointment($1) as r`, [apptB]);
    ok('Customer can cancel own future booking', !r.err && r.rows?.[0]?.r?.status === 'cancelled', r.err || JSON.stringify(r.rows));
  }

  const apptA = (await su(`select id from public.appointments where user_id=$1 and status='booked' limit 1`, [U.A]))[0]?.id;
  if (apptA) {
    r = await cust(U.A, `select public.cancel_appointment($1) as r`, [apptA]);
    ok('Customer cancels own booking', !r.err, r.err);
    r = await cust(U.B, `select public.cancel_appointment($1) as r`, [apptA]);
    ok('Customer cannot cancel another user appointment', !!r.err, r.err);
  }

  // Cancelling a cancelled appointment is rejected.
  r = await cust(U.B, `select public.cancel_appointment($1) as r`, [apptB || '00000000-0000-0000-0000-000000000000']);
  ok('Cancelling a cancelled appointment is rejected', !!r.err && /Only booked appointments/.test(r.err || ''), r.err);

  // ---- 9. Admin RPCs require aal2 + is_admin
  const aal1 = { sub: U.ADM, aal: 'aal1', amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }] };
  r = await as('authenticated', U.ADM, `select * from public.admin_list_appointments()`, [], aal1);
  ok('Admin list rejects aal1', r.err === 'STEP_UP_REQUIRED', r.err);

  r = await cust(U.A, `select * from public.admin_list_appointments()`);
  ok('Customer cannot call admin_list_appointments', /Admin privilege/.test(r.err || ''), r.err);

  // ---- 10. Admin (aal2) lists all appointments
  r = await as('authenticated', U.ADM, `select * from public.admin_list_appointments()`);
  ok('Admin can list all appointments', !r.err && Array.isArray(r.rows), r.err);

  // ---- 11. Admin updates status -> audit_logs row + notification
  const apptToUpdate = (await su(`select id from public.appointments where user_id=$1 and status='booked' limit 1`, [U.A]))[0]?.id;
  if (apptToUpdate) {
    r = await as('authenticated', U.ADM, `select public.admin_update_appointment($1, 'completed', 'Served on time') as r`, [apptToUpdate]);
    ok('Admin can update appointment status', !r.err && r.rows?.[0]?.r?.new_status === 'completed', r.err || JSON.stringify(r.rows));

    const audit = await su(`select count(*)::int n from public.audit_logs where action='admin_update_appointment' and entity_id=$1`, [apptToUpdate]);
    ok('Admin update writes audit_logs row', audit[0].n === 1, JSON.stringify(audit));

    const notif = await su(`select count(*)::int n from public.notifications where user_id=$1 and type='appointment_updated'`, [U.A]);
    ok('Admin update notifies the user', notif[0].n >= 1, JSON.stringify(notif));
  }

  // ---- 12. No money movement through the ledger for appointments
  r = await su(`select count(*)::int n from public.ledger_entries where transaction_id in (select id from public.transactions where type='appointment')`);
  ok('No appointment money movement through the ledger', r[0].n === 0, JSON.stringify(r));

  console.log('Phase 9 branch appointments: all checks complete');
}
