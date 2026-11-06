# Davao Bank — Security Review & Threat Model (Phase 6)

> Status: implementation reviewed; Phase 6 is not yet accepted. Device privacy/accessibility evidence, private credential rotation, authenticated E2E checks and hosted auth settings remain open. See PHASE6_REPORT.md and UAT_CHECKLIST.md.

## 1. Executive Summary

This document details the security posture, threat model, control architecture, and regulatory boundaries of **Davao Bank** following the Phase 6 Testing and Security Hardening milestone.

> [!IMPORTANT]
> **REGULATORY NOTICE (RA 8791, SECTION 64)**  
> Under Republic Act No. 8791 (The General Banking Law of 2000), Section 64, no person, association, or corporation not conducting the business of a commercial bank or savings and mortgage bank duly licensed by the Bangko Sentral ng Pilipinas (BSP) shall advertise or hold itself out as being engaged in the banking business, or use the word "bank", "banking", or "banker".  
> **Davao Bank is an academic software prototype and demonstrator. It is NOT a licensed bank, depository institution, or electronic money issuer (EMI). All public builds, repositories, and interfaces must display: "Davao Bank (Demo) — academic prototype, not a licensed bank".**

---

## 2. Threat Model

| Actor / Threat                       | Motive & Attack Vector                                                                                                                                                        | Impact if Unchecked                                                         | Mitigating Controls                                                                                                                                                                                                                                                                                                   |
| :----------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Anonymous / External Attacker**    | Unauthenticated API probes, endpoint fuzzing, SQL injection, RLS bypass, clickjacking.                                                                                        | Database theft, unauthorized data scraping, unauthorized account creations. | Deny-by-default RLS; `anon` execution revoked on all public functions; CSP `frame-ancestors 'none'`; `X-Frame-Options: DENY`; Strict-Transport-Security.                                                                                                                                                              |
| **Malicious Customer**               | Overdrafting, race conditions (concurrent double-spends), tampering with balances, forging ledger/audit entries, escalating role to admin, viewing other customers' balances. | Direct theft, unbalanced ledger, privilege escalation, PII data leak.       | Single Money Engine (`_transfer_core`) with deterministic `FOR UPDATE` row locking; `guard_profile_self_update` trigger; client direct writes strictly revoked on money and audit tables; RLS isolation strictly filtering by `auth.uid()`.                                                                           |
| **Compromised Staff Account**        | Malicious balance adjustments, unauthorized account closures or reversals.                                                                                                    | Ledger corruption, customer financial harm.                                 | Server-side `is_admin()` requirement; mandatory audit justifications for adjustments/reversals; append-only audit trail; 15-minute idle auto sign-out; cookie security (`Secure: true` in prod; `SameSite=Lax`).                                                                                                      |
| **Network Eavesdropper (MITM)**      | Intercepting credentials, session hijacking, replaying financial requests.                                                                                                    | Account takeover, duplicate debits.                                         | HTTPS/TLS enforcement; client-generated idempotency keys (`idempotency_key` database constraint); Supabase JWT rotation; Vault-secured cron webhooks.                                                                                                                                                                 |
| **Local Physical / Shoulder Surfer** | Viewing sensitive account balances in the OS task switcher or left unattended on shared device.                                                                               | Privacy leak, unauthorized financial observation.                           | Mobile app-switcher privacy overlay obscures UI across root view and open modals (`BottomSheet`, `FXRatesModal`) and the in-window `PasswordPromptOverlay`; Android `FLAG_SECURE` (`ScreenCapture.preventScreenCaptureAsync`); admin 15-minute idle sign-out modal; biometric/password confirmation on money actions. |

---

## 3. Defense-in-Depth Control Architecture

### 3.1 Database & Ledger Security (PostgreSQL / Supabase)

1. **Deny-by-Default Row Level Security (RLS):**
   - Enabled across all 12 public tables: `profiles`, `accounts`, `transactions`, `ledger_entries`, `audit_logs`, `saved_recipients`, `billers`, `bill_payments`, `scheduled_payments`, `payment_requests`, `fx_rates`, and `health_check`.
   - Only `health_check` is readable by `anon`.
   - `billers` was never readable by `anon` (restricted to `authenticated` users and allows administrators to view/manage inactive billers via `is_active = true or public.is_admin()`).
   - `fx_rates` is strictly restricted to `authenticated` users.
2. **Principle of Least Privilege (Function Grants):**
   - `alter default privileges in schema public revoke execute on functions from public, anon;`
   - All `public` and `anon` execution privileges revoked across all functions.
   - Client functions explicitly granted to `authenticated` only.
   - Internal functions (`_transfer_core`, `write_audit`, `run_due_scheduled_payments`, `upsert_fx_rates`, `guard_profile_self_update`, `register_cron_jobs`) are completely revoked from all client roles.
