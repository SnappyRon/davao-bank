# ROADMAP — Davao Bank (captain-owned)

> The single plan for what is built, in what order, and by whom. `STATUS.md` tracks day-to-day progress; this file tracks phases, dependencies and agent assignments. Updated by the captain only.
>
> **State: plan approved by the owner (D11–D15, 2026-11-25). D16 open (Phase 9.5).** Phase 8D–8F started 2026-11-25; `GEMINI_API_KEY` is set as a hosted Supabase secret (owner, verified by name only); Phase 9.5 waits for Phase 9 and D16.

## 1. Where we are (verified against git, 2026-11-25)

| Phase                                | Scope                                                                                                                  | State                                                                                      | Evidence                             |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------ |
| 1–6.5                                | Setup, DB/auth, core banking, admin, redesign, hardening, TOTP step-up, app lock                                       | Done                                                                                       | `STATUS.md` Stages table             |
| 7A                                   | Foundations (type, tokens, shared components)                                                                          | Done                                                                                       | `6441fc0`, `b6d09e4`, `93cb757`      |
| 7B.0–7B.6, 7B.9, 7B.12               | Navigation, Home, lists, Profile, money-flow sequence, ResultView, responsive/a11y, notification wording, admin polish | Done (reviews deferred to the end by owner)                                                | head `af8b3aa`                       |
| 7B.7 Wording                         | —                                                                                                                      | In progress, `fe-wording` (main checkout, uncommitted)                                     | `git status`                         |
| 7B.8 Copy audit script               | —                                                                                                                      | Agent reports done; not yet committed on `phase-7-copy-check`                              | branch at `af8b3aa`                  |
| 7B.10 Device carry-overs             | —                                                                                                                      | In progress, `fe-device-fixes`                                                             | branch at `af8b3aa`                  |
| 7B.11 System status                  | —                                                                                                                      | In progress, `fe-system-status`                                                            | branch at `af8b3aa`                  |
| 7C Motion/mascots                    | —                                                                                                                      | In progress, `fe-motion`                                                                   | branch at `af8b3aa`                  |
| 7B gate                              | Screenshots, Maestro, live suites                                                                                      | Not started (blocked: customer1 authenticator)                                             | —                                    |
| 8A Bantay security center (backend)  | Daily limit, payee lookup                                                                                              | Committed, not merged                                                                      | `1eb4d13` (`phase-8-bantay-backend`) |
| 8B Bills + monthly summary (backend) | Saved billers, reminders, summary                                                                                      | Committed, not merged                                                                      | `781b6a0` (`phase-8-bills-backend`)  |
| 8C Phase 8 screens (frontend)        | Bantay screen (limits), payee on Review, saved billers, summary                                                        | Committed, not merged                                                                      | `394ac09` (`phase-8-frontend`)       |
| 8 push notifications (D8)            | Real push                                                                                                              | Not possible in Expo Go (D13) — in-app alerts (Inbox + Realtime) instead; owner to confirm | —                                    |
| 9 Savings goals (D4)                 | Separate goal accounts + interest projection                                                                           | Not started                                                                                | —                                    |
| 10 Release                           | Builds, distribution, docs                                                                                             | Not started                                                                                | —                                    |

## 2. What changes in this revision

1. **Bantay AI joins Phase 8** as stages **8D–8H**. It extends 8A/8C (same Bantay screen, same `security_limits` table, same guard pattern in `_transfer_core`). It does not redo them. Spec: `Phase-8-Bantay-AI-Prompt.md`.
2. **Crypto wallet becomes Phase 9.5**, a demo-only stretch after Phase 9, behind a build flag, on Solana devnet. It is skipped if Phase 9 is late. Spec: `Phase-9.5-Crypto-Demo-Prompt.md`.
3. **Phase 10 distribution: Expo Go** (owner decision D13, 2026-11-25). No store, no TestFlight, no paid Apple account. Phase 10 = a reliable Expo Go demo setup (Metro on the laptop, LAN or tunnel), seeded demo accounts and docs.
4. **Consolidations** (so nothing conflicts with work already committed):
   - The 8A daily limit stays as built. 8D only adds "raising the limit takes effect after 12 h" (lowering stays immediate).
   - The 8C Bantay screen is extended (timeline, lock, alerts), not replaced.
   - High-risk transfers use **challenge → confirm**: no money is reserved, so the ledger and money states are unchanged. This replaces the earlier "pending hold" idea.
   - Disputed funds: staff use the existing `admin_set_account_status` freeze, linked to a case. There is no new partial-hold money logic. This replaces the earlier "temporary hold" idea.
   - "Move funds to a locked savings goal" is **removed**.
   - Real push (D8) is not available in Expo Go. Bantay alerts use the Inbox + Supabase Realtime (in-app toast) only.

