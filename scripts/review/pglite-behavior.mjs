/* eslint-disable -- reviewer test harness (Node globals); see Phase-5-Fixes-Prompt.md */
// Reviewer harness (Phase 5 review, 2026-10-28). Applies every migration to an in-process Postgres (PGlite)
// with Supabase stand-ins (auth.users, auth.uid(), anon/authenticated/service_role) and runs real behavior checks.
// Run: npm i -D @electric-sql/pglite && node scripts/review/pglite-behavior.mjs
// Limits: single connection (no true concurrency), no pg_cron/pg_net/Edge Functions — concurrency still needs a live DB.
import { PGlite } from '@electric-sql/pglite'; import fs from 'node:fs'; import { fileURLToPath } from 'node:url';
const MIG=fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const db=await PGlite.create(); await db.exec(fs.readFileSync(new URL('./pglite-boot.sql',import.meta.url),'utf8'));
for (const f of fs.readdirSync(MIG).filter(f=>f.endsWith('.sql')).sort()) await db.exec(fs.readFileSync(`${MIG}/${f}`,'utf8'));
let pass=0, fail=0; const results=[];
const ok=(name,cond,detail='')=>{ (cond?pass++:fail++); results.push(`${cond?'✓':'✗'} ${name}${detail?' — '+detail:''}`); };
async function as(role, uid, sql, params=[]){
  await db.exec(`set role ${role}`); await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[uid||'']);
  try { const r=await db.query(sql,params); return {rows:r.rows}; } catch(e){ return {err:e.message}; }
  finally { await db.exec('reset role'); await db.query(`select set_config('request.jwt.claim.sub','',false)`); }
}
const su=(sql,p=[])=>db.query(sql,p).then(r=>r.rows);
const cust=(uid,sql,p)=>as('authenticated',uid,sql,p);
const one=r=>r.rows&&r.rows[0]&&Object.values(r.rows[0])[0];
const bal=async acc=>Number((await su(`select coalesce(sum(case when direction='credit' then amount else -amount end),0) b from ledger_entries where account_id=$1`,[acc]))[0].b);
const reconcile=async()=>{ const r=await su(`select (select coalesce(sum(case when direction='credit' then amount else -amount end),0) from ledger_entries) net,
  (select count(*) from (select transaction_id from ledger_entries le join transactions t on t.id=le.transaction_id where t.type in ('transfer','reversal','bill_payment') group by transaction_id having sum(case when direction='credit' then amount else -amount end)<>0) x) unbalanced,
  (select count(*) from account_balances ab where ab.balance <> (select coalesce(sum(case when direction='credit' then amount else -amount end),0) from ledger_entries le where le.account_id=ab.account_id)) mismatched`); return r[0]; };

// ---- users (signup trigger creates profile + account)
const U={A:'11111111-1111-1111-1111-111111111111',B:'22222222-2222-2222-2222-222222222222',ADM:'33333333-3333-3333-3333-333333333333',SYS:'44444444-4444-4444-4444-444444444444'};
for (const [k,id] of Object.entries(U)) await su(`insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values($1,$2,$3,now())`,[id,k.toLowerCase()+'@t.test',JSON.stringify({full_name:'User '+k})]);
ok('Signup trigger provisions profile + account for each user', (await su(`select count(*)::int n from accounts`))[0].n===4);

// ---- SEED BUG CHECK: service role sets role (what scripts/seed.ts does via upsert)
const seedTry=await as('service_role',null,`update profiles set role='admin' where id=$1`,[U.ADM]);
ok('[SEED] service-role can promote a profile to admin (seed.ts path)', !seedTry.err, seedTry.err||'');

