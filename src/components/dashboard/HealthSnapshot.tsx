"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { db } from "@/lib/db";
import { localDayKey } from "@/lib/erp/metrics";
import { doseReminderEffectiveStatus } from "@/lib/notifications";
import { vaccineExpirySoon } from "@/lib/farmHealth";

export function HealthSnapshot() {
  const vaccines = useLiveQuery(() => db.vaccines.toArray()) || [];
  const reminders = useLiveQuery(() => db.doseReminders.toArray()) || [];
  const usages = useLiveQuery(() => db.vaccineUsages.toArray()) || [];

  const todayKey = useMemo(() => localDayKey(new Date()), []);

  const { upcoming, overdue, alerts } = useMemo(() => {
    const vaccineById = new Map(vaccines.map((v) => [v.id!, v]));
    const enriched = reminders
      .filter((r) => doseReminderEffectiveStatus(r) !== "completed")
      .map((r) => {
        const live = doseReminderEffectiveStatus(r);
        const u = usages.find((x) => x.id === r.vaccineUsageId);
        const v = u ? vaccineById.get(u.vaccineId) : undefined;
        return { r, live, title: r.title ?? v?.name ?? "Dose", batch: u?.animalBatch ?? "" };
      })
      .sort((a, b) => a.r.reminderDate.localeCompare(b.r.reminderDate));

    const overdue = enriched.filter((x) => x.live === "overdue").slice(0, 6);
    const upcoming = enriched
      .filter((x) => x.live === "upcoming" || x.live === "due_today")
      .slice(0, 6);
    const exp = vaccines.filter((v) => vaccineExpirySoon(v, todayKey, 14)).slice(0, 4);
    return { upcoming, overdue, alerts: exp };
  }, [reminders, usages, vaccines, todayKey]);

  return (
    <div className="rounded-2xl bg-white border border-[#e2e8f0] shadow-sm overflow-hidden">
      <div className="p-6 border-b border-[#e2e8f0] flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-[#64748b]">Farm health</div>
          <div className="mt-1 text-lg font-semibold text-[#0f172a]">Doses &amp; stock alerts</div>
        </div>
        <Link href="/farm-health/dose-schedule" className="text-sm font-semibold text-[#0871b3] hover:underline">
          Schedule
        </Link>
      </div>
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="text-xs font-semibold text-[#64748b] uppercase tracking-wide">Upcoming / due</div>
          <ul className="mt-2 space-y-2">
            {upcoming.length === 0 ? (
              <li className="text-sm text-slate-500">No upcoming doses.</li>
            ) : (
              upcoming.map(({ r, live, title, batch }) => (
                <li
                  key={r.id ?? r.uid}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    live === "due_today" ? "border-orange-300 bg-orange-50" : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <span className="font-medium text-slate-900">{title}</span>
                  {batch ? <span className="text-slate-600"> · {batch}</span> : null}
                  <div className="text-xs text-slate-500 mt-0.5">{r.reminderDate}</div>
                </li>
              ))
            )}
          </ul>
        </div>
        <div>
          <div className="text-xs font-semibold text-[#64748b] uppercase tracking-wide">Overdue</div>
          <ul className="mt-2 space-y-2">
            {overdue.length === 0 ? (
              <li className="text-sm text-slate-500">None — great job.</li>
            ) : (
              overdue.map(({ r, title, batch }) => (
                <li key={r.id ?? r.uid} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm">
                  <span className="font-medium text-red-900">{title}</span>
                  {batch ? <span className="text-red-800"> · {batch}</span> : null}
                  <div className="text-xs text-red-700 mt-0.5">Was due {r.reminderDate}</div>
                </li>
              ))
            )}
          </ul>
        </div>
        <div className="md:col-span-2">
          <div className="text-xs font-semibold text-[#64748b] uppercase tracking-wide">Expiry (14 days)</div>
          <ul className="mt-2 flex flex-wrap gap-2">
            {alerts.length === 0 ? (
              <li className="text-sm text-slate-500">No vaccine expiry warnings.</li>
            ) : (
              alerts.map((v) => (
                <li
                  key={v.id ?? v.uid}
                  className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900"
                >
                  {v.name}
                  {v.expiryDate ? ` · exp ${v.expiryDate}` : ""}
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
