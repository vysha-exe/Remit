import "dotenv/config";
import cors from "cors";
import express from "express";
import mongoose from "mongoose";
import crypto from "node:crypto";
import { TronWeb } from "tronweb";
import {
  createMarketBuyUsdcOrder,
  isAdvancedTradeConfigured,
  listBrokerageAccounts
} from "./coinbaseAdvanced.js";
import {
  CORRIDOR,
  SOURCE_BANK,
  getUsdToGbpRate,
  parseUsUkPayoutBody,
  shapePublicUsUkPayout
} from "./payoutUsUk.js";
import {
  isWiseSandboxPayoutEnabled,
  mapWiseTransferStatusToPayout,
  runWiseUsUkPayout,
  wiseGetTransfer
} from "./payoutWiseSandbox.js";
import { chatCompletion } from "./chatAssistant.js";
import { attachUserAuthRoutes } from "./userAuth.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

const countryCache = new Map();
const rateCache = new Map();
const FALLBACK_CURRENCY_BY_COUNTRY = {
  US: "USD",
  LK: "LKR",
  IN: "INR",
  PH: "PHP",
  NG: "NGN",
  MX: "MXN",
  KE: "KES",
  BD: "BDT",
  PK: "PKR",
  NP: "NPR",
  AE: "AED",
  GB: "GBP",
  EU: "EUR",
  CA: "CAD",
  AU: "AUD",
  JP: "JPY",
  SG: "SGD",
  MY: "MYR",
  ID: "IDR",
  TH: "THB",
  VN: "VND",
  BR: "BRL",
  ZA: "ZAR"
};
const BANKS_BY_COUNTRY_CODE = {
  GB: [
    "Barclays",
    "HSBC UK",
    "Lloyds Bank",
    "NatWest",
    "Santander UK",
    "Halifax",
    "Bank of Scotland",
    "TSB Bank",
    "Metro Bank",
    "Starling Bank",
    "Monzo",
    "Revolut",
    "Nationwide Building Society",
    "The Co-operative Bank",
    "Virgin Money UK",
    "Royal Bank of Scotland",
    "Clydesdale Bank",
    "Yorkshire Bank"
  ],
  CN: [
    "Industrial and Commercial Bank of China (ICBC)",
    "China Construction Bank (CCB)",
    "Agricultural Bank of China (ABC)",
    "Bank of China (BOC)",
    "Bank of Communications",
    "China Merchants Bank",
    "China CITIC Bank",
    "Industrial Bank (China)",
    "Shanghai Pudong Development Bank (SPDB)",
    "China Minsheng Bank",
    "Postal Savings Bank of China (PSBC)",
    "Ping An Bank",
    "Bank of Beijing",
    "Bank of Shanghai"
  ],
  RU: [
    "Sberbank",
    "VTB Bank",
    "Gazprombank",
    "Alfa-Bank",
    "Rosselkhozbank",
    "T-Bank (Tinkoff)",
    "Raiffeisenbank Russia",
    "Otkritie Bank",
    "Rosbank",
    "Sovcombank"
  ],
  FR: [
    "BNP Paribas",
    "Crédit Agricole",
    "Société Générale",
    "Groupe BPCE (Banque Populaire / Caisse d'Épargne)",
    "Crédit Mutuel",
    "La Banque Postale",
    "HSBC France",
    "Boursorama Banque"
  ],
  DE: [
    "Deutsche Bank",
    "Commerzbank",
    "KfW",
    "DZ Bank",
    "UniCredit Bank (HypoVereinsbank)",
    "Sparkasse",
    "Volksbank",
    "N26",
    "ING-DiBa"
  ]
};
const BANK_NAME_SET_BY_COUNTRY_CODE = new Map(
  Object.entries(BANKS_BY_COUNTRY_CODE).map(([code, banks]) => [
    code,
    new Set(banks.map((name) => name.toLowerCase()))
  ])
);

