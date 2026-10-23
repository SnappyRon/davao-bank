# Davao Bank — Phase 5 Implementation Prompt: Redesign + Feature Expansion

**Hand this entire file to your coding agent. It is self-contained.**

It combines everything approved after Phase 4:
- the **UI/UX redesign** (bold, polished experience inspired by the reference app *Clucky*, branded with the official Kadayawan 2026 logo and colors), and
- **eight new features** (Scope Change Record 01).

It **supersedes** `Phase-4R-Prompt-UI-UX-Redesign.md`; all of that content is included here (Stage A).

After this phase come only **Phase 6 — Testing & Security Hardening** and **Phase 7 — Deployment & Handover**.

---

## How to run this phase (read first)

Work through the stages **in order**:

| Stage | What it delivers |
|---|---|
| **0** | Close out Phase 4 fixes + live-database verification + script env fix |
| **A** | UI/UX redesign of every existing screen (design system first) |
| **B** | Everyday extras: saved recipients, own-account shortcut, statements, hide balance, biometric confirmation |
| **C** | Scheduled & recurring payments + simulated bill pay |
| **D** | QR send & request money |
| **E** | FX reference-rate chart (view only) + integration polish |

Rules for every stage:
1. **Branch:** do all work on the branch `phase-5-redesign-features`.
2. **One commit per stage**, titled `Phase 5 · Stage X — <name>`. This lets each stage be reviewed on its own.
3. **One new migration per stage** that changes the database (`supabase/migrations/<timestamp>_phase5_stage_x_<name>.sql`). **Never edit an earlier migration.**
4. **Run that stage's verification before starting the next stage.** If anything fails, **stop**, write up what failed, and do not continue. Never build the next stage on a failing one.
5. At the end of each stage, append a short entry to `PHASE5_REPORT.md` covering:
   - what was built
   - the commands you ran and their **full output**
   - **which database** the tests ran against (local `supabase start` URL, or the hosted dev project)
   - anything you changed from this prompt, and why
6. If anything in this prompt conflicts with the existing code or the approved proposal, **stop and flag it**. Do not guess.

### What to review before starting
- **The proposal:** *Davao Bank Project Proposal v1.1* (simulated prototype — play money, not a licensed bank).
- **Approved changes:** `Scope-Change-01-Feature-Additions.md`.
- **Pending fixes:** `Phase-4-Fixes-Prompt.md`.
- **Database:** every file in `supabase/migrations/` — schema, RLS, `is_admin()`, `write_audit`, `transfer`, `deposit`, `withdraw`, `get_account_transactions` and the `admin_*` functions.
- **Shared package:** `packages/shared` (tokens, types, RPC callers, `generateIdempotencyKey`, `formatCentavosToPHP`).
- **Apps:** both apps in full. Also read `apps/admin/AGENTS.md`: this Next.js version has breaking changes, so read the relevant guide in `node_modules/next/dist/docs/` before touching layouts or fonts.
- **Visual reference:** the Figma file *Davao Bank — UI Redesign Mockup* — https://www.figma.com/design/cfRZvdUS79QuuG4hOrHIoB. Where it and this prompt disagree, **this prompt wins**. The Figma file still shows the older 2×2 Home grid; §A.4 has the final layout.

### Non-negotiable rules (all stages)
- **Server-authoritative money.**
  - Clients never write money tables directly.
  - Every money movement goes through `SECURITY DEFINER` functions with a fixed `search_path`. They are atomic, idempotent, use row locks and are audited.
- **One money engine.** All new money features (scheduled runs, bill pay, payment requests) must reuse the **same core transfer logic** (see §C.2). Do not write a second copy of the transfer logic.
- **Internal-only functions are revoked from clients:**
  ```sql
  revoke execute on function ... from public, anon, authenticated;
  ```
  Only the functions clients actually need get `grant execute ... to authenticated`.
- **RLS on every new table**, deny by default.
- **Money is integer centavos (`bigint`), with `amount > 0`.** No floating point for money.
- **Audit and notify.** Every money movement and admin action writes `write_audit(...)` and the relevant notifications.
- **Secrets.**
  - Only the anon key goes in clients. The service-role key stays server-side.
  - Never commit `.env` files or keys.
  - The secret-leak check must stay at 0.
- **No real company names** anywhere in demo data (billers etc.). This is a simulated prototype.
- **Design tokens only.**
  - Every color, size, spacing, radius and motion value comes from `@davao-bank/shared` tokens.
  - The grep for hardcoded hex in `apps/mobile/src` and `apps/admin/src` must return 0.
- **Accessibility.**
  - Contrast meets WCAG AA (see §A.1).
  - Touch targets are at least 44 pt.
  - Layouts survive 130% font scaling.
  - Screen-reader labels are present.
  - Reduce Motion is respected.
  - Color is never the only signal.

---

## Stage 0 — Close out Phase 4 and verify against a live database

1. **Phase 4 fixes.** Confirm every item in `Phase-4-Fixes-Prompt.md` is implemented and verified:
   - double-reversal guard
   - suspension enforced (money functions, `is_admin()`, mobile suspended screen)
   - `write_audit` revoked from clients
   - one idempotency key per admin dialog opening
   - no-op status cleanup

   If any item is missing, do it now (new migration).
