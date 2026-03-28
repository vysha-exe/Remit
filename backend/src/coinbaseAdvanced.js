import crypto from "node:crypto";
import { generateJwt } from "@coinbase/cdp-sdk/auth";

const REQUEST_HOST = "api.coinbase.com";
const BASE_URL = `https://${REQUEST_HOST}`;

function normalizePemSecret(secret) {
  if (!secret) return "";
  if (secret.includes("\\n")) return secret.replace(/\\n/g, "\n");
  return secret;
}

function getCdpCredentials() {
  const apiKeyId = (
    process.env.COINBASE_CDP_API_KEY_ID ||
    process.env.COINBASE_API_KEY_NAME ||
    ""
  ).trim();
  const apiKeySecret = normalizePemSecret(
    (process.env.COINBASE_CDP_API_KEY_SECRET || process.env.COINBASE_API_KEY_SECRET || "").trim()
  );
  return { apiKeyId, apiKeySecret };
}

export function isAdvancedTradeConfigured() {
  const { apiKeyId, apiKeySecret } = getCdpCredentials();
  return Boolean(apiKeyId && apiKeySecret);
}

/**
 * Signed request to Coinbase Advanced Trade (brokerage) REST API.
 * @param {string} method
 * @param {string} path e.g. /api/v3/brokerage/accounts
 * @param {object} [body]
 */
export async function advancedTradeRequest(method, path, body) {
  const { apiKeyId, apiKeySecret } = getCdpCredentials();
  if (!apiKeyId || !apiKeySecret) {
    const err = new Error(
      "Set COINBASE_CDP_API_KEY_ID and COINBASE_CDP_API_KEY_SECRET (CDP key name + secret from Developer Platform)."
    );
    err.status = 400;
    throw err;
  }

  const jwt = await generateJwt({
    apiKeyId,
    apiKeySecret,
    requestMethod: method,
    requestHost: REQUEST_HOST,
    requestPath: path
  });

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      Accept: "application/json"
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
    const msg =
      data.message ||
      data.error ||
      (Array.isArray(data.errors) && data.errors.map((e) => e.message || e).join("; ")) ||
      text ||
      res.statusText;
    const err = new Error(typeof msg === "string" ? msg : `HTTP ${res.status}`);
    err.status = res.status;
    err.details = data;
    throw err;
  }

  return data;
}

export async function listBrokerageAccounts() {
  return advancedTradeRequest("GET", "/api/v3/brokerage/accounts");
}

/**
 * Market IOC buy USDC using USD (product USDC-USD). Uses available USD cash in the brokerage account.
 * @param {string} quoteSizeUsd e.g. "5.00"
 */
export async function createMarketBuyUsdcOrder(quoteSizeUsd) {
  const body = {
    client_order_id: crypto.randomUUID(),
    product_id: "USDC-USD",
    side: "BUY",
    order_configuration: {
      market_market_ioc: {
        quote_size: String(quoteSizeUsd)
      }
    }
  };
  return advancedTradeRequest("POST", "/api/v3/brokerage/orders", body);
}
