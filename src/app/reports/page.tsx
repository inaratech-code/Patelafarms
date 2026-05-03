"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { db } from "@/lib/db";
import {
  feedExpenseMonth,
  grossSalesMonth,
  inventoryStockValue,
  lossExpenseMonth,
  netProfitErp,
  purchasesMonth,
} from "@/lib/erp/metrics";

function monthKeyNow() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
}

function todayKeyLocal() {
  return new Date().toISOString().split("T")[0];
}

export default function ReportsPage() {
  const inventory = useLiveQuery(() => db.inventory.toArray()) ?? [];
  const sales = useLiveQuery(() => db.sales.toArray()) ?? [];
  const purchases = useLiveQuery(() => db.purchases.toArray()) ?? [];
  const dayBook = useLiveQuery(() => db.dayBook.toArray()) ?? [];
  const consumption = useLiveQuery(() => db.consumptionLogs.toArray()) ?? [];
  const losses = useLiveQuery(() => db.inventoryLosses.toArray()) ?? [];

  const monthKey = monthKeyNow();
  const todayKey = todayKeyLocal();

  const daily = useMemo(() => {
    const salesToday = sales
      .filter((s) => new Date(s.date).toISOString().split("T")[0] === todayKey)
      .reduce((a, s) => a + Number(s.totalPrice ?? 0), 0);
    const purchasesToday = purchases
      .filter((p) => new Date(p.date).toISOString().split("T")[0] === todayKey)
      .reduce((a, p) => a + Number(p.totalCost ?? 0), 0);
    const expensesToday = dayBook
      .filter((e) => e.type === "Expense" && e.time.slice(0, 10) === todayKey)
      .reduce((a, e) => a + Number(e.amount ?? 0), 0);
    const feedToday = consumption
      .filter((c) => new Date(c.date).toISOString().split("T")[0] === todayKey)
      .reduce((a, c) => a + Number(c.cost ?? 0), 0);
    return { salesToday, purchasesToday, expensesToday, feedToday };
  }, [sales, purchases, dayBook, consumption, todayKey]);

  const pnlMonth = useMemo(
    () =>
      netProfitErp({
        inventory,
        sales,
        purchases,
        dayBook,
        consumption,
        losses,
        monthKey,
        todayKey,
      }),
    [inventory, sales, purchases, dayBook, consumption, losses, monthKey, todayKey]
  );

  const gross = useMemo(() => grossSalesMonth(sales, monthKey), [sales, monthKey]);
  const buys = useMemo(() => purchasesMonth(purchases, monthKey), [purchases, monthKey]);
  const feedM = useMemo(() => feedExpenseMonth(consumption, monthKey), [consumption, monthKey]);
  const lossM = useMemo(() => lossExpenseMonth(losses, monthKey), [losses, monthKey]);

  const stockValue = useMemo(() => inventoryStockValue(inventory), [inventory]);

  const itemsById = useMemo(() => new Map(inventory.map((i) => [i.id!, i])), [inventory]);

  const topSelling = useMemo(() => {
    const m = new Map<number, { qty: number; revenue: number }>();
    for (const s of sales) {
      if (!monthPrefix(s.date, monthKey)) continue;
      const cur = m.get(s.itemId) ?? { qty: 0, revenue: 0 };
      cur.qty += Number(s.quantity ?? 0);
      cur.revenue += Number(s.totalPrice ?? 0);
      m.set(s.itemId, cur);
    }
    return [...m.entries()]
      .map(([itemId, v]) => ({ itemId, name: itemsById.get(itemId)?.name ?? `#${itemId}`, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);
  }, [sales, monthKey, itemsById]);

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
          <p className="mt-1 text-sm text-slate-500">Daily summary, monthly P&amp;L, feed, mortality, and top sellers.</p>
        </div>
        <Link href="/outstanding" className="text-sm font-medium text-primary hover:underline">
          Outstanding parties →
        </Link>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Daily summary ({todayKey})</h2>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <ReportStat label="Sales" value={daily.salesToday} />
          <ReportStat label="Purchases" value={daily.purchasesToday} />
          <ReportStat label="Day-book expenses" value={daily.expensesToday} />
          <ReportStat label="Feed usage (cost)" value={daily.feedToday} />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Monthly profit &amp; loss ({monthKey})</h2>
        <div className="mt-4 space-y-2 text-sm">
          <Row label="Gross sales" value={gross} />
          <Row label="Purchases" value={buys} outflow />
          <Row label="Feed expense (consumption)" value={feedM} outflow />
          <Row label="Loss / mortality cost" value={lossM} outflow />
          <Row label="Net profit (ERP formula)" value={pnlMonth} emphasize />
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Net profit = sales − purchases − feed − loss costs − other operating expenses logged in the day book (non-purchase).
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
        <h2 className="text-lg font-semibold text-slate-900">Top selling items ({monthKey})</h2>
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
                    No sales this month.
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