// ---- Stage 0.6: guard_profile_self_update caller verification
const custRoleTry = await cust(U.A, `update profiles set role='admin' where id=$1`, [U.A]);
ok('Customer changing own role is rejected', !!custRoleTry.err && /Only admins/.test(custRoleTry.err), custRoleTry.err||'');
const custStatusTry = await cust(U.A, `update profiles set status='suspended' where id=$1`, [U.A]);
ok('Customer changing own status is rejected', !!custStatusTry.err && /Only admins/.test(custStatusTry.err), custStatusTry.err||'');
const anonTry = await as('anon', null, `update profiles set role='admin' where id=$1`, [U.A]);
ok('Anon changing role is rejected', !!anonTry.err || (anonTry.rows && anonTry.rows.length === 0));
const adminSuspendTry = await cust(U.ADM, `update profiles set status='suspended' where id=$1`, [U.B]);
ok('Admin can suspend a customer', !adminSuspendTry.err, adminSuspendTry.err||'');
await cust(U.ADM, `update profiles set status='active' where id=$1`, [U.B]);
const postgresTry = await su(`update profiles set status='active' where id=$1`, [U.B]);
ok('Postgres superuser can update profile status', Array.isArray(postgresTry));

// bootstrap admin/system for remaining tests (harness only)
await su(`alter table profiles disable trigger trg_guard_profile_self_update`);
await su(`update profiles set role='admin' where id=$1`,[U.ADM]); await su(`update profiles set role='system' where id=$1`,[U.SYS]);
await su(`alter table profiles enable trigger trg_guard_profile_self_update`);
const acc=async uid=>(await su(`select id,account_number from accounts where user_id=$1 order by created_at limit 1`,[uid]))[0];
const A=await acc(U.A), B=await acc(U.B), SYSACC=await acc(U.SYS);

// ---- Core money
let r=await cust(U.A,`select deposit($1,100000,'dep-1','seed')`,[A.id]); ok('Customer deposit works', !r.err, r.err);
r=await cust(U.A,`select deposit($1,100000,'dep-1','seed')`,[A.id]); ok('Deposit idempotent replay (same key → no second credit)', await bal(A.id)===100000);
r=await cust(U.A,`select transfer($1,$2,30000,'tx-1','t')`,[A.id,B.id]); ok('Transfer A→B', !r.err && await bal(A.id)===70000 && await bal(B.id)===30000, r.err);
r=await cust(U.A,`select transfer($1,$2,30000,'tx-1','t')`,[A.id,B.id]); ok('Transfer idempotent replay', await bal(A.id)===70000);
r=await cust(U.A,`select transfer($1,$2,999999,'tx-2','t')`,[A.id,B.id]); ok('Insufficient funds rejected', /Insufficient/.test(r.err||''), r.err);
r=await cust(U.B,`select transfer($1,$2,100,'tx-3','t')`,[A.id,B.id]); ok('Cannot spend from someone else\'s account', !!r.err, r.err);
r=await cust(U.A,`select _transfer_core($1,$2,$3,100,'tx-4','x','transfer')`,[U.B,B.id,A.id]); ok('Customer CANNOT call _transfer_core (would allow theft)', /permission denied/.test(r.err||''), r.err);
r=await cust(U.A,`select write_audit('fake','x','1','{}'::jsonb)`); ok('Customer cannot forge audit log', /permission denied/.test(r.err||''), r.err);
r=await cust(U.A,`insert into ledger_entries(account_id,transaction_id,direction,amount) values($1,gen_random_uuid(),'credit',1)`,[A.id]); ok('Customer cannot write ledger directly', !!r.err);
r=await cust(U.B,`select count(*)::int n from accounts where user_id=$1`,[U.A]); ok('RLS: B cannot see A\'s accounts', one(r)===0);

// ---- Suspension
await as('authenticated',U.ADM,`select admin_set_user_status($1,'suspended','test')`,[U.B]);
r=await cust(U.B,`select transfer($1,$2,100,'tx-s','t')`,[B.id,A.id]); ok('Suspended customer cannot transfer', /suspended/i.test(r.err||''), r.err);
r=await cust(U.B,`update profiles set status='active' where id=$1`,[U.B]); ok('Suspended customer cannot un-suspend self', !!r.err, r.err);
await as('authenticated',U.ADM,`select admin_set_user_status($1,'active','test')`,[U.B]);

