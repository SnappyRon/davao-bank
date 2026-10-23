# Davao Bank — Phase 2 Implementation Prompt

**Hand this entire file to your coding agent.** Phase: **2 of 7 — Database & Authentication.** Phase 1 (setup, shared palette, Supabase scaffold, both app skeletons) is **approved and complete**. Build Phase 2 on top of it without regressing Phase 1.

This phase lays the secure data foundation: the full database schema, Row-Level Security, roles, and working authentication for both customers (mobile) and staff (admin). **Do not build money-movement logic or UI** (transfers/deposits/withdrawals, balances screens, admin management) — those are Phase 3 and Phase 4.

---

## 0. Pre-step (housekeeping from Phase 1 review)

- Add `**/next-env.d.ts` to `.prettierignore` so `npm run format:check` passes repo-wide (it currently fails on that one auto-generated file).

## 1. What to review before starting

- The approved **Davao Bank Project Proposal v1.1**, especially **§7 Data Model and Database Design** (7.1 entities, 7.2 ledger/integrity, 7.3 RLS & access control), **§5.2 User Roles and Permissions**, and **§6.1 Architectural Principles** (server-authoritative money, least privilege, auditable).
- The existing code: `packages/shared/src/supabase/client.ts` (client factory — you will extend it for sessions), `supabase/migrations/` (existing `health_check` migration — **do not edit it**; add new migrations), `apps/mobile` and `apps/admin` (skeletons you will add auth to).
- If anything here conflicts with the proposal or the existing code, **stop and flag it** rather than guessing.

## 2. Scope boundary (read carefully)

**In scope for Phase 2:**

- The **full database schema** (all tables from §7.1), with constraints, indexes, and RLS policies.
- Roles (customer, admin) and the access-control helper used by RLS.
- A trigger that provisions a profile (+ one default account) on user signup.
- Append-only audit-log infrastructure.
- A read-only account-balance view (derived from the ledger).
- Seed data (1 admin, 2 demo customers with starting balances).
- **Authentication**: customer sign-up / email verification / login / password reset (mobile), and staff login with admin-role enforcement (admin web), including session persistence.

**Explicitly NOT in scope (do not build):**

- Transfer / deposit / withdrawal functions or UI (Phase 3).
- Balances / transaction-history / account screens beyond a minimal authenticated landing (Phase 3).
- Admin management features — user/account/transaction management, adjustments, audit viewer UI (Phase 4).
- Do not delete or repurpose the `health_check` table/flow; leave it working as the connectivity indicator.

## 3. Database — what to implement (new migrations under `supabase/migrations/`)

Create the full schema per proposal §7.1. Use **additive, version-controlled migrations**; everything must apply cleanly from scratch via `supabase db reset`.

### 3.1 Tables

- **profiles** — `id uuid primary key references auth.users(id) on delete cascade`, `full_name text`, `phone text`, `role text not null default 'customer' check (role in ('customer','admin'))`, `status text not null default 'active' check (status in ('active','suspended'))`, `created_at timestamptz not null default now()`.
- **accounts** — `id uuid pk default gen_random_uuid()`, `account_number text unique not null`, `user_id uuid not null references profiles(id) on delete cascade`, `type text not null default 'savings' check (type in ('savings','checking'))`, `currency text not null default 'PHP'`, `status text not null default 'active' check (status in ('active','frozen','closed'))`, `created_at timestamptz not null default now()`.
- **transactions** — `id uuid pk default gen_random_uuid()`, `type text not null check (type in ('transfer','deposit','withdrawal','adjustment','reversal'))`, `status text not null default 'completed' check (status in ('pending','completed','failed','reversed'))`, `initiated_by uuid references profiles(id)`, `idempotency_key text unique`, `reference text`, `created_at timestamptz not null default now()`.
- **ledger_entries** — `id uuid pk default gen_random_uuid()`, `account_id uuid not null references accounts(id)`, `transaction_id uuid not null references transactions(id) on delete cascade`, `direction text not null check (direction in ('debit','credit'))`, `amount bigint not null check (amount > 0)` _(store money in integer minor units — centavos; never floating point)_, `created_at timestamptz not null default now()`.
- **transfers** — `id uuid pk default gen_random_uuid()`, `transaction_id uuid not null references transactions(id) on delete cascade`, `from_account uuid not null references accounts(id)`, `to_account uuid not null references accounts(id)`, `amount bigint not null check (amount > 0)`, `check (from_account <> to_account)`.
- **audit_logs** — `id uuid pk default gen_random_uuid()`, `actor_id uuid`, `actor_role text`, `action text not null`, `entity text`, `entity_id text`, `metadata jsonb`, `created_at timestamptz not null default now()`.
- **notifications** — `id uuid pk default gen_random_uuid()`, `user_id uuid not null references profiles(id) on delete cascade`, `type text`, `message text not null`, `read boolean not null default false`, `created_at timestamptz not null default now()`.

