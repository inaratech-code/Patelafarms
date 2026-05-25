"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useMemo, useState } from "react";
import { dayBookEntryAffectsCash } from "@/lib/dayBookCash";
import {
  dayBookJournalType,
  dayBookPaymentModeLabel,
  dayBookPartyLabel,
  dayBookStatusLabel,
} from "@/lib/dayBookDisplay";
import { localDayKey } from "@/lib/erp/metrics";
import {
  FEED_EXPENSE_CATEGORY,
  FARM_HEALTH_EXPENSE_CATEGORY,
  LOSS_EXPENSE_CATEGORY,
} from "@/lib/erp/expenseEntries";
import { DualDateField } from "@/components/ui/DualDateField";
import { todayAdYmd } from "@/lib/nepaliDate";
import {
  MobileCardDl,
  MobileCardHeader,
  MobileDataCard,
  PageRoot,
  ResponsiveTableShell,
} from "@/components/ui/responsive-table";

function dayBookTypeBadgeClass(type: string): string {
  if (type === "Sale") return "bg-emerald-50 text-emerald-800";
  if (type === "Purchase") return "bg-amber-50 text-amber-900";
  if (type === FARM_HEALTH_EXPENSE_CATEGORY || type === "Vaccine") return "bg-sky-50 text-sky-800";
  if (type === FEED_EXPENSE_CATEGORY) return "bg-orange-50 text-orange-900";
  if (type === LOSS_EXPENSE_CATEGORY) return "bg-rose-50 text-rose-800";
  if (type === "Receipt") return "bg-emerald-50 text-emerald-800";
  if (type === "Payment") return "bg-rose-50 text-rose-800";
  return "bg-slate-100 text-slate-700";
}

function formatMoney(amount: number): string {
  const hasFraction = Math.abs(amount % 1) > 0.001;
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  });
}


export default function DayBookPage() {
  const allEntries = useLiveQuery(() => db.dayBook.toArray()) || [];
  const [selectedDate, setSelectedDate] = useState(() => todayAdYmd());

  const rows = useMemo(() => {
    return allEntries
      .filter((e) => localDayKey(new Date(e.time)) === selectedDate)
      .slice()
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  }, [allEntries, selectedDate]);

  const summary = useMemo(() => {
    let opening = 0;
    for (const e of allEntries) {
      if (localDayKey(new Date(e.time)) >= selectedDate) continue;
      if (!dayBookEntryAffectsCash(e)) continue;
      opening += e.type === "Income" ? e.amount : -e.amount;
    }

    let cashIn = 0;
    let cashOut = 0;
    let creditSales = 0;
    let creditPurchases = 0;
    for (const e of rows) {
      if (!dayBookEntryAffectsCash(e)) {
        if (e.type === "Income" && e.category === "Sale") creditSales += e.amount;
        if (e.type === "Expense" && e.category === "Purchase") creditPurchases += e.amount;
        continue;
      }
      if (e.type === "Income") cashIn += e.amount;
      else cashOut += e.amount;
    }

    const netCash = opening + cashIn - cashOut;
    return { opening, cashIn, cashOut, creditSales, creditPurchases, netCash };
  }, [allEntries, rows, selectedDate]);

  return (
    <PageRoot className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Day Book</h1>
          <div className="text-sm text-slate-500">All movements for the day — cash and credit journal lines</div>
        </div>
        <div className="flex items-center gap-3">
          <label htmlFor="daybook-date" className="text-sm font-medium text-slate-600">
            Date
          </label>
          <DualDateField
            id="daybook-date"
            value={selectedDate}
            onChange={setSelectedDate}
            className="max-w-xs"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Opening (cash)</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">Rs. {formatMoney(summary.opening)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Cash in</div>
          <div className="mt-1 text-lg font-semibold text-emerald-700">Rs. {formatMoney(summary.cashIn)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Cash out</div>
          <div className="mt-1 text-lg font-semibold text-rose-700">Rs. {formatMoney(summary.cashOut)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Credit sales (journal)</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">Rs. {formatMoney(summary.creditSales)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Credit purchases (journal)</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">Rs. {formatMoney(summary.creditPurchases)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Net cash (close)</div>
          <div className="mt-1 text-lg font-semibold text-[#0871b3]">Rs. {formatMoney(summary.netCash)}</div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-w-0">
        <ResponsiveTableShell
          mobile={
            rows.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No transactions for this date.</div>
            ) : (
              rows.map((e) => {
                const type = dayBookJournalType(e);
                const party = dayBookPartyLabel(e);
                const mode = dayBookPaymentModeLabel(e);
                const status = dayBookStatusLabel(e);
                const cashRow = dayBookEntryAffectsCash(e);
                return (
                  <MobileDataCard key={e.id ?? e.uid ?? e.time + e.description}>
                    <MobileCardHeader
                      title={party}
                      trailing={
                        <span
                          className={`text-sm font-semibold tabular-nums ${e.type === "Income" ? "text-emerald-700" : "text-rose-700"}`}
                        >
                          {e.type === "Income" ? "+" : "-"} Rs. {formatMoney(e.amount)}
                        </span>
                      }
                    />
                    <div className="flex flex-wrap gap-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${dayBookTypeBadgeClass(type)}`}
                      >
                        {type}
                      </span>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                          status === "Unpaid"
                            ? "bg-red-50 text-red-800"
                            : status === "Due" || status === "Partial"
                              ? "bg-orange-50 text-orange-900"
                              : status === "Paid"
                                ? "bg-emerald-50 text-emerald-800"
                                : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {status}
                        {!cashRow ? " · journal" : ""}
                      </span>
                    </div>
                    <MobileCardDl
                      rows={[
                        { label: "Payment", value: mode },
                        { label: "Details", value: e.description, fullWidth: true },
                      ]}
                    />
                  </MobileDataCard>
                );
              })
            )
          }
        >
          <table className="min-w-[900px] w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-600">
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Party</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Payment mode</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No transactions for this date.
                  </td>
                </tr>
              ) : (
                rows.map((e) => {
                  const type = dayBookJournalType(e);
                  const party = dayBookPartyLabel(e);
                  const mode = dayBookPaymentModeLabel(e);
                  const status = dayBookStatusLabel(e);
                  const cashRow = dayBookEntryAffectsCash(e);
                  return (
                    <tr key={e.id ?? e.uid ?? e.time + e.description} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${dayBookTypeBadgeClass(type)}`}
                        >
                          {type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-900">{party}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        {e.type === "Income" ? "+" : "-"} Rs. {formatMoney(e.amount)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{mode}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                            status === "Unpaid"
                              ? "bg-red-50 text-red-800"
                              : status === "Due" || status === "Partial"
                                ? "bg-orange-50 text-orange-900"
                                : status === "Paid"
                                  ? "bg-emerald-50 text-emerald-800"
                                  : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {status}
                          {!cashRow ? " · journal" : ""}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 max-w-xs truncate" title={e.description}>
                        {e.description}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </ResponsiveTableShell>
      </div>
    </PageRoot>
  );
}
