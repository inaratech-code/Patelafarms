"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { db } from "@/lib/db";
import { localDayKey } from "@/lib/erp/metrics";
import { doseReminderEffectiveStatus } from "@/lib/notifications";
import { vaccineDateEnteredRecently } from "@/lib/farmHealth";
import { formatDualDate } from "@/lib/nepaliDate";

function DoseListItem(props: {
  title: string;
  batch: string;
  date: string;
  datePrefix?: string;
  tone: "upcoming" | "due_today" | "overdue";
}) {
  const box =
    props.tone === "overdue"
      ? "border-red-200 bg-red-50"
      : props.tone === "due_today"
        ? "border-orange-300 bg-orange-50"
        : "border-slate-200 bg-slate-50";
  const titleCls =
    props.tone === "overdue" ? "text-red-900" : props.tone === "due_today" ? "text-orange-900" : "text-slate-900";
  const metaCls =
    props.tone === "overdue" ? "text-red-700" : props.tone === "due_today" ? "text-orange-800" : "text-slate-500";

  return (
    <li className={`rounded-lg border px-3 py-2 text-sm min-w-0 ${box}`}>
      <div className={`font-medium break-words ${titleCls}`}>
        {props.title}
        {props.batch ? <span className={metaCls}> · {props.batch}</span> : null}
      </div>
      <div className={`text-xs mt-0.5 ${metaCls}`}>
        {props.datePrefix ?? ""}
        {props.date}
      </div>
    </li>
  );
}

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
    const recent = vaccines.filter((v) => vaccineDateEnteredRecently(v, todayKey, 14)).slice(0, 4);
    return { upcoming, overdue, alerts: recent };
  }, [reminders, usages, vaccines, todayKey]);

  return (
    <div className="rounded-2xl bg-white border border-[#e2e8f0] shadow-sm overflow-hidden min-w-0">
      <div className="p-4 sm:p-6 border-b border-[#e2e8f0] flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-medium text-[#64748b]">Farm health</div>
          <div className="mt-1 text-base sm:text-lg font-semibold text-[#0f172a]">Doses &amp; stock alerts</div>
        </div>
        <Link
          href="/farm-health/dose-schedule"
          className="text-sm font-semibold text-[#0871b3] hover:underline shrink-0 self-start sm:self-center"
        >
          Schedule
        </Link>
      </div>
      <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-[#64748b] uppercase tracking-wide">Upcoming / due</div>
          <ul className="mt-2 space-y-2">
            {upcoming.length === 0 ? (
              <li className="text-sm text-slate-500">No upcoming doses.</li>
            ) : (
              upcoming.map(({ r, live, title, batch }) => (
                <DoseListItem
                  key={r.id ?? r.uid}
                  title={title}
                  batch={batch}
                  date={formatDualDate(r.reminderDate, r.reminderDateBs)}
                  tone={live === "due_today" ? "due_today" : "upcoming"}
                />
              ))
            )}
          </ul>
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-[#64748b] uppercase tracking-wide">Overdue</div>
          <ul className="mt-2 space-y-2">
            {overdue.length === 0 ? (
              <li className="text-sm text-slate-500">None — great job.</li>
            ) : (
              overdue.map(({ r, title, batch }) => (
                <DoseListItem
                  key={r.id ?? r.uid}
                  title={title}
                  batch={batch}
                  date={formatDualDate(r.reminderDate, r.reminderDateBs)}
                  datePrefix="Was due "
                  tone="overdue"
                />
              ))
            )}
          </ul>
        </div>
        <div className="md:col-span-2 min-w-0">
          <div className="text-xs font-semibold text-[#64748b] uppercase tracking-wide">
            <span className="sm:hidden">Recent stock</span>
            <span className="hidden sm:inline">Recent stock (entered in last 14 days)</span>
          </div>
          <ul className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {alerts.length === 0 ? (
              <li className="text-sm text-slate-500">No items entered in the last 14 days.</li>
            ) : (
              alerts.map((v) => (
                <li
                  key={v.id ?? v.uid}
                  className="rounded-lg sm:rounded-full border border-amber-200 bg-amber-50 px-3 py-2 sm:py-1 text-xs font-medium text-amber-900 break-words max-w-full"
                >
                  {v.name}
                  {v.purchaseDate
                    ? ` · entered ${formatDualDate(v.purchaseDate, v.purchaseDateBs)}`
                    : ""}
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