## 3. Owner decisions needed before work starts

| #   | Decision                                                                                                                                                                                           | Captain recommendation                                                                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D11 | Approve the Bantay AI and crypto recommendation (this file + the two prompts)                                                                                                                      | **Approved 2026-11-25**                                                                                                                                                                                   |
| D12 | Allow one more guard line in `_transfer_core` (risk check, next to the 8A daily-limit guard) and a lock guard in `withdraw` and `create_scheduled_payment` / `create_scheduled_transfer_to_number` | **Approved 2026-11-25**                                                                                                                                                                                   |
| D13 | Distribution: TestFlight / internal builds vs Expo Go                                                                                                                                              | **Decided 2026-11-25: Expo Go** — no push (D8), no Face ID on iOS in Expo Go (falls back to passcode/password), demo needs Metro running                                                                  |
| D14 | Owner creates a Gemini API key in Google AI Studio and stores it as a Supabase secret (`GEMINI_API_KEY`). Free tier, masked data only                                                              | **Done 2026-11-25** (secret name verified with `supabase secrets list`; value never read)                                                                                                                 |
| D15 | Hosted auth config: `jwt_expiry` 3600 → 900 s, so a revoked session dies within 15 min                                                                                                             | **Done 2026-11-25** (owner set 900 s in the dashboard; hosted value NOT VERIFIED by the captain). Follow-up: `supabase/config.toml` `jwt_expiry = 900`, given to `be-bantay-security` after its 8D commit |
| D16 | Phase 9.5 only: new Edge Function dependency `@solana/web3.js` (exact pin, imported with `npm:` in the Deno function; not in the mobile app) + a devnet keypair in Supabase Vault                  | Decide at the start of 9.5, not now                                                                                                                                                                       |

## 4. Implementation order and dependencies

```
Phase 7 remainder (7B.7, 7B.8, 7B.10, 7B.11, 7C) ──► merge into phase-7-ui-motion ──► 7B gate
                                                                                  │
8A + 8B + 8C ──► merge onto phase-7-ui-motion head (branch phase-8) ──────────────┤
                                                                                  ▼
8D contract (captain freezes, in the prompt) ──► 8D backend ─┬─► 8E edge functions ─┐
                                              └─► 8F mobile UI ─┐    (parallel, against the contract)
                                              └─► 8G admin cases ─┤
                                                                  ▼
                                               8H tests + CI + live suite ──► Phase 8 gate
                                                                                  ▼
                                               Phase 9 savings goals ──► Phase 9.5 crypto demo (stretch) ──► Phase 10
```

Rules:

- No Phase 8D–8H code starts until D11 and D12 are approved. 8E's Gemini call also needs D14 (template fallback can be built first).
- Phase 7 agents are **not interrupted**. 8D–8H run in the Phase 8 worktrees, which no Phase 7 agent writes to.
- 8D migration filename: `20261127000000_phase8_bantay_risk.sql` (after 8A/8B). 8E has no migration.
- 8F/8G build against the frozen 8D contract and mock the RPCs in tests (same pattern as 8C).
- Hosted migrations are applied by the owner after the Security review at the Phase 8 gate.

## 5. Agent assignments

All agents report progress, findings and blockers to the captain only (Herdr tab 1). Implementers write handoff notes to `docs/agents/notes/<branch>.md`. Only the captain edits `STATUS.md` and this file while parallel branches are open.

