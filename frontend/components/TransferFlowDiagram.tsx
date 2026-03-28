"use client";

import { useEffect, useState } from "react";

export type TransferFlowTransfer = {
  id: string;
  usdAmount: number;
  usdcAmount: number;
  destinationAmount: number;
  destinationCurrency: string;
  destinationCountry: string;
  recipientBankName: string;
  recipientName: string;
  exchangeRate: number;
  txHash: string;
  chainSettlement?: "trc20_mint" | "trc20_stable" | "trx_sun" | "simulated";
  quoteSource?: string;
};

const STEP_MS = 520;

function shortHash(h: string) {
  const s = String(h || "");
  if (s.length <= 22) return s;
  return `${s.slice(0, 10)}…${s.slice(-8)}`;
}

function quoteLabel(source?: string) {
  if (!source || source === "fx_fallback") return "Estimated FX";
  if (source === "coinbase_rates") return "Coinbase";
  if (source === "bybit_p2p") return "Bybit P2P";
  return source.replace(/_/g, " ");
}

export function TransferFlowDiagram({ transfer }: { transfer: TransferFlowTransfer }) {
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    setVisible(0);
    const timers = [1, 2, 3, 4].map((n) =>
      setTimeout(() => setVisible(n), n * STEP_MS)
    );
    return () => timers.forEach(clearTimeout);
  }, [transfer.id]);

  const onChain =
    transfer.chainSettlement === "trc20_mint" ||
    transfer.chainSettlement === "trc20_stable" ||
    transfer.chainSettlement === "trx_sun";

  const steps: Array<{ title: string; detail: string; accent?: "emerald" | "orange" }> = [
    {
      title: "USD → USDC (stablecoin)",
      detail: `$${transfer.usdAmount.toFixed(2)} USD represented 1:1 as ${transfer.usdcAmount.toLocaleString(undefined, {
        maximumFractionDigits: 2
      })} USDC on the send rail.`,
      accent: "orange"
    },
    {
      title: `USDC → ${transfer.destinationCurrency}`,
      detail: `Foreign exchange: 1 USD ≈ ${transfer.exchangeRate.toFixed(4)} ${transfer.destinationCurrency} (${quoteLabel(
        transfer.quoteSource
      )}). You receive about ${transfer.destinationAmount.toLocaleString()} ${transfer.destinationCurrency}.`,
      accent: "orange"
    },
    {
      title: onChain ? "On-chain settlement (TRON Nile)" : "Settlement reference",
      detail: onChain
        ? `Testnet transaction on Nile records this send. ${shortHash(transfer.txHash)}`
        : `Tracking id ${shortHash(transfer.txHash)} for your receipt and Track page.`,
      accent: onChain ? "emerald" : "orange"
    },
    {
      title: "Payout to recipient bank",
      detail: `${transfer.destinationAmount.toLocaleString()} ${transfer.destinationCurrency} instructed to ${transfer.recipientBankName} in ${transfer.destinationCountry} for ${transfer.recipientName}.`,
      accent: "orange"
    }
  ];

  return (
    <div className="rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900/90 to-zinc-950 p-5 shadow-inner">
      <p className="mb-5 text-xs font-semibold uppercase tracking-wide text-zinc-500">How your transfer moves</p>
      <ul className="space-y-0">
        {steps.map((step, i) => {
          const show = visible > i;
          const ring =
            step.accent === "emerald"
              ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.15)]"
              : "border-orange-500/50 bg-orange-500/10 text-orange-200 shadow-[0_0_20px_rgba(251,146,60,0.12)]";
          const lineActive = visible > i + 1;
          return (
            <li
              key={step.title}
              className={`flex gap-4 transition-all duration-500 ease-out ${
                i < steps.length - 1 ? "pb-5" : ""
              } ${show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"}`}
              style={{ transitionDelay: show ? `${i * 45}ms` : "0ms" }}
            >
              <div className="flex shrink-0 flex-col items-center">
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-bold transition-all duration-500 ${
                    show ? `${ring} scale-100` : "scale-90 border-zinc-700 bg-zinc-900 text-zinc-600"
                  }`}
                >
                  {i + 1}
                </span>
                {i < steps.length - 1 ? (
                  <div
                    className={`my-1 w-px flex-1 min-h-[28px] transition-colors duration-500 ${
                      lineActive ? "bg-orange-500/35" : "bg-zinc-800"
                    }`}
                    aria-hidden
                  />
                ) : null}
              </div>
              <div
                className={`min-w-0 flex-1 rounded-xl border px-4 py-3 transition-all duration-500 ${
                  show
                    ? step.accent === "emerald"
                      ? "border-emerald-500/35 bg-emerald-950/20"
                      : "border-orange-500/25 bg-zinc-950/80"
                    : "border-zinc-800/50 bg-zinc-950/30"
                }`}
              >
                <p className="text-sm font-semibold text-white">{step.title}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">{step.detail}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