const transferSchema = new mongoose.Schema(
  {
    senderName: { type: String, required: true },
    recipientName: { type: String, required: true },
    recipientBankName: { type: String, required: true },
    recipientBankAccountNumber: { type: String, required: true },
    recipientCardholderName: { type: String, required: true },
    recipientCardLast4: { type: String, required: true },
    destinationCountry: { type: String, required: true },
    destinationCurrency: { type: String, required: true },
    usdAmount: { type: Number, required: true },
    usdcAmount: { type: Number, required: true },
    destinationAmount: { type: Number, required: true },
    exchangeRate: { type: Number, required: true },
    quoteSource: { type: String, default: "fx_fallback" },
    bybitAdId: { type: String, default: "" },
    bybitMerchant: { type: String, default: "" },
    txHash: { type: String, required: true },
    source: { type: String, default: "US Sender" },
    feeUsd: { type: Number, default: 0 },
    estimatedCompletionMinutes: { type: Number, default: 10 },
    status: {
      type: String,
      enum: ["Pending", "Confirmed", "Completed", "Failed"],
      default: "Pending"
    }
  },
  { timestamps: true }
);

const Transfer = mongoose.model("Transfer", transferSchema);

const payoutUsUkSchema = new mongoose.Schema(
  {
    corridor: { type: String, default: CORRIDOR },
    sourceBank: { type: String, default: SOURCE_BANK },
    senderName: { type: String, required: true },
    usRoutingLast4: { type: String, required: true },
    usAccountLast4: { type: String, required: true },
    usBankName: { type: String, required: true },
    recipientName: { type: String, required: true },
    ukSortCodeLast2: { type: String, required: true },
    ukAccountLast4: { type: String, required: true },
    amountUsd: { type: Number, required: true },
    estimatedGbpPayout: { type: Number, required: true },
    status: {
      type: String,
      enum: ["Submitted", "Processing", "Completed", "Failed"],
      default: "Submitted"
    },
    providerRef: { type: String, default: "" },
    payoutMode: { type: String, enum: ["demo", "wise_sandbox"], default: "demo" },
    wiseTransferId: { type: String, default: "" },
    wiseQuoteUuid: { type: String, default: "" },
    wiseRawStatus: { type: String, default: "" }
  },
  { timestamps: true }
);

const UsUkPayout = mongoose.model("UsUkPayout", payoutUsUkSchema);
const inMemoryTransfers = [];
const inMemoryUsUkPayouts = [];
let hasDatabase = false;

const RAW_PRIVATE_KEY = (process.env.TRON_PRIVATE_KEY || "").trim();
const TRON_FULL_HOST = process.env.TRON_FULL_HOST || "https://api.nileex.io";

function isValidTronPrivateKeyHex(key) {
  if (!key) return false;
  const normalized = key.startsWith("0x") ? key.slice(2) : key;
  return /^[0-9a-fA-F]{64}$/.test(normalized);
}

const PRIVATE_KEY = isValidTronPrivateKeyHex(RAW_PRIVATE_KEY) ? RAW_PRIVATE_KEY : "";
const COINBASE_ENABLED = process.env.COINBASE_ENABLED === "true";
const COINBASE_STRICT = process.env.COINBASE_STRICT === "true";
const COINBASE_BASE_URL = process.env.COINBASE_BASE_URL || "https://api.coinbase.com";
const COINBASE_ADVANCED_TRADE_ENABLED = process.env.COINBASE_ADVANCED_TRADE_ENABLED === "true";
const BYBIT_ENABLED = process.env.BYBIT_ENABLED === "true";
const BYBIT_STRICT = process.env.BYBIT_STRICT === "true";
const BYBIT_API_KEY = process.env.BYBIT_API_KEY || "";
const BYBIT_API_SECRET = process.env.BYBIT_API_SECRET || "";
const BYBIT_BASE_URL = process.env.BYBIT_BASE_URL || "https://api.bybit.com";
const BYBIT_RECV_WINDOW = process.env.BYBIT_RECV_WINDOW || "5000";

// Only attach a signing key when it looks like real hex (64 chars). Addresses (T...) are ignored so the server still starts.
const tron =
  PRIVATE_KEY &&
  new TronWeb({
    fullHost: TRON_FULL_HOST,
    privateKey: PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY.slice(2) : PRIVATE_KEY
  });

