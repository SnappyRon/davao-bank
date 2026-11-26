# PHASE8_REPORT — Stage 8.5B operations dashboard

## Scope and commits

Worktree: `/Users/ronalbert/Personal Projects/davao-bank-ops-ui`
Branch: `phase-8.5-ops-ui`
Base: `54b1e11 Phase 8 · Merge — 8.5A backend`

```text
(this commit) Phase 8 · Stage 8.5B — Operations dashboard screens
06a3d6e Phase 8 · Fix — Format 8.5A backend spec
9deb533 Phase 8 · Fix — Sentence-case fallback in security event titles
faad42f Phase 7 · Fix — Activity test mock for useRoute
54b1e11 Phase 8 · Merge — 8.5A backend
```

The three fix commits are separate because they were outside the Stage 8.5B UI task but were required for the check suite to pass. Each was noted in `docs/agents/STATUS.md`.

## What was implemented

- Replaced the old admin home page with one hero (`Total volume`) plus four distinct metric cards (`Total transactions`, `Accounts`, `Customers`, `Open cases`). No duplicate stat tiles remain.
- Added today / 7 days / 30 days / custom date ranges and an optional previous-period comparison. Previous-period buckets are aligned by position in the ordered series, and comparison copy never invents a value while the previous RPC is loading or after it fails.
- Added six Recharts client components: volume over time, in vs out, volume by category, status mix, balance distribution, and customer/account growth. Every chart has SVG `<title>`/`<desc>`, a visible text table, a shape-matching skeleton, and distinct empty/error/Try again states. Colour is never the only encoding; labels and dash/stroke patterns carry the same information. Animations respect `prefers-reduced-motion`.
- Added a live feed over sanitized `staff_activity_events` INSERTs with a snapshot/reconnect refresh from `admin_ops_live_feed`, dedupe by event id, ten newest rows, a link to `/transactions`, masked accounts (`•• 1234`), `aria-live="polite"`, and connecting/connected/reconnecting/offline/AAL2-denied states. New-row animation is disabled under reduced motion.
- Added a security panel backed by `admin_ops_summary` (open cases, locked/frozen accounts, failed scheduled payments, new devices) and recent admin activity from `audit_logs`. Failed sign-ins are rendered as `Not available` with `no reliable source`; the UI never fakes `0`.
- Reused the existing aal2 admin guard. AAL2-denied states are shown by both the live feed and the security panel. The merged backend fix `f442269` enforces `assert_admin_aal2()` in all four analytics RPCs and `aal2` in the staff feed RLS policy.
- Every widget reads a real 8.5A RPC/table. Missing data produces an empty state, not invented numbers.
- Added Jest/RTL coverage for helpers, all chart states, live-feed states, security/activity states, and dashboard integration (49 admin tests).
- Added `e2e/admin/operations-dashboard.spec.ts` with dashboard checks explicitly skipped and labelled `NOT VERIFIED — needs owner sign-in`. It reads no `.env` and never automates MFA.
- Added pinned `recharts@3.11.1` to the `admin` workspace only. No other `package.json` dependency changed.

## Real command output

Dependency installation:

```text
added 1463 packages, and audited 1467 packages in 52s
added 37 packages, and audited 1504 packages in 12s
```

Manifest diff (only line added):

```diff
+    "recharts": "3.11.1",
```

Final local checks, all run from the worktree root after the last code change:

```text
typecheck_exit=0
lint_exit=0
format_exit=0
jest_exit=0
build_admin_exit=0
check_copy_exit=0

✖ 61 problems (0 errors, 61 warnings)
All matched files use Prettier code style!
Test Suites: 61 passed, 61 total
Tests:       500 passed, 500 total
Snapshots:   0 total
Time:        11.691 s
Ran all test suites in 3 projects.
PASS Copy audit clean across 167 files (15 justified allowlist match(es)).
✓ Compiled successfully in 828ms
```

