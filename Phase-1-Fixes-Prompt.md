# Davao Bank — Phase 1 Follow-Up (Fixes) Prompt

**Hand this entire file to your coding agent.** This is a correction pass on Phase 1 — **not** a new phase. The Phase 1 review found that the backend, security, shared palette, and admin app are good, but the **workspace wiring, the mobile app, and a type error** block sign-off. Fix the items below **without rebuilding or regressing the parts that already work.**

Review first: the approved **Davao Bank Project Proposal v1.1** (§5.3, §6) and the original **Phase-1-Prompt-Project-Setup.md**. If any fix conflicts with those, stop and flag it.

---

## Do NOT change / must preserve

These were reviewed and are correct — do not rewrite them:

- `supabase/migrations/20261020125654_init_health_check.sql` (health_check table, RLS, public-read policy, seed).
- `apps/admin/src/lib/supabase-server.ts` (the `server-only` service-role handling) and the `.env.example` security boundary.
- `packages/shared/src/theme/colors.ts` palette values (you may **add** a missing token — see Fix 3 — but do not change existing hex values).
- The overall admin page design in `apps/admin/src/app/page.tsx` (fix only the bug in Fix 3).
- Keep all work within Phase 1 scope: **no auth, no accounts, no ledger, no transfers, no admin management** (those are Phase 2+).

---

## Required fixes

### Fix 1 — Add the root `package.json` and wire npm workspaces

The repo has no root manifest, so workspaces aren't configured and a root `npm install` is impossible.

- Create a root `package.json` with:
  - `"private": true`
  - `"workspaces": ["apps/*", "packages/*"]`
  - root scripts that fan out, e.g. `"typecheck"`, `"lint"`, and convenience scripts to start each app.
- Ensure `npm install` **run once at the repo root** installs all three workspaces and links `@davao-bank/shared` into both apps.
- Keep the existing `.nvmrc` (Node 24.12.0); add a matching `"engines"` field.

### Fix 2 — Implement the mobile app (currently untouched boilerplate)

`apps/mobile/App.tsx` is still the default Expo template and does not use the shared package at all. Bring it to the same Phase 1 bar as the admin app:

- Add dependencies to `apps/mobile/package.json`: `@davao-bank/shared` (workspace) and `@supabase/supabase-js` (plus `react-native-url-polyfill` if needed for the Supabase client in RN).
- Add React Navigation with a single placeholder **Home** screen (a stack is fine).
- The Home screen must:
  - Show a branded **"Davao Bank"** header using `colors.primary` (Waling-waling purple) from `@davao-bank/shared`.
  - Render the five core palette swatches from the shared `coreColorSwatches` (do **not** hardcode hex values on the screen).
  - Create the Supabase client via the shared `createSupabaseClient(...)` using `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`, call `fetchHealthCheck`, and display **"Backend: ok"** (or the error).
- Confirm Metro resolves `@davao-bank/shared` (the existing `metro.config.js` is set up for this; verify it works after the root install).

### Fix 3 — Fix the undefined color token

`apps/admin/src/app/page.tsx:207` references `colors.primaryMuted`, which does not exist in `colors.ts`, so `tsc --noEmit` / `next build` fail. Either:

- add a `primaryMuted` token to `colors.ts` (a muted Waling-waling purple that fits the palette), **or**
- change the reference to an existing token (e.g. `colors.border` or `colors.primaryLight`).
  Then confirm the type-check passes.

### Fix 4 — Verify and unify dependency versions

- Run a real `npm install` at the root and resolve any version that does not exist or does not mutually resolve. In particular, pin the **Expo SDK** and let its expected **React Native / React** versions follow (use `npx expo install` for RN/React/Expo packages so they match the SDK).
- Unify **TypeScript** to one version across all workspaces (mobile currently differs from shared/admin).
- The phase is not done until `npm install` completes cleanly from the root.

### Fix 5 — Root lint/format + README

- Add **ESLint + Prettier** at the repo root (shared config) so both apps and the shared package are covered and `npm run lint` passes repo-wide.
- Expand `README.md` to document: prerequisites, how to set env vars (point to `.env.example`), how to start Supabase locally and apply migrations, and how to run the admin app and the mobile app.

---

## Re-verification (run these and report the output)

1. `npm install` at the repo root succeeds; `@davao-bank/shared` is linked into both apps.
2. **Admin**: `npm run dev` renders the branded page with swatches and **"Backend: ok"**.
3. **Mobile**: the app boots in Expo and renders the branded Home screen with swatches and **"Backend: ok"**.
4. Type-check passes repo-wide (`tsc --noEmit` in every workspace) — specifically confirm the `primaryMuted` error is gone.
5. Lint passes repo-wide.
6. RLS check: with the anon key, an INSERT/UPDATE on `health_check` is **rejected**; SELECT succeeds.
7. Secret-leak check: `SUPABASE_SERVICE_ROLE_KEY` is absent from any client (mobile/admin browser) bundle and from any `NEXT_PUBLIC_`/`EXPO_PUBLIC_` variable.
8. Both apps import `colors` / `coreColorSwatches` / the client factory from `@davao-bank/shared` (no duplicated hex or client config).

## Report back

Provide: the new root `package.json`, the updated mobile `App.tsx` / screen + `package.json`, the `colors.ts` or page fix, the expanded `README.md`, and the output of the re-verification steps above. Note anything you changed from this prompt and why.

_The reviewer will re-run the root install, type-check, and builds against the actual code before approving Phase 1._
