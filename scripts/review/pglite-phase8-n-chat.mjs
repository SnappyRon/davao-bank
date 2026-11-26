// Local-only PGlite behaviour checks for Stage 8N (Bantay AI chat backend).
// No hosted writes, no .env access. The Edge Function's provider call is not
// emulated here; these checks cover RLS, RPC scoping and reserve-before-call gates.

const CALL_QUOTA = (userId) =>
  `select public.bantay_chat_check_quota('${userId}'::uuid) r`;
const CALL_RESERVE = (userId) =>
  `select public.bantay_chat_reserve_model_call('${userId}'::uuid) r`;

export async function runPhase8NChatTests({ as, su, cust, ok, U }) {
  const value = async (sql) => {
    const rows = await su(sql);
    return Object.values(rows[0] ?? {})[0];
  };
  const quota = async (userId) => (await su(CALL_QUOTA(userId)))[0].r;
  const reserve = async (userId) => (await su(CALL_RESERVE(userId)))[0].r;
  const open = async (userId, existing = null) =>
    (
      await su(`select public.bantay_chat_open_session($1::uuid, $2::uuid) id`, [
        userId,
        existing,
      ])
    )[0].id;
  const count = async (sql) => Number((await su(sql))[0].n);
  const attempt = async (fn) => {
    try {
      return { rows: await fn() };
    } catch (error) {
      return { err: error.message };
    }
  };

  ok(
    '8N config defaults fail closed with 30/4/500 caps',
    (await value(
      `select coalesce((select enabled from public.bantay_chat_config where id), true)::text ||
             ':' || (select per_user_daily_cap::text from public.bantay_chat_config where id) ||
             ':' || (select per_minute_cap::text from public.bantay_chat_config where id) ||
             ':' || (select daily_global_cap::text from public.bantay_chat_config where id) ||
             ':' || (select context_version from public.bantay_chat_config where id)`
    )) === 'false:30:4:500:1'
  );

  const anonConfig = await as('anon', null, `select * from public.bantay_chat_config`);
  ok('8N anon cannot read the chat config', !!anonConfig.err, anonConfig.err || '');
  const custConfig = await cust(U.A, `select * from public.bantay_chat_config`);
  ok('8N customer cannot read the chat config', !!custConfig.err, custConfig.err || '');
  for (const table of [
    'bantay_chat_requests',
    'bantay_chat_usage',
    'bantay_chat_global_usage',
  ]) {
    const r = await cust(U.A, `select * from public.${table}`);
    ok(`8N customer has no direct access to ${table}`, !!r.err, r.err || '');
  }

  let r = await quota(U.A);
  ok(
    '8N disabled kill switch blocks quota',
    r.allowed === false && r.reason === 'chat_disabled',
    JSON.stringify(r)
  );
  r = await reserve(U.A);
  ok(
    '8N disabled kill switch blocks model reservation',
    r.allowed === false && r.limit_reached === true,
    JSON.stringify(r)
  );

  await su(`update public.bantay_chat_config set enabled = true where id`);
  r = await quota(U.A);
  ok(
    '8N first allowed chat reserves one daily message and minute slot',
    r.allowed === true && r.quota_remaining === 29,
    JSON.stringify(r)
  );
  ok(
    '8N quota writes per-user daily and rolling-minute rows',
    (await count(
      `select count(*)::int n from public.bantay_chat_usage where user_id='${U.A}' and message_count=1`
    )) === 1 &&
      (await count(
        `select count(*)::int n from public.bantay_chat_requests where user_id='${U.A}'`
      )) === 1
  );

  await su(`update public.bantay_chat_config set per_minute_cap = 2 where id`);
  await su(`delete from public.bantay_chat_requests where user_id='${U.A}'`);
  await su(`delete from public.bantay_chat_usage where user_id='${U.A}'`);
  await quota(U.A);
  await quota(U.A);
  r = await quota(U.A);
  ok(
    '8N fourth message in a rolling minute is blocked',
    r.allowed === false && r.reason === 'rate_limited',
    JSON.stringify(r)
  );
  ok(
    '8N rejected minute row does not consume another daily message',
    (await value(
      `select message_count from public.bantay_chat_usage where user_id='${U.A}'`
    )) === 2
  );

  await su(
    `update public.bantay_chat_config set per_minute_cap = 10, per_user_daily_cap = 2 where id`
  );
  await su(`delete from public.bantay_chat_requests where user_id='${U.B}'`);
  await su(`delete from public.bantay_chat_usage where user_id='${U.B}'`);
  await quota(U.B);
  await quota(U.B);
  r = await quota(U.B);
  ok(
    '8N per-user daily cap is enforced in Asia/Manila days',
    r.allowed === false && r.reason === 'daily_limit',
    JSON.stringify(r)
  );
  ok(
    '8N rejected daily message is rolled back',
    (await value(
      `select message_count from public.bantay_chat_usage where user_id='${U.B}'`
    )) === 2
  );

  await su(`update public.bantay_chat_config set daily_global_cap = 2 where id`);
  await su(`delete from public.bantay_chat_global_usage`);
  r = await reserve(U.A);
  const firstGlobal = r.model_calls;
  await reserve(U.B);
  r = await reserve(U.A);
  ok(
    '8N global provider cap reserves atomically before the call',
    firstGlobal === 1 &&
      r.allowed === false &&
      r.limit_reached === true &&
      r.model_calls === 2,
    JSON.stringify(r)
  );
  ok(
    '8N rejected global reservation does not increment the counter',
    (await value(
      `select model_calls from public.bantay_chat_global_usage where day=(now() at time zone 'Asia/Manila')::date`
    )) === 2
  );

  const deniedCallerQuota = await cust(U.A, CALL_QUOTA(U.A));
  const deniedCallerReserve = await cust(U.A, CALL_RESERVE(U.A));
  ok(
    '8N customers cannot call quota or reservation RPCs',
    !!deniedCallerQuota.err && !!deniedCallerReserve.err,
    `${deniedCallerQuota.err || ''} ${deniedCallerReserve.err || ''}`
  );

  const sA = await open(U.A);
  const same = await open(U.A, sA);
  const foreign = await open(U.A, await open(U.B));
  ok('8N open_session reuses a live own session', same === sA, `${same} / ${sA}`);
  ok(
    '8N open_session never reuses another user session',
    foreign !== sA,
    `${foreign} / ${sA}`
  );
  await su(
    `update public.bantay_chat_sessions set expires_at = now() - interval '1 minute' where id=$1`,
    [sA]
  );
  const expired = await open(U.A, sA);
  ok(
    '8N expired sessions are pruned and replaced',
    expired !== sA &&
      (await count(
        `select count(*)::int n from public.bantay_chat_sessions where id='${sA}'`
      )) === 0
  );

  const s1 = await open(U.A);
  await su(
    `select public.bantay_chat_save_messages($1::uuid,$2::uuid,$3,$4,$5::jsonb,$6)`,
    [U.A, s1, 'hello', 'reply', '["open_bantay"]', 'ai']
  );
  const history = await su(
    `select role, content, actions from public.bantay_chat_load_history($1::uuid,$2::uuid,8)`,
    [s1, U.A]
  );
  ok(
    '8N save/load keeps both messages, source and allow-listed action',
    history.length === 2 &&
      history
        .map((item) => item.role)
        .sort()
        .join(',') === 'assistant,user' &&
      history.some(
        (item) => item.role === 'assistant' && item.actions[0] === 'open_bantay'
      ),
    JSON.stringify(history)
  );
  const crossHistory = await su(
    `select * from public.bantay_chat_load_history($1::uuid,$2::uuid,8)`,
    [s1, U.B]
  );
  ok(
    '8N history is scoped to the session owner',
    crossHistory.length === 0,
    JSON.stringify(crossHistory)
  );
  const crossSave = await attempt(() =>
    su(`select public.bantay_chat_save_messages($1::uuid,$2::uuid,'x','y')`, [U.B, s1])
  );
  ok('8N saving to another user session fails', !!crossSave.err, crossSave.err || '');

  const tooLong = await su(
    `select public.bantay_chat_save_messages($1::uuid,$2::uuid,$3,$4)`,
    [U.A, s1, 'u'.repeat(900), 'a'.repeat(900)]
  );
  void tooLong;
  const lengths = (
    await su(
      `select content from public.bantay_chat_messages where session_id=$1 order by created_at desc limit 2`,
      [s1]
    )
  ).map((x) => x.content.length);
  ok(
    '8N stored messages are clamped server-side',
    Math.max(...lengths) <= 600,
    JSON.stringify(lengths)
  );

  await su(
    `update public.bantay_chat_messages set created_at = now() - interval '25 hours'
       where id = (select id from public.bantay_chat_messages where session_id=$1 limit 1)`,
    [s1]
  );
  await open(U.A);
  ok(
    '8N session open lazily prunes messages past the 24 h retention window',
    (await count(
      `select count(*)::int n from public.bantay_chat_messages where created_at < now() - interval '24 hours'`
    )) === 0
  );

  for (let i = 0; i < 25; i += 1) {
    await su(`select public.bantay_chat_save_messages($1::uuid,$2::uuid,'u','a')`, [
      U.A,
      s1,
    ]);
  }
  ok(
    '8N each session keeps at most 40 messages',
    (await count(
      `select count(*)::int n from public.bantay_chat_messages where session_id='${s1}'`
    )) === 40
  );

  const ownRows = await cust(U.A, `select id from public.bantay_chat_sessions`);
  const foreignRows = await cust(
    U.A,
    `select id from public.bantay_chat_sessions where user_id='${U.B}'`
  );
  const ownMessages = await cust(U.A, `select id from public.bantay_chat_messages`);
  ok(
    '8N RLS exposes only the caller sessions and messages',
    !ownRows.err &&
      ownRows.rows.length > 0 &&
      (!foreignRows.rows || foreignRows.rows.length === 0) &&
      !ownMessages.err,
    `${ownRows.err || ''} ${ownMessages.err || ''}`
  );
  const anonMessages = await as(
    'anon',
    null,
    `select * from public.bantay_chat_messages`
  );
  ok('8N anon cannot read chat history', !!anonMessages.err, anonMessages.err || '');

  await cust(U.B, `select public.bantay_chat_clear('${s1}'::uuid)`);
  ok(
    '8N clear cannot delete another user session',
    (await count(
      `select count(*)::int n from public.bantay_chat_sessions where id='${s1}'`
    )) === 1
  );
  await cust(U.A, `select public.bantay_chat_clear('${s1}'::uuid)`);
  ok(
    '8N clear removes the caller session and its messages',
    (await count(
      `select count(*)::int n from public.bantay_chat_messages where session_id='${s1}'`
    )) === 0
  );

  const sB = await open(U.B);
  await su(`select public.bantay_chat_save_messages($1::uuid,$2::uuid,'u','a')`, [
    U.B,
    sB,
  ]);
  await cust(U.A, `select public.bantay_chat_clear_all()`);
  ok(
    '8N clear_all only removes the caller rows',
    (await count(
      `select count(*)::int n from public.bantay_chat_sessions where id='${sB}'`
    )) === 1
  );
  await cust(U.B, `select public.bantay_chat_clear_all()`);
  ok(
    '8N clear_all removes the caller sessions and messages',
    (await count(
      `select count(*)::int n from public.bantay_chat_sessions where user_id='${U.B}'`
    )) === 0
  );

  await su(
    `truncate public.bantay_chat_sessions, public.bantay_chat_messages, public.bantay_chat_requests, public.bantay_chat_usage, public.bantay_chat_global_usage restart identity`
  );
  await su(
    `update public.bantay_chat_config set enabled=false, per_user_daily_cap=30, per_minute_cap=4, daily_global_cap=500, context_version='1' where id`
  );
}
