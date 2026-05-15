"use client";

import { useEffect, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { localDayKey } from "@/lib/erp/metrics";
import {
  collectDoseScheduleAlerts,
  collectLowStockAlerts,
  dispatchPushAlerts,
} from "@/lib/alertNotifications";
import {
  getBrowserNotificationPrefs,
  getNotificationPermission,
  showBrowserNotification,
} from "@/lib/browserNotifications";

const CHECK_MS = 60_000;

/**
 * Watches low stock + dose schedule and shows browser notifications when enabled.
 */
export function PushAlertsWatcher() {
  const inventory = useLiveQuery(() => db.inventory.toArray()) ?? [];
  const doseReminders = useLiveQuery(() => db.doseReminders.toArray()) ?? [];
  const vaccineUsages = useLiveQuery(() => db.vaccineUsages.toArray()) ?? [];
  const vaccines = useLiveQuery(() => db.vaccines.toArray()) ?? [];

  const todayKey = useMemo(() => localDayKey(new Date()), []);

  const alerts = useMemo(() => {
    const stock = collectLowStockAlerts(inventory);
    const doses = collectDoseScheduleAlerts({
      reminders: doseReminders,
      usages: vaccineUsages,
      vaccines,
      todayKey,
    });
    return [...stock, ...doses];
  }, [doseReminders, inventory, todayKey, vaccineUsages, vaccines]);

  useEffect(() => {
    const run = () => {
      if (getNotificationPermission() !== "granted") return;
      if (!getBrowserNotificationPrefs().enabled) return;
      void dispatchPushAlerts(alerts, (a) =>
        showBrowserNotification({ title: a.title, body: a.body, tag: a.tag, url: a.url })
      );
    };

    run();
    const interval = window.setInterval(run, CHECK_MS);
    const onSync = () => run();
    window.addEventListener("pf-sync-complete", onSync);

    const onVis = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pf-sync-complete", onSync);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [alerts]);

  return null;
}