`npm run typecheck` completed `tsc --noEmit` for `admin`, `mobile`, and `@davao-bank/shared` with exit 0. `npm run build:admin` completed with exit 0 and the expected route table (`/` is dynamic).

Admin-only unit suite during development:

```text
Test Suites: 7 passed, 7 total
Tests:       49 passed, 49 total
```

The pre-existing tracked `node_modules` symlinks were restored after that earlier check run, but the captain then had the worktree environment rebuilt with real `node_modules` directories. Those directories remain in place for reproducible checks; the tracked symlink deletions are unstaged.

## Post-merge re-verification (aal2 backend fix)

`f442269 Phase 8 · Fix — 8.5A require aal2 for analytics and feed` was merged with `--no-ff`. The only conflict was in `docs/agents/STATUS.md`; both branches' content was preserved. The migration is byte-identical to `f442269` (`cmp` exit 0), sha `1abd763dbc4f7a470e2c8cfa0ce18742648b7adb`, and contains `perform public.assert_admin_aal2()` in all four analytics RPCs plus `auth.jwt()->>'aal' = 'aal2'` in the staff feed RLS policy.

```text
typecheck_exit=0
jest_exit=0
build_admin_exit=0
lint_exit=0
format_exit=0
check_copy_exit=0

> admin@0.1.0 typecheck
> tsc --noEmit

> mobile@0.1.0 typecheck
> tsc --noEmit

> @davao-bank/shared@0.1.0 typecheck
> tsc --noEmit

Test Suites: 61 passed, 61 total
Tests:       500 passed, 500 total
Snapshots:   0 total
Time:        15.321 s, estimated 27 s
Ran all test suites in 3 projects.
✓ Compiled successfully in 1445ms
PASS Copy audit clean across 167 files (15 justified allowlist match(es)).
```

## NOT VERIFIED

- Playwright: `e2e/admin/operations-dashboard.spec.ts` is skipped until the owner supplies a real aal2 staff storage state. No owner sign-in, MFA automation, or `.env` read was performed.
- Hosted Supabase: captain reports the fixed migration is applied to hosted. Codex used no hosted query or write; RPC/table shapes were verified against `supabase/migrations/20261128000000_phase8_5_ops_backend.sql` and mocked in Jest.
- Device, Maestro, VoiceOver and live browser rendering: NOT VERIFIED — captain/owner to run.
- No push and no PR were made.

---

# Stage 8N — Bantay AI chat backend

## Scope and commits

Worktree: `/Users/ronalbert/Personal Projects/davao-bank-chat-db`
Branch: `phase-8-bantay-chat-db`
Base: `6b6aab5 Phase 9 · Merge — phase-8-kada-float`
Commit title: `Phase 8 · Stage 8N — Bantay AI chat backend`

The pre-existing untracked migration `supabase/migrations/20261130100000_phase8_bantay_chat.sql` was kept, not replaced. Only the missing 24 h message prune was added to its lazy-cleanup path.

## What was implemented

