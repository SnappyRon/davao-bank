> **⚠️ SUPERSEDED (2026-10-23)** — do not hand this file to the coding agent. Its full content is now Stage A of `Phase-5-Prompt-Redesign-and-Feature-Expansion.md`. Kept for history only.

# Davao Bank — Redesign Phase (4R): UI/UX Redesign Prompt

**Hand this entire file to your coding agent — but only after the Phase 4 fixes are reviewed and approved.** The fixes touch the same mobile and admin files; running both at once will cause conflicts.

This is a **visual and UX redesign only**. It changes how the app looks, flows and feels. It does **not** change the database, RLS, money functions, server actions, idempotency handling or any business logic. Every feature that works today must still work, with the same data and the same server calls.

**Inspiration vs. branding vs. function:**

- The reference app (_Clucky — Loud Alarm Clock_) defines the **design quality**: bold type, generous spacing, chunky rounded components, one strong accent, a colorful action-tile grid, smooth feedback.
- The **official Kadayawan 2026 logo and its colors** define the **branding** (used with the owner's permission from the Davao City Tourism Operations Office).
- The **existing Davao Bank app** defines the **functionality**. Do not copy the reference app's colors, logo, mascot, illustrations, copy, streaks or gamification.

---

## 1. What to review first

- The current UI: `apps/mobile/App.tsx`, every file in `apps/mobile/src/screens/`, `apps/admin/src/app/**`, `apps/admin/src/components/AdminNav.tsx`, `apps/admin/src/app/globals.css`, and `packages/shared/src/theme/colors.ts`.
- The data/logic you must keep calling unchanged: `packages/shared/src/supabase/client.ts` (RPC callers, `generateIdempotencyKey`, `formatCentavosToPHP`) and `apps/admin/src/app/actions.ts`.
- `apps/admin/AGENTS.md`: this Next.js version has breaking changes — read the relevant guide in `node_modules/next/dist/docs/` before using `next/font` or changing layouts.
- If anything here conflicts with existing behavior, **stop and flag it** rather than changing logic.

## 2. Brand assets (supplied by the project owner)

- Expected files, placed in `packages/shared/assets/brand/`:
  - `kadayawan-logo-mark.svg` — the diamond mark (four tiles).
  - `kadayawan-logo-horizontal.svg` — the horizontal lockup.
  - `app-icon-1024.png` — 1024×1024 app icon.
- **If a file is missing, do not trace, redraw or crop the logo from a screenshot.** Use a clearly labeled placeholder (a neutral rounded square with the text "LOGO") and list the missing files in your report.
- Use the **diamond mark alone** for the app icon, favicon, splash and small sizes (the illustrations lose detail when small). Use the horizontal lockup only where it has room (welcome screen, admin sidebar header, About).
- Never recolor, stretch, rotate, add effects to, or crop the logo. Keep clear space around it of at least ¼ of its height.
- Add a credit line on the mobile **About** screen and the admin footer: _"Kadayawan logo used with permission of the Davao City Tourism Operations Office."_

## 3. Design system (build this first, in `packages/shared/src/theme/`)

Both apps must take every color, type size, spacing value, radius and motion value from these tokens. No hardcoded values in screens.

### 3.1 Colors — from the official logo, contrast-checked

Replace the current palette values. Keep existing token **names** where the meaning still fits (so call sites keep working), add the new ones, and let `npm run typecheck` catch anything renamed. Update `coreColorSwatches` to describe the five logo colors.

| Token            | Value                          | Use                                                                                              |
| ---------------- | ------------------------------ | ------------------------------------------------------------------------------------------------ |
| `primary`        | `#0C6D38` (Mt. Apo deep green) | Main buttons, active tab, links, focus ring, credit amounts. Passes AA as text on white (6.4:1). |
| `primaryPressed` | `#09552B`                      | Pressed state                                                                                    |
| `primaryTint`    | `#E3F2E8`                      | Selected chips, soft highlights                                                                  |
| `green`          | `#03AA56`                      | Fills only (Cash-in tile, success icon)                                                          |
| `red`            | `#EF2D23`                      | Fills only (error icon, destructive button fill)                                                 |
| `redText`        | `#C8102E`                      | Error text, destructive text (AA 5.9:1)                                                          |
| `orange`         | `#FD4B12`                      | Fills only (Cash-out tile)                                                                       |
| `orangeText`     | `#C2410C`                      | Warning text (AA 5.2:1)                                                                          |
| `yellow`         | `#FEAD0B`                      | Fills only, **always with `ink` text/icons on top** (fails as text on white)                     |
| `blue`           | `#0099C8`                      | Fills only (Transfer tile, info icon)                                                            |
| `blueText`       | `#006E94`                      | Info text, secondary links (AA 5.7:1)                                                            |
| `ink`            | `#1A1A1A`                      | Primary text, debit amounts                                                                      |
| `textSecondary`  | `#5C5A55`                      | Secondary text                                                                                   |
| `textMuted`      | `#8A877F`                      | Placeholders and non-essential hints only                                                        |
| `canvas`         | `#F7F5F0`                      | App background (warm off-white)                                                                  |
| `surface`        | `#FFFFFF`                      | Cards, sheets                                                                                    |
| `surfaceSubtle`  | `#EFECE6`                      | Inputs, inactive chips                                                                           |
| `border`         | `#E4E0D8`                      | Dividers, card outlines                                                                          |

Rules:

- **One accent:** green is the only color for primary actions and active states. Red, orange, yellow and blue appear **only** in the action tiles, transaction-type icons, status badges and alerts.
- **Money colors:** incoming amounts `+₱1,000.00` in `primary`; outgoing amounts `−₱1,000.00` in `ink` (not red — red means "error"). Always show the sign.
- White text on `green`/`blue`/`orange` fills is allowed only for **bold text ≥ 18px** or icons (they pass the 3:1 large-text/UI threshold, not 4.5:1). On `yellow`, always use `ink`.
- Light mode only for this phase. Dark mode is out of scope.

### 3.2 Typography

- Family: **Plus Jakarta Sans** (Google Fonts, OFL licence) — mobile via `@expo-google-fonts/plus-jakarta-sans` + `expo-font`; admin via `next/font/google`. Do not use the Kadayawan script lettering for UI text.
- Scale (size/line-height, weight):

| Token     | Size / line              | Weight | Use                            |
| --------- | ------------------------ | ------ | ------------------------------ |
| `display` | 40/44, letter-spacing −1 | 800    | Balance figure, success amount |
| `h1`      | 28/32, −0.5              | 800    | Screen titles                  |
| `h2`      | 22/28, −0.3              | 700    | Section titles                 |
| `title`   | 18/24                    | 700    | Card titles, tile labels       |
| `body`    | 16/24                    | 500    | Body text                      |
| `label`   | 14/20                    | 600    | Buttons, chips, form labels    |
| `caption` | 12/16                    | 500    | Timestamps, helper text        |

- **All money and account numbers use tabular figures** (`fontVariant: ['tabular-nums']` on mobile, `font-variant-numeric: tabular-nums` on web) so digits line up and don't jump when they change.
- Use only these weights (500/600/700/800). Replace the current mix of 500–900.

### 3.3 Spacing, shape, elevation

- Spacing scale (4-pt): `4, 8, 12, 16, 20, 24, 32, 40, 48`. Screen side padding 20. Space between cards 12–16. Space between sections 32.
- Radius: `sm 10` (inputs, badges), `md 16` (list rows, small cards), `lg 24` (main cards, tiles), `xl 32` (bottom sheets, top corners), `pill 999` (buttons, chips).
- Elevation: mostly flat with `border` outlines. One soft shadow only for floating elements (bottom sheets, toasts, tab bar).

### 3.4 Motion & feedback

- Use `react-native-reanimated` (mobile) and CSS transitions (admin).
- Press: scale to 0.97 in ~100 ms on buttons, tiles and rows.
- Sheets and screen transitions: 220–280 ms ease-out. No bounces, parallax or looping animations.
- Balance count-up when the value changes: ≤ 600 ms, once.
- Success: a check-mark draw-in on the completed-transfer screen (≤ 500 ms).
- Haptics (`expo-haptics`): light tap on primary actions, success notification on a completed money operation, error notification on failure.
- **Respect Reduce Motion** (`useReducedMotion` / `prefers-reduced-motion`): replace motion with instant changes or simple fades.

### 3.5 Icons

- One icon set across both apps: **Lucide** (`lucide-react-native` + `react-native-svg` on mobile, `lucide-react` on admin). Stroke 2, sizes 20/24/28.

### 3.6 Shared components (build before screens)

- **Mobile** (`apps/mobile/src/components/`): `Screen`, `Text` (variant-based), `Button` (primary/secondary/ghost/destructive, loading state, full-width pill), `Card`, `ActionTile`, `AmountText`, `ListRow`, `TransactionRow`, `Chip`/`FilterChips`, `TextField` (label, helper, error), `AmountInput`, `BottomSheet`, `Badge`, `EmptyState`, `Skeleton`, `Toast`.
- **Admin** (`apps/admin/src/components/ui/`): `Button`, `Card`, `StatTile`, `Badge`, `Input`, `Select`, `Table` (sticky header, right-aligned tabular amounts), `Drawer`, `ConfirmDialog`, `PageHeader`, `FilterBar`, `EmptyState`, `Skeleton`, `Toast`.
- Admin styling: move from inline `style={{…}}` to **CSS Modules + CSS variables** generated from the shared tokens (no new CSS framework).

## 4. Mobile redesign (customer app)

### 4.1 Navigation

- Replace the single stack + modal-everything structure with a **bottom tab bar** of four tabs: **Home · Activity · Inbox · Profile**. The Inbox tab shows an unread badge.
- Money flows (Transfer, Cash-in, Cash-out) open as **full-screen stack flows** from Home, with a clear back/close and step indicator.
- Keep the existing auth gating: unauthenticated → auth screens; unverified → verify-email; suspended → suspended screen; otherwise → tabs.
- Split the 1,133-line `HomeScreen` into the new screens and components. No screen file over ~350 lines.

### 4.2 Screens

- **Welcome / Login / Sign up / Verify email / Forgot password:** horizontal logo on welcome; one bold headline; pill buttons; inline field errors; keyboard-aware layout. Same Supabase calls as today.
- **Home:**
  - A greeting row with the logo mark.
  - A **balance hero card**: total balance in `display` with tabular figures, the account number underneath; if the user has several accounts, a horizontal account switcher.
  - A **2×2 action-tile grid** echoing the logo's four tiles: **Transfer** (`blue`), **Cash-in** (`green`), **Cash-out** (`orange`), **Activity** (`yellow`, ink text).
  - **Recent activity**: the last 5 transactions plus a "See all" link.
  - **Remove** the developer health-check and palette-swatch panels from the customer UI (keep the health check only in development builds, behind `__DEV__`).
- **Activity:** full history from `get_account_transactions`, grouped by date (Today, Yesterday, date). Filter chips: All · Transfers · Cash-in · Cash-out · Adjustments · Reversals (include the Phase 4 types). Tap a row → transaction detail (a receipt-style card).
- **Transfer flow:**
  1. Recipient account number, with validation.
  2. Amount: a large `display` amount, preset chips, and the available balance.
  3. Review card.
  4. Confirm.
  5. Success screen: check-mark, amount and receipt.
  - **Keep the existing idempotency behavior exactly** (one key per transfer attempt, reused on retry). Keep the server errors (insufficient funds, frozen account, not found) and show them inline with a retry.
- **Cash-in / Cash-out:** the same amount-screen pattern with presets, review and success.
- **Inbox:** the notifications list with unread styling, mark-read and mark-all-read.
- **Profile (new — this closes a gap from proposal §4.1, "profile view/edit"):**
  - View name, phone and email.
  - **Edit full name and phone** through the existing RLS "update own profile" policy (the Phase 3 guard trigger already blocks role/status changes). Add no migration.
  - Sign out.
  - **About** screen: app version, the logo credit line, and the disclaimer _"Davao Bank is a simulated prototype for academic use. It is not a licensed bank and holds no real money."_
- **Suspended:** restyle to match (calm tone, contact info, sign out).
- **States everywhere:** skeleton loaders for balance and lists (no full-screen spinners), friendly empty states, and error states with retry.
- **App config:** in `app.json` set the name to "Davao Bank", and set the icon, adaptive icon and splash from the brand assets (diamond mark on `canvas`).

### 4.3 Accessibility (mobile)

- Touch targets ≥ 44×44 pt.
- Supports system font scaling up to at least 130% without clipping or overlap.
- `accessibilityLabel` / `accessibilityRole` on icon buttons, tiles and tabs.
- Amounts read naturally (e.g., "fifty thousand pesos").
- Color is never the only signal: amounts keep their +/− sign and statuses keep their text label.

## 5. Admin redesign (staff web app — desktop, tablet, mobile widths)

- **Layout:**
  - A **left sidebar**: horizontal logo, then Dashboard · Users · Accounts · Transactions · Audit, with the active item in `primaryTint` + `primary`.
  - A top bar with the signed-in admin and sign-out.
  - Responsive: icon-only rail at ≤ 1024 px; a menu drawer at ≤ 768 px.
- **Dashboard:**
  - KPI `StatTile`s with large tabular numbers (total system balance, users active/suspended, accounts active/frozen, 30-day volume, transactions/reversals). Use the four tile colors as small icon accents only, not full-color cards.
  - Recent transactions and recent audit activity as tables.
- **Users / Accounts / Transactions / Audit:**
  - Consistent `PageHeader` + `FilterBar` + `Table`.
  - Status `Badge`s with text.
  - Row click opens a right-side `Drawer` with details and actions.
- **Financial and destructive actions** (suspend, freeze/close, adjust balance, reverse): open a `ConfirmDialog` that states the exact effect (e.g., _"Debit ₱500.00 from 1012345678 — new balance ₱49,500.00"_), require a typed reason, and use `destructive` styling where appropriate.
  - Keep calling the same server actions with the same arguments.
  - Keep the Phase 4-fix behavior of one idempotency key per dialog opening.
- **CSV export:** keep the same route; style it as a secondary button with a toast on start.
- Replace inline styles with the CSS-module components.

## 6. Constraints

- **No changes** to `supabase/migrations/`, RLS, SQL functions, `actions.ts` logic, RPC callers, auth/middleware logic or idempotency logic. UI wiring may move between files, but each call's arguments and behavior stay identical.
- No mascot, streaks, gamification, confetti, looping or decorative animation.
- Keep text readable and contrast at WCAG AA per the table in §3.1.
- Add only the dependencies listed here (fonts, reanimated if not present, expo-haptics, lucide + react-native-svg). Use Expo-compatible versions via `npx expo install`.
- Keep the shared package as the single source of truth for tokens; no duplicated hex values in apps (the existing hex-grep check must stay at 0).

## 7. Completion criteria

1. Design tokens and shared components exist and are used by every screen in both apps; the grep for hardcoded hex in `apps/mobile/src` and `apps/admin/src` returns 0.
2. Mobile has the four-tab navigation, and every listed screen is redesigned, including the new Profile/About and the restyled auth and suspended screens. The developer panels are hidden from production builds.
3. Admin has the sidebar layout, a responsive behavior at 1440 / 1024 / 768 px, and every page is on the shared components with no inline styles remaining.
4. The logo is placed per §2, or the placeholders plus a list of missing files are reported.
5. **No functional regression:** sign up/login/verify/reset, transfer (including idempotent retry and error paths), cash-in, cash-out, history filters, notifications, and every admin action behave exactly as before.
6. Reduce Motion, 130% font scaling and screen-reader labels are verified.
7. `typecheck`, `lint`, `format:check`, `build:admin`, `expo export` and the secret-leak check pass; `test:rls`, `test:money` and `test:admin` still pass against the database you name.

## 8. Report back for review

Provide:

- The token and component files.
- A before/after **screenshot set**:
  - Mobile: iPhone size and a small Android size — every screen, including empty, loading and error states.
  - Admin: every page at 1440, 1024 and 768 px.
- A list of any brand assets still missing.
- The dependency list you added.
- The verification output from §7.
- Anything you deviated from in this prompt, and why.

_The reviewer will check the screenshots against this design system, re-run the quality and test commands, and diff the server-call sites to confirm no business logic changed._

---

## Amendment A1 (2026-10-23) — prepare for approved future features

Scope Change Record 01 adds features in Phases 5–8. **Do not build them in this phase**, but build the following so those phases don't have to rebuild the UI:

- **Visual reference:** the Figma file _Davao Bank — UI Redesign Mockup_ (`https://www.figma.com/design/cfRZvdUS79QuuG4hOrHIoB`) is the visual reference for this phase. Match its tokens, components and screens. Where the file and this prompt disagree, this prompt wins; flag the difference.
- **Action tile grid:** build it as a data-driven component that lays out **4 tiles as 2×2 and 5–6 tiles as 3×2** with the same spacing. In this phase, ship the current 4 tiles (Transfer · Cash-in · Cash-out · Activity). Phases 5–7 will replace Activity with Pay bills, QR and Scheduled.
- **Balance card:** leave a slot in the card's header row for a future hide/reveal control, but don't add the control yet.
- **Transfer step 1:** structure the recipient step so a "Saved recipients / My accounts" list can be added above the account-number field later.
- **Profile menu:** build the menu from a list so new rows (Saved recipients, Scheduled payments, Security) can be added without restyling.
- Everything else in this prompt stays unchanged: no new features, no business-logic changes.
