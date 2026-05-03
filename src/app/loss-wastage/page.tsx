"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import { db, type InventoryLossType } from "@/lib/db";
import { newUid } from "@/lib/uid";
import { makeSyncEvent } from "@/lib/syncEvents";
import { getOrCreateDefaultCashAccountId } from "@/lib/accounts";

const lossTypes: Array<{ id: InventoryLossType; label: string; badge: string }> = [
  { id: "Dead", label: "Dead", badge: "bg-rose-500/10 text-rose-700" },
  { id: "Damaged", label: "Damaged", badge: "bg-orange-500/10 text-orange-700" },
  { id: "Spoiled", label: "Spoiled", badge: "bg-yellow-500/15 text-yellow-800" },
  { id: "Missing", label: "Missing", badge: "bg-slate-500/10 text-slate-700" },
  { id: "Theft", label: "Theft", badge: "bg-slate-800/10 text-slate-800" },
  { id: "Wastage", label: "Wastage", badge: "bg-amber-500/10 text-amber-700" },
];

function normalizeDecimal(raw: string) {
  // allow digits + one dot, trim leading zeros ("0002" -> "2", "02.50" -> "2.50", "0.5" stays)
  const cleaned = raw.replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  const intPart = (parts[0] ?? "").replace(/^0+(?=\d)/, "");
  const decPart = parts.length > 1 ? parts.slice(1).join("") : "";
  const out = parts.length > 1 ? `${intPart || "0"}.${decPart}` : intPart;
  return out;
}

