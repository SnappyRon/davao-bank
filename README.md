# Davao Bank — Monorepo (Phase 4: Admin Management System)

> **Simulated mobile banking system rooted in Davao City culture.**  
> Academic capstone prototype built with server-authoritative money principles, least-privilege security, and cultural design tokens.

---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.


## 1. System Architecture

Davao Bank uses an **npm workspaces** monorepo containing two frontends and a shared TypeScript package connected to a Supabase backend:

```text
davao-bank/
├── apps/
│   ├── admin/                # Next.js 16 (App Router) + TypeScript — Staff Operations Portal
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── login/                     # Staff login page (no self-signup)
│   │   │   │   ├── unauthorized/              # Non-admin access rejection page
│   │   │   │   ├── page.tsx                   # Executive Dashboard with authoritative KPIs
│   │   │   │   ├── users/                     # Customer profiles, search, & suspension controls
│   │   │   │   ├── accounts/                  # Deposit accounts, open acc, & balance adjustments
│   │   │   │   ├── transactions/              # Transaction monitoring & atomic reversals
│   │   │   │   ├── audit/                     # Immutable audit trail inspector
│   │   │   │   ├── actions.ts                 # Authenticated Server Actions (cookie session)
│   │   │   │   └── api/export/transactions/   # CSV export route handler
│   │   │   ├── components/
│   │   │   │   └── AdminNav.tsx               # Staff navigation header & active route indicator
│   │   │   ├── lib/
│   │   │   │   ├── supabase-browser.ts        # Client-side browser cookie client
│   │   │   │   ├── supabase-cookies.ts        # Server-side cookie client for App Router
│   │   │   │   └── supabase-server.ts         # Server-only service-role client (import 'server-only')
│   │   │   └── middleware.ts                  # Server-side route protection & admin role enforcement
│   └── mobile/               # Expo SDK 58 React Native + TypeScript — Customer Mobile App
│       └── src/
│           ├── lib/
│           │   └── supabase.ts # Persistent session client with AsyncStorage
│           └── screens/
│               ├── LoginScreen.tsx            # Customer sign in
│               ├── SignUpScreen.tsx           # Customer sign up + auto-provisioning
│               ├── VerifyEmailScreen.tsx      # Email verification barrier
│               ├── ForgotPasswordScreen.tsx   # Password recovery
│               ├── HomeScreen.tsx             # Balances dashboard & transaction feed
│               ├── TransferModal.tsx          # P2P Transfer flow + confirmation + receipt
│               ├── DepositModal.tsx           # Simulated top-up / cash-in flow
│               ├── WithdrawModal.tsx          # Simulated ATM / cash-out with balance check
│               ├── NotificationsModal.tsx     # In-app notifications & mark-read
│               └── TransactionDetailModal.tsx # Digital receipt & ledger inspection
├── packages/
│   └── shared/               # Davao Bank design tokens, types, money & admin RPC helpers
├── scripts/
│   ├── seed.ts               # Service-role seed script for demo users & starting balances
│   ├── test-rls-and-auth.ts  # Multi-identity RLS & security policy test suite
│   ├── test-phase3-money.ts  # Phase 3 Money logic, concurrency, idempotency & reconciliation
│   └── test-phase4-admin.ts  # Phase 4 Admin management, adjustments, reversals & access control
├── supabase/
│   ├── config.toml           # Supabase CLI configuration
│   ├── seed.sql              # SQL seed script (1 admin, 2 customers with initial balances)
│   └── migrations/
│       ├── 20261020125654_init_health_check.sql          # Phase 1 health check scaffold
│       ├── 20261020133025_phase2_schema_and_policies.sql    # Phase 2 schema, RLS, functions & triggers
│       ├── 20261021173518_phase3_core_banking.sql          # Phase 3 guard trigger, money RPCs & read-model
│       └── 20261023051000_phase4_admin_management.sql      # Phase 4 admin functions, adjustments & reversals
├── .env.example              # Documented environment variable template
├── .gitignore                # Git exclusions (secrets, build outputs, node_modules)
├── .nvmrc                    # Pinned Node.js version (v24.12.0)
├── .prettierrc               # Code formatting rules
├── eslint.config.mjs         # Monorepo-wide ESLint 9 configuration
└── package.json              # Monorepo workspaces definition and root scripts
```

---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.


## 2. Cultural Brand Foundation (§5.3)

All colors are centralized in `packages/shared/src/theme/colors.ts` and consumed as TypeScript tokens by both apps (no hardcoded color hexes per screen):

