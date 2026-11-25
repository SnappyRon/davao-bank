# Phase 9.5 · Crypto wallet demo (stretch)

> **State: DRAFT — do not implement.** Starts only after Phase 9 is accepted, with owner approval of D11 and D16 (`docs/agents/ROADMAP.md`). Skip the whole phase if Phase 9 is late.

## Goal

A clearly labelled, demo-only wallet. A customer converts play pesos into **DVO test**, an SPL token minted by the bank on **Solana devnet**, sees the on-chain confirmation, and converts back. Nothing has real value, and nothing ships in a store build.

## Fixed decisions

- **Network:** Solana devnet. Devnet can be reset, so setup is a re-runnable script.
- **Token:** "DVO test" SPL mint, created by the bank's devnet keypair. Fixed demo rate of ₱1.00 = 1 DVO test. It is never sold, listed, or described as purchasable.
- **Custody:** custodial. Keys live in Supabase Vault and are used only inside Edge Functions. The phone never holds a key.
- **Source of truth:** the internal ledger. The chain is a mirror that is reconciled.
- **Build flag:** `EXPO_PUBLIC_CRYPTO_DEMO=1`. When it is unset, no wallet route, tile or code path is reachable. Every wallet screen shows "Test network — no real value".
- **Money moves:** only through the existing `_transfer_core` path, with no changes to it. The user's account pays an internal "Crypto reserve" account (seeded like the billers account). A refund is a reverse transfer from the reserve with its own idempotency key.

## Conversion state machine (`crypto_conversions` table, outbox)

`requested → reserved → submitted → confirmed → settled`, with the failure branches `failed → refunded` and `expired → refunded`.

1. `request_crypto_buy(p_account, p_amount, p_idempotency_key)` (aal2 + step-up) moves ₱ to the reserve through the transfer engine (lock, daily limit and risk guards all apply) and inserts the conversion as `reserved`.
2. Worker Edge Function (cron, every minute):
   - picks `reserved` rows, sends the SPL transfer, and stores the signature and `last_valid_block_height` (`submitted`);
   - polls `submitted` rows; finalized → `confirmed` → `settled`.
3. A blockhash past its validity with no signature found means `expired` → refund. An RPC error after a retry with the **same** signed transaction means `failed` → refund. A signature is never re-signed with a new blockhash until the old one has expired.
4. The reconciler (cron, every 10 minutes) compares settled rows with on-chain balances and writes a `crypto_mismatch` audit row. It never auto-moves money.
5. Sell back: the user's custodial address sends to the bank first. When that is confirmed, the reserve pays the user ₱ through the transfer engine.

## Stages and assignments

| Stage       | Tasks                                                                                                                                                                                                                                             | Agent                | Acceptance                                                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 9.5A DB     | `crypto_wallets(user_id, address)`, `crypto_conversions` (state, idempotency key unique, signature unique, amounts, timestamps), reserve account seed, RLS (own rows only), RPCs `request_crypto_buy`, `request_crypto_sell`, `get_crypto_wallet` | `be-bantay-security` | `test:db`: every state transition, a replay with the same key returns the same conversion, refund on expired/failed, no direct client writes, `_transfer_core` unchanged |
| 9.5B Edge   | `crypto-worker`, `crypto-reconcile`; Vault key access; exact-pinned `@solana/web3.js` (D16)                                                                                                                                                       | `be-bills-summary`   | Jest/Deno tests with a mocked RPC: duplicate tick does not double-send, expiry → refund, retry uses the same signature; key never logged                                 |
| 9.5C Setup  | `scripts/crypto-devnet-setup.mjs` (create keypair → Vault, airdrop, mint, reserve) re-runnable after a devnet reset; runbook in `docs/`                                                                                                           | `tool-ci`            | Script is idempotent; documented faucet limits; no secret printed                                                                                                        |
| 9.5D Mobile | Wallet screen behind the flag: balance, Buy/Sell with the existing money-flow sequence (Review → Authorize → Processing → Result), status timeline per conversion, explorer link (devnet)                                                         | `fe-phase8-screens`  | Flag off → no route (test); "Test network — no real value" on every screen; pending/failed/refunded states shown; `hideBalance` respected                                |
| 9.5E Admin  | Conversions list with state and signature link; mismatch alerts                                                                                                                                                                                   | `fe-general-codex`   | Playwright specs (NOT VERIFIED until owner signs in)                                                                                                                     |
| Gate        | Security (9.5A–C), UI/UX (9.5D–E), Code Quality, CI/CD (9.5C)                                                                                                                                                                                     | reviewer tabs        | No Blocker/High; device demo buy → settled and sell → settled; one forced expiry refunds                                                                                 |

## Do NOT

- No mainnet, no real token, no exchange to real money, no external wallet connections.
- No keys on the device or in the repo.
- No wallet in any store or TestFlight build meant for the public. Demo builds only.
- No changes to `_transfer_core`, the ledger or idempotency logic.