3. **Single Money Engine (`_transfer_core`):**
   - Centralized server-authoritative balance changes.
   - Row-level locking ordered by account UUID (`least(from, to)`, `greatest(from, to)`) to eliminate database deadlocks during concurrent bidirectional transfers.
   - Double-entry ledger architecture (`ledger_entries` sum of debits strictly equals sum of credits for every transfer, reversal, and bill payment).
4. **Idempotency & Replay Protection:**
   - Unique constraints on `(idempotency_key)` prevent duplicate processing of replayed network requests.
   - Stored procedures detect identical idempotency keys and safely return the original transaction envelope without moving funds twice.
5. **Role Escalation Immunity:**
   - `guard_profile_self_update()` trigger runs as `SECURITY INVOKER`, verifying that only trusted system roles (`postgres`, `service_role`, `supabase_admin`) or active administrators can alter a profile's `role` or `status`.
6. **Supabase Vault Integration:**
   - Scheduled background jobs (e.g., `davao-daily-fx-sync`) read API secrets dynamically from `vault.decrypted_secrets` at run time. No service keys or secrets appear in `cron.job.command` or database audit tables.

### 3.2 Mobile Security (React Native / Expo)

1. **`LargeSecureStore` Session Encryption & Key Rotation:**
   - Resolves the 2,048-byte iOS Keychain / Android KeyStore size limit.
   - Generates a fresh random 256-bit AES key on every `setItem`, storing it in `expo-secure-store` and replacing the previous key to eliminate keystream reuse.
   - The Supabase session JSON is encrypted via AES-256-CTR and persisted in `AsyncStorage`.
   - Protects access and refresh tokens from unencrypted backup extraction while providing transparent migration for legacy unencrypted JSON.
2. **App-Switcher Privacy Screen & Modal Protection:**
   - Uses `useAppBackgrounded()` hook to detect when the app transitions to `inactive` or `background`.
   - Renders a branded `Secured Banking Session` overlay in the root view and within separate React Native `<Modal>` instances (`BottomSheet`, `FXRatesModal`) and the in-window `PasswordPromptOverlay`, with the password overlay hosted inside the active sheet instead of a second root native modal. Device privacy acceptance remains pending.
   - On Android, invokes `ScreenCapture.preventScreenCaptureAsync()` from `expo-screen-capture` to activate `FLAG_SECURE`, preventing screenshots and hiding thumbnail previews in the app switcher.
3. **Sensitive Action Authorization:**
   - Money transfers, bill payments, and cash-outs require biometric verification (Face ID / Touch ID) or fallback password validation prior to execution via pure decision helper `decideConfirmation`.
4. **User-Friendly Error Sanitizing:**
   - `toUserMessage` maps known backend, Postgres, and Supabase auth errors to safe, user-friendly copy and uses a generic message for all unexpected errors without exposing internal SQL, table schemas, or stack traces.

### 3.3 Admin Portal Security (Next.js 16)

1. **HTTP Security Headers:**
   - `Content-Security-Policy`: Restricts resource loading to `'self'` and official Supabase endpoints; specifies `frame-ancestors 'none'`. Production builds omit `'unsafe-eval'`. Note: `'unsafe-inline'` is currently retained as required by Next.js client script hydration and style injection. Note that CI does not check security headers; they are enforced at runtime via Next.js response headers.
   - `X-Frame-Options: DENY`: Blocks framing and clickjacking attacks.
   - `X-Content-Type-Options: nosniff`: Prevents MIME-sniffing exploits.
   - `Strict-Transport-Security: max-age=31536000; includeSubDomains`: Enforces HTTPS.
   - `Referrer-Policy: strict-origin-when-cross-origin`: Minimizes referrer leakage.
   - `Permissions-Policy: camera=(), microphone=(), geolocation=()`: Disables unneeded browser APIs.
2. **Cookie Security:**
   - Supabase SSR authentication cookies are configured with `SameSite: 'lax'` and `Secure: true` in production environments. Forced `HttpOnly: true` is not used so that `@supabase/ssr`'s `createBrowserClient` can properly read and write the session for client-side sign-out and idle session termination.
3. **Session Inactivity Management:**
   - Automated 15-minute idle sign-out with user activity listeners (`mousemove`, `keydown`, `click`, `scroll`).
   - A 1-minute warning modal alerts staff before signing out and invalidating the session.

---

