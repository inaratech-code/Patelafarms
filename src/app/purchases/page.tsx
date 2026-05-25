"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type DayBookEntry } from "@/lib/db";
import { addLedgerEntry, ensureSupplierLedgerAccount } from "@/lib/ledger";
import { datePairFromAdYmd, timePairFromAdYmd, todayAdYmd } from "@/lib/nepaliDate";
import { DualDateField } from "@/components/ui/DualDateField";
import { DualDateDisplay } from "@/components/ui/DualDateDisplay";
import { getOrCreateDefaultCashAccountId, sortAccountsForPicker, type PaymentMethod } from "@/lib/accounts";
import { makeSyncEvent } from "@/lib/syncEvents";
import { newUid } from "@/lib/uid";
import { useSearchParams } from "next/navigation";
import { buildSupplierNameOptions } from "@/lib/supplierOptions";
import {
  MobileCardHeader,
  MobileDataCard,
  PageRoot,
  ResponsiveTableShell,
} from "@/components/ui/responsive-table";

/** Same decimal rules as Sales (orders page). */
function normalizeQtyInput(raw: string): string {
  let s = raw.replace(/[^\d.]/g, "");
  const firstDot = s.indexOf(".");
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
  }
  if (s === "") return "";

  const endsWithDot = s.endsWith(".") && (s.match(/\./g) ?? []).length === 1;
  const parts = s.split(".");
  let intPart = parts[0] ?? "";
  const fracPart = parts[1];

  if (intPart === "" && fracPart !== undefined) {
    intPart = "0";
  }
  if (intPart.length > 1) {
    intPart = intPart.replace(/^0+/, "") || "0";
  }

  if (fracPart !== undefined) {
    if (fracPart === "" && endsWithDot) return `${intPart}.`;
    return `${intPart}.${fracPart}`;
  }
  return intPart;
}

