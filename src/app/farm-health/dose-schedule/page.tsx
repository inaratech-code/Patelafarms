"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { FarmHealthSubnav } from "@/components/farm-health/FarmHealthSubnav";
import { db, type DoseReminderStatus } from "@/lib/db";
import { refreshDoseReminderStatuses } from "@/lib/farmHealth";
import { enqueueReminderOutbox } from "@/lib/farmHealthSync";
import { doseReminderEffectiveStatus } from "@/lib/notifications";
import { formatDualDate } from "@/lib/nepaliDate";

type Filter = "all" | DoseReminderStatus;

function badgeClass(status: DoseReminderStatus) {
  if (status === "completed") return "bg-emerald-100 text-emerald-800";
  if (status === "overdue") return "bg-rose-100 text-rose-800";
  if (status === "due_today") return "bg-orange-100 text-orange-900";
  return "bg-sky-100 text-sky-800";
}

export default function DoseSchedulePage() {
  const reminders = useLiveQuery(() => db.doseReminders.toArray()) || [];
  const usages = useLiveQuery(() => db.vaccineUsages.toArray()) || [];
  const vaccines = useLiveQuery(() => db.vaccines.toArray()) || [];
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    void refreshDoseReminderStatuses();
  }, []);

  const rows = useMemo(() => {
    const vaccineById = new Map(vaccines.map((v) => [v.id!, v]));
    const usageById = new Map(usages.map((u) => [u.id!, u]));
    const enriched = reminders.map((r) => {
      const usage = usageById.get(r.vaccineUsageId);
      const vaccine = usage ? vaccineById.get(usage.vaccineId) : undefined;
      const effective = doseReminderEffectiveStatus(r);
      return { r, usage, vaccine, effective };
    });
    const sorted = enriched.sort((a, b) => a.r.reminderDate.localeCompare(b.r.reminderDate));
    if (filter === "all") return sorted;
    return sorted.filter((x) => x.effective === filter);
  }, [reminders, usages, vaccines, filter]);

  const markComplete = async (id: number) => {
    const existing = await db.doseReminders.get(id);
    if (!existing?.uid) return;
    const completedAt = new Date().toISOString();
    const updated: typeof existing = { ...existing, status: "completed", completedAt };
    await db.doseReminders.update(id, { status: "completed", completedAt });
    const usage = await db.vaccineUsages.get(existing.vaccineUsageId);
    if (usage?.uid) await enqueueReminderOutbox(updated, usage.uid);
  };

  return (
    <div className="space-y-6">
      <div className="min-w-0">
        <FarmHealthSubnav current="dose-schedule" />
        <h1 className="mt-2 text-xl sm:text-2xl font-semibold text-slate-900 flex items-center gap-2">
          <CalendarClock className="w-6 h-6 sm:w-7 sm:h-7 text-primary shrink-0" />
          <span className="min-w-0">Dose schedule & reminders</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">Next doses, boosters, and repeat medicine schedules.</p>
      </div>

      <div className="-mx-1 px-1 flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {(["all", "upcoming", "due_today", "overdue", "completed"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap ${
              filter === f ? "bg-primary text-white border-primary" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {f === "all" ? "All" : f.replace("_", " ")}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
        {rows.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No reminders yet. Record vaccine usage to create the next dose.</div>
        ) : (
          rows.map(({ r, usage, vaccine, effective }) => (
            <div key={r.id} className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="font-medium text-slate-900 break-words">{r.title ?? vaccine?.name ?? "Reminder"}</div>
                <div className="text-sm text-slate-500 mt-0.5 break-words">
                  Due {formatDualDate(r.reminderDate, r.reminderDateBs)}
                  {usage ? ` · Batch ${usage.animalBatch}` : ""}
                  {r.cadence ? ` · ${r.cadence}` : ""}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeClass(effective)}`}>{effective}</span>
                {effective !== "completed" && r.id ? (
                  <button
                    type="button"
                    onClick={() => void markComplete(r.id!)}
                    className="text-sm font-semibold text-emerald-700 hover:underline"
                  >
                    Mark done
                  </button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
