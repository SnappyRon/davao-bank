// Reviewer harness (Phase 9 · Stage 9E). Verifies savings_goals RLS, CRUD/projection RPCs,
// pure simple-interest math, quote_time_deposit, function security metadata, and zero money movement.
export async function runPhase9SavingsGoalsTests({
  as,
  su,
  cust,
  one,
  bal,
  ok,
  U,
  A,
  B,
}) {
  // Snapshot ledger, transactions, accounts, and balances before 9E runs to prove zero money movement.
  const txBefore = Number(
    (await su(`select count(*)::int n from public.transactions`))[0].n
  );
  const leBefore = Number(
    (await su(`select count(*)::int n from public.ledger_entries`))[0].n
  );
  const accBefore = Number(
    (await su(`select count(*)::int n from public.accounts`))[0].n
  );
  const balABefore = await bal(A.id);
  const balBBefore = await bal(B.id);

  const todayRows = await su(`
    select
      (now() at time zone 'Asia/Manila')::date::text as today,
      ((now() at time zone 'Asia/Manila')::date + interval '6 months')::date::text as plus_6m,
      ((now() at time zone 'Asia/Manila')::date + interval '12 months')::date::text as plus_12m,
      ((now() at time zone 'Asia/Manila')::date - interval '1 day')::date::text as yesterday
  `);
  const { today, plus_6m: plus6m, plus_12m: plus12m, yesterday } = todayRows[0];

  // ---- 1. Security metadata: security definer + set search_path = '' on all 9E functions
  const fnNames = [
    '_compute_savings_projection',
    '_build_savings_goal_response',
    'project_savings_goal',
    'create_savings_goal',
    'list_my_savings_goals',
    'update_savings_goal',
    'archive_savings_goal',
    'delete_savings_goal',
    'quote_time_deposit',
  ];
  const fnMeta = await su(
    `select p.proname, p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '') as cfg
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any($1::text[])
     order by p.proname`,
    [fnNames]
  );
  ok(
    '9E security: all 9 savings-goal/TD functions exist with security definer and empty search_path',
    fnMeta.length === fnNames.length &&
      fnMeta.every(
        (f) => f.prosecdef === true && /(^|,)search_path=(""|'')($|,)/.test(f.cfg)
      ),
    JSON.stringify(fnMeta)
  );

  // ---- 2. Privilege revocations: anon & internal helpers denied
  let r = await as('anon', null, `select * from public.savings_goals`);
  ok('9E RLS: anon cannot read savings_goals', !!r.err, r.err);

  r = await as(
    'anon',
    null,
    `select public.create_savings_goal('Emergency', 500000, $1::date)`,
    [plus6m]
  );
  ok(
    '9E privileges: anon cannot call create_savings_goal',
    /permission denied/.test(r.err || ''),
    r.err
  );

  r = await as('anon', null, `select * from public.list_my_savings_goals()`);
  ok(
    '9E privileges: anon cannot call list_my_savings_goals',
    /permission denied/.test(r.err || ''),
    r.err
  );

  r = await as('anon', null, `select public.update_savings_goal(gen_random_uuid(), 'X')`);
  ok(
    '9E privileges: anon cannot call update_savings_goal',
    /permission denied/.test(r.err || ''),
    r.err
  );

  r = await as('anon', null, `select public.archive_savings_goal(gen_random_uuid())`);
  ok(
    '9E privileges: anon cannot call archive_savings_goal',
    /permission denied/.test(r.err || ''),
    r.err
  );

  r = await as('anon', null, `select public.delete_savings_goal(gen_random_uuid())`);
  ok(
    '9E privileges: anon cannot call delete_savings_goal',
    /permission denied/.test(r.err || ''),
    r.err
  );

  r = await as(
    'anon',
    null,
    `select public.project_savings_goal(0, 500000, $1::date, 50000, 250)`,
    [plus6m]
  );
  ok(
    '9E privileges: anon cannot call project_savings_goal',
    /permission denied/.test(r.err || ''),
    r.err
  );

  r = await as('anon', null, `select * from public.quote_time_deposit(1000000, 90)`);
  ok(
    '9E privileges: anon cannot call quote_time_deposit',
    /permission denied/.test(r.err || ''),
    r.err
  );

  r = await cust(
    U.A,
    `select public._compute_savings_projection(0, 100000, $1::date, 10000, 250, $2::date)`,
    [plus6m, today]
  );
  ok(
    '9E privileges: customer cannot call internal _compute_savings_projection',
    /permission denied/.test(r.err || ''),
    r.err
  );

  // ---- 3. Direct table RLS & linked-account ownership checks
  r = await cust(
    U.A,
    `insert into public.savings_goals (name, target_amount_cents, target_date, monthly_deposit_cents, linked_account_id)
     values ('Direct Goal', 1000000, $1::date, 100000, $2)
     returning id, user_id`,
    [plus6m, A.id]
  );
  const directGoalId = r.rows?.[0]?.id;
  ok(
    '9E RLS: customer A can insert own goal linked to own active account',
    !r.err && r.rows?.[0]?.user_id === U.A,
    r.err
  );

  r = await cust(
    U.A,
    `insert into public.savings_goals (user_id, name, target_amount_cents, target_date)
     values ($1, 'Spoofed Owner', 500000, $2::date)`,
    [U.B, plus6m]
  );
  ok('9E RLS: customer A cannot insert goal for customer B', !!r.err, r.err);

  r = await cust(
    U.A,
    `insert into public.savings_goals (name, target_amount_cents, target_date, linked_account_id)
     values ('Cross Account Leak', 500000, $1::date, $2)`,
    [plus6m, B.id]
  );
  ok(
    '9E RLS: customer A cannot directly insert goal linked to B account',
    !!r.err,
    r.err
  );

  r = await cust(
    U.A,
    `update public.savings_goals set linked_account_id = $1 where id = $2`,
    [B.id, directGoalId]
  );
  ok('9E RLS: customer A cannot directly update goal to link B account', !!r.err, r.err);

  r = await cust(U.B, `select count(*)::int n from public.savings_goals where id = $1`, [
    directGoalId,
  ]);
  ok('9E RLS: customer B cannot read A goal', one(r) === 0, r.err);

  r = await cust(
    U.B,
    `update public.savings_goals set name = 'Tampered' where id = $1 returning id`,
    [directGoalId]
  );
  ok(
    '9E RLS: customer B cannot update A goal',
    !r.err && (r.rows || []).length === 0,
    r.err
  );

  r = await cust(U.B, `delete from public.savings_goals where id = $1 returning id`, [
    directGoalId,
  ]);
  ok(
    '9E RLS: customer B cannot delete A goal',
    !r.err && (r.rows || []).length === 0,
    r.err
  );

  r = await cust(U.A, `delete from public.savings_goals where id = $1 returning id`, [
    directGoalId,
  ]);
  ok(
    '9E RLS: customer A can delete own direct goal',
    !r.err && r.rows?.length === 1,
    r.err
  );

  // ---- 4. Server-side simple-interest projection math (exact verification)
  // Case A: Lump sum P0 = ₱10,000.00 (1,000,000c), M = 0, 12 months, 2.50% (250 bps)
  // Simple interest = 1,000,000 * 0.025 * (12 / 12) = 25,000c (compound would be 25,288c).
  r = await cust(
    U.A,
    `select public.project_savings_goal(1000000, 1500000, $1::date, 0, 250) as p`,
    [plus12m]
  );
  const pLump = r.rows?.[0]?.p;
  ok(
    '9E projection: 12-month lump sum uses exact simple interest (25,000c, not compound)',
    !r.err &&
      pLump?.interest_model === 'simple' &&
      Number(pLump?.months_to_target) === 12 &&
      Number(pLump?.total_deposits_cents) === 0 &&
      Number(pLump?.projected_interest_cents) === 25000 &&
      Number(pLump?.projected_amount_cents) === 1025000 &&
      Number(pLump?.shortfall_cents) === 475000 &&
      pLump?.on_track === false &&
      Array.isArray(pLump?.schedule) &&
      pLump.schedule.length === 12 &&
      Number(pLump.schedule[5].cumulative_interest_cents) === 12500 &&
      Number(pLump.schedule[11].cumulative_interest_cents) === 25000,
    r.err || JSON.stringify(pLump)
  );

  // Case B: P0 = 120,000c, M = 100,000c/mo, 6 months, 2.40% p.a. (240 bps = 20 bps/mo)
  // Sum of monthly principals = 6*120,000 + (6*5/2)*100,000 = 720,000 + 1,500,000 = 2,220,000c
  // Simple interest = 2,220,000 * 0.002 = 4,440c; projected = 120,000 + 600,000 + 4,440 = 724,440c.
  r = await cust(
    U.A,
    `select public.project_savings_goal(120000, 700000, $1::date, 100000, 240) as p`,
    [plus6m]
  );
  const pMonthly = r.rows?.[0]?.p;
  ok(
    '9E projection: starting principal + monthly deposits matches closed-form simple interest (4,440c)',
    !r.err &&
      Number(pMonthly?.months_to_target) === 6 &&
      Number(pMonthly?.total_deposits_cents) === 600000 &&
      Number(pMonthly?.projected_interest_cents) === 4440 &&
      Number(pMonthly?.projected_amount_cents) === 724440 &&
      Number(pMonthly?.shortfall_cents) === 0 &&
      pMonthly?.on_track === true &&
      Number(pMonthly?.estimated_months_to_goal) === 6 &&
      pMonthly?.projected_completion_date === plus6m,
    r.err || JSON.stringify(pMonthly)
  );

  // ---- 5. RPC validation guards
  r = await cust(U.A, `select public.create_savings_goal('   ', 500000, $1::date)`, [
    plus6m,
  ]);
  ok(
    '9E validation: blank goal name rejected',
    !!r.err && /between 1 and 60 characters/.test(r.err || ''),
    r.err
  );

  r = await cust(U.A, `select public.create_savings_goal($1, 500000, $2::date)`, [
    'X'.repeat(61),
    plus6m,
  ]);
  ok(
    '9E validation: >60-char goal name rejected',
    !!r.err && /between 1 and 60 characters/.test(r.err || ''),
    r.err
  );

  r = await cust(U.A, `select public.create_savings_goal('Valid', 0, $1::date)`, [
    plus6m,
  ]);
  ok(
    '9E validation: non-positive target_amount_cents rejected',
    !!r.err && /Target amount must be greater than zero/.test(r.err || ''),
    r.err
  );

  r = await cust(U.A, `select public.create_savings_goal('Valid', 500000, $1::date)`, [
    yesterday,
  ]);
  ok(
    '9E validation: past target_date rejected on create',
    !!r.err && /Target date must be today or in the future/.test(r.err || ''),
    r.err
  );

  r = await cust(
    U.A,
    `select public.create_savings_goal('Valid', 500000, $1::date, -100)`,
    [plus6m]
  );
  ok(
    '9E validation: negative monthly_deposit_cents rejected',
    !!r.err && /Monthly deposit cannot be negative/.test(r.err || ''),
    r.err
  );

  r = await cust(
    U.A,
    `select public.create_savings_goal('Valid', 500000, $1::date, 10000, $2)`,
    [plus6m, B.id]
  );
  ok(
    '9E validation: create_savings_goal rejects linking another customer account',
    !!r.err && /Unauthorized: linked account does not belong to caller/.test(r.err || ''),
    r.err
  );

  // ---- 6. End-to-end Goal lifecycle: create -> list -> update -> archive -> delete
  r = await cust(
    U.A,
    `select public.create_savings_goal('  Durian Harvest Fund  ', $1, $2::date, 200000, $3, 250) as g`,
    [balABefore + 1000000, plus6m, A.id]
  );
  const created = r.rows?.[0]?.g;
  const goalId = created?.id;
  ok(
    '9E CRUD: create_savings_goal trims name, links own account balance, and returns simulation notice',
    !r.err &&
      !!goalId &&
      created.name === 'Durian Harvest Fund' &&
      created.linked_account_id === A.id &&
      created.linked_account_last4 === A.account_number.slice(-4) &&
      Number(created.current_amount_cents) === balABefore &&
      Number(created.months_to_target) === 6 &&
      created.on_track === true &&
      created.simulation_notice ===
        'Simulation — goals are projections only. No funds are reserved or moved.',
    r.err || JSON.stringify(created)
  );

  // List active goals for A and confirm B sees 0 goals
  r = await cust(U.A, `select * from public.list_my_savings_goals('active')`);
  ok(
    '9E CRUD: list_my_savings_goals returns A active goal with live balance projection',
    !r.err &&
      r.rows.length === 1 &&
      r.rows[0].id === goalId &&
      Number(r.rows[0].current_amount_cents) === balABefore &&
      Number(r.rows[0].projected_amount_cents) === Number(created.projected_amount_cents),
    r.err || JSON.stringify(r.rows)
  );

  r = await cust(U.B, `select * from public.list_my_savings_goals()`);
  ok(
    '9E CRUD: list_my_savings_goals returns 0 rows for customer B',
    !r.err && r.rows.length === 0,
    r.err
  );

  // B cannot update, archive, or delete A's goal via RPCs
  r = await cust(U.B, `select public.update_savings_goal($1, 'Hijack')`, [goalId]);
  ok(
    '9E CRUD: B cannot update A goal via RPC',
    !!r.err && /not found/.test(r.err || ''),
    r.err
  );

  r = await cust(U.B, `select public.archive_savings_goal($1)`, [goalId]);
  ok(
    '9E CRUD: B cannot archive A goal via RPC',
    !!r.err && /not found/.test(r.err || ''),
    r.err
  );

  r = await cust(U.B, `select public.delete_savings_goal($1)`, [goalId]);
  ok(
    '9E CRUD: B cannot delete A goal via RPC',
    !!r.err && /not found/.test(r.err || ''),
    r.err
  );

  // Update goal: unlink account (p_clear_linked_account = true) & change monthly deposit
  r = await cust(
    U.A,
    `select public.update_savings_goal($1, 'Kadayawan Trip', 600000, $2::date, 100000, null, true, 0, null) as g`,
    [goalId, plus6m]
  );
  const updated = r.rows?.[0]?.g;
  ok(
    '9E CRUD: update_savings_goal updates fields and clears linked account (0% rate => 600,000c exact)',
    !r.err &&
      updated?.name === 'Kadayawan Trip' &&
      updated?.linked_account_id === null &&
      Number(updated?.current_amount_cents) === 0 &&
      Number(updated?.projected_interest_cents) === 0 &&
      Number(updated?.projected_amount_cents) === 600000 &&
      updated?.on_track === true,
    r.err || JSON.stringify(updated)
  );

  // Archive goal via archive_savings_goal
  r = await cust(U.A, `select public.archive_savings_goal($1) as res`, [goalId]);
  ok(
    '9E CRUD: archive_savings_goal marks status archived',
    !r.err && r.rows?.[0]?.res?.status === 'archived',
    r.err || JSON.stringify(r.rows)
  );

  r = await cust(U.A, `select * from public.list_my_savings_goals('active')`);
  ok(
    '9E CRUD: archived goal excluded from active filter',
    !r.err && r.rows.length === 0,
    r.err
  );

  r = await cust(U.A, `select * from public.list_my_savings_goals('archived')`);
  ok(
    '9E CRUD: archived goal returned by archived filter',
    !r.err && r.rows.length === 1 && r.rows[0].id === goalId,
    r.err
  );

  // Delete goal via delete_savings_goal
  r = await cust(U.A, `select public.delete_savings_goal($1) as res`, [goalId]);
  ok(
    '9E CRUD: delete_savings_goal deletes caller goal',
    !r.err && r.rows?.[0]?.res?.deleted === true,
    r.err || JSON.stringify(r.rows)
  );

  r = await cust(U.A, `select * from public.list_my_savings_goals()`);
  ok('9E CRUD: deleted goal no longer listed', !r.err && r.rows.length === 0, r.err);

  const goalAudits = await su(
    `select action from public.audit_logs where entity = 'savings_goals' and entity_id = $1 order by created_at`,
    [goalId]
  );
  ok(
    '9E audit: create, update, archive, and delete recorded in audit_logs',
    goalAudits.map((x) => x.action).join(',') ===
      'savings_goal_created,savings_goal_updated,savings_goal_archived,savings_goal_deleted',
    JSON.stringify(goalAudits)
  );

  // ---- 7. Pure Time-Deposit Quote Function (spec §4.8)
  // Compare all 5 demo terms (30, 60, 90, 180, 360 days) on ₱100,000.00 (10,000,000c)
  r = await cust(U.A, `select * from public.quote_time_deposit(10000000, null)`);
  ok(
    '9E TD quote: null term returns all 5 demo terms (30/60/90/180/360) with Simulation notice',
    !r.err &&
      r.rows.length === 5 &&
      r.rows.map((x) => Number(x.term_days)).join(',') === '30,60,90,180,360' &&
      r.rows.every(
        (x) =>
          x.simulation_only === true &&
          Number(x.day_count_basis) === 360 &&
          x.simulation_notice ===
            'Simulation — sample rates only. No time deposit is opened and no funds move.'
      ),
    r.err || JSON.stringify(r.rows)
  );

  // Single-term exact simple interest checks (actual/360 basis):
  // 360 days @ 450 bps (4.50%) on 10,000,000c => interest = 450,000c, maturity = 10,450,000c
  r = await cust(U.A, `select * from public.quote_time_deposit(10000000, 360)`);
  ok(
    '9E TD quote: 360-day quote on ₱100,000.00 @ 4.50% yields exact ₱4,500.00 interest',
    !r.err &&
      r.rows.length === 1 &&
      Number(r.rows[0].annual_rate_bps) === 450 &&
      Number(r.rows[0].projected_interest_cents) === 450000 &&
      Number(r.rows[0].maturity_amount_cents) === 10450000,
    r.err || JSON.stringify(r.rows)
  );

  // 90 days @ 375 bps (3.75%) on 10,000,000c => 10,000,000 * 375 * 90 / 3,600,000 = 93,750c
  r = await cust(U.A, `select * from public.quote_time_deposit(10000000, 90)`);
  ok(
    '9E TD quote: 90-day quote on ₱100,000.00 @ 3.75% yields exact ₱937.50 interest',
    !r.err &&
      r.rows.length === 1 &&
      Number(r.rows[0].annual_rate_bps) === 375 &&
      Number(r.rows[0].projected_interest_cents) === 93750 &&
      Number(r.rows[0].maturity_amount_cents) === 10093750,
    r.err || JSON.stringify(r.rows)
  );

  r = await cust(U.A, `select * from public.quote_time_deposit(50000, 30)`);
  ok(
    '9E TD quote: principal below ₱1,000.00 rejected',
    !!r.err && /between ₱1,000\.00 and ₱100,000,000\.00/.test(r.err || ''),
    r.err
  );

  r = await cust(U.A, `select * from public.quote_time_deposit(1000000, 45)`);
  ok(
    '9E TD quote: unsupported term (45 days) rejected',
    !!r.err && /choose 30, 60, 90, 180, or 360 days/.test(r.err || ''),
    r.err
  );

  // ---- 8. Suspended profile guard
  await su(`update public.profiles set status = 'suspended' where id = $1`, [U.B]);
  r = await cust(U.B, `select public.create_savings_goal('Blocked', 500000, $1::date)`, [
    plus6m,
  ]);
  ok(
    '9E suspended guard: suspended user cannot create goal',
    /suspended/.test(r.err || ''),
    r.err
  );
  r = await cust(U.B, `select * from public.quote_time_deposit(1000000, 30)`);
  ok(
    '9E suspended guard: suspended user cannot quote time deposit',
    /suspended/.test(r.err || ''),
    r.err
  );
  await su(`update public.profiles set status = 'active' where id = $1`, [U.B]);

  // ---- 9. Proof of NO fund lock, NO new accounts, and NO money movement
  const txAfter = Number(
    (await su(`select count(*)::int n from public.transactions`))[0].n
  );
  const leAfter = Number(
    (await su(`select count(*)::int n from public.ledger_entries`))[0].n
  );
  const accAfter = Number((await su(`select count(*)::int n from public.accounts`))[0].n);
  const balAAfter = await bal(A.id);
  const balBAfter = await bal(B.id);
  const tdTables = await su(
    `select tablename from pg_tables where schemaname = 'public' and tablename like '%time_deposit%'`
  );
  ok(
    '9E invariant: zero transactions, ledger entries, new accounts, balance changes, or TD tables created',
    txAfter === txBefore &&
      leAfter === leBefore &&
      accAfter === accBefore &&
      balAAfter === balABefore &&
      balBAfter === balBBefore &&
      tdTables.length === 0,
    JSON.stringify({
      txBefore,
      txAfter,
      leBefore,
      leAfter,
      accBefore,
      accAfter,
      balABefore,
      balAAfter,
      tdTables,
    })
  );
}