if (RAW_PRIVATE_KEY && !PRIVATE_KEY) {
  console.warn(
    "TRON_PRIVATE_KEY is set but not a valid 64-char hex private key — chain sends will use mock tx hashes. Leave empty or export real key from TronLink."
  );
}

async function connectDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return;
  if (uri.includes("<db_password>") || uri.includes("%3Cdb_password%3E")) {
    console.warn(
      "MongoDB: MONGODB_URI still contains the placeholder <db_password>. Replace it with your Atlas database user password (URL-encoded if it has special characters)."
    );
    return;
  }
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10_000
    });
    hasDatabase = true;
    console.log("MongoDB connected.");
  } catch (error) {
    const isAuth =
      error?.code === 8000 || String(error?.message || "").toLowerCase().includes("bad auth");
    const hint = isAuth
      ? "Check: Atlas DB user + password, URL-encode special chars in password, Network Access allowlist."
      : "";
    const msg = [error.message, hint].filter(Boolean).join(" ");
    console.warn("MongoDB unavailable. Using in-memory store.", msg);
  }
}

function buildMockTxHash() {
  return `0x${crypto.randomBytes(32).toString("hex")}`;
}

async function tryRealOrMockTronTransfer() {
  // Optional real transfer mode for demos. If keys are missing or invalid, fallback to realistic hash.
  if (!process.env.TRON_RECEIVER_ADDRESS || !tron) {
    return { txHash: buildMockTxHash(), isReal: false };
  }

  try {
    const tx = await tron.trx.sendTransaction(
      process.env.TRON_RECEIVER_ADDRESS,
      1 // 1 SUN for proof-of-chain action in demo mode
    );
    if (tx?.txid) return { txHash: tx.txid, isReal: true };
    return { txHash: buildMockTxHash(), isReal: false };
  } catch {
    return { txHash: buildMockTxHash(), isReal: false };
  }
}

