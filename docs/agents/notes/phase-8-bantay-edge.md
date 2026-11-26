# Phase 8 · Stage 8E — Bantay explain and sign-in signal (notes)

Taken over by Codex (be-bills-summary) from the original be-bills-summary agent.
Worktree: `/Users/ronalbert/Personal Projects/davao-bank-bills`
Branch: `phase-8-bantay-edge` (from `phase-8-bills-backend` at `781b6a0`)

## Prior work found on takeover

- The required briefs had been read: root `AGENTS.md`, `docs/agents/ROADMAP.md` and
  `Phase-8-Bantay-AI-Prompt.md`, plus the original Stage 8E captain brief.
- Branch and worktree were already correct; only the untracked `node_modules` symlinks
  were present, and they were left alone.
- A read-only hosted check had started against `auth.audit_log_entries`; the first
  attempt with deprecated `--linked` needed a token, and a retry with `--remote`
  showed zero rows.
- Google's current Gemini documentation had been fetched to select the model and REST
  endpoint.
- Draft shared modules and `supabase/functions/bantay-explain/index.ts` had been
  written but no tests, sign-in signal, migration, notes or commit existed.

## Finished work

### Frozen 8D contract respected

- No `security_events`, `user_devices`, `risk_challenges`, `trusted_payees`,
  `security_cases` or other 8D table was created. The new migration resolves
  `public.security_events` only at call time in `write_signin_failure_event()`.
- No hosted database write was performed; only read-only queries were used.
- No `.env` file was opened, and no password, key, TOTP or one-time code was printed.
- No dependencies were added, no push/merge was made, and untracked `node_modules`
  links were not staged.

### Hosted evidence for the sign-in branch

