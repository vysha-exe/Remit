/**
 * Debug: verify Nile connectivity, wallet TRX balance, optional deployed contract.
 *
 * Run from backend/:  npm run check:tron
 * Uses TRON_FULL_HOST, TRON_PRIVATE_KEY, optional TRON_STABLE_CONTRACT from .env
 */
import "dotenv/config";
import { TronWeb } from "tronweb";

let pk = (process.env.TRON_PRIVATE_KEY || "").trim();
if (pk.startsWith("0x")) pk = pk.slice(2);
const fullHost = (process.env.TRON_FULL_HOST || "https://api.nileex.io").trim();

if (!pk || pk.length !== 64 || !/^[0-9a-fA-F]+$/.test(pk)) {
  console.error("Set TRON_PRIVATE_KEY in backend/.env (64 hex chars, Nile test key).");
  process.exit(1);
}

const tronWeb = new TronWeb({ fullHost, privateKey: pk });
const addr = tronWeb.defaultAddress.base58;

console.log("--- TRON Nile check ---");
console.log("TRON_FULL_HOST:", fullHost);
console.log("Wallet (base58):", addr);

try {
  const sun = await tronWeb.trx.getBalance(addr);
  const trx = Number(sun) / 1e6;
  console.log("TRX balance:", sun, "SUN (~" + trx.toFixed(2) + " TRX)");
  if (trx < 1) {
    console.warn("⚠ Low TRX: fund this address from a Nile faucet or deploy/mint/transfer may fail.");
  }
} catch (e) {
  console.error("getBalance failed:", e?.message || e);
}

const recv = process.env.TRON_RECEIVER_ADDRESS?.trim();
console.log("TRON_RECEIVER_ADDRESS:", recv || "(not set — settlement will stay simulated)");

const contractAddr = process.env.TRON_STABLE_CONTRACT?.trim();
if (!contractAddr) {
  console.log("TRON_STABLE_CONTRACT: (not set — uses 1 SUN TRX or simulated hash)");
  process.exit(0);
}

try {
  const c = await tronWeb.trx.getContract(contractAddr);
  const deployed = c?.contract_address || c?.contractAddress;
  if (deployed) {
    console.log("TRON_STABLE_CONTRACT: OK — contract exists on this network");
    console.log("  ", typeof deployed === "string" && deployed.startsWith("T") ? deployed : contractAddr);
  } else {
    console.warn("TRON_STABLE_CONTRACT: unexpected getContract response:", JSON.stringify(c).slice(0, 200));
  }
} catch (e) {
  console.error("TRON_STABLE_CONTRACT: not found or wrong network —", e?.message || e);
  console.error("  Use Nile + a base58 contract address from deploy:stable.");
}

console.log("TRON_STABLE_USE_MINT:", process.env.TRON_STABLE_USE_MINT || "(unset/false)");
console.log("TRON_STABLE_TRANSFER_AMOUNT:", process.env.TRON_STABLE_TRANSFER_AMOUNT || "1000 (default)");
