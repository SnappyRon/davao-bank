// Local-only checks for the frozen Phase 8.5A operations-backend contract.
// No hosted access, no .env reads, no money-engine changes.

export async function runPhase8_5OpsTests({ as, su, cust, ok, U, A, B, biller }) {
  const FROM = '2020-01-01T00:00:00Z';
  const TO = '2020-01-03T00:00:00Z';
  const admin = (sql, params = []) => as('authenticated', U.ADM, sql, params);
  const adminAal1 = (sql, params = []) =>
    as('authenticated', U.ADM, sql, params, { sub: U.ADM, aal: 'aal1' });
  const rows = (r) => (r.err ? [] : r.rows || []);
  const obj = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
  const scalar = (r) => {
    const row = Array.isArray(r) ? r[0] : rows(r)[0];
    return Number(Object.values(row || {})[0] || 0);
  };
  const maxId = async () =>
    Number(
      (await su(`select coalesce(max(id), 0) id from public.staff_activity_events`))[0].id
    );
  const feedSince = async (id) =>
    rows(
      await admin(
        `select id::text id, kind, label, payload::text payload
         from public.admin_ops_live_feed($1, 200)`,
        [id]
      )
    );

  // ---- 1. Staff-only RPC guards ------------------------------------------------
  const rpcCases = [
    [
      'timeseries',
      `select count(*)::int n from public.admin_ops_timeseries($1,$2,'day')`,
      [FROM, TO],
    ],
    [
      'balance_distribution',
      `select count(*)::int n from public.admin_ops_balance_distribution()`,
      [],
    ],
    ['summary', `select (public.admin_ops_summary($1,$2,'day')) s`, [FROM, TO]],
    ['live_feed', `select count(*)::int n from public.admin_ops_live_feed()`, []],
  ];
  for (const [name, sql, params] of rpcCases) {
    const customer = await cust(U.A, sql, params);
    ok(
      `8.5 customer cannot call ${name}`,
      /Admin privilege required/.test(customer.err || ''),
      customer.err
    );
    const anon = await as('anon', null, sql, params);
    ok(
      `8.5 anon cannot call ${name}`,
      /permission denied/.test(anon.err || ''),
      anon.err
    );
    const staffAal1 = await adminAal1(sql, params);
    ok(
      `8.5 admin at aal1 cannot call ${name}`,
      /STEP_UP_REQUIRED/.test(staffAal1.err || ''),
      staffAal1.err
    );
    const staff = await admin(sql, params);
    ok(`8.5 admin at aal2 can call ${name}`, !staff.err, staff.err);
  }

  // ---- 2. Range and bucket validation ------------------------------------------
  const badBucket = await admin(`select public.admin_ops_timeseries($1,$2,'year')`, [
    FROM,
    TO,
  ]);
  ok(
    '8.5 invalid bucket rejected',
    /Invalid bucket/.test(badBucket.err || ''),
    badBucket.err
  );
  const inverted = await admin(`select public.admin_ops_timeseries($2,$1,'day')`, [
    FROM,
    TO,
  ]);
  ok(
    '8.5 inverted range rejected',
    /Invalid date range/.test(inverted.err || ''),
    inverted.err
  );
  const nullRange = await admin(`select public.admin_ops_timeseries(null,null,'day')`);
  ok(
    '8.5 null range rejected',
    /Invalid date range/.test(nullRange.err || ''),
    nullRange.err
  );

  // ---- 3. Timeseries fixtures (historical window, no live data pollution) ------
  const tx = async (key, type, status, at) =>
    (
      await su(
        `insert into public.transactions
           (type, status, initiated_by, idempotency_key, reference, created_at)
         values ($1,$2,$3,$4,$5,$6) returning id`,
        [type, status, U.A, key, 'OPS-SECRET-REF-1234567890', at]
      )
    )[0].id;
  const leg = async (account, transaction, direction, amount) =>
    su(
      `insert into public.ledger_entries (account_id,transaction_id,direction,amount)
       values ($1,$2,$3,$4)`,
      [account, transaction, direction, amount]
    );

  const tTransfer = await tx(
    'ops-ts-transfer',
    'transfer',
    'completed',
    '2020-01-01T02:00:00Z'
  );
  await leg(A.id, tTransfer, 'debit', 10000);
  await leg(B.id, tTransfer, 'credit', 10000);
  await su(
    `insert into public.transfers (transaction_id,from_account,to_account,amount)
     values ($1,$2,$3,10000)`,
    [tTransfer, A.id, B.id]
  );

  const tBill = await tx(
    'ops-ts-bill',
    'bill_payment',
    'completed',
    '2020-01-01T03:00:00Z'
  );
  await leg(A.id, tBill, 'debit', 5000);
  await leg(biller.account_id, tBill, 'credit', 5000);
  await su(
    `insert into public.bill_payments
       (transaction_id,biller_id,payer_account,biller_reference)
     values ($1,$2,$3,'OPS-BILL-SECRET')`,
    [tBill, biller.id, A.id]
  );
  await tx('ops-ts-failed', 'transfer', 'failed', '2020-01-01T04:00:00Z');
  const tDeposit = await tx(
    'ops-ts-deposit',
    'deposit',
    'completed',
    '2020-01-02T02:00:00Z'
  );
  await leg(A.id, tDeposit, 'credit', 7000);
  await tx('ops-ts-reversal', 'reversal', 'reversed', '2020-01-02T15:30:00Z');
  const tWithdrawal = await tx(
    'ops-ts-withdrawal',
    'withdrawal',
    'completed',
    '2020-01-02T16:30:00Z'
  );
  await leg(B.id, tWithdrawal, 'debit', 3000);

  const series = rows(
    await admin(
      `select to_char(bucket at time zone 'Asia/Manila','YYYY-MM-DD') d,
              category, incoming_centavos::text incoming, outgoing_centavos::text outgoing,
              transaction_count::text n, status_mix::text mix
       from public.admin_ops_timeseries($1,$2,'day')`,
      [FROM, TO]
    )
  );
  const cell = (d, category) => series.find((x) => x.d === d && x.category === category);
  const t1 = cell('2020-01-01', 'transfer');
  ok(
    '8.5 timeseries: two-leg transfer counted once, customer legs only',
    t1?.incoming === '10000' && t1?.outgoing === '10000' && t1?.n === '2',
    JSON.stringify(t1)
  );
  const bill = cell('2020-01-01', 'bill');
  ok(
    '8.5 timeseries: bill_payment → bill, biller settlement leg excluded',
    bill?.incoming === '0' && bill?.outgoing === '5000' && bill?.n === '1',
    JSON.stringify(bill)
  );
  ok(
    '8.5 timeseries: failed envelope appears only in status_mix',
    t1 && obj(t1.mix).failed === 1 && obj(t1.mix).completed === 1,
    t1?.mix
  );
  ok(
    '8.5 timeseries: deposit / reversal / withdrawal land in Manila day buckets',
    cell('2020-01-02', 'deposit')?.incoming === '7000' &&
      obj(cell('2020-01-02', 'reversal')?.mix || '{}').reversed === 1 &&
      cell('2020-01-03', 'withdrawal')?.outgoing === '3000',
    JSON.stringify(
      series.filter((x) => ['deposit', 'reversal', 'withdrawal'].includes(x.category))
    )
  );
  ok(
    '8.5 timeseries: 3 days × 6 categories',
    series.length === 18,
    String(series.length)
  );
  ok(
    '8.5 timeseries: raw reference never published',
    !JSON.stringify(series).includes('OPS-SECRET-REF') &&
      !JSON.stringify(series).includes('OPS-BILL-SECRET'),
    ''
  );

  for (const [bucket, expected] of [
    ['day', '2020-01-03'],
    ['week', '2019-12-30'],
    ['month', '2020-01-01'],
  ]) {
    const bucketRows = rows(
      await admin(
        `select to_char(bucket at time zone 'Asia/Manila','YYYY-MM-DD') d
         from public.admin_ops_timeseries($1,$2,$3)
         where category = 'withdrawal' and outgoing_centavos > 0`,
        [FROM, TO, bucket]
      )
    );
    ok(
      `8.5 ${bucket} bucketing across Manila midnight`,
      bucketRows[0]?.d === expected,
      JSON.stringify(bucketRows)
    );
  }

  const zero = rows(
    await admin(
      `select category, incoming_centavos::text i, outgoing_centavos::text o,
              transaction_count::text n, status_mix::text m
       from public.admin_ops_timeseries($1,$2,'day')`,
      ['2020-02-01T00:00:00Z', '2020-02-01T12:00:00Z']
    )
  );
  ok(
    '8.5 zero-filled buckets carry all categories and a zero status mix',
    zero.length === 6 &&
      zero.every(
        (x) =>
          x.i === '0' &&
          x.o === '0' &&
          x.n === '0' &&
          Object.values(obj(x.m)).every((v) => v === 0)
      ),
    JSON.stringify(zero.slice(0, 2))
  );

  // ---- 4. Balance distribution --------------------------------------------------
  const mkUser = async (id, email) => {
    await su(
      `insert into auth.users (id,email,raw_user_meta_data,email_confirmed_at)
       values ($1,$2,$3,now())`,
      [id, email, JSON.stringify({ full_name: 'Ops PII ' + email })]
    );
    await su(
      `insert into auth.mfa_factors (user_id,factor_type,status) values ($1,'totp','verified')`,
      [id]
    );
    return (
      await su(`select id,account_number from public.accounts where user_id=$1`, [id])
    )[0];
  };
  const credit = async (account, amount, key, at = '2020-01-01T05:00:00Z') => {
    const id = (
      await su(
        `insert into public.transactions (type,status,initiated_by,idempotency_key,created_at)
         values ('deposit','completed',$1,$2,$3) returning id`,
        [U.A, key, at]
      )
    )[0].id;
    await su(
      `insert into public.ledger_entries (account_id,transaction_id,direction,amount)
       values ($1,$2,'credit',$3)`,
      [account, id, amount]
    );
  };

  const fixtures = [
    ['77777777-7777-7777-7777-777777777771', 'ops-under@t.test', 50000],
    ['77777777-7777-7777-7777-777777777772', 'ops-1000@t.test', 500000],
    ['77777777-7777-7777-7777-777777777773', 'ops-10000@t.test', 5000000],
    ['77777777-7777-7777-7777-777777777774', 'ops-100000@t.test', 10000000],
  ];
  const newAccounts = [];
  for (const [id, email, amount] of fixtures) {
    const acc = await mkUser(id, email);
    await credit(acc.id, amount, 'ops-bal-' + id);
    await su(`update public.profiles set created_at='2020-01-01T02:00:00Z' where id=$1`, [
      id,
    ]);
    await su(`update public.accounts set created_at='2020-01-01T02:00:00Z' where id=$1`, [
      acc.id,
    ]);
    newAccounts.push({ ...acc, amount });
  }
  const closed = await mkUser(
    '77777777-7777-7777-7777-777777777775',
    'ops-closed@t.test'
  );
  await credit(closed.id, 999999999, 'ops-bal-closed');
  await su(`update public.accounts set status='closed' where id=$1`, [closed.id]);
  await credit(
    (await su(`select id from public.accounts where user_id=$1`, [U.SYS]))[0].id,
    999999999,
    'ops-bal-system'
  );

  const dist = rows(
    await admin(
      `select band, account_count::text n, total_balance_centavos::text total from public.admin_ops_balance_distribution()`
    )
  );
  const band = (name) => dist.find((x) => x.band === name);
  const expectedBands = {
    under_1000: 50000,
    '1000_to_9999': 500000,
    '10000_to_99999': 5000000,
    '100000_plus': 10000000,
  };
  ok(
    '8.5 distribution: known amounts land in the four expected bands',
    Object.entries(expectedBands).every(
      ([name, total]) => band(name) && Number(band(name).total) >= total
    ),
    JSON.stringify(dist)
  );
  const expectedTotal = Number(
    (
      await su(
        `select coalesce(sum(v.balance),0) s from public.account_balances v
         join public.accounts a on a.id=v.account_id
         join public.profiles p on p.id=a.user_id
         where p.role='customer' and a.status <> 'closed'`
      )
    )[0].s
  );
  const distTotal = () => dist.reduce((n, x) => n + Number(x.total), 0);
  ok(
    '8.5 distribution: totals match eligible source rows',
    distTotal() === expectedTotal,
    `${distTotal()} vs ${expectedTotal}`
  );
  await credit(closed.id, 777777, 'ops-bal-closed-2');
  const dist2 = rows(
    await admin(
      `select total_balance_centavos::text total from public.admin_ops_balance_distribution()`
    )
  );
  ok(
    '8.5 distribution: closed and biller settlement accounts excluded',
    dist2.reduce((n, x) => n + Number(x.total), 0) === distTotal(),
    JSON.stringify(dist2)
  );
  const piiInDist = [
    A.account_number,
    B.account_number,
    ...newAccounts.map((x) => x.account_number),
    'Ops PII',
  ].find((s) => JSON.stringify(dist).includes(s));
  ok(
    '8.5 distribution: no account numbers or names in payload',
    !piiInDist,
    piiInDist || ''
  );

  // ---- 5. Summary: growth, schedules, security ---------------------------------
  const scheduleId = (await su(`select id from public.scheduled_payments limit 1`))[0].id;
  const run = async (date, status, reason) =>
    su(
      `insert into public.scheduled_payment_runs
         (schedule_id,run_date,status,failure_reason,created_at)
       values ($1,$2,$3,$4,'2020-01-02T03:00:00Z') on conflict do nothing`,
      [scheduleId, date, status, reason]
    );
  await run('2020-01-01', 'failed', 'Account locked');
  await run('2020-01-02', 'failed', 'Insufficient funds');
  await run('2020-01-03', 'failed', 'mystery SECRET reason');
  await run('2020-01-04', 'completed', null);

  const caseUsers = [
    '77777777-7777-7777-7777-777777777771',
    '77777777-7777-7777-7777-777777777772',
  ];
  await su(
    `insert into public.security_cases (user_id,opened_by,status,staff_note,created_at)
     values ($1,'staff','investigating','OPS SECRET NOTE','2020-01-02T04:00:00Z')`,
    [caseUsers[0]]
  );
  await su(
    `insert into public.security_cases (user_id,opened_by,status,created_at)
     values ($1,'system','resolved','2020-01-02T04:00:00Z')`,
    [caseUsers[1]]
  );
  await su(
    `update public.security_limits set locked_at='2020-01-02T05:00:00Z' where user_id=$1`,
    [caseUsers[0]]
  );
  await su(`update public.accounts set status='frozen' where id=$1`, [newAccounts[1].id]);
  await su(
    `insert into public.security_events (user_id,kind,severity,facts,status,created_at)
     values ($1,'new_device','warning',$2,'open','2020-01-02T06:00:00Z')`,
    [caseUsers[0], JSON.stringify({ band: 'OPS BAND', account_id: 'OPS SECRET ID' })]
  );

  const summaryResult = await admin(`select public.admin_ops_summary($1,$2,'day') s`, [
    FROM,
    TO,
  ]);
  const summary = obj(rows(summaryResult)[0]?.s || {});
  const expectedCustomers = scalar(
    await su(
      `select count(*)::int n from public.profiles
       where role='customer' and created_at >= $1 and created_at < $2`,
      [FROM, TO]
    )
  );
  ok(
    '8.5 summary: growth counts match source and use Manila buckets',
    summary.period?.bucket === 'day' &&
      summary.growth?.[0]?.new_customers === expectedCustomers,
    JSON.stringify({
      period: summary.period,
      expectedCustomers,
      growth: summary.growth?.slice(0, 2),
    })
  );
  ok(
    '8.5 summary: failed/succeeded runs and reason-code whitelist',
    summary.schedules?.failed_runs === 3 &&
      summary.schedules?.succeeded_runs === 1 &&
      summary.schedules?.failure_codes?.['Account locked'] === 1 &&
      summary.schedules?.failure_codes?.['Insufficient funds'] === 1 &&
      summary.schedules?.failure_codes?.other === 1 &&
      !JSON.stringify(summary).includes('mystery SECRET reason'),
    JSON.stringify(summary.schedules)
  );
  ok(
    '8.5 summary: cases, locks, freezes and new devices from real sources',
    summary.security?.open_cases >= 1 &&
      summary.security?.locked_accounts >= 1 &&
      summary.security?.frozen_accounts >= 1 &&
      summary.security?.new_devices >= 1 &&
      summary.security?.open_cases ===
        scalar(
          await su(
            `select count(*)::int n from public.security_cases where status in ('open','investigating')`
          )
        ),
    JSON.stringify(summary.security)
  );
  ok(
    '8.5 summary: signin_failures is null with an honest note',
    summary.security?.signin_failures === null &&
      summary.security?.signin_failures_note === 'no reliable source',
    JSON.stringify(summary.security)
  );
  const piiKeys = [
    'full_name',
    'phone',
    'account_number',
    'entity_id',
    'metadata',
    'facts',
    'reference',
    'idempotency_key',
  ];
  const leakedKey = piiKeys.find((k) => JSON.stringify(summary).includes('"' + k + '"'));
  ok('8.5 summary: no PII keys anywhere in the response', !leakedKey, leakedKey || '');

  // ---- 6. Sanitized live feed + RLS --------------------------------------------
  const feedUser = await mkUser(
    '77777777-7777-7777-7777-777777777776',
    'ops-feed@t.test'
  );
  await credit(feedUser.id, 100000, 'ops-feed-fund');
  await su(
    `insert into public.trusted_payees (user_id,account_number) values ($1,$2) on conflict do nothing`,
    ['77777777-7777-7777-7777-777777777776', B.account_number]
  );

  let since = await maxId();
  const transfer = await cust(
    '77777777-7777-7777-7777-777777777776',
    `select transfer($1,$2,123,'ops-feed-transfer','ops')`,
    [feedUser.id, B.id]
  );
  const feedRows = await feedSince(since);
  ok(
    '8.5 feed: a real transfer emits one sanitized transaction row',
    !transfer.err &&
      feedRows.filter((x) => x.kind === 'transaction' && x.label === 'transfer')
        .length === 1 &&
      feedRows.every((x) => !JSON.stringify(x.payload).includes('OPS-SECRET')),
    transfer.err || JSON.stringify(feedRows)
  );
  ok(
    '8.5 feed: the real transfer also emits one allowlisted audit row',
    feedRows.filter((x) => x.kind === 'audit_action' && x.label === 'funds_transferred')
      .length === 1,
    JSON.stringify(feedRows)
  );

  since = await maxId();
  const replay = await cust(
    '77777777-7777-7777-7777-777777777776',
    `select transfer($1,$2,123,'ops-feed-transfer','ops')`,
    [feedUser.id, B.id]
  );
  ok(
    '8.5 feed: idempotent replay appends nothing',
    !replay.err && (await feedSince(since)).length === 0,
    replay.err || JSON.stringify(await feedSince(since))
  );

  since = await maxId();
  await su(
    `insert into public.security_events (user_id,kind,severity,facts,status)
     values ($1,'new_device','warning',$2,'open')`,
    [U.A, JSON.stringify({ band: 'OPS BAND', account_id: 'OPS SECRET ID' })]
  );
  const secFeed = await feedSince(since);
  ok(
    '8.5 feed: security event emits one row with allowlisted scalars only',
    secFeed.length === 1 &&
      secFeed[0].kind === 'security_event' &&
      secFeed[0].label === 'new_device' &&
      !JSON.stringify(secFeed[0].payload).includes('OPS SECRET'),
    JSON.stringify(secFeed)
  );

  since = await maxId();
  await run('2020-01-05', 'failed', 'mystery SECRET reason');
  const runFeed = await feedSince(since);
  ok(
    '8.5 feed: failed schedule emits one row with a reason code',
    runFeed.length === 1 &&
      runFeed[0].kind === 'schedule_failure' &&
      obj(runFeed[0].payload || '{}').reason_code === 'other' &&
      !JSON.stringify(runFeed[0].payload).includes('mystery SECRET reason'),
    JSON.stringify(runFeed)
  );

  since = await maxId();
  await su(
    `insert into public.audit_logs (actor_id,actor_role,action,entity,entity_id,metadata)
     values ($1,'admin','funds_transferred','transactions','OPS ENTITY ID',$2)`,
    [U.ADM, JSON.stringify({ account_number: A.account_number, secret: 'OPS SECRET' })]
  );
  await su(
    `insert into public.audit_logs (actor_id,actor_role,action,entity,entity_id,metadata)
     values ($1,'admin','ops_secret_action','transactions','OPS ENTITY ID','{}'::jsonb)`,
    [U.ADM]
  );
  const auditFeed = await feedSince(since);
  ok(
    '8.5 feed: audit allowlist blocks unlisted actions and raw metadata',
    auditFeed.length === 1 &&
      auditFeed[0].label === 'funds_transferred' &&
      !JSON.stringify(auditFeed[0]).includes('OPS ENTITY ID') &&
      !JSON.stringify(auditFeed[0]).includes('OPS SECRET') &&
      !JSON.stringify(auditFeed[0]).includes(A.account_number),
    JSON.stringify(auditFeed)
  );

  const customerFeed = await cust(
    U.A,
    `select count(*)::int n from public.staff_activity_events`
  );
  ok(
    '8.5 RLS: customer sees zero feed rows',
    scalar(customerFeed) === 0,
    customerFeed.err || JSON.stringify(customerFeed.rows)
  );
  const customerInsert = await cust(
    U.A,
    `insert into public.staff_activity_events (kind,label) values ('transaction','fake')`
  );
  ok(
    '8.5 RLS: customer cannot insert feed rows directly',
    /permission denied/.test(customerInsert.err || ''),
    customerInsert.err
  );
  const adminAal1Feed = await adminAal1(
    `select count(*)::int n from public.staff_activity_events`
  );
  ok(
    '8.5 RLS: admin at aal1 sees zero feed rows',
    scalar(adminAal1Feed) === 0,
    adminAal1Feed.err || JSON.stringify(adminAal1Feed.rows)
  );
  const adminFeed = await admin(
    `select count(*)::int n from public.staff_activity_events`
  );
  ok(
    '8.5 RLS: admin at aal2 can read the feed',
    scalar(adminFeed) > 0,
    adminFeed.err
  );
  ok(
    '8.5 is_admin(): false for customer, true for staff',
    !(await cust(U.A, `select public.is_admin() a`)).rows?.[0]?.a &&
      (await admin(`select public.is_admin() a`)).rows?.[0]?.a === true
  );

  const published = (
    await su(
      `select tablename from pg_catalog.pg_publication_tables
     where pubname='supabase_realtime' and schemaname='public' order by tablename`
    )
  ).map((x) => x.tablename);
  ok(
    '8.5 publication: staff_activity_events and merged security_events only (local PGlite check)',
    JSON.stringify(published) ===
      JSON.stringify(['security_events', 'staff_activity_events']),
    JSON.stringify(published)
  );
}
