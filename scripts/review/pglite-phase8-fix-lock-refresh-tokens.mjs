// Local-only PGlite check for the hosted auth.refresh_tokens type mismatch fix.
// Creates hosted-shaped stand-ins (varchar refresh token user_id, uuid session
// user_id) and proves lock_my_account clears both. No hosted writes, no .env.

export async function runPhase8FixLockRefreshTokensTests({ su, cust, ok, U }) {
  const FIX = 'ab100002-0000-4000-8000-000000000001';
  const OTHER = U.A;

  await su(
    `create table if not exists auth.refresh_tokens (
       token text primary key, user_id character varying
     )`
  );
  await su(
    `create table if not exists auth.sessions (
       id uuid primary key default gen_random_uuid(), user_id uuid
     )`
  );

  await su(
    `insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at)
     values($1,$2,$3,now())`,
    [FIX, 'lock-refresh-token@t.test', JSON.stringify({ full_name: 'Lock refresh token test' })]
  );
  await su(
    `insert into auth.refresh_tokens(token,user_id) values
       ('p8j-fix-token-1',$1),('p8j-fix-token-other',$2::text)`,
    [FIX, OTHER]
  );
  await su(
    `insert into auth.sessions(user_id) values($1::uuid),($2::uuid)`,
    [FIX, OTHER]
  );

  const r = await cust(FIX, `select lock_my_account() l`);
  ok(
    '8J fix: lock_my_account succeeds with varchar refresh_tokens and uuid sessions',
    !r.err && r.rows?.[0]?.l?.locked === true,
    r.err || JSON.stringify(r.rows)
  );

  const rows = await su(
    `select
       (select count(*)::int from auth.refresh_tokens where user_id=$1::text) rt,
       (select count(*)::int from auth.sessions where user_id=$1::uuid) s,
       (select count(*)::int from auth.refresh_tokens where user_id=$2::text) other_rt,
       (select count(*)::int from auth.sessions where user_id=$2::uuid) other_s,
       (select count(*)::int from security_limits where user_id=$1::uuid and locked_at is not null) locked`,
    [FIX, OTHER]
  );
  ok(
    '8J fix: the lock clears both tables for the user and leaves other sessions alone',
    rows[0]?.rt === 0 &&
      rows[0]?.s === 0 &&
      rows[0]?.other_rt === 1 &&
      rows[0]?.other_s === 1 &&
      rows[0]?.locked === 1,
    JSON.stringify(rows)
  );
}