| Token     | Cultural Name            | Hex       | Semantic Role                                   |
| :---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
-- | :---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
-- | :---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
-- | :---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
- |
| `primary` | **Waling-waling Orchid** | `#6A1B7A` | Brand identity, headers, primary action buttons |
| `success` | **Mt. Apo Green**        | `#1C7A4D` | Safe/successful actions, financial growth       |
| `accent`  | **Kadayawan Gold**       | `#D99000` | Account value, balances, celebratory highlights |
| `earth`   | **Cacao Brown**          | `#5A3A22` | Regional heritage, warm supporting backgrounds  |
| `neutral` | **Eagle Slate**          | `#3A4A52` | Typography, neutral chrome, structural UI       |

---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.


## 3. Demo Credentials (Development Only)

> [!WARNING]
> **SECURITY NOTICE: CHANGE SEED PASSWORD BEFORE DEMOS**  
> The default password `Password123!` is strictly for local automated test execution. Configure the `SEED_PASSWORD` environment variable to a strong, unique secret before any public demonstration, staging environment deployment, or user acceptance testing.

All seed accounts are pre-configured with confirmed emails:

| Role           | Email                    | Password       | Details / Starting Balance                              |
| :---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
- | :---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
-- | :---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
- | :---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
 |
| **Admin**      | `admin@davaobank.ph`     | `Password123!` | Staff Operations (`role: 'admin'`)                      |
| **Customer 1** | `customer1@davaobank.ph` | `Password123!` | Juan dela Cruz — **PHP 50,000.00** (5,000,000 centavos) |
| **Customer 2** | `customer2@davaobank.ph` | `Password123!` | Maria Santos — **PHP 25,000.00** (2,500,000 centavos)   |

---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.


## 4. Phase 4 Admin Management System

All administrative operations are implemented as server-side `SECURITY DEFINER` functions strictly gated by `public.is_admin()`, writing append-only audit records, and executed under the admin's authenticated cookie session for full attribution.

### 4.1 Server-Side Admin Functions (`supabase/migrations/20261023051000_phase4_admin_management.sql`)

1. **`public.admin_set_user_status(p_user_id, p_status, p_reason)`**:
   - Suspend or activate a customer profile.
   - Enforces valid status (`active`, `suspended`) and mandatory operational reason.
   - Appends audit record (`admin_user_status_changed`) and notifies customer.

2. **`public.admin_open_account(p_user_id, p_type, p_currency)`**:
   - Provisions an additional deposit account for a customer.
   - Generates a unique 10-digit account number (`10XXXXXXXX`).
   - Appends audit record (`admin_account_opened`) and notifies customer.

3. **`public.admin_set_account_status(p_account_id, p_status, p_reason)`**:
   - Freeze, unfreeze, or close an account.
   - Safety guard: closing an account requires an exact zero balance (`balance = 0`), otherwise blocked with a descriptive error.
   - Appends audit record (`admin_account_status_changed`) and notifies owner.

4. **`public.admin_adjust_balance(p_account_id, p_amount, p_direction, p_reason, p_idempotency_key)`**:
   - Manually credits or debits an account with a mandatory reason.
   - Idempotent: checks for existing transaction key or catches `unique_violation`.
   - Concurrency safety: locks account under `FOR UPDATE`.
   - Negative balance guard: debits that would drive balance negative are strictly blocked.
   - Writes 1 `transactions` row (type `'adjustment'`) and 1 balanced `ledger_entries` row.
   - Appends audit record (`balance_adjustment`) and notifies owner.

5. **`public.admin_reverse_transaction(p_transaction_id, p_reason, p_idempotency_key)`**:
   - Creates an atomic compensating reversal in the double-entry ledger.
   - Idempotent: rejects duplicate reversal attempts.
   - Validates that original transaction is completed and not already reversed.
   - Locks all affected accounts in deterministic sorted UUID order (`SELECT ... FOR UPDATE`).
   - Negative balance pre-check: compensating debits are verified against current balances under lock.
   - Inserts reversal transaction (type `'reversal'`), marks original transaction `status = 'reversed'`, and inserts opposite compensating ledger entries (original credit -> debit, original debit -> credit).
   - Keeps books balanced: compensating entries net to zero.
   - Appends audit record (`transaction_reversed`) and notifies affected owners.

6. **`public.admin_get_users()` & `public.admin_get_dashboard_stats()`**:
   - Secure `SECURITY DEFINER` read-models joining `auth.users` for email confirmation flags and calculating real-time system liquidity from `account_balances`.

### 4.2 Staff Admin Web Portal (`apps/admin`)