2. **Script env fix.** The CLI scripts don't load `.env`. Change the root `package.json` scripts `seed`, `test:rls`, `test:money` and `test:admin` to run with the env loaded, for example:
   ```
   node --env-file=.env --import tsx scripts/seed.ts
   ```
   Any equivalent that works with the installed `tsx` is fine.
3. **Apply migrations to a live database.**
   - Prefer a local stack (`npx supabase start`, then `npx supabase db reset`).
   - If Docker isn't available, use the hosted dev project the owner has linked (`npx supabase db push`).
   - Then run `npm run seed`.
4. **Run everything and record full output:**
   - `npm run test:rls`
   - `npm run test:money` — this must include the **concurrency** and **reconciliation** checks
   - `npm run test:admin`
   - the Phase 4-fix checks (concurrent double reversal, suspension, `write_audit` forgery attempts as both customer and anon)
5. **Quality checks:** typecheck, lint, format:check, `build:admin`, `expo export`, and the secret-leak grep.

**Gate:** all green, or stop and report.

---

## Stage A — UI/UX redesign (design system first, then every existing screen)

This stage is **visual and UX only**. Every existing feature, server call, idempotency behavior and business rule must work exactly as before.

What carries over from the reference app *Clucky*:
- heavy, tightly spaced type, with the key number as the hero of each screen
- one strong accent color on a warm neutral background
- large rounded cards and chunky pill buttons
- generous spacing
- a colorful action-tile grid
- calm, short motion

**Do not copy** its colors, logo, mascot, illustrations, copy, streaks or gamification. Branding comes from the official Kadayawan 2026 logo, which the owner uses with permission from the Davao City Tourism Operations Office.

### A.0 Brand assets
- The owner supplies the logo files in `packages/shared/assets/brand/`:
  - `kadayawan-logo-mark.svg` — the diamond with four tiles
  - `kadayawan-logo-horizontal.svg`
  - `app-icon-1024.png`
- **If a file is missing, do not trace, redraw or crop the logo from any image.** Use a labeled placeholder (a neutral rounded square reading "LOGO") and list the missing files in the report.
- Where each version goes:
  - The **mark** is used for the app icon, splash screen, favicon and anywhere small.
  - The **horizontal** version is used only where it has room: welcome screen, admin sidebar header, About screen.
- Never recolor, stretch, rotate, add effects to or crop the logo. Keep clear space around it of at least ¼ of its height.
- Put this credit on the mobile **About** screen and in the admin sidebar footer:
  *"Kadayawan logo used with permission of the Davao City Tourism Operations Office."*

### A.1 Color tokens
Sampled from the official logo and checked for contrast. Replace the current palette in `packages/shared/src/theme/`:
- Keep existing token names where their meaning still fits, and add the new tokens.
- Update `coreColorSwatches` to describe the five logo colors.
- Let `npm run typecheck` catch any renamed tokens.

| Token | Value | Use |
|---|---|---|
| `primary` | `#0C6D38` (Mt. Apo deep green) | Main buttons, active tab, links, focus ring, credit amounts (contrast 6.4:1 on white) |
| `primaryPressed` | `#09552B` | Pressed state |
| `primaryTint` | `#E3F2E8` | Selected chips, soft highlights, success badge background |
| `green` | `#03AA56` | Fills only (Cash-in tile) |
| `red` | `#EF2D23` | Fills only (destructive button, error icon) |
| `redText` | `#C8102E` | Error and destructive text (5.9:1) |
| `orange` | `#FD4B12` | Fills only (Cash-out tile) |
| `orangeText` | `#C2410C` | Warning text (5.2:1) |
| `yellow` | `#FEAD0B` | Fills only, **always with `ink` text and icons on top** |
| `blue` | `#0099C8` | Fills only (Transfer tile) |
| `blueText` | `#006E94` | Info text (5.7:1) |
| `ink` | `#1A1A1A` | Primary text, debit amounts |
| `textSecondary` | `#5C5A55` | Secondary text |
| `textMuted` | `#8A877F` | Placeholders and non-essential hints only |
| `canvas` | `#F7F5F0` | App background |
| `surface` | `#FFFFFF` | Cards, sheets |
| `surfaceSubtle` | `#EFECE6` | Inputs, inactive chips |
| `border` | `#E4E0D8` | Dividers, outlines |
| `tintRed` / `tintOrange` / `tintYellow` / `tintBlue` | `#FDE8E7` / `#FFEDE4` / `#FFF4DB` / `#E1F3FA` | Badge and icon-circle backgrounds |

Rules:
- **One accent.** Green is the only color for main actions and active states. The other Kadayawan colors appear only in action tiles, transaction-type icons, badges and alerts.
- **Money amounts.**
  - Incoming: `+₱1,000.00` in `primary`.
  - Outgoing: `−₱1,000.00` in `ink`. Red means "error", never just "money out".
  - The sign is always shown.
- **White text on bright fills.** On `green`, `blue` and `orange`, white text must be **bold and at least 18 px**; small white text fails contrast there. Icons are fine. On `yellow`, always use `ink`.
- **Light mode only.**

### A.2 Typography, spacing, shape, motion, icons
- **Font family.** Use **Plus Jakarta Sans** (open licence):
  - Mobile: `@expo-google-fonts/plus-jakarta-sans` + `expo-font`.
  - Admin: `next/font/google`.
  - Only weights 500 / 600 / 700 / 800.