async function saveTransfer(transferData) {
  if (hasDatabase) {
    const doc = await Transfer.create(transferData);
    return {
      id: doc._id.toString(),
      ...doc.toObject()
    };
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const entry = { id, createdAt, updatedAt: createdAt, ...transferData };
  inMemoryTransfers.unshift(entry);
  return entry;
}

async function listTransfers() {
  if (hasDatabase) {
    const docs = await Transfer.find().sort({ createdAt: -1 }).limit(20).lean();
    return docs.map((doc) => ({ id: doc._id.toString(), ...doc }));
  }
  return inMemoryTransfers.slice(0, 20);
}

async function updateStatus(id, status) {
  if (hasDatabase) {
    await Transfer.findByIdAndUpdate(id, { status });
    return;
  }
  const item = inMemoryTransfers.find((t) => t.id === id);
  if (item) item.status = status;
}

async function saveUsUkPayout(payoutData) {
  if (hasDatabase) {
    const doc = await UsUkPayout.create(payoutData);
    return { id: doc._id.toString(), ...doc.toObject() };
  }
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const entry = { id, createdAt, updatedAt: createdAt, ...payoutData };
  inMemoryUsUkPayouts.unshift(entry);
  return entry;
}

async function listUsUkPayouts() {
  if (hasDatabase) {
    const docs = await UsUkPayout.find().sort({ createdAt: -1 }).limit(20).lean();
    return docs.map((doc) => ({ id: doc._id.toString(), ...doc }));
  }
  return inMemoryUsUkPayouts.slice(0, 20);
}

async function updateUsUkPayoutStatus(id, status, providerRef) {
  if (hasDatabase) {
    const update = { status };
    if (providerRef) update.providerRef = providerRef;
    await UsUkPayout.findByIdAndUpdate(id, update);
    return;
  }
  const item = inMemoryUsUkPayouts.find((p) => p.id === id);
  if (item) {
    item.status = status;
    if (providerRef) item.providerRef = providerRef;
    item.updatedAt = new Date().toISOString();
  }
}

function scheduleUsUkDemoProgress(payoutId) {
  setTimeout(() => {
    updateUsUkPayoutStatus(payoutId, "Processing", "").catch(() => {});
  }, 2500);
  setTimeout(() => {
    const ref = `DEMO-UK-CREDIT-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    updateUsUkPayoutStatus(payoutId, "Completed", ref).catch(() => {});
  }, 6500);
}

async function updateUsUkPayoutWiseFields(payoutId, { status, wiseRawStatus, providerRef }) {
  if (hasDatabase) {
    const patch = {};
    if (status) patch.status = status;
    if (wiseRawStatus !== undefined) patch.wiseRawStatus = wiseRawStatus;
    if (providerRef) patch.providerRef = providerRef;
    await UsUkPayout.findByIdAndUpdate(payoutId, patch);
    return;
  }
  const item = inMemoryUsUkPayouts.find((p) => p.id === payoutId);
  if (item) {
    if (status) item.status = status;
    if (wiseRawStatus !== undefined) item.wiseRawStatus = wiseRawStatus;
    if (providerRef) item.providerRef = providerRef;
    item.updatedAt = new Date().toISOString();
  }
}

function scheduleWiseStatusPoll(payoutId, wiseTransferId) {
  const run = async () => {
    try {
      const t = await wiseGetTransfer(wiseTransferId);
      const mapped = mapWiseTransferStatusToPayout(t.status);
      await updateUsUkPayoutWiseFields(payoutId, {
        status: mapped,
        wiseRawStatus: t.status,
        providerRef: `wise-sandbox:${wiseTransferId}`
      });
    } catch {
      // ignore transient Wise errors during polling
    }
  };
  [3000, 8000, 15000, 30000, 45000].forEach((ms) => setTimeout(run, ms));
}

function getAllCountries() {
  return countryCache.get("all") || [];
}

async function ensureCountriesLoaded() {
  const cached = countryCache.get("all");
  if (cached && cached.length > 0) return cached;

  const response = await fetch("https://restcountries.com/v3.1/all?fields=name,cca2");
  if (!response.ok) throw new Error("Unable to load countries.");
  const payload = await response.json();
  const countries = (payload || [])
    .map((item) => ({
      code: String(item?.cca2 || "").toUpperCase(),
      name: String(item?.name?.common || "").trim()
    }))
    .filter((item) => item.code.length === 2 && item.name.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  countryCache.set("all", countries);
  return countries;
}

async function resolveCountryCurrency(countryCode) {
  const normalized = String(countryCode || "").toUpperCase();
  const fromCache = countryCache.get(normalized);
  if (fromCache?.currency) return fromCache;

  const countries = await ensureCountriesLoaded();
  const country = countries.find((item) => item.code === normalized);
  if (!country) return null;

  let currency = FALLBACK_CURRENCY_BY_COUNTRY[normalized] || "USD";
  try {
    const response = await fetch(
      `https://restcountries.com/v3.1/alpha/${normalized}?fields=currencies,name,cca2`
    );
    if (response.ok) {
      const payload = await response.json();
      const obj = Array.isArray(payload) ? payload[0] : payload;
      const firstCurrency = Object.keys(obj?.currencies || {})[0];
      if (firstCurrency) currency = firstCurrency;
    }
  } catch {
    // Fallbacks keep app resilient in hackathon demos.
  }

  const resolved = { code: normalized, name: country.name, currency };
  countryCache.set(normalized, resolved);
  return resolved;
}

async function getUsdFxRate(currencyCode) {
  const currency = String(currencyCode || "USD").toUpperCase();
  if (currency === "USD") return 1;

  const cache = rateCache.get(currency);
  const now = Date.now();
  if (cache && now - cache.ts < 60_000) return cache.rate;

  const response = await fetch(`https://open.er-api.com/v6/latest/USD`);
  if (!response.ok) throw new Error("Unable to fetch FX rates.");
  const payload = await response.json();
  const rate = payload?.rates?.[currency];
  if (!rate || Number.isNaN(Number(rate))) {
    throw new Error("FX rate unavailable for selected currency.");
  }

  rateCache.set(currency, { rate: Number(rate), ts: now });
  return Number(rate);
}

async function getCoinbaseUsdRate(currencyCode) {
  const currency = String(currencyCode || "USD").toUpperCase();
  if (currency === "USD") return 1;

  const cache = rateCache.get(`CB_${currency}`);
  const now = Date.now();
  if (cache && now - cache.ts < 30_000) return cache.rate;

  const response = await fetch(`${COINBASE_BASE_URL}/v2/exchange-rates?currency=USD`);
  if (!response.ok) throw new Error("Unable to fetch Coinbase exchange rates.");
  const payload = await response.json();
  const rate = Number(payload?.data?.rates?.[currency]);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Coinbase rate unavailable for ${currency}.`);
  }

  rateCache.set(`CB_${currency}`, { rate, ts: now });
  return rate;
}

function signBybitRequest(timestamp, payload) {
  const preSign = `${timestamp}${BYBIT_API_KEY}${BYBIT_RECV_WINDOW}${payload}`;
  return crypto.createHmac("sha256", BYBIT_API_SECRET).update(preSign).digest("hex");
}

async function bybitRequest(path, method = "POST", body = {}) {
  if (!BYBIT_API_KEY || !BYBIT_API_SECRET) {
    throw new Error("Bybit API credentials are missing.");
  }

  const payload = method === "GET" ? "" : JSON.stringify(body);
  const timestamp = Date.now().toString();
  const signature = signBybitRequest(timestamp, payload);

  const response = await fetch(`${BYBIT_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-BAPI-API-KEY": BYBIT_API_KEY,
      "X-BAPI-SIGN": signature,
      "X-BAPI-SIGN-TYPE": "2",
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-RECV-WINDOW": BYBIT_RECV_WINDOW
    },
    body: method === "GET" ? undefined : payload
  });

  const data = await response.json();
  if (!response.ok || data?.retCode !== 0) {
    const reason = data?.retMsg || "Bybit request failed.";
    throw new Error(reason);
  }

  return data;
}