- Six tables (`bantay_chat_config`, `sessions`, `messages`, `requests`, `usage`, `global_usage`) with RLS, `revoke all` and narrow service-role/caller grants, plus seven `security definer set search_path = ''` RPCs: quota, atomic global reservation, session open/history/save, caller-scoped clear and clear-all.
- `supabase/functions/bantay-chat/index.ts`: POST-only Deno function, `Authorization: Bearer` check, `caller.auth.getUser(jwt)`, caller JWT client for own timeline/settings/device reads, service-role client only for function-owned chat writes. No tools, function calling, money/settings RPCs, JWT, user id, key or raw error in the provider payload or logs.
- Pure Deno-loadable helpers in `packages/shared/src/bantay/chat{Config,Context,Help,Redact,Validator,Service}.ts`, re-exported by `supabase/functions/_shared/bantay.ts` with explicit `.ts` specifiers.
- Provider pinning in one module: `gemini-3.5-flash-lite`, `store: false`, `seed: 0`, `thinking_level: 'minimal'`, `max_output_tokens: 300`, `timeout: 4000`, `response_format` JSON schema with a seven-id action enum; no unsupported `temperature` field. At most one retry on 429/5xx/timeout, 150–300 ms jitter, ≤6 s total.
- Quota and global reservation happen before every provider attempt, including the retry; disabled/missing config, missing quota or failed reservation returns the fixed fallback with no fetch. Article and obvious pre-refusal paths answer with zero model calls.
- Input clamp/redaction, allow-listed masked facts with exact centavos/labels/notes/ids dropped, server-stored last-8 chronological history, strict JSON parse, 8E validators plus chat amount-band/PII/action/claimed-action/refusal checks, fixed fallback strings and one-action allow-list.
- Nine approved curated articles compiled from `docs/specs/bantay-help/` with approved Taglish variants and a deterministic alias matcher/cache; `06-freeze-card.md` and `09-contact-support.md` remain skipped because their statuses are not approved.
- Tests: 37 Jest cases across `bantay_chat_helpers.test.ts`, `bantay_chat_service.test.ts` and `bantay_chat_eval.test.ts` (E1–E10 plus provider/cap/log cases), and 35 PGlite cases in `pglite-phase8-n-chat.mjs` wired into `npm run test:db`.

## Real check output

```text
> npm run typecheck
> npm run typecheck --workspaces --if-present
> admin@0.1.0 typecheck
> tsc --noEmit
> mobile@1.0.0 typecheck
> tsc --noEmit
> @davao-bank/shared@0.1.0 typecheck
> tsc --noEmit
exit 0

> npm run lint
✖ 62 problems (0 errors, 62 warnings)

> npm run format:check
Checking formatting...
All matched files use Prettier code style!

> npx jest  # first run
Test Suites: 3 failed, 73 passed, 76 total
Tests:       4 failed, 654 passed, 658 total
Snapshots:   0 total
Time:        131.951 s
# 4 timeouts in pre-existing mobile suites (activity_account_param and related).
# Immediate rerun, no code change:
> npx jest
Test Suites: 76 passed, 76 total
Tests:       658 passed, 658 total
Snapshots:   0 total

> npm run test:db
✓ 8N config defaults fail closed with 30/4/500 caps
✓ 8N disabled kill switch blocks quota — {"reason":"chat_disabled","allowed":false,"quota_remaining":0}
✓ 8N fourth message in a rolling minute is blocked — {"reason":"rate_limited","allowed":false,"quota_remaining":0}
✓ 8N per-user daily cap is enforced in Asia/Manila days — {"reason":"daily_limit","allowed":false,"quota_remaining":0}
✓ 8N global provider cap reserves atomically before the call — {"allowed":false,"model_calls":2,"limit_reached":true}
✓ 8N customers cannot call quota or reservation RPCs — permission denied for function bantay_chat_check_quota permission denied for function bantay_chat_reserve_model_call
✓ 8N save/load keeps both messages, source and allow-listed action
✓ 8N session open lazily prunes messages past the 24 h retention window
✓ 8N RLS exposes only the caller sessions and messages
✓ 8N clear cannot delete another user session
✓ 8N clear_all only removes the caller sessions and messages
501 passed, 0 failed
exit 0

> npm run check:copy
PASS Copy audit clean across 185 files (17 justified allowlist match(es)).
```

## NOT VERIFIED

```
NOT VERIFIED — no hosted query or write; the migration was tested only in PGlite and is not applied to Supabase.
NOT VERIFIED — no real Gemini call, no API key read outside Deno.env and no provider response recorded.
NOT VERIFIED — mobile BantayChat screen, actions map, accessibility, device, Maestro and VoiceOver (outside this backend brief).
NOT VERIFIED — 10 truly parallel provider calls and 600 concurrent reservations (PGlite has one connection); sequential cap and mocked parallel quota cases were run instead.
NOT VERIFIED — no push or PR; owner/captain reviews and applies after AI + Security review.
```
