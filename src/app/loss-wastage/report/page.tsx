"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { db, type InventoryLossType } from "@/lib/db";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function monthKeyFromIso(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export default function LossReportPage() {
  const inventoryRaw = useLiveQuery(() => db.inventory.toArray());
  const lossesRaw = useLiveQuery(() => db.inventoryLosses.toArray());
  const inventory = useMemo(() => inventoryRaw ?? [], [inventoryRaw]);
  const losses = useMemo(() => lossesRaw ?? [], [lossesRaw]);
  const [month, setMonth] = useState(() => monthKeyFromIso(new Date().toISOString()));

  const filtered = useMemo(() => {
    return losses.filter((l) => monthKeyFromIso(l.date) === month);
  }, [losses, month]);

  const totals = useMemo(() => {
    const total = filtered.reduce((acc, l) => acc + l.estimatedCost, 0);
    const byType = new Map<InventoryLossType, number>();
    const byItem = new Map<number, number>();
    for (const l of filtered) {
      byType.set(l.lossType, (byType.get(l.lossType) ?? 0) + l.estimatedCost);
      byItem.set(l.itemId, (byItem.get(l.itemId) ?? 0) + l.estimatedCost);
    }
    return { total, byType, byItem };
  }, [filtered]);

  const rowsByType = useMemo(() => {
    return Array.from(totals.byType.entries())
      .map(([lossType, value]) => ({ lossType, value }))
      .sort((a, b) => b.value - a.value);
  }, [totals.byType]);

  const rowsByItem = useMemo(() => {
    return Array.from(totals.byItem.entries())
      .map(([itemId, value]) => ({
        itemId,
        itemName: inventory.find((i) => i.id === itemId)?.name ?? "Unknown",
        value,
      }))
      .sort((a, b) => b.value - a.value);
  }, [inventory, totals.byItem]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Loss Report</h1>
          <div className="mt-1 text-sm text-slate-500">Total value lost for the selected month.</div>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-slate-600">Month</label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="px-3 py-2 border rounded-md bg-white"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
          <div className="text-sm text-slate-500 font-medium">Total Value Lost</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">Rs. {totals.total.toLocaleString()}</div>
        </div>
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
          <div className="text-sm text-slate-500 font-medium">Entries</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{filtered.length.toLocaleString()}</div>
        </div>
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
          <div className="text-sm text-slate-500 font-medium">Top Type</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{rowsByType[0]?.lossType ?? "—"}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-2 gap-4 lg:gap-6 min-w-0">
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <div className="text-lg font-semibold text-slate-900">By Category</div>
          </div>
          {rowsByType.length === 0 ? (
            <div className="p-8 text-center text-slate-500">No loss entries.</div>
          ) : (
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Value</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {rowsByType.map((r) => (
                  <tr key={r.lossType}>
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">{r.lossType}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-right text-slate-900">
                      Rs. {r.value.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <div className="text-lg font-semibold text-slate-900">By Item</div>
          </div>
          {rowsByItem.length === 0 ? (
            <div className="p-8 text-center text-slate-500">No loss entries.</div>
          ) : (
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Item</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Value</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {rowsByItem.slice(0, 30).map((r) => (
                  <tr key={r.itemId}>
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">{r.itemName}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-right text-slate-900">
                      Rs. {r.value.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <div className="text-lg font-semibold text-slate-900">By Date</div>
        </div>
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No loss entries.</div>
        ) : (
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Item</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Type</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Value</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {filtered
                .slice()
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .slice(0, 80)
                .map((l) => (
                  <tr key={l.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{new Date(l.date).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-sm text-slate-900">{inventory.find((i) => i.id === l.itemId)?.name ?? "Unknown"}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">{l.lossType}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-right text-slate-900">
                      Rs. {l.estimatedCost.toLocaleString()}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

