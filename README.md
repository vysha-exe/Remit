# Remit

*Send farther, pay nothing.*

A consumer-facing **Next.js** UI with an **Express** backend, optional **MongoDB**, optional **TRON (Nile)** for a settlement hash, optional **Coinbase** (public FX and/or Advanced Trade), and optional **Wise sandbox** for a US→UK payout experiment.

This is **not** a licensed money transmitter, card processor, or production security review. It *is* enough for a **clear live demo** if you rehearse one happy path and keep `.env` working on the demo machine.

---

## What the app does

### Send money (US → destination country)

- Search **destination country**, enter **sender / recipient**, **bank** (curated lists for GB, CN, RU, FR, DE), **account number**, and **sender card** fields (card number is formatted in the UI; the API stores **last 4 only**; expiry/CVV are not sent to the server).
- Live **FX preview** per country.
- **Submit** runs `POST /api/send`: USD→destination fiat using **exchange rates** (Open ER API by default; **Coinbase public rates** or **Bybit P2P** if enabled), then records a **settlement reference** on **TRON Nile (testnet)** when configured: optional **TRC-20 stablecoin** (`mint` or `transfer`), else **1 SUN TRX**, else an **in-app-only** hash (see **Stablecoin connection** below).
- **Persists** to **MongoDB** when `MONGODB_URI` connects; otherwise **in-memory** (data lost on restart).
- **Recent transfers** table and a short **status timeline** (timer-based progression for the demo).

### Track a transfer

- **`/track`** — look up by **transaction hash** (`GET /api/transfers/:txHash`).

### US → UK bank cashout (US source → UK destination)

- Payments tab: **debit** a **US bank** (routing + account) → **credit** a **UK** sort code + account (+ optional US sender address metadata).
- **Default:** local **demo rail** (timers + fake reference).
- **Optional:** `PAYOUT_US_UK_MODE=wise_sandbox` (or legacy `PAYOUT_UK_US_MODE`) + **Wise personal API token** → creates recipient, quote, and transfer on **`api.wise-sandbox.com`** (see `.env.example`).

### Coinbase Advanced Trade (API only)

- Not wired into the main send form. With CDP credentials and `COINBASE_ADVANCED_TRADE_ENABLED=true`:
  - `GET /api/coinbase-advanced/accounts`
  - `POST /api/coinbase-advanced/market-buy-usdc` with `{ "quoteSizeUsd": 5 }` (uses **real** brokerage balance; capped by env).

---

## Stack

| Layer | Tech |
|--------|------|
| Frontend | Next.js (App Router), Tailwind, TypeScript |
| Backend | Node.js, Express, Mongoose |
| Chain (optional) | TRON Web, Nile testnet |
| Payout sandbox (optional) | Wise Platform API (sandbox) |
| Brokerage (optional) | Coinbase Developer Platform JWT → Advanced Trade REST |

---

## Project layout

```
frontend/     Next.js UI (send, cashout, track link)
backend/      Express API, env-driven integrations
contracts/    ProximityStable.sol (TRON Nile test token; compile/deploy from backend/)
```

---

## Run locally

### Backend

```bash
cd backend
npm install
npm run dev
```

Copy **`backend/.env.example`** → **`backend/.env`** and fill values (never commit `.env`).

**Accounts (sign up / sign in)** use **MongoDB** plus **JWT**: set `MONGODB_URI` so the server can connect, and set `JWT_SECRET` to a long random string in production. Without MongoDB, registration returns HTTP 503 with a clear message.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Default API target is `http://localhost:4000`. To override:

```bash
# frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:4000
```

Open **http://localhost:3000** (or the port Next prints).

---

## Stablecoin connection (TRON / Nile)

All on-chain settlement in this repo targets **TRON Nile** (`TRON_FULL_HOST`, default `https://api.nileex.io`)—**testnet only**, not mainnet funds.

On each successful `POST /api/send`, the backend runs **`executeChainSettlement`** in this order:

