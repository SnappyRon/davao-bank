# Davao Bank — Scope Change Record 01: Feature Additions

**Date:** 2026-10-23 · **Requested by:** Project Owner · **Recorded by:** PM / Technical Lead
**Status:** Approved by the Project Owner. The proposal document (v1.1) still needs updating to match.
**Source:** a reference analysis based on BDO Online screenshots. It was written without access to this app, so its "current app" column was blank; the feature checks below were made against the actual codebase.

---

## 1. Decisions

| #   | Item                                                                                                                                                   | Decision                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Visual system in the reference doc (navy `#15263B`, teal `#159988`, Inter)                                                                             | **Rejected.** Keep the approved Kadayawan palette, Mt. Apo Green as the main color, and Plus Jakarta Sans (Figma mockup + Phase 4R prompt). |
| D2  | 5-tab navigation (Home · Accounts · FX · Cards · More)                                                                                                 | **Rejected.** Keep the 4 tabs: Home · Activity · Inbox · Profile. New features go on Home tiles/cards, in flows and in Inbox (§4).          |
| D3  | Other banks & e-wallets (InstaPay, PESONet, GCash), real currency conversion, card controls, ATM / deposit-machine QR, investments, installment offers | **Excluded.** These need real payment networks or a card processor, or (card controls) would switch nothing. Listed as production-only.     |
| D4  | Bill payment (previously Out of Scope, §4.2)                                                                                                           | **Now in scope, simulated only** — made-up billers, no external settlement.                                                                 |
| D5  | Multiple currencies / FX (previously Out of Scope, §4.2)                                                                                               | **Partly in scope: a view-only reference-rate chart.** The app stays single-currency (PHP). No conversion and no FX transactions.           |

## 2. Feature check against the codebase (2026-10-23)

| Feature                                                            | Before this change                                                                                    |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Multiple accounts per user, accounts list                          | ✅ exists                                                                                             |
| Transfer to any Davao Bank account by number                       | ✅ exists                                                                                             |
| Duplicate-payment protection (idempotency)                         | ✅ exists                                                                                             |
| Saved recipients, statements, hide balance, biometric confirmation | ❌ not built                                                                                          |
| Scheduled transfers, bill pay, QR, FX                              | ❌ not built                                                                                          |
| Holds / pending balances                                           | ❌ not used — "available vs current balance" **deferred** (the two figures would always be identical) |

## 3. Added scope, by phase

### Phase 5 — Everyday extras

- **Saved recipients and an own-account shortcut.**
  - New `saved_recipients` table holding owner, account number and nickname. RLS lets only the owner read or write it; each recipient is unique per owner.
  - Before saving, a server function confirms the number is a valid active Davao Bank account. It must not reveal the account holder's name.
  - Account-number enumeration is an accepted prototype risk; add a simple rate limit.
- **Statements.**
  - The user picks an account and a date range.
  - CSV and PDF are generated from `get_account_transactions` (PDF on-device via a print/share module), with the statement period, opening/closing balance, the disclaimer and the logo credit.
- **Hide/reveal balance.**
  - An eye toggle on the balance card and the accounts list.
  - The choice is a local preference that persists across launches; balances are shown by default.
  - Amounts are masked as `₱••••••`, and screen readers announce "balance hidden".
- **Biometric confirmation before money moves** (transfer, cash-out, bill pay, scheduled-transfer creation).
  - Uses Face ID / fingerprint, falling back to the device passcode.
  - If the device has no lock, the user re-enters their account password (verified by Supabase Auth).
  - **Limit, stated honestly:** the biometric prompt is a check on the device, not on the server. A server-verified transaction PIN would be stronger and is noted as a production upgrade.

### Phase 6 — Scheduled & recurring transfers + simulated bill pay

- **Schedules.**
  - Run once on a date, or repeat weekly or monthly with an end date or number of runs.
  - The user sees an upcoming-payments list and can edit or cancel any future run.
  - Each run shows a clear status: scheduled → completed / failed / cancelled.