- **Type scale (size/line height · weight):**

  | Style | Spec | Use |
  |---|---|---|
  | `display` | 40/44 · 800 · letter-spacing −1 | Balance, the amount being moved |
  | `h1` | 28/32 · 800 · −0.5 | Screen titles |
  | `h2` | 22/28 · 700 · −0.3 | Section titles |
  | `title` | 18/24 · 700 | Card titles, tile labels, buttons |
  | `bodyStrong` | 16/24 · 600 | Row titles, list amounts |
  | `body` | 16/24 · 500 | Body text |
  | `label` | 14/20 · 600 | Chips, form labels |
  | `caption` | 12/16 · 500 | Timestamps, helper text |

- **Tabular figures** (digits that line up in columns) for every money amount, account number and rate:
  - Mobile: `fontVariant: ['tabular-nums']`.
  - Web: `font-variant-numeric: tabular-nums`.
- **Spacing:** 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48.
  - Screen side padding 20.
  - 12–16 between cards.
  - 32 between sections.
- **Corner radius:** sm 10 · md 16 · lg 24 (cards, tiles) · xl 32 (sheets) · pill 999 (buttons, chips).
- **Elevation:** mostly flat, using borders. One soft shadow, used only for floating elements.
- **Motion:**
  - Library: `react-native-reanimated` on mobile; CSS transitions on admin.
  - Press feedback: scale to 0.97 over about 100 ms.
  - Sheet and screen transitions: 220–280 ms, ease-out.
  - Balance count-up: up to 600 ms, plays once.
  - Success check-mark: up to 500 ms.
  - No bounce, parallax or looping animation.
  - Respect Reduce Motion: `useReducedMotion` on mobile, `prefers-reduced-motion` on web.
- **Haptics** via `expo-haptics`:
  - light tap on primary actions
  - success haptic when a money operation completes
  - error haptic when one fails
- **Icons:** Lucide only — `lucide-react-native` + `react-native-svg` on mobile, `lucide-react` on admin. Stroke width 2; sizes 20 / 24 / 28.

### A.3 Shared components (build these before any screen)
- **Mobile** (`apps/mobile/src/components/`):
  - `Screen`, `Text` (variant-based)
  - `Button` (primary / secondary / ghost / destructive; loading state; full-width pill, 56 px tall)
  - `Card`, `ActionTile`, `ActionTileGrid` (data-driven: **2×2 for 4 tiles, 3×2 for 5–6**)
  - `AmountText` (supports hidden/masked)
  - `ListRow`, `TransactionRow`
  - `Chip` / `FilterChips`
  - `TextField` (label, helper, error), `AmountInput`
  - `BottomSheet`, `Badge`, `EmptyState`, `Skeleton`, `Toast`
- **Admin** (`apps/admin/src/components/ui/`):
  - `Button`, `Card`, `StatTile`, `Badge`, `Input`, `Select`
  - `Table` (sticky header; amounts right-aligned in tabular figures)
  - `Drawer`, `ConfirmDialog`, `PageHeader`, `FilterBar`
  - `EmptyState`, `Skeleton`, `Toast`
  - `Sidebar`
- **Admin styling:** replace all inline `style={{…}}` with **CSS Modules + CSS variables** generated from the shared tokens. Add no new CSS framework.

### A.4 Mobile — navigation and screens
- **Navigation.** Replace the single stack with a **4-tab bottom bar: Home · Activity · Inbox · Profile**.
  - Inbox shows an unread-count badge.
  - Money flows open as full-screen stack flows with a back/close button and a step indicator.
  - Keep the existing auth gating, in this order: not signed in → auth screens; email not verified → verify screen; suspended → suspended screen; otherwise → tabs.
- **Split up `HomeScreen`.** The current 1,133-line `HomeScreen` becomes screens and components. No screen file should exceed about 350 lines.
- **Auth screens** (Welcome / Login / Sign up / Verify email / Forgot password):
  - horizontal logo, one bold headline, pill buttons
  - field errors shown inline
  - layout stays usable with the keyboard open
  - same Supabase calls as today
- **Home:**
  - Greeting row with the logo mark and an avatar showing the user's initials.
  - **Balance card** filled with `primary`:
    - total balance in `display` size, using tabular figures
    - an account pill (e.g. "Savings · 1012 3456 78")
    - an account switcher if the user has more than one account
    - a reserved spot in the header row for the hide toggle (Stage B)
  - **Action grid**, using the `ActionTileGrid` component:
    - **Stage A ships 4 tiles:** Transfer (`blue`) · Cash-in (`green`) · Cash-out (`orange`) · Activity (`yellow`, ink text).
    - **Final, after Stages C and D:** six tiles in a **3×2** grid — **Transfer · Pay bills · QR · Cash-in · Cash-out · Scheduled**. The Activity tile is removed then, because it duplicates the Activity tab.
  - **Recent activity:** the last 5 items, plus "See all".
  - Remove the developer health-check and palette panels from customer view. Keep them only when `__DEV__` is true.
