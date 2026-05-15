import type { DoseReminder, InventoryItem, Vaccine, VaccineUsage } from "@/lib/db";
import { doseReminderEffectiveStatus } from "@/lib/notifications";

export type PushAlert = {
  tag: string;
  title: string;
  body: string;
  url: string;
};

const NOTIFY_STATE_KEY = "pf.alertNotifyState.v1";

function loadFiredTags(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(NOTIFY_STATE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as { fired?: string[] };
    return new Set(Array.isArray(parsed.fired) ? parsed.fired : []);
  } catch {
    return new Set();
  }
}

function saveFiredTags(tags: Set<string>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(NOTIFY_STATE_KEY, JSON.stringify({ fired: [...tags] }));
}

export function isInventoryLowStock(item: InventoryItem): boolean {
  const th = item.reorderLevel ?? item.minStockThreshold ?? 0;
  return th > 0 && item.quantity <= th;
}

export function collectLowStockAlerts(inventory: InventoryItem[]): PushAlert[] {
  const alerts: PushAlert[] = [];
  for (const item of inventory) {
    if (item.active === false) continue;
    if (!isInventoryLowStock(item)) continue;
    const th = item.reorderLevel ?? item.minStockThreshold ?? 0;
    const key = item.uid ?? (item.id != null ? `id:${item.id}` : item.name);
    alerts.push({
      tag: `stock:${key}`,
      title: "Low stock",
      body: `${item.name}: ${item.quantity} ${item.unit} left (reorder at ${th})`,
      url: "/inventory",
    });
  }
  return alerts;
}

export function collectDoseScheduleAlerts(params: {
  reminders: DoseReminder[];
  usages: VaccineUsage[];
  vaccines: Vaccine[];
  todayKey: string;
}): PushAlert[] {
  const { reminders, usages, vaccines, todayKey } = params;
  const vaccineById = new Map(vaccines.filter((v) => v.id).map((v) => [v.id!, v]));
  const usageById = new Map(usages.filter((u) => u.id).map((u) => [u.id!, u]));
  const alerts: PushAlert[] = [];

  for (const r of reminders) {
    const effective = doseReminderEffectiveStatus(r);
    if (effective === "completed") continue;

    const uid = r.uid ?? (r.id != null ? `id:${r.id}` : r.reminderDate);
    const usage = r.vaccineUsageId ? usageById.get(r.vaccineUsageId) : undefined;
    const vaccine = usage ? vaccineById.get(usage.vaccineId) : undefined;
    const title = r.title ?? vaccine?.name ?? "Dose reminder";
    const batch = usage?.animalBatch ? ` · ${usage.animalBatch}` : "";

    if (effective === "overdue") {
      alerts.push({
        tag: `dose:${uid}:overdue`,
        title: "Dose overdue",
        body: `${title}${batch} — was due ${r.reminderDate}`,
        url: "/farm-health/dose-schedule",
      });
      continue;
    }

    if (effective === "due_today") {
      alerts.push({
        tag: `dose:${uid}:due_today`,
        title: "Dose due today",
        body: `${title}${batch} — due ${r.reminderDate}`,
        url: "/farm-health/dose-schedule",
      });
      continue;
    }

    if (effective === "upcoming") {
      const rd = r.reminderDate;
      const d = new Date(`${todayKey}T12:00:00`);
      d.setDate(d.getDate() + 3);
      const limit = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (rd > todayKey && rd <= limit) {
        alerts.push({
          tag: `dose:${uid}:soon`,
          title: "Upcoming dose",
          body: `${title}${batch} — due ${r.reminderDate}`,
          url: "/farm-health/dose-schedule",
        });
      }
    }
  }

  return alerts;
}

/** Fire notifications for newly active alerts; clear tags when alert resolves. */
export async function dispatchPushAlerts(
  alerts: PushAlert[],
  show: (alert: PushAlert) => Promise<void>
) {
  const fired = loadFiredTags();
  const current = new Set(alerts.map((a) => a.tag));

  for (const tag of [...fired]) {
    if (!current.has(tag)) fired.delete(tag);
  }

  for (const alert of alerts) {
    if (fired.has(alert.tag)) continue;
    await show(alert);
    fired.add(alert.tag);
  }

  saveFiredTags(fired);
}
