/* eslint-disable -- reviewer harness suite (Node globals); see Phase-5-Fixes-Prompt.md */
// Phase 9 · Stage 9H — Cards backend. Local PGlite only: no hosted DB and no .env access.
// Asserts the six security invariants S1-S6 from the accepted cards design.

const luhnValid = (pan) => {
  let sum = 0;
  let double = false;
  for (let i = pan.length - 1; i >= 0; i -= 1) {
    let d = Number(pan[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
};

const aal1 = (uid) => ({
  sub: uid,
  aal: 'aal1',
  amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }],
});

export async function runPhase9CardsTests({ as, su, cust, one, bal, ok, U, A, B }) {
  // Integration cleanup: earlier reviewer suites can leave the shared demo user
  // locked or with fresh risk signals that re-trigger the protective evaluator.
  // Restore this suite's clean pre-cards state without changing any guard.
  await su(`delete from public.bantay_protective_locks where user_id=$1`, [U.A]);
  await su(`delete from public.security_events where user_id=$1`, [U.A]);
  await su(`update public.security_limits set locked_at=null, unlock_after=null where user_id=$1`, [U.A]);

  const seed = async (uid) => {
    try {
      const rows = await su('select public.phase9_seed_cards($1) as r', [uid]);
      return rows[0]?.r;
    } catch (e) {
      ok('9H seed hook throws', false, e.message);
      return null;
    }
  };

  // Bantay's challenge flow is part of the unchanged money engine. Clear it
  // with the same idempotency key before a card payment, exactly as the app does.
  const clearChallenge = async (uid, toAccount, amount, key) => {
    const prep = await cust(uid, `select public.prepare_risk_challenge($1,$2,$3) as p`, [toAccount, amount, key]);
    if (prep.err) return prep.err;
    if (prep.rows?.[0]?.p?.challenge_required) {
      const conf = await cust(uid, `select public.confirm_risky_payment($1) as c`, [key]);
      return conf.err || null;
    }
    return null;
  };
  const payMerchant = async (uid, merchantId, accountId, toAccount, amount, key) => {
    const err = await clearChallenge(uid, toAccount, amount, key);
    if (err) return { err, rows: [] };
    return cust(uid, `select public.pay_demo_merchant($1,$2,$3,$4) as r`, [merchantId, accountId, amount, key]);
  };
  const payCreditBill = async (uid, accountId, billerAccount, reference, amount, key) => {
    const err = await clearChallenge(uid, billerAccount, amount, key);
    if (err) return { err, rows: [] };
    return cust(uid, `select public.pay_bill($1,$2,$3,$4,$5) as r`, [accountId, (await su(`select id from public.billers where name='Davao Bank Card (simulation)'`))[0].id, reference, amount, key]);
  };

  const seedA = await seed(U.A);
  const seedB = await seed(U.B);
  ok('9H seed: service-role hook creates one debit/credit card per customer',
    !!seedA?.debit_card_id && !!seedB?.debit_card_id && seedA.credit_masked_last4 !== seedB.credit_masked_last4,
    JSON.stringify({ seedA, seedB }));

  const cards = await su(`select d.id, d.user_id, d.linked_account_id, d.masked_last4, d.status,
      public._phase9_cards_decrypt(d.pan_ciphertext) as pan,
      public._phase9_cards_decrypt(d.cvv_ciphertext) as cvv,
     d.pan_ciphertext, d.cvv_ciphertext
    from public.digital_debit_cards d order by d.created_at`);
  ok('9H S1/S2: every stored fake PAN is in the 9900...00-99 range, fails Luhn, and matches masked last4',
    cards.length === 2 && cards.every(c =>
      /^99000000000000[0-9][0-9]$/.test(c.pan) && !luhnValid(c.pan) &&
      c.masked_last4 === c.pan.slice(-4) && /^[0-9]{3}$/.test(c.cvv)),
    JSON.stringify(cards.map(c => ({ pan: c.pan, cvv: c.cvv, masked: c.masked_last4 }))));
  ok('9H S2: PAN/CVV columns are bytea ciphertext, never plaintext',
    cards.every(c => c.pan_ciphertext instanceof Uint8Array && c.cvv_ciphertext instanceof Uint8Array &&
      !Buffer.from(c.pan_ciphertext).toString('utf8').includes(c.pan) &&
      !Buffer.from(c.cvv_ciphertext).toString('utf8').includes(c.cvv)),
    JSON.stringify(cards.map(c => ({ panType: typeof c.pan_ciphertext, cvvType: typeof c.cvv_ciphertext }))));

  const secretColumns = await su(`select table_name, column_name, data_type
    from information_schema.columns
    where table_schema='public' and (column_name ilike '%pan%' or column_name ilike '%cvv%')
    order by table_name, column_name`);
  ok('9H S2: no text column can hold a PAN or CVV',
    secretColumns.length === 2 && secretColumns.every(c => c.data_type === 'bytea'),
    JSON.stringify(secretColumns));

  const cardA = cards.find(c => c.user_id === U.A);
  const cardB = cards.find(c => c.user_id === U.B);
  const statement = (await su(`select * from public.credit_card_statements where user_id=$1 order by period_start limit 1`, [U.A]))[0];
  const biller = (await su(`select id, account_id from public.billers where name='Davao Bank Card (simulation)'`))[0];
  const bakery = (await su(`select id, settlement_account_id from public.demo_merchants where name='Durian City Bakery (demo)'`))[0];
  const onlineMerchant = (await su(`select id, settlement_account_id from public.demo_merchants where name='Davao Online Market (demo)'`))[0];
  ok('9H seed: demo biller, statement reference and both demo merchants exist',
    !!statement && /^DBCC-[0-9]{8}$/.test(statement.payment_reference) && !!biller && !!bakery && !!onlineMerchant,
    JSON.stringify({ statement: statement?.payment_reference, biller: biller?.id, bakery: bakery?.id }));

  // RLS: own rows only; no client writes.
  let r = await cust(U.A, `select id from public.digital_debit_cards`);
  ok('9H RLS: owner sees own debit card', !r.err && r.rows.length === 1 && r.rows[0].id === cardA.id, r.err || JSON.stringify(r.rows));
  r = await cust(U.B, `select id from public.digital_debit_cards where id=$1`, [cardA.id]);
  ok('9H RLS: second customer sees zero rows for another card', !r.err && r.rows.length === 0, r.err || JSON.stringify(r.rows));
  r = await as('anon', null, `select id from public.digital_debit_cards`);
  ok('9H RLS: anon is denied card rows', /permission denied/.test(r.err || ''), r.err);
  r = await as('authenticated', U.A, `insert into public.digital_debit_cards
      (user_id, linked_account_id, masked_last4, expiry_month, expiry_year, daily_limit_cents, pan_ciphertext, cvv_ciphertext)
      select user_id, linked_account_id, masked_last4, expiry_month, expiry_year, daily_limit_cents, pan_ciphertext, cvv_ciphertext
      from public.digital_debit_cards limit 1`);
  ok('9H RLS: client cannot insert a debit card', /permission denied/.test(r.err || ''), r.err);
  r = await as('authenticated', U.A, `update public.digital_debit_cards set status='active' where id=$1`, [cardA.id]);
  ok('9H RLS: client cannot update card status', /permission denied/.test(r.err || ''), r.err);
  r = await as('authenticated', U.A, `delete from public.digital_debit_cards where id=$1`, [cardA.id]);
  ok('9H RLS: client cannot delete a debit card', /permission denied/.test(r.err || ''), r.err);
  r = await as('authenticated', U.A, `insert into public.demo_merchants (name, category, settlement_account_id)
      select 'Client merchant (demo)', 'retail', settlement_account_id from public.demo_merchants limit 1`);
  ok('9H RLS: client cannot insert a merchant', /permission denied/.test(r.err || ''), r.err);
  r = await as('authenticated', U.A, `update public.credit_card_statements set total_due_cents=1 where id=$1`, [statement.id]);
  ok('9H RLS: client cannot update a statement', /permission denied/.test(r.err || ''), r.err);

  // S3 reveal requires money step-up and is audited without values.
  r = await as('authenticated', U.A, `select public.reveal_card_secrets($1) as r`, [cardA.id], aal1(U.A));
  ok('9H S3: reveal rejects aal1 with STEP_UP_REQUIRED', r.err === 'STEP_UP_REQUIRED', r.err);
  r = await cust(U.A, `select public.reveal_card_secrets($1) as r`, [cardA.id]);
  const revealed = r.rows?.[0]?.r;
  ok('9H S3: aal2 reveal returns fake PAN/CVV with 30-second display window',
    !r.err && revealed?.pan === cardA.pan && revealed?.cvv === cardA.cvv &&
    /\/[0-9]{2}$/.test(revealed?.expiry || '') && !!revealed?.display_until,
    r.err || JSON.stringify(revealed));
  r = await cust(U.A, `select public.reveal_card_secrets($1) as r`, [cardB.id]);
  ok('9H S3: wrong-card reveal returns no data', !r.err && r.rows?.[0]?.r === null, r.err || JSON.stringify(r.rows));
  const revealAudit = await su(`select metadata from public.audit_logs where action='card_secrets_revealed' and actor_id=$1 order by created_at desc limit 1`, [U.A]);
  ok('9H S3/S4: reveal is audited with ids only, never PAN/CVV',
    revealAudit.length === 1 && !JSON.stringify(revealAudit[0].metadata).includes(cardA.pan) &&
    !JSON.stringify(revealAudit[0].metadata).includes(cardA.cvv),
    JSON.stringify(revealAudit));

  // S4 controls: every one fails at aal1, succeeds at aal2, and is audited.
  r = await as('authenticated', U.A, `select public.set_card_frozen($1, true) as r`, [cardA.id], aal1(U.A));
  ok('9H S4: freeze rejects aal1', r.err === 'STEP_UP_REQUIRED', r.err);
  r = await cust(U.A, `select public.set_card_frozen($1, true) as r`, [cardA.id]);
  ok('9H S4: freeze succeeds at aal2', !r.err && r.rows?.[0]?.r?.status === 'frozen', r.err || JSON.stringify(r.rows));
  r = await cust(U.A, `select status from public.digital_debit_cards where id=$1`, [cardA.id]);
  ok('9H S4: frozen status is persisted on the server', !r.err && r.rows?.[0]?.status === 'frozen', r.err || JSON.stringify(r.rows));
  r = await cust(U.A, `select public.set_card_frozen($1, false) as r`, [cardA.id]);
  ok('9H S4: unfreeze succeeds at aal2', !r.err && r.rows?.[0]?.r?.status === 'active', r.err || JSON.stringify(r.rows));
  const freezeAudits = await su(`select action from public.audit_logs where action in ('card_frozen','card_unfrozen') and actor_id=$1 order by created_at`, [U.A]);
  ok('9H S4: freeze and unfreeze both append audit rows',
    freezeAudits.some(a => a.action === 'card_frozen') && freezeAudits.some(a => a.action === 'card_unfrozen'),
    JSON.stringify(freezeAudits));

  r = await as('authenticated', U.A, `select public.set_card_online_purchases($1, false) as r`, [cardA.id], aal1(U.A));
  ok('9H control: online toggle rejects aal1', r.err === 'STEP_UP_REQUIRED', r.err);
  r = await cust(U.A, `select public.set_card_online_purchases($1, false) as r`, [cardA.id]);
  ok('9H control: online toggle succeeds at aal2', !r.err && r.rows?.[0]?.r?.online_purchases_enabled === false, r.err || JSON.stringify(r.rows));
  r = await cust(U.A, `select public.set_card_daily_limit($1, 999999999) as r`, [cardA.id]);
  ok('9H control: card limit cannot exceed the engine ceiling', /500000000/.test(r.err || ''), r.err);
  r = await cust(U.A, `select public.set_card_daily_limit($1, 50000000) as r`, [cardA.id]);
  ok('9H control: daily-limit change succeeds at aal2', !r.err && r.rows?.[0]?.r?.daily_limit_cents === 50000000, r.err || JSON.stringify(r.rows));
  const controlActions = (await su(`select action from public.audit_logs where actor_id=$1 and action in ('card_online_purchases_changed','card_daily_limit_changed')`, [U.A])).map(a => a.action);
  ok('9H control: online toggle and limit change are audited',
    controlActions.includes('card_online_purchases_changed') && controlActions.includes('card_daily_limit_changed'),
    JSON.stringify(controlActions));

  // Online toggle blocks an online merchant before any money moves.
  const beforeOnline = await bal(A.id);
  r = await payMerchant(U.A, onlineMerchant.id, A.id, onlineMerchant.settlement_account_id, 2500, 'cards-online-off');
  ok('9H merchant: online purchase blocked when the card toggle is off',
    /Online purchases are turned off/.test(r.err || '') && (await bal(A.id)) === beforeOnline, r.err);
  r = await cust(U.A, `select public.set_card_online_purchases($1, true) as r`, [cardA.id]);
  ok('9H merchant: online toggle restored', !r.err, r.err);

  // Merchant payment through unchanged transfer/_transfer_core.
  const beforeA = await bal(A.id);
  const beforeMerchant = await bal(bakery.settlement_account_id);
  r = await as('authenticated', U.A, `select public.pay_demo_merchant($1,$2,10000,'cards-aal1') as r`, [bakery.id, A.id], aal1(U.A));
  ok('9H merchant: payment rejects aal1', r.err === 'STEP_UP_REQUIRED', r.err);
  r = await payMerchant(U.A, bakery.id, A.id, bakery.settlement_account_id, 10000, 'cards-merchant-1');
  const pay1 = r.rows?.[0]?.r;
  ok('9H merchant: aal2 payment calls existing transfer and is not a replay',
    !r.err && pay1?.idempotent_replay === false && pay1?.reference === 'Card merchant: Durian City Bakery (demo)',
    r.err || JSON.stringify(pay1));
  ok('9H merchant: ledger debits savings and credits the demo merchant, net zero',
    (await bal(A.id)) === beforeA - 10000 && (await bal(bakery.settlement_account_id)) === beforeMerchant + 10000,
    JSON.stringify({ beforeA, afterA: await bal(A.id), beforeMerchant, afterMerchant: await bal(bakery.settlement_account_id) }));

  const ledgerBeforeReplay = (await su(`select count(*)::int n from public.ledger_entries`))[0].n;
  r = await payMerchant(U.A, bakery.id, A.id, bakery.settlement_account_id, 10000, 'cards-merchant-1');
  ok('9H idempotency: replay returns idempotent_replay with no second ledger movement',
    !r.err && r.rows?.[0]?.r?.idempotent_replay === true &&
    (await su(`select count(*)::int n from public.ledger_entries`))[0].n === ledgerBeforeReplay,
    r.err || JSON.stringify(r.rows));

  // Direct transfer to a merchant settlement account is blocked by the ledger trigger.
  await clearChallenge(U.A, bakery.settlement_account_id, 2500, 'cards-direct-merchant');
  r = await cust(U.A, `select public.transfer($1,$2,2500,'cards-direct-merchant','Direct merchant') as r`, [A.id, bakery.settlement_account_id]);
  ok('9H trigger: direct transfer to a demo merchant is rejected',
    /Card is frozen, replaced or missing|Card merchant settlement requires/.test(r.err || ''), r.err);

  // Card-day cap is additional to Bantay's own daily limit.
  const spent = (await su(`select public._phase9_cards_spend_today($1) as n`, [A.id]))[0].n;
  await cust(U.A, `select public.set_card_daily_limit($1,$2) as r`, [cardA.id, spent + 10000]);
  r = await payMerchant(U.A, bakery.id, A.id, bakery.settlement_account_id, 10000, 'cards-cap-1');
  ok('9H card cap: payment up to the remaining card-day allowance succeeds', !r.err, r.err);
  r = await payMerchant(U.A, bakery.id, A.id, bakery.settlement_account_id, 10000, 'cards-cap-2');
  ok('9H card cap: second payment over the card-day allowance is rejected',
    /Card daily limit reached/.test(r.err || ''), r.err);
  await cust(U.A, `select public.set_card_daily_limit($1,50000000) as r`, [cardA.id]);

  // Bantay guards still run because the wrapper uses transfer/_transfer_core.
  const limitBefore = (await su(`select daily_transfer_limit_centavos from public.security_limits where user_id=$1`, [U.A]))[0]?.daily_transfer_limit_centavos;
  await su(`update public.security_limits set daily_transfer_limit_centavos=100000 where user_id=$1`, [U.A]);
  r = await payMerchant(U.A, bakery.id, A.id, bakery.settlement_account_id, 250000, 'cards-bantay-limit');
  ok('9H Bantay: the unchanged daily-limit guard blocks card payments',
    /Daily limit reached/.test(r.err || ''), r.err);
  if (limitBefore !== undefined) {
    await su(`update public.security_limits set daily_transfer_limit_centavos=$1 where user_id=$2`, [limitBefore, U.A]);
  }
  await su(`update public.security_limits set locked_at=null where user_id=$1`, [U.A]);

  // Frozen and replaced cards cannot transact.
  await cust(U.A, `select public.set_card_frozen($1, true) as r`, [cardA.id]);
  r = await payMerchant(U.A, bakery.id, A.id, bakery.settlement_account_id, 2500, 'cards-frozen');
  ok('9H card state: frozen card cannot pay', /frozen|active card/.test(r.err || ''), r.err);
  await cust(U.A, `select public.set_card_frozen($1, false) as r`, [cardA.id]);
  r = await cust(U.A, `select public.replace_card() as r`);
  const newCard = r.rows?.[0]?.r;
  ok('9H control: replacement issues a fresh masked card at aal2',
    !r.err && !!newCard?.id && newCard.masked_last4 !== cardA.masked_last4, r.err || JSON.stringify(newCard));
  r = await cust(U.A, `select public.reveal_card_secrets($1) as r`, [cardA.id]);
  ok('9H S3: replaced card cannot be revealed', !r.err && r.rows?.[0]?.r === null, r.err || JSON.stringify(r.rows));
  r = await cust(U.A, `select public.set_card_frozen($1, true) as r`, [cardA.id]);
  ok('9H card state: retired card cannot be controlled', !r.err && r.rows?.[0]?.r === null, r.err || JSON.stringify(r.rows));
  r = await payMerchant(U.A, bakery.id, A.id, bakery.settlement_account_id, 2500, 'cards-after-replace');
  const replaceIntent = await su(`select metadata from public.audit_logs
    where action='card_merchant_payment_started' and metadata->>'idempotency_key'='cards-after-replace' limit 1`);
  ok('9H card state: payments continue with the replacement card, not the retired one',
    !r.err && replaceIntent[0]?.metadata?.card_id === newCard.id, r.err || JSON.stringify(replaceIntent));
  const replacedAudit = await su(`select count(*)::int n from public.audit_logs where action='card_replaced' and actor_id=$1`, [U.A]);
  ok('9H S4: replacement is audited', replacedAudit[0].n >= 1, JSON.stringify(replacedAudit));

  // Activity is readable and secret-free.
  r = await cust(U.A, `select public.get_my_card_transactions(50) as r`);
  const activity = r.rows?.[0]?.r;
  ok('9H Activity: card activity uses readable labels and formatted references only',
    !r.err && Array.isArray(activity) && activity.length >= 2 &&
    activity.every(x => /^Card /.test(x.label) &&
      /^DB-[0-9A-F]{4}-[0-9A-F]{4}$/.test(x.reference_id || '') &&
      !JSON.stringify(x).includes(cardA.pan) &&
      !JSON.stringify(x).includes('DBCC-') &&
      !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(JSON.stringify(x))),
    r.err || JSON.stringify(activity));
  r = await cust(U.A, `select public.get_my_cards() as r`);
  const myCards = r.rows?.[0]?.r;
  ok('9H read: cards list exposes masked numbers only and the simulation notice',
    !r.err && myCards?.notice.includes('Simulation — virtual card') &&
    myCards.debit_cards.every(d => d.display_number === '•••• ' + d.masked_last4 && !JSON.stringify(d).includes(cardA.pan)) &&
    !JSON.stringify(myCards.credit_card).includes('9900'),
    r.err || JSON.stringify(myCards));

  // S6 credit payment goes only through the existing pay_bill RPC.
  const dueBefore = myCards.credit_card.amount_due_cents;
  r = await payCreditBill(U.A, A.id, biller.account_id, statement.payment_reference, 500000, 'cards-credit-1');
  ok('9H S6: credit payment uses the existing pay_bill RPC', !r.err && r.rows?.[0]?.r?.biller_name === 'Davao Bank Card (simulation)', r.err || JSON.stringify(r.rows));
  r = await cust(U.A, `select public.get_my_card_statement($1) as r`, [statement.id]);
  const stmtAfter = r.rows?.[0]?.r;
  ok('9H credit: amount due is derived from ledger-backed payments',
    !r.err && stmtAfter?.paid_cents === 500000 && stmtAfter.amount_due_cents === dueBefore - 500000,
    r.err || JSON.stringify(stmtAfter));
  r = await payCreditBill(U.A, A.id, biller.account_id, statement.payment_reference, 800000, 'cards-credit-overpay');
  ok('9H credit: overpayment is rolled back', /exceeds the amount due/.test(r.err || ''), r.err);
  r = await payCreditBill(U.B, B.id, biller.account_id, statement.payment_reference, 10000, 'cards-credit-cross-customer');
  ok('9H credit: another customer cannot credit this statement',
    /Card statement not found|statement owner/.test(r.err || ''), r.err);
  r = await cust(U.A, `select public.get_my_card_statement($1) as r`, [statement.id]);
  ok('9H credit: rejected payments leave the derived amount due unchanged',
    !r.err && r.rows?.[0]?.r?.amount_due_cents === dueBefore - 500000, r.err || JSON.stringify(r.rows));

  // Reversal restores derived due (net ledger movement, no stored balance).
  const creditTx = (await su(`select transaction_id from public.bill_payments where biller_reference=$1 and payer_account=$2`, [statement.payment_reference, A.id]))[0]?.transaction_id;
  r = await cust(U.ADM, `select public.admin_reverse_transaction($1,'cards review reversal','cards-credit-reverse') as r`, [creditTx]);
  ok('9H credit: admin reversal restores derived amount due',
    !r.err && !!r.rows?.[0]?.r?.id, r.err || JSON.stringify(r.rows));
  r = await cust(U.A, `select public.get_my_card_statement($1) as r`, [statement.id]);
  ok('9H credit: reversal is reflected without writing a card balance',
    !r.err && r.rows?.[0]?.r?.amount_due_cents === dueBefore, r.err || JSON.stringify(r.rows));

  await su(`update public.billers set is_active=false where id=$1`, [biller.id]);
  r = await payCreditBill(U.A, A.id, biller.account_id, statement.payment_reference, 10000, 'cards-credit-inactive');
  ok('9H credit: deactivated demo biller rejects payment', /Biller is currently inactive/.test(r.err || ''), r.err);
  await su(`update public.billers set is_active=true where id=$1`, [biller.id]);

  // Admin views require aal2 then admin role, and only show masked numbers.
  r = await cust(U.A, `select public.admin_list_cards() as r`);
  ok('9H admin: customer cannot call admin card views', /Administrator access required/.test(r.err || ''), r.err);
  r = await as('authenticated', U.ADM, `select public.admin_list_cards() as r`, [], aal1(U.ADM));
  ok('9H admin: staff at aal1 is rejected', r.err === 'STEP_UP_REQUIRED', r.err);
  r = await cust(U.ADM, `select public.admin_list_cards($1) as r`, [U.A]);
  const adminCards = r.rows?.[0]?.r;
  ok('9H admin: aal2 admin sees masked metadata only, never a fake PAN',
    !r.err && Array.isArray(adminCards) && adminCards.length >= 2 &&
    adminCards.every(c => c.display_number === '•••• ' + c.masked_last4 && !JSON.stringify(c).includes('9900')),
    r.err || JSON.stringify(adminCards));
  r = await cust(U.ADM, `select public.admin_get_card_activity($1,50) as r`, [U.A]);
  ok('9H admin: activity view returns readable rows', !r.err && Array.isArray(r.rows?.[0]?.r), r.err);
  r = await cust(U.ADM, `select public.admin_card_summary() as r`);
  ok('9H admin: aggregate summary has no card identifiers',
    !r.err && r.rows?.[0]?.r?.debit_active > 0 && !JSON.stringify(r.rows).includes('9900'), r.err || JSON.stringify(r.rows));
  const adminAudit = await su(`select count(*)::int n from public.audit_logs where action='admin_card_viewed' and actor_id=$1`, [U.ADM]);
  ok('9H admin: card views are audited', adminAudit[0].n >= 3, JSON.stringify(adminAudit));

  // Definer + empty search_path on every new RPC/helper.
  const fnNames = [
    '_phase9_cards_encrypt', '_phase9_cards_decrypt', '_phase9_luhn_check_digit',
    '_phase9_fake_pan', '_phase9_fake_cvv', '_phase9_cards_spend_today',
    '_phase9_cards_paid_for_statement', '_phase9_format_reference', 'get_my_cards', 'get_my_card_statement',
    'get_my_card_transactions', 'reveal_card_secrets', 'set_card_frozen',
    'set_card_online_purchases', 'set_card_daily_limit', 'replace_card',
    'pay_demo_merchant', 'enforce_card_merchant_rules', 'enforce_credit_card_payment',
    'admin_list_cards', 'admin_get_card_activity', 'admin_card_summary', 'phase9_seed_cards',
  ];
  const fnMeta = await su(`select p.proname, p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '') as cfg
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname = any($1::text[]) order by p.proname`, [fnNames]);
  ok('9H security metadata: all 23 card functions are SECURITY DEFINER with a locked search_path',
    fnMeta.length === fnNames.length && fnMeta.every(f => f.prosecdef === true &&
      /(^|,)search_path=(""|public, extensions)($|,)/.test(f.cfg)),
    JSON.stringify(fnMeta));

  const grants = await su(`select p.proname, array_agg(coalesce(r.rolname,'?') order by r.rolname) as roles
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    left join aclexplode(p.proacl) a on true
    left join pg_roles r on r.oid=a.grantee
    where n.nspname='public' and p.proname in ('reveal_card_secrets','set_card_frozen','phase9_seed_cards','_phase9_cards_encrypt')
    group by p.proname order by p.proname`);
  ok('9H grants: reveal/control helpers are revoked from anon and public',
    Array.isArray(grants) && grants.every(g => !g.roles.includes('anon') && !g.roles.includes('public')),
    JSON.stringify(grants));
}
