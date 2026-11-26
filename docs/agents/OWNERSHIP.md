# OWNERSHIP — Integration coordinator snapshot (2026-11-26, session restart)

> Read-only snapshot from `git worktree list`, per-worktree `status --short` / `log -1`, `git diff --name-only <merge-base>..<branch>` and `git merge-tree --write-tree`. Base for the parallel work is `phase-8-integration` at `c8caacf`. All uncommitted work in every worktree was kept; nothing was reset, deleted or staged by this step. This step edits **only this file**.

## 1. Active work (snapshot 2026-11-26)

| Agent                    | Worktree              | Branch                            | Base vs `c8caacf` | Head     | Uncommitted work (non-`node_modules`)                                                                                                                  | State                         |
| ------------------------ | --------------------- | --------------------------------- | ----------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| be-opencode              | `davao-bank-freeze-db` | `phase-8-protective-freeze`       | `6b6aab5` (-1)    | `c907a8d` | none                                                                                                                                                   | Committed, clean              |
| be-opencode-2            | `davao-bank-drill`    | `phase-8-drill-console`           | `6b6aab5` (-1)    | `80214f5` | none                                                                                                                                                   | Committed, clean              |
| fe-opencode              | `davao-bank-freeze-ui` | `phase-8-protective-freeze-ui`    | `6b6aab5` (-1)    | `6b6aab5` | 8 modified screens/hooks + `STATUS.md`; 3 new files (`FrozenMoneyGate.tsx`, `useProtectiveFreeze.ts`, `protectiveFreeze.ts`)                          | In progress — uncommitted     |
| kilo-2                   | `davao-bank-freeze-admin` | `phase-8-protective-freeze-admin` | `6b6aab5` (-1) | `6b6aab5` | 7 admin files (cases, operations dashboard, live feed, `securityCases.ts`)                                                                             | In progress — uncommitted     |
| be-opencode-3            | `davao-bank-chat-db`  | `phase-8-bantay-chat-db`          | `6b6aab5` (-1)    | `6b6aab5` | new `20261130100000_phase8_bantay_chat.sql`; untracked `node_modules` entries                                                                          | In progress — uncommitted     |
| fe-opencode-2            | `davao-bank-chat-ui`  | `phase-8-bantay-chat-ui`          | at base           | `c8caacf` | none                                                                                                                                                   | Clean — work not started      |
| be-opencode-4            | `davao-bank-cards-db` | `phase-9-cards-db`                | `6b6aab5` (-1)    | `6b6aab5` | none (untracked `node_modules` entries only)                                                                                                           | Clean — migration not written |
| fe-opencode-3            | `davao-bank-cards-ui` | `phase-9-cards-ui`                | at base           | `c8caacf` | none                                                                                                                                                   | Clean — work not started      |
| fe-opencode-4            | `davao-bank-goals-ui` | `phase-9-goals-ui`                | `6b6aab5` (-1)    | `6b6aab5` | `packages/shared/src/index.ts` (+1 export), new `TimeDepositPlannerScreen.tsx`, `savingsGoals.ts`                                                    | In progress — uncommitted     |
| fe-cline                 | `davao-bank-maestro`  | `phase-9-maestro`                 | `6b6aab5` (-1)    | `6b6aab5` | 4 Maestro flows modified; new `more-services-flow.yaml`, `notes/phase-9-maestro.md`                                                                  | In progress — uncommitted     |

**Reassignment (2026-11-26):** the Antigravity agents ran out of credits, so six worktrees changed hands: chat backend `be-bantay-security` → **be-opencode-3**, chat UI `fe-phase8-screens` → **fe-opencode-2**, cards backend `be-bills-summary` → **be-opencode-4**, cards UI `fe-system-status` → **fe-opencode-3**, goals UI `fe-motion` → **fe-opencode-4**, Maestro `tool-copy-check` → **fe-cline**. Worktrees, branches and heads are unchanged; incoming agents inherit the uncommitted work listed above and must review it before editing (`git diff` / `git status`). Nothing was reset or discarded. The four OpenCode agents already on the board (freeze-db, drill, freeze-ui, freeze-admin) keep their assignments.

