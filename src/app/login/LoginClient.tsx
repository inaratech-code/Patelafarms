"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { loginWithPassword, getSession } from "@/lib/auth";
import { joinFarmWithCode, getFarmId } from "@/lib/farm";
import { pullEvents } from "@/lib/sync";
import { ensureSupabaseAuth } from "@/lib/supabaseClient";
import { Eye, EyeOff, Lock, User } from "lucide-react";
import Link from "next/link";

export function LoginClient() {
  const search = useSearchParams();
  const users = useLiveQuery(() => db.users.toArray());

  const [form, setForm] = useState({ username: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  const [linkFarmId, setLinkFarmId] = useState("");
  const [linkCode, setLinkCode] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkMsg, setLinkMsg] = useState<string | null>(null);

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
        await pullEvents();
      } catch {
        /* Supabase not configured, offline, or not a farm member yet */
      }
    })();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isWorking) return;
    setError(null);
    try {
      setIsWorking(true);
      await loginWithPassword({ username: form.username, password: form.password });
      const next = search.get("next") ?? "/";
      window.location.replace(next);
    } catch (err: any) {
      setError(err?.message ?? "Login failed");
    } finally {
      setIsWorking(false);
    }
  };

  const onLinkDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (linkBusy) return;
    setLinkMsg(null);
    try {
      setLinkBusy(true);
      await joinFarmWithCode(linkFarmId.trim(), linkCode.trim());
      await ensureSupabaseAuth();
      await pullEvents();
      setLinkMsg("This device is linked. Use your username and password below.");
      setLinkCode("");
    } catch (err: unknown) {
      setLinkMsg(err instanceof Error ? err.message : "Could not link this device.");
    } finally {
      setLinkBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-8 pt-8 pb-6 border-b border-slate-200">
          <div className="text-2xl font-semibold text-slate-900">Login</div>
        </div>

        <form onSubmit={onSubmit} className="p-8 space-y-4">
          {!hasUsers ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 space-y-3">
              <p className="font-semibold">First-time setup</p>
              <p>
                <strong className="text-amber-950">You cannot use Login yet</strong> — there is no account on this
                browser. Create one first (takes about a minute).
              </p>
              <Link
                href="/users"
                className="flex w-full items-center justify-center rounded-lg bg-primary px-4 py-3 text-base font-semibold text-white shadow-sm hover:bg-primary/90"
              >
                Create your first user (open Users)
              </Link>
              <p className="text-xs text-amber-950/80">Then come back to this page and sign in.</p>
              <ol className="list-decimal list-inside space-y-1 pl-0.5 text-xs border-t border-amber-200/80 pt-2">
                <li>On Users: create a role if needed (e.g. admin), then create a user (password 4–20 characters).</li>
                <li>Return here and use Login with that username and password.</li>
              </ol>
            </div>
          ) : null}

          <div>
            <label className="block text-sm font-medium mb-1">Username</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={form.username}
                onChange={(e) => setForm((v) => ({ ...v, username: e.target.value }))}
                className="w-full pl-9 pr-3 py-2 border rounded-md bg-white"
                autoComplete="username"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
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

          <details className="rounded-xl border border-slate-200 bg-slate-50/90 text-sm open:pb-3">
            <summary className="cursor-pointer select-none px-4 py-3 font-semibold text-slate-800">
              Same farm on another phone or browser?
            </summary>
            <div className="px-4 space-y-3 border-t border-slate-200/80 pt-3 text-slate-600">
              <p>
                Each browser has its own cloud login until you link it. On a device that already has your data, open{" "}
                <strong className="text-slate-900">Settings</strong> and copy the <strong className="text-slate-900">Farm ID</strong>{" "}
                and <strong className="text-slate-900">Join code</strong>, then paste them here and link.
              </p>
              <form onSubmit={onLinkDevice} className="space-y-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Farm ID (UUID)</label>
                  <input
                    value={linkFarmId}
                    onChange={(e) => setLinkFarmId(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md bg-white font-mono text-xs"
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Join code</label>
                  <input
                    value={linkCode}
                    onChange={(e) => setLinkCode(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md bg-white font-mono text-sm tracking-widest"
                    placeholder="8 characters"
                    autoComplete="off"
                  />
                </div>
                <button
                  type="submit"
                  disabled={linkBusy || !linkFarmId.trim() || !linkCode.trim()}
                  className="w-full px-3 py-2 rounded-md bg-slate-900 text-white font-semibold text-sm hover:bg-slate-800 disabled:bg-slate-400"
                >
                  {linkBusy ? "Linking…" : "Link this device"}
                </button>
              </form>
              {linkMsg ? (
                <div
                  className={`rounded-lg px-3 py-2 text-xs ${
                    linkMsg.startsWith("This device is linked")
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "border border-rose-200 bg-rose-50 text-rose-800"
                  }`}
                >
                  {linkMsg}
                </div>
              ) : null}
            </div>
          </details>

          <button
            type="submit"
            disabled={isWorking || !hasUsers}
            className={`w-full mt-2 px-4 py-2 rounded-md text-white font-semibold ${
              isWorking || !hasUsers ? "bg-slate-400" : "bg-primary hover:bg-primary/90"
            }`}
          >
            {isWorking ? "Signing in..." : "Login"}
          </button>
          {!hasUsers ? (
            <p className="text-center text-xs text-slate-500">
              Login stays disabled until at least one user exists. Use the blue button above.
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );
}

