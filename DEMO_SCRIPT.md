# Remit — sample demo pathway script

Use this as a narrator outline. **Skip or shorten** any step whose backend piece is off; the lines in *italics* are optional depending on what’s configured.

**Before you go live:** Confirm frontend URL (e.g. Vercel) and `NEXT_PUBLIC_API_URL` → Railway backend. Hit `GET /api/health` once.

---

## 0. Opening (≈30s)

- “**Remit** is built for cross-border sends from the US: you see FX up front, get a trackable reference, and we can layer **bank-style** flows and **on-chain settlement** on TRON testnet where configured.”
- Open the **home** page → **Payments** (or your main entry that hosts the send form).

---

## 1. International send (≈2–3 min)

**Setup (say only what’s true):**

| If running | Say briefly |
|------------|-------------|
| MongoDB + JWT | “Sign-in ties to a real account store.” |
| MongoDB down / no auth | “We’ll use the send flow; accounts need the database in production.” |

**Walk the form:**

1. **Amount (USD)** — Enter a round number (e.g. 50 or 100). *Note: “Estimated receive updates from live FX.”*
2. **Sender / recipient** — Use plausible test names.
3. **Destination country** — Type to search, pick one with a **curated bank list** (e.g. **United Kingdom**) so the bank dropdown behaves well.
4. **Bank** — Pick from suggestions.
5. **Account number** — Any demo-style digits.
6. **Card block** — Cardholder + number + expiry + CVV. *“We only persist last four on the card; expiry and CVV stay client-side for this demo UI.”*
7. Check **confirmation** → **Send**.

**After submit:**

- Point to the **receipt**: destination amount, **transaction hash**, status timeline.
- **Track:** Click **Open Track** or copy hash → show it resolves.

**Branch — settlement line (read the receipt):**

| UI shows | Say |
|----------|-----|
| `trc20_mint` or `trc20_stable` | “Settlement hit our **Nile TRC-20** path—test tokens only.” |
| `trx_sun` | “That’s a **real micro-transfer on TRON Nile**—one SUN, testnet.” |
| `simulated` | “Chain wasn’t available for this run, so this hash is an **in-app reference**—same tracking UX, verify on-chain when TRON is wired.” |

**Branch — FX:**

| Situation | Say |
|-----------|-----|
| Coinbase rates + quote source looks “coinbase” | “FX can come from **Coinbase public rates** when enabled.” |
| Fallback / Open ER only | “Rates here are from our **public FX feed**.” |
| Earlier send failed with a rate error | “We’ll fall back or relax strict mode—**production** would harden this.” |

---

## 2. Track (≈30s)

- Open **`/track`** with the hash in the URL or paste it.
- *“Same API the app uses—good for support or reconciliation stories.”*

---

## 3. US → UK cashout tab (≈1–2 min) — optional

- Switch to **US / UK bank**.
- Fill routing, account, UK sort code + account, amount, names.
- Submit **Request US → UK cashout**.

**Branch:**

| If running | Say |
|------------|-----|
| **Wise sandbox** (`PAYOUT_US_UK_MODE=wise_sandbox` + token) | “This hits **Wise’s sandbox API**—real API shape, not live money.” |
| **Local / demo rail only** | “Status moves on a **timed progression** here; swapping env vars turns on Wise sandbox.” |

---

## 4. Contact / assistant (≈45s) — optional

- Open **Contact**.
- Ask one short question, e.g. *“How do I track a payment?”*

**Branch:**

| If running | Say |
|------------|-----|
| `OPENAI_API_KEY` on server | “Answers come from **GPT** with our system prompt.” |
| No key | “Fallback is **rule-based**—still usable for the room.” |

---

## 5. Close (≈20s)

- “Stack is **Next.js + Node**, optional **MongoDB**, **TRON Nile** for settlement references, optional **Coinbase / Wise / OpenAI**—all behind env flags so we can show a **thin hero path** or the full integration story.”
- *Optional scope line:* “Live product would add compliance, fraud, and partner contracts—we’re showing product and technical shape.”

---

## Quick “what’s off?” cheat sheet

| Symptom | Likely cause | One-liner for audience |
|--------|----------------|-------------------------|
| Sign up 503 | MongoDB not connected | “Auth needs the database—send flow still works.” |
| Send fails with FX / Coinbase | `COINBASE_STRICT` or API | “Tight FX mode—we can relax strict or use fallback rates.” |
| Hash not on Tronscan | Simulated or wrong explorer | “Nile only—`nile.tronscan.org`; or this run used an in-app reference.” |
| Chat is generic | No `OPENAI_API_KEY` | “Rule-based mode until the API key is on the server.” |

**TRON / Nile:** From `backend/`, run `npm run check:tron` — if **TRX balance is 0**, fund the printed wallet from a [Nile faucet](https://nileex.io/join/getJoinPage) or on-chain sends and contract calls will fail.

---

## Timing (tight run ≈5 min)

1. Send + receipt + Track — **3 min**  
2. US→UK tab — **1.5 min**  
3. Contact — **30s**  
4. Close — **30s**

Drop Contact or US→UK if you need to fit **4 minutes**.
