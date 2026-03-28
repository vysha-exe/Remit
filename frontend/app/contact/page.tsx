"use client";

import { FormEvent, useRef, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type Msg = { role: "user" | "assistant"; content: string };

export default function ContactPage() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Hi — I’m **Remit Assist**. Ask about sending money, tracking a transfer, US→UK bank cashout, fees, or configuring TRON, MongoDB, Coinbase, or Wise."
    }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setError("");
    const userMsg: Msg = { role: "user", content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content }))
        })
      });
      const data = (await res.json()) as { reply?: string; message?: string; source?: string };
      if (!res.ok) {
        setError(data.message || "Could not reach the assistant.");
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Sorry — something went wrong. Is the backend running on port 4000?" }
        ]);
        return;
      }
      const reply = data.reply || "No reply.";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setError("Network error — check that the API is running.");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "I couldn’t reach the server. Start the backend (`npm run dev` in `/backend`)." }
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <h1 className="text-2xl font-semibold text-white">Contact us</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Use the assistant for product questions — it follows how Remit’s payments, tracking, and cashout flows work.
              For account-specific or billing issues, you can add email or support tooling alongside this page later.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-zinc-300">
              <li>
                <span className="font-medium text-orange-300">Product</span> — Payments, Track, US→UK bank cashout
              </li>
              <li>
                <span className="font-medium text-orange-300">Accounts</span> — Sign in links your session when the API
                and database are configured
              </li>
              <li>
                <span className="font-medium text-orange-300">Assistant</span> — Powered by OpenAI when the server
                has an API key; otherwise short rule-based answers
              </li>
            </ul>
          </div>

          <div className="flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900 shadow-inner">
            <div className="border-b border-zinc-800 px-4 py-3">
              <p className="text-sm font-medium text-white">Transaction assistant</p>
              <p className="text-xs text-zinc-500">Transfers, tracking, cashout, and integration setup</p>
            </div>
            <div className="max-h-[min(420px,55vh)] flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[95%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "ml-auto bg-orange-500/20 text-orange-50"
                      : "mr-auto border border-zinc-700 bg-zinc-950 text-zinc-200"
                  }`}
                >
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                    {m.role === "user" ? "You" : "Assistant"}
                  </span>
                  <div className="whitespace-pre-wrap">{m.content}</div>
                </div>
              ))}
              {loading ? (
                <p className="text-xs text-zinc-500">Thinking…</p>
              ) : null}
              <div ref={bottomRef} />
            </div>
            <form onSubmit={handleSubmit} className="border-t border-zinc-800 p-3">
              <p className="mb-2 text-[10px] text-zinc-500">
                With <code className="text-zinc-400">OPENAI_API_KEY</code> set on the server, replies use GPT; otherwise
                you get concise rule-based answers.
              </p>
              {error ? <p className="mb-2 text-xs text-red-300">{error}</p> : null}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="e.g. How do I track a payment?"
                  className="min-w-0 flex-1 rounded-xl border border-zinc-600 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-orange-500"
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="shrink-0 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
