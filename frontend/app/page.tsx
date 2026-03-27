"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

type SendResponse = {
  id: string;
  senderName: string;
  recipientName: string;
  recipientBankName: string;
  recipientBankAccountNumber: string;
  recipientCardholderName: string;
  recipientCardLast4: string;
  destinationCountry: string;
  destinationCurrency: string;
  usdAmount: number;
  usdcAmount: number;
  destinationAmount: number;
  exchangeRate: number;
  status: "Pending" | "Confirmed" | "Completed" | "Failed";
  txHash: string;
  estimatedCompletionMinutes: number;
  createdAt: string;
  source: string;
  feeUsd: number;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
type Country = { code: string; name: string };
type FxRateResponse = {
  countryCode: string;
  countryName: string;
  currency: string;
  usdToDestinationRate: number;
  asOf: string;
};
const FALLBACK_COUNTRIES: Country[] = [
  { code: "IN", name: "India" },
  { code: "LK", name: "Sri Lanka" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "AU", name: "Australia" },
  { code: "SG", name: "Singapore" },
  { code: "MY", name: "Malaysia" },
  { code: "PH", name: "Philippines" },
  { code: "NG", name: "Nigeria" },
  { code: "KE", name: "Kenya" },
  { code: "BD", name: "Bangladesh" },
  { code: "PK", name: "Pakistan" },
  { code: "NP", name: "Nepal" }
];
const BANKS_UK = [
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
];
const BANKS_CHINA = [
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
];
const BANKS_RUSSIA = [
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
];
const BANKS_FRANCE = [
  "BNP Paribas",
  "Crédit Agricole",
  "Société Générale",
  "Groupe BPCE (Banque Populaire / Caisse d'Épargne)",
  "Crédit Mutuel",
  "La Banque Postale",
  "HSBC France",
  "Boursorama Banque"
];
const BANKS_GERMANY = [
  "Deutsche Bank",
  "Commerzbank",
  "KfW",
  "DZ Bank",
  "UniCredit Bank (HypoVereinsbank)",
  "Sparkasse",
  "Volksbank",
  "N26",
  "ING-DiBa"
];
const BANKS_BY_COUNTRY_CODE: Record<string, string[]> = {
  GB: BANKS_UK,
  CN: BANKS_CHINA,
  RU: BANKS_RUSSIA,
  FR: BANKS_FRANCE,
  DE: BANKS_GERMANY
};

const CHINA_BANKS = [
  "Bank of China",
  "Industrial and Commercial Bank of China",
  "Agricultural Bank of China",
  "Bank of Communications",
  "China Construction Bank",
  "China Merchants Bank",
  "Ping An Bank",
  "China Everbright Bank",
  "China CITIC Bank",
  "China Construction Bank (Hong Kong)",
  "Bank of Beijing",
  "China Guangfa Bank",
]

function formatCardNumber(value: string) {
  return value
    .replace(/\D/g, "")
    .slice(0, 16)
    .replace(/(.{4})/g, "$1 ")
    .trim();
}

export default function HomePage() {
  const [amount, setAmount] = useState("100");
  const [senderName, setSenderName] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientBankName, setRecipientBankName] = useState("");
  const [bankDropdownOpen, setBankDropdownOpen] = useState(false);
  const [recipientBankAccountNumber, setRecipientBankAccountNumber] = useState("");
  const [recipientCardholderName, setRecipientCardholderName] = useState("");
  const [recipientCardNumber, setRecipientCardNumber] = useState("");
  const [recipientCardExpiry, setRecipientCardExpiry] = useState("");
  const [recipientCardCvv, setRecipientCardCvv] = useState("");
  const [confirmVerification, setConfirmVerification] = useState(false);
  const [destinationCode, setDestinationCode] = useState("");
  const [countryInput, setCountryInput] = useState("");
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countries, setCountries] = useState<Country[]>([]);
  const [fxRate, setFxRate] = useState<FxRateResponse | null>(null);
  const [rateError, setRateError] = useState("");
  const [lastTransfer, setLastTransfer] = useState<SendResponse | null>(null);
  const [history, setHistory] = useState<SendResponse[]>([]);
  const countryRef = useRef<HTMLDivElement | null>(null);
  const bankRef = useRef<HTMLDivElement | null>(null);

  const receivePreview = useMemo(() => {
    const n = Number(amount);
    if (Number.isNaN(n) || n <= 0) return "0";
    return Math.round(n * (fxRate?.usdToDestinationRate || 0)).toLocaleString();
  }, [amount, fxRate?.usdToDestinationRate]);
  const filteredCountries = useMemo(() => {
    const q = countryInput.trim().toLowerCase();
    if (!q) return countries.slice(0, 12);

    const ranked = countries
      .map((country) => {
        const name = country.name.toLowerCase();
        if (name.startsWith(q)) return { country, score: 0 };
        if (name.split(" ").some((part) => part.startsWith(q))) return { country, score: 1 };
        if (name.includes(q)) return { country, score: 2 };
        return null;
      })
      .filter((item): item is { country: Country; score: number } => item !== null)
      .sort((a, b) => (a.score - b.score) || a.country.name.localeCompare(b.country.name));

    return ranked.map((item) => item.country).slice(0, 12);
  }, [countries, countryInput]);
  const activeBankList = useMemo(() => BANKS_BY_COUNTRY_CODE[destinationCode] || [], [destinationCode]);
  const filteredBanks = useMemo(() => {
    const q = recipientBankName.trim().toLowerCase();
    if (activeBankList.length === 0) return [];
    if (!q) return activeBankList;

    return activeBankList.filter((bank) => bank.toLowerCase().includes(q)).sort((a, b) => {
      const aStarts = a.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.toLowerCase().startsWith(q) ? 0 : 1;
      return aStarts - bStarts || a.localeCompare(b);
    });
  }, [recipientBankName, activeBankList]);

  async function loadHistory() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/transfers`);
      if (!response.ok) return;
      const data = (await response.json()) as { transfers: SendResponse[] };
      setHistory(data.transfers || []);
    } catch {
      // Ignore silent errors for optional dashboard section.
    }
  }

  useEffect(() => {
    async function loadCountries() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/countries`);
        if (!response.ok) {
          setCountries(FALLBACK_COUNTRIES);
          return;
        }
        const data = (await response.json()) as { countries: Country[] };
        if (!data.countries || data.countries.length === 0) {
          setCountries(FALLBACK_COUNTRIES);
          return;
        }
        setCountries(data.countries);
      } catch {
        setCountries(FALLBACK_COUNTRIES);
      }
    }

    loadCountries();
    loadHistory();
  }, []);

  useEffect(() => {
    let active = true;
    if (!destinationCode) {
      setFxRate(null);
      return () => {
        active = false;
      };
    }

    async function loadFxRate() {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/fx-rate?countryCode=${encodeURIComponent(destinationCode)}`
        );
        const data = (await response.json()) as FxRateResponse | { message: string };
        if (!response.ok || "message" in data) {
          if (active) setRateError("Live FX rate unavailable right now.");
          return;
        }
        if (active) {
          setFxRate(data);
          setRateError("");
        }
      } catch {
        if (active) setRateError("Live FX rate unavailable right now.");
      }
    }

    loadFxRate();
    const interval = setInterval(loadFxRate, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [destinationCode]);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (!countryRef.current?.contains(event.target as Node)) {
        setCountryDropdownOpen(false);
      }
      if (!bankRef.current?.contains(event.target as Node)) {
        setBankDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function handleCountryTextInput(value: string) {
    setCountryInput(value);
    setCountryDropdownOpen(true);
    const matched = countries.find((country) => country.name.toLowerCase() === value.toLowerCase());
    if (matched) {
      setDestinationCode(matched.code);
      setRateError("");
      return;
    }
    setDestinationCode("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const matchedCountry = countries.find(
        (country) => country.name.toLowerCase() === countryInput.trim().toLowerCase()
      );
      if (!matchedCountry) {
        setError("Please select a valid destination country from the suggestions.");
        setLoading(false);
        return;
      }
      const bankList = BANKS_BY_COUNTRY_CODE[matchedCountry.code] || [];
      const matchedBank =
        bankList.length === 0
          ? recipientBankName.trim()
          : bankList.find((bank) => bank.toLowerCase() === recipientBankName.trim().toLowerCase());
      if (!matchedBank) {
        setError("Please select a valid bank from the suggestions.");
        setLoading(false);
        return;
      }
      if (!confirmVerification) {
        setError("Please confirm payment verification details before sending.");
        setLoading(false);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountUsd: Number(amount),
          senderName,
          recipientName,
          recipientBankName: matchedBank,
          recipientBankAccountNumber,
          recipientCardholderName,
          recipientCardNumber,
          destinationCode: matchedCountry.code
        })
      });

      const data = (await response.json()) as SendResponse | { message: string };
      if (!response.ok) {
        setError(
          "message" in data
            ? data.message
            : "Transaction failed. Please retry or check wallet balance."
        );
        return;
      }

      setLastTransfer(data as SendResponse);
      setSenderName("");
      setRecipientName("");
      setRecipientBankName("");
      setRecipientBankAccountNumber("");
      setRecipientCardholderName("");
      setRecipientCardNumber("");
      setRecipientCardExpiry("");
      setRecipientCardCvv("");
      setConfirmVerification(false);
      setCountryInput("");
      setDestinationCode("");
      await loadHistory();
    } catch {
      setError("Transaction failed. Please retry or check wallet balance.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <section className="mb-8 rounded-3xl border border-orange-500/35 bg-gradient-to-r from-zinc-900 to-zinc-800 p-7 shadow-lg shadow-orange-500/20">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-orange-400">Remit</p>
              <h1 className="mt-2 text-3xl font-semibold text-white md:text-4xl">
                Global transfers made simple.
              </h1>
              <p className="mt-3 max-w-2xl text-zinc-300">
                A modern web app that feels like everyday banking, with fast settlement handled quietly in the backend.
              </p>
            </div>
            <span className="hidden rounded-full border border-orange-500/50 bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-300 md:inline-flex">
              Zero user fees
            </span>
          </div>
          <div className="mt-5">
            <Link
              href="/track"
              className="inline-flex items-center rounded-lg border border-zinc-600 px-3 py-2 text-sm text-zinc-100 transition hover:border-orange-400 hover:text-orange-300"
            >
              Track a payment by TX hash
            </Link>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-white">Send Money</h2>
            <p className="mt-1 text-sm text-zinc-400">From United States to any destination country</p>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-300">Sender name</span>
                <input
                  type="text"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  className="w-full rounded-xl border border-zinc-600 bg-zinc-950 px-4 py-2.5 text-white outline-none focus:border-orange-500"
                  placeholder="Your full name"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-300">Amount (USD)</span>
                <input
                  type="number"
                  min={1}
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-xl border border-zinc-600 bg-zinc-950 px-4 py-2.5 text-white outline-none focus:border-orange-500"
                  placeholder="100"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-300">Recipient name</span>
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className="w-full rounded-xl border border-zinc-600 bg-zinc-950 px-4 py-2.5 text-white outline-none focus:border-orange-500"
                  placeholder="Recipient full name"
                  required
                />
              </label>

              <div className="block" ref={countryRef}>
                <span className="mb-1 block text-sm font-medium text-zinc-300">
                  Destination country (search or pick)
                </span>
                <input
                  value={countryInput}
                  onChange={(e) => handleCountryTextInput(e.target.value)}
                  onFocus={() => setCountryDropdownOpen(true)}
                  className="w-full rounded-xl border border-zinc-600 bg-zinc-950 px-4 py-2.5 text-white outline-none focus:border-orange-500"
                  placeholder="Country"
                  required
                />
                {countryDropdownOpen && filteredCountries.length > 0 ? (
                  <div className="mt-2 max-h-52 overflow-auto rounded-xl border border-zinc-700 bg-zinc-900">
                    {filteredCountries.map((item) => (
                      <button
                        type="button"
                        key={item.code}
                        onClick={() => {
                          setCountryInput(item.name);
                          setDestinationCode(item.code);
                          setCountryDropdownOpen(false);
                          setRateError("");
                        }}
                        className="block w-full border-b border-zinc-800 px-4 py-2 text-left text-sm text-zinc-200 last:border-b-0 hover:bg-zinc-800"
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                ) : null}
                {countryDropdownOpen && countryInput.trim() && filteredCountries.length === 0 ? (
                  <div className="mt-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-400">
                    No close matches found.
                  </div>
                ) : null}
              </div>

              <div className="block" ref={bankRef}>
                <span className="mb-1 block text-sm font-medium text-zinc-300">Recipient bank institution</span>
                <input
                  type="text"
                  value={recipientBankName}
                  onChange={(e) => {
                    setRecipientBankName(e.target.value);
                    if (activeBankList.length > 0) setBankDropdownOpen(true);
                  }}
                  onFocus={() => {
                    if (activeBankList.length > 0) setBankDropdownOpen(true);
                  }}
                  className="w-full rounded-xl border border-zinc-600 bg-zinc-950 px-4 py-2.5 text-white outline-none focus:border-orange-500"
                  placeholder={activeBankList.length > 0 ? "Type bank name" : "Bank name"}
                  required
                />
                {activeBankList.length > 0 && bankDropdownOpen && filteredBanks.length > 0 ? (
                  <div className="mt-2 max-h-52 overflow-auto rounded-xl border border-zinc-700 bg-zinc-900">
                    {filteredBanks.map((bank) => (
                      <button
                        type="button"
                        key={bank}
                        onClick={() => {
                          setRecipientBankName(bank);
                          setBankDropdownOpen(false);
                        }}
                        className="block w-full border-b border-zinc-800 px-4 py-2 text-left text-sm text-zinc-200 last:border-b-0 hover:bg-zinc-800"
                      >
                        {bank}
                      </button>
                    ))}
                  </div>
                ) : null}
                {activeBankList.length > 0 && bankDropdownOpen && recipientBankName.trim() && filteredBanks.length === 0 ? (
                  <div className="mt-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-400">
                    No matching bank found.
                  </div>
                ) : null}
              </div>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-300">Recipient bank account number</span>
                <input
                  type="text"
                  value={recipientBankAccountNumber}
                  onChange={(e) => setRecipientBankAccountNumber(e.target.value)}
                  className="w-full rounded-xl border border-zinc-600 bg-zinc-950 px-4 py-2.5 text-white outline-none focus:border-orange-500"
                  placeholder="Account number"
                  required
                />
              </label>

              <div className="rounded-xl border border-zinc-700 bg-zinc-950 p-4">
                <p className="mb-3 text-sm font-medium text-zinc-200">Recipient card verification (demo UI)</p>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={recipientCardholderName}
                    onChange={(e) => setRecipientCardholderName(e.target.value)}
                    className="w-full rounded-xl border border-zinc-600 bg-zinc-900 px-4 py-2.5 text-white outline-none focus:border-orange-500"
                    placeholder="Cardholder name"
                    required
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9 ]*"
                    value={recipientCardNumber}
                    onChange={(e) => setRecipientCardNumber(formatCardNumber(e.target.value))}
                    className="w-full rounded-xl border border-zinc-600 bg-zinc-900 px-4 py-2.5 text-white outline-none focus:border-orange-500"
                    placeholder="Card number"
                    required
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={recipientCardExpiry}
                      onChange={(e) => setRecipientCardExpiry(e.target.value)}
                      className="w-full rounded-xl border border-zinc-600 bg-zinc-900 px-4 py-2.5 text-white outline-none focus:border-orange-500"
                      placeholder="MM/YY"
                      required
                    />
                    <input
                      type="password"
                      value={recipientCardCvv}
                      onChange={(e) => setRecipientCardCvv(e.target.value)}
                      className="w-full rounded-xl border border-zinc-600 bg-zinc-900 px-4 py-2.5 text-white outline-none focus:border-orange-500"
                      placeholder="CVV"
                      required
                    />
                  </div>
                </div>
              </div>

              <label className="flex items-start gap-2 rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={confirmVerification}
                  onChange={(e) => setConfirmVerification(e.target.checked)}
                  className="mt-1"
                />
                <span>I confirm recipient bank and card verification details are correct.</span>
              </label>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-orange-500 px-4 py-2.5 font-medium text-zinc-950 transition hover:bg-orange-400 disabled:opacity-60"
              >
                {loading ? "Sending..." : "Send"}
              </button>
            </form>

            {error ? (
              <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
            <div className="rounded-xl border border-orange-500/40 bg-orange-500/10 p-4 text-sm text-orange-100">
              <p className="text-sm font-medium text-orange-200">Estimated receive</p>
              <p className="mt-2 text-base font-semibold text-white">
                {fxRate?.currency || "..."} {receivePreview}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                {fxRate ? `1 USD = ${fxRate.usdToDestinationRate.toFixed(4)} ${fxRate.currency}` : "Loading rate..."}
              </p>
              {rateError ? <p className="mt-2 text-xs text-amber-300">{rateError}</p> : null}
            </div>
            <h2 className="mt-6 text-xl font-semibold text-white">Transaction</h2>
            {!lastTransfer ? (
              <p className="mt-3 text-sm text-zinc-400">No transfer yet. Send one to see details.</p>
            ) : (
              <div className="mt-4 space-y-3 text-sm">
                <Info label="Sent" value={`$${lastTransfer.usdAmount.toFixed(2)}`} />
                <Info
                  label="Received"
                  value={`${lastTransfer.destinationAmount.toLocaleString()} ${lastTransfer.destinationCurrency}`}
                />
                <Info label="Sender" value={lastTransfer.senderName} />
                <Info label="Country" value={lastTransfer.destinationCountry} />
                <Info label="Recipient Bank" value={lastTransfer.recipientBankName} />
                <Info label="Card (last4)" value={`**** ${lastTransfer.recipientCardLast4}`} />
                <Info label="Time" value={`~${lastTransfer.estimatedCompletionMinutes} minutes`} />
                <Info label="Fee" value={`$${lastTransfer.feeUsd.toFixed(2)}`} />
                <Info label="Status" value={lastTransfer.status} />
                <Info label="TX Hash" value={lastTransfer.txHash} mono />
                <StatusTimeline status={lastTransfer.status} />
              </div>
            )}
          </section>
        </div>

        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-white">Recent Transfers</h3>
          {history.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-400">No transfer history yet.</p>
          ) : (
            <div className="mt-3 overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-zinc-400">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Recipient</th>
                    <th className="py-2 pr-4 font-medium">Country</th>
                    <th className="py-2 pr-4 font-medium">Sent</th>
                    <th className="py-2 pr-4 font-medium">Received</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item) => (
                    <tr key={item.id} className="border-t border-zinc-800">
                      <td className="py-2 pr-4 text-zinc-200">{item.recipientName}</td>
                      <td className="py-2 pr-4 text-zinc-300">{item.destinationCountry}</td>
                      <td className="py-2 pr-4 text-zinc-200">${item.usdAmount.toFixed(2)}</td>
                      <td className="py-2 pr-4 text-zinc-200">
                        {item.destinationAmount.toLocaleString()} {item.destinationCurrency}
                      </td>
                      <td className="py-2 pr-4 text-orange-300">{item.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function StatusTimeline({ status }: { status: SendResponse["status"] }) {
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

function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
      <span className="text-zinc-400">{label}</span>
      <span className={mono ? "font-mono text-xs text-zinc-200" : "font-medium text-zinc-200"}>
        {value}
      </span>
    </div>
  );
}