Add **indexes** on all foreign keys and lookup columns (`accounts.user_id`, `accounts.account_number`, `ledger_entries.account_id`, `ledger_entries.transaction_id`, `transactions.idempotency_key`, `notifications.user_id`).

### 3.2 Role helper (avoid RLS recursion)

- Create `public.is_admin()` returning boolean, **`SECURITY DEFINER`**, that reads the caller's `role` from `profiles` where `id = auth.uid()`. Because it's `SECURITY DEFINER` it bypasses RLS and avoids recursive policy evaluation. Set a safe `search_path`. Grant execute to `authenticated`.

### 3.3 Signup provisioning trigger

- A trigger on `auth.users` (after insert) that calls a `SECURITY DEFINER` function to create the matching `profiles` row (role `customer`) **and** one default `accounts` row (type `savings`, status `active`, a generated unique `account_number`). This gives every new customer an account so later phases are demoable.

### 3.4 Balance read-model

- Create a view (or SQL function) `public.account_balances` that returns, per account, `balance = coalesce(sum(credit) - sum(debit), 0)` from `ledger_entries`. This is **read-only**; money-writing functions are Phase 3. Ensure it respects access (a customer can only see balances for their own accounts — enforce via the underlying table RLS or a security-barrier view / function).

### 3.5 Append-only audit infrastructure

- A reusable `SECURITY DEFINER` function `public.write_audit(...)` that inserts into `audit_logs`.
- Enforce append-only: **no** UPDATE/DELETE policies on `audit_logs`; grant only what triggers/functions need. Add triggers that audit **account status changes** and **profile role changes** (full money-movement auditing comes with the Phase 3 functions).

## 4. Row-Level Security (enable on EVERY table, deny by default)

Per §7.3, enable RLS on all new tables and add least-privilege policies:

- **profiles** — customer: SELECT/UPDATE own row (`id = auth.uid()`); admin: SELECT all (via `is_admin()`). No client INSERT (trigger/service only).
- **accounts** — customer: SELECT own (`user_id = auth.uid()`); admin: SELECT all. No client INSERT/UPDATE/DELETE (admin tools in P4 and server functions in P3 only).
- **transactions** — customer: SELECT where the transaction has a `ledger_entries` row on an account they own (EXISTS subquery); admin: SELECT all. No client writes.
- **ledger_entries** — customer: SELECT where `account_id` is one of their accounts; admin: SELECT all. No client writes.
- **transfers** — customer: SELECT where `from_account` or `to_account` is theirs; admin: SELECT all. No client writes.
- **audit_logs** — admin: SELECT only. No client INSERT/UPDATE/DELETE.
- **notifications** — customer: SELECT and UPDATE (mark `read`) their own; admin: SELECT all. INSERT via server/trigger only.

Writes to money tables (`transactions`, `ledger_entries`, `transfers`) must be **impossible for clients** in Phase 2 — they will only ever happen through the `SECURITY DEFINER` functions added in Phase 3.

## 5. Seed data (`supabase/seed.sql` and/or a `scripts/seed.ts` using the service role)

- Create **1 admin** user and **2 customer** users with confirmed emails (use the Supabase Admin API `auth.admin.createUser` from a service-role script for auth users; use SQL for public-table data). Set the admin's `profiles.role = 'admin'`.
- Give the two demo customers a **starting balance** by inserting, with the service role, a `deposit` transaction + a matching `credit` ledger entry (this is seed-only; not a user flow).
- Record the seed credentials in the README (dev-only), not hard-coded elsewhere.

## 6. Authentication

### 6.1 Shared client — add session support

- The current `createSupabaseClient` sets `persistSession:false`. Extend it so auth works:
  - Accept options so each app can pass a **storage** adapter and enable `persistSession:true` + `autoRefreshToken:true`.
  - Keep a no-session mode available if needed, but default app usage to persisted sessions.

### 6.2 Mobile (customer) — `apps/mobile`

- Add session persistence using `@react-native-async-storage/async-storage` as the Supabase auth storage (note in README that `expo-secure-store` is the production-hardening option).
- Build auth screens and flows: **Sign up** (email + password + full name), **email verification** handling, **Log in**, **Forgot/Reset password**, **Log out**.
- Gate navigation: unauthenticated users see the auth stack; authenticated users see the app (the existing Home screen). Require a **verified email** before granting access.
- Minimal authenticated landing is enough for this phase: show the signed-in user's name and a Log-out control. **Do not** build balances/accounts/transfer UI (Phase 3).