| Stage   | Task                                                                                                                                         | Agent (Herdr)                                                                                                                                                                                                                                                 | Branch / worktree                               | Starts after                 |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------- |
| 8-merge | Merge 8A, 8B, 8C onto the Phase 7 head; resolve conflicts in `TransferReviewStep`, `PayBills*`, `HomeScreen`, `ProfileScreen`, `App.tsx`     | `fe-general-codex` (Codex)                                                                                                                                                                                                                                    | new `phase-8` / main checkout                   | Phase 7 merges               |
| 8D      | Risk engine, events, devices, lock, limit delay (DB + RPC)                                                                                   | `be-bantay-security`                                                                                                                                                                                                                                          | `phase-8-bantay-risk` / `davao-bank-bantay`     | D11, D12                     |
| 8E      | Edge Functions `bantay-explain` (Gemini + template) and sign-in signal; shared masking/templates                                             | `be-bills-summary`                                                                                                                                                                                                                                            | `phase-8-bantay-edge` / `davao-bank-bills`      | D11 (Gemini call: D14)       |
| 8F      | Mobile: security timeline, risk challenge on Transfer/Pay bills, Lock my account, "It was me / Not me", device registration, Realtime alerts | `fe-phase8-screens`                                                                                                                                                                                                                                           | `phase-8-bantay-ui` / `davao-bank-p8-ui`        | D11                          |
| 8G      | Admin: security cases queue, case detail, freeze linked to case                                                                              | `fe-general-codex` (Codex)                                                                                                                                                                                                                                    | `phase-8-admin-cases` (own worktree)            | 8-merge done                 |
| 8H      | Live suite `test:bantay`, CI wiring, Maestro flow for lock + challenge                                                                       | `tool-copy-check` (rename to `tool-ci`)                                                                                                                                                                                                                       | `phase-8-bantay-tests` / `davao-bank-copycheck` | 7B.8 committed; 8D committed |
| Gate    | Security review (8D, 8E, 8G); UI/UX review (8F, 8G); Code Quality (all); CI/CD (8H)                                                          | Reviewer tabs started at the gate (owner deferred reviews to the end): Security → `codex exec -s read-only` or Antigravity plan mode; UI/UX → Codex read-only; Code Quality → `claude --agent code-quality-reviewer`; CI/CD → `claude --agent ci-cd-engineer` | read-only                                       | all 8D–8H committed          |
| 9.5     | See `Phase-9.5-Crypto-Demo-Prompt.md` §Assignments                                                                                           | same backend/frontend/tool agents                                                                                                                                                                                                                             | new worktrees                                   | Phase 9 done + D16           |

**Exception to "reviews at the end":** the 8D migration changes `_transfer_core`. Before the owner applies it to hosted, a Security review is mandatory (AGENTS.md money-engine rule). This does not block other agents.

## 6. Phase 8 gate (all must pass)

- Root checks: typecheck exit 0, lint 0 errors, format:check clean, `test:unit` all pass, `test:db` all pass (existing 166 + new Bantay risk checks).
- `_transfer_core` diff vs `20261126000000_phase8_bantay.sql` = exactly the added guard line(s); `withdraw` and schedule-creation diffs = only the lock guard.
- Security review: no Blocker/High open.
- Hosted (after the owner applies migrations): `test:rls`, `test:money`, `test:schedules`, `test:qr`, `test:bantay` pass. Needs customer1's real authenticator removed or dedicated test accounts.
- Device (owner + captain, iOS simulator): lock → transfer blocked → unlock after wait; high-risk transfer → challenge → confirm; Bantay explanation appears (AI or template). Screenshots in the report.
- With `GEMINI_API_KEY` unset, every Bantay screen still works (template text).

## 7. Postponed / removed

| Item                                     | Decision               | Why                                                                                        |
| ---------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------ |
| Move funds to a locked savings goal      | Removed                | Redundant with the lock; moves money mid-incident; same pattern as the "safe account" scam |
| Trained ML fraud model                   | Removed                | No labelled data, unexplainable; rules + per-user baseline instead                         |
| Supabase password/MFA verification hooks | Not used               | Teams/Enterprise only                                                                      |
| Push alerts                              | Dropped (D13: Expo Go) | Expo Go cannot receive remote push; in-app alerts cover the demo                           |
| Real (mainnet) DVO token, public crypto  | Never                  | Securities / VASP licensing; store policies                                                |
| Partial fund holds                       | Not built              | Existing freeze covers the demo; avoids new balance math                                   |

