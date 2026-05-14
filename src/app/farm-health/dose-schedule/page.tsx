"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { db, type DoseReminderStatus } from "@/lib/db";
import { refreshDoseReminderStatuses } from "@/lib/farmHealth";
import { doseReminderEffectiveStatus } from "@/lib/notifications";

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
    await db.doseReminders.update(id, {
      status: "completed",
      completedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm text-slate-500">
          <Link href="/farm-health/vaccines" className="text-primary font-medium hover:underline">
            Vaccines
          </Link>
          <span className="mx-2">·</span>
          <Link href="/farm-health/health-logs" className="text-primary font-medium hover:underline">
            Health logs
          </Link>
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900 flex items-center gap-2">
          <CalendarClock className="w-7 h-7 text-primary" />
          Dose schedule & reminders
        </h1>
        <p className="mt-1 text-sm text-slate-500">Next doses, boosters, and repeat medicine schedules.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "upcoming", "due_today", "overdue", "completed"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
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
            <div key={r.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="font-medium text-slate-900">{r.title ?? vaccine?.name ?? "Reminder"}</div>
                <div className="text-sm text-slate-500 mt-0.5">
                  Due {r.reminderDate}
                  {usage ? ` · Batch ${usage.animalBatch}` : ""}
                  {r.cadence ? ` · ${r.cadence}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
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
