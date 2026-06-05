"use client";

import { SidebarDesktop, SidebarProvider } from "@/components/sidebar/Sidebar";
import { TopHeader } from "@/components/layout/TopHeader";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import {
  clearSession,
  DASHBOARD_PATH,
  getSession,
  LAST_ACTIVE_KEY,
  POST_LOGIN_HOME_KEY,
  type Session,
} from "@/lib/auth";
import { clearInvalidSessionStorage } from "@/lib/sessionGuard";
import { FarmHealthSoundBridge } from "@/components/notifications/FarmHealthSoundBridge";
import { PushAlertsWatcher } from "@/components/notifications/PushAlertsWatcher";
import { startAutoSync } from "@/lib/autoSync";
import { canAccessPath, normalizePermissions, pickDefaultRoute } from "@/lib/rbac";

export function AppShell(props: { children: React.ReactNode }) {
  const pathname = usePathname();
  const users = useLiveQuery(() => db.users.toArray());
  const [authReady, setAuthReady] = useState(false);
  const [session, setSessionState] = useState<Session | null>(null);

  const refreshSession = useCallback(() => {
    setSessionState(getSession());
  }, []);

  // Read session only on the client (avoids SSR/hydration treating everyone as logged out).
  useEffect(() => {
    clearInvalidSessionStorage();
    refreshSession();
    setAuthReady(true);
  }, [pathname, refreshSession]);

  useEffect(() => {
    const onSession = () => refreshSession();
    window.addEventListener("pf-session-change", onSession);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "pf.session.v1") refreshSession();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("pf-session-change", onSession);
      window.removeEventListener("storage", onStorage);
    };
  }, [refreshSession]);
  const role = useLiveQuery(async () => {
    const roleId = session?.roleId ?? 0;
    if (!roleId) return null;
    return (await db.roles.get(roleId)) ?? null;
  }, [session?.roleId]);
  const currentUser = useLiveQuery(async () => {
    const userId = session?.userId ?? 0;
    if (!userId) return null;
    return (await db.users.get(userId)) ?? null;
  }, [session?.userId]);

  const hasUsers = useMemo(() => (users ? users.length > 0 : false), [users]);
  const isLoginRoute = pathname === "/login";
  const isBootstrapAllowed = !hasUsers && (pathname === "/users" || pathname === "/login");
  const authed = Boolean(session?.userId);
  const authRecordLoading =
    authed && !isLoginRoute && !isBootstrapAllowed && (currentUser === undefined || role === undefined);
  const authRecordMissing =
    authed &&
    !isLoginRoute &&
    !isBootstrapAllowed &&
    (currentUser === null || role === null || currentUser.roleId !== session?.roleId);

  // Auto logout after 1 hour of inactivity.
  useEffect(() => {
    if (isLoginRoute) return;
    if (!session?.userId) return;

    const IDLE_MS = 60 * 60 * 1000; // 1 hour

    const now = () => Date.now();

    let lastWrite = 0;
    const markActive = () => {
      const t = now();
      // Throttle localStorage writes (high-frequency events like mousemove).
      if (t - lastWrite < 15_000) return;
      lastWrite = t;
      localStorage.setItem(LAST_ACTIVE_KEY, String(t));
    };

    // Align idle clock with this session (handles logins before setSession wrote the key).
    const sessionStartedAt = session?.createdAt ?? now();
    const lastActiveRaw = localStorage.getItem(LAST_ACTIVE_KEY);
    const lastActive = lastActiveRaw ? Number(lastActiveRaw) : 0;
    if (!lastActive || lastActive < sessionStartedAt) {
      localStorage.setItem(LAST_ACTIVE_KEY, String(now()));
    }

    const logout = () => {
      clearSession();
      localStorage.removeItem(LAST_ACTIVE_KEY);
      window.location.replace("/login");
    };

    const check = () => {
      const raw = localStorage.getItem(LAST_ACTIVE_KEY);
      const last = raw ? Number(raw) : 0;
      if (!last) return;
      if (now() - last > IDLE_MS) logout();
    };

    const events: Array<keyof WindowEventMap> = ["click", "keydown", "mousemove", "touchstart", "scroll"];
    for (const ev of events) window.addEventListener(ev, markActive, { passive: true });
    const onVis = () => {
      if (document.visibilityState === "visible") {
        // Refresh activity + check timeout when returning to the tab.
        markActive();
        check();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    const interval = window.setInterval(check, 30_000);
    // Check once on mount.
    check();

    return () => {
      for (const ev of events) window.removeEventListener(ev, markActive as EventListener);
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(interval);
    };
  }, [isLoginRoute, session?.createdAt, session?.userId]);

  useEffect(() => {
    if (!authReady) return;
    if (!isLoginRoute && !isBootstrapAllowed && !authed) {
      window.location.replace("/login");
    }
  }, [authReady, authed, isBootstrapAllowed, isLoginRoute]);

  useEffect(() => {
    if (!authReady || !authRecordMissing) return;
    clearSession();
    localStorage.removeItem(LAST_ACTIVE_KEY);
    window.location.replace("/login");
  }, [authReady, authRecordMissing]);

  useEffect(() => {
    if (!authReady) return;
    if (isLoginRoute || isBootstrapAllowed) return;
    if (!session?.userId) return;
    if (authRecordLoading || authRecordMissing) return;
    const path = pathname || "/";
    if (path === DASHBOARD_PATH && sessionStorage.getItem(POST_LOGIN_HOME_KEY) === "1") {
      sessionStorage.removeItem(POST_LOGIN_HOME_KEY);
      return;
    }
    const perms = normalizePermissions(role?.permissions as string[] | undefined);
    const target = pickDefaultRoute(perms);
    if (!canAccessPath(perms, path)) {
      if (target !== path) window.location.replace(target);
    }
  }, [
    authReady,
    authRecordLoading,
    authRecordMissing,
    isBootstrapAllowed,
    isLoginRoute,
    pathname,
    role,
    session?.userId,
  ]);

  useEffect(() => {
    if (isLoginRoute) return;
    // Start background + realtime sync for all authenticated app pages.
    void startAutoSync();
  }, [isLoginRoute]);

  useEffect(() => {
    if (isLoginRoute) return;
    // If the device links a farm after initial boot, retry starting autosync.
    const id = window.setInterval(() => void startAutoSync(), 4000);
    return () => window.clearInterval(id);
  }, [isLoginRoute]);

  if (!authReady && !isLoginRoute) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  // Login page should not show sidebar/header.
  if (isLoginRoute) return <>{props.children}</>;

  // Keep a visible shell while redirecting unauthenticated users (avoids blank screen on iOS).
  if (!authed && !isBootstrapAllowed) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
        <p className="text-sm text-slate-500">Redirecting to sign in…</p>
      </div>
    );
  }

  if (authRecordLoading || authRecordMissing) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
        <p className="text-sm text-slate-500">Checking access…</p>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <PushAlertsWatcher />
      <FarmHealthSoundBridge />
      <div className="min-h-full bg-background flex">
        <SidebarDesktop />
        <div className="flex flex-col flex-1 w-full lg:pl-64 min-w-0">
          <TopHeader />
          <main className="flex-1 min-h-0 min-w-0 max-w-full overflow-x-hidden overflow-y-auto p-3 sm:p-5 lg:p-8 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] lg:pb-8">
            {props.children}
          </main>
        </div>
        <MobileBottomNav />
      </div>
    </SidebarProvider>
  );
}