- **Activity:**
  - Full history from `get_account_transactions`, grouped by date (Today / Yesterday / date).
  - Filter chips: All · Transfers · Cash-in · Cash-out · Adjustments · Reversals. Stage C adds Bills.
  - Tap a row to open a receipt-style detail view.
  - **Row titles stay short and the details go in the subtitle**, e.g. title "Transfer in", subtitle "From 1020 4417 85 · 10:24 AM". The app only knows account numbers, so never show a person's name for the other party.
- **Transfer flow:**
  1. Recipient
  2. Amount — large display figure, preset chips, available balance
  3. Review card
  4. Confirm
  5. Success — check-mark, amount, receipt, new balance

  Keep the idempotency behavior exactly as it is: one key per transfer attempt, reused on retry. Show server errors (insufficient funds, frozen account, not found) inline, with a retry.
- **Cash-in / Cash-out:** same pattern — amount with preset chips → review → success.
- **Inbox:** notifications with an unread style, plus mark-read and mark-all-read.
- **Profile:**
  - Profile card (initials, name, email, "Email verified" badge).
  - Menu, built from a list so later stages can add rows: Personal details · About.
  - Sign out.
- **Personal details (new; closes the proposal §4.1 gap).**
  - Users can edit their full name and phone through the existing RLS "update own profile" rule. The guard trigger already blocks role and status changes. **No migration needed.**
  - Email is read-only.
- **About:**
  - app version
  - logo credit
  - disclaimer: *"Davao Bank is a simulated prototype for academic use. It is not a licensed bank and holds no real money."*
- **Suspended screen:** restyled, calm tone, sign out.
- **Loading, empty and error states everywhere:**
  - skeleton loaders instead of full-screen spinners
  - friendly empty states
  - error states with a retry
- **`app.json`:** app name "Davao Bank"; icon, adaptive icon and splash from the brand assets (the mark on the `canvas` color).

### A.5 Admin — layout and pages
- **Layout:**
  - Left **sidebar**:
    - horizontal logo + "STAFF CONSOLE"
    - nav: Dashboard · Users · Accounts · Transactions · Audit log; the active item uses `primaryTint` + `primary`
    - signed-in admin, sign out, logo credit
  - **Responsive behavior:**
    - At 1024 px and below, the sidebar becomes an icon-only rail.
    - At 768 px and below, it becomes a drawer.
- **Dashboard:**
  - `StatTile` KPIs with large tabular numbers:
    - total system balance
    - customers (active / suspended)
    - accounts (active / frozen)
    - 30-day volume and transaction count
    - reversals
  - The tile colors appear only as small icon accents.
  - A recent-transactions table and a recent-audit-activity list.
- **Users / Accounts / Transactions / Audit:**
  - Each uses `PageHeader` + `FilterBar` + `Table`.
  - Status badges always include text.
  - Clicking a row opens a details `Drawer`.
- **`ConfirmDialog` for every financial or destructive action** (suspend, freeze/close, adjust, reverse):
  - State the **exact ledger effect** with new balances, e.g. "Debit ₱1,200.00 from 1020 4417 85 → new balance ₱3,800.00".
  - Require a typed reason.
  - Use one idempotency key per dialog opening.
  - Use the same server actions with the same arguments as today.
- **CSV export:** same route, styled as a secondary button, with a toast.

**Stage A gate:**
- Screenshots of every mobile screen (iPhone size + small Android), including loading, empty and error states.
- Screenshots of every admin page at 1440 / 1024 / 768 px.
- Hardcoded-hex grep = 0.
- All Stage 0 tests still pass.
- Quality checks pass.
- A diff of all server-call sites showing **no logic changes**.

---

## Stage B — Everyday extras

### B.1 Saved recipients + own-account shortcut
- **Migration — new table `saved_recipients`:**
  - columns: `id uuid pk`, `owner_id uuid not null → profiles(id) on delete cascade`, `account_number text not null`, `nickname text not null check (char_length(nickname) between 1 and 40)`, `created_at timestamptz default now()`
  - `unique (owner_id, account_number)`
- **RLS:**
  - Owners can `select` and `delete` their own rows.
  - Owners can `update` only `nickname`, enforced with `with check (owner_id = auth.uid())`.
  - **No client insert policy.** All inserts go through the function below.
- **`add_saved_recipient(p_account_number text, p_nickname text)`** (`SECURITY DEFINER`, granted to authenticated):
  - The caller must be signed in, and their profile must be active.
  - The number must belong to an existing **active** account that **is not one of the caller's own**.
  - **Never return or reveal the account holder's name.**
  - Limits: at most 50 saved recipients per user, and at most 20 adds per day.
  - Writes an audit entry.
- **Mobile, Transfer step 1:**
  - "My accounts" (own-account shortcut, from `account_balances`, excluding the source account).
  - "Saved", with search by nickname.
  - "New account number", with an option "Save this recipient" after a successful transfer.
  - Profile gains a **Saved recipients** row (list, rename, delete).

### B.2 Statements (CSV + PDF)
- **Migration — `get_account_statement(p_account_id uuid, p_from date, p_to date)`** (`SECURITY DEFINER`, scoped to the caller, granted to authenticated):
  - Returns the opening balance (sum of ledger before `p_from`), the rows in the range (same shape as `get_account_transactions`) and the closing balance.
  - The range must be 1 year or less, with `p_from` on or before `p_to`.
  - The caller must own the account.