- **Execution engine.**
  - A server-side scheduled job (Supabase `pg_cron` — confirm it's available on the hosted project) calls an internal `SECURITY DEFINER` executor.
  - The executor runs with **no user session**. It must therefore verify the schedule's owner and the source account itself, and must **not** reuse the session-based ownership check in `transfer()`.
  - Each run uses the idempotency key `sched:<schedule_id>:<run_date>`, so it can never execute twice.
  - Insufficient funds or an inactive account → mark the run failed, notify the owner, no automatic retry.
  - Time zone is Asia/Manila. There is no holiday calendar in the prototype; this is shown in the UI copy.
- **Simulated bill pay.**
  - Billers are **made-up** companies (e.g. "Mindanao Power Co. (demo)"). **No real company names.**
  - Each biller is a system-owned Davao Bank account with `is_biller = true` and a reference-number format.
  - Paying a bill is a ledger transfer to the biller account with the biller reference attached, so it inherits atomicity, idempotency and audit.
  - Supports now, later and recurring (using the schedule engine).
- **Admin.**
  - A schedules list, read-only, plus the ability to cancel a schedule (audited).
  - A billers list, managed by admins.
- **Tests (mandatory).** Run-once-only under repeated cron runs, failure handling, cancellation races, and ledger reconciliation after scheduled runs.

### Phase 7 — QR send & request (Davao Bank users only)

- **My QR.**
  - Shows a QR code holding a deep link with the account number and an optional amount.
  - Account numbers aren't secret, so the QR isn't signed. **Scanning never sends money automatically** — it always opens a filled-in transfer that goes through review and biometric confirmation.
- **Scan.**
  - Uses the camera, with a clear permission explanation and a fallback to typing the number.
  - QR codes that aren't from Davao Bank are rejected with a clear message.
- **Request money.**
  - New `payment_requests` table: requester account, payer account, amount, note, status (pending / paid / declined / expired / cancelled) and a 7-day expiry.
  - The payer sees the request in Inbox and can Pay or Decline.
  - Paying links the request to the transfer **atomically**, so a request can be paid only once.
  - Limit how many requests a user can send per day, to prevent spam.
- **Not included:** the national QR Ph standard, ATM and deposit-machine QR (D3).

### Phase 8 — FX reference chart (view only) + integration polish

- **Data source.**
  - USD/PHP first, then other pairs the source supports.
  - Data comes from **Frankfurter**, which serves European Central Bank reference rates. Verify the exact API address, PHP coverage and the attribution/terms before building.
  - A **Supabase Edge Function** fetches the rates and caches them daily into an `fx_rates` table. The app reads only from our database and never calls the outside service directly.
- **Chart.**
  - Periods 1W / 1M / 3M / 1Y using daily points. **No 1D view**, because the source is daily only; the UI says so instead of inventing intraday rates.
  - Tooltip on each point; a "last updated" date; a source line.
  - The label **"Reference rate — not a Davao Bank rate"** is always visible. There is no conversion or trade button.
  - Shows clear states for no data, source unavailable, and weekends/holidays (data skips non-trading days).
- **Integration polish.** The original Phase 5 scope: end-to-end wiring, consistent error handling, and edge cases across all features.

## 4. Navigation (D2) — where the new features live

- **Home tiles** become 6 in a 3×2 grid: **Transfer · Pay bills · QR · Cash-in · Cash-out · Scheduled**.
  - The **Activity** tile is removed because it duplicated the Activity tab.
  - Tile colors are reused from the Kadayawan set. Each tile keeps its text label, so no tile relies on color alone.
- **Home:**
  - An eye toggle on the balance card (hide balance).
  - A small **"Currency watch"** card below the tiles that opens the FX chart.
  - An "Upcoming payments" strip appears when schedules exist.
- **Transfer flow, step 1:** saved recipients, plus "My accounts" for the own-account shortcut.
- **Activity:** an "Export statement" action.
- **Inbox:** incoming payment requests, with Pay / Decline.
- **Profile:** Saved recipients, Scheduled payments, Security (biometric setting), About.

## 5. Deferred (not in this build)

FX rate alerts (they need push notifications and a background job), account groups, branch appointments, service requests, quick-action personalization, trusted devices, and holds / available-vs-current balance.

## 6. Impact

- **Timeline:** about 10 weeks becomes **about 14–15 weeks**. Old Phases 5/6/7 become Phases 8 (merged), 9 and 10.
- **Risk:** scheduled execution and bill pay are the largest new risk to money integrity. They get their own reconciliation and concurrency tests, and live-database verification is mandatory for sign-off.
- **New dependencies:**
  - Mobile: device authentication, camera/QR scanning, QR rendering, print/share for PDF statements.
  - Server: `pg_cron` and one Edge Function.
  - Outside service: Frankfurter / ECB reference rates.
- **Documents to update:**
  - Proposal v1.1 → v1.2: §4.1 and §4.2 scope, §8 phases and milestones, §11 risks, §13 metrics.
  - The Figma mockup: Home tiles, the new screens.
  - An amendment to the Phase 4R prompt (6-tile grid support).

## 7. Order of work (unchanged rule: one phase at a time, reviewed before the next)

Phase 4 fixes → review → Phase 4R redesign → review → Phase 5 → 6 → 7 → 8 → 9 → 10.
