/**
 * Davao Bank — Phase 6 Stage B: RLS Audit Script
 *
 * Verifies that:
 * 1. Every public table enables Row Level Security (relrowsecurity = true)
 * 2. No policy uses literal `true` for `qual` expression outside the allowlist (`health_check`)
 * 3. Neither `billers` nor `fx_rates` allow unauthenticated (anon/public) read access
 *
 * Run with: npx tsx scripts/audit-rls.ts
 */

import { PGlite } from '@electric-sql/pglite';
import * as fs from 'node:fs';
import * as path from 'node:path';

async function main() {
  console.log('[RLS Audit] Initializing database and applying all migrations...');
  const db = await PGlite.create();

  const bootPath = path.resolve(__dirname, 'review/pglite-boot.sql');
  await db.exec(fs.readFileSync(bootPath, 'utf8'));

  const migDir = path.resolve(__dirname, '../supabase/migrations');
  const migFiles = fs
    .readdirSync(migDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const f of migFiles) {
    await db.exec(fs.readFileSync(path.join(migDir, f), 'utf8'));
  }

  let failed = false;

  // 1. All public tables must enable RLS
  const unsecureTables = await db.query<{ relname: string }>(`
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false;
  `);

  if (unsecureTables.rows.length > 0) {
    console.error(
      '✗ [FAIL] Public tables lacking Row Level Security:',
      unsecureTables.rows.map((r) => r.relname).join(', ')
    );
    failed = true;
  } else {
    console.log('✓ [PASS] All public tables have Row Level Security enabled.');
  }

  // 2. No policy outside allowlist (health_check) can use `true`
  const unsecurePolicies = await db.query<{
    table_name: string;
    policy_name: string;
    qual: string;
  }>(`
    select c.relname as table_name, pol.polname as policy_name, pg_get_expr(pol.polqual, pol.polrelid) as qual
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and pg_get_expr(pol.polqual, pol.polrelid) = 'true'
      and c.relname not in ('health_check');
  `);

  if (unsecurePolicies.rows.length > 0) {
    console.error(
      '✗ [FAIL] Policies using literal `true` outside allow-list:',
      unsecurePolicies.rows.map((p) => `${p.table_name}.${p.policy_name}`).join(', ')
    );
    failed = true;
  } else {
    console.log(
      '✓ [PASS] No policies use literal `true` outside allowlist (health_check).'
    );
  }

  // 3. Neither billers nor fx_rates can allow anon/public reads
  const leakedRoles = await db.query<{ table_name: string; policy_name: string }>(`
    select c.relname as table_name, pol.polname as policy_name
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('billers', 'fx_rates')
      and (
        pol.polroles = '{0}'::oid[]
        or exists (select 1 from pg_roles r where r.oid = any(pol.polroles) and r.rolname = 'anon')
      );
  `);

  if (leakedRoles.rows.length > 0) {
    console.error(
      '✗ [FAIL] Leaked anon read policies on billers/fx_rates:',
      leakedRoles.rows.map((p) => `${p.table_name}.${p.policy_name}`).join(', ')
    );
    failed = true;
  } else {
    console.log(
      '✓ [PASS] Neither billers nor fx_rates allow unauthenticated anon reads.'
    );
  }

  if (failed) {
    process.exit(1);
  }
  console.log('\n[RLS Audit] All security invariants passed!');
}

main().catch((err) => {
  console.error('Audit failed with error:', err);
  process.exit(1);
});