- **Mobile — Activity → "Export statement"** (also in each account's detail view):
  - The user picks an account and a period: this month, last month, last 3 months or a custom range.
  - Generate **CSV**, and a **PDF** using `expo-print` (from an HTML template) + `expo-sharing`.
  - The PDF contains:
    - logo (or placeholder)
    - account number, period
    - opening and closing balance
    - the transactions table
    - the disclaimer and logo credit
    - the generated-at time (Asia/Manila)

### B.3 Hide / reveal balance
- An eye toggle in the balance card's header. The choice is saved on the device and persists across launches; balances are shown by default.
- When hidden:
  - every **balance** in the app shows `₱••••••` (Home, account lists, available balance in flows, new balance on success screens);
  - transaction amounts stay visible;
  - screen readers announce "Balance hidden";
  - a single tap reveals the balance.

### B.4 Biometric confirmation before money moves
- **Library:** `expo-local-authentication`.
- **Applies before:** submitting a transfer, cash-out, bill payment, creating or editing a schedule, paying a payment request, and paying from a scanned QR. Cash-in can skip it.
- **Profile → Security:**
  - Toggle "Confirm payments with Face ID / fingerprint".
  - Defaults to on when the device supports it.
  - Turning it off requires one successful check first.
- **Fallback when no biometrics are enrolled and there's no device passcode:** the user re-enters their account password, verified with `supabase.auth.signInWithPassword` for their own email.
- **Order of operations:** create the idempotency key **once per attempt** → run the check → call the server function.
  - If the user cancels the check, don't call the server.
  - A retry after a network failure reuses the same key and asks for confirmation again.
- **State this limit in the README and the report:** the biometric prompt is a check **on the device only**. A server-verified transaction PIN would be stronger and is a production upgrade.

**Stage B gate:** new script `scripts/test-phase5-extras.ts` (`npm run test:extras`) proves:
- RLS isolation of saved recipients, and that direct client inserts are denied
- `add_saved_recipient` rejects nonexistent, inactive and own accounts, and never leaks names
- the per-user limits work
- the statement's opening + sum of rows = closing balance (it reconciles)
- a non-owner can't fetch another user's statement

Also required:
- a manual demo of the hide toggle, the biometric gate and the password fallback (screenshots)
- all earlier tests still pass

---

## Stage C — Scheduled & recurring payments + simulated bill pay

This is the **highest money-integrity risk** in the phase. Test it the most.

### C.1 Schema (migration)
- **Allow a system profile.**
  - Change the `profiles.role` check to allow `'system'`: drop the existing check constraint and recreate it in the **new** migration.
  - `is_admin()` stays `role = 'admin' and status = 'active'`.
- **Biller account owner.**
  - The seed creates one **system** auth user (e.g. `billers@system.davaobank.invalid`, random password, banned from signing in via the Admin API) with `role = 'system'`.
  - This user owns the biller settlement accounts.
  - System accounts are excluded from customer-facing lists. Dashboard balance totals label them "includes biller settlement accounts".
- **`billers`:**
  - columns: `id uuid pk`, `name text unique not null`, `category text check (category in ('electricity','water','internet','mobile','other'))`, `account_id uuid unique not null → accounts(id)`, `reference_label text not null` (e.g. "Customer number"), `reference_pattern text not null` (a regex, e.g. `^[0-9]{10}$`), `is_active boolean default true`, `created_at`
  - RLS: authenticated users can `select` where `is_active`; admins can `select` all; no client writes.
- **Seed only made-up billers**, never real companies:
  - **Mindanao Power Co. (demo)**
  - **Bayanihan Water (demo)**
  - **Apo Fiber Internet (demo)**
  - **Durian City Mobile (demo)**
- **`bill_payments`:**
  - columns: `id`, `transaction_id uuid unique not null → transactions`, `biller_id`, `payer_account uuid`, `biller_reference text`, `created_at`
  - RLS: the payer (via account ownership) or an admin can `select`; no client writes.
- **`scheduled_payments`:**
  - columns:
    - `id uuid pk`, `owner_id → profiles`, `from_account → accounts`
    - `kind text check (kind in ('transfer','bill'))`, `to_account uuid null`, `biller_id uuid null`, `biller_reference text null`
    - `amount bigint check (amount > 0)`, `note text`
    - `frequency text check (frequency in ('once','weekly','monthly'))`
    - `start_date date`, `end_date date null`, `max_runs int null check (max_runs > 0)`, `runs_done int default 0`, `next_run_date date`
    - `status text check (status in ('active','completed','cancelled'))`
    - `created_at`, `updated_at`
  - Consistency checks: `kind='transfer'` ⇒ `to_account` is set and `biller_id` is null; `kind='bill'` ⇒ `biller_id` and `biller_reference` are set.
- **`scheduled_payment_runs`:**
  - columns: `id`, `schedule_id → scheduled_payments`, `run_date date`, `status text check (status in ('completed','failed'))`, `transaction_id uuid null`, `failure_reason text null`, `created_at`
  - **`unique (schedule_id, run_date)`** — this is what guarantees each run executes only once.
- **RLS for both schedule tables:** the owner can `select` their own; admins can `select` all; **no client writes** (all writes go through functions).

### C.2 One money engine (refactor, don't duplicate)
- **Move the transfer logic into an internal core:**
  ```sql
  _transfer_core(p_actor uuid, p_from uuid, p_to uuid, p_amount bigint,
                 p_idempotency_key text, p_reference text, p_tx_type text default 'transfer')
  ```
  It contains every existing step:
  - idempotency pre-check, plus the replay-on-`unique_violation` handling
  - validation, including **the actor's profile must be active** (the Phase 4 fix)
  - the actor must own `p_from`
  - deterministic `FOR UPDATE` locks
  - balance check under the lock
  - balanced ledger entries, the transfers row, audit and notifications
- **`_transfer_core` must be revoked** from `public, anon, authenticated`. It takes an arbitrary actor, so client access would be a critical hole.
- **`transfer()` becomes a thin wrapper** that passes `auth.uid()` as the actor. Its behavior, errors and signature stay the same, and **`npm run test:money` must still pass unchanged**.
- Also harden the Phase 3 edge case: on the insufficient-funds path, re-check the idempotency key first, so a simultaneous duplicate gets the replay instead of an "insufficient funds" error.

### C.3 Functions
- **`pay_bill(p_from_account, p_biller_id, p_biller_reference, p_amount, p_idempotency_key)`** (granted to authenticated):
  - The biller must be active.
  - The reference must match `reference_pattern`.
  - Calls `_transfer_core(auth.uid(), from, biller.account_id, …, p_tx_type => 'transfer')` with the reference `'Bill: <biller> · <ref>'`, then inserts `bill_payments` **in the same transaction**.
  - Optional: add `'bill_payment'` to the `transactions.type` check (new migration) so bills are their own type; if so, update the history filters.
- **`create_scheduled_payment(...)`** (granted to authenticated):
  - The owner must own `from_account`, and their profile and the account must be active.
  - The destination or biller is validated the same way as the immediate flow.
  - `start_date` is today or later in **Asia/Manila**.
  - Amount limits are the same as transfers.
  - At most **20 active schedules per user**.
  - Sets `next_run_date = start_date`.
  - Audited.
- **`update_scheduled_payment(p_id, p_amount, p_next_run_date, p_end_date, p_max_runs)`** (owner only, future runs only, audited).
- **`cancel_scheduled_payment(p_id, p_reason)`** (owner or admin; audited; notifies the owner if an admin cancels).
- **`run_due_scheduled_payments()`** — the executor. **Revoked from clients.**
  - Selects `status='active' and next_run_date <= (now() at time zone 'Asia/Manila')::date`, using `FOR UPDATE SKIP LOCKED`.
  - For each schedule, inside its own sub-block (`BEGIN … EXCEPTION`) so one failure doesn't roll back the others:
    1. Insert a `scheduled_payment_runs` row for `(schedule_id, next_run_date)`. **If it already exists, skip.**
    2. Execute via `_transfer_core(owner_id, …)`, or the bill path, with idempotency key **`sched:<schedule_id>:<run_date>`**.
    3. On success: record `completed` + `transaction_id`.
    4. On failure (insufficient funds, inactive account or profile, inactive biller): record `failed` + reason and notify the owner. **No automatic retry.**
    5. Advance `next_run_date`:
       - weekly = +7 days
       - monthly = `start_date + (runs_done+1) months`, which clamps to month-end without the date drifting
    6. Increment `runs_done`.
    7. Set `completed` when past `end_date`, when `max_runs` is reached, or after a `once` run.
  - **Catch-up policy for missed days:** at most one run per schedule per executor pass, oldest first, each recorded with its scheduled `run_date`. Document this.
  - **No holiday calendar in the prototype:** runs happen on calendar dates. Say so in the UI copy.
- **Cron.**
  - Enable `pg_cron` and schedule the executor every 5 minutes:
    ```sql
    select cron.schedule('davao-run-schedules', '*/5 * * * *', 'select public.run_due_scheduled_payments()');
    ```
  - On the hosted project, the owner may need to enable `pg_cron` in the dashboard (Database → Extensions). **Verify this works and document it.**
- **`admin_run_due_schedules_now()`** (admin-only, audited): runs the executor on demand, for demos and tests.

### C.4 Mobile
- **Pay bills** (Home tile, `orange` or another tile color per the grid):
  1. Pick a biller (grouped by category, searchable).
  2. Enter the reference, labeled with the biller's `reference_label`, validated inline.
  3. Enter the amount.
  4. Choose **When:** Now / Later (date) / Recurring (weekly or monthly, with an end date or a run count).
  5. Review.
  6. Biometric confirmation.
  7. Result. "Now" shows a paid receipt. Later and Recurring show **"Scheduled for <date>"**; never "sent" or "paid".
- **Transfers can be scheduled too:** on the Review step, a "When" selector (Now / Later / Recurring).
- **Scheduled** (Home tile + Profile → Scheduled payments):
  - a list of upcoming payments (next date, amount, recipient or biller, frequency)
  - a detail view with run history and the status of each run (completed / failed with reason)
  - edit future runs, cancel (with confirmation)
- **Home:** an "Upcoming payments" strip when any schedules are active.
- **Activity:** a Bills filter chip. Scheduled runs appear as normal transactions once executed.

### C.5 Admin
- **Schedules page:** filterable list, a detail drawer with runs, cancel (`ConfirmDialog` + reason), and "Run due schedules now".
- **Billers page:**
  - List all billers.
  - Create a biller with `admin_create_biller(p_name, p_category, p_reference_label, p_reference_pattern)` — admin only, audited; it creates the biller's settlement account under the system profile.
  - Activate or deactivate billers.

**Stage C gate:** `scripts/test-phase5-schedules.ts` (`npm run test:schedules`) proves:
- the `_transfer_core` refactor didn't change transfer behavior (`test:money` still passes)
- `_transfer_core`, `run_due_scheduled_payments` and `write_audit` **are not callable** by customer or anon clients
- **each run executes exactly once**, even when the executor is called repeatedly and concurrently
- insufficient funds, frozen accounts and suspended profiles produce a recorded **failed** run, with no partial ledger writes
- cancelling while the executor runs never leaves a cancelled schedule executed afterwards
- monthly date math is right (e.g. a 31st start date runs on 28/29 Feb, then back on 31 Mar)
- bill references are validated
- `bill_payments` is linked one-to-one to its transaction
- **ledger reconciliation holds after all scheduled and bill runs**

---

## Stage D — QR send & request money (Davao Bank users only)

### D.1 QR format
- Payload: `davaobank://pay?v=1&acct=<10-digit account number>&amt=<centavos, optional>&note=<urlencoded, optional, max 60 chars>`.
  - Register the `davaobank` scheme in `app.json`.
  - Account numbers aren't secret, so the QR is unsigned.
- **Scanning never sends money automatically.** It always opens a filled-in Transfer at the Review step, followed by biometric confirmation.
- **Reject anything else** with "This isn't a Davao Bank QR code": other schemes, an unknown `v`, a malformed account number, or a non-positive or over-limit amount.
- Not supported: QR Ph interoperability, ATM QR, deposit-machine QR.

### D.2 Mobile
- **QR hub** (Home tile `QR`) with two tabs:
  - **My QR:**
    - choose one of your accounts
    - optional amount and note
    - renders with `react-native-qrcode-svg`
    - shows the account number in text below the code
    - shows a "Davao Bank users only" note
  - **Scan:**
    - uses `expo-camera` (`CameraView` with QR barcode scanning)
    - explains why camera permission is needed before asking
    - if permission is denied, shows clear guidance and a "Type account number instead" fallback
    - torch toggle
- **Request money** (from the QR hub, and from Transfer as "Request instead"):
  1. Enter the payer's account number, the amount and an optional note.
  2. Review, then send.

### D.3 Payment requests
- **Table `payment_requests`:**
  - columns:
    - `id uuid pk`
    - `requester_id → profiles`, `requester_account → accounts`
    - `payer_account_number text`, `payer_user_id uuid` (resolved on the server)
    - `amount bigint check (amount > 0)`, `note text check (char_length(note) <= 60)`
    - `status text check (status in ('pending','paid','declined','cancelled','expired'))`
    - `transaction_id uuid unique null`
    - `expires_at timestamptz default now() + interval '7 days'`
    - `created_at`, `responded_at`
  - RLS: the requester or the payer can `select`; **no client writes**.
- **Functions** (granted to authenticated unless noted; all audited):
  - **`create_payment_request(p_requester_account, p_payer_account_number, p_amount, p_note)`:**
    - the caller owns the requester account and is active
    - the payer account exists, is active and isn't the caller's own
    - at most **10 requests per user per day**
    - notifies the payer
    - **never reveals the payer's name to the requester, or the requester's name to the payer** — account numbers only
  - **`pay_payment_request(p_request_id, p_from_account, p_idempotency_key)`:**
    - the caller must be the payer
    - **lock the request row `FOR UPDATE`**
    - it must be `pending` and not expired
    - call `_transfer_core(auth.uid(), from, requester_account, amount, key, 'Request: <note>')`
    - set `status='paid'`, `transaction_id`, `responded_at` **in the same transaction**, so a request can be paid at most once
    - notify the requester
  - **`decline_payment_request(p_id)`** (payer only) and **`cancel_payment_request(p_id)`** (requester only).
  - **Expiry.** Treat pending requests past `expires_at` as expired when they're read or paid. Add a daily cron job that marks them expired (internal function, revoked from clients).
- **Inbox — a "Requests" section:**
  - Incoming requests show **Pay** (opens Review with the amount filled in → biometric → result) and **Decline**.
  - Outgoing requests show their status and **Cancel**.
- **Admin:** a read-only requests list on the Transactions page (a filter or tab).

**Stage D gate:** `scripts/test-phase5-qr-requests.ts` (`npm run test:qr`) proves:
- QR payload parsing accepts valid codes and rejects malformed, foreign, oversized and negative ones (unit tests)
- **a request can be paid only once**, even with concurrent pay attempts
- non-payers can't pay a request
- expired, declined and cancelled requests can't be paid
- the daily limit is enforced
- no names leak through any request function
- reconciliation still holds

Also required: a manual demo — My QR → scan on a second device or emulator → filled-in Review → biometric → paid. Plus the camera-permission-denied fallback.

---

## Stage E — FX reference-rate chart (view only) + integration polish

### E.1 Data
- **Source:** **Frankfurter**, an open API that publishes European Central Bank reference rates.
  - **Before building, confirm the current endpoint and response format from its official documentation**, and confirm that PHP is supported and what attribution it requires.
  - Record all three in the README. Do not hardcode an unverified URL.
- **Table `fx_rates`:**
  - columns: `base text`, `quote text`, `rate_date date`, `rate numeric(18,8)`, `source text`, `fetched_at timestamptz`
  - primary key `(base, quote, rate_date)`
  - RLS: authenticated users can `select`; writes only via the Edge Function using the service role
- **Edge Function `fx-sync`:**
  - Fetch **USD→PHP** to start. EUR→PHP and JPY→PHP are optional if the source supports them.
  - First run: **backfill 1 year** of daily rates. After that, run **daily**.
  - Upsert into `fx_rates`; handle source errors without failing silently.
  - Schedule it daily with `pg_cron` (via `pg_net`) or Supabase's scheduled-function support. Document which you used.
- **The app reads only from `fx_rates` and never calls the external API directly.**
- **No conversion, quotes, trading or alerts.** The app stays single-currency (PHP).

### E.2 Mobile
- **Home "Currency watch" card**, placed below the tiles:
  - latest USD/PHP rate (4 decimals)
  - change against the previous rate date (+/−, with text, not color alone)
  - the rate date
  - opens the FX screen
- **FX screen:**
  - pair selector (pairs with data only)
  - period chips **1W · 1M · 3M · 1Y**, using daily points
  - **No 1D chip.** The source is daily only, so show a note saying intraday isn't available rather than inventing rates.
  - line chart, using `react-native-svg` or a lightweight Expo-compatible chart library (justify your choice)
  - a tooltip or scrubber showing date + rate; a VoiceOver/TalkBack summary such as "USD to PHP, 1 month, from 56.12 to 57.40"
- **Always-visible label:** **"Reference rate — not a Davao Bank rate."** Plus a source line (e.g. "Source: ECB reference rates via Frankfurter · updated <date>").
- **States:**
  - loading skeleton
  - no data yet
  - source unavailable (show the last cached date)
  - weekends and holidays skipped (gaps are expected)

### E.3 Integration polish (absorbs the original "Integration" phase)
- **End-to-end consistency across all features:**
  - error messages turn server exceptions into friendly, actionable copy
  - every money flow ends in a clear result: completed / scheduled / failed, never vague
  - empty states for every list
  - pull-to-refresh where data changes
  - Inbox unread counts update after actions
- **Final Home and Profile:**
  - Home grid in its **final 3×2** form: **Transfer · Pay bills · QR · Cash-in · Cash-out · Scheduled**.
  - Profile menu: Personal details · Saved recipients · Scheduled payments · Security · About.
- **Admin dashboard:** add KPIs for active schedules, failed runs in the last 7 days, and pending payment requests.

**Stage E gate:** `scripts/test-phase5-fx.ts` (`npm run test:fx`) proves:
- RLS on `fx_rates` (customers can read, can't write)
- the sync upserts idempotently (no duplicate dates)
- the backfill covers about 1 year
- each period returns the expected date ranges

Also required:
- screenshots of the chart in every state
- **the full regression suite**: `test:rls`, `test:money`, `test:admin`, `test:extras`, `test:schedules`, `test:qr`, `test:fx`, all passing against the named database
- final ledger reconciliation
- every quality check
- the secret-leak check

---

## Final completion criteria (whole phase)
1. Stage 0 complete: the Phase 4 fixes are verified against a live database, and the Phase 3 concurrency and reconciliation tests pass.
2. Both apps are fully redesigned on the shared design system (Kadayawan tokens, Plus Jakarta Sans, Lucide). Hardcoded-hex grep is 0, and no inline styles remain in admin.
3. All eight features work end to end, with the rules above:
   - saved recipients
   - own-account shortcut
   - statements
   - hide balance
   - biometric confirmation
   - scheduled/recurring payments
   - simulated bill pay
   - QR send & request
   - FX reference chart
4. All money features run through the single `_transfer_core` engine. Internal functions are revoked from clients. Each scheduled run executes exactly once; each request is paid at most once.
5. Every suite from Stages 0–E passes against a named live database. **Ledger reconciliation holds at the end:** per-account balance = ledger sum, and global credits = debits.
6. Accessibility checked: contrast, 130% text, screen-reader labels, Reduce Motion, touch targets.
7. Typecheck, lint, format:check, `build:admin`, `expo export` and the secret-leak check all pass.
8. `PHASE5_REPORT.md` holds every stage's entry with its full output, plus the lists of missing brand assets, added dependencies and any deviations.

## Do NOT
- Edit earlier migrations, weaken any RLS policy, or grant client access to internal functions.
- Add other banks or e-wallets, real FX conversion, card controls, ATM/deposit-machine QR, investments, installments, FX alerts, account groups, branch appointments, trusted devices, or holds. **These are excluded.**
- Use real company names, the reference app's branding, or any traced or recreated version of the Kadayawan logo.
- Show a person's name for a counterparty anywhere.
- Label a scheduled payment as "sent" or "paid" before its run completes.

*The reviewer will review each stage commit separately. That means running the migrations and every test suite against a live database, checking the screenshots against the design system and the Figma file, and diffing server-call sites — not relying on this report's summary.*
