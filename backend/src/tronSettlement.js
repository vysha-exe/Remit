import crypto from "node:crypto";

/** Minimal ERC-20 / TRC-20 `transfer(address,uint256)` ABI */
const TRC20_TRANSFER_ABI = [
  {
    constant: false,
    inputs: [
      { name: "_to", type: "address" },
      { name: "_value", type: "uint256" }
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    type: "function",
    stateMutability: "nonpayable"
  }
];

/** `mint(address,uint256)` — deployer-owned ProximityStable on Nile */
const TRC20_MINT_ABI = [
  {
    constant: false,
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    name: "mint",
    outputs: [],
    type: "function",
    stateMutability: "nonpayable"
  }
];

export function buildMockTxHash() {
  return `0x${crypto.randomBytes(32).toString("hex")}`;
}

function extractTxId(result) {
  if (!result) return "";
  if (typeof result === "string") return result;
  return result.txid || result.txID || result.transaction?.txID || "";
}

/** TRON tx ids are 32-byte hex; Tronscan URLs use lowercase without 0x. */
function normalizeTronTxId(id) {
  const s = String(id || "").trim();
  const hex = s.replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return s;
  return hex.toLowerCase();
}

/**
 * After wallet/broadcasttransaction, `txid` may still be present when result is false
 * (e.g. SIGERROR) — that id is not reliably on-chain. Only treat as success when broadcast accepted.
 */
function isTronBroadcastAccepted(tx) {
  if (!tx || typeof tx !== "object") return false;
  if (tx.result === false) return false;
  if (tx.code != null && String(tx.code).length > 0) return false;
  return true;
}

/**
 * On-chain settlement for a transfer record (Nile / Shasta / mainnet via TRON_FULL_HOST).
 *
 * Order of attempt:
 * 1) If `TRON_STABLE_CONTRACT` + `TRON_STABLE_USE_MINT=true` — `mint(receiver, amount)` (deployer must be same key as `TRON_PRIVATE_KEY`).
 * 2) Else if `TRON_STABLE_CONTRACT` — TRC-20 `transfer` from your wallet (fund wallet with that token).
 * 3) Else — 1 SUN native TRX to `TRON_RECEIVER_ADDRESS` (real micro-transfer).
 * 4) Else — deterministic-looking reference id (in-app tracking only; not on-chain).
 *
 * Deploy **ProximityStable** (`npm run deploy:stable` in `backend/`) and set the env vars above for a full mint path on Nile.
 *
 * @param {import("tronweb").TronWeb | null | undefined} tron
 * @returns {Promise<{ txHash: string; chainSettlement: "trc20_mint" | "trc20_stable" | "trx_sun" | "simulated"; chainNote: string }>}
 */
export async function executeChainSettlement(tron) {
  const receiver = process.env.TRON_RECEIVER_ADDRESS?.trim();

  if (!receiver || !tron) {
    return {
      txHash: buildMockTxHash(),
      chainSettlement: "simulated",
      chainNote: "Set TRON_PRIVATE_KEY and TRON_RECEIVER_ADDRESS for real Nile transfers."
    };
  }

  const stableContract = process.env.TRON_STABLE_CONTRACT?.trim();
  const amountStr = (process.env.TRON_STABLE_TRANSFER_AMOUNT ?? "1000").trim();
  const useMint = process.env.TRON_STABLE_USE_MINT === "true";
  const feeLimit = Number(process.env.TRON_STABLE_FEE_LIMIT || 150_000_000);

  if (stableContract && useMint) {
    try {
      const contract = await tron.contract(TRC20_MINT_ABI, stableContract);
      const txid = await contract.mint(receiver, amountStr).send({ feeLimit });
      const id = normalizeTronTxId(typeof txid === "string" ? txid : extractTxId(txid));
      if (id && /^[0-9a-f]{64}$/.test(id)) {
        return {
          txHash: id,
          chainSettlement: "trc20_mint",
          chainNote: `TRC-20 mint to receiver (${amountStr} smallest units). Deployer wallet must be contract owner.`
        };
      }
    } catch (err) {
      console.warn("[tron] TRC-20 mint failed, trying transfer / TRX:", err?.message || err);
    }
  }

  if (stableContract) {
    try {
      const contract = await tron.contract(TRC20_TRANSFER_ABI, stableContract);
      const txid = await contract.transfer(receiver, amountStr).send({ feeLimit });
      const id = normalizeTronTxId(typeof txid === "string" ? txid : extractTxId(txid));
      if (id && /^[0-9a-f]{64}$/.test(id)) {
        return {
          txHash: id,
          chainSettlement: "trc20_stable",
          chainNote: `TRC-20 transfer (${amountStr} smallest units). Fund the sender wallet with the test token.`
        };
      }
    } catch (err) {
      console.warn("[tron] TRC-20 transfer failed, trying TRX:", err?.message || err);
    }
  }

  try {
    const tx = await tron.trx.sendTransaction(receiver, 1);
    const rawId = extractTxId(tx) || tx?.transaction?.txID;
    const id = normalizeTronTxId(rawId);
    if (id && /^[0-9a-f]{64}$/.test(id) && isTronBroadcastAccepted(tx)) {
      return {
        txHash: id,
        chainSettlement: "trx_sun",
        chainNote: "1 SUN TRX sent on-chain (no stablecoin contract configured)."
      };
    }
    if (rawId && !isTronBroadcastAccepted(tx)) {
      console.warn(
        "[tron] TRX broadcast not accepted (tx not on-chain):",
        tx?.code || "",
        tx?.message || "",
        "txid in response:",
        rawId
      );
    }
  } catch (err) {
    console.warn("[tron] TRX send failed:", err?.message || err);
  }

  return {
    txHash: buildMockTxHash(),
    chainSettlement: "simulated",
    chainNote: "On-chain send failed or returned no tx id; using in-app reference only."
  };
}