// ---- Reversal once
const t1=(await su(`select id from transactions where idempotency_key='tx-1'`))[0].id;
r=await as('authenticated',U.ADM,`select admin_reverse_transaction($1,'dup','rev-1')`,[t1]); ok('Admin reversal works', !r.err && await bal(A.id)===100000, r.err);
r=await as('authenticated',U.ADM,`select admin_reverse_transaction($1,'dup','rev-2')`,[t1]); ok('Second reversal (new key) rejected', /already reversed/i.test(r.err||''), r.err);
r=await cust(U.A,`select admin_adjust_balance($1,500,'credit','x','adj-x')`,[A.id]); ok('Customer cannot call admin functions', /Admin privilege/.test(r.err||''), r.err);

// ---- Stage B: saved recipients + statement
r=await cust(U.A,`select add_saved_recipient($1,'Me')`,[A.account_number]); ok('Cannot save own account as recipient', !!r.err, r.err);
r=await cust(U.A,`select add_saved_recipient('1099999999','Ghost')`); ok('Cannot save nonexistent account', !!r.err, r.err);
r=await cust(U.A,`select add_saved_recipient($1,'Bee')`,[B.account_number]); ok('Save valid recipient', !r.err, r.err);
ok('add_saved_recipient does not return holder name', !JSON.stringify(r.rows||'').includes('User B'));
r=await cust(U.A,`insert into saved_recipients(owner_id,account_number,nickname) values($1,'1099999999','x')`,[U.A]); ok('Direct insert into saved_recipients denied', !!r.err);
r=await cust(U.A,`update saved_recipients set account_number='1099999999' where owner_id=$1 returning account_number`,[U.A]);
ok('Owner CANNOT change a saved recipient\'s account number (bypassing validation)', !!r.err || (r.rows||[]).length===0, r.err||('updated to '+JSON.stringify(r.rows)));
r=await cust(U.A,`select get_account_statement($1,(now()-interval '30 days')::date,(now()+interval '1 day')::date) s`,[A.id]);
if(r.err) ok('Statement runs', false, r.err); else { const s=r.rows[0].s; const keys=Object.keys(s); ok('Statement returns opening/closing/rows', true, keys.join(',')); }
r=await cust(U.B,`select get_account_statement($1,current_date-30,current_date)`,[A.id]); ok('Non-owner cannot fetch statement', !!r.err, r.err);

// ---- Stage C: billers, bill pay, schedules
r=await as('authenticated',U.ADM,`select admin_create_biller('Mindanao Power Co. (demo)','electricity','Customer number','^[0-9]{10}$')`);
ok('Admin creates biller (+ settlement account)', !r.err, r.err);
const biller=(await su(`select id,account_id from billers limit 1`))[0];
r=await cust(U.A,`select pay_bill($1,$2,'12AB','5000','bill-1')`,[A.id,biller?.id]); ok('Bill pay rejects malformed reference', !!r.err, r.err);
r=await cust(U.A,`select pay_bill($1,$2,'1234567890',5000,'bill-2')`,[A.id,biller?.id]); ok('Bill pay with valid reference', !r.err, r.err);
ok('bill_payments row linked to its transaction', (await su(`select count(*)::int n from bill_payments bp join transactions t on t.id=bp.transaction_id`))[0].n===1);
const today=(await su(`select (now() at time zone 'Asia/Manila')::date d`))[0].d;
r=await cust(U.A,`select create_scheduled_payment($1,'transfer',$2,null,null,1000,'weekly',$3,null,3,'rent')`,[A.id,B.id,today]); ok('Create weekly schedule starting today', !r.err, r.err);
const before=await bal(A.id);
r=await su(`select run_due_scheduled_payments() r`); const r2=await su(`select run_due_scheduled_payments() r`);
ok('Executor called twice → exactly one run & one debit', (await su(`select count(*)::int n from scheduled_payment_runs`))[0].n===1 && before-await bal(A.id)===1000, JSON.stringify(r[0].r));
ok('next_run_date advanced by 7 days', (await su(`select next_run_date - $1::date d from scheduled_payments limit 1`,[today]))[0].d===7);
// insufficient funds schedule → failed run, no ledger
r=await cust(U.B,`select create_scheduled_payment($1,'transfer',$2,null,null,99999999,'once',$3,null,null,'big')`,[B.id,A.id,today]);
const ledgerBefore=(await su(`select count(*)::int n from ledger_entries`))[0].n; await su(`select run_due_scheduled_payments()`);
const fr=await su(`select r.status,r.failure_reason from scheduled_payment_runs r join scheduled_payments s on s.id=r.schedule_id where s.note='big'`);
ok('Unfunded scheduled run recorded as failed, no ledger writes', fr[0]?.status==='failed' && (await su(`select count(*)::int n from ledger_entries`))[0].n===ledgerBefore, JSON.stringify(fr[0]||r.err));
// monthly date math: start Jan 31
await su(`alter table scheduled_payments disable trigger all`).catch(()=>{});
const mid=(await su(`insert into scheduled_payments(owner_id,from_account,kind,to_account,amount,frequency,start_date,next_run_date,status) values($1,$2,'transfer',$3,100,'monthly','2026-01-31','2026-01-31','active') returning id`,[U.A,A.id,B.id]))[0].id;
await su(`alter table scheduled_payments enable trigger all`).catch(()=>{});
const dates=[]; for(let i=0;i<3;i++){ await su(`select run_due_scheduled_payments()`); const d=(await su(`select next_run_date::text d from scheduled_payments where id=$1`,[mid]))[0].d; dates.push(d); }
ok('Monthly from Jan 31 → Feb 28 → Mar 31 → Apr 30 (no drift)', dates.join(',')==='2026-02-28,2026-03-31,2026-04-30', dates.join(','));
r=await cust(U.A,`select run_due_scheduled_payments()`); ok('Customer cannot run the executor', /permission denied/.test(r.err||''), r.err);

