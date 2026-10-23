# Davao Bank — Phase 1 Implementation Prompt

**Hand this entire file to your AI coding agent. It is self-contained.**
Phase: **1 of 7 — Project Setup & Architecture.** Do only what this prompt describes. Do **not** start Phase 2 work (no auth, no accounts, no money logic).

---

## 1. Context & what you are building

You are building **Davao Bank**, a _simulated (prototype)_ mobile banking system for an academic capstone. It has three parts that share one backend:

- **Mobile app** (customers) — React Native + Expo + TypeScript
- **Admin web** (staff) — Next.js (App Router) + TypeScript
- **Backend** — Supabase (Postgres, Auth, Storage, Edge Functions)

This is a **prototype**: balances are play money, there is no real settlement. Still, build it to professional standards (security, integrity, auditability) because later phases depend on this foundation.

**Your objective for Phase 1:** stand up the repository, both app skeletons, the Supabase project, the shared design system (Davao Bank palette), and the shared conventions — and prove end-to-end connectivity. **No business features yet.**

---

## 2. What to review before you start

- The approved **Davao Bank Project Proposal v1.1**, especially:
  - **§5.3 Brand Identity & Cultural Foundation** — the exact color palette you must encode as design tokens.
  - **§6 System Architecture** and **§6.2 Technology Stack** — the layers and technology choices.
  - **§6.1 Architectural Principles** — server-authoritative money, least privilege, auditable, simple & maintainable.
  - **§7 Data Model** — do **not** build this yet; just be aware of it so your structure anticipates it.
  - **§8.1 Development Phases** — your scope boundary.
- If any instruction here conflicts with the proposal, **stop and flag it** rather than guessing.

---

## 3. What to implement

### 3.1 Repository (monorepo with npm workspaces)

Create a single repo named `davao-bank` with this structure:

```
davao-bank/
  apps/
    mobile/            # Expo React Native + TypeScript
    admin/             # Next.js (App Router) + TypeScript
  packages/
    shared/            # shared TS: theme/palette, types, constants, supabase client factory
  supabase/
    migrations/        # SQL migrations (version-controlled)
    config.toml
  .env.example         # documented, committed
  .gitignore           # must ignore .env, node_modules, build output
  package.json         # npm workspaces: ["apps/*", "packages/*"]
  README.md            # setup & run instructions
```

- Use **npm workspaces**. Pin Node version in `.nvmrc` / `engines`.
- **Expo + monorepo gotcha:** configure `apps/mobile/metro.config.js` for workspaces (set `watchFolders` to include the repo root and `packages/shared`, and add the root `node_modules` to `nodeModulesPaths`). Verify Metro resolves the `shared` package before moving on.

### 3.2 Shared design system (`packages/shared`)

Encode the **Davao Bank palette** (from proposal §5.3) as TypeScript design tokens, consumed by both apps so colors are never hardcoded per-screen:

```ts
export const colors = {
  primary: '#6A1B7A', // Waling-waling orchid — brand / headers / primary actions
  success: '#1C7A4D', // Mt. Apo green — safe/successful actions, growth
  accent: '#D99000', // Kadayawan gold — value, balances, highlights
  earth: '#5A3A22', // Cacao brown — warm supporting tone
  neutral: '#3A4A52', // Eagle slate — text / neutral UI
  // add sensible tints, background, surface, text, border, error tokens
};
```

Also export: shared `types` (start with a `HealthCheck` type), and a **Supabase client factory** both apps reuse (reads URL + anon key from env). Keep it framework-agnostic.

### 3.3 Mobile app skeleton (`apps/mobile`)

- Expo + TypeScript (strict). Install and configure **React Navigation** with a minimal stack (one placeholder "Home" screen is enough).
- The Home screen must **apply the shared palette** (branded header "Davao Bank" in Waling-waling purple, a small swatch row showing the 5 tokens) — this proves the design system is wired.
- Wire the shared **Supabase client** using `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- No auth, no accounts, no transfers.

### 3.4 Admin web skeleton (`apps/admin`)

- Next.js (App Router) + TypeScript (strict).
- One placeholder landing page that **applies the shared palette** (branded "Davao Bank Admin" header + the same swatch row).
- Wire the shared **Supabase client** using `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Add a **server-only** Supabase helper that reads `SUPABASE_SERVICE_ROLE_KEY` from server env (used only in Route Handlers / Server Components). This key must **never** be exposed to the browser bundle or prefixed with `NEXT_PUBLIC_`.
- No auth, no management features.

