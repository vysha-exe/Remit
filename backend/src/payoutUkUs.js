const SOURCE_BANK = "Barclays";
const CORRIDOR = "UK-US";

export { SOURCE_BANK, CORRIDOR };

export async function getGbpToUsdRate() {
  const response = await fetch("https://open.er-api.com/v6/latest/GBP");
  if (!response.ok) throw new Error("Unable to fetch GBP/USD rate.");
  const payload = await response.json();
  const usdPerGbp = payload?.rates?.USD;
  if (!usdPerGbp || Number.isNaN(Number(usdPerGbp))) {
    throw new Error("GBP/USD rate unavailable.");
  }
  return Number(usdPerGbp);
}

/**
 * @param {Record<string, unknown>} body
 */
export function parseUkUsPayoutBody(body) {
  const senderName = String(body?.senderName || "").trim();
  if (!senderName) throw new Error("UK sender name is required.");

  const sortDigits = String(body?.ukSortCode || "").replace(/\D/g, "");
  if (sortDigits.length !== 6) {
    throw new Error("UK sort code must be 6 digits (with or without dashes).");
  }

  const ukAccountDigits = String(body?.ukAccountNumber || "").replace(/\D/g, "");
  if (!/^\d{8}$/.test(ukAccountDigits)) {
    throw new Error("UK account number must be exactly 8 digits.");
  }

  const recipientName = String(body?.recipientName || "").trim();
  if (!recipientName) throw new Error("US recipient name is required.");

  const usBankName = String(body?.usBankName || "").trim();
  if (!usBankName) throw new Error("US bank name is required.");

  const routing = String(body?.usRoutingNumber || "").replace(/\D/g, "");
  if (routing.length !== 9) {
    throw new Error("US ABA routing number must be 9 digits.");
  }

  const usAccountDigits = String(body?.usAccountNumber || "").replace(/\D/g, "");
  if (usAccountDigits.length < 4 || usAccountDigits.length > 17) {
    throw new Error("US account number must be between 4 and 17 digits.");
  }

  const amountGbp = Number(body?.amountGbp);
  if (!Number.isFinite(amountGbp) || amountGbp < 1 || amountGbp > 50_000) {
    throw new Error("amountGbp must be between 1 and 50000.");
  }

  return {
    senderName,
    ukSortCodeLast2: sortDigits.slice(4, 6),
    ukAccountLast4: ukAccountDigits.slice(-4),
    recipientName,
    usBankName,
    usRoutingLast4: routing.slice(-4),
    usAccountLast4: usAccountDigits.slice(-4),
    amountGbp
  };
}

/** US recipient address (Wise requires this for USD payouts). */
export function buildUsRecipientAddress(body) {
  const line1 = String(body?.usAddressLine || "").trim();
  const city = String(body?.usCity || "").trim();
  const state = String(body?.usState || "").trim();
  const zip = String(body?.usPostCode || "").trim();
  return {
    line1: line1 || process.env.WISE_DEFAULT_US_ADDRESS_LINE || "1 Sandbox Street",
    city: city || process.env.WISE_DEFAULT_US_CITY || "New York",
    state: (state || process.env.WISE_DEFAULT_US_STATE || "NY").slice(0, 2).toUpperCase(),
    zip: zip || process.env.WISE_DEFAULT_US_ZIP || "10001"
  };
}

export function shapePublicUkUsPayout(p) {
  const id = p._id ? String(p._id) : p.id;
  const createdAt =
    p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt || new Date().toISOString();
  const mode = p.payoutMode || "demo";
  const demoNote =
    "Demo payout rail: no real bank transfer. Production would use a licensed payout provider (Wise, Currencycloud, etc.).";
  const wiseNote =
    "Wise sandbox: a real API transfer was created on api.wise-sandbox.com. If status stays on pay-in waiting, open the Wise sandbox website and simulate funding the transfer.";
  return {
    id,
    corridor: p.corridor || CORRIDOR,
    sourceBank: p.sourceBank || SOURCE_BANK,
    senderName: p.senderName,
    ukSortCodeMasked: `**-**-${p.ukSortCodeLast2}`,
    ukAccountLast4: p.ukAccountLast4,
    recipientName: p.recipientName,
    usBankName: p.usBankName,
    usRoutingMasked: `*****${p.usRoutingLast4}`,
    usAccountLast4: p.usAccountLast4,
    amountGbp: p.amountGbp,
    estimatedUsdPayout: Math.round(p.estimatedUsdPayout * 100) / 100,
    status: p.status,
    providerRef: p.providerRef || "",
    payoutMode: mode,
    wiseTransferId: p.wiseTransferId || undefined,
    wiseRawStatus: p.wiseRawStatus || undefined,
    createdAt,
    note: mode === "wise_sandbox" ? wiseNote : demoNote
  };
}