## 4. Phase 6 Vulnerabilities Discovered & Remediated

1. **Database Linter Warnings:**
   - Stored procedures `admin_open_account` and `pay_payment_request` held unused variable declarations (`v_profile`, `v_existing_tx`), triggering static analysis warnings. Both were cleanly refactored.
2. **Public Function Exposure:**
   - Client functions in schema `public` were implicitly callable by `anon`. Migration `20261104000000_phase6_stage_b_security.sql` revoked execution from `public` and `anon` and closed future default privileges.
3. **Unauthenticated Reference Rate Access:**
   - `fx_rates` previously allowed unauthenticated access; it was restricted to `authenticated` users only. Note: `billers` was never readable by `anon`.
4. **Hardcoded Seed Password Removal & Rotation:**
   - Default credential string in `scripts/seed.ts` and test suites was removed. Credentials must be supplied via `SEED_PASSWORD` in `.env`.
5. **Dependency Vulnerabilities:**
   - `npm audit` flagged high-severity advisories (`node-forge` and `zod`). Resolved to 0 high and 0 critical vulnerabilities.

---

## 5. Hosted Project Settings Checklist

Because local `supabase/config.toml` changes apply only to local Supabase instances, the repository owner must verify and configure the following settings directly within the hosted Supabase Dashboard (Authentication > Security / Settings):

- [ ] **Minimum Password Length:** Set to at least 10 characters, requiring letters and digits.
- [ ] **Leaked-Password Protection:** Not available. Supabase returns "Configuring leaked password protection via HaveIBeenPwned.org is available on Pro Plans and up" for this Free-plan project (checked 2026-11-05). Accepted as a known limitation for the capstone; enable it if the project moves to the Pro plan.
- [ ] **Auth Rate Limits:** Enable built-in rate limits for email signup, password reset, and token verification requests.
- [ ] **Email Confirmation:** Enforce email confirmation for all new accounts (`Confirm email` set to ON).

---

## 6. Remaining Risks & Operational Recommendations

1. **Historical Seed Password in Git History:**
   - The initial seed password was previously committed to git history. Although removed from all working tree files, repo history contains the old commit.
   - **Mitigation:** The owner must configure a private `SEED_PASSWORD` in `.env` and run `npm run seed` to rotate all live user credentials on the hosted Supabase project.
2. **Content Security Policy (CSP) Allowances:**
   - Next.js requires `'unsafe-inline'` for inline scripts and styles during client hydration.
   - Local development permits `connect-src` to `http://127.0.0.1:54321` and `ws://127.0.0.1:54321`, and `'unsafe-eval'` for hot module replacement. Production headers strictly omit `'unsafe-eval'` and localhost URLs.
3. **Client Device Jailbreak / Root:**
   - Jailbroken or rooted devices allow attackers to inspect application memory and intercept biometric validation callbacks. Production banking apps require jailbreak detection and certificate pinning.
4. **Denial-of-Service on Money RPCs:**
   - Rapid repeated calls to transfer functions are throttled by database row locks, but distributed client floods could cause transaction queueing. Upstream API rate limiting (e.g., Cloudflare / Supabase API Gateway) is recommended.
5. **External Rate Service Availability:**
   - FX reference rate synchronization relies on the external Frankfurter API. If the provider experiences downtime, the system falls back to the most recently cached rate in `fx_rates`.

---

## 7. Prototype vs. Production Capabilities

| Domain                    | Davao Bank (Academic Prototype)                    | Production Commercial Bank                                                                       |
| :------------------------ | :------------------------------------------------- | :----------------------------------------------------------------------------------------------- |
| **Banking License**       | None. Academic prototype for demonstration only.   | Full Universal/Commercial Bank License issued by Bangko Sentral ng Pilipinas (BSP).              |
| **Identity Verification** | Email and password simulation with self-heal.      | Comprehensive e-KYC: government ID verification, biometric liveness check, AML/CFT screening.    |
| **Payment Rails**         | Internal simulated ledger (`ledger_entries`).      | Integration with national clearing switches (InstaPay, PESONet, PhilPaSSplus, BancNet).          |
| **Card Issuance**         | Not supported.                                     | EMV chip card issuance, tokenization (Apple Pay / Google Wallet), PCI-DSS Level 1 certified HSM. |
| **Fraud Monitoring**      | Rule-based velocity checks (e.g. 10 requests/day). | 24/7 AI-driven behavioral fraud monitoring, device fingerprinting, transaction risk scoring.     |
| **Disaster Recovery**     | Single-region Supabase cloud database.             | Multi-region active-active disaster recovery with < 15 minute RPO and RTO.                       |