## 8. Backup Development Agents (category, 2026-11-25)

A separate category of coding agents (Cline and OpenCode, free models) that take over pending work when primary agents (Codex, Antigravity, Claude implementers) are down or out of usage. They write code, implement pending features, fix bugs and finish unfinished tasks in their department only. Same rules as everyone: `AGENTS.md`, the phase prompts, `WORKFLOW.md`, one writer per folder, notes in `docs/agents/notes/<branch>.md`, report to the captain only. Herdr tabs are labelled `backup·<name>`. Start commands: `cline` (shared `~/.cline` sign-in); `XDG_STATE_HOME=~/.opencode-state opencode` (`~/.local/state` is root-owned).

**Frontend department**

| Agent (tab)       | Role                     | Current queue                                                                                 |
| ----------------- | ------------------------ | --------------------------------------------------------------------------------------------- |
| `fe-cline` (15)   | Motion and system status | 7C done `fee30e6` → 7B.11 (`davao-bank-status`, from `fe-system-status`)                      |
| `fe-cline-2` (17) | Device fixes and copy    | 7B.10 done `5e2aaf6` → 7B.7 + the 12 check-copy violations (main checkout, from `fe-wording`) |
| `fe-cline-3` (20) | Phase 8 mobile features  | 8F (`davao-bank-p8-ui`, from `fe-phase8-screens`)                                             |

**Backend department**

| Agent (tab)          | Role                           | Current queue                                                                          |
| -------------------- | ------------------------------ | -------------------------------------------------------------------------------------- |
| `be-opencode` (16)   | Database and security          | 7B.8 `343fc54`, 8D `182505a` done → 7B.8 review fix; owns 8D fixes                     |
| `be-opencode-2` (18) | Integration and edge functions | 8E done `316f718` → second read-only reviewer (code quality) while its queue is empty  |
| `be-opencode-3` (21) | QA tooling and tests           | 8H done `2174d5f` → 8G admin cases (`davao-bank-admin-cases`, from `fe-general-codex`) |

**Design department**

| Agent (tab)        | Role           | Current queue                                                                                                     |
| ------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------- |
| `ux-designer` (22) | UI/UX designer | Bantay screens and admin cases spec, then 8F audit against it (`davao-bank-design`, branch `phase-8-design-spec`) |

**Review**

| Agent (tab)          | Role                                                                                                                                                                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `qa-reviewer` (19)   | Read-only (OpenCode Plan mode). Reviews each backup commit the captain sends; the captain verifies findings, routes accepted ones back as fix tasks, and re-reviews.                                                                               |
| `ux-reviewer` (23)   | Read-only UI/UX reviewer (OpenCode Plan mode, `roles/ui-ux-reviewer.md`). Reviews mobile, admin and design commits for spec, copy, states, accessibility and motion.                                                                               |
| `ci-reviewer` (24)   | CI/CD Engineer backup (OpenCode Plan, `roles/ci-cd-engineer.md`). Build validation, tests, dependency/config checks and merge readiness of every branch before integration.                                                                        |
| `ai-specialist` (25) | AI Integration Specialist (OpenCode Plan, `roles/ai-integration-specialist.md`). Bantay AI model calls, prompts, output validation, fallbacks, privacy, rate limits and cost; works with the backend implementer and Security through the captain. |

**Coordination**

| Agent (tab)        | Role                                                                                                                                                                                                                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `coordinator` (26) | Integration Coordinator (OpenCode, `roles/integration-coordinator.md`). Keeps `docs/agents/OWNERSHIP.md` (tasks, folders, file ownership, shared-file order, merge order, decisions); checks every brief for overlap before it goes out; predicts merge conflicts. Writes only that file; the captain commits it. |

**Added 2026-11-26:** `fe-opencode` (OpenCode, Big Pickle) — frontend builder for the admin console; first task 8.5B operations dashboard screens (`davao-bank-ops-ui`, branch `phase-8.5-ops-ui`).