Supporting branches (already in or behind the base, no new writes this step): `phase-9-hub` `2282f35` (MoreServicesScreen + App.tsx + HomeScreen, ancestor of `c8caacf`), `phase-8-kada-float` `0925eba` (FloatingKada, ancestor of `c8caacf`), `phase-8-drill-spec`, `phase-8-bantay-chat-design`.

`6b6aab5` is one commit behind `c8caacf` (`Phase 9 · Merge — phase-9-fx-converter`). Every `-1` worktree must merge/rebase `c8caacf` before branch integration; `git merge-tree --write-tree c8caacf <branch>` returned rc=0 for both committed branches, so the lag itself is mechanical.

## 2. Hot files — ownership and predicted conflicts

| # | Path / area                                | Current owner (evidence)                                                                                 | Other claimants                                                                     | Predicted conflict / risk                                                                                                                        | Rule / order                                                                                                     |
| - | ------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| 1 | `apps/mobile/src/screens/HomeScreen.tsx`   | Hub tiles + FloatingKada indicator already in base (`2282f35`, `0925eba`); freeze-ui now rewrites the Bantay row into a freeze banner and touches tile guards | chat-ui, cards-ui, goals-ui will want entry points; maestro asserts Home copy      | Same JSX region: freeze banner vs new tiles vs Kada bubble. `git diff` in freeze-ui shows the Bantay row replacement and `ShieldAlert` import   | Freeze-ui merges first; then **one** UI writer at a time adds tile/bubble changes. Captain resolves HomeScreen   |
| 2 | `apps/mobile/src/components/FloatingKada.tsx`, `components/index.ts` | Kada float merged at `0925eba`; barrel export present in `c8caacf` (`components/index.ts:38`)       | Spec's new protective-freeze bubble (B5, priority over B1–B4) has no owner/branch yet | Bubble title/body must follow approved spec §2.2 and keep `accessible={false}` on art; barrel export is shared                                  | Assign one bubble owner before any UI merge; no parallel edits to the barrel                                     |
| 3 | `apps/mobile/src/screens/MoreServicesScreen.tsx` (hub tiles) | Hub commit `2282f35` owns the 8 current tiles (service requests, goals, appointments, cards, FX, etc.) | chat-ui, cards-ui, goals-ui; maestro smoke test `more-services-flow.yaml`           | Parallel tile insertions into the same array will conflict; copy/labels feed Maestro asserts                                                    | Hub integrator (captain) is sole writer; feature agents export screens and request tile wiring                   |
| 4 | `packages/shared/src/index.ts`              | goals-ui uncommitted `+ export * from './savingsGoals'`                                                 | chat-db / cards-db shared clients, freeze types, any new helper                     | Additive line at EOF; concurrent appends produce a merge conflict (uncommitted, so invisible to `merge-tree`)                                    | goals-ui keeps the export; later writers rebase and append after it; no barrel rewrites                           |
| 5 | Root `package.json` (+ `jest.config.js`)    | drill-console `80214f5` added `"drill"` and a Jest `scripts` project; no dependency changes              | chat-db, cards-db, goals-ui, maestro all need their own script entries              | Same `scripts` block; concurrent additions conflict. Standoff: no other agent may edit while drill-console work is unintegrated                 | Captain adds all remaining script entries after the drill branch lands; no new dependencies                       |
| 6 | Notification type lists                    | freeze-db `c907a8d` added `bantay_protective_lock → 'Bantay froze your account'` to `InboxScreen.TYPE_TITLES` and imported the PGlite suite in `pglite-behavior.mjs`; its migration writes the exact contract body | chat-db / cards-db notification types; `_bantay_event` generic `account_alert` path in the alerts migration | Lists are string maps/SQL inserts; a second writer can drop the exact title/body or emit two notifications                                     | One writer per list, in order: freeze-db → chat/cards. Never change the contract strings; single notification only |
| 7 | `apps/mobile/App.tsx` routes                | Hub commit `2282f35` added `MoreServices` route and is already in base                                 | new Bantay-chat, cards and goals screens all need routes                            | Route import/type/registration block is shared; no current uncommitted App.tsx edits, so conflict starts when UI branches commit                 | Single route owner (captain/hub integrator); screen agents must not edit App.tsx                                   |
| 8 | Migration numbering `20261130000000` / `100000` / `200000` | `20261130000000_phase8_bantay_protective_lock.sql` committed on freeze-db; `20261130100000_phase8_bantay_chat.sql` untracked on chat-db | cards-db/bills-summary reserved for `20261130200000` (not created yet)              | No filename collision today, but order matters: protective lock → chat → cards. Spec §6.7 proposed `20261129210000`; owner's `20261130000000` supersedes it | Reserve `100000` for chat-db, `200000` for cards-db; captain applies in filename order, reviewer only             |