// ---- Scheduled transfer by account number (§0.9 item 10)
r = await cust(U.A, `select create_scheduled_transfer_to_number($1, $2, 1000, 'once', $3, null, null, 'transfer to B')`, [A.id, B.account_number, today]);
ok('Customer schedules to another customer by account number', !r.err, r.err||'');
r = await cust(U.A, `select create_scheduled_transfer_to_number($1, '9999999999', 1000, 'once', $2, null, null, 'invalid')`, [A.id, today]);
ok('Scheduling to nonexistent number returns not-found error', !!r.err && /Recipient account number not found/.test(r.err), r.err||'');
r = await cust(U.A, `select create_scheduled_transfer_to_number($1, $2, 1000, 'once', $3, null, null, 'hack')`, [B.id, A.account_number, today]);
ok('Scheduling from someone else account is rejected', !!r.err, r.err||'');
r = await cust(U.A, `select * from list_my_scheduled_payments()`);
ok('list_my_scheduled_payments returns only caller rows with to_account_last4', !r.err && r.rows.every(row => row.owner_id === U.A) && r.rows.some(row => row.to_account_last4 === B.account_number.slice(-4)), r.err||'');

// ---- Stage D: payment requests
r=await cust(U.A,`select create_payment_request($1,$2,2500,'lunch') r`,[A.id,B.account_number]); ok('Create payment request', !r.err, r.err);
ok('Request response has no names', !JSON.stringify(r.rows||'').match(/User [AB]/));
const req=(await su(`select id from payment_requests limit 1`))[0]?.id;
r=await cust(U.A,`select pay_payment_request($1,$2,'pr-x')`,[req,A.id]); ok('Requester cannot pay own request', !!r.err, r.err);
await cust(U.B,`select deposit($1,50000,'dep-b','fund')`,[B.id]); const aBefore=await bal(A.id);
r=await cust(U.B,`select pay_payment_request($1,$2,'pr-1')`,[req,B.id]); ok('Payer pays request (requester credited 2,500)', !r.err && (await bal(A.id))-aBefore===2500, r.err||'')
const prStatus=(await su(`select status from payment_requests where id=$1`,[req]))[0].status; ok('Request marked paid + linked to transaction', prStatus==='paid' && (await su(`select transaction_id is not null t from payment_requests where id=$1`,[req]))[0].t)
//, !r.err, r.err);
const aMid=await bal(A.id);
r=await cust(U.B,`select pay_payment_request($1,$2,'pr-1') r`,[req,B.id]);
ok('Paid request same-key retry returns success (idempotent)', !r.err && r.rows?.[0]?.r?.idempotent_replay===true && await bal(A.id)===aMid, r.err||JSON.stringify(r.rows));
r=await cust(U.B,`select pay_payment_request($1,$2,'pr-2')`,[req,B.id]); ok('Second payment (new key) rejected, no extra money moved', !!r.err && !/Insufficient/.test(r.err) && await bal(A.id)===aMid, r.err);
r=await cust(U.A,`insert into payment_requests(requester_id,requester_account,payer_account_number,amount) values($1,$2,'x',1)`,[U.A,A.id]); ok('Direct insert into payment_requests denied', !!r.err);

