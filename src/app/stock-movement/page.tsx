"use client";

import { Plus, Minus } from "lucide-react";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type StockMovement } from "@/lib/db";
import { makeSyncEvent } from "@/lib/syncEvents";
import { newUid } from "@/lib/uid";

type MovementMode = "Add" | "Remove";

const reasonOptions: Array<StockMovement["reason"]> = ["Harvest", "Sale", "Usage", "Purchase", "Damage"];

export default function StockMovementPage() {
  const inventory = useLiveQuery(() => db.inventory.toArray()) || [];
  const movements = useLiveQuery(() => db.stockMovement.toArray()) || [];

  const [mode, setMode] = useState<MovementMode>("Add");
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    itemId: 0,
    quantity: 1,
    reason: "Harvest" as StockMovement["reason"],
  });

  const selectedItem = useMemo(() => inventory.find((i) => i.id === Number(form.itemId)), [inventory, form.itemId]);
  const movementType: StockMovement["type"] = mode === "Add" ? "IN" : "OUT";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    const item = inventory.find((i) => i.id === Number(form.itemId));
    if (!item) return alert("Please select an item.");
    const qty = Number(form.quantity);
    if (!Number.isFinite(qty) || qty <= 0) return alert("Quantity must be greater than 0.");
    if (movementType === "OUT" && item.quantity < qty) return alert("Not enough stock to remove.");

    const date = new Date().toISOString();
    const nextQty = movementType === "IN" ? item.quantity + qty : item.quantity - qty;

    try {
      setIsSaving(true);
      await db.transaction("rw", db.tables, async () => {
        await db.inventory.update(item.id!, { quantity: nextQty });
        const movement = {
          uid: newUid(),
          itemId: item.id!,
          quantity: qty,
          type: movementType,
          reason: form.reason,
          date,
        };
        const id = await db.stockMovement.add(movement);
        await db.outbox.add(
          makeSyncEvent({
            entityType: "stock.movement",
            entityId: movement.uid!,
            op: "create",
            payload: { id, movement },
          })
        );
      });

      setForm((prev) => ({ ...prev, quantity: 1 }));
    } catch (err) {
      console.error(err);
      alert("Failed to save stock movement. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const history = useMemo(() => {
    const itemsById = new Map(inventory.map((i) => [i.id!, i]));
    return movements
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .map((m) => ({ ...m, item: itemsById.get(m.itemId) }));
  }, [inventory, movements]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-semibold text-slate-900">Stock Movement</h1>
        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setMode("Add")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              mode === "Add" ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
            }`}
            type="button"
          >
            + Add Stock
          </button>
          <button
            onClick={() => setMode("Remove")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              mode === "Remove" ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
            }`}
            type="button"
          >
            - Remove Stock
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Item</label>
            <select
              value={form.itemId}
              onChange={(e) => setForm({ ...form, itemId: Number(e.target.value) })}
              className="w-full px-3 py-2 border rounded-md bg-white"
              required
            >
              <option value={0}>Select ▼</option>
              {inventory.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.quantity} {i.unit})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as MovementMode)}
              className="w-full px-3 py-2 border rounded-md bg-white"
            >
              <option value="Add">Add</option>
              <option value="Remove">Remove</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Quantity</label>
            <input
              required
              type="number"
              min={1}
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
              className="w-full px-3 py-2 border rounded-md"
            />
            {selectedItem && (
              <div className="mt-1 text-xs text-slate-500">
                In stock: {selectedItem.quantity} {selectedItem.unit}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Reason</label>
            <select
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value as StockMovement["reason"] })}
              className="w-full px-3 py-2 border rounded-md bg-white"
            >
              {reasonOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end border-t pt-4">
          <button
            type="submit"
            disabled={isSaving}
            className={`px-6 py-2 text-white rounded-md transition-colors ${
              mode === "Add" ? "bg-secondary hover:bg-secondary/90" : "bg-alert-red hover:bg-alert-red/90"
            } ${isSaving ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            {mode === "Add" ? (
              <span className="inline-flex items-center gap-2">
                <Plus className="w-4 h-4" /> {isSaving ? "Saving..." : "Submit"}
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <Minus className="w-4 h-4" /> {isSaving ? "Saving..." : "Submit"}
              </span>
            )}
          </button>
        </div>
      </form>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-lg font-medium text-slate-900">History Log</h2>
        </div>

        {history.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No stock movements recorded.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {history.slice(0, 30).map((m) => {
              const itemName = m.item?.name ?? "Unknown item";
              const unit = m.item?.unit ?? "";
              const sign = m.type === "IN" ? "+" : "-";
              const time = new Date(m.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
              return (
                <div key={m.id} className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-base font-semibold text-slate-900">
                        {itemName} {sign}
                        {m.quantity}
                        {unit}
                      </div>
                      <div className="mt-1 text-sm text-slate-600">Reason: {m.reason}</div>
                      <div className="mt-1 text-sm text-slate-500">Time: {time}</div>
                    </div>
                    <div
                      className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        m.type === "IN" ? "bg-alert-green/10 text-alert-green" : "bg-alert-red/10 text-alert-red"
                      }`}
                    >
                      {m.type === "IN" ? "Added" : "Removed"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