async function getBybitP2PQuote({ fiatCurrency, token = "USDT" }) {
  // side "1" targets sell ads where merchants buy user's USDT and pay local fiat.
  const data = await bybitRequest("/v5/p2p/item/online", "POST", {
    tokenId: token,
    currencyId: fiatCurrency,
    side: "1",
    size: "10",
    page: "1",
    amount: "100"
  });

  const items = data?.result?.items || [];
  if (!items.length) throw new Error(`No Bybit P2P ads found for ${fiatCurrency}.`);

  const bestAd = items
    .map((item) => ({
      id: item?.id || item?.itemId || "",
      merchant: item?.nickName || item?.userNickName || "Bybit Merchant",
      price: Number(item?.price)
    }))
    .filter((item) => Number.isFinite(item.price) && item.price > 0)
    .sort((a, b) => b.price - a.price)[0];

  if (!bestAd) throw new Error("No valid Bybit P2P price returned.");
  return bestAd;
}

app.get("/api/health", (_, res) => {
  res.json({ ok: true });
});

app.post("/api/chat", async (req, res) => {
  try {
    const messages = req.body?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ message: "messages array is required." });
    }
    const last = messages[messages.length - 1];
    if (last?.role !== "user" || typeof last?.content !== "string") {
      return res.status(400).json({ message: "Last message must be a user string." });
    }
    if (messages.length > 30) {
      return res.status(400).json({ message: "Too many messages in one request." });
    }
    const out = await chatCompletion(messages);
    return res.json(out);
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Chat failed.",
      source: "error"
    });
  }
});

app.get("/api/countries", (_, res) => {
  ensureCountriesLoaded()
    .then((countries) => res.json({ countries }))
    .catch((error) =>
      res.status(500).json({ message: error.message || "Unable to load countries." })
    );
});