- **Dashboard (`/`)**: Executive overview with real-time KPIs (Total Users, Active/Suspended, Deposit Accounts, Total System Balance in PHP, 30-Day Volume, and Recent Activity).
- **Users (`/users`)**: Searchable/filterable customer directory with email verification badge, detail drawer, suspension/activation modal, and open account triggers.
- **Accounts (`/accounts`)**: Comprehensive account directory showing authoritative balances, status tags, open account modal, freeze/unfreeze/close controls, and the Balance Adjustment modal (credit/debit with live balance preview).
- **Transactions (`/transactions`)**: Full ledger monitoring feed with category and status filters, CSV export trigger, detail inspector, and Reversal confirmation modal.
- **Audit Log (`/audit`)**: Append-only system activity log with actor role filters and raw JSON metadata inspector.
- **CSV Export (`/api/export/transactions`)**: Streamed CSV export of all ledger transactions with ISO timestamps and formatted PHP amounts.

---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.


## 5. Running & Testing

### 1. Apply Migrations & Seed Data

```bash
# Apply all migrations through Phase 4:
npx supabase db reset

# Seed demo customers and admin:
npm run seed
```

### 2. Run Quality & Type Checks

```bash
npm run typecheck      # Strict TypeScript check across all workspaces (0 errors)
npm run lint           # ESLint check (0 errors, 0 warnings)
npm run format:check   # Prettier verification
```

### 3. Run RLS Security Test Suite

```bash
npm run test:rls
```

### 4. Run Phase 3 Core Banking Test Suite

```bash
npm run test:money
```

### 5. Run Phase 4 Admin Management Test Suite

```bash
npm run test:admin
```

Verifies:

- Function-level access control: Customer sessions calling any `admin_*` function are rejected with `'Admin privilege required'`
- User profile suspension and activation with mandatory reason enforcement
- Account opening with unique 10-digit number generation
- Account freezing, unfreezing, and the non-zero balance close rejection guard
- Manual balance adjustment (credit/debit), negative balance prevention, and idempotency replay
- Atomic transaction reversal, compensating ledger entries, status transition to `'reversed'`, and double-reversal rejection
- Post-operation system-wide ledger reconciliation: for every account, balance equals ledger sum; all transfers and reversals remain strictly balanced

### 6. Run Test Suites

```bash
# Offline integration suite (PGlite in-memory engine with Supabase stand-ins)
npm run test:db         # 47 behavior checks: money engine, schedules, bills, requests, FX, RLS

# Live database test suites (require reachable Supabase instance)
npm run test:rls        # Identity & RLS security policy tests
npm run test:money      # Phase 3 Money logic, concurrency, idempotency & reconciliation
npm run test:admin      # Phase 4 Admin management, adjustments & reversals
npm run test:extras     # Stage B: Saved recipients, statements, hide balance, biometrics
npm run test:schedules  # Stage C: Scheduled & recurring payments, simulated bill pay
npm run test:qr         # Stage D: QR Send & Request Money
npm run test:fx         # Stage E: FX Reference Rates & Frankfurter Integration
```

---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.


## 6. Scheduled Jobs & Background Automation

Davao Bank relies on three automated background cron jobs:

1. `davao-run-schedules`: Runs hourly (`0 * * * *`) executing due scheduled payments via `run_due_scheduled_payments()`.
2. `davao-expire-requests`: Runs hourly (`15 * * * *`) expiring stale 7-day payment requests via `expire_due_payment_requests()`.
3. `davao-fx-sync`: Runs daily at 04:00 UTC (`0 4 * * *`) syncing ECB reference rates via `pg_net` POST to the `fx-sync` Supabase Edge Function.

### Setting Up pg_cron & Registering Jobs

1. Enable the `pg_cron` and `pg_net` extensions in your Supabase project (Project Settings → Database → Extensions).
2. Deploy the FX Sync Edge Function:
   ```bash
   supabase functions deploy fx-sync
   ```
3. Set the FX sync secret in Supabase Secrets / Vault:
   ```bash
   supabase secrets set FX_SYNC_SECRET=your-secure-shared-secret
   ```
4. Run the idempotent ops function `register_cron_jobs()` from the SQL Editor or via database administrator:
   ```sql
   select public.register_cron_jobs();
   ```
   This safely (re)registers all 3 cron schedules with error isolation and safe unscheduling.

---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.


## 7. FX Reference Rates & External Data Integration (§E.1)

### External Source: Frankfurter (European Central Bank Reference Rates)