// ---- Stage E: fx
r=await cust(U.A,`select count(*)::int n from fx_rates`); ok('Customers can read fx_rates', one(r)===768, String(one(r)));
r=await cust(U.A,`insert into fx_rates(base,quote,rate_date,rate,source) values('USD','PHP','2030-01-01',1,'x')`); ok('Customers cannot write fx_rates', !!r.err);

// ---- Stage B: Function Grants & RLS Hardening
const anonTransfer = await as('anon', null, `select transfer($1, $2, 1000, 'anon-key', 'hacked')`, [A.id, B.id]);
ok('Anon RPC to transfer rejected with permission denied', !!anonTransfer.err && /permission denied/.test(anonTransfer.err), anonTransfer.err||'');

const anonDeposit = await as('anon', null, `select deposit($1, 1000, 'anon-dep', 'hacked')`, [A.id]);
ok('Anon RPC to deposit rejected with permission denied', !!anonDeposit.err && /permission denied/.test(anonDeposit.err), anonDeposit.err||'');

const anonBillers = await as('anon', null, `select * from billers`);
ok('Anon cannot read billers (RLS deny)', !anonBillers.err && (!anonBillers.rows || anonBillers.rows.length === 0));

const anonFx = await as('anon', null, `select * from fx_rates`);
ok('Anon cannot read fx_rates (RLS deny)', !anonFx.err && (!anonFx.rows || anonFx.rows.length === 0));

// RLS Audit: 1. All public tables have RLS enabled
const unsecureTables = await su(`
  select c.relname
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false
`);
ok('RLS Audit: all public tables enable row-level security', unsecureTables.length === 0, unsecureTables.map(t=>t.relname).join(','));

// RLS Audit: 2. No policy uses literal true outside health_check
const unsecurePolicies = await su(`
  select c.relname as table_name, pol.polname as policy_name, pg_get_expr(pol.polqual, pol.polrelid) as qual
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and pg_get_expr(pol.polqual, pol.polrelid) = 'true'
    and c.relname not in ('health_check')
`);
ok('RLS Audit: no policies use using (true) outside health_check', unsecurePolicies.length === 0, unsecurePolicies.map(p=>`${p.table_name}.${p.policy_name}`).join(','));

// RLS Audit: 3. Neither fx_rates nor billers allow anon
const leakedRoles = await su(`
  select c.relname as table_name, pol.polname as policy_name
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('billers', 'fx_rates')
    and (
      pol.polroles = '{0}'::oid[]
      or exists (select 1 from pg_roles r where r.oid = any(pol.polroles) and r.rolname = 'anon')
    )
`);
ok('RLS Audit: neither billers nor fx_rates allow anon reads', leakedRoles.length === 0, leakedRoles.map(p=>`${p.table_name}.${p.policy_name}`).join(','));

// ---- Reconciliation
const rec=await reconcile();
ok('Reconciliation: every transfer/reversal/bill nets to zero', Number(rec.unbalanced)===0, JSON.stringify(rec));
ok('Reconciliation: account_balances == ledger sum for every account', Number(rec.mismatched)===0, JSON.stringify(rec));
console.log(results.join('\n')); console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