1. **`TRON_STABLE_CONTRACT` + `TRON_STABLE_USE_MINT=true`** — Calls **`mint(TRON_RECEIVER_ADDRESS, amount)`** on your contract (e.g. **ProximityStable** pUSD). The deployer wallet must match **`TRON_PRIVATE_KEY`**; no pre-funded token balance needed.
2. **Else `TRON_STABLE_CONTRACT` set, mint off or failed** — TRC-20 **`transfer`** to the receiver (e.g. Nile **USDT**); the sender wallet must **already hold** that token.
3. **Else** — Native **1 SUN TRX** to `TRON_RECEIVER_ADDRESS`, only if the node **accepts** the broadcast (`result: true`).
4. **Else** — A random **reference hash** stored with `chainSettlement: "simulated"` (not on-chain).

The API persists **`chainSettlement`** (`trc20_mint`, `trc20_stable`, `trx_sun`, or `simulated`) and **`chainNote`** on each transfer so the UI and **Track** can tell whether the id is a real Nile tx.

**Contracts & tooling:** `contracts/ProximityStable.sol`; compile with `npm run compile:contract`, deploy with `npm run deploy:stable` from **`backend/`** (needs Nile TRX for fees). **Debug connectivity:** from `backend/`, run `npm run check:tron` (prints wallet balance on Nile, whether `TRON_STABLE_CONTRACT` exists, and env hints).

**How the contract fits TRON:** **ProximityStable** is a minimal **TRC-20–compatible** token (name/symbol/decimals, `transfer` / `approve` / `transferFrom`) deployed to **TRON’s TVM**, same interface family as mainnet USDT on TRON. The **deployer is `owner`** and the **only address** that can **`mint`**, crediting any recipient without pulling collateral from users—ideal for **Nile test USDC-style** balances. The **backend** uses **TronWeb** against **`TRON_FULL_HOST`** (Nile) to **`mint` or `transfer`** to `TRON_RECEIVER_ADDRESS` after a send, spending **test TRX** for fees and **energy/bandwidth**; that yields a **real transaction id** on **Nile Tronscan**, separate from fiat rails. Production USDT would use the same **TRC-20 call pattern** on **mainnet** with real liquidity and compliance.

---

## Environment variables (summary)

See **`backend/.env.example`** for the full list. Highlights:

| Variable | Role |
|----------|------|
| `MONGODB_URI` | Persistent transfers and **user accounts** (required for sign up) |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Signed sessions for `/api/auth/*` (set a strong secret in production) |
| `TRON_FULL_HOST`, `TRON_PRIVATE_KEY`, `TRON_RECEIVER_ADDRESS` | Real Nile settlement: 1 SUN TRX, or optional TRC-20 mint/transfer |
| `TRON_STABLE_CONTRACT`, `TRON_STABLE_USE_MINT`, `TRON_STABLE_TRANSFER_AMOUNT` | Optional: **ProximityStable** `mint()` (see below) or TRC-20 `transfer` of test USDT (fund sender wallet) |
| `COINBASE_ENABLED` / `COINBASE_STRICT` | Use Coinbase **public** FX on send |
| `COINBASE_ADVANCED_TRADE_ENABLED`, `COINBASE_CDP_*` | Brokerage JWT + market buy endpoint |
| `PAYOUT_US_UK_MODE` (or `PAYOUT_UK_US_MODE`), `WISE_API_TOKEN`, … | Wise **sandbox** cashout instead of timer demo |

### ProximityStable (Nile test token)

The repo includes a minimal **mintable** TRC-20–style contract (`contracts/ProximityStable.sol`). To deploy on **Nile** and wire settlement to **mint** new tokens to `TRON_RECEIVER_ADDRESS`:

1. Fund the Nile account for `TRON_PRIVATE_KEY` with test TRX (e.g. [Nile faucet](https://nileex.io/join/getJoinPage)).
2. From **`backend/`**: `npm install` then `npm run compile:contract` then `npm run deploy:stable`.
3. Set **`TRON_STABLE_CONTRACT`** to the printed base58 address, **`TRON_STABLE_USE_MINT=true`**, and keep **`TRON_STABLE_TRANSFER_AMOUNT`** in smallest units (6 decimals: `1000` = 0.001 pUSD).

The deployer is the **only minter**; the backend must use the same key as `TRON_PRIVATE_KEY`. Omit `TRON_STABLE_USE_MINT` or set it to `false` to use **transfer** from an existing token balance instead.

---

## License / credits

Built as a learning and demo project. Third-party APIs (Coinbase, Wise, TRON, etc.) are subject to their own terms.
