"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState, useEffect } from "react";
import { db, type ConsumptionCategory } from "@/lib/db";
import { newUid } from "@/lib/uid";
import { makeSyncEvent } from "@/lib/syncEvents";
import { getOrCreateDefaultCashAccountId } from "@/lib/accounts";
import { FEED_EXPENSE_CATEGORY } from "@/lib/erp/expenseEntries";
import { assertStockAvailable, isConsumable, resolveItemType } from "@/lib/erp/items";
import { normalizeDecimalInput, parseDecimalInput } from "@/lib/decimalInput";
import { ArrowLeft } from "lucide-react";

const categories: Array<{ id: ConsumptionCategory; label: string }> = [
  { id: "feed_used", label: "Feed used" },
  { id: "farm_use", label: "Farm use" },
  { id: "spoilage", label: "Spoilage / other" },
];

export default function ConsumptionPage() {
  const searchParams = useSearchParams();
  const itemParam = searchParams.get("itemId") ?? "";
  return <ConsumptionPageInner key={itemParam} />;
}

function ConsumptionPageInner() {
  const searchParams = useSearchParams();
  const itemIdFromUrl = Number(searchParams.get("itemId") ?? 0);

  const inventory = useLiveQuery(() => db.inventory.toArray()) || [];
  const consumables = useMemo(
    () => inventory.filter((i) => isConsumable(i) && i.active !== false),
    [inventory]
  );

  const [itemId, setItemId] = useState(() => (itemIdFromUrl > 0 ? itemIdFromUrl : 0));
  const [qtyStr, setQtyStr] = useState("1");
  const [unitCostStr, setUnitCostStr] = useState("");
  const [category, setCategory] = useState<ConsumptionCategory>("feed_used");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const selected = inventory.find((i) => i.id === itemId);

  useEffect(() => {
    if (!selected?.id) {
      setUnitCostStr("");
      return;
    }
    const defaultCost = Number(selected.avgCost ?? selected.costPrice ?? 0);
    setUnitCostStr(defaultCost > 0 ? String(defaultCost) : "");
  }, [selected?.id]);

  const estimatedTotal = useMemo(() => {
    const qty = parseDecimalInput(qtyStr);
    const unit = parseDecimalInput(unitCostStr);
    if (qty == null || unit == null || qty <= 0 || unit <= 0) return null;
    return qty * unit;
  }, [qtyStr, unitCostStr]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected?.id) return alert("Select a consumable item.");
    if (!isConsumable(selected)) return alert("This item is not marked as consumable. Change item type on Inventory (feed).");

    const qty = parseDecimalInput(qtyStr);
    if (qty == null || qty <= 0) return alert("Enter a valid quantity.");

    try {
      assertStockAvailable(selected.quantity, qty);
    } catch (err) {
      return alert(err instanceof Error ? err.message : "Stock error");
    }

    let unitCost = parseDecimalInput(unitCostStr.trim());
    if (unitCost == null || unitCost <= 0) {
      unitCost = Number(selected.avgCost ?? selected.costPrice ?? 0);
    }
    if (!Number.isFinite(unitCost) || unitCost <= 0) {
      return alert("Enter a valid cost per unit (greater than 0), or set a cost on the item.");
    }

    const cost = qty * unitCost;
    const iso = new Date(`${date}T12:00:00`).toISOString();
    const logUid = newUid();
    const movUid = newUid();
    const dayUid = newUid();

    try {
      setSaving(true);
      await db.transaction("rw", db.tables, async () => {
        await db.inventory.update(selected.id!, { quantity: selected.quantity - qty });
        await db.stockMovement.add({
          uid: movUid,
          itemId: selected.id!,
          quantity: qty,
          type: "OUT",
          reason: "Usage",
          date: iso,
        });

        const log = {
          uid: logUid,
          itemId: selected.id!,
          quantity: qty,
          cost,
          category,
          notes: notes.trim() || undefined,
          date: iso,
        };
        await db.consumptionLogs.add(log);

        const accountId = await getOrCreateDefaultCashAccountId();
        const acct = await db.financialAccounts.get(accountId);
        const desc = `Consumption (${category}): ${qty} ${selected.unit} ${selected.name}`;
        const day = {
          uid: dayUid,
          time: iso,
          type: "Expense" as const,
          category: FEED_EXPENSE_CATEGORY,
          amount: cost,
          description: desc,
          method: "Cash" as const,
          accountId,
          affectsCash: true,
          entryStatus: "Paid" as const,
          party: selected.name,
          refType: "consumption",
          refId: String(logUid),
        };
        await db.dayBook.add(day);

        await db.outbox.add(
          makeSyncEvent({
            entityType: "inventory.consumption",
            entityId: logUid,
            op: "create",
            payload: {
              log: { ...log, itemUid: selected.uid },
              movement: { uid: movUid, itemUid: selected.uid, delta: -qty },
              inventoryDelta: { itemUid: selected.uid, delta: -qty },
              dayBook: {
                ...day,
                account: acct?.uid ? { uid: acct.uid, name: acct.name, type: acct.type } : null,
              },
              account: acct?.uid ? { uid: acct.uid, name: acct.name, type: acct.type } : null,
            },
          })
        );
      });
      setQtyStr("1");
      setUnitCostStr(selected ? String(Number(selected.avgCost ?? selected.costPrice ?? 0) || "") : "");
      setNotes("");
      alert("Consumption recorded.");
    } catch (err) {
      console.error(err);
      alert("Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-lg">
      <div className="flex items-center gap-3">
        <Link href="/inventory" className="text-sm text-primary font-medium inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" />
          Inventory
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Use consumable stock</h1>
        <p className="mt-1 text-sm text-slate-500">
          Records feed and other consumable usage, reduces inventory, and posts a <strong>Feed</strong> expense to the day
          book (using cost per unit). Shown on Expenses and in profit reports.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl border border-slate-200 space-y-4 shadow-sm">
        <div>
          <label htmlFor="consumption-item" className="block text-sm font-medium mb-1">
            Item (consumable)
          </label>
          <select
            id="consumption-item"
            name="consumptionItem"
            required
            className="w-full px-3 py-2 border rounded-md bg-white"
            value={itemId || ""}
            onChange={(e) => setItemId(Number(e.target.value))}
          >
            <option value="">Select…</option>
            {consumables.map((i) => (
              <option key={i.id} value={i.id!}>
                {i.name} ({i.quantity} {i.unit}) — {resolveItemType(i)}
              </option>
            ))}
          </select>
          {consumables.length === 0 ? (
            <p className="mt-2 text-xs text-amber-700">
              No consumable items yet. On Inventory, add Fish Feed / Chicken Feed and set type to <strong>Consumable</strong>.
            </p>
          ) : null}
        </div>
        <div>
          <label htmlFor="consumption-quantity" className="block text-sm font-medium mb-1">
            Quantity
          </label>
          <input
            id="consumption-quantity"
            name="consumptionQuantity"
            className="w-full px-3 py-2 border rounded-md"
            value={qtyStr}
            onChange={(e) => setQtyStr(normalizeDecimalInput(e.target.value))}
            inputMode="decimal"
          />
        </div>
        <div>
          <label htmlFor="consumption-unit-cost" className="block text-sm font-medium mb-1">
            Cost (per unit)
          </label>
          <input
            id="consumption-unit-cost"
            name="consumptionUnitCost"
            className="w-full px-3 py-2 border rounded-md"
            value={unitCostStr}
            onChange={(e) => setUnitCostStr(normalizeDecimalInput(e.target.value, 2))}
            inputMode="decimal"
            placeholder="Defaults to average cost"
          />
          {estimatedTotal != null ? (
            <p className="mt-1 text-xs text-slate-500">
              Total expense: Rs. {estimatedTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
          ) : null}
        </div>
        <div>
          <label htmlFor="consumption-category" className="block text-sm font-medium mb-1">
            Category
          </label>
          <select
            id="consumption-category"
            name="consumptionCategory"
            className="w-full px-3 py-2 border rounded-md bg-white"
            value={category}
            onChange={(e) => setCategory(e.target.value as ConsumptionCategory)}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="consumption-date" className="block text-sm font-medium mb-1">
            Date
          </label>
          <input
            id="consumption-date"
            name="consumptionDate"
            type="date"
            className="w-full px-3 py-2 border rounded-md"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="consumption-notes" className="block text-sm font-medium mb-1">
            Notes (optional)
          </label>
          <textarea
            id="consumption-notes"
            name="consumptionNotes"
            className="w-full px-3 py-2 border rounded-md text-sm"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <button type="submit" disabled={saving} className="w-full py-2 bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50">
          {saving ? "Saving…" : "Record usage"}
        </button>
      </form>
    </div>
  );
}