## 3. Merge predictions (real output)

`git merge-tree --write-tree` on the committed branches:

```
c8caacf vs phase-8-drill-console      rc=0
c8caacf vs phase-9-hub                rc=0
phase-8-protective-freeze vs phase-8-drill-console   rc=1
  CONFLICT (content): Merge conflict in docs/agents/STATUS.md
phase-8-protective-freeze vs phase-9-hub             rc=0
phase-8-drill-console vs phase-9-hub                 rc=0
phase-8-protective-freeze vs phase-9-cards-db        rc=0
phase-8-protective-freeze vs phase-9-goals-ui        rc=0
phase-8-drill-console vs phase-9-goals-ui            rc=0
phase-9-hub vs phase-9-goals-ui                      rc=0
phase-8-protective-freeze vs phase-8-drill-spec      rc=0
phase-8-drill-console vs phase-8-drill-spec          rc=0
```

Caveat: `merge-tree` cannot see the uncommitted work in freeze-ui, freeze-admin, chat-db, goals-ui or maestro — rows 1–7 above are predicted from `git diff`/`status`, not from `merge-tree`.

## 4. Contract check and risks to captain

Contract verified in code: freeze is the existing `_lock_account(p_user_id, 'bantay')` (freeze-db migration `:173`); no new unlock RPC (existing `request_unlock` / `complete_unlock` / `admin_unlock_user`); notification type `bantay_protective_lock` with the exact body, and `InboxScreen.TYPE_TITLES` title `Bantay froze your account`; no copy instructs the user to move money.

- **R1 — UI copy drift:** freeze-ui `protectiveFreeze.ts` sets `PROTECTIVE_FREEZE_HOME_TITLE = 'Account frozen by Bantay'` and `PROTECTIVE_FREEZE_CONFIRM_LABEL = "Confirm it's me"`. Approved spec §2.2 requires Home title `Bantay froze your account` and button `Open Bantay`. Ruling needed before that UI merges.
- **R2 — Kada bubble:** `PROTECTIVE_FREEZE_KADA_BODY` omits the mandatory sentence `Davao Bank will never ask you to move your money.` and the spec's "Check Bantay" wording. No bubble is wired yet; assign an owner.
- **R3 — backend/spec divergence:** the committed freeze migration adds a new `bantay_protective_locks` table, inserts the `protective_lock` event directly and re-creates `_bantay_event`, rather than hooking the rule inside `_bantay_event` after insert as spec §1.1 describes. It still reuses the 8D lock and keeps `_transfer_core` untouched; Security review should confirm grants, recursion guard and the single-notification path.
- **R4 — UI token drift:** `FrozenMoneyGate.tsx` uses raw `fontSize`/`lineHeight`/`fontWeight: '700'` instead of theme tokens; UI/UX and copy checks should run on the merged branch, not on the base.
- **R5 — script ownership:** only drill-console owns root `package.json` / `jest.config.js`; its diff adds no dependencies. Other agents must request script entries rather than edit those files.
- **R6 — test accounts:** drill-core hard-restricts targets to the two literal test addresses; other suites must import `scripts/lib/test-accounts.ts`. No `.env` value was read in this step; no hosted write, no push.
- **R7 — doc-rule conflict in the brief:** the task said "update `docs/agents/OWNERSHIP.md` (only that file)" while the same brief's rule list said "don't edit … OWNERSHIP.md". The specific task was treated as controlling; no `STATUS.md`, `ROADMAP.md` or `Phase-*.md` was edited, and this contradiction is reported rather than silently resolved.
- **R8 — environment:** the main checkout's `node_modules` is broken (`eslint`, `prettier` and Expo tsconfig missing); checks were therefore run in the clean `davao-bank-p8-integration` worktree at `c8caacf`, not against any agent's uncommitted work.

