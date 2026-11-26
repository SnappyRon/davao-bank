# Phase 8 · Stage 8G — Security cases (admin)

- **Branch:** `phase-8-admin-cases`
- **Worktree:** `/Users/ronalbert/Personal Projects/davao-bank-admin-cases`
- **Base:** `182505a` (`phase-8-bantay-risk`, so the frozen 8D admin RPCs exist in SQL).
- **Brief:** `/Users/ronalbert/Personal Projects/davao-bank/Phase-8-Bantay-AI-Prompt.md`, frozen 8D contract + Stage 8G. Read `apps/admin/AGENTS.md` and the local Next.js 16 docs (`page` params/searchParams are Promises; pages are Server Components by default) before writing code.
- **Taken over from:** `fe-general-codex` (no usage). `git status --short`, `git diff --stat` and `git log --oneline -3` were run after creating the worktree: no prior tracked or uncommitted work existed. Nothing was reverted. The three `node_modules` symlinks are untracked and were not staged.

## What was built

1. **Security cases list** — `apps/admin/src/app/cases/page.tsx` and `CasesClient.tsx`.
   - Server page awaits `searchParams`, validates `?status=open|investigating|resolved`, and calls `admin_list_security_cases(p_status)` under the aal2 cookie session.
   - Status filter is a labelled `Select`; sentence-case `Badge`s use dedicated case variants (`open` warning, `investigating` info, `resolved` success).
   - Case links and all displayed ids use `formatReferenceId` (e.g. `DB-1234-5678`), never raw UUIDs.
2. **Case detail** — `apps/admin/src/app/cases/[slug]/page.tsx` and `CaseDetailClient.tsx`.
   - Server page awaits `params`, decodes an opaque base64url slug and calls `admin_get_security_case(p_id)`. Missing RPC/case shows a friendly “Case unavailable” empty state, not a raw database error.
   - Masked customer summary (`J*** d*** C***`, `c•••@d•••`, `•••• 0002`) is built from `admin_get_users` and `account_balances`; the receiving account is derived from the whitelisted `to_account_id` fact in the case events.
   - Event timeline renders sentence-case event/severity/status labels and only whitelisted signal names; raw `facts` payloads, note text and ids are never printed.
   - Actions: set status + add note via `admin_update_security_case`; unlock via `admin_unlock_user`; freeze/unfreeze the receiving account via the existing `executeAdminSetAccountStatus`. Every action goes through a new server action that calls the shared `requireAdminAal2()` guard. Freeze/unfreeze writes `Case DB-xxxx-xxxx: <reason>` into the mandatory reason, which `admin_set_account_status` stores in audit metadata. No test-only bypass, no shortened one-hour wait.
3. **Dashboard** — `apps/admin/src/app/page.tsx` now shows an **Open cases** `StatTile` from `admin_list_security_cases('open')` (zero if the migration is not deployed) and links to `/cases`. `AdminNav.tsx` gained a **Security cases** item.
4. **Presentation helpers** — `apps/admin/src/lib/securityCases.ts` holds masking, status/badge mapping, signal whitelist, time formatting, and `caseSlug`/`caseIdFromSlug`. The base64url slug keeps raw UUIDs out of the address bar while still resolving the case server-side.
5. **Tests** — `e2e/admin/security-cases.spec.ts` covers list filtering, masked detail/no raw ids, status + note, and unlock. It reads no `.env`: it only uses an owner-supplied `ADMIN_STORAGE_STATE` from an already signed-in aal2 browser session and logs `NOT VERIFIED — needs owner sign-in` before skipping when absent. `apps/admin/src/__tests__/security_cases_display.test.ts` checks masking, slug round-trip and signal whitelisting.

No migration, SQL function, dependency, `STATUS.md`, prompt file or hosted data was changed. No push or merge.

## Real check output

Run from `/Users/ronalbert/Personal Projects/davao-bank-admin-cases`:

```
$ npm run typecheck
> admin@0.1.0 typecheck / > mobile@1.0.0 typecheck / > @davao-bank/shared@0.1.0 typecheck
exit 0

$ npm run lint
✖ 63 problems (0 errors, 63 warnings)

$ npm run format:check
All matched files use Prettier code style!

$ npm run test:unit
Test Suites: 39 passed, 39 total
Tests:       337 passed, 337 total
Snapshots:   0 total
Ran all test suites in 3 projects.

$ npx playwright test --list
Total: 9 tests in 2 files
(the four new security-cases.spec.ts checks are listed)
```

`npm run build:admin` was attempted and **failed before compiling our code**: Turbopack reported `Could not find the Next.js package (next/package.json)` resolved from `apps/admin/src/app`, caused by the worktree's symlinked `node_modules` (the same pattern used by the sibling worktrees, not a source error). The Next CLI also printed a security upgrade advisory; no upgrade was run because this stage forbids new dependencies.

## NOT VERIFIED

- Hosted behaviour of `admin_list_security_cases`, `admin_get_security_case`, `admin_update_security_case`, `admin_unlock_user` and the freeze/unfreeze audit reason: **NOT VERIFIED** — no hosted writes, no `.env` reads, migration not applied by this agent.
- Playwright list/detail/status/unlock flows: **NOT VERIFIED — needs owner sign-in**. Only `--list` was run; no browser session or `ADMIN_STORAGE_STATE` was available.
- `npm run build:admin`: **NOT VERIFIED** in this worktree because of the `node_modules` symlink resolution error described above (exit 1, Turbopack). CI builds from the real checkout and should compile these files.
- Mobile/8F interaction with these admin actions: not in scope.