### 6.3 Admin (staff) — `apps/admin`

- Implement staff login using cookie-based sessions via **`@supabase/ssr`** (`createBrowserClient` / `createServerClient`), with **middleware** that protects all admin routes server-side.
- Enforce **admin-role**: a logged-in user without `role = 'admin'` must be rejected (redirected to login / shown "not authorized"), checked on the server — not only in the browser.
- **No self-signup** in the admin app; admins are provisioned via seed/service role.
- Keep the existing server-only service-role client (`supabase-server.ts`) separate and used only for privileged server operations.
- Minimal authenticated landing is enough: show "Signed in as {admin email}" and a Log-out control. **Do not** build management features (Phase 4).

## 7. Technical standards & security requirements

- **RLS enabled on every table**, deny by default; verify customers cannot read or write other customers' data.
- **Server-authoritative money:** clients cannot write to `transactions`/`ledger_entries`/`transfers` at all in this phase.
- **Money as integer minor units** (centavos), `amount > 0` constraints in place now.
- **Secrets:** only the anon key in clients; service-role key server-only; never `NEXT_PUBLIC_`/`EXPO_PUBLIC_`. Email verification required before login.
- **Passwords** handled entirely by Supabase Auth — never store or hash passwords yourself.
- **`SECURITY DEFINER` functions** must set a fixed `search_path` and grant execute narrowly.
- Migrations additive and ordered; the schema must rebuild cleanly with `supabase db reset`. Do not edit the existing `health_check` migration.
- Continue consuming shared tokens/types from `@davao-bank/shared`; don't duplicate palette or types.

## 8. Completion criteria (all must hold)

1. `supabase db reset` applies all migrations cleanly (tables, constraints, indexes, RLS, functions, triggers) and runs the seed.
2. Signing up a new user auto-creates a `profiles` row **and** one default `accounts` row (trigger verified).
3. Customer auth works end to end on mobile: sign up → email verification → log in → reset password → log out; session persists across app reload.
4. Admin auth works on the web app: an admin can log in and reach the protected landing; a non-admin (a customer account) is rejected server-side; self-signup is not possible.
5. RLS verified: customer A cannot read customer B's profile/accounts/transactions/ledger; no client can write to `transactions`/`ledger_entries`/`transfers`/`audit_logs`; admin can read all.
6. `account_balances` returns correct seeded balances and does not leak other users' balances.
7. Repo-wide `npm run typecheck`, `npm run lint`, and `npm run format:check` pass; `npm run build:admin` and `expo export` succeed.
8. Secret-leak check still clean: service-role key absent from all client bundles.

## 9. Tests & verification (run and report output)

- **Migration:** show `supabase db reset` succeeding; list the created tables and policies.
- **RLS/access tests:** using at least three identities (anon, customer A, customer B, admin), demonstrate: own-data reads succeed, cross-customer reads return nothing, client writes to money/audit tables are **rejected**, admin reads succeed. (pgTAP or a scripted test using per-user JWTs/sessions is fine — include the script.)
- **Trigger test:** create a user and show the profile + default account appear.
- **Auth flows:** demonstrate customer signup/verify/login/reset and admin login + non-admin rejection (describe or screenshot).
- **Balance view:** show seeded balances are correct and scoped per user.
- **Build/quality:** show typecheck, lint, format:check, admin build, and expo export all passing, plus the secret-leak grep.

## 10. What to preserve / avoid changing

- Do not edit the existing `health_check` migration or break the Phase 1 connectivity indicator.
- Do not change the approved palette hex values or the monorepo/shared structure; extend, don't rebuild.
- Keep the `server-only` service-role boundary intact.
- Stay within Phase 2 scope: **no** transfer/deposit/withdrawal functions or UI, **no** balances/history screens, **no** admin management features. Adding Phase 3/4 work will be rejected in review.

## 11. Report back for review

Provide: the new migration files, the role helper / signup trigger / audit function / balance view SQL, the RLS policies, the seed script + dev credentials, the updated shared client, the mobile auth screens + navigation gating, the admin auth (middleware + role enforcement), and the output of every verification step in §9. Note anything you changed from this prompt and why.

_Reminder: the reviewer will run `supabase db reset`, the RLS/auth tests, typecheck/lint/build, and the secret-leak check against the actual code — not just your summary — before approving Phase 2._
