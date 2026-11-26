/* eslint-disable -- Phase 8 Bantay PGlite behavior checks */

export async function runPhase8BantayTests({ as, su, cust, one, bal, ok, U, A, B, biller }) {
  // ---- 1. Default security_limits provisioning + U.A spent_today verification
  const rLimitCount = await su(`select count(*)::int n from security_limits where user_id in ($1,$2)`, [U.A, U.B]);
  ok('Phase 8: seeded/existing profiles receive default security_limits row', rLimitCount[0].n === 2);

  // U.A had: sched weekly (1000) + 3 monthly (300) + step-up test (1) + emergency switch test (1) = 1302;
  // reversed tx-1 (30000), reversed bill-2 (5000), withdrawal wd-79 (1500), adjustments, deposits do not count.
  let r = await as('authenticated', U.A, `select get_security_settings() s`, [], { sub: U.A, aal: 'aal1' });
  const aSettings = r.rows?.[0]?.s;
  ok(
    'Phase 8: get_security_settings works at aal1 and excludes reversals/withdrawals/deposits',
    !r.err &&
      Number(aSettings?.daily_transfer_limit_centavos) === 5000000 &&
      Number(aSettings?.spent_today_centavos) === 1302 &&
      Number(aSettings?.remaining_today_centavos) === 5000000 - 1302,
    r.err || JSON.stringify(aSettings)
  );

  // ---- 2. Create fresh customer C ('Juan dela Cruz') to test trigger, lookup masking, and daily limits cleanly
  const C_UID = '55555555-5555-5555-5555-555555555555';
  await su(
    `insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values($1,$2,$3,now())`,
    [C_UID, 'c@t.test', JSON.stringify({ full_name: 'Juan dela Cruz' })]
  );
  await su(`insert into auth.mfa_factors(user_id,factor_type,status) values($1,'totp','verified')`, [C_UID]);
  const C = (await su(`select id, account_number from accounts where user_id=$1 limit 1`, [C_UID]))[0];
  // Stage 8D fixtures: enrollment at setup is not a real auth change, and C
  // already knows B's account in this legacy scenario.
  await su(`delete from security_events where user_id=$1 and kind='mfa_changed'`, [C_UID]);
  await su(`insert into trusted_payees(user_id,account_number) values($1,$2) on conflict do nothing`, [C_UID, B.account_number]);

  const cDefaultRow = await su(`select daily_transfer_limit_centavos from security_limits where user_id=$1`, [C_UID]);
  ok(
    'Phase 8: new user signup trigger provisions default 5,000,000 centavos limit',
    Number(cDefaultRow[0]?.daily_transfer_limit_centavos) === 5000000,
    JSON.stringify(cDefaultRow)
  );

  // ---- 3. RLS & permission checks on security_limits and internal helpers
  r = await cust(C_UID, `select count(*)::int n from security_limits where user_id=$1`, [C_UID]);
  ok('Phase 8 RLS: user can select own security_limits row', !r.err && one(r) === 1, r.err);

  r = await cust(U.B, `select count(*)::int n from security_limits where user_id=$1`, [C_UID]);
  ok('Phase 8 RLS: user B cannot select user C security_limits row', !r.err && one(r) === 0, r.err);

  r = await cust(
    C_UID,
    `update security_limits set daily_transfer_limit_centavos=50000000 where user_id=$1`,
    [C_UID]
  );
  ok('Phase 8 RLS: user cannot update security_limits directly', !!r.err, r.err);

  r = await cust(
    C_UID,
    `insert into security_limits(user_id,daily_transfer_limit_centavos) values($1,50000000)`,
    [U.B]
  );
  ok('Phase 8 RLS: user cannot insert security_limits directly', !!r.err, r.err);

  r = await cust(C_UID, `delete from security_limits where user_id=$1`, [C_UID]);
  ok('Phase 8 RLS: user cannot delete security_limits directly', !!r.err, r.err);

  r = await as('anon', null, `select * from security_limits`);
  ok('Phase 8 RLS: anon cannot read security_limits', !!r.err || (r.rows || []).length === 0, r.err);

  r = await as('anon', null, `select get_security_settings()`);
  ok('Phase 8: anon cannot call get_security_settings', /permission denied/.test(r.err || ''), r.err);

  r = await cust(C_UID, `select assert_daily_transfer_limit($1, 100, 'x')`, [C_UID]);
  ok('Phase 8: customer cannot call assert_daily_transfer_limit', /permission denied/.test(r.err || ''), r.err);

  r = await cust(C_UID, `select _spent_today_centavos($1)`, [C_UID]);
  ok('Phase 8: customer cannot call _spent_today_centavos', /permission denied/.test(r.err || ''), r.err);

  // ---- 4. set_daily_limit: aal2 requirement, range validation, audit log, return shape
  const cAal1 = { sub: C_UID, aal: 'aal1', amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }] };
  r = await as('authenticated', C_UID, `select set_daily_limit(200000)`, [], cAal1);
  ok('Phase 8 set_daily_limit: rejects aal1 with STEP_UP_REQUIRED', r.err === 'STEP_UP_REQUIRED', r.err);

  r = await as('authenticated', C_UID, `select set_daily_limit(200000)`, [], {
    sub: C_UID,
    aal: 'aal2',
    amr: [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) - 360 }],
  });
  ok('Phase 8 set_daily_limit: rejects expired TOTP with STEP_UP_EXPIRED', r.err === 'STEP_UP_EXPIRED', r.err);

  r = await as('anon', null, `select set_daily_limit(200000)`);
  ok('Phase 8 set_daily_limit: rejects anon', /permission denied/.test(r.err || ''), r.err);

  for (const badLimit of [0, -100, 99999, 50000001]) {
    r = await cust(C_UID, `select set_daily_limit($1)`, [badLimit]);
    ok(`Phase 8 set_daily_limit: rejects out-of-range ${badLimit}`, !!r.err, r.err);
  }
  r = await cust(C_UID, `select set_daily_limit(null::bigint)`);
  ok('Phase 8 set_daily_limit: rejects null', !!r.err, r.err);

  r = await cust(C_UID, `select set_daily_limit(100000) s`);
  ok(
    'Phase 8 set_daily_limit: accepts min boundary 100,000 centavos',
    !r.err && Number(r.rows?.[0]?.s?.daily_transfer_limit_centavos) === 100000,
    r.err || JSON.stringify(r.rows?.[0]?.s)
  );

  r = await cust(C_UID, `select set_daily_limit(50000000) s`);
  ok(
    'Phase 8 set_daily_limit: accepts max boundary 50,000,000 centavos',
    !r.err &&
      Number(r.rows?.[0]?.s?.daily_transfer_limit_centavos) === 100000 &&
      Number(r.rows?.[0]?.s?.pending_limit_centavos) === 50000000,
    r.err || JSON.stringify(r.rows?.[0]?.s)
  );
  // Stage 8D: the 12-hour wait is simulated by making the pending row due and
  // running the same cron apply step the database uses.
  await su(`update security_limits set pending_limit_effective_at = now() - interval '1 second' where user_id=$1`, [C_UID]);
  await su(`select apply_due_security_limits()`);
  r = await cust(C_UID, `select get_security_settings() s`);
  ok(
    'Stage 8D: pending limit raise is applied by the cron step',
    !r.err && Number(r.rows?.[0]?.s?.daily_transfer_limit_centavos) === 50000000 &&
      r.rows?.[0]?.s?.pending_limit_centavos === null,
    r.err || JSON.stringify(r.rows?.[0]?.s)
  );

  r = await cust(C_UID, `select set_daily_limit(100000) s`);
  const limitAudit = await su(
    `select actor_id, action, entity, entity_id, metadata from audit_logs where action='daily_limit_updated' and entity_id=$1 order by created_at desc limit 1`,
    [C_UID]
  );
  ok(
    'Phase 8 set_daily_limit: writes audit row with old/new limit',
    !r.err &&
      limitAudit.length === 1 &&
      limitAudit[0].entity === 'security_limits' &&
      Number(limitAudit[0].metadata?.old_limit_centavos) === 50000000 &&
      Number(limitAudit[0].metadata?.new_limit_centavos) === 100000,
    JSON.stringify(limitAudit[0])
  );

  // ---- 5. Daily limit enforcement across multiple transfers & bills in one Manila day + reset next day
  r = await cust(C_UID, `select deposit($1, 500000, 'p8-dep-c', 'fund C')`, [C.id]);
  ok('Phase 8: deposit for C succeeds and does not count toward spent_today', !r.err, r.err);

  r = await cust(C_UID, `select transfer($1, $2, 40000, 'p8-tx-1', 'one')`, [C.id, B.id]);
  ok('Phase 8: transfer 1 (40,000 / 100,000) succeeds', !r.err, r.err);

  r = await cust(C_UID, `select transfer_by_account_number($1, $2, 30000, 'p8-tx-2', 'two')`, [C.id, B.account_number]);
  ok('Phase 8: transfer_by_account_number 2 (30,000 → 70,000 / 100,000) succeeds', !r.err, r.err);

  r = await cust(C_UID, `select pay_bill($1, $2, '1234567890', 20000, 'p8-bill-1')`, [C.id, biller.id]);
  ok('Phase 8: bill payment 3 (20,000 → 90,000 / 100,000) succeeds', !r.err, r.err);

  r = await cust(C_UID, `select get_security_settings() s`);
  const sMid = r.rows?.[0]?.s;
  ok(
    'Phase 8: get_security_settings tracks cumulative transfers + bill payments (90,000 spent, 10,000 left)',
    !r.err && Number(sMid?.spent_today_centavos) === 90000 && Number(sMid?.remaining_today_centavos) === 10000,
    r.err || JSON.stringify(sMid)
  );

  // Payment request exceeding remaining limit is rejected
  r = await cust(U.B, `select create_payment_request($1, $2, 15000, 'exceed') r`, [B.id, C.account_number]);
  const p8ReqId = r.rows?.[0]?.r?.id;
  const cBalBeforeReject = await bal(C.id);
  r = await cust(C_UID, `select pay_payment_request($1, $2, 'p8-pr-over')`, [p8ReqId, C.id]);
  ok(
    'Phase 8: pay_payment_request over daily limit rejected with "Daily limit reached"',
    r.err === 'Daily limit reached' && (await bal(C.id)) === cBalBeforeReject,
    r.err
  );

  // Direct transfer exceeding remaining limit by 1 centavo is rejected
  r = await cust(C_UID, `select transfer($1, $2, 10001, 'p8-tx-over', 'over')`, [C.id, B.id]);
  ok(
    'Phase 8: transfer exceeding daily limit by 1 centavo rejected with "Daily limit reached"',
    r.err === 'Daily limit reached' && (await bal(C.id)) === cBalBeforeReject,
    r.err
  );

  // Exact remaining amount succeeds (10,000 -> 100,000 / 100,000)
  r = await cust(C_UID, `select transfer($1, $2, 10000, 'p8-tx-exact', 'exact')`, [C.id, B.id]);
  ok('Phase 8: transfer for exact remaining limit (10,000) succeeds', !r.err, r.err);

  // Idempotent replay of the exact-limit transfer still succeeds when limit is full
  r = await cust(C_UID, `select transfer($1, $2, 10000, 'p8-tx-exact', 'exact') r`, [C.id, B.id]);
  ok(
    'Phase 8: idempotent replay succeeds even when daily limit is 0 remaining',
    !r.err && r.rows?.[0]?.r?.idempotent_replay === true,
    r.err || JSON.stringify(r.rows)
  );

  // Scheduled payment due today fails cleanly when daily limit is reached
  const todayManila = (await su(`select (now() at time zone 'Asia/Manila')::date d`))[0].d;
  r = await cust(
    C_UID,
    `select create_scheduled_payment($1, 'transfer', $2, null, null, 100, 'once', $3, null, null, 'p8-limit-sched')`,
    [C.id, B.id, todayManila]
  );
  const cBalAtCap = await bal(C.id);
  await su(`select run_due_scheduled_payments()`);
  const schedRun = await su(
    `select r.status, r.failure_reason from scheduled_payment_runs r join scheduled_payments s on s.id=r.schedule_id where s.note='p8-limit-sched'`
  );
  ok(
    'Phase 8: scheduled payment hitting daily limit records failed run ("Daily limit reached") without moving money',
    schedRun[0]?.status === 'failed' &&
      schedRun[0]?.failure_reason === 'Daily limit reached' &&
      (await bal(C.id)) === cBalAtCap,
    JSON.stringify(schedRun[0])
  );

  // Withdrawal & incoming transfer are not blocked by outgoing daily transfer limit
  r = await cust(C_UID, `select withdraw($1, 5000, 'p8-wd-1', 'atm')`, [C.id]);
  ok('Phase 8: cash-out withdrawal is not blocked by daily transfer limit', !r.err, r.err);

  r = await cust(U.B, `select transfer($1, $2, 5000, 'p8-in-1', 'incoming')`, [B.id, C.id]);
  ok('Phase 8: incoming transfer to C does not consume C daily limit', !r.err, r.err);

  // Simulate Manila day rollover: move C's outgoing transfers/bills to 1 second before today's Manila midnight
  await su(
    `update transactions
     set created_at = ((now() at time zone 'Asia/Manila')::date::timestamp at time zone 'Asia/Manila') - interval '1 second'
     where idempotency_key in ('p8-tx-1', 'p8-tx-2', 'p8-bill-1', 'p8-tx-exact')`
  );
  r = await cust(C_UID, `select get_security_settings() s`);
  const sReset = r.rows?.[0]?.s;
  ok(
    'Phase 8: daily spent resets to 0 on next Manila day (23:59:59 Manila yesterday excluded)',
    !r.err && Number(sReset?.spent_today_centavos) === 0 && Number(sReset?.remaining_today_centavos) === 100000,
    r.err || JSON.stringify(sReset)
  );

  r = await cust(C_UID, `select transfer($1, $2, 50000, 'p8-tx-nextday', 'next day')`, [C.id, B.id]);
  ok('Phase 8: transfer succeeds after Manila day reset', !r.err, r.err);

  // Exact Manila midnight today (00:00:00+08) IS included in today's spent
  await su(
    `update transactions
     set created_at = ((now() at time zone 'Asia/Manila')::date::timestamp at time zone 'Asia/Manila')
     where idempotency_key = 'p8-tx-nextday'`
  );
  r = await cust(C_UID, `select get_security_settings() s`);
  ok(
    'Phase 8: transaction at exact 00:00:00 Asia/Manila today counts toward today',
    !r.err && Number(r.rows?.[0]?.s?.spent_today_centavos) === 50000,
    r.err || JSON.stringify(r.rows?.[0]?.s)
  );

  // Lowering limit below already-spent amount clamps remaining_today_centavos to 0 and blocks new transfers
  await cust(C_UID, `select set_daily_limit(200000)`);
  await su(`update security_limits set pending_limit_effective_at = now() - interval '1 second' where user_id=$1`, [C_UID]);
  await su(`select apply_due_security_limits()`);
  await cust(C_UID, `select transfer($1, $2, 100000, 'p8-tx-high', 'high')`, [C.id, B.id]); // spent_today = 150,000
  r = await cust(C_UID, `select set_daily_limit(100000) s`);
  const sClamped = r.rows?.[0]?.s;
  ok(
    'Phase 8: lowering limit below spent_today clamps remaining_today_centavos to 0',
    !r.err && Number(sClamped?.spent_today_centavos) === 150000 && Number(sClamped?.remaining_today_centavos) === 0,
    r.err || JSON.stringify(sClamped)
  );
  r = await cust(C_UID, `select transfer($1, $2, 1, 'p8-tx-after-lower', 'blocked')`, [C.id, B.id]);
  ok('Phase 8: transfer blocked when spent_today exceeds lowered limit', r.err === 'Daily limit reached', r.err);

  // Unenrolled user calling set_daily_limit gets STEP_UP_NOT_ENROLLED
  await su(`delete from auth.mfa_factors where user_id=$1`, [C_UID]);
  r = await as('authenticated', C_UID, `select set_daily_limit(200000)`, [], cAal1);
  ok('Phase 8 set_daily_limit: unenrolled caller gets STEP_UP_NOT_ENROLLED', r.err === 'STEP_UP_NOT_ENROLLED', r.err);
  await su(`insert into auth.mfa_factors(user_id,factor_type,status) values($1,'totp','verified')`, [C_UID]);

  // ---- 6. lookup_payee masking, active check, and no name/id leak
  r = await cust(U.A, `select * from lookup_payee($1)`, [C.account_number]);
  const lpRow = r.rows?.[0];
  ok(
    'Phase 8 lookup_payee: masks "Juan dela Cruz" as "J*** d*** C***" and returns account_type only',
    !r.err &&
      r.rows.length === 1 &&
      lpRow.masked_name === 'J*** d*** C***' &&
      lpRow.account_type === 'savings' &&
      Object.keys(lpRow).length === 2 &&
      !JSON.stringify(lpRow).includes('Juan') &&
      !JSON.stringify(lpRow).includes(C_UID),
    r.err || JSON.stringify(lpRow)
  );

  // Multi-space & accented name masking
  await su(`update profiles set full_name = '  José   Maria  Santos ' where id = $1`, [C_UID]);
  r = await cust(U.A, `select * from lookup_payee($1)`, [C.account_number]);
  ok(
    'Phase 8 lookup_payee: normalizes extra spaces and handles Unicode characters',
    !r.err && r.rows?.[0]?.masked_name === 'J*** M*** S***',
    r.err || JSON.stringify(r.rows)
  );

  // Single-word name masking
  await su(`update profiles set full_name = 'Cher' where id = $1`, [C_UID]);
  r = await cust(U.A, `select * from lookup_payee($1)`, [C.account_number]);
  ok(
    'Phase 8 lookup_payee: masks single-word name',
    !r.err && r.rows?.[0]?.masked_name === 'C***',
    r.err || JSON.stringify(r.rows)
  );

  // Inactive (frozen) account returns no row
  await su(`update accounts set status = 'frozen' where id = $1`, [C.id]);
  r = await cust(U.A, `select * from lookup_payee($1)`, [C.account_number]);
  ok('Phase 8 lookup_payee: frozen account returns no row', !r.err && r.rows.length === 0, r.err || JSON.stringify(r.rows));
  await su(`update accounts set status = 'active' where id = $1`, [C.id]);

  // Nonexistent and blank account numbers return no row
  r = await cust(U.A, `select * from lookup_payee('1099999999')`);
  ok('Phase 8 lookup_payee: nonexistent account returns no row', !r.err && r.rows.length === 0, r.err);

  r = await cust(U.A, `select * from lookup_payee('   ')`);
  ok('Phase 8 lookup_payee: blank account returns no row', !r.err && r.rows.length === 0, r.err);

  // Anon cannot call lookup_payee
  r = await as('anon', null, `select * from lookup_payee($1)`, [C.account_number]);
  ok('Phase 8 lookup_payee: anon cannot execute lookup_payee', /permission denied/.test(r.err || ''), r.err);
}
