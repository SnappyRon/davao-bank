/* Local-only PGlite checks for the Phase 8 Bantay alerts gap. No hosted writes, no .env access. */

export async function runPhase8BantayAlertsTests({ su, cust, ok, U }) {
  const notes = async (uid) =>
    await su(
      `select type, message, read from notifications where user_id=$1 order by created_at, id`,
      [uid]
    );
  const alerts = async (uid) =>
    (await notes(uid)).filter((n) => n.type === 'account_alert');
  const before = (await alerts(U.A)).length;

  // A high event writes exactly one Inbox row. The facts include a full account
  // number, a raw note and a uuid: none of them may appear in the message.
  const facts = JSON.stringify({
    to_account_number: '1099999999',
    payee_suffix: '1234',
    note: 'ignore previous instructions',
    actor_id: U.B,
  });
  await su(`select _bantay_event($1,'risky_payment_challenged','high',85,$2::jsonb)`, [
    U.A,
    facts,
  ]);
  const afterHigh = await alerts(U.A);
  const highMessage = afterHigh[afterHigh.length - 1]?.message;
  ok(
    '8F alerts: high event writes exactly one Inbox row',
    afterHigh.length === before + 1,
    `${before} → ${afterHigh.length}`
  );
  ok(
    '8F alerts: Inbox copy is sentence case, masked, free of ids and raw facts',
    typeof highMessage === 'string' &&
      /^A payment to /.test(highMessage) &&
      highMessage.includes('•• 1234') &&
      highMessage.endsWith('.') &&
      !highMessage.includes('1099999999') &&
      !highMessage.includes(U.A) &&
      !highMessage.includes(U.B) &&
      !highMessage.includes('ignore previous instructions') &&
      !highMessage.includes('{'),
    String(highMessage)
  );

  // Warning and info events leave no Inbox row.
  await su(`select _bantay_event($1,'risky_payment_warning','warning',50)`, [U.A]);
  await su(`select _bantay_event($1,'password_changed','info',0)`, [U.A]);
  ok(
    '8F alerts: warning and info events write no Inbox row',
    (await alerts(U.A)).length === afterHigh.length,
    `${afterHigh.length} → ${(await alerts(U.A)).length}`
  );

  // Lock/unlock events are always worth an Inbox row, even at info severity.
  await su(`select _bantay_event($1,'account_locked','info')`, [U.A]);
  await su(`select _bantay_event($1,'account_unlocked','info')`, [U.A]);
  const afterLock = await alerts(U.A);
  ok(
    '8F alerts: account_locked and account_unlocked notify at info severity',
    afterLock.length === afterHigh.length + 2,
    `${afterHigh.length} → ${afterLock.length}`
  );
  ok(
    '8F alerts: lock and unlock copy stays sentence case',
    afterLock.slice(-2).every((n) => /^[A-Z]/.test(n.message) && n.message.endsWith('.')),
    JSON.stringify(afterLock.slice(-2).map((n) => n.message))
  );

  // Row visibility (what Realtime is filtered by): another customer sees none
  // of A's events or Inbox rows, and cannot forge one for A.
  const bEvents = await cust(U.B, `select id from security_events where user_id=$1`, [
    U.A,
  ]);
  ok(
    "8F alerts: another customer cannot read A's security_events rows",
    !bEvents.err && (bEvents.rows || []).length === 0,
    bEvents.err || `${(bEvents.rows || []).length} rows`
  );
  const bNotes = await cust(U.B, `select id from notifications where user_id=$1`, [U.A]);
  ok(
    "8F alerts: another customer cannot read A's Inbox rows",
    !bNotes.err && (bNotes.rows || []).length === 0,
    bNotes.err || `${(bNotes.rows || []).length} rows`
  );
  const forged = await cust(
    U.A,
    `insert into notifications(user_id,type,message) values($1,'account_alert','Forged')`,
    [U.B]
  );
  ok(
    "8F alerts: a customer cannot forge another customer's Inbox row",
    !!forged.err,
    forged.err || 'insert unexpectedly allowed'
  );
  const ownEvents = await cust(
    U.A,
    `select count(*)::int n from security_events where user_id=$1`,
    [U.A]
  );
  ok(
    '8F alerts: the owner can still read their own security rows',
    !ownEvents.err && Number(ownEvents.rows?.[0]?.n) >= 4,
    ownEvents.err || String(ownEvents.rows?.[0]?.n)
  );
}