function parseQty(s: string): number | null {
  const t = s.trim();
  if (t === "" || t === ".") return null;
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

type PurchaseLine = { itemId: number; quantity: number; unitCost: number };

export default function PurchasesPage() {
  const inventory = useLiveQuery(() => db.inventory.toArray());
  const purchases = useLiveQuery(() => db.purchases.toArray());
  const ledgerSuppliers = useLiveQuery(() => db.ledgerAccounts.where("type").equals("Supplier").toArray()) || [];
  const financialAccounts = useLiveQuery(() => db.financialAccounts.toArray()) || [];
  const searchParams = useSearchParams();

  const [showForm, setShowForm] = useState(() => searchParams.get("new") === "1");
  const [purchaseQtyStr, setPurchaseQtyStr] = useState("1");
  const [purchaseUnitCostStr, setPurchaseUnitCostStr] = useState("");
  const [purchaseForm, setPurchaseForm] = useState({
    supplierName: "",
    date: todayAdYmd(),
    paymentType: "Due" as "Paid" | "Due",
    method: "Cash" as PaymentMethod,
    financialAccountId: 0,
    lineItemDraft: { itemId: 0 },
    lineItems: [] as PurchaseLine[],
  });

  const purchaseTotal = useMemo(() => {
    return purchaseForm.lineItems.reduce((acc, li) => acc + li.unitCost * li.quantity, 0);
  }, [purchaseForm.lineItems]);

  const addPurchaseLineItem = () => {
    const itemId = Number(purchaseForm.lineItemDraft.itemId);
    const list = inventory ?? [];
    const item = list.find((i) => i.id === itemId);
    if (!itemId || !item) return;

    const qty = parseQty(purchaseQtyStr);
    if (qty == null || qty <= 0) {
      alert("Enter a quantity greater than 0.");
      return;
    }

    let unitCost = parseQty(purchaseUnitCostStr.trim());
    if (unitCost == null || unitCost <= 0) {
      unitCost = Number(item.costPrice ?? 0);
    }
    if (!Number.isFinite(unitCost) || unitCost <= 0) {
      alert("Enter a valid cost per unit (greater than 0), or set a list cost on the item.");
      return;
    }

    setPurchaseForm((prev) => {
      const existingIdx = prev.lineItems.findIndex((li) => li.itemId === itemId);
      const nextLineItems = [...prev.lineItems];
      if (existingIdx >= 0) {
        const ex = nextLineItems[existingIdx];
        const newQty = ex.quantity + qty;
        const blendedUnit = newQty > 0 ? (ex.unitCost * ex.quantity + unitCost * qty) / newQty : unitCost;
        nextLineItems[existingIdx] = { itemId, quantity: newQty, unitCost: blendedUnit };
      } else {
        nextLineItems.push({ itemId, quantity: qty, unitCost });
      }
      return { ...prev, lineItems: nextLineItems, lineItemDraft: { itemId: 0 } };
    });
    setPurchaseQtyStr("1");
    setPurchaseUnitCostStr("");
  };

  const removePurchaseLineItem = (itemId: number) => {
    setPurchaseForm((prev) => ({
      ...prev,
      lineItems: prev.lineItems.filter((li) => li.itemId !== itemId),
    }));
  };

  const handlePurchaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchaseForm.supplierName.trim()) return alert("Supplier name is required.");
    if (purchaseForm.lineItems.length === 0) return alert("Add at least one item to purchase.");

    const inv = inventory ?? [];
    const { date, dateBs } = datePairFromAdYmd(purchaseForm.date);
    const { time, timeBs } = timePairFromAdYmd(purchaseForm.date);
    const supplierName = purchaseForm.supplierName.trim();

    const lineItemsResolved = purchaseForm.lineItems.map((li) => {
      const item = inv.find((i) => i.id === li.itemId);
      return { ...li, item };
    });

    if (lineItemsResolved.some((li) => !li.item)) return alert("One or more selected items were not found.");

    const totalCost = lineItemsResolved.reduce((acc, li) => acc + li.unitCost * li.quantity, 0);
    const description = `Purchase from ${supplierName} (${purchaseForm.lineItems.length} item(s))`;

    const supplierLedgerId = await ensureSupplierLedgerAccount(supplierName);

    await db.transaction("rw", db.tables, async () => {
      const purchaseBatchRef = newUid();
      for (const li of lineItemsResolved) {
        const item = li.item!;
        const lineCost = li.unitCost * li.quantity;
        const paid = purchaseForm.paymentType === "Paid" ? lineCost : 0;
        const due = purchaseForm.paymentType === "Paid" ? 0 : lineCost;
        const paymentStatus = purchaseForm.paymentType === "Paid" ? ("paid" as const) : ("due" as const);

        const purchase = {
          uid: newUid(),
          supplierName,
          supplierId: supplierLedgerId,
          itemId: item.id!,
          quantity: li.quantity,
          totalCost: lineCost,
          date,
          dateBs,
          paidAmount: paid,
          dueAmount: due,
          paymentStatus,
        };
        await db.purchases.add(purchase);

        const prevQty = item.quantity;
        const prevAvg = Number(item.avgCost ?? item.costPrice ?? 0);
        const addQty = li.quantity;
        const newQty = prevQty + addQty;
        const newAvg = newQty > 0 ? (prevQty * prevAvg + lineCost) / newQty : prevAvg;
        await db.inventory.update(item.id!, { quantity: newQty, avgCost: newAvg });
        const movement = {
          uid: newUid(),
          itemId: item.id!,
          quantity: li.quantity,
          type: "IN" as const,
          reason: "Purchase" as const,
          date,
          dateBs,
        };
        await db.stockMovement.add(movement);

        await db.outbox.add(
          makeSyncEvent({
            entityType: "order.purchase",
            entityId: newUid(),
            op: "create",
            payload: {
              supplierName,
              date,
              paymentType: purchaseForm.paymentType === "Paid" ? "Cash" : "Credit",
              method: purchaseForm.method,
              totalCost: lineCost,
              purchases: [{ ...purchase, itemUid: item.uid }],
              movements: [{ ...movement, itemUid: item.uid }],
              inventoryDeltas: [{ itemUid: item.uid, delta: li.quantity }],
            },
          })
        );
      }

      // Accounting:
      // - Paid: affects Day Book (selected account), no payable.
      // - Due: creates payable in ledger, no Day Book cash impact.
      if (purchaseForm.paymentType === "Paid") {
        const accountId = Number(purchaseForm.financialAccountId) || (await getOrCreateDefaultCashAccountId());
        const acct = await db.financialAccounts.get(accountId);
        const day = {
          uid: newUid(),
          time,
          timeBs,
          type: "Expense" as const,
          category: "Purchase" as const,
          amount: totalCost,
          description: `${description} (${purchaseForm.method})`,
          method: purchaseForm.method,
          accountId,
          affectsCash: true,
          party: supplierName,
          entryStatus: "Paid" as const,
          refType: "purchase",
          refId: purchaseBatchRef,
        };
        await db.dayBook.add(day);
        await db.outbox.add(
          makeSyncEvent({
            entityType: "daybook.entry",
            entityId: day.uid,
            op: "create",
            payload: { entry: { ...day, account: acct?.uid ? { uid: acct.uid, name: acct.name, type: acct.type } : null } },
          })
        );
      } else {
        const accountId = supplierLedgerId;
        const ledgerEntryId = (await addLedgerEntry({ accountId, date, description, debit: 0, credit: totalCost })) as number;
        const acct = await db.ledgerAccounts.get(accountId);
        const entryRow = await db.ledgerEntries.get(ledgerEntryId);
        if (acct?.uid && entryRow?.uid) {
          await db.outbox.add(
            makeSyncEvent({
              entityType: "ledger.entry",
              entityId: entryRow.uid,
              op: "create",
              payload: {
                account: { uid: acct.uid, name: acct.name, type: acct.type },
                entry: { uid: entryRow.uid, date: entryRow.date, description: entryRow.description, debit: entryRow.debit, credit: entryRow.credit },
              },
            })
          );
        }

        const batchRef = purchaseBatchRef;
        const accountIdDb = await getOrCreateDefaultCashAccountId();
        const acctDb = await db.financialAccounts.get(accountIdDb);
        const day = {
          uid: newUid(),
          time,
          timeBs,
          type: "Expense" as const,
          category: "Purchase" as const,
          amount: totalCost,
          description: `${description} (Credit)`,
          method: "Credit" as const,
          accountId: accountIdDb,
          affectsCash: false,
          party: supplierName,
          entryStatus: "Due" as const,
          refType: "purchase",
          refId: batchRef,
        };
        await db.dayBook.add(day as Omit<DayBookEntry, "id">);
        await db.outbox.add(
          makeSyncEvent({
            entityType: "daybook.entry",
            entityId: day.uid!,
            op: "create",
            payload: { entry: { ...day, account: acctDb?.uid ? { uid: acctDb.uid, name: acctDb.name, type: acctDb.type } : null } },
          })
        );
      }
    });

    setShowForm(false);
    setPurchaseQtyStr("1");
    setPurchaseUnitCostStr("");
    setPurchaseForm({
      supplierName: "",
      date: todayAdYmd(),
      paymentType: "Due",
      method: "Cash",
      financialAccountId: 0,
      lineItemDraft: { itemId: 0 },
      lineItems: [],
    });
  };

  const inventoryList = inventory ?? [];
  const purchaseList = purchases ?? [];

  const supplierOptions = useMemo(
    () => buildSupplierNameOptions(ledgerSuppliers, purchaseList),
    [ledgerSuppliers, purchaseList]
  );

  const sortedPurchases = useMemo(
    () => [...purchaseList].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [purchaseList]
  );

  return (
    <PageRoot>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-semibold text-slate-900">Purchase / Supplier Management</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>{showForm ? "Cancel" : "New Purchase"}</span>
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handlePurchaseSubmit}
          className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4"
        >
          <div className="lg:col-span-2">
            <label className="block text-sm font-medium mb-1">Supplier</label>
            <input
              required
              type="text"
              list="purchases-supplier-names"
              autoComplete="off"
              value={purchaseForm.supplierName}
              onChange={(e) => setPurchaseForm({ ...purchaseForm, supplierName: e.target.value })}
              className="w-full px-3 py-2 border rounded-md bg-white"
              placeholder="Pick from list or type a new supplier"
            />
            <datalist id="purchases-supplier-names">
              {supplierOptions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <p className="mt-1 text-xs text-slate-500">New supplier names are added to the ledger automatically.</p>
          </div>
          <div className="lg:col-span-2">
            <label className="block text-sm font-medium mb-1">Date</label>
            <DualDateField
              value={purchaseForm.date}
              onChange={(d) => setPurchaseForm({ ...purchaseForm, date: d })}
              required
            />
          </div>
          <div className="lg:col-span-2">
            <label className="block text-sm font-medium mb-1">Payment Type</label>
            <select
              value={purchaseForm.paymentType}
              onChange={(e) => setPurchaseForm({ ...purchaseForm, paymentType: e.target.value as "Paid" | "Due" })}
              className="w-full px-3 py-2 border rounded-md bg-white"
            >
              <option value="Due">Credit (Payable in Ledger)</option>
              <option value="Paid">Paid Now (Affects Account)</option>
            </select>
          </div>

          {purchaseForm.paymentType === "Paid" ? (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Payment Mode</label>
                <select
                  value={purchaseForm.method}
                  onChange={(e) => setPurchaseForm({ ...purchaseForm, method: e.target.value as PaymentMethod })}
                  className="w-full px-3 py-2 border rounded-md bg-white"
                >
                  <option value="Cash">Cash</option>
                  <option value="QR">QR</option>
                  <option value="BankTransfer">Bank Transfer</option>
                </select>
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <label className="block text-sm font-medium mb-1">Account</label>
                <select
                  value={purchaseForm.financialAccountId}
                  onChange={(e) => setPurchaseForm({ ...purchaseForm, financialAccountId: Number(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-md bg-white"
                >
                  <option value={0}>Select account…</option>
                  {sortAccountsForPicker(financialAccounts).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.type} — {a.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : null}

          <div>
            <label className="block text-sm font-medium mb-1">Select Item</label>
            <select
              value={purchaseForm.lineItemDraft.itemId}
              onChange={(e) => {
                const id = Number(e.target.value);
                const row = inventoryList.find((i) => i.id === id);
                setPurchaseForm({
                  ...purchaseForm,
                  lineItemDraft: { itemId: id },
                });
                setPurchaseUnitCostStr(row ? String(row.costPrice ?? "") : "");
              }}
              className="w-full px-3 py-2 border rounded-md bg-white"
            >
              <option value={0}>Select...</option>
              {inventoryList.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.quantity} {i.unit} on hand)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Quantity</label>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={purchaseQtyStr}
              onChange={(e) => setPurchaseQtyStr(normalizeQtyInput(e.target.value))}
              className="w-full px-3 py-2 border rounded-md"
              placeholder="e.g. 29.8"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Cost (per unit)</label>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={purchaseUnitCostStr}
              onChange={(e) => setPurchaseUnitCostStr(normalizeQtyInput(e.target.value))}
              className="w-full px-3 py-2 border rounded-md"
              placeholder="Buy rate per unit"
              title="Leave blank to use the item list cost"
            />
          </div>
          <div className="lg:col-span-2 flex items-end">
            <button
              type="button"
              onClick={addPurchaseLineItem}
              className="w-full px-4 py-2 bg-secondary text-white rounded-md hover:bg-secondary/90"
            >
              Add Item
            </button>
          </div>

          <div className="lg:col-span-5 border rounded-lg overflow-hidden">
            <div className="bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700">Items Purchased</div>
            {purchaseForm.lineItems.length === 0 ? (
              <div className="px-4 py-6 text-sm text-slate-500">No items added yet.</div>
            ) : (
              <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-white">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Item</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Qty</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Unit cost</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Line total</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">Remove</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {purchaseForm.lineItems.map((li) => {
                    const item = inventoryList.find((i) => i.id === li.itemId);
                    const lineCost = li.unitCost * li.quantity;
                    return (
                      <tr key={li.itemId}>
                        <td className="px-4 py-2 text-sm text-slate-900">{item?.name ?? "Unknown"}</td>
                        <td className="px-4 py-2 text-sm text-slate-900">{li.quantity}</td>
                        <td className="px-4 py-2 text-sm text-slate-900">Rs. {li.unitCost.toLocaleString()}</td>
                        <td className="px-4 py-2 text-sm text-slate-900">Rs. {lineCost.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => removePurchaseLineItem(li.itemId)}
                            className="text-alert-red hover:text-alert-red/80 text-sm font-medium"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
          </div>

          <div className="sm:col-span-2 lg:col-span-5 flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mt-2 border-t border-slate-200 pt-4">
            <div className="text-lg font-semibold text-slate-900">Total: Rs. {purchaseTotal.toLocaleString()}</div>
            <button type="submit" className="px-6 py-2 bg-alert-green text-white rounded-md hover:bg-alert-green/90">
              Complete Purchase
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {sortedPurchases.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            <p className="text-lg font-medium text-slate-900">No purchases recorded</p>
          </div>
        ) : (
          <ResponsiveTableShell
            mobile={sortedPurchases.map((purchase) => {
              const item = inventoryList.find((i) => i.id === purchase.itemId);
              return (
                <MobileDataCard key={purchase.id}>
                  <MobileCardHeader
                    title={purchase.supplierName}
                    subtitle={<DualDateDisplay iso={purchase.date} dateBs={purchase.dateBs} layout="inline" />}
                    trailing={
                      <span className="text-sm font-semibold text-slate-900 tabular-nums">
                        Rs. {purchase.totalCost.toLocaleString()}
                      </span>
                    }
                  />
                  <div className="text-sm text-slate-700 break-words">
                    {purchase.quantity}x {item?.name || "Unknown"}
                  </div>
                </MobileDataCard>
              );
            })}
          >
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Date</th>
                  <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Supplier</th>
                  <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Item</th>
                  <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Qty</th>
                  <th className="px-4 lg:px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Cost</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {sortedPurchases.map((purchase) => {
                  const item = inventoryList.find((i) => i.id === purchase.itemId);
                  return (
                    <tr key={purchase.id}>
                      <td className="px-4 lg:px-6 py-4 text-sm text-slate-500">
                        <DualDateDisplay iso={purchase.date} dateBs={purchase.dateBs} layout="inline" />
                      </td>
                      <td className="px-4 lg:px-6 py-4 text-sm text-slate-900">{purchase.supplierName}</td>
                      <td className="px-4 lg:px-6 py-4 text-sm text-slate-900">{item?.name || "Unknown"}</td>
                      <td className="px-4 lg:px-6 py-4 text-sm text-slate-900">{purchase.quantity}</td>
                      <td className="px-4 lg:px-6 py-4 text-sm font-medium text-right text-slate-900 tabular-nums">
                        Rs. {purchase.totalCost.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ResponsiveTableShell>
        )}
      </div>
    </PageRoot>
  );
}

