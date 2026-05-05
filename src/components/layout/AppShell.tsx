"use client";

import { SidebarDesktop, SidebarProvider } from "@/components/sidebar/Sidebar";
import { TopHeader } from "@/components/layout/TopHeader";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { clearSession, getSession } from "@/lib/auth";
import { startAutoSync } from "@/lib/autoSync";
import { canAccessPath, normalizePermissions, pickDefaultRoute } from "@/lib/rbac";

export function AppShell(props: { children: React.ReactNode }) {
  const pathname = usePathname();
  const users = useLiveQuery(() => db.users.toArray());
  const [checked, setChecked] = useState(false);
  const session = useMemo(() => getSession(), [pathname]);
  const role = useLiveQuery(async () => {
    const roleId = session?.roleId ?? 0;
    if (!roleId) return null;
    return (await db.roles.get(roleId)) ?? null;
  }, [session?.roleId]);

  const hasUsers = useMemo(() => (users ? users.length > 0 : false), [users]);
  const isLoginRoute = pathname === "/login";
  const isBootstrapAllowed = !hasUsers && (pathname === "/users" || pathname === "/login");

  // Auto logout after 1 hour of inactivity.
  useEffect(() => {
    if (isLoginRoute) return;
    if (!session?.userId) return;

    const IDLE_KEY = "pf.lastActiveAt.v1";
    const IDLE_MS = 60 * 60 * 1000; // 1 hour

    const now = () => Date.now();

    let lastWrite = 0;
    const markActive = () => {
      const t = now();
      // Throttle localStorage writes (high-frequency events like mousemove).
      if (t - lastWrite < 15_000) return;
      lastWrite = t;
      localStorage.setItem(IDLE_KEY, String(t));
    };

    // Initialize if missing.
    if (!localStorage.getItem(IDLE_KEY)) {
      localStorage.setItem(IDLE_KEY, String(now()));
    }

    const logout = () => {
      clearSession();
      localStorage.removeItem(IDLE_KEY);
      window.location.replace("/login");
    };

    const check = () => {
      const raw = localStorage.getItem(IDLE_KEY);
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
      for (const ev of events) window.removeEventListener(ev, markActive as any);
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(interval);
    };
  }, [isLoginRoute, session?.userId]);

  useEffect(() => {
    const authed = Boolean(session?.userId);
    if (!isLoginRoute && !isBootstrapAllowed && !authed) {
      // In dev (Turbopack), next/navigation can dispatch before router init.
      // Use a hard navigation for auth gating to avoid that class of error.
      window.location.replace(`/login?next=${encodeURIComponent(pathname || "/")}`);
    }
    setChecked(true);
  }, [isBootstrapAllowed, isLoginRoute, pathname, session?.userId]);

  useEffect(() => {
    if (isLoginRoute || isBootstrapAllowed) return;
    if (!session?.userId) return;
    // Wait until the role record is loaded; otherwise we can get a redirect loop on first render.
    if (session?.roleId && role == null) return;
    const perms = normalizePermissions(role?.permissions as string[] | undefined);
    if (!canAccessPath(perms, pathname || "/")) {
      window.location.replace(pickDefaultRoute(perms));
    }
  }, [isBootstrapAllowed, isLoginRoute, pathname, role, session?.roleId, session?.userId]);

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

  // Prevent brief flash of app before redirect.
  if (!checked && !isLoginRoute) return null;

  // Login page should not show sidebar/header.
  if (isLoginRoute) return <>{props.children}</>;

  return (
    <SidebarProvider>
      <div className="min-h-full bg-background flex">
        <SidebarDesktop />
        <div className="flex flex-col flex-1 w-full lg:pl-64 min-w-0">
          <TopHeader />
          <main className="flex-1 min-h-0 min-w-0 p-3 sm:p-5 lg:p-8 overflow-y-auto pb-[calc(6rem+env(safe-area-inset-bottom,0px))] lg:pb-8">
            {props.children}
          </main>
        </div>
        <MobileBottomNav />
      </div>
    </SidebarProvider>
  );
}

