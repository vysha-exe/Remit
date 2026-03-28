"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Home" },
  { href: "/payments", label: "Payments" },
  { href: "/signup", label: "Sign up" },
  { href: "/contact", label: "Contact" },
  { href: "/track", label: "Track" }
];

export function MainNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link
          href="/"
          className="flex items-center gap-3 text-[1.4625rem] font-semibold leading-none tracking-tight text-white"
        >
          <img
            src="/logo.png"
            alt=""
            width={123}
            height={123}
            decoding="async"
            fetchPriority="high"
            className="h-[2.695rem] w-auto shrink-0 object-contain sm:h-[3.08rem]"
          />
          <span>
            REMIT<span className="text-orange-400">.</span>
          </span>
        </Link>
        <nav className="flex flex-wrap items-center gap-1 sm:gap-2">
          {links.map(({ href, label }) => {
            const active = pathname === href || (href !== "/" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-orange-500/15 text-orange-300"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