**Who does what:** implementers (Cline and OpenCode build agents, primary Codex/Antigravity) write code; `ux-designer` writes specs; `qa-reviewer`, `ux-reviewer`, `ci-reviewer`, `ai-specialist` and `be-opencode-2` (while its queue is empty) review read-only; `coordinator` and the captain coordinate integration. All report to the captain.

Merge note: `343fc54` (7B.8) adds `check:copy` to CI and fails until 7B.7 clears its 12 listed violations, so 7B.8 merges after 7B.7.

**Hand-back rule (owner, 2026-11-25):** substitutes only cover while the original agents have no usage. When the captain sees an original agent has usage again, the substitute finishes and commits its current task and stops; the original agent resumes the remaining tasks of its own queue from the substitute's commit.

## 9. Product expansion (owner request, 2026-11-26)

Three new tracks. Nothing here restarts or interrupts a running stage. Code for each track starts only after the branches it depends on are merged, so no two agents edit the same screen at once. Specs and design can start now.

### Order and dependencies

| Track                                       | What                                                                                                                                                                                                                                                                                                                                                                             | Depends on                                                                                               | Can start now                                             | Needs owner approval                                                                                                                 |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **7D — Accounts and Activity** (priority 1) | Balance card opens a **My accounts** stack page (all accounts: type, •• 1234, balance, status, combined total, "Show on Home", account detail with recent transactions). Activity: search bar + compact account selector + **Filters** button opening a `Sheet` (type, date range, in/out, status, Clear/Apply, active-filter count). Transaction row spacing and large amounts. | Phase 7 merge: 7B.7, 7B.10, 7B.11 and 7C all change `HomeScreen`, the balance card and `ActivityScreen`  | Design spec (`ux-designer`)                               | None if it stays client-side (accounts + existing `get_account_transactions`; Home choice saved on the device). Captain confirms     |
| **8.5 — Operations dashboard** (priority 2) | Admin charts (volume over time, in vs out, by category, status mix, balance distribution, customer/account growth) with date filters; live feed via Supabase Realtime; live metrics; security panel (Bantay cases, locked/frozen, failed sign-ins, failed schedules). Real backend events only.                                                                                  | Phase 8 merge: 8D tables (`security_events`, `security_cases`), 8G changes `apps/admin/src/app/page.tsx` | Design spec (`ux-designer`), backend spec (`be-opencode`) | **A2** chart library (new dependency). **A3** migration: staff-only analytics functions + Realtime publication + admin read policies |
| **9 — More services** (priority 3)          | A **More services** hub (from Home and Profile, not a new tab). Candidates: FX converter on the existing FX rates (simulated conversion), savings goals (already Phase 9), service requests, branch appointments, simulated credit card, simulated investments, installment calculator. Each marked "Simulation".                                                                | Phase 8 gate; FX expansion reuses `fx_rates` and the FX screens                                          | Feasibility spec (`be-opencode-3`)                        | **A4** per service, after the spec (most need new tables; card/investments/installments need money-engine rules)                     |

Phase 9.5 (crypto, stretch) and Phase 10 (Expo Go release) move after track 9. Push stays unavailable (D13); live admin updates use Realtime.

### Owner decisions

All approved by the owner on 2026-11-26 ("Approve all that needs my approval"). Also approved the same day: **NX** — upgrade Next.js 16.4.2 → 16.4.6 (security fix, exact pin, CI checks); **Bantay go-live** — apply the four Phase 8 migrations (`20261126000000`, `20261126010000`, `20261127000000`, `20261127010001`) and deploy `bantay-explain` once Security accepts the merged migrations, `test:db` passes on the merged branch and a hosted schema backup is taken; **D16** — in principle, for Phase 9.5 only (exact pin, key in Vault, devnet only).