### 3.5 Supabase project + connectivity scaffold

- Initialize Supabase with the CLI (`supabase init`) so local dev + migrations are version-controlled from day one.
- Create **one** migration that adds a tiny **`health_check`** table purely to prove the pipe works end to end:
  - columns: `id` (int, PK), `status` (text), `checked_at` (timestamptz default now())
  - seed exactly one row: `status = 'ok'`
  - **Enable RLS** on the table and add a policy allowing **public SELECT only** (no insert/update/delete from clients). This establishes the RLS habit immediately.
- This `health_check` table is a scaffold; it will be kept or removed in Phase 2. Do not add any other tables.

### 3.6 Connectivity proof

Both apps must, on their placeholder screen, read the `health_check` row via the shared client and display **"Backend: ok"** (or the error). This is the Phase 1 acceptance signal.

---

## 4. Technical standards & security requirements

- **TypeScript `strict: true`** in all packages. No `any` without justification.
- **ESLint + Prettier** configured at the root and passing.
- **Secrets:** only the **anon** (public) key may appear in client bundles. The **service role** key is server-only (admin), never in mobile, never `NEXT_PUBLIC_`. Commit **`.env.example`** with placeholder values; never commit real `.env`.
- **RLS on from the start:** every table (even `health_check`) has RLS enabled with least-privilege policies. Deny by default.
- **No business/money logic in Phase 1.** No balances, no auth flows, no admin management — those are Phase 2+.
- **Consistency:** both apps consume the shared palette and shared Supabase client; no duplicated color hex codes or client config.
- Keep it **simple and maintainable** (proposal §6.1) — no extra services, no premature abstractions.

---

## 5. Expected output & completion criteria

Phase 1 is complete when **all** of these are true:

1. `npm install` at the repo root succeeds (workspaces resolve).
2. `apps/mobile` boots in Expo and shows the branded Home screen with the palette swatches and **"Backend: ok"**.
3. `apps/admin` runs with `next dev` and shows the branded landing page with the palette swatches and **"Backend: ok"**.
4. The Supabase migration applies cleanly and the `health_check` row is readable by an anon client; writes are rejected by RLS.
5. `packages/shared` exports the palette tokens, the `HealthCheck` type, and the Supabase client factory — both apps import from it (no duplication).
6. Lint and type-check pass across all workspaces.
7. `SUPABASE_SERVICE_ROLE_KEY` does **not** appear in any client (mobile or admin browser) bundle or in any `NEXT_PUBLIC_`/`EXPO_PUBLIC_` variable.
8. `README.md` documents how to set env vars and run each part; `.env.example` is present and complete.

---

## 6. Tests & verification steps (perform and report results)

- **Build/run:** show that both apps start and render the branded placeholder (describe or screenshot).
- **Connectivity:** confirm both apps display "Backend: ok" from the `health_check` read.
- **RLS check:** attempt an INSERT/UPDATE on `health_check` with the anon key and confirm it is **rejected**.
- **Secret-leak check:** grep the built client output / bundle and the mobile source for the service-role key and confirm it is **absent**; confirm no `NEXT_PUBLIC_`/`EXPO_PUBLIC_` var holds a service key.
- **Lint & types:** run lint + `tsc --noEmit` across workspaces and show they pass.
- **Shared import proof:** show both apps importing `colors` and the client factory from `packages/shared`.

---

## 7. What to preserve / avoid changing

- This is a **greenfield** phase — there is no prior app code to preserve. Your job is to set the conventions that every later phase will follow, so keep structure clean and documented.
- **Do not** implement anything from Phase 2+ : no Supabase Auth flows, no `profiles`/`accounts`/`ledger`/`transactions` tables, no transfers, no admin management, no money logic. Adding these now will be rejected in review.
- **Do not** commit real secrets or disable RLS.
- **Do not** hardcode palette colors in screens — always consume the shared tokens.

---

## 8. What to report back for review

Provide: the final repo tree, the `health_check` migration SQL, the `packages/shared` theme + client factory files, `.env.example`, both apps' placeholder screens (screenshots or clear description), and the output of the verification steps in §6. Note anything you changed from this prompt and why.

_Reminder: I (the reviewer) will inspect the actual code, migration, and config — not just your summary — against the proposal and this prompt before approving Phase 1._
