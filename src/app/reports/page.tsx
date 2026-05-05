"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { db } from "@/lib/db";
import {
  inventoryStockValue,
  localDayKey,
} from "@/lib/erp/metrics";

function monthKeyNow() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
}

function dayKey(d: Date) {
  return localDayKey(d);
}

export default function ReportsPage() {
  const inventory = useLiveQuery(() => db.inventory.toArray()) ?? [];
  const sales = useLiveQuery(() => db.sales.toArray()) ?? [];
  const purchases = useLiveQuery(() => db.purchases.toArray()) ?? [];
  const dayBook = useLiveQuery(() => db.dayBook.toArray()) ?? [];
  const consumption = useLiveQuery(() => db.consumptionLogs.toArray()) ?? [];
  const losses = useLiveQuery(() => db.inventoryLosses.toArray()) ?? [];

  const monthKey = monthKeyNow();
  const todayKey = dayKey(new Date());

  const [period, setPeriod] = useState<"day" | "week" | "month">("day");

  const periodRange = useMemo(() => {
    if (period === "day") {
      const d = new Date();
      return { startKey: dayKey(d), endKey: dayKey(d) };
    }
    if (period === "week") {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 6);
      return { startKey: dayKey(start), endKey: dayKey(end) };
    }
    // month: represented via monthKey, but also provide keys for consistent filtering when needed
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { startKey: dayKey(start), endKey: dayKey(end) };
  }, [period]);

  const periodLabel = useMemo(() => {
    if (period === "day") return `Daily (${periodRange.startKey})`;
    if (period === "week") return `Weekly (${periodRange.startKey} → ${periodRange.endKey})`;
    return `Monthly (${monthKey})`;
  }, [period, periodRange, monthKey]);

  const isWithinRange = (iso: string) => {
    const k = dayKey(new Date(iso));
    return k >= periodRange.startKey && k <= periodRange.endKey;
  };

  const summary = useMemo(() => {
    const salesTotal = sales.filter((s) => isWithinRange(s.date)).reduce((a, s) => a + Number(s.totalPrice ?? 0), 0);
    const purchasesTotal = purchases
      .filter((p) => isWithinRange(p.date))
      .reduce((a, p) => a + Number(p.totalCost ?? 0), 0);
    const dayBookExpenses = dayBook
      .filter((e) => e.type === "Expense" && isWithinRange(e.time))
      .reduce((a, e) => a + Number(e.amount ?? 0), 0);
    const feedCost = consumption.filter((c) => isWithinRange(c.date)).reduce((a, c) => a + Number(c.cost ?? 0), 0);
    const lossCost = losses.filter((l) => isWithinRange(l.date)).reduce((a, l) => a + Number(l.estimatedCost ?? 0), 0);

    // Simple P&L for the selected period (range-based).
    const net = salesTotal - purchasesTotal - feedCost - lossCost - dayBookExpenses;

    return { salesTotal, purchasesTotal, dayBookExpenses, feedCost, lossCost, net };
  }, [sales, purchases, dayBook, consumption, losses, periodRange, period]);

  const stockValue = useMemo(() => inventoryStockValue(inventory), [inventory]);

  const itemsById = useMemo(() => new Map(inventory.map((i) => [i.id!, i])), [inventory]);

  const topSelling = useMemo(() => {
    const m = new Map<number, { qty: number; revenue: number }>();
    for (const s of sales) {
      if (period === "month") {
        if (!monthPrefix(s.date, monthKey)) continue;
      } else {
        if (!isWithinRange(s.date)) continue;
      }
      const cur = m.get(s.itemId) ?? { qty: 0, revenue: 0 };
      cur.qty += Number(s.quantity ?? 0);
      cur.revenue += Number(s.totalPrice ?? 0);
      m.set(s.itemId, cur);
    }
    return [...m.entries()]
      .map(([itemId, v]) => ({ itemId, name: itemsById.get(itemId)?.name ?? `#${itemId}`, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);
  }, [sales, monthKey, itemsById, period, periodRange]);

  const feedRecent = useMemo(() => {
    return consumption
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 12)
      .map((c) => ({
        ...c,
        itemName: itemsById.get(c.itemId)?.name ?? `#${c.itemId}`,
      }));
  }, [consumption, itemsById]);

  const mortality = useMemo(() => {
    return losses
      .filter((l) => l.lossType === "Dead")
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 12)
      .map((l) => ({
        ...l,
        itemName: itemsById.get(l.itemId)?.name ?? `#${l.itemId}`,
      }));
  }, [losses, itemsById]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Reports</h1>
          <p className="mt-1 text-sm text-slate-500">Daily, weekly, and monthly summaries with trends and lists.</p>
        </div>
        <Link href="/outstanding" className="text-sm font-medium text-primary hover:underline">
          Outstanding parties →
        </Link>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">{periodLabel} summary</h2>
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-sm">
            <button
              type="button"
              onClick={() => setPeriod("day")}
              className={`px-3 py-1.5 rounded-md font-semibold ${period === "day" ? "bg-white shadow-sm text-slate-900" : "text-slate-600 hover:text-slate-900"}`}
            >
              Day
            </button>
            <button
              type="button"
              onClick={() => setPeriod("week")}
              className={`px-3 py-1.5 rounded-md font-semibold ${period === "week" ? "bg-white shadow-sm text-slate-900" : "text-slate-600 hover:text-slate-900"}`}
            >
              Week
            </button>
            <button
              type="button"
              onClick={() => setPeriod("month")}
              className={`px-3 py-1.5 rounded-md font-semibold ${period === "month" ? "bg-white shadow-sm text-slate-900" : "text-slate-600 hover:text-slate-900"}`}
            >
              Month
            </button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <ReportStat label="Sales" value={summary.salesTotal} />
          <ReportStat label="Purchases" value={summary.purchasesTotal} />
          <ReportStat label="Day-book expenses" value={summary.dayBookExpenses} />
          <ReportStat label="Feed usage (cost)" value={summary.feedCost} />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Profit &amp; loss ({periodLabel})</h2>
        <div className="mt-4 space-y-2 text-sm">
          <Row label="Gross sales" value={summary.salesTotal} />
          <Row label="Purchases" value={summary.purchasesTotal} outflow />
          <Row label="Feed expense (consumption)" value={summary.feedCost} outflow />
          <Row label="Loss / mortality cost" value={summary.lossCost} outflow />
          <Row label="Day-book expenses" value={summary.dayBookExpenses} outflow />
          <Row label="Net profit" value={summary.net} emphasize />
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Net profit = sales − purchases − feed − loss − day-book expenses (range based).
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Inventory valuation</h2>
        <p className="mt-2 text-2xl font-semibold text-slate-900">Rs. {stockValue.toLocaleString()}</p>
        <p className="mt-1 text-xs text-slate-500">Σ quantity × average cost (falls back to cost price).</p>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Feed consumption (recent)</h2>
          <ul className="mt-4 divide-y divide-slate-100 text-sm">
            {feedRecent.length === 0 ? (
              <li className="py-3 text-slate-500">No consumption logs yet.</li>
            ) : (
              feedRecent.map((c) => (
                <li key={c.id ?? c.uid} className="py-2 flex justify-between gap-2">
                  <span className="text-slate-700">
                    {new Date(c.date).toLocaleDateString()} — {c.itemName}{" "}
                    <span className="text-slate-500">
                      ({c.quantity} · {c.category.replace(/_/g, " ")})
                    </span>
                  </span>
                  <span className="font-medium text-slate-900 shrink-0">Rs. {Number(c.cost).toLocaleString()}</span>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Mortality (dead stock)</h2>
          <ul className="mt-4 divide-y divide-slate-100 text-sm">
            {mortality.length === 0 ? (
              <li className="py-3 text-slate-500">No mortality records.</li>
            ) : (
              mortality.map((l) => (
                <li key={l.id ?? l.uid} className="py-2 flex justify-between gap-2">
                  <span className="text-slate-700">
                    {new Date(l.date).toLocaleDateString()} — {l.itemName}{" "}
                    <span className="text-slate-500">
                      ({l.quantity} {l.unit})
                    </span>
                  </span>
                  <span className="font-medium text-slate-900 shrink-0">Rs. {Number(l.estimatedCost).toLocaleString()}</span>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Top selling items ({periodLabel})</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2 pr-4">Item</th>
                <th className="py-2 pr-4">Qty sold</th>
                <th className="py-2">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {topSelling.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-4 text-slate-500">
                    No sales in this period.
                  </td>
                </tr>
              ) : (
                topSelling.map((r) => (
                  <tr key={r.itemId} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-medium text-slate-900">{r.name}</td>
                    <td className="py-2 pr-4 text-slate-600">{r.qty}</td>
                    <td className="py-2 text-slate-900">Rs. {r.revenue.toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function monthPrefix(iso: string, mk: string) {
  return new Date(iso).toISOString().slice(0, 7) === mk;
}

function ReportStat(props: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 px-4 py-3 border border-slate-100">
      <div className="text-xs font-medium text-slate-500">{props.label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">Rs. {props.value.toLocaleString()}</div>
    </div>
  );
}

function Row(props: { label: string; value: number; outflow?: boolean; emphasize?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className={props.emphasize ? "font-semibold text-slate-900" : "text-slate-600"}>{props.label}</span>
      <span
        className={`font-medium tabular-nums ${
          props.emphasize ? "text-slate-900 text-base" : props.outflow ? "text-slate-700" : "text-slate-900"
        }`}
      >
        Rs. {props.value.toLocaleString()}
      </span>
    </div>
  );
}