app.get("/api/fx-rate", async (req, res) => {
  try {
    const countryCode = String(req.query.countryCode || "").toUpperCase();
    if (!countryCode) return res.status(400).json({ message: "countryCode is required." });

    const resolved = await resolveCountryCurrency(countryCode);
    if (!resolved) return res.status(404).json({ message: "Country not found." });

    const rate = await getUsdFxRate(resolved.currency);
    return res.json({
      countryCode: resolved.code,
      countryName: resolved.name,
      currency: resolved.currency,
      usdToDestinationRate: rate,
      asOf: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Unable to fetch FX rate." });
  }
});

app.get("/api/bybit/quote", async (req, res) => {
  try {
    const countryCode = String(req.query.countryCode || "").toUpperCase();
    if (!countryCode) return res.status(400).json({ message: "countryCode is required." });

    const destination = await resolveCountryCurrency(countryCode);
    if (!destination) return res.status(404).json({ message: "Country not found." });

    const quote = await getBybitP2PQuote({ fiatCurrency: destination.currency });
    return res.json({
      countryCode: destination.code,
      countryName: destination.name,
      currency: destination.currency,
      price: quote.price,
      adId: quote.id,
      merchant: quote.merchant
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Unable to fetch Bybit quote." });
  }
});

app.get("/api/coinbase/quote", async (req, res) => {
  try {
    const countryCode = String(req.query.countryCode || "").toUpperCase();
    if (!countryCode) return res.status(400).json({ message: "countryCode is required." });

    const destination = await resolveCountryCurrency(countryCode);
    if (!destination) return res.status(404).json({ message: "Country not found." });

    const rate = await getCoinbaseUsdRate(destination.currency);
    return res.json({
      countryCode: destination.code,
      countryName: destination.name,
      currency: destination.currency,
      price: rate,
      source: "coinbase_rates"
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Unable to fetch Coinbase quote." });
  }
});

/** CDP JWT: verify keys and list brokerage accounts (no trade). */
app.get("/api/coinbase-advanced/accounts", async (_, res) => {
  if (!COINBASE_ADVANCED_TRADE_ENABLED) {
    return res.status(503).json({
      message: "Set COINBASE_ADVANCED_TRADE_ENABLED=true to use Advanced Trade endpoints."
    });
  }
  if (!isAdvancedTradeConfigured()) {
    return res.status(503).json({
      message: "Missing COINBASE_CDP_API_KEY_ID and COINBASE_CDP_API_KEY_SECRET."
    });
  }
  try {
    const data = await listBrokerageAccounts();
    return res.json(data);
  } catch (error) {
    const status = error.status && Number.isFinite(error.status) ? error.status : 500;
    return res.status(status).json({
      message: error.message || "Advanced Trade request failed.",
      details: error.details
    });
  }
});

/**
 * Place a real market buy: USD cash → USDC (product USDC-USD). Requires USD balance and trade permission on the API key.
 * Body: { "quoteSizeUsd": 5 } = spend $5 USD to buy USDC.
 */
app.post("/api/coinbase-advanced/market-buy-usdc", async (req, res) => {
  if (!COINBASE_ADVANCED_TRADE_ENABLED) {
    return res.status(503).json({
      message: "Set COINBASE_ADVANCED_TRADE_ENABLED=true to use Advanced Trade endpoints."
    });
  }
  if (!isAdvancedTradeConfigured()) {
    return res.status(503).json({
      message: "Missing COINBASE_CDP_API_KEY_ID and COINBASE_CDP_API_KEY_SECRET."
    });
  }
  const raw = req.body?.quoteSizeUsd ?? req.body?.quote_size;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    return res.status(400).json({ message: "Body must include quoteSizeUsd (positive number)." });
  }
  const max = Number(process.env.COINBASE_ADVANCED_MAX_USD || "100");
  if (n > max) {
    return res.status(400).json({ message: `quoteSizeUsd exceeds safety cap (${max}).` });
  }
  try {
    const data = await createMarketBuyUsdcOrder(n.toFixed(2));
    return res.status(201).json(data);
  } catch (error) {
    const status = error.status && Number.isFinite(error.status) ? error.status : 500;
    return res.status(status).json({
      message: error.message || "Order failed.",
      details: error.details
    });
  }
});

app.post("/api/send", async (req, res) => {
  try {
    const {
      amountUsd,
      senderName,
      recipientName,
      recipientBankName,
      recipientBankAccountNumber,
      recipientCardholderName,
      recipientCardNumber,
      destinationCode
    } = req.body;

    if (!senderName || typeof senderName !== "string") {
      return res.status(400).json({ message: "Sender name is required." });
    }
    if (!recipientName || typeof recipientName !== "string") {
      return res.status(400).json({ message: "Recipient name is required." });
    }
    if (!recipientBankName || typeof recipientBankName !== "string") {
      return res.status(400).json({ message: "Recipient bank name is required." });
    }
    if (!destinationCode) {
      return res.status(400).json({ message: "Valid destination country is required." });
    }
    if (!recipientBankAccountNumber || typeof recipientBankAccountNumber !== "string") {
      return res.status(400).json({ message: "Recipient bank account number is required." });
    }
    if (!recipientCardholderName || typeof recipientCardholderName !== "string") {
      return res.status(400).json({ message: "Recipient cardholder name is required." });
    }
    if (!recipientCardNumber || typeof recipientCardNumber !== "string") {
      return res.status(400).json({ message: "Recipient card number is required." });
    }
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      return res.status(400).json({ message: "Amount must be greater than zero." });
    }
    const destination = await resolveCountryCurrency(destinationCode);
    if (!destination) {
      return res.status(400).json({ message: "Valid destination country is required." });
    }

    const bankSet = BANK_NAME_SET_BY_COUNTRY_CODE.get(String(destinationCode).toUpperCase());
    if (bankSet && !bankSet.has(recipientBankName.trim().toLowerCase())) {
      return res.status(400).json({ message: "Please select a valid bank name for this country." });
    }

    // Demo conversion pipeline:
    // USD -> USDC (1:1), then USDC -> local currency using live FX data.
    const usdcAmount = Number(amountUsd);
    let exchangeRate = await getUsdFxRate(destination.currency);
    let quoteSource = "fx_fallback";
    let bybitAdId = "";
    let bybitMerchant = "";
    if (COINBASE_ENABLED) {
      try {
        exchangeRate = await getCoinbaseUsdRate(destination.currency);
        quoteSource = "coinbase_rates";
      } catch (error) {
        if (COINBASE_STRICT) throw error;
      }
    } else if (BYBIT_ENABLED) {
      try {
        const quote = await getBybitP2PQuote({ fiatCurrency: destination.currency });
        exchangeRate = quote.price;
        quoteSource = "bybit_p2p";
        bybitAdId = quote.id;
        bybitMerchant = quote.merchant;
      } catch (error) {
        if (BYBIT_STRICT) throw error;
      }
    }
    const destinationAmount = Math.round(usdcAmount * exchangeRate);
    const { txHash } = await tryRealOrMockTronTransfer();

    const transfer = await saveTransfer({
      senderName,
      recipientName,
      recipientBankName,
      recipientBankAccountNumber,
      recipientCardholderName,
      recipientCardLast4: recipientCardNumber.replace(/\D/g, "").slice(-4),
      destinationCountry: destination.name,
      destinationCurrency: destination.currency,
      usdAmount: Number(amountUsd),
      usdcAmount,
      destinationAmount,
      exchangeRate,
      quoteSource,
      bybitAdId,
      bybitMerchant,
      txHash,
      feeUsd: 0,
      source: "US Sender",
      estimatedCompletionMinutes: 10,
      status: "Pending"
    });

    setTimeout(() => updateStatus(transfer.id, "Confirmed"), 2500);
    setTimeout(() => updateStatus(transfer.id, "Completed"), 5000);

    return res.status(201).json(transfer);
  } catch (error) {
    return res.status(500).json({
      message: "Transaction failed. Please retry or check wallet balance.",
      detail: error.message
    });
  }
});

app.get("/api/transfers", async (_, res) => {
  const transfers = await listTransfers();
  res.json({ transfers });
});

app.get("/api/transfers/:txHash", async (req, res) => {
  const txHash = String(req.params.txHash || "").trim();
  if (!txHash) return res.status(400).json({ message: "Transaction hash is required." });

  if (hasDatabase) {
    const doc = await Transfer.findOne({ txHash }).lean();
    if (!doc) return res.status(404).json({ message: "Transfer not found." });
    return res.json({ transfer: { id: doc._id.toString(), ...doc } });
  }

  const item = inMemoryTransfers.find((transfer) => transfer.txHash === txHash);
  if (!item) return res.status(404).json({ message: "Transfer not found." });
  return res.json({ transfer: item });
});

/** US → UK bank cashout: US source (ACH-style demo) → UK sort code / account (demo rail). */
app.post("/api/payouts/us-to-uk", async (req, res) => {
  try {
    const parsed = parseUsUkPayoutBody(req.body);
    const usdToGbp = await getUsdToGbpRate();
    let estimatedGbpPayout = Math.round(parsed.amountUsd * usdToGbp * 100) / 100;

    const useWise = isWiseSandboxPayoutEnabled();
    let payoutMode = "demo";
    let wiseTransferId = "";
    let wiseQuoteUuid = "";
    let wiseRawStatus = "";
    let providerRef = "";
    let initialStatus = "Submitted";

    if (useWise) {
      const ukSortCode = String(req.body?.ukSortCode || "").replace(/\D/g, "");
      const ukAccountNumber = String(req.body?.ukAccountNumber || "").replace(/\D/g, "");
      const wiseResult = await runWiseUsUkPayout({
        ukRecipientName: parsed.recipientName,
        ukSortCode,
        ukAccountNumber,
        amountUsd: parsed.amountUsd
      });
      payoutMode = "wise_sandbox";
      wiseTransferId = String(wiseResult.wiseTransferId);
      wiseQuoteUuid = wiseResult.wiseQuoteUuid;
      wiseRawStatus = wiseResult.wiseStatus;
      providerRef = `wise-sandbox:${wiseTransferId}`;
      if (wiseResult.estimatedGbpPayout > 0) {
        estimatedGbpPayout = wiseResult.estimatedGbpPayout;
      }
      initialStatus = mapWiseTransferStatusToPayout(wiseResult.wiseStatus);
    }

    const payout = await saveUsUkPayout({
      corridor: CORRIDOR,
      sourceBank: SOURCE_BANK,
      senderName: parsed.senderName,
      usRoutingLast4: parsed.usRoutingLast4,
      usAccountLast4: parsed.usAccountLast4,
      usBankName: parsed.usBankName,
      recipientName: parsed.recipientName,
      ukSortCodeLast2: parsed.ukSortCodeLast2,
      ukAccountLast4: parsed.ukAccountLast4,
      amountUsd: parsed.amountUsd,
      estimatedGbpPayout,
      status: initialStatus,
      providerRef,
      payoutMode,
      wiseTransferId,
      wiseQuoteUuid,
      wiseRawStatus
    });

    if (useWise) {
      scheduleWiseStatusPoll(payout.id, wiseTransferId);
    } else {
      scheduleUsUkDemoProgress(payout.id);
    }

    return res.status(201).json(shapePublicUsUkPayout(payout));
  } catch (error) {
    const message = error.message || "Payout request failed.";
    const isValidation =
      message.includes("required") ||
      message.includes("must be") ||
      message.includes("digits") ||
      message.includes("between");
    const status = error.status && Number.isFinite(error.status) ? error.status : 500;
    if (!isValidation && status !== 500) {
      return res.status(status).json({ message, details: error.details });
    }
    return res.status(isValidation ? 400 : 500).json({ message, details: error.details });
  }
});

app.get("/api/payouts/us-to-uk/config", (_, res) => {
  res.json({
    corridor: CORRIDOR,
    sourceBank: SOURCE_BANK,
    modes: {
      demo: true,
      wiseSandbox: isWiseSandboxPayoutEnabled()
    },
    wiseSandboxBase: process.env.WISE_API_BASE || "https://api.wise-sandbox.com"
  });
});

app.get("/api/payouts/us-to-uk", async (_, res) => {
  try {
    const rows = await listUsUkPayouts();
    return res.json({ payouts: rows.map(shapePublicUsUkPayout) });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Unable to list payouts." });
  }
});

attachUserAuthRoutes(app, { isDatabaseConnected: () => hasDatabase });

connectDb().finally(() => {
  app.listen(PORT, () => {
    console.log(`Remit backend running on http://localhost:${PORT}`);
  });
});
