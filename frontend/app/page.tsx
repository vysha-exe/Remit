import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl px-4 py-14 md:py-20">
        <section className="rounded-3xl border border-orange-500/35 bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 p-8 shadow-none md:p-12">
          <p className="text-sm font-semibold uppercase tracking-wide text-orange-400">Remit</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-white md:text-5xl">
            Send farther<span className="text-orange-400">.</span> Pay nothing<span className="text-zinc-500">*</span>
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-zinc-300">
            Send from the US to destinations worldwide, use US → UK bank cashout, and track settlements—with optional
            on-chain settlement and provider sandboxes when configured.
          </p>
          <p className="mt-2 text-xs text-zinc-500">*Zero fees shown in the product UI. Not financial advice.</p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/payments"
              className="inline-flex items-center rounded-xl bg-orange-500 px-6 py-3 text-base font-semibold text-zinc-950 transition hover:bg-orange-400"
            >
              Make a payment
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center rounded-xl border border-zinc-600 px-6 py-3 text-base font-medium text-zinc-100 transition hover:border-orange-400 hover:text-orange-200"
            >
              Create an account
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center rounded-xl border border-zinc-700 px-6 py-3 text-base font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
            >
              Contact &amp; help
            </Link>
          </div>
        </section>

        <section className="mt-14 grid gap-6 md:grid-cols-3">
          {[
            {
              title: "Payments",
              body: "Send USD internationally with live FX, bank lists for supported countries, and optional on-chain settlement hash.",
              href: "/payments"
            },
            {
              title: "Your account",
              body: "Create a profile backed by MongoDB when your API is connected—sign in on any device with your email.",
              href: "/signup"
            },
            {
              title: "Support",
              body: "Ask our assistant about transfers, fees, tracking, and sandbox modes.",
              href: "/contact"
            }
          ].map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className="group rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 transition hover:border-orange-500/40 hover:bg-zinc-900"
            >
              <h2 className="text-lg font-semibold text-white group-hover:text-orange-200">{card.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{card.body}</p>
              <span className="mt-4 inline-block text-sm font-medium text-orange-400">Open →</span>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
