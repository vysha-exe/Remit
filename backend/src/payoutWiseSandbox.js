import crypto from "node:crypto";

/**
 * UK → US payout via Wise **sandbox** (https://api.wise-sandbox.com).
 * Requires a Personal API token from the Wise sandbox environment.
 * @see https://docs.wise.com/guides/developer/environments
 */

export function isWiseSandboxPayoutEnabled() {
  const mode = String(process.env.PAYOUT_UK_US_MODE || "").toLowerCase();
  return mode === "wise_sandbox" && Boolean(process.env.WISE_API_TOKEN?.trim());
}

async function wiseRequest(method, path, body) {
  const base = (process.env.WISE_API_BASE || "https://api.wise-sandbox.com").replace(/\/$/, "");
  const token = process.env.WISE_API_TOKEN?.trim();
  if (!token) throw new Error("WISE_API_TOKEN is not set.");

  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const errMsg =
      (Array.isArray(data.errors) && data.errors.map((e) => e.message).join("; ")) ||
      data.error ||
      data.message ||
      text ||
      `HTTP ${res.status}`;
    const err = new Error(errMsg);
    err.status = res.status;
    err.details = data;
    throw err;
  }

  return data;
}

export async function wiseGetProfileId() {
  const explicit = process.env.WISE_PROFILE_ID?.trim();
  if (explicit) {
    const n = Number(explicit);
    if (!Number.isFinite(n)) throw new Error("WISE_PROFILE_ID must be a number.");
    return n;
  }

  const profiles = await wiseRequest("GET", "/v1/profiles");
  const list = Array.isArray(profiles) ? profiles : [];
  if (list.length === 0) {
    throw new Error(
      "No Wise profiles for this token. Log into wise-sandbox.com, complete onboarding, then retry."
    );
  }

  const prefer = (process.env.WISE_PROFILE_TYPE || "personal").toLowerCase();
  const match = list.find((p) => String(p.type || "").toLowerCase() === prefer);
  return (match || list[0]).id;
}

/**
 * @param {object} address
 * @param {string} address.line1
 * @param {string} address.city
 * @param {string} address.state 2-letter US state
 * @param {string} address.zip
 */
export async function wiseCreateUsdRecipient(profileId, { accountHolderName, routing, accountNumber, address }) {
  const payload = {
    currency: "USD",
    type: "aba",
    profile: profileId,
    accountHolderName,
    ownedByCustomer: false,
    details: {
      legalType: "PRIVATE",
      abartn: routing,
      accountNumber: String(accountNumber).replace(/\D/g, ""),
      accountType: "CHECKING",
      address: {
        country: "US",
        state: address.state,
        city: address.city,
        firstLine: address.line1,
        postCode: address.zip
      }
    }
  };

  return wiseRequest("POST", "/v1/accounts", payload);
}

export async function wiseCreateGbpToUsdQuote(profileId, sourceAmountGbp, targetAccountId) {
  return wiseRequest("POST", `/v3/profiles/${profileId}/quotes`, {
    sourceCurrency: "GBP",
    targetCurrency: "USD",
    sourceAmount: Number(sourceAmountGbp),
    targetAccount: targetAccountId
  });
}

export async function wiseCreateTransfer(quoteUuid, targetAccountId, customerTransactionId) {
  return wiseRequest("POST", "/v1/transfers", {
    targetAccount: targetAccountId,
    quoteUuid,
    customerTransactionId,
    details: {
      reference: "Remit UK-US sandbox"
    }
  });
}

export async function wiseGetTransfer(transferId) {
  return wiseRequest("GET", `/v1/transfers/${transferId}`);
}

export function mapWiseTransferStatusToPayout(wiseStatus) {
  const s = String(wiseStatus || "").toLowerCase();
  if (
    s.includes("cancel") ||
    s.includes("refund") ||
    s.includes("bounce") ||
    s.includes("reject") ||
    s.includes("failed")
  ) {
    return "Failed";
  }
  if (
    s.includes("outgoing_payment_sent") ||
    s.includes("delivered") ||
    s.includes("paid_out") ||
    s.includes("completed")
  ) {
    return "Completed";
  }
  if (s.includes("incoming_payment_waiting")) {
    return "Submitted";
  }
  return "Processing";
}

/**
 * Creates recipient → quote (GBP→USD) → transfer on Wise sandbox.
 * @returns {Promise<{ wiseTransferId: number, wiseQuoteUuid: string, wiseStatus: string, estimatedUsdPayout: number }>}
 */
export async function runWiseUkUsPayout({
  recipientName,
  routing,
  accountNumber,
  amountGbp,
  address
}) {
  const profileId = await wiseGetProfileId();

  const recipient = await wiseCreateUsdRecipient(profileId, {
    accountHolderName: recipientName,
    routing,
    accountNumber,
    address
  });

  const recipientId = recipient.id;
  if (!recipientId) {
    throw new Error("Wise did not return a recipient id.");
  }

  const quote = await wiseCreateGbpToUsdQuote(profileId, amountGbp, recipientId);
  const quoteUuid = quote.id;
  if (!quoteUuid) {
    throw new Error("Wise did not return a quote id.");
  }

  const estimatedUsdPayout =
    typeof quote.targetAmount === "number"
      ? quote.targetAmount
      : quote.paymentOptions?.find((o) => !o.disabled)?.targetAmount ?? 0;

  const transfer = await wiseCreateTransfer(quoteUuid, recipientId, crypto.randomUUID());

  return {
    wiseTransferId: transfer.id,
    wiseQuoteUuid: quoteUuid,
    wiseStatus: transfer.status || "unknown",
    estimatedUsdPayout: Math.round(Number(estimatedUsdPayout) * 100) / 100
  };
}