- **Official Documentation:** [https://frankfurter.dev](https://frankfurter.dev)
- **Base Endpoint:** `https://api.frankfurter.dev/v1/`
  - Latest rate: `/v1/latest?base=USD&symbols=PHP`
  - Historical time series: `/v1/{startDate}..{endDate}?base=USD&symbols=PHP`
- **Response Format:**
  ```json
  {
    "amount": 1.0,
    "base": "USD",
    "start_date": "2025-10-24",
    "end_date": "2026-10-26",
    "rates": {
      "2026-10-26": { "PHP": 63.944 }
    }
  }
  ```
- **Currency Support:** PHP (Philippine Peso) is fully supported as quote currency for USD, EUR, and JPY.
- **Required Attribution:** _"Source: ECB reference rates via Frankfurter · updated <date>"_ (published by European Central Bank, served via Frankfurter open API).
- **Scheduled Sync:** Implemented via Supabase Edge Function `supabase/functions/fx-sync/index.ts` scheduled daily with `pg_cron` at 04:00 UTC (following ECB 16:00 CET daily fixing). The client apps strictly read from `public.fx_rates` and never contact third-party APIs directly.
- **Single-Currency Principle:** Davao Bank remains strictly single-currency (PHP). No currency exchange, trading, or alerts are offered.

---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.


## 9. Automated Testing & End-to-End (E2E) Suites (Phase 6)

### 9.1 Test Pyramid Overview

| Suite                    | Runner / Tool                               | Scope                                                          | Network / Secret Requirements |
| :---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
-- | :---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
 | :---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
- | :---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
---

## Phase 6 – Security Hardening

The Phase 6 work adds **no new user‑facing features** but hardens the entire system:

- **Database security** – least‑privilege function privileges, tighter RLS policies, and a new migration (`20261104000000_phase6_stage_b_security.sql`).
- **Mobile app** – encrypted session persistence via `LargeSecureStore`, privacy overlay when the app is backgrounded, and updated TypeScript typings.
- **Admin portal** – comprehensive security headers, hardened cookie flags, and an idle‑timeout modal that automatically signs out staff after 15 minutes of inactivity.
- **Automated safety net** – CI workflow runs all test suites, validates security headers, and scans for secrets.

For a deeper dive see the dedicated documentation file **[SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)**.
- |
| **Unit Tests**           | Jest (`npm run test:unit`)                  | Currency math, QR encode/parse, decision logic, UI components  | **Offline / None**            |
| **Database Tests**       | PGlite (`npm run test:db`)                  | Offline Postgres engine, triggers, RLS, single money engine    | **Offline / None**            |
| **Live Database Suites** | tsx (`scripts/test-*.ts`)                   | Live hosted DB RPCs, concurrency, auth & security policies     | Hosted DB credentials         |
| **Mobile E2E**           | Maestro (`e2e/mobile/*.yaml`)               | Expo Go mobile user flows, errors, dismissal & flow guarantees | Simulator / Expo Go           |
| **Admin E2E**            | Playwright (`e2e/admin/*.spec.ts`)          | Staff portal flows, suspensions, adjustments, reversals        | Local dev server              |
| **CI Automation**        | GitHub Actions (`.github/workflows/ci.yml`) | Monorepo lint, format, typecheck, unit, db, builds, gitleaks   | **Zero Secrets Needed**       |

### 9.2 Running Unit & Offline Tests

```bash
# Run all unit tests across shared, mobile, and admin:
npm run test:unit

# Run the 56-check offline database integration suite:
npm run test:db
```

### 9.3 Running Mobile E2E Tests (Maestro)

Mobile end-to-end user flows are automated with [Maestro](https://maestro.mobile.dev) against Expo Go:

```bash
# 1. Install Maestro CLI (macOS):
curl -fsSL "https://get.maestro.mobile.dev" | bash

# 2. Start the mobile app on simulator:
npm run ios:mobile

# 3. Execute Maestro flows:
maestro test e2e/mobile/main-customer-flow.yaml
maestro test e2e/mobile/auth-and-error-flow.yaml
maestro test e2e/mobile/stage-0-9-flow-checks.yaml
```

### 9.4 Running Admin E2E Tests (Playwright)

Admin operational flows are automated with Playwright against the local Next.js server:

```bash
# Run Playwright E2E tests:
npx playwright test

# Or run with interactive UI mode:
npx playwright test --ui
```

### 9.5 Continuous Integration (CI)

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push and pull request. It executes the entire safety net without requiring any secrets:

1. `npm ci`
2. `npm run typecheck`
3. `npm run lint`
4. `npm run format:check`
5. `npm run test:unit`
6. `npm run test:db`
7. `npm run build:admin`
8. `cd apps/mobile && EXPO_NO_TELEMETRY=1 npx expo export --platform ios`
9. `gitleaks` (secret leak prevention)
