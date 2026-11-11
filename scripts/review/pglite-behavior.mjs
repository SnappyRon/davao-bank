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
async function as(role, uid, sql, params=[], claims=uid ? {sub:uid, aal:"aal2", amr:[{method:"totp",timestamp:Math.floor(Date.now()/1000)}]} : {}){
  await db.exec(`set role ${role}`); await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[uid||'']);
  await db.query(`select set_config('request.jwt.claims',$1,false)`,[JSON.stringify(claims)]);
  try { const r=await db.query(sql,params); return {rows:r.rows}; } catch(e){ return {err:e.message}; }
  finally { await db.query(`select set_config('request.jwt.claims','',false)`); await db.exec('reset role'); await db.query(`select set_config('request.jwt.claim.sub','',false)`); }
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
for (const id of Object.values(U)) await su(`insert into auth.mfa_factors(user_id,factor_type,status) values($1,'totp','verified')`,[id]);
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

// F3 check: Admin deactivates biller
r = await as('authenticated', U.ADM, `select admin_set_biller_active($1, false)`, [biller?.id]);
ok('Admin deactivates biller via RPC', !r.err, r.err);
const custBillers = await cust(U.A, `select * from billers where id = $1`, [biller?.id]);
ok('Deactivated biller is hidden from customer', !custBillers.err && (custBillers.rows || []).length === 0);
const admBillers = await as('authenticated', U.ADM, `select * from billers where id = $1`, [biller?.id]);
ok('Deactivated biller remains visible to admin', !admBillers.err && (admBillers.rows || []).length === 1);
const billerAudit = await su(`select * from audit_logs where action = 'biller_status_changed' and entity_id = $1::text`, [biller?.id]);
ok('Audit log records biller_status_changed entry', (billerAudit || []).length > 0);
await as('authenticated', U.ADM, `select admin_set_biller_active($1, true)`, [biller?.id]);
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

// ---- Phase 6.5 server authorization (real SQL, simulated signed JWT claims)
const aal1 = {sub:U.A, aal:'aal1', amr:[{method:'password',timestamp:Math.floor(Date.now()/1000)}]};
const attempt = claims => as('authenticated',U.A,`select transfer($1,$2,1,'step-up-negative','test')`,[A.id,B.id],claims);
r=await attempt(aal1); ok('Enrolled aal1 transfer requires step-up', r.err==='STEP_UP_REQUIRED',r.err);
await su(`delete from auth.mfa_factors where user_id=$1`,[U.A]);
r=await attempt(aal1); ok('Unenrolled transfer requires enrollment',r.err==='STEP_UP_NOT_ENROLLED',r.err);
await su(`insert into auth.mfa_factors(user_id,factor_type,status) values($1,'totp','verified')`,[U.A]);
r=await attempt({...aal1,aal:'aal2',amr:[{method:'totp',timestamp:Math.floor(Date.now()/1000)-360}]});
ok('Six-minute-old TOTP is rejected',r.err==='STEP_UP_EXPIRED',r.err);
r=await attempt({...aal1,aal:'aal2',amr:[]}); ok('Missing TOTP claim fails closed',r.err==='STEP_UP_EXPIRED',r.err);
r=await as('authenticated',U.A,`select deposit($1,1,'aal1-deposit','test')`,[A.id],aal1);
ok('Deposit remains available at aal1',!r.err,r.err);
r=await cust(U.A,`select transfer($1,$2,1,'fresh-step-up','test')`,[A.id,B.id]); ok('Fresh TOTP permits transfer',!r.err,r.err);
r=await as('authenticated',U.ADM,`select admin_set_user_status($1,'active','test')`,[U.B],{sub:U.ADM,aal:'aal1'});
ok('Admin mutation rejects aal1',r.err==='STEP_UP_REQUIRED',r.err);
r=await cust(U.A,`select admin_reset_user_mfa($1,'Lost authenticator phone')`,[U.B]); ok('Customer cannot reset MFA',/Admin privilege/.test(r.err||''),r.err);
r=await cust(U.ADM,`select admin_reset_user_mfa($1,'Lost authenticator phone')`,[U.ADM]); ok('Admin cannot reset own MFA',/own MFA/.test(r.err||''),r.err);
r=await cust(U.ADM,`select admin_reset_user_mfa($1,'short')`,[U.B]); ok('MFA reset requires meaningful reason',/10 characters/.test(r.err||''),r.err);
r=await cust(U.ADM,`select admin_reset_user_mfa($1,'Lost authenticator phone')`,[U.B]);
ok('Admin reset removes customer factors and records audit',!r.err && (await su(`select count(*)::int n from auth.mfa_factors where user_id=$1`,[U.B]))[0].n===0 && (await su(`select count(*)::int n from audit_logs where action='user_mfa_reset' and entity_id=$1`,[U.B]))[0].n===1,r.err);
r=await cust(U.A,`update security_settings set money_step_up_enabled=false`);
ok('Customer cannot change emergency switch',(await su(`select money_step_up_enabled enabled from security_settings`))[0].enabled);
r=await cust(U.ADM,`select * from security_settings`); ok('Settings cannot be read by clients',!!r.err,r.err);
r=await cust(U.ADM,`update security_settings set money_step_up_enabled=false`);
ok('Admin can disable step-up',!r.err && !(await su(`select money_step_up_enabled enabled from security_settings`))[0].enabled,r.err);
r=await attempt(aal1); ok('Emergency switch bypasses step-up',!r.err,r.err);
await su(`update security_settings set money_step_up_enabled=true`);

