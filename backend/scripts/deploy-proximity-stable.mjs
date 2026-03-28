/**
 * Deploy ProximityStable to TRON (Nile by default). Requires funded TRX on the deployer account.
 *
 * Usage (from repo root):
 *   cd backend && node scripts/deploy-proximity-stable.mjs
 *
 * Env: TRON_FULL_HOST, TRON_PRIVATE_KEY (same as backend/.env)
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TronWeb } from "tronweb";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const artifactPath = path.join(__dirname, "../../contracts/build/ProximityStable.json");

if (!fs.existsSync(artifactPath)) {
  console.error("Missing artifact. Run: cd backend && npm run compile:contract");
  process.exit(1);
}

const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
const fullHost = (process.env.TRON_FULL_HOST || "https://api.nileex.io").trim();
let pk = (process.env.TRON_PRIVATE_KEY || "").trim();
if (pk.startsWith("0x")) pk = pk.slice(2);
if (!pk || pk.length !== 64 || !/^[0-9a-fA-F]+$/.test(pk)) {
  console.error("Set TRON_PRIVATE_KEY in backend/.env to a 64-character hex private key (Nile test account with TRX).");
  process.exit(1);
}

const tronWeb = new TronWeb({
  fullHost,
  privateKey: pk
});

const feeLimit = Number(process.env.TRON_STABLE_DEPLOY_FEE_LIMIT || 200_000_000);

console.log("Deploying ProximityStable to", fullHost, "…");

const deployed = await tronWeb.contract(artifact.abi).new({
  feeLimit,
  callValue: 0,
  userFeePercentage: 100,
  abi: artifact.abi,
  bytecode: artifact.bytecode,
  parameters: []
});

const resolved = deployed?.address;
if (!resolved) {
  console.error("Deploy result:", deployed);
  throw new Error("Could not read contract address from deploy result.");
}

console.log("\nDeployed ProximityStable");
console.log("  Contract (base58):", resolved);
console.log("\nAdd to backend/.env:");
console.log(`  TRON_STABLE_CONTRACT=${resolved}`);
console.log(`  TRON_STABLE_USE_MINT=true`);
console.log(`  TRON_STABLE_TRANSFER_AMOUNT=1000`);
console.log("\nThe deployer wallet is the only minter. Settlement uses mint() to the receiver — no pre-funded token balance needed.");
