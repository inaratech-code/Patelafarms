import type { DoseReminder, Vaccine } from "@/lib/db";
import { computeDoseReminderStatus, vaccineExpirySoon } from "@/lib/farmHealth";

/** Counts actionable farm-health notifications (dose + expiry). */
export function farmHealthNotificationCount(params: {
  reminders: DoseReminder[];
  vaccines: Vaccine[];
  todayKey: string;
}): number {
  let n = 0;
  for (const r of params.reminders) {
    const s = computeDoseReminderStatus({
      reminderDate: r.reminderDate,
      completedAt: r.completedAt,
      persisted: r.status,
    });
    if (s === "overdue" || s === "due_today") n += 1;
    else if (s === "upcoming") {
      const rd = r.reminderDate;
      const t = params.todayKey;
      const in3 =
        rd > t &&
        (() => {
          const d = new Date(`${t}T12:00:00`);
          d.setDate(d.getDate() + 3);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          return rd <= key;
        })();
      if (in3) n += 1;
    }
  }
  for (const v of params.vaccines) {
    if (vaccineExpirySoon(v, params.todayKey, 14)) n += 1;
  }
  return n;
}
