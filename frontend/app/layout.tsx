import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { MainNav } from "../components/MainNav";

export const metadata: Metadata = {
  title: "REMIT",
  description: "Zero-fee remittance app powered by crypto rails in the backend."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 antialiased">
        <MainNav />
        {children}
      </body>
    </html>
  );
}
