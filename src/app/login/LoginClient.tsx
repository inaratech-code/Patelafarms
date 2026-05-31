"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { loginWithPassword, getSession, sha256Base64 } from "@/lib/auth";
import { formatLoginError } from "@/lib/loginErrors";
import { getFarmId, linkFarmWithCredentialsIfPossible } from "@/lib/farm";
import { syncNow } from "@/lib/sync";
import { ensureSupabaseAuth } from "@/lib/supabaseClient";
import { Eye, EyeOff, Lock, User } from "lucide-react";

export function LoginClient() {
  const search = useSearchParams();
  const users = useLiveQuery(() => db.users.toArray());

  const [form, setForm] = useState({ username: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  const hasUsers = useMemo(() => (users ? users.length > 0 : false), [users]);

  useEffect(() => {
    const s = getSession();
    if (s?.userId) window.location.replace("/");
  }, []);

  useEffect(() => {
    if (!getFarmId()) return;
    void (async () => {
      try {
        await ensureSupabaseAuth();
        await syncNow();
      } catch {
        /* Supabase not configured, offline, or not a farm member yet */
      }
    })();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isWorking) return;
    setError(null);
    const username = form.username.trim();
    const password = form.password;
    if (!username || !password) {
      setError("Username and password are required.");
      return;
    }
    try {
      setIsWorking(true);
      // Fast path: local sign-in first (no network).
      try {
        await loginWithPassword({ username, password });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Login failed";
        if (msg === "Incorrect password." || msg === "Invalid password") throw err;
        if (msg !== "User not found") throw err;

        // Slow path: only if user isn't on this device, try cloud link + pull, then retry login.
        await ensureSupabaseAuth();
        const hash = await sha256Base64(password);
        let linkedFarmId: string | null = null;
        try {
          linkedFarmId = await linkFarmWithCredentialsIfPossible(username, hash);
        } catch (e) {
          console.warn("Credential link:", e);
        }
        if (linkedFarmId) {
          await syncNow();
        }
        await loginWithPassword({ username, password });
      }
      const next = search.get("next") ?? "/";
      window.location.replace(next);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Login failed";
        setError(formatLoginError(msg, hasUsers));
      } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 pb-8">
      <div className="mb-6 flex flex-col items-center text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/inara-tech-logo.png"
          alt="Inara Tech"
          className="h-16 w-auto max-w-[220px] object-contain"
        />
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-[#0f2744]">Inara POS</h1>
        <p className="mt-1 text-sm text-slate-500">
          Built by{" "}
          <a
            href="https://www.inaratech.com.np"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[#0f2744] hover:text-[#0871b3] hover:underline"
          >
            Inara Tech
          </a>
        </p>
      </div>

      <div className="w-full max-w-md rounded-3xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-8 pt-8 pb-6 border-b border-slate-200">
          <div className="text-2xl font-semibold text-slate-900">Sign in</div>
          <p className="mt-1 text-sm text-slate-500">Enter your credentials to continue</p>
        </div>

        <form onSubmit={onSubmit} className="p-8 space-y-4">
          <div>
            <label htmlFor="login-username" className="block text-sm font-medium mb-1">
              Username
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                id="login-username"
                name="username"
                value={form.username}
                onChange={(e) => setForm((v) => ({ ...v, username: e.target.value }))}
                className="w-full pl-9 pr-3 py-2 border rounded-md bg-white"
                autoComplete="username"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="login-password" className="block text-sm font-medium mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                id="login-password"
                name="password"
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={(e) => setForm((v) => ({ ...v, password: e.target.value }))}
                className="w-full pl-9 pr-11 py-2 border rounded-md bg-white"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
          ) : null}

          <button
            type="submit"
            disabled={isWorking}
            className={`w-full mt-2 px-4 py-2 rounded-md text-white font-semibold ${
              isWorking ? "bg-slate-400" : "bg-primary hover:bg-primary/90"
            }`}
          >
            {isWorking ? "Signing in..." : "Login"}
          </button>
        </form>
      </div>

      <footer className="mt-8 text-center text-xs text-slate-400">
        <a
          href="https://www.inaratech.com.np"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-[#0871b3] hover:underline"
        >
          www.inaratech.com.np
        </a>
      </footer>
    </div>
  );
}
