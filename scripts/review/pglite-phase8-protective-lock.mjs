// Local-only PGlite checks for Phase 8 Stage 8J Bantay protective lock.
// No hosted writes, no .env access, no money-engine changes under test.

export async function runPhase8ProtectiveLockTests({ as, su, cust, ok, U, A, B, biller }) {
  const freshClaims = (uid) => ({
    sub: uid,
    aal: 'aal2',
    amr: [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) }],
  });
  const aal1Claims = (uid) => ({
    sub: uid,
    aal: 'aal1',
    amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }],
  });
  const today = (await su(`select (now() at time zone 'Asia/Manila')::date d`))[0].d;

  const makeUser = async (id, email) => {
    await su(
      `insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values($1,$2,$3,now())`,
      [id, email, JSON.stringify({ full_name: 'Protective lock test' })]
    );
    await su(`insert into auth.mfa_factors(user_id,factor_type,status) values($1,'totp','verified')`, [id]);
    await su(`delete from security_events where user_id=$1 and kind='mfa_changed'`, [id]);
    return (await su(`select id,account_number from accounts where user_id=$1 limit 1`, [id]))[0];
  };

  const PL = 'ab100001-0000-4000-8000-000000000001';
  const PLACC = await makeUser(PL, 'protective-lock@t.test');
  await cust(PL, `select deposit($1,500000,'p8j-fund','fund')`, [PLACC.id]);

  const locked = async (uid) =>
    (await su(`select locked_at is not null l from security_limits where user_id=$1`, [uid]))[0].l === true;
  const kindCount = async (uid, kind) =>
    Number((await su(`select count(*)::int n from security_events where user_id=$1 and kind=$2`, [uid, kind]))[0].n);
  const freezeNotes = async (uid) =>
    await su(
      `select type,message from notifications where user_id=$1 and type='bantay_protective_lock' order by created_at,id`,
      [uid]
    );
  const systemCases = async (uid) =>
    await su(`select id,event_id,status,staff_note from security_cases where user_id=$1 and opened_by='system'`, [uid]);

  // 1. A single high signal must not freeze.
  await su(`select _bantay_event($1,'code_failures','high',80,'{}'::jsonb)`, [PL]);
  ok(
    '8J: one high signal does not freeze',
    !(await locked(PL)) &&
      (await kindCount(PL, 'protective_lock')) === 0 &&
      (await freezeNotes(PL)).length === 0
  );

  // 2. A second distinct signal in the window freezes via the existing 8D lock.
  // An already-active schedule must be paused by the reused _lock_account.
  await su(
    `insert into scheduled_payments(owner_id,from_account,kind,to_account,amount,frequency,start_date,next_run_date,status)
     values($1,$2,'transfer',$3,1000,'once',$4,$4,'active')`,
    [PL, PLACC.id, B.id, today]
  );
  await su(`select _bantay_event($1,'new_device','warning')`, [PL]);
  const pe = await su(
    `select severity,facts->>'reason' reason from security_events where user_id=$1 and kind='protective_lock'`,
    [PL]
  );
  const pc = await systemCases(PL);
  const pn = await freezeNotes(PL);
  ok(
    '8J: two distinct signals in 15 minutes freeze with one high protective_lock event',
    (await locked(PL)) && pe.length === 1 && pe[0].severity === 'high' && pe[0].reason === 'protective',
    JSON.stringify(pe)
  );
  ok(
    '8J: one system security case opens on the protective_lock event',
    pc.length === 1 && pc[0].event_id &&
      Number((await su(`select count(*)::int n from security_events where id=$1`, [pc[0].event_id]))[0].n) === 1,
    JSON.stringify(pc)
  );
  ok(
    '8J: protective_lock facts carry masked categories, window and case id',
    Number(
      (
        await su(
          `select count(*)::int n from security_events where user_id=$1 and kind='protective_lock'
             and severity='high' and facts->'categories' ? 'C1' and facts->'categories' ? 'C2'
             and facts->>'case_id'=$2::text and facts->>'window_minutes'='15'`,
          [PL, pc[0].id]
        )
      )[0].n
    ) === 1
  );
  ok(
    '8J: reused lock pauses active schedules and the audit actor is system',
    (await su(`select count(*)::int n from scheduled_payments where owner_id=$1 and status='paused'`, [PL]))[0].n >= 1 &&
      Number(
        (
          await su(
            `select count(*)::int n from audit_logs where action='protective_lock'
               and actor_role='system' and entity_id=$1::text`,
            [PL]
          )
        )[0].n
      ) === 1
  );
  ok(
    '8J: exact bantay_protective_lock notification copy, no ids or exclamation marks',
    pn.length === 1 &&
      pn[0].message ===
        'We froze your account to protect your money. No money can leave until you confirm it\'s you. Davao Bank will never ask you to move your money.' &&
      !pn[0].message.includes(PL) &&
      !pn[0].message.includes('!'),
    JSON.stringify(pn.map((n) => n.message))
  );
  ok(
    '8J: protective event emits no generic account_alert notification',
    Number(
      (
        await su(
          `select count(*)::int n from notifications where user_id=$1 and type='account_alert'
             and message='Bantay recorded a security event on your account. Review it in Bantay.'`,
          [PL]
        )
      )[0].n
    ) === 0
  );
  ok(
    '8J: protective_lock audit row records the case',
    Number(
      (
        await su(
          `select count(*)::int n from audit_logs where action='protective_lock' and entity_id=$1::text and metadata->>'case_id'=$2::text`,
          [PL, pc[0].id]
        )
      )[0].n
    ) === 1
  );

  // 3. The evaluator is internal only.
  const direct = await cust(PL, `select _bantay_maybe_protective_lock($1)`, [PL]);
  ok('8J: no client can call the evaluator', /permission denied/.test(direct.err || ''), direct.err || 'allowed');
  const directLock = await cust(PL, `select _lock_account($1,'bantay')`, [PL]);
  ok('8J: no client can call the lock helper', /permission denied/.test(directLock.err || ''), directLock.err || 'allowed');
  const peek = await as('authenticated', U.B, `select
      (select count(*)::int from security_events where user_id=$1 and kind='protective_lock') e,
      (select count(*)::int from security_cases where user_id=$1 and opened_by='system') c,
      (select count(*)::int from notifications where user_id=$1 and type='bantay_protective_lock') n`, [PL]);
  ok(
    '8J: another customer cannot read this protective event, case or notification',
    !peek.err && peek.rows?.[0]?.e === 0 && peek.rows?.[0]?.c === 0 && peek.rows?.[0]?.n === 0,
    peek.err || JSON.stringify(peek.rows)
  );

  // 4. Money RPCs refuse while frozen; deposits and incoming money still work.
  let r = await cust(PL, `select transfer($1,$2,1000,'p8j-frozen-transfer','x')`, [PLACC.id, B.id]);
  ok('8J: transfer refused while frozen', r.err === 'Account locked', r.err);
  r = await cust(PL, `select withdraw($1,1000,'p8j-frozen-wd','atm')`, [PLACC.id]);
  ok('8J: withdrawal refused while frozen', r.err === 'Account locked', r.err);
  r = await cust(PL, `select pay_bill($1,$2,'1234567890',1000,'p8j-frozen-bill')`, [PLACC.id, biller.id]);
  ok('8J: bill pay refused while frozen', r.err === 'Account locked', r.err);
  r = await cust(
    PL,
    `select create_scheduled_payment($1,'transfer',$2,null,null,1000,'once',$3,null,null,'p8j-frozen-sched')`,
    [PLACC.id, B.id, today]
  );
  ok('8J: schedule creation refused while frozen', r.err === 'Account locked', r.err);
  const req = await cust(U.B, `select create_payment_request($1,$2,1000,'p8j-locked-req') x`, [B.id, PLACC.account_number]);
  const reqId = req.rows?.[0]?.x?.id ||
    (await su(`select id from payment_requests where note='p8j-locked-req' order by created_at desc limit 1`))[0]?.id;
  r = await cust(PL, `select pay_payment_request($1::uuid,$2::uuid,$3::text)`, [reqId, PLACC.id, 'p8j-locked-pay']);
  ok('8J: paying a request refused while frozen', r.err === 'Account locked', `${r.err || ''} (request ${reqId})`);

  await su(
    `insert into scheduled_payments(owner_id,from_account,kind,to_account,amount,frequency,start_date,next_run_date,status)
     values($1,$2,'transfer',$3,2000,'once',$4,$4,'active')`,
    [PL, PLACC.id, B.id, today]
  );
  await su(`select run_due_scheduled_payments()`);
  const frozenRun = (await su(
    `select r.status,r.failure_reason from scheduled_payment_runs r
       join scheduled_payments s on s.id=r.schedule_id
      where s.owner_id=$1 and s.amount=2000 order by r.created_at desc limit 1`,
    [PL]
  ))[0];
  ok(
    '8J: cron run still fails with Account locked (runner unchanged)',
    frozenRun?.status === 'failed' && frozenRun?.failure_reason === 'Account locked',
    JSON.stringify(frozenRun)
  );

  r = await cust(PL, `select deposit($1,1000,'p8j-frozen-deposit','ok')`, [PLACC.id]);
  ok('8J: deposit still works while frozen', !r.err, r.err);
  await su(
    `insert into trusted_payees(user_id,account_number) values($1,$2) on conflict do nothing`,
    [U.B, PLACC.account_number]
  );
  r = await cust(U.B, `select transfer($1,$2,1000,'p8j-incoming-frozen','ok')`, [B.id, PLACC.id]);
  ok('8J: incoming transfer still works while frozen', !r.err, r.err);

  // 5. Repeating the evaluation cannot make a second freeze in the same hour.
  await su(`select _bantay_event($1,'code_failures','high',80,'{}'::jsonb)`, [PL]);
  await su(`select _bantay_event($1,'signin_failures','warning',25)`, [PL]);
  ok(
    '8J: repeated signals inside the hour stay at one freeze, case and notification',
    (await kindCount(PL, 'protective_lock')) === 1 &&
      (await systemCases(PL)).length === 1 &&
      (await freezeNotes(PL)).length === 1
  );

  // 6. Customer unlock keeps the existing password + TOTP + one-hour path.
  r = await as('authenticated', PL, `select request_unlock()`, [], aal1Claims(PL));
  ok('8J: customer unlock still needs aal2', r.err === 'STEP_UP_REQUIRED', r.err);
  r = await cust(PL, `select request_unlock() s`);
  ok('8J: request_unlock sets unlock_after', !r.err && new Date(r.rows?.[0]?.s?.unlock_after) > new Date(), r.err);
  r = await cust(PL, `select complete_unlock()`);
  ok('8J: complete before unlock_after is still rejected', r.err === 'Unlock not available yet', r.err);
  await su(`update security_limits set unlock_after=now()-interval '1 second' where user_id=$1`, [PL]);
  r = await cust(PL, `select complete_unlock() s`);
  ok('8J: complete_unlock clears the existing lock', !r.err && r.rows?.[0]?.s?.locked === false, r.err);
  r = await cust(PL, `select transfer($1,$2,1000,'p8j-after-customer-unlock','ok')`, [PLACC.id, A.id]);
  ok('8J: money works again after customer unlock', !r.err, r.err);

  // 7. Rate limit outlives the unlock: no second protective lock this hour.
  await su(`select _bantay_event($1,'code_failures','high',80,'{}'::jsonb)`, [PL]);
  await su(`select _bantay_event($1,'new_device','warning')`, [PL]);
  ok(
    '8J: max one protective lock per user per hour, even after unlock',
    (await kindCount(PL, 'protective_lock')) === 1 &&
      (await freezeNotes(PL)).length === 1 &&
      !(await locked(PL))
  );

  // 8. A fresh user can freeze; staff unfreeze uses the unchanged admin RPC.
  const ST = 'ab100001-0000-4000-8000-000000000002';
  const STACC = await makeUser(ST, 'protective-staff@t.test');
  await cust(ST, `select deposit($1,100000,'p8j-staff-fund','fund')`, [STACC.id]);
  await su(`select _bantay_event($1,'code_failures','high',80,'{}'::jsonb)`, [ST]);
  await su(`select _bantay_event($1,'risky_payment_challenged','high',85,'{}'::jsonb)`, [ST]);
  ok('8J: code failures plus a high-risk payment attempt also freeze', await locked(ST));
  r = await as('authenticated', ST, `select admin_unlock_user($1,'attempt') u`, [ST], freshClaims(ST));
  ok('8J: customer cannot use the staff unlock path', /Admin privilege required/.test(r.err || ''), r.err);
  r = await as('authenticated', U.ADM, `select admin_unlock_user($1,'aal1 attempt') u`, [ST], aal1Claims(U.ADM));
  ok('8J: staff unlock still needs aal2', r.err === 'STEP_UP_REQUIRED', r.err);
  r = await as('authenticated', U.ADM, `select admin_unlock_user($1,'drill cleanup') u`, [ST], freshClaims(U.ADM));
  ok('8J: admin_unlock_user still unfreezes at aal2', !r.err && r.rows?.[0]?.u?.ok === true, r.err);
  ok(
    '8J: staff unlock writes the existing audit row and keeps the system case',
    !(await locked(ST)) &&
      Number(
        (
          await su(
            `select count(*)::int n from audit_logs where action='account_unlocked' and entity_id=$1::text and metadata->>'method'='staff'`,
            [ST]
          )
        )[0].n
      ) >= 1 &&
      (await systemCases(ST)).length === 1
  );

  // 9. Distinct-category rule: repeats inside one category and a C2+C3 pair.
  const SAME = 'ab100001-0000-4000-8000-000000000004';
  await makeUser(SAME, 'protective-same@t.test');
  await su(`select _bantay_event($1,'code_failures','high',80,'{}'::jsonb)`, [SAME]);
  await su(`select _bantay_event($1,'code_failures','high',80,'{}'::jsonb)`, [SAME]);
  ok(
    '8J: two events in the same high-signal category do not freeze',
    !(await locked(SAME)) && (await kindCount(SAME, 'protective_lock')) === 0,
    JSON.stringify(await su(`select kind,severity from security_events where user_id=$1`, [SAME]))
  );
  const C23 = 'ab100001-0000-4000-8000-000000000005';
  await makeUser(C23, 'protective-c23@t.test');
  await su(`select _bantay_event($1,'new_device','warning')`, [C23]);
  await su(`select _bantay_event($1,'risky_payment_challenged','high',85,'{}'::jsonb)`, [C23]);
  ok(
    '8J: new-device plus high-risk payment freezes (C2 + C3)',
    (await locked(C23)) && (await kindCount(C23, 'protective_lock')) === 1
  );

  // 10. Unlock events do not re-enter the rule; a new pair after an hour does.
  const RE = 'ab100001-0000-4000-8000-000000000006';
  await makeUser(RE, 'protective-repeat@t.test');
  await su(`select _bantay_event($1,'code_failures','high',80,'{}'::jsonb)`, [RE]);
  await su(`select _bantay_event($1,'new_device','warning')`, [RE]);
  const firstCase = (await systemCases(RE))[0];
  await su(
    `update bantay_protective_locks
        set created_at=created_at-interval '61 minutes',
            window_start=window_start-interval '1 hour'
      where user_id=$1`,
    [RE]
  );
  await su(`update security_limits set locked_at=null, unlock_after=null where user_id=$1`, [RE]);
  await su(`select _bantay_event($1,'account_unlocked','info')`, [RE]);
  ok(
    '8J: account_unlocked does not re-enter the evaluator',
    (await kindCount(RE, 'protective_lock')) === 1 && !(await locked(RE))
  );
  await su(`select _bantay_event($1,'signin_failures','warning')`, [RE]);
  await su(`select _bantay_event($1,'risky_payment_challenged','high',85,'{}'::jsonb)`, [RE]);
  const secondCase = (await systemCases(RE))[0];
  ok(
    '8J: a fresh pair after the hour locks again, reusing the open case',
    (await locked(RE)) &&
      (await kindCount(RE, 'protective_lock')) === 2 &&
      (await freezeNotes(RE)).length === 2 &&
      secondCase?.id === firstCase?.id &&
      /Updated after another protective-lock episode\./.test(secondCase?.staff_note || ''),
    JSON.stringify({ firstCase, secondCase })
  );

  // 11. Out-of-window signals do not freeze.
  const OLD = 'ab100001-0000-4000-8000-000000000003';
  await makeUser(OLD, 'protective-old@t.test');
  // Age each signal before the next one lands: the evaluator runs at insert time.
  await su(`select _bantay_event($1,'code_failures','high',80,'{}'::jsonb)`, [OLD]);
  await su(
    `update security_events set created_at=now()-interval '16 minutes' where user_id=$1 and kind='code_failures'`,
    [OLD]
  );
  await su(`select _bantay_event($1,'new_device','warning')`, [OLD]);
  await su(
    `update security_events set created_at=now()-interval '16 minutes' where user_id=$1 and kind='new_device'`,
    [OLD]
  );
  await su(`select _bantay_event($1,'password_changed','info')`, [OLD]);
  ok(
    '8J: two signals outside the 15-minute window do not freeze',
    !(await locked(OLD)) && (await kindCount(OLD, 'protective_lock')) === 0,
    JSON.stringify({
      locked: await locked(OLD),
      events: await su(
        `select kind,severity,created_at,now()-created_at age from security_events where user_id=$1 order by created_at`,
        [OLD]
      ),
    })
  );
}
