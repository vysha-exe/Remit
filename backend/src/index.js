import "dotenv/config";
import cors from "cors";
import express from "express";
import mongoose from "mongoose";
import crypto from "node:crypto";
import { TronWeb } from "tronweb";

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
const inMemoryTransfers = [];
let hasDatabase = false;

const PRIVATE_KEY = process.env.TRON_PRIVATE_KEY || "";
const tron = new TronWeb({
  fullHost: process.env.TRON_FULL_HOST || "https://api.nileex.io",
  privateKey: PRIVATE_KEY
});

async function connectDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return;
  try {
    await mongoose.connect(uri);
    hasDatabase = true;
    console.log("MongoDB connected.");
  } catch (error) {
    console.warn("MongoDB unavailable. Using in-memory store.", error.message);
  }
}

function buildMockTxHash() {
  return `0x${crypto.randomBytes(32).toString("hex")}`;
}

async function tryRealOrMockTronTransfer() {
  // Optional real transfer mode for demos. If keys are missing, fallback to realistic hash.
  if (!process.env.TRON_RECEIVER_ADDRESS || !PRIVATE_KEY) {
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

app.get("/api/health", (_, res) => {
  res.json({ ok: true });
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
    const exchangeRate = await getUsdFxRate(destination.currency);
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

connectDb().finally(() => {
  app.listen(PORT, () => {
    console.log(`Remit backend running on http://localhost:${PORT}`);
  });
});
