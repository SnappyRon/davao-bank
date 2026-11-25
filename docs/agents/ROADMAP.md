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

## 8. Substitute agents (2026-11-25)

All Antigravity agents hit the weekly Gemini quota and Codex hit its limit (resets 2026-11-26 00:12). Two substitutes take over the pending work, resume from each stopped agent's uncommitted changes (kept, not redone) and report to the captain. The stopped agents must not be restarted on these tasks.

| Substitute             | Tool                                                                                                                   | Queue (in order)                                                                                                                                                                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fe-cline` (tab 15)    | Cline CLI                                                                                                              | 1. 7C (`davao-bank-frontend`, from `fe-motion`) · 2. 7B.10 (`davao-bank-carryovers`, from `fe-device-fixes`) · 3. 7B.11 (`davao-bank-status`, from `fe-system-status`) · 4. 7B.7 (main checkout, from `fe-wording`) · 5. 8F (`davao-bank-p8-ui`, from `fe-phase8-screens`) |
| `be-opencode` (tab 16) | OpenCode CLI (free built-in model; run with `XDG_STATE_HOME=~/.opencode-state` because `~/.local/state` is root-owned) | 1. 7B.8 (`davao-bank-copycheck`, from `tool-copy-check`) · 2. 8D + `jwt_expiry = 900` (`davao-bank-bantay`, from `be-bantay-security`) · 3. 8E (`davao-bank-bills`, from `be-bills-summary`)                                                                               |

Phase 8G (admin cases) and the 8-merge stay with `fe-general-codex` after its reset.

**Hand-back rule (owner, 2026-11-25):** substitutes only cover while the original agents have no usage. When the captain sees an original agent has usage again, the substitute finishes and commits its current task and stops; the original agent resumes the remaining tasks of its own queue from the substitute's commit.