export default function LossWastagePage() {
  const searchParams = useSearchParams();
  const qpItemId = Number(searchParams.get("itemId") ?? 0);

  const inventory = useLiveQuery(() => db.inventory.toArray()) || [];
  const lossesRaw = useLiveQuery(() => db.inventoryLosses.toArray());
  const losses = useMemo(() => lossesRaw ?? [], [lossesRaw]);

  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    itemId: 0,
    lossType: "Dead" as InventoryLossType,
    quantity: "",
    unit: "",
    estimatedCost: "",
    reason: "",
    date: new Date().toISOString().slice(0, 10), // YYYY-MM-DD
  });

  const sorted = useMemo(() => {
    return losses
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [losses]);

  useEffect(() => {
    if (!qpItemId || !inventory.length) return;
    const item = inventory.find((i) => i.id === qpItemId);
    if (!item?.id) return;
    setForm((f) => ({ ...f, itemId: qpItemId, unit: item.unit ?? f.unit }));
    setShowForm(true);
  }, [qpItemId, inventory]);

  const onSelectItem = (itemId: number) => {
    const item = inventory.find((i) => i.id === itemId);
    setForm((p) => ({ ...p, itemId, unit: item?.unit ?? p.unit }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    const item = inventory.find((i) => i.id === Number(form.itemId));
    if (!item?.id) return alert("Select an item.");

    const qty = Number(form.quantity);
    if (!Number.isFinite(qty) || qty <= 0) return alert("Quantity must be greater than 0.");
    if (qty > item.quantity) return alert("Loss quantity cannot exceed current stock.");

    const cost = Number(form.estimatedCost);
    if (!Number.isFinite(cost) || cost <= 0) return alert("Estimated cost must be greater than 0.");

    const date = new Date(`${form.date}T12:00:00`).toISOString();
    const lossUid = newUid();
    const movementUid = newUid();
    const dayUid = newUid();

    const reasonText = form.reason.trim();
    const description = `Inventory loss (${form.lossType}): ${qty} ${form.unit || item.unit} ${item.name}${reasonText ? ` — ${reasonText}` : ""}`;

    try {
      setIsSaving(true);
      await db.transaction("rw", db.tables, async () => {
        // 1) Reduce inventory
        await db.inventory.update(item.id!, { quantity: item.quantity - qty });

        // 2) Stock movement
        await db.stockMovement.add({
          uid: movementUid,
          itemId: item.id!,
          quantity: qty,
          type: "OUT",
          reason: "Loss",
          date,
        });

        // 3) Loss record
        const lossRow = {
          uid: lossUid,
          itemId: item.id!,
          lossType: form.lossType,
          quantity: qty,
          unit: form.unit || item.unit,
          estimatedCost: cost,
          reason: reasonText || undefined,
          date,
          createdBy: undefined,
        };
        const lossId = await db.inventoryLosses.add(lossRow);

        // 4) Expense (Day Book) — operating expense, no purchase category
        const accountId = await getOrCreateDefaultCashAccountId();
        const acct = await db.financialAccounts.get(accountId);
        const day = {
          uid: dayUid,
          time: date,
          type: "Expense" as const,
          category: "Other" as const,
          amount: cost,
          description,
          method: "Cash" as const,
          accountId,
        };
        const dayBookId = await db.dayBook.add(day);

        // 5) Outbox for sync + activity log
        await db.outbox.add(
          makeSyncEvent({
            entityType: "inventory.loss",
            entityId: lossUid,
            op: "create",
            payload: {
              lossId,
              loss: { ...lossRow, itemUid: item.uid },
              movement: { uid: movementUid, itemUid: item.uid, delta: -qty, reason: form.lossType },
              dayBookUid: dayUid,
              dayBookId,
              account: acct?.uid ? { uid: acct.uid, name: acct.name, type: acct.type } : null,
            },
          }),
        );
      });

      setShowForm(false);
      setForm({
        itemId: 0,
        lossType: "Dead",
        quantity: "",
        unit: "",
        estimatedCost: "",
        reason: "",
        date: new Date().toISOString().slice(0, 10),
      });
    } catch (err) {
      console.error(err);
      alert("Failed to record loss. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Inventory Loss / Wastage</h1>
          <div className="mt-1 text-sm text-slate-500">Record dead, damaged, spoiled, missing, theft, or wastage stock.</div>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>{showForm ? "Cancel" : "Add Loss"}</span>
        </button>
      </div>

      {showForm ? (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-2">
              <label className="block text-sm font-medium mb-1">Item Name</label>
              <select
                required
                value={form.itemId}
                onChange={(e) => onSelectItem(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-md bg-white"
              >
                <option value={0}>Select item…</option>
                {inventory.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} (Stock: {i.quantity} {i.unit})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Loss Type</label>
              <select
                value={form.lossType}
                onChange={(e) => setForm((p) => ({ ...p, lossType: e.target.value as InventoryLossType }))}
                className="w-full px-3 py-2 border rounded-md bg-white"
              >
                {lossTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Date</label>
              <input
                required
                type="date"
                value={form.date}
                onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Quantity</label>
              <input
                required
                inputMode="decimal"
                type="text"
                value={form.quantity}
                onChange={(e) => setForm((p) => ({ ...p, quantity: normalizeDecimal(e.target.value) }))}
                className="w-full px-3 py-2 border rounded-md"
                placeholder="e.g. 2.5"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Unit</label>
              <input
                required
                type="text"
                value={form.unit}
                onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))}
                className="w-full px-3 py-2 border rounded-md"
                placeholder="e.g. kg, pcs"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-sm font-medium mb-1">Estimated Cost (Rs.)</label>
              <input
                required
                inputMode="decimal"
                type="text"
                value={form.estimatedCost}
                onChange={(e) => setForm((p) => ({ ...p, estimatedCost: normalizeDecimal(e.target.value) }))}
                className="w-full px-3 py-2 border rounded-md"
                placeholder="e.g. 1200"
              />
            </div>

            <div className="lg:col-span-4">
              <label className="block text-sm font-medium mb-1">Reason / Notes</label>
              <input
                type="text"
                value={form.reason}
                onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
                className="w-full px-3 py-2 border rounded-md"
                placeholder="Optional notes"
              />
            </div>
          </div>

          <div className="flex justify-end border-t pt-4">
            <button
              type="submit"
              disabled={isSaving}
              className={`px-6 py-2 bg-secondary text-white rounded-md hover:bg-secondary/90 ${isSaving ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              {isSaving ? "Saving..." : "Record Loss"}
            </button>
          </div>
        </form>
      ) : null}

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-900">Loss History</h2>
          <AlertTriangle className="w-5 h-5 text-slate-400" />
        </div>

        {sorted.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No losses recorded.</div>
        ) : (
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Item</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Qty</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Cost</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {sorted.slice(0, 50).map((l) => {
                const item = inventory.find((i) => i.id === l.itemId);
                const tone = lossTypes.find((t) => t.id === l.lossType)?.badge ?? "bg-slate-500/10 text-slate-700";
                return (
                  <tr key={l.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{new Date(l.date).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-sm text-slate-900">{item?.name ?? "Unknown"}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${tone}`}>{l.lossType}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {l.quantity} {l.unit}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-right text-slate-900">
                      Rs. {l.estimatedCost.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

