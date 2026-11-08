# AGENTS.md — Davao Bank (read this first, every session)

This file is the **shared memory and rulebook** for every AI agent on this project: Claude Code, Codex, Antigravity/Gemini and any other. Several agents work on this repo, and any of them may stop at any moment (for example when credits run out). The next agent must be able to continue from the files in this repo alone.

## Start of every session: read in this order

1. `AGENTS.md`: this file.
2. `docs/agents/STATUS.md`: what is done, what is half done, the exact next step.
3. The active prompt named in `STATUS.md` (a `Phase-*.md` file in the repo root). That is your task spec.
4. Run `git log --oneline -10` and `git status --short` to confirm `STATUS.md` matches reality. If they disagree, trust git, then fix `STATUS.md`.

Do not start work until you have done all four.

## Roles

| Role                | Who                                                 | Responsibilities                                                                                                                                    |
| ------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Owner**           | Ron (human)                                         | Final decisions, signs in to apps, approves pushes and PRs.                                                                                         |
| **Boss / reviewer** | Claude Code                                         | Writes the phase prompts, reviews every commit, runs device and database checks, applies migrations to the hosted project, keeps this file current. |
| **Programmers**     | Codex, Antigravity (or any agent the owner assigns) | Implement the active prompt exactly.                                                                                                                |
| **Designer**        | Agent assigned for design work                      | Design files, theme tokens and visual specs. Changes app code only when the prompt says so.                                                         |

Agents do not hand tasks to each other directly. Work flows through the prompt files, `STATUS.md` and git.

## Handoff protocol (mandatory)

- **After every completed step**, not just every stage:
  1. Update `docs/agents/STATUS.md`: done, in progress, the exact next step, blockers, last commit.
  2. Commit. Stage files by name, including `docs/agents/STATUS.md`.

  A step is anything worth about 15 minutes or more of work.

- **Never leave important work only in your chat.** If it is not in a file or a commit, the next agent cannot see it.
- **Finishing a stage:** use the exact commit title the prompt gives. Then, in `STATUS.md`, move the stage to "Done" with its commit hash.
- **Taking over:**
  - Do not redo committed work.
  - Review uncommitted changes (`git diff`) and keep them unless they are clearly wrong.
  - Add a line to the `STATUS.md` log saying you took over.
- **Finishing the session:** your final reply to the owner lists the commit hashes, check results, and anything not verified.

## Hard rules (never break these)

**Secrets**

- Never print, log, paste or commit passwords, TOTP secrets, one-time codes, API keys or the contents of `.env`.
- `SEED_PASSWORD` and `E2E_PASSWORD` live only in the gitignored root `.env`.

**Git**

- Never push and never open PRs. The owner does that after review.
- Never use `git add -A` or `git add .`. Stage files by name.
- **Reviewer files: never edit, stage or commit them** unless the prompt says so:
  - `docs/UAT_CHECKLIST.md`
  - `docs/uat-evidence/`
  - `Phase-*.md` prompt files

**Hosted database**

- Never write to the hosted Supabase project (`qomxlzvrovwsfneqsfej`): no `supabase db push`, no SQL writes, no hosted auth or config changes. The reviewer applies migrations after review.
- Read-only queries are allowed: `npx supabase db query --linked --read-only "…"`.

**Money engine**

- Do not change `_transfer_core`, idempotency keys, the ledger or `run_due_scheduled_payments` unless the prompt explicitly says so.
- All money moves through server functions. Never update balances from the client.

**Security**

- Never weaken a security check, test guard or "NOT VERIFIED" stop to make a test pass. Report it instead.

**Results**

- Never fake or assume a result. Paste real command output, and write "NOT VERIFIED — reason" when you could not run something.
- Do not mark UAT checklist rows as passed. Only the reviewer does that.

**Dependencies and scope**

- Do not run `npm audit fix` (with or without `--force`), and do not add dependencies the prompt does not name. Pin exact versions.
- If you find a real bug outside your task, do not fix it silently. Make a separate commit titled `Phase X · Fix — <what>` and note it in `STATUS.md` and the report.

## Unattended loop (`scripts/agent-loop.sh`)

The owner may run a programmer agent unattended: `scripts/agent-loop.sh <stage> [max_runs]`.

- **Where it runs:** Claude Code in its own worktree (`../davao-bank-agent`), one step per run, with the per-run instructions in `AGENT_PROMPT.md`.
- **When it stops:**
  - the agent writes `.agent-stop` (`STAGE_DONE: <stage>` or `BLOCKED: <reason>`);
  - a `STOP` file exists;
  - two runs in a row make no commit;
  - `max_runs` is reached.
- **Guardrails:** `.claude/agent-loop/guard.py`, loaded only by the loop, blocks:
  - push, PRs and destructive git commands;
  - hosted-Supabase changes;
  - reading `.env`;
  - new dependencies;
  - network downloads;
  - edits outside the worktree.

  The worktree has no Supabase CLI link, and push is also disabled through git environment config. **A blocked command is a rule.** Never work around it.

- **After every stage:** the reviewer reviews it before the next loop starts. Logs are in `agent_logs/`, which is gitignored.

## Project facts

- **What:** an academic capstone, a simulated mobile bank using play money (₱), themed on Davao City. Transfers happen only between Davao Bank accounts.
- **Monorepo (npm workspaces):**
  - `apps/mobile`: Expo SDK 58 / React Native.
  - `apps/admin`: Next.js 16 staff console. **Read `apps/admin/AGENTS.md` before touching it**; this Next.js version has breaking changes.
  - `packages/shared`: types, Supabase client wrappers, `utils/errors.ts`.
  - `supabase/migrations`: SQL, named `YYYYMMDDhhmmss_description.sql`. Always add a new migration; never edit an applied one.
  - `scripts/`: seed and live test suites. `scripts/lib/` holds shared test helpers.
  - `e2e/`: Playwright (admin) and Maestro (mobile) flows.
- **Backend:** Supabase. Auth is email and password, plus authenticator-app (TOTP) step-up from Phase 6.5. pg_cron runs scheduled payments every 5 minutes.
- **Demo accounts:** `customer1@davaobank.ph`, `customer2@davaobank.ph`, an admin account, and an internal billers account, all created by `npm run seed`.

## Commands (run from the repo root)

| Purpose                                 | Command                                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------------------------- |
| Format / lint / types                   | `npm run format:check`, `npm run lint`, `npm run typecheck`                                   |
| Unit tests (Jest)                       | `npm run test:unit` (run from the root, not from `apps/mobile`)                               |
| Local DB behaviour (PGlite, no network) | `npm run test:db`                                                                             |
| Live suites (hosted, need `.env`)       | `test:rls`, `test:money`, `test:admin`, `test:extras`, `test:schedules`, `test:qr`, `test:fx` |
| Playwright (admin)                      | `set -a; . ./.env; set +a; npx playwright test`                                               |
| Run apps                                | `npm run dev:admin`, `npm run dev:mobile`                                                     |

## Conventions

- **Commit titles:** `Phase <n> · <Stage/Fix/Close-out> — <short description>`, as given in the prompt.
- **Reports:** each phase ends with `PHASE<n>_REPORT.md` containing real outputs.
- **Accessibility:** controls get `getByRole`-friendly labels, and tests use roles, not placeholder text.
- **User-facing errors:** go through `packages/shared/src/utils/errors.ts`. Never show raw database messages or regexes to users.
