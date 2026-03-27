"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

type Transfer = {
  id: string;
  recipientName: string;
  destinationCountry: string;
  destinationCurrency: string;
  destinationAmount: number;
  usdAmount: number;
  feeUsd: number;
  txHash: string;
  status: "Pending" | "Confirmed" | "Completed" | "Failed";
  estimatedCompletionMinutes: number;
  createdAt: string;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function TrackPage() {
  const [txHash, setTxHash] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [transfer, setTransfer] = useState<Transfer | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setTransfer(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/transfers/${encodeURIComponent(txHash.trim())}`);
      const data = (await response.json()) as { transfer?: Transfer; message?: string };
      if (!response.ok || !data.transfer) {
        setError(data.message || "Transfer not found. Check the transaction hash and try again.");
        return;
      }
      setTransfer(data.transfer);
    } catch {
      setError("Unable to track transfer right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold text-white">Track Payment</h1>
            <Link href="/" className="text-sm text-orange-300 hover:text-orange-200">
              Back to Send Money
            </Link>
          </div>
          <p className="mt-2 text-sm text-zinc-400">
            Enter a transaction hash to view transfer status and delivery details.
          </p>

          <form className="mt-6 space-y-3" onSubmit={handleSubmit}>
            <input
              type="text"
              value={txHash}
              onChange={(e) => setTxHash(e.target.value)}
              placeholder="0xabc123..."
              className="w-full rounded-xl border border-zinc-600 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-orange-500"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-medium text-zinc-950 transition hover:bg-orange-400 disabled:opacity-60"
            >
              {loading ? "Tracking..." : "Track payment"}
            </button>
          </form>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}
        </section>

        {transfer ? (
          <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <h2 className="text-lg font-semibold text-white">Transfer Details</h2>
            <div className="mt-4 space-y-3 text-sm">
              <Row label="Recipient" value={transfer.recipientName} />
              <Row label="Sent" value={`$${transfer.usdAmount.toFixed(2)}`} />
              <Row
                label="Received"
                value={`${transfer.destinationAmount.toLocaleString()} ${transfer.destinationCurrency}`}
              />
              <Row label="Country" value={transfer.destinationCountry} />
              <Row label="Fee" value={`$${transfer.feeUsd.toFixed(2)}`} />
              <Row label="ETA" value={`~${transfer.estimatedCompletionMinutes} minutes`} />
              <Row label="Status" value={transfer.status} />
              <Row label="TX Hash" value={transfer.txHash} mono />
              <StatusTimeline status={transfer.status} />
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
      <span className="text-zinc-400">{label}</span>
      <span className={mono ? "font-mono text-xs text-zinc-200" : "font-medium text-zinc-200"}>{value}</span>
    </div>
  );
}

function StatusTimeline({ status }: { status: Transfer["status"] }) {
  const steps: Array<"Pending" | "Confirmed" | "Completed"> = ["Pending", "Confirmed", "Completed"];
  const activeIndex = steps.indexOf(status === "Failed" ? "Pending" : status);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-400">Transfer Progress</p>
      <div className="grid grid-cols-3 gap-2">
        {steps.map((step, index) => {
          const isActive = index <= activeIndex;
          return (
            <div key={step} className="flex flex-col items-center gap-2">
              <span
                className={`h-2.5 w-full rounded-full transition-all ${
                  isActive ? "bg-orange-400 shadow-[0_0_12px_rgba(251,146,60,0.55)]" : "bg-zinc-700"
                }`}
              />
              <span className={isActive ? "text-xs text-orange-300" : "text-xs text-zinc-500"}>{step}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