## 5. Integration order proposal

1. Merge freeze-db (`c907a8d`) and drill-console (`80214f5`) first; resolve `docs/agents/STATUS.md` (the only committed-branch conflict).
2. Land chat-db's `20261130100000` migration and cards-db's reserved `20261130200000`; run `test:db` after each.
3. Merge freeze-ui (HomeScreen/banner) before any chat/cards/goals UI work; apply captain's ruling on R1/R2 first.
4. Add chat-ui, cards-ui and goals-ui one at a time; App.tsx routes and MoreServices tiles are edited only by the single hub integrator.
5. Merge freeze-admin and maestro last; rerun copy audit and Maestro after the final UI copy is in place.

## 6. Standing rules and retained decisions

- Never run `npm install`, `npm ci` or `npm update` in a worktree whose `node_modules` is a symlink; never add dependencies unless the brief names them.
- Never change `package.json` or the lockfile unless the brief says so (drill-console's approved script entries are the exception).
- Stage files by name; never push; never write to the hosted project; read-only Supabase queries only; never read `.env`.
- Money engine (`_transfer_core`, ledger, idempotency keys, `run_due_scheduled_payments`) stays unchanged; all money moves through server functions.
- Protective freeze is the existing Bantay lock; unlock keeps the 1-hour customer wait and aal2 staff path; one notification with the contract strings; mock copy never tells users to move money.

## 7. Check output (real, clean `davao-bank-p8-integration` at `c8caacf`)

```
npm run typecheck   -> exit 0 (admin, mobile, shared: tsc --noEmit clean)
npm run lint        -> ✖ 71 problems (0 errors, 71 warnings)
npm run format:check-> All matched files use Prettier code style!
npx jest --runInBand-> Test Suites: 75 passed, 75 total; Tests: 636 passed, 636 total
npm run test:db     -> 469 passed, 0 failed
npm run check:copy  -> PASS Copy audit clean across 185 files (17 justified allowlist match(es)).
```

Main checkout (Phase 7 branch, broken dependency tree): `npm run typecheck` exit 2 with missing modules / `expo/tsconfig.base` not found; `npm run lint` and `npm run format:check` exit 127 (`eslint`/`prettier: command not found`). These are environment failures, not failures of this docs-only change. NOT VERIFIED: any check against the uncommitted work in the parallel worktrees; device, hosted and live money flows.

## 8. Notes for captain

- Five worktrees are mid-edit; this map is a snapshot, not a frozen state. Re-run `git status --short` in each before merging.
- Six worktrees were reassigned from out-of-credit Antigravity agents to OpenCode/Cline agents on 2026-11-26 (see reassignment note in §1). The incoming agents must take over uncommitted work rather than restart it; the captain should confirm each new agent has the active prompt and the test-account/copy contracts before they resume.
- The one committed-branch conflict is `docs/agents/STATUS.md` (freeze-db vs drill-console). Uncommitted `STATUS.md` also exists in freeze-ui; this coordinator did not touch it per the "only that file" instruction.
- Do not mark UAT rows or reviewer files; route the copy and SQL divergences (R1–R4) to the appropriate reviewers.