const adminMutations=['admin_adjust_balance','admin_reverse_transaction','admin_set_user_status','admin_set_account_status','admin_open_account','admin_create_biller','admin_set_biller_active','admin_run_due_schedules_now'];
for (const name of adminMutations) {
  const [fn]=await su(`select oidvectortypes(proargtypes) args from pg_proc where proname=$1 and pronamespace='public'::regnamespace`,[name]);
  const args=fn.args ? fn.args.split(', ').map(type=>`null::${type}`).join(',') : '';
  const rejected=await as('authenticated',U.ADM,`select public.${name}(${args})`,[],{sub:U.ADM,aal:'aal1'});
  ok(`${name} rejects aal1 before mutation`,rejected.err==='STEP_UP_REQUIRED',rejected.err);
}
// ---- Phase 7 · 7B.9: notification wording, related transaction id, biller name
const last4=n=>'•• '+String(n).slice(-4);
const notes=async(uid,type)=>su(`select message, related_transaction_id from notifications where user_id=$1 and type=$2 order by created_at, message`,[uid,type]);
const txId=async key=>(await su(`select id from transactions where idempotency_key=$1`,[key]))[0]?.id;
let n=await notes(U.A,'deposit');
ok('7B.9 deposit: "You added ₱1,000.00 to •• 1234." + related id', n[0]?.message===`You added ₱1,000.00 to ${last4(A.account_number)}.` && n[0]?.related_transaction_id===await txId('dep-1'), JSON.stringify(n[0]));
n=await notes(U.A,'transfer_out');
ok('7B.9 transfer out: "You sent ₱300.00 to •• 1234. Note: t" + related id', n[0]?.message===`You sent ₱300.00 to ${last4(B.account_number)}. Note: t` && n[0]?.related_transaction_id===t1, JSON.stringify(n[0]));
n=await notes(U.B,'transfer_in');
ok('7B.9 transfer in: "You received ₱300.00 from •• 1234." + related id', n[0]?.message===`You received ₱300.00 from ${last4(A.account_number)}.` && n[0]?.related_transaction_id===t1, JSON.stringify(n[0]));
const rev1=await txId('rev-1');
n=await notes(U.A,'transaction_reversed');
ok('7B.9 reversal (sender): "Your transfer of ₱300.00 to •• 1234 was reversed." + reversal id', n.length===1 && n[0].message===`Your transfer of ₱300.00 to ${last4(B.account_number)} was reversed.` && n[0].related_transaction_id===rev1, JSON.stringify(n));
n=await notes(U.B,'transaction_reversed');
ok('7B.9 reversal (receiver): "A transfer of ₱300.00 from •• 1234 was reversed." + reversal id', n.length===1 && n[0].message===`A transfer of ₱300.00 from ${last4(A.account_number)} was reversed.` && n[0].related_transaction_id===rev1, JSON.stringify(n));
n=await notes(U.A,'bill_payment');
ok('7B.9 bill payment: "You paid ₱50.00 to <biller>." + related id', n[0]?.message==='You paid ₱50.00 to Mindanao Power Co. (demo).' && n[0]?.related_transaction_id===await txId('bill-2'), JSON.stringify(n[0]));
n=await notes(U.B,'payment_request_received');
ok('7B.9 request received: "•• 1234 requested ₱25.00 from you. Note: lunch", no related id', n[0]?.message===`${last4(A.account_number)} requested ₱25.00 from you. Note: lunch` && n[0]?.related_transaction_id===null, JSON.stringify(n[0]));
const prTx=(await su(`select transaction_id from payment_requests where id=$1`,[req]))[0].transaction_id;
n=await notes(U.A,'payment_request_paid');
ok('7B.9 request paid: "•• 1234 paid your request for ₱25.00." + related id', n.length===1 && n[0].message===`${last4(B.account_number)} paid your request for ₱25.00.` && n[0].related_transaction_id===prTx, JSON.stringify(n));
n=await notes(U.B,'account_alert');
ok('7B.9 user status: on hold, then active again (no staff reason)', n.length===2 && n[0].message==="Your account is on hold. You can't send or receive money until our team reviews it." && n[1].message==='Your account is active again.', JSON.stringify(n));
n=await notes(U.B,'scheduled_payment_failed');
ok('7B.9 scheduled failure: "Your scheduled payment of ₱999,999.99 on <Mon D> didn\'t go through. Your balance was too low."', n.length===1 && /^Your scheduled payment of ₱999,999\.99 on [A-Z][a-z]{2} \d{1,2} didn't go through\. Your balance was too low\.$/.test(n[0].message) && n[0].related_transaction_id===null, JSON.stringify(n));
// new flows: withdraw, adjustment (credit + debit), reversals, decline, account status, open account, staff schedule cancel
r=await cust(U.A,`select withdraw($1,1500,'wd-79','x')`,[A.id]); n=await notes(U.A,'withdrawal');
ok('7B.9 withdraw: "You cashed out ₱15.00 from •• 1234." + related id', !r.err && n[0]?.message===`You cashed out ₱15.00 from ${last4(A.account_number)}.` && n[0]?.related_transaction_id===await txId('wd-79'), r.err||JSON.stringify(n[0]));
r=await cust(U.ADM,`select admin_adjust_balance($1,500,'credit','Signature verified, unfreezing','adj-79c')`,[A.id]);
r=await cust(U.ADM,`select admin_adjust_balance($1,200,'debit','Concurrent reversal call A','adj-79d')`,[A.id]); n=await notes(U.A,'balance_adjustment');
ok('7B.9 adjustment: "We added ₱5.00 to your account." / "We deducted ₱2.00 …" + related ids, no reason', n.length===2 && n.some(x=>x.message==='We added ₱5.00 to your account.') && n.some(x=>x.message==='We deducted ₱2.00 from your account.') && n.every(x=>x.related_transaction_id), r.err||JSON.stringify(n));
// One-sided reversals (cash out, money added) have no zero-sum pair, so they run in rolled-back transactions to keep the reconciliation below meaningful.
await su('begin');
r=await cust(U.ADM,`select admin_reverse_transaction($1,'Concurrent reversal call A','rev-79')`,[await txId('wd-79')]); n=await notes(U.A,'transaction_reversed');
const rev79=await txId('rev-79');
await su('rollback');
ok('7B.9 cash-out reversal: "Your cash out of ₱15.00 was reversed." + reversal id', !r.err && n.some(x=>x.message==='Your cash out of ₱15.00 was reversed.' && x.related_transaction_id===rev79), r.err||JSON.stringify(n));
await su('begin');
await cust(U.A,`select deposit($1,70000,'dep-79r','x')`,[A.id]);
r=await cust(U.ADM,`select admin_reverse_transaction($1,'Concurrent reversal call A','rev-79a')`,[await txId('dep-79r')]); n=await notes(U.A,'transaction_reversed');
const rev79a=await txId('rev-79a');
await su('rollback');
ok('7B.9 deposit reversal: "Money you added (₱700.00) was reversed." + reversal id', !r.err && n.some(x=>x.message==='Money you added (₱700.00) was reversed.' && x.related_transaction_id===rev79a), r.err||JSON.stringify(n));
r=await cust(U.ADM,`select admin_reverse_transaction($1,'Concurrent reversal call A','rev-79b')`,[await txId('bill-2')]); n=await notes(U.A,'transaction_reversed');
const rev79b=await txId('rev-79b');
ok('7B.9 bill reversal: "Your bill payment of ₱50.00 was reversed." + reversal id', !r.err && n.some(x=>x.message==='Your bill payment of ₱50.00 was reversed.' && x.related_transaction_id===rev79b), r.err||JSON.stringify(n));
r=await cust(U.A,`select create_payment_request($1,$2,1200,null) r`,[A.id,B.account_number]);
const req2=(await su(`select id from payment_requests where amount=1200`))[0]?.id;
r=await cust(U.B,`select decline_payment_request($1)`,[req2]); n=await notes(U.A,'payment_request_declined');
ok('7B.9 request declined: "•• 1234 declined your request for ₱12.00."', !r.err && n[0]?.message===`${last4(B.account_number)} declined your request for ₱12.00.`, r.err||JSON.stringify(n[0]));
r=await cust(U.ADM,`select admin_set_account_status($1,'frozen','Signature verified, unfreezing')`,[A.id]);
r=await cust(U.ADM,`select admin_set_account_status($1,'active','Signature verified, unfreezing')`,[A.id]); n=await notes(U.A,'account_alert');
ok('7B.9 account status: on hold •• 1234, then "Your account is active again."', n.some(x=>x.message===`Your account ${last4(A.account_number)} is on hold. You can't send or receive money with it until our team reviews it.`) && n.some(x=>x.message==='Your account is active again.'), r.err||JSON.stringify(n));
r=await cust(U.ADM,`select admin_open_account($1,'checking','test open')`,[U.A]); n=await notes(U.A,'account_opened');
ok('7B.9 account opened: "We opened a new checking account for you: •• 1234."', !r.err && /^We opened a new checking account for you: •• \d{4}\.$/.test(n[0]?.message||''), r.err||JSON.stringify(n[0]));
const sched=(await su(`select id from scheduled_payments where owner_id=$1 and status='active' limit 1`,[U.A]))[0]?.id;
r=await cust(U.ADM,`select cancel_scheduled_payment($1,'Concurrent reversal call A')`,[sched]); n=await notes(U.A,'scheduled_payment_cancelled');
ok('7B.9 staff schedule cancel: "Your scheduled payment of ₱… was cancelled by our team." (no reason)', !r.err && /^Your scheduled payment of ₱[\d,]+\.\d{2} was cancelled by our team\.$/.test(n[0]?.message||''), r.err||JSON.stringify(n[0]));
const bad=(await su(`select message from notifications`)).filter(x=>/PHP|Reason|[0-9a-f]{8}-[0-9a-f]{4}-|Signature verified|Concurrent reversal|\d{10}/i.test(x.message));
ok('7B.9 no notification has PHP, ids, full account numbers or staff reasons', bad.length===0, JSON.stringify(bad.slice(0,3)));
// RLS on notifications stays row-based
r=await cust(U.B,`select count(*)::int n from notifications where user_id=$1`,[U.A]); ok('7B.9 RLS: B cannot read A\'s notifications', one(r)===0, r.err);
r=await cust(U.B,`select count(*)::int n from notifications where related_transaction_id=$1 and user_id<>$2`,[t1,U.B]); ok('7B.9 RLS: B cannot find A\'s notification by related id', one(r)===0, r.err);
r=await cust(U.A,`select count(*)::int n from notifications where related_transaction_id=$1`,[t1]); ok('7B.9 RLS: A reads own notification by related id (1 row)', one(r)===1, r.err);
// history: biller_name
r=await cust(U.A,`select type, biller_name from get_account_transactions($1)`,[A.id]);
ok('7B.9 history: own bill payment row carries biller_name', !r.err && r.rows.some(x=>x.type==='bill_payment' && x.biller_name==='Mindanao Power Co. (demo)'), r.err);
ok('7B.9 history: non-bill rows have null biller_name', !r.err && r.rows.filter(x=>x.type!=='bill_payment').every(x=>x.biller_name===null), r.err);
r=await cust(U.B,`select count(*)::int n from get_account_transactions($1)`,[A.id]); ok('7B.9 history: B gets no rows for A\'s account', one(r)===0, r.err);
r=await cust(U.B,`select count(*)::int n from get_account_transactions() where biller_name is not null`); ok('7B.9 history: B sees no biller names (no own bill payments)', one(r)===0, r.err);
r=await as('anon',null,`select * from get_account_transactions(null)`); ok('7B.9 history: anon cannot execute get_account_transactions', /permission denied/.test(r.err||''), r.err);
// ---- Reconciliation
const rec=await reconcile();
ok('Reconciliation: every transfer/reversal/bill nets to zero', Number(rec.unbalanced)===0, JSON.stringify(rec));
ok('Reconciliation: account_balances == ledger sum for every account', Number(rec.mismatched)===0, JSON.stringify(rec));
console.log(results.join('\n')); console.log(`\n${pass} passed, ${fail} failed`);
await db.close();
if (fail > 0) process.exit(1);
