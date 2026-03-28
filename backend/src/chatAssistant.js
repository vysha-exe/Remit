/**
 * Transaction help assistant: OpenAI when OPENAI_API_KEY is set, else rule-based demo replies.
 */

const SYSTEM_PROMPT = `You are Remit Assist, a concise helper for the Remit app.
Topics: international send from US, FX preview, US→UK cashout (US bank + UK sort code), tracking by tx hash,
optional TRON Nile testnet hash, optional MongoDB persistence, optional Coinbase rates or Advanced Trade, optional Wise sandbox.
Never claim to move real money or guarantee compliance. Keep answers under 120 words unless the user asks for detail.`;

export function fallbackTransactionReply(userMessage) {
  const q = String(userMessage || "").toLowerCase();

  if (/fee|cost|charge|price/.test(q)) {
    return "Remit’s UI shows **$0 user fees** in the product. Providers and banks add their own pricing in real life.";
  }
  if (/track|hash|status|where.*money/.test(q)) {
    return "Use **Track** in the nav and paste your **transaction hash** from the receipt. The backend looks up that transfer (`GET /api/transfers/:txHash`).";
  }
  if (/send|payment|transfer|recipient|country/.test(q)) {
    return "Go to **Payments**: enter amount in USD, pick a **destination country** from search, choose a **bank** where we list institutions, add account and card fields, confirm, then submit. You’ll get a live FX estimate and a settlement hash.";
  }
  if (/uk|us|barclays|cashout|gbp|routing|ach/.test(q)) {
    return "The **US → UK cashout** section debits a **US bank** (routing + account) and credits a **UK account** via sort code + account number. Default mode uses **demo timers**; with Wise env vars you can hit **Wise sandbox** APIs instead.";
  }
  if (/tron|crypto|blockchain|nile|tx hash/.test(q)) {
    return "The backend can record a **TRON Nile** micro-transfer hash when `TRON_PRIVATE_KEY` and `TRON_RECEIVER_ADDRESS` are set; otherwise you’ll see a **mock** hash. Fund the sender with **test TRX** from a Nile faucet.";
  }
  if (/mongo|database|save|persist/.test(q)) {
    return "Transfers save to **MongoDB** when `MONGODB_URI` works. If not, the server keeps **in-memory** history until restart.";
  }
  if (/coinbase|usdc|exchange/.test(q)) {
    return "**Coinbase public rates** can power FX on send when enabled. **Advanced Trade** is separate (`/api/coinbase-advanced/*`) and uses CDP keys—only for testing with your own brokerage sandbox.";
  }
  if (/wise|sandbox|payout/.test(q)) {
    return "Set `PAYOUT_US_UK_MODE=wise_sandbox` (or legacy `PAYOUT_UK_US_MODE`) and `WISE_API_TOKEN` to create real **Wise sandbox** recipients and transfers from the cashout form.";
  }
  if (/hello|hi|hey|^$/.test(q.trim()) || q.length < 2) {
    return "Hi! I can explain **sending payments**, **US→UK cashout**, **tracking by hash**, fees, TRON/Mongo/Coinbase/Wise options. What are you trying to do?";
  }

  return "I’m focused on **Remit transactions**. Try asking about **fees**, **how to send**, **tracking**, **US→UK cashout**, or **TRON/MongoDB**. Create an account under **Sign up** (stored in **MongoDB** when the API is connected).";
}

export async function chatCompletion(messages) {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    const last = messages.filter((m) => m.role === "user").pop();
    const text = last?.content || "";
    return {
      reply: fallbackTransactionReply(text),
      source: "demo_rules"
    };
  }

  const model = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      max_tokens: 400,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages]
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data?.error?.message || res.statusText || "OpenAI request failed.";
    throw new Error(err);
  }

  const reply = data?.choices?.[0]?.message?.content?.trim();
  if (!reply) {
    throw new Error("Empty response from model.");
  }

  return { reply, source: "openai", model };
}
