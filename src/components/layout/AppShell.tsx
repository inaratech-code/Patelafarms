"use client";

import { SidebarDesktop, SidebarProvider } from "@/components/sidebar/Sidebar";
import { TopHeader } from "@/components/layout/TopHeader";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { clearSession, getSession, LAST_ACTIVE_KEY, type Session } from "@/lib/auth";
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
    queueMicrotask(() => {
      refreshSession();
      setAuthReady(true);
    });
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
  const currentSessionUserId = session?.userId ?? 0;
  const sessionUserResult = useLiveQuery(async () => {
    const userId = session?.userId ?? 0;
    if (!userId) return { userId, user: null };
    return { userId, user: (await db.users.get(userId)) ?? null };
  }, [session?.userId]);
  const sessionUserReady =
    sessionUserResult !== undefined && sessionUserResult.userId === currentSessionUserId;
  const sessionUser = sessionUserReady ? sessionUserResult.user : undefined;

  const currentRoleId = sessionUser?.roleId ?? 0;
  const roleResult = useLiveQuery(async () => {
    const roleId = sessionUser?.roleId ?? 0;
    if (!roleId) return { roleId, role: null };
    return { roleId, role: (await db.roles.get(roleId)) ?? null };
  }, [sessionUser?.roleId]);
  const roleReady = roleResult !== undefined && roleResult.roleId === currentRoleId;
  const role = roleReady ? roleResult.role : undefined;

  const usersLoaded = users !== undefined;
  const hasUsers = usersLoaded && users.length > 0;
  const isLoginRoute = pathname === "/login";
  const isBootstrapAllowed = usersLoaded && !hasUsers && (pathname === "/users" || pathname === "/login");

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
    if (!usersLoaded) return;
    const authed = Boolean(session?.userId);
    if (!isLoginRoute && !isBootstrapAllowed && !authed) {
      window.location.replace(`/login?next=${encodeURIComponent(pathname || "/")}`);
    }
  }, [authReady, isBootstrapAllowed, isLoginRoute, pathname, session?.userId, usersLoaded]);

  useEffect(() => {
    if (!authReady) return;
    if (!usersLoaded) return;
    if (isLoginRoute || isBootstrapAllowed) return;
    if (!session?.userId) return;
    if (!sessionUserReady) return;
    if (!sessionUser?.id) {
      clearSession();
      localStorage.removeItem(LAST_ACTIVE_KEY);
      window.location.replace(`/login?next=${encodeURIComponent(pathname || "/")}`);
      return;
    }
    if (!roleReady) return;
    if (role === null) {
      clearSession();
      localStorage.removeItem(LAST_ACTIVE_KEY);
      window.location.replace(`/login?next=${encodeURIComponent(pathname || "/")}`);
      return;
    }
    const perms = normalizePermissions(role?.permissions as string[] | undefined);
    const target = pickDefaultRoute(perms);
    if (!canAccessPath(perms, pathname || "/")) {
      if (target !== pathname) window.location.replace(target);
    }
  }, [authReady, isBootstrapAllowed, isLoginRoute, pathname, role, roleReady, session?.userId, sessionUser, sessionUserReady, usersLoaded]);

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

  if ((!authReady || !usersLoaded) && !isLoginRoute) return null;

  // Login page should not show sidebar/header.
  if (isLoginRoute) return <>{props.children}</>;

  const authed = Boolean(session?.userId);
  // Keep the shell blank while redirecting unauthenticated users (avoids dashboard flash).
  if (!authed && !isBootstrapAllowed) return null;
  if (authed) {
    if (!sessionUserReady || !sessionUser?.id) return null;
    if (!roleReady || !role) return null;
    const perms = normalizePermissions(role.permissions as string[] | undefined);
    if (!canAccessPath(perms, pathname || "/")) return null;
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

