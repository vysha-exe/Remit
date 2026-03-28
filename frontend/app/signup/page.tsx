"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const AUTH_TOKEN_KEY = "remit_auth_token";

type AuthUser = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

export default function SignupPage() {
  const [mode, setMode] = useState<"register" | "login">("register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [error, setError] = useState("");

  const loadSession = useCallback(async (token: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        setUser(null);
        return;
      }
      const data = (await res.json()) as { user: AuthUser };
      setUser(data.user);
    } catch {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.removeItem("remit_demo_user");
      localStorage.removeItem("remit_demo_password_set");
    } catch {
      // ignore
    }
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (token) {
      void loadSession(token).finally(() => setBootLoading(false));
    } else {
      setBootLoading(false);
    }
  }, [loadSession]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (mode === "register") {
      if (!name.trim() || !email.trim()) {
        setError("Name and email are required.");
        return;
      }
    } else if (!email.trim()) {
      setError("Email is required.");
      return;
    }
    if (password.length < 6) {
      setError("Use at least 6 characters for your password.");
      return;
    }

    setLoading(true);
    try {
      const path = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const body =
        mode === "register"
          ? { name: name.trim(), email: email.trim().toLowerCase(), password }
          : { email: email.trim().toLowerCase(), password };

      const res = await fetch(`${API_BASE_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = (await res.json()) as { token?: string; user?: AuthUser; message?: string };

      if (!res.ok) {
        setError(data.message || (res.status === 503 ? "Database unavailable." : "Request failed."));
        return;
      }
      if (!data.token || !data.user) {
        setError("Unexpected response from server.");
        return;
      }
      localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      setUser(data.user);
      setPassword("");
      if (mode === "register") {
        setName("");
        setEmail("");
      }
    } catch {
      setError("Could not reach the server. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  function handleSignOut() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setUser(null);
    setName("");
    setEmail("");
    setPassword("");
  }

  if (bootLoading) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        <div className="mx-auto max-w-lg px-4 py-12 text-sm text-zinc-400">Loading…</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-lg px-4 py-12">
        <h1 className="text-2xl font-semibold text-white">Account</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Sign in or create an account. Your profile is stored securely in MongoDB when the API is connected.
        </p>

        {user ? (
          <div className="mt-8 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6">
            <p className="text-sm font-medium text-emerald-200">Signed in</p>
            <p className="mt-2 text-sm text-zinc-300">
              <span className="text-zinc-500">Name</span> {user.name}
            </p>
            <p className="mt-1 text-sm text-zinc-300">
              <span className="text-zinc-500">Email</span> {user.email}
            </p>
            <p className="mt-1 text-xs text-zinc-500">Since {new Date(user.createdAt).toLocaleString()}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/payments"
                className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
              >
                Go to payments
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-xl border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
              >
                Sign out
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-6 flex gap-2 rounded-xl border border-zinc-800 bg-zinc-900 p-1">
              <button
                type="button"
                onClick={() => {
                  setMode("register");
                  setError("");
                }}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                  mode === "register" ? "bg-orange-500/20 text-orange-200" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Create account
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError("");
                }}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                  mode === "login" ? "bg-orange-500/20 text-orange-200" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Sign in
              </button>
            </div>

            <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
              {mode === "register" ? (
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-zinc-300">Full name</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-xl border border-zinc-600 bg-zinc-900 px-4 py-2.5 text-white outline-none focus:border-orange-500"
                    autoComplete="name"
                    required
                  />
                </label>
              ) : null}
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-300">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-zinc-600 bg-zinc-900 px-4 py-2.5 text-white outline-none focus:border-orange-500"
                  autoComplete="email"
                  required
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-300">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-zinc-600 bg-zinc-900 px-4 py-2.5 text-white outline-none focus:border-orange-500"
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  minLength={6}
                  required
                />
              </label>
              {error ? <p className="text-sm text-red-300">{error}</p> : null}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-orange-500 py-2.5 font-semibold text-zinc-950 hover:bg-orange-400 disabled:opacity-60"
              >
                {loading ? "Please wait…" : mode === "register" ? "Create account" : "Sign in"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
