// Local-only checks for the frozen Stage 8D contract. No hosted writes, no .env access.

export async function runPhase8BantayRiskTests({ as, su, cust, bal, ok, U, A, B, biller }) {
  const makeUser = async (id, email) => {
    await su(
      `insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values($1,$2,$3,now())`,
      [id, email, JSON.stringify({ full_name: 'Bantay Test ' + email })]
    );
    await su(`insert into auth.mfa_factors(user_id,factor_type,status) values($1,'totp','verified')`, [id]);
    await su(`delete from security_events where user_id=$1 and kind='mfa_changed'`, [id]);
    const acc = (await su(`select id,account_number from accounts where user_id=$1 limit 1`, [id]))[0];
    return acc;
  };
  const freshClaims = (uid, extra = {}) => ({
    sub: uid,
    aal: 'aal2',
    amr: [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) }],
    ...extra,
  });
  const risk = async (uid, toAccount, amount, at = 'now()') =>
    (await su(`select _compute_payment_risk($1,$2,$3,$4::timestamptz) r`,
      [uid, toAccount, amount, at === 'now()' ? 'now()' : at]))[0]?.r;
  const today = (await su(`select (now() at time zone 'Asia/Manila')::date d`))[0].d;

  // ---- 1. Score signals and bands -------------------------------------------------
  const R = '66666666-6666-6666-6666-666666666666';
  const RACC = await makeUser(R, 'risk@t.test');
  await cust(R, `select deposit($1,5000000,'p8d-funder','fund')`, [RACC.id]);
  await su(`insert into trusted_payees(user_id,account_number) values($1,$2) on conflict do nothing`, [R, B.account_number]);

  let v = await risk(R, B.id, 1000);
  ok('8D score: baseline with trusted payee is 0', v?.score === 0 && v?.band === 'allow', JSON.stringify(v));

  v = await risk(R, A.id, 1000);
  ok('8D score: new payee adds 30', v?.score === 30 && v?.signals?.includes('new_payee'), JSON.stringify(v));

  v = await risk(R, B.id, 2000000);
  ok('8D score: amount over ₱10,000 without history adds 30', v?.score === 30 && v?.signals?.includes('high_amount'), JSON.stringify(v));

  for (let i = 1; i <= 3; i++) {
    await su(`select _transfer_core($1,$2,$3,1000,$4,'rapid')`, [R, RACC.id, B.id, 'p8d-rapid-' + i]);
  }
  v = await risk(R, B.id, 1000);
  ok('8D score: ≥3 outgoing payments in 10 min adds 20', v?.score === 20 && v?.rapid_payments === true, JSON.stringify(v));
  await su(`update transactions set created_at=now()-interval '2 hours' where idempotency_key like 'p8d-rapid-%'`);

  for (let i = 1; i <= 5; i++) {
    await su(`select _transfer_core($1,$2,$3,10000,$4,'median')`, [R, RACC.id, B.id, 'p8d-median-' + i]);
  }
  await su(`update transactions set created_at=now()-interval '2 hours' where idempotency_key like 'p8d-median-%'`);
  v = await risk(R, B.id, 40000);
  ok('8D score: >3× 90-day median with ≥5 payments adds 30', v?.score === 30 && v?.amount_band === 'over_3x_usual', JSON.stringify(v));

  await su(`update transactions set created_at=now()-interval '91 days' where idempotency_key like 'p8d-median-%'`);
  await su(`insert into security_events(user_id,kind,severity) values($1,'mfa_changed','warning')`, [R]);
  v = await risk(R, B.id, 1000);
  ok('8D score: recent mfa_changed adds 25', v?.score === 25 && v?.signals?.includes('recent_auth_change'), JSON.stringify(v));
  await su(`delete from security_events where user_id=$1 and kind='mfa_changed'`, [R]);

  v = await risk(R, B.id, 1000, '2026-11-26T02:00:00+08');
  ok('8D score: Manila 00:00–05:00 adds 10', v?.score === 10 && v?.signals?.includes('late_night'), JSON.stringify(v));

  const sessionId = '77777777-7777-7777-7777-777777777777';
  const devClaims = freshClaims(R, { session_id: sessionId });
  let r = await as('authenticated', R, `select register_device($1,$2) d`, ['p8d-install-1', 'Test phone'], devClaims);
  ok('8D register_device: first registration reports a new device', !r.err && r.rows?.[0]?.d?.new_device === true, r.err || JSON.stringify(r.rows?.[0]?.d));
  r = await as('authenticated', R, `select register_device($1,$2) d`, ['p8d-install-1', 'Test phone'], devClaims);
  ok('8D register_device: repeat registration is not new', !r.err && r.rows?.[0]?.d?.new_device === false, r.err || JSON.stringify(r.rows?.[0]?.d));
  r = await as('authenticated', R, `select prepare_risk_challenge($1,$2,$3) p`, [B.id, 1000, 'p8d-device-key'], devClaims);
  const devRisk = r.rows?.[0]?.p?.facts;
  ok('8D score: untrusted device first seen <24 h adds 25', !r.err && Number(devRisk?.score) === 25 && devRisk?.signals?.includes('new_device'), r.err || JSON.stringify(devRisk));
  await su(`update user_devices set trusted=true where user_id=$1 and install_id='p8d-install-1'`, [R]);
  r = await as('authenticated', R, `select prepare_risk_challenge($1,$2,$3) p`, [B.id, 1000, 'p8d-device-key-2'], devClaims);
  ok('8D score: trusted device removes the 25-point signal', Number(r.rows?.[0]?.p?.facts?.score) === 0, JSON.stringify(r.rows?.[0]?.p?.facts));

  for (const [score, expected] of [[0, 'allow'], [39, 'allow'], [40, 'warning'], [69, 'warning'], [70, 'challenge'], [100, 'challenge']]) {
    const band = (await su(`select _bantay_band($1) b`, [score]))[0]?.b;
    ok(`8D band: ${score} → ${expected}`, band === expected, String(band));
  }

  // ---- 2. Challenge → confirm → success -------------------------------------------
  const H = '88888888-8888-8888-8888-888888888888';
  const HACC = await makeUser(H, 'challenge@t.test');
  await cust(H, `select deposit($1,5000000,'p8d-funder-h','fund')`, [HACC.id]);
  await su(`insert into security_events(user_id,kind,severity) values($1,'password_changed','warning')`, [H]);
  const key1 = 'p8d-challenge-1';
  r = await cust(H, `select prepare_risk_challenge($1,$2,$3) p`, [A.id, 2000000, key1]);
  ok('8D challenge: new payee + high amount + auth change scores ≥70', !r.err && r.rows?.[0]?.p?.challenge_required === true && Number(r.rows?.[0]?.p?.score) >= 70, r.err || JSON.stringify(r.rows?.[0]?.p));
  ok('8D challenge: risky_payment_challenged event is written', (await su(`select count(*)::int n from security_events where user_id=$1 and kind='risky_payment_challenged'`, [H]))[0].n === 1);

  r = await cust(H, `select transfer($1,$2,2000000,$3,'risky')`, [HACC.id, A.id, key1]);
  ok('8D challenge: unconfirmed high-risk transfer raises Confirmation required', r.err === 'Confirmation required', r.err);
  ok('8D challenge: no money moved before confirmation', (await bal(HACC.id)) === 5000000, String(await bal(HACC.id)));

  const aal1 = { sub: H, aal: 'aal1', amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }] };
  r = await as('authenticated', H, `select confirm_risky_payment($1)`, [key1], aal1);
  ok('8D challenge: confirm at aal1 fails with STEP_UP_REQUIRED', r.err === 'STEP_UP_REQUIRED', r.err);
  r = await cust(H, `select confirm_risky_payment($1)`, [key1]);
  ok('8D challenge: confirm at aal2 succeeds', !r.err && r.rows?.[0]?.confirm_risky_payment?.ok === true, r.err || JSON.stringify(r.rows));
  r = await cust(H, `select confirm_risky_payment($1)`, [key1]);
  ok('8D challenge: double confirm is rejected', /already confirmed/i.test(r.err || ''), r.err);

  r = await cust(H, `select transfer($1,$2,2000000,$3,'risky') t`, [HACC.id, A.id, key1]);
  ok('8D challenge: same key succeeds once after confirmation', !r.err && (await bal(HACC.id)) === 3000000, r.err || String(await bal(HACC.id)));
  r = await cust(H, `select transfer($1,$2,2000000,$3,'risky') t`, [HACC.id, A.id, key1]);
  ok('8D challenge: replay with same key is idempotent', !r.err && r.rows?.[0]?.t?.idempotent_replay === true && (await bal(HACC.id)) === 3000000, r.err || JSON.stringify(r.rows));

  const key2 = 'p8d-challenge-expired';
  const prepared2 = await cust(H, `select prepare_risk_challenge($1,$2,$3) p`, [RACC.id, 2000000, key2]);
  ok('8D challenge: second risky payment prepares a challenge', !prepared2.err && prepared2.rows?.[0]?.p?.challenge_required === true, prepared2.err || JSON.stringify(prepared2.rows?.[0]?.p));
  await su(`update risk_challenges set expires_at=now()-interval '1 minute' where idempotency_key=$1`, [key2]);
  r = await cust(H, `select confirm_risky_payment($1)`, [key2]);
  ok('8D challenge: expired challenge is rejected', r.err === 'Challenge expired', r.err);

  // ---- 3. Lock, cron failure and unlock -------------------------------------------
  const L = '99999999-9999-9999-9999-999999999999';
  const LACC = await makeUser(L, 'lock@t.test');
  await cust(L, `select deposit($1,5000000,'p8d-funder-l','fund')`, [LACC.id]);
  await su(`insert into trusted_payees(user_id,account_number) values($1,$2) on conflict do nothing`, [L, B.account_number]);

  r = await cust(L, `select lock_my_account() l`);
  ok('8D lock: customer can lock at aal1 without step-up', !r.err && r.rows?.[0]?.l?.locked === true, r.err || JSON.stringify(r.rows));
  ok('8D lock: account_locked event + audit row written', (await su(`select count(*)::int n from security_events where user_id=$1 and kind='account_locked'`, [L]))[0].n === 1 &&
    (await su(`select count(*)::int n from audit_logs where action='account_locked' and entity_id=$1::text`, [L]))[0].n === 1);

  r = await cust(L, `select transfer($1,$2,1000,'p8d-locked-transfer','x')`, [LACC.id, B.id]);
  ok('8D lock: transfer blocked with Account locked', r.err === 'Account locked', r.err);
  r = await cust(L, `select pay_bill($1,$2,'1234567890',1000,'p8d-locked-bill')`, [LACC.id, biller.id]);
  ok('8D lock: bill payment blocked with Account locked', r.err === 'Account locked', r.err);
  r = await cust(L, `select withdraw($1,1000,'p8d-locked-wd','atm')`, [LACC.id]);
  ok('8D lock: withdrawal blocked with Account locked', r.err === 'Account locked', r.err);
  r = await cust(L, `select create_scheduled_payment($1,'transfer',$2,null,null,1000,'once',$3,null,null,'p8d-locked-sched')`, [LACC.id, B.id, today]);
  ok('8D lock: schedule creation blocked with Account locked', r.err === 'Account locked', r.err);
  r = await cust(L, `select create_scheduled_transfer_to_number($1,$2,1000,'once',$3,null,null,'p8d-locked-num')`, [LACC.id, B.account_number, today]);
  ok('8D lock: schedule-by-number blocked with Account locked', r.err === 'Account locked', r.err);
  r = await cust(U.B, `select create_payment_request($1,$2,1000,'p8d-locked-req') x`, [B.id, LACC.account_number]);
  const lockedReq = r.rows?.[0]?.x?.id || (await su(`select id from payment_requests where note='p8d-locked-req' order by created_at desc limit 1`))[0]?.id;
  r = await cust(L, `select pay_payment_request($1::uuid,$2::uuid,$3::text)`, [lockedReq, LACC.id, 'p8d-locked-pay']);
  ok('8D lock: paying a request blocked with Account locked', r.err === 'Account locked', `${r.err || ''} (request ${lockedReq})`);

  r = await cust(L, `select deposit($1,1000,'p8d-locked-deposit','ok')`, [LACC.id]);
  ok('8D lock: deposit still works', !r.err, r.err);
  r = await cust(U.B, `select transfer($1,$2,1000,'p8d-incoming-locked','ok')`, [B.id, LACC.id]);
  ok('8D lock: incoming transfer still works', !r.err, r.err);

  // Simulate a schedule that was created before the lock (lock_my_account pauses
  // active ones), so the unchanged executor really hits assert_not_locked.
  await su(
    `insert into scheduled_payments(owner_id,from_account,kind,to_account,amount,frequency,start_date,next_run_date,status)
     values($1,$2,'transfer',$3,1000,'once',$4,$4,'active')`,
    [L, LACC.id, B.id, today]
  );
  await su(`select run_due_scheduled_payments()`);
  const lockedRun = (await su(`select r.status,r.failure_reason from scheduled_payment_runs r join scheduled_payments s on s.id=r.schedule_id where s.owner_id=$1 and s.amount=1000 order by r.created_at desc limit 1`, [L]))[0];
  const paused = (await su(`select count(*)::int n from scheduled_payments where owner_id=$1 and status='paused'`, [L]))[0].n;
  ok('8D lock: cron run fails with Account locked, no money moved', lockedRun?.status === 'failed' && lockedRun?.failure_reason === 'Account locked', JSON.stringify(lockedRun));
  ok('8D lock: failed cron run pauses the schedule (run_due_scheduled_payments unchanged)', paused >= 1, String(paused));

  r = await as('authenticated', L, `select request_unlock()`, [], aal1);
  ok('8D unlock: request_unlock needs aal2', r.err === 'STEP_UP_REQUIRED', r.err);
  r = await cust(L, `select request_unlock() s`);
  ok('8D unlock: request sets unlock_after about an hour ahead', !r.err && new Date(r.rows?.[0]?.s?.unlock_after) > new Date(), r.err || JSON.stringify(r.rows?.[0]?.s));
  r = await cust(L, `select complete_unlock()`);
  ok('8D unlock: complete before unlock_after is rejected', r.err === 'Unlock not available yet', r.err);
  await su(`update security_limits set unlock_after=now()-interval '1 second' where user_id=$1`, [L]);
  r = await cust(L, `select complete_unlock() s`);
  ok('8D unlock: complete after unlock_after clears the lock', !r.err && r.rows?.[0]?.s?.locked === false, r.err || JSON.stringify(r.rows?.[0]?.s));
  r = await cust(L, `select transfer($1,$2,1000,'p8d-after-unlock','ok')`, [LACC.id, B.id]);
  ok('8D unlock: outgoing transfer works again', !r.err, r.err);

  // ---- 4. Delayed limit raises, marked events, cases and RLS ----------------------
  const M = '12121212-1212-1212-1212-121212121212';
  const MACC = await makeUser(M, 'limits@t.test');
  await cust(M, `select deposit($1,5000000,'p8d-funder-m','fund')`, [MACC.id]);
  r = await cust(M, `select set_daily_limit(100000) s`);
  ok('8D limit: lowering is immediate', !r.err && Number(r.rows?.[0]?.s?.daily_transfer_limit_centavos) === 100000, r.err || JSON.stringify(r.rows?.[0]?.s));
  r = await cust(M, `select set_daily_limit(200000) s`);
  ok('8D limit: raising is pending for 12 hours', !r.err && Number(r.rows?.[0]?.s?.daily_transfer_limit_centavos) === 100000 &&
    Number(r.rows?.[0]?.s?.pending_limit_centavos) === 200000 &&
    new Date(r.rows?.[0]?.s?.pending_limit_effective_at) > new Date(Date.now() + 11 * 3600 * 1000), r.err || JSON.stringify(r.rows?.[0]?.s));
  ok('8D limit: raise writes limit_changed event', (await su(`select count(*)::int n from security_events where user_id=$1 and kind='limit_changed'`, [M]))[0].n >= 1);
  await su(`update security_limits set pending_limit_effective_at=now()-interval '1 second' where user_id=$1`, [M]);
  await su(`select apply_due_security_limits()`);
  r = await cust(M, `select get_security_settings() s`);
  ok('8D limit: cron apply step makes the raise effective', Number(r.rows?.[0]?.s?.daily_transfer_limit_centavos) === 200000 && r.rows?.[0]?.s?.pending_limit_centavos === null, JSON.stringify(r.rows?.[0]?.s));

  // trusted_payees removes the new-payee signal
  const payeeA = (await risk(M, A.id, 1000)).score;
  await su(`insert into trusted_payees(user_id,account_number) values($1,$2) on conflict do nothing`, [M, A.account_number]);
  const payeeB = (await risk(M, A.id, 1000)).score;
  ok('8D trusted_payees: removes the new-payee points', Number(payeeA) === 30 && Number(payeeB) === 0, `${payeeA} → ${payeeB}`);

  // mark_event: confirmed_me trusts the payee; reported_not_me locks and opens a case
  const eventId = (await su(`select id from security_events where user_id=$1 and kind='limit_changed' order by created_at desc limit 1`, [M]))[0]?.id;
  r = await cust(M, `select mark_event($1,'dismissed')`, [eventId]);
  ok('8D mark_event: dismiss is not an accepted status', /Invalid event status/.test(r.err || ''), r.err);
  r = await cust(M, `select mark_event($1,'confirmed_me') m`, [eventId]);
  ok('8D mark_event: confirmed_me accepted', !r.err && r.rows?.[0]?.m?.status === 'confirmed_me', r.err || JSON.stringify(r.rows));
  const riskEvent = (await su(`insert into security_events(user_id,kind,severity,facts) values($1,'risky_payment_challenged','high',$2) returning id`, [M, JSON.stringify({ to_account_id: A.id }) ]))[0].id;
  r = await cust(M, `select mark_event($1,'confirmed_me')`, [riskEvent]);
  ok('8D mark_event: confirmed payment event trusts the payee', !r.err &&
    (await su(`select count(*)::int n from trusted_payees where user_id=$1 and account_number=$2`, [M, A.account_number]))[0].n === 1, r.err);
  r = await cust(M, `select mark_event($1,'reported_not_me')`, [riskEvent]);
  ok('8D mark_event: reported_not_me locks and opens a case', !r.err &&
    (await su(`select count(*)::int n from security_cases where user_id=$1 and opened_by='customer'`, [M]))[0].n === 1, r.err);
  ok('8D lock: reported_not_me also locks', (await su(`select locked_at is not null l from security_limits where user_id=$1`, [M]))[0].l === true);

  // RLS isolation and no direct writes
  r = await cust(U.B, `select count(*)::int n from security_events where user_id=$1`, [M]);
  ok('8D RLS: B cannot read M events', oneCount(r) === 0, r.err || JSON.stringify(r.rows));
  r = await cust(U.B, `select count(*)::int n from user_devices where user_id=$1`, [R]);
  ok('8D RLS: B cannot read R devices', oneCount(r) === 0, r.err || JSON.stringify(r.rows));
  r = await cust(U.B, `select count(*)::int n from risk_challenges where user_id=$1`, [H]);
  ok('8D RLS: B cannot read H challenges', oneCount(r) === 0, r.err || JSON.stringify(r.rows));
  r = await cust(U.B, `select count(*)::int n from security_cases where user_id=$1`, [M]);
  ok('8D RLS: B cannot read M cases', oneCount(r) === 0, r.err || JSON.stringify(r.rows));
  r = await cust(M, `insert into security_events(user_id,kind) values($1,'new_device')`, [M]);
  ok('8D RLS: customer cannot insert events directly', !!r.err, r.err);
  r = await cust(M, `update risk_challenges set confirmed_at=now() where user_id=$1`, [M]);
  ok('8D RLS: customer cannot update challenges directly', !!r.err || (r.rows || []).length === 0, r.err);

  // Admin RPCs
  r = await cust(M, `select admin_list_security_cases()`);
  ok('8D admin: customer cannot list cases', /permission denied|Admin privilege|STEP_UP_REQUIRED/.test(r.err || ''), r.err);
  r = await as('authenticated', U.ADM, `select * from admin_list_security_cases()`, [], freshClaims(U.ADM));
  ok('8D admin: admin can list cases', !r.err && r.rows.some(x => x.user_id === M), r.err || JSON.stringify(r.rows));
  const caseId = (await su(`select id from security_cases where user_id=$1 limit 1`, [M]))[0].id;
  r = await as('authenticated', U.ADM, `select admin_get_security_case($1) c`, [caseId], freshClaims(U.ADM));
  ok('8D admin: admin can read case detail', !r.err && r.rows?.[0]?.c?.case?.id === caseId, r.err || JSON.stringify(r.rows?.[0]?.c));
  r = await as('authenticated', U.ADM, `select admin_update_security_case($1,'investigating','reviewed') u`, [caseId], freshClaims(U.ADM));
  ok('8D admin: admin can update case', !r.err && r.rows?.[0]?.u?.status === 'investigating', r.err || JSON.stringify(r.rows));
  r = await as('authenticated', U.ADM, `select admin_unlock_user($1,'verified') u`, [M], freshClaims(U.ADM));
  ok('8D admin: admin can unlock a user', !r.err && r.rows?.[0]?.u?.ok === true, r.err || JSON.stringify(r.rows));
  ok('8D admin: account_unlocked event + audit row written', (await su(`select count(*)::int n from security_events where user_id=$1 and kind='account_unlocked'`, [M]))[0].n === 1 &&
    (await su(`select count(*)::int n from audit_logs where action='account_unlocked' and entity_id=$1::text`, [M]))[0].n === 1);

  // ---- 5. Code-failure signal ------------------------------------------------------
  const F = '13131313-1313-1313-1313-131313131313';
  const FACC = await makeUser(F, 'codefail@t.test');
  const badClaims = { sub: F, aal: 'aal2', amr: [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) - 360 }] };
  await cust(F, `select deposit($1,100000,'p8d-funder-f','fund')`, [FACC.id]);
  const codeFailureErrors = [];
  for (let i = 0; i < 3; i++) {
    const fr = await as('authenticated', F, `select set_daily_limit(200000)`, [], badClaims);
    codeFailureErrors.push(fr.err || 'ok');
    await cust(F, `select record_step_up_failure()`);
  }
  const failRows = (await su(`select count(*)::int n from bantay_step_up_failures where user_id=$1`, [F]))[0].n;
  const failEvents = (await su(`select count(*)::int n from security_events where user_id=$1 and kind='code_failures'`, [F]))[0].n;
  ok('8D code_failures: three step-up failures in 10 minutes write one event', failEvents === 1, `rows=${failRows}, events=${failEvents}, errors=${codeFailureErrors.join('|')}`);

  function oneCount(result) {
    if (result.err) return -1;
    return Number(Object.values(result.rows?.[0] || {})[0]);
  }
}
