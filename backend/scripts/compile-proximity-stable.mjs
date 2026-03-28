import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../..");
const sourcePath = path.join(root, "contracts", "ProximityStable.sol");
const outPath = path.join(root, "contracts", "build", "ProximityStable.json");

const source = fs.readFileSync(sourcePath, "utf8");
const input = {
  language: "Solidity",
  sources: {
    "ProximityStable.sol": { content: source }
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object"]
      }
    }
  }
};

const raw = solc.compile(JSON.stringify(input));
const output = JSON.parse(raw);
if (output.errors) {
  const fatal = output.errors.filter((e) => e.severity === "error");
  if (fatal.length) {
    console.error(fatal.map((e) => e.formattedMessage).join("\n"));
    process.exit(1);
  }
}

const compiled = output.contracts["ProximityStable.sol"]?.ProximityStable;
if (!compiled?.abi || !compiled?.evm?.bytecode?.object) {
  console.error("Compile produced no ProximityStable artifact.");
  process.exit(1);
}

const bytecode = compiled.evm.bytecode.object;
const artifact = {
  contractName: "ProximityStable",
  abi: compiled.abi,
  bytecode: bytecode.startsWith("0x") ? bytecode : `0x${bytecode}`
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2));
console.log("Wrote", outPath);