**Bantay go-live done 2026-11-26 02:3x AEDT (captain):** Security rated all four migrations SAFE TO APPLY (findings non-blocking); `test:db` 277/277 on `phase-8-integration`; logical backup taken first (function definitions, all 16 tables' data, columns, policies — outside the repo; Docker is not installed, so `db dump` was not possible). `supabase db push` applied exactly `20261126000000`, `20261126010000`, `20261127000000`, `20261127010001`. Verified read-only: 27 tables all with RLS, 8 new tables, 3 cron jobs unchanged, 193 transactions before and after, MFA trigger installed. `bantay-explain` deployed (v1, rejects unauthenticated calls with 401; `GEMINI_API_KEY` present). **Not deployed:** `signin-signal` until Security finding #2 (trusts `x-forwarded-for`, admin lookup before rate gate) is fixed. Open Lows: direct admin select without aal2 on `security_events`/`security_cases`; `create table` without `if not exists` (one-shot apply accepted).

**Interactive Bantay + Bantay AI chat approved 2026-11-26 (owner):** floating Kada (idle motion off under Reduce Motion, speech bubbles from real events only, tap/long-press) on Home and the Bantay screen; and a Bantay AI chat (server-side Gemini, the user's own masked data only, read-only — suggests in-app screens but never moves money or changes settings, output validation, per-user limits and kill switch). Design (ux-designer, ai-specialist) → AI + Security review → build.

**Cards approved 2026-11-26 (owner):** a simulated digital debit card (fake never-valid numbers, reveal behind password + code, freeze, limits, demo merchant payments only through the existing transfer engine) merged with the simulated credit card into one Cards feature (design → Security review → build). Real Apple Pay is not possible (needs a licensed issuer, card-network tokenization, Apple's provisioning entitlement and a native build; D13 is Expo Go). Owner chose a plain-text 'Add to Apple Wallet' button in Davao Bank styling (no Apple logo/badge artwork) that opens a disclaimer: it works only once Davao Bank is a licensed issuer approved by Apple; no fake success state.

**8.5A dashboard backend applied 2026-11-26 ~04:1x AEDT (captain):** Security first rated it FIX FIRST (High: analytics RPCs lacked aal2); fixed in `f442269`, re-review SAFE TO APPLY. Logical backup first (79 functions, 27 tables). Pushed exactly `20261128000000` from a scratch copy containing the reviewed `f442269` file. Verified read-only: last migration `20261128000000`, 0 tables without RLS, 3 cron jobs, 193 transactions unchanged, all four `admin_ops_*` functions contain `assert_admin_aal2`, Realtime publishes only `staff_activity_events`.

**Phase 9 services backend applied 2026-11-26 (captain):** Security rated all three SAFE TO APPLY after fix rounds (service requests `0769be2`, appointments `f379634`, savings goals `b7fa455`). Read-only backup first (functions, policies, migration list, counts). Pushed exactly `20261129000000`, `20261129100000`, `20261129200000` from a scratch copy using the fixed files (the savings branch carries older copies of the first two; integration must keep the fixed versions). Verified read-only: last migration `20261129200000`, new tables `service_requests`, `appointments`, `branches`, `appointment_slots`, `savings_goals`, 0 tables without RLS, 3 cron jobs, 195 transactions unchanged.

| #   | Decision                                                                                                                                                                                                   | Captain recommendation                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Approve the order above (7D → 8.5 → 9)                                                                                                                                                                     | **Approved 2026-11-26**                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| A2  | Add a chart library to the admin app                                                                                                                                                                       | **Approved 2026-11-26**: Recharts, exact pin, admin app only, after the CI/CD reviewer confirms React 19 / Next 16 compatibility                                                                                                                                                                                                                                                                                                                                                             |
| A3  | One migration for 8.5: read-only staff analytics functions (`security definer`, staff check, aggregates only, no customer PII), Realtime on `transactions`, `security_events`, `audit_logs` for staff only | **Approved 2026-11-26, conditional**: applied only after Security accepts the migration and `test:db` passes; the captain applies it to hosted with a schema backup first                                                                                                                                                                                                                                                                                                                    |
| A4  | Which "More services" to build                                                                                                                                                                             | **Approved 2026-11-26**: all services in the spec's build order (hub, FX converter, service requests, branch appointments, savings goals + time deposit planner, installment calculator, then credit card and investments). Sub-decisions: fictional demo branch names; card payment through a seeded demo biller; any money-bearing slice moves money only through the existing transfer engine (no `_transfer_core` change) and needs its own backend design + Security review before code |