Command run from the worktree (the repo's linked project state lives in the main checkout):

```sh
npx supabase db query --workdir "/Users/ronalbert/Personal Projects/davao-bank" --remote --read-only "SELECT count(*) AS total_entries, count(*) FILTER (WHERE payload::jsonb ? 'action') AS with_action, count(*) FILTER (WHERE payload::jsonb ? 'fail') AS with_fail, count(*) FILTER (WHERE payload::jsonb ? 'error') AS with_error FROM auth.audit_log_entries;"
```

Real output (no email or user id appears):

```text
Target: project davao-bank (qomxlzvrovwsfneqsfej) · production
{
  "rows": [
    {
      "total_entries": 0,
      "with_action": 0,
      "with_fail": 0,
      "with_error": 0
    }
  ]
}
```

Note: `--linked` is deprecated and returned `DbQueryLoginRequiredError`; `--remote`
targets the same linked project (`qomxlzvrovwsfneqsfej · production`). Because no
failed-password entries are recorded, the prompt's **function variant** was chosen:
`supabase/functions/signin-signal`, not the cron SQL variant. The reserved cron
migration name `20261127010000_phase8_bantay_signin.sql` was therefore not used;
the function's support migration is
`20261127010001_phase8_bantay_signin_signal.sql`.

### Gemini path

Official docs used at build time (fetched 2026-11-25):

- <https://aistudio.google.com/api-reference/interactions-api/create-interaction.md>
- <https://aistudio.google.com/docs/choosing-a-model.md>
- <https://aistudio.google.com/docs/interactions-overview.md>

Exact current values taken from those docs:

- Endpoint: `https://generativelanguage.googleapis.com/v1beta/interactions`
- Model: `gemini-3.5-flash-lite` ("fastest, most cost-effective 3.5 model")
- Text is read from `steps[].content[].text`, with `output_text` accepted as the
  SDK alias.

`supabase/functions/bantay-explain/index.ts` verifies the caller JWT with
`auth.getUser()`, loads the event as the caller so RLS applies, reduces it to masked
facts, calls Gemini with `store: false`, `thinking_level: minimal`, 200 output tokens,
a fixed system prompt and a 4-second timeout, then updates only
`explanation` / `explanation_source` through a service-role client scoped by both
`id` and `user_id`. Missing key, non-2xx response, timeout, malformed output and
unsafe output all fall back to the template and never expose a raw model error.
The key is read only from `Deno.env.get('GEMINI_API_KEY')` and is never logged.

### Sign-in signal path

- `supabase/functions/signin-signal/index.ts` accepts `{ email }`, HMAC-SHA-256 hashes
  the normalised email and caller IP with the service key as the key (never logged),
  records the hashed attempt, and raises one `signin_failures` event after 5 failures
  in 15 minutes for either bucket.
- The response is always `{ "status": "accepted" }` for valid requests, whether the
  user exists, does not exist, or is rate-limited. Malformed requests get a generic 400. No email, IP or user-existence information is returned.
- `public.record_signin_failure_signal()` stores only `email_hash`, `ip_hash`, the
  nullable `user_id` and `created_at`. There are no raw email or IP columns and no
  customer policies or grants.
- `public.write_signin_failure_event()` is the only event writer, deduplicates by
  hashed email for 15 minutes, and is service-role-only. Both RPCs are
  `security definer set search_path = ''`; the caller check is the EXECUTE grant to
  `service_role` only.
- The app-side call after a failed sign-in is not part of this stage; the Edge Function
  contract is ready for the frontend agent.

### Shared copy and tests

- `packages/shared/src/bantay/facts.ts`: pure allow-listed masking builder. Only fixed
  kinds, severities, bands and a 4-digit suffix leave the function; unknown `facts`
  keys (including injected note text) are discarded.
- `packages/shared/src/bantay/templates.ts`: one sentence-case template per frozen
  8D kind, using ₱ and `•• 1234`.
- `packages/shared/src/bantay/gemini.ts`: prompt fixtures, request builder, response
  parser, safety filter and template fallback.
- `packages/shared/src/bantay/signin.ts`: normalisation, keyed hashing, threshold and
  masked event facts.
- `packages/shared/src/utils/errors.ts`: added the two frozen error mappings.
- Added Jest suites: `bantay_facts.test.ts` (80 seeded fuzz cases),
  `bantay_templates.test.ts`, `bantay_gemini.test.ts` (no key / 429 / timeout / success)
  and `bantay_signin.test.ts`. Extended `errors_and_labels.test.ts`.
- Added 8 PGlite checks to `scripts/review/pglite-behavior.mjs` for hashed storage,
  RLS, grants, the 5/15-minute threshold and malformed hashes.

## Checks — real output

### `npm run typecheck`

```text
> davao-bank@0.1.0 typecheck
> npm run typecheck --workspaces --if-present

> admin@0.1.0 typecheck
> tsc --noEmit

> mobile@1.0.0 typecheck
> tsc --noEmit

> @davao-bank/shared@0.1.0 typecheck
> tsc --noEmit
```

Exit code 0.

### `npm run lint`

The full run lists pre-existing `no-explicit-any` warnings; no new warnings were added.
Final summary line:

```text
✖ 63 problems (0 errors, 63 warnings)
```

Exit code 0.

### `npm run format:check`

```text
> davao-bank@0.1.0 format:check
> prettier --check "**/*.{ts,tsx,js,jsx,json,md}"

Checking formatting...
All matched files use Prettier code style!
```

`.mjs` is not in the project format glob; the reviewer harness was intentionally kept
in its original compact style with only the 8 new check lines added.

### `npm run test:unit`

```text
> davao-bank@0.1.0 test:unit
> jest

Test Suites: 43 passed, 43 total
Tests:       369 passed, 369 total
Snapshots:   0 total
Time:        6.571 s
Ran all test suites in 3 projects.
```

### `npm run test:db`

Baseline before this stage: `145 passed, 0 failed`. Final tail:

```text
✓ 8E signin ledger: customer cannot read attempts — permission denied for table signin_signal_attempts
✓ 8E signin ledger: customer cannot insert attempts — permission denied for table signin_signal_attempts
✓ 8E signin ledger has no raw email/IP columns — created_at,email_hash,id,ip_hash,user_id
✓ 8E record_signin_failure_signal returns 15-minute counts — [{"email_attempts":1,"ip_attempts":1}]
✓ 8E fifth attempt reaches the 5/15-minute threshold — [{"email_attempts":6,"ip_attempts":6}]
✓ 8E malformed hash is rejected before any write — Invalid sign-in signal
✓ 8E anon cannot call the signal recorder — permission denied for function record_signin_failure_signal
✓ 8E anon cannot call the event writer — permission denied for function write_signin_failure_event
✓ Reconciliation: every transfer/reversal/bill nets to zero — {"net":"148801","unbalanced":0,"mismatched":0}
✓ Reconciliation: account_balances == ledger sum for every account — {"net":"148801","unbalanced":0,"mismatched":0}

153 passed, 0 failed
```

## NOT VERIFIED

- NOT VERIFIED — no real `GEMINI_API_KEY` was available (D14 is not done), so the live
  Gemini request was not made. All success/failure paths were exercised with mocked
  `fetch`; the no-key fallback is enforced by tests.
- NOT VERIFIED — the two Edge Functions were not deployed or invoked against hosted
  Supabase; no hosted write or deploy was attempted.
- NOT VERIFIED — `write_signin_failure_event()` was not executed in PGlite because the
  8D `security_events` table is built in parallel and must not be created here. Its
  authorization was verified; its insert was reviewed against the frozen contract.
- NOT VERIFIED — the hosted `auth.admin.listUsers()` email lookup was not called
  against the live project; pagination and comparison were unit-shaped only.
- NOT VERIFIED — the mobile app does not yet call `signin-signal` after a failed
  sign-in; that is outside the Stage 8E backend brief.
- NOT VERIFIED — a Deno runtime `deno check` was not run; Deno is not part of the five
  required root checks. Shared TypeScript typecheck and ESLint pass.
