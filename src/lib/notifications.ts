import type { DoseReminder, DoseReminderStatus } from "@/lib/db";
import { computeDoseReminderStatus } from "@/lib/farmHealth";

export function doseReminderEffectiveStatus(r: DoseReminder): DoseReminderStatus {
  return computeDoseReminderStatus({
    reminderDate: r.reminderDate,
    completedAt: r.completedAt,
    persisted: r.status,
  });
}

export function countHealthNotifications(params: {
  doseReminders: DoseReminder[];
  lowStockCount: number;
  pendingLedgerAccounts: number;
}) {
  let n = params.lowStockCount + params.pendingLedgerAccounts;
  for (const r of params.doseReminders) {
    const s = doseReminderEffectiveStatus(r);
    if (s === "overdue" || s === "due_today") n += 1;
  }
  return n;
}
