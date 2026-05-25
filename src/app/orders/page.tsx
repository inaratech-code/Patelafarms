"use client";

import { ShoppingCart, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type DayBookEntry, type PaymentStatusErp } from "@/lib/db";
import {
  addLedgerEntry,
  ensureSupplierLedgerAccount,
  getOrCreateLedgerAccountId,
  getOrCreateCashLedgerAccountId,
} from "@/lib/ledger";
import { getOrCreateDefaultCashAccountId, sortAccountsForPicker, type PaymentMethod } from "@/lib/accounts";
import { makeSyncEvent } from "@/lib/syncEvents";
import { newUid } from "@/lib/uid";
import { buildSupplierNameOptions } from "@/lib/supplierOptions";
import { PageRoot } from "@/components/ui/responsive-table";
import { DualDateDisplay } from "@/components/ui/DualDateDisplay";
import { DualDateField } from "@/components/ui/DualDateField";
import { datePairFromAdYmd, timePairFromAdYmd, todayAdYmd } from "@/lib/nepaliDate";
import { normalizeSaleUnit, SALE_UNIT_OPTIONS } from "@/lib/saleUnits";

type LedgerOutAccount = { uid: string; name: string; type: string } | null;
type LedgerOutEntry = {
  uid: string;
  date: string;
  description: string;
  debit: number;
  credit: number;
} | null;

/** Digits + one dot; strips meaningless leading zeros on the whole part (keeps 0.5). */
function normalizeSaleQtyInput(raw: string): string {
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

function parseSaleQuantityInput(s: string): number | null {
  const t = s.trim();
  if (t === "" || t === ".") return null;
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

export default function OrdersPage() {
  const searchParams = useSearchParams();
  const inventory = useLiveQuery(() => db.inventory.toArray()) || [];
  const sales = useLiveQuery(() => db.sales.toArray()) || [];
  const purchases = useLiveQuery(() => db.purchases.toArray()) || [];
  const financialAccounts = useLiveQuery(() => db.financialAccounts.toArray()) || [];
  const ledgerCustomers = useLiveQuery(() => db.ledgerAccounts.where("type").equals("Customer").toArray()) || [];
  const ledgerSuppliers = useLiveQuery(() => db.ledgerAccounts.where("type").equals("Supplier").toArray()) || [];

  const customerOptions = useMemo(() => {
    const names = new Set<string>();
    for (const a of ledgerCustomers) {
      if (a.name?.trim()) names.add(a.name.trim());
    }
    for (const s of sales) {
      const n = s.customerName?.trim();
      if (n) names.add(n);
    }
    const rest = Array.from(names)
      .sort((a, b) => a.localeCompare(b));
    return rest;
  }, [ledgerCustomers, sales]);

  const supplierOptions = useMemo(
    () => buildSupplierNameOptions(ledgerSuppliers, purchases),
    [ledgerSuppliers, purchases]
  );
  
  const [activeTab, setActiveTab] = useState<"Sales" | "Purchases">("Sales");
  const [showForm, setShowForm] = useState(false);

  const [saleQuantityStr, setSaleQuantityStr] = useState("1");
  const [saleUnit, setSaleUnit] = useState<string>("pcs");
  const [saleUnitPriceStr, setSaleUnitPriceStr] = useState("");
  const [saleForm, setSaleForm] = useState<{
    itemId: number;
    customerName: string;
    date: string;
    paymentType: "Cash" | "Credit";
    method: PaymentMethod;
    financialAccountId: number;
  }>({
    itemId: 0,
    customerName: "",
    date: todayAdYmd(),
    paymentType: "Cash",
    method: "Cash",
    financialAccountId: 0,
  });
  const [purchaseUnitCostStr, setPurchaseUnitCostStr] = useState("");
  const [purchaseForm, setPurchaseForm] = useState({
    supplierName: "",
    date: todayAdYmd(),
    paymentType: "Credit" as "Cash" | "Credit",
    method: "Cash" as PaymentMethod,
    financialAccountId: 0,
    lineItemDraft: { itemId: 0, quantity: 1 },
    lineItems: [] as Array<{ itemId: number; quantity: number; unitCost: number }>,
  });

  useEffect(() => {
    const tab = searchParams.get("tab");
    const itemId = Number(searchParams.get("itemId") ?? 0);
    queueMicrotask(() => {
      if (tab === "Sales" || tab === "sales") setActiveTab("Sales");
      if (itemId > 0) {
        setSaleForm((s) => ({ ...s, itemId }));
        setShowForm(true);
        setSaleUnitPriceStr("");
        const inv = inventory.find((i) => i.id === itemId);
        if (inv) setSaleUnit(normalizeSaleUnit(inv.unit, "pcs"));
      }
    });
  }, [searchParams, inventory]);

  const saleTotal = useMemo(() => {
    const item = inventory.find((i) => i.id === Number(saleForm.itemId));
    const qty = parseSaleQuantityInput(saleQuantityStr);
    const unit = parseSaleQuantityInput(saleUnitPriceStr.trim());
    if (!item || qty == null || qty <= 0 || unit == null || unit <= 0) return 0;
    return unit * qty;
  }, [inventory, saleForm.itemId, saleQuantityStr, saleUnitPriceStr]);

  const purchaseTotal = useMemo(() => {
    return purchaseForm.lineItems.reduce((acc, li) => acc + li.unitCost * li.quantity, 0);
  }, [purchaseForm.lineItems]);

  const addPurchaseLineItem = () => {
    const itemId = Number(purchaseForm.lineItemDraft.itemId);
    const item = inventory.find((i) => i.id === itemId);
    const quantity = Number(purchaseForm.lineItemDraft.quantity);
    if (!itemId || !item) return;
    if (!quantity || quantity <= 0) {
      return alert("Enter a quantity greater than 0.");
    }

    let unitCost = parseSaleQuantityInput(purchaseUnitCostStr.trim());
    if (unitCost == null || unitCost <= 0) {
      unitCost = Number(item.costPrice ?? 0);
    }
    if (!Number.isFinite(unitCost) || unitCost <= 0) {
      return alert("Enter a valid cost per unit (greater than 0), or set a list cost on the item.");
    }

    setPurchaseForm((prev) => {
      const existingIdx = prev.lineItems.findIndex((li) => li.itemId === itemId);
      const nextLineItems = [...prev.lineItems];
      if (existingIdx >= 0) {
        const ex = nextLineItems[existingIdx];
        const newQty = ex.quantity + quantity;
        const blendedUnit = newQty > 0 ? (ex.unitCost * ex.quantity + unitCost * quantity) / newQty : unitCost;
        nextLineItems[existingIdx] = { itemId, quantity: newQty, unitCost: blendedUnit };
      } else {
        nextLineItems.push({ itemId, quantity, unitCost });
      }
      return { ...prev, lineItems: nextLineItems, lineItemDraft: { itemId: 0, quantity: 1 } };
    });
    setPurchaseUnitCostStr("");
  };

  const removePurchaseLineItem = (itemId: number) => {
    setPurchaseForm((prev) => ({
      ...prev,
      lineItems: prev.lineItems.filter((li) => li.itemId !== itemId),
    }));
  };

  const handleSaleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qtyParsed = parseSaleQuantityInput(saleQuantityStr);
    if (qtyParsed == null) {
      return alert("Enter a quantity.");
    }
    if (qtyParsed <= 0) {
      return alert("Quantity must be greater than 0.");
    }
    const item = inventory.find(i => i.id === Number(saleForm.itemId));
    if (!item || item.quantity < qtyParsed) return alert("Not enough stock!");
    const unitLabel = normalizeSaleUnit(saleUnit, item.unit);

    const unitPrice = parseSaleQuantityInput(saleUnitPriceStr.trim());
    if (unitPrice == null || unitPrice <= 0) {
      return alert("Enter a valid selling price per unit (greater than 0).");
    }
    const totalPrice = unitPrice * qtyParsed;
    const { date, dateBs } = datePairFromAdYmd(saleForm.date);
    const { time, timeBs } = timePairFromAdYmd(saleForm.date);

    const isCredit = saleForm.paymentType === "Credit";
    const customerNameResolved = saleForm.customerName.trim();
    if (isCredit && !customerNameResolved) {
      return alert("Customer name is required for Credit sales (for ledger).");
    }

    await db.transaction('rw', db.tables, async () => {
      const cashLedgerAccountId = !isCredit ? await getOrCreateCashLedgerAccountId() : null;

      // 1. Record Sale
      const saleUid = newUid();
      const sale = {
        uid: saleUid,
        itemId: item.id!,
        quantity: qtyParsed,
        saleUnit: unitLabel,
        totalPrice,
        unitPrice,
        customerName: customerNameResolved || undefined,
        paymentType: saleForm.paymentType,
        date,
        dateBs,
        paidAmount: isCredit ? 0 : totalPrice,
        dueAmount: isCredit ? totalPrice : 0,
        paymentStatus: (isCredit ? "due" : "paid") as PaymentStatusErp,
      };
      const saleId = await db.sales.add(sale);

      // 2. Reduce Stock
      await db.inventory.update(item.id!, { quantity: item.quantity - qtyParsed });
      // 3. Record Movement
      const movement = { uid: newUid(), itemId: item.id!, quantity: qtyParsed, type: 'OUT' as const, reason: 'Sale' as const, date, dateBs };
      const movementId = await db.stockMovement.add(movement);
      // 4. Day book: cash (affects cash) + credit (journal-only, does not affect cash balance)
      let dayBookId: number | null = null;
      let dayBookUid: string | null = null;
      let dayBookEntry: Omit<DayBookEntry, "id"> | null = null;
      {
        const accountId = Number(saleForm.financialAccountId) || (await getOrCreateDefaultCashAccountId());
        const acct = await db.financialAccounts.get(accountId);
        dayBookUid = newUid();
        if (!isCredit) {
          dayBookEntry = {
            uid: dayBookUid,
            time,
            timeBs,
            type: "Income",
            category: "Sale",
            amount: totalPrice,
            description: `Sold ${qtyParsed} ${unitLabel} ${item.name} @ Rs.${unitPrice}/${unitLabel} (${saleForm.method})`,
            method: saleForm.method,
            accountId,
            affectsCash: true,
            party: customerNameResolved || "Cash sale",
            entryStatus: "Paid",
            refType: "sale",
            refId: saleUid,
          };
        } else {
          dayBookEntry = {
            uid: dayBookUid,
            time,
            timeBs,
            type: "Income",
            category: "Sale",
            amount: totalPrice,
            description: `Credit sale: ${qtyParsed} ${unitLabel} ${item.name} @ Rs.${unitPrice}/${unitLabel}`,
            method: "Credit",
            accountId,
            affectsCash: false,
            party: customerNameResolved,
            entryStatus: "Unpaid",
            refType: "sale",
            refId: saleUid,
          };
        }
        dayBookId = (await db.dayBook.add(dayBookEntry as Omit<DayBookEntry, "id">)) as number;

        await db.outbox.add(
          makeSyncEvent({
            entityType: "daybook.entry",
            entityId: dayBookUid,
            op: "create",
            payload: {
              entry: {
                ...dayBookEntry,
                account: acct?.uid ? { uid: acct.uid, name: acct.name, type: acct.type } : null,
              },
            },
          })
        );
      }

      // 5. Ledger entry (cash: cash ledger; credit: customer ledger)
      let ledgerAccountId: number | null = null;
      let ledgerEntryId: number | null = null;
      let ledgerAccount: LedgerOutAccount = null;
      let ledgerEntry: LedgerOutEntry = null;
      if (!isCredit && cashLedgerAccountId) {
        ledgerAccountId = cashLedgerAccountId;
        const acct = await db.ledgerAccounts.get(ledgerAccountId);
        ledgerAccount = acct?.uid ? { uid: acct.uid, name: acct.name, type: acct.type } : null;
        ledgerEntryId = (await addLedgerEntry({
          accountId: ledgerAccountId,
          date,
          description: `Cash sale: ${qtyParsed} ${unitLabel} ${item.name} @ Rs.${unitPrice}/${unitLabel}`,
          debit: totalPrice,
          credit: 0,
        })) as number;
        const entryRow = await db.ledgerEntries.get(ledgerEntryId);
        ledgerEntry = entryRow?.uid
          ? {
              uid: entryRow.uid,
              date: entryRow.date,
              description: entryRow.description,
              debit: entryRow.debit,
              credit: entryRow.credit,
            }
          : null;
      } else if (isCredit) {
        ledgerAccountId = await getOrCreateLedgerAccountId({ name: customerNameResolved, type: "Customer" });
        const acct = await db.ledgerAccounts.get(ledgerAccountId);
        ledgerAccount = acct?.uid ? { uid: acct.uid, name: acct.name, type: acct.type } : null;
        ledgerEntryId = (await addLedgerEntry({
          accountId: ledgerAccountId,
          date,
          description: `Credit sale: ${qtyParsed} ${unitLabel} ${item.name} @ Rs.${unitPrice}/${unitLabel}`,
          debit: totalPrice,
          credit: 0,
        })) as number;
        const entryRow = await db.ledgerEntries.get(ledgerEntryId);
        ledgerEntry = entryRow?.uid
          ? {
              uid: entryRow.uid,
              date: entryRow.date,
              description: entryRow.description,
              debit: entryRow.debit,
              credit: entryRow.credit,
            }
          : null;

      }
      if (ledgerAccount?.uid && ledgerEntry?.uid) {
        await db.outbox.add(
          makeSyncEvent({
            entityType: "ledger.entry",
            entityId: ledgerEntry.uid,
            op: "create",
            payload: { account: ledgerAccount, entry: ledgerEntry },
          })
        );
      }

      await db.outbox.add(
        makeSyncEvent({
          entityType: "order.sale",
          entityId: saleUid,
          op: "create",
          payload: {
            sale: { ...sale, itemUid: item.uid },
            movement: { ...movement, itemUid: item.uid },
            inventoryDelta: { itemUid: item.uid, delta: -qtyParsed },
            dayBookUid,
            ledgerEntryUid: ledgerEntry?.uid ?? null,
            ledgerAccountUid: ledgerAccount?.uid ?? null,
          },
        })
      );
    });

    setShowForm(false);
    setSaleQuantityStr("1");
    setSaleUnitPriceStr("");
    setSaleUnit("pcs");
    setSaleForm({
      itemId: 0,
      customerName: "",
      date: todayAdYmd(),
      paymentType: "Cash",
      method: "Cash",
      financialAccountId: 0,
    });
  };

  const handlePurchaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchaseForm.supplierName.trim()) return alert("Supplier name is required.");
    if (purchaseForm.lineItems.length === 0) return alert("Add at least one item to purchase.");

    const { date, dateBs } = datePairFromAdYmd(purchaseForm.date);
    const { time, timeBs } = timePairFromAdYmd(purchaseForm.date);
    const supplierName = purchaseForm.supplierName.trim();

    const lineItemsResolved = purchaseForm.lineItems.map((li) => {
      const item = inventory.find((i) => i.id === li.itemId);
      return { ...li, item };
    });

    if (lineItemsResolved.some((li) => !li.item)) return alert("One or more selected items were not found.");

    const totalCost = lineItemsResolved.reduce((acc, li) => acc + li.unitCost * li.quantity, 0);
    const description = `Purchase from ${supplierName} (${purchaseForm.lineItems.length} item(s))`;
    const supplierLedgerId = await ensureSupplierLedgerAccount(supplierName);

    await db.transaction('rw', db.tables, async () => {
      const purchaseBatchUid = newUid();
      const purchaseRows: Array<Record<string, unknown>> = [];
      const movementRows: Array<Record<string, unknown>> = [];
      const inventoryDeltas: Array<{ itemUid: string; delta: number }> = [];

      for (const li of lineItemsResolved) {
        const item = li.item!;
        if (!item.uid) throw new Error("Inventory item missing uid (sync requires uid)");
        const lineCost = li.unitCost * li.quantity;
        const prevQty = item.quantity;
        const prevAvg = Number(item.avgCost ?? item.costPrice ?? 0);
        const newQty = prevQty + li.quantity;
        const newAvg = newQty > 0 ? (prevQty * prevAvg + lineCost) / newQty : prevAvg;

        const purchase = {
          uid: newUid(),
          supplierName,
          supplierId: supplierLedgerId,
          itemId: item.id!,
          quantity: li.quantity,
          totalCost: lineCost,
          date,
          dateBs,
        };
        const pid = await db.purchases.add(purchase);

        await db.inventory.update(item.id!, { quantity: newQty, avgCost: newAvg });
        const movement = { uid: newUid(), itemId: item.id!, quantity: li.quantity, type: 'IN' as const, reason: 'Purchase' as const, date, dateBs };
        const mid = await db.stockMovement.add(movement);

        purchaseRows.push({ ...purchase, itemUid: item.uid, localId: pid });
        movementRows.push({ ...movement, itemUid: item.uid, localId: mid });
        inventoryDeltas.push({ itemUid: item.uid, delta: li.quantity });
      }

      // Purchase accounting:
      // - Cash: affects Day Book (selected account) and does NOT create payable.
      // - Credit: creates payable in ledger + journal day book row (no cash impact).
      let dayBookId: number | null = null;
      let dayBookUid: string | null = null;
      let dayBookEntry: Omit<DayBookEntry, "id"> | null = null;
      let ledgerAccountId: number | null = null;
      let ledgerEntryId: number | null = null;
      let ledgerAccount: LedgerOutAccount = null;
      let ledgerEntry: LedgerOutEntry = null;
      if (purchaseForm.paymentType === "Cash") {
        const accountId = Number(purchaseForm.financialAccountId) || (await getOrCreateDefaultCashAccountId());
        const acct = await db.financialAccounts.get(accountId);
        dayBookUid = newUid();
        dayBookEntry = {
          uid: dayBookUid,
          time,
          timeBs,
          type: "Expense",
          category: "Purchase",
          amount: totalCost,
          description: `${description} (${purchaseForm.method})`,
          method: purchaseForm.method,
          accountId,
          affectsCash: true,
          party: supplierName,
          entryStatus: "Paid",
          refType: "purchase",
          refId: purchaseBatchUid,
        };
        dayBookId = (await db.dayBook.add(dayBookEntry)) as number;

        await db.outbox.add(
          makeSyncEvent({
            entityType: "daybook.entry",
            entityId: dayBookUid,
            op: "create",
            payload: {
              entry: {
                ...dayBookEntry,
                account: acct?.uid
                  ? { uid: acct.uid, name: acct.name, type: acct.type }
                  : null,
              },
            },
          })
        );
      } else {
        ledgerAccountId = supplierLedgerId;
        ledgerEntryId = (await addLedgerEntry({ accountId: ledgerAccountId, date, description, debit: 0, credit: totalCost })) as number;
        const acct = await db.ledgerAccounts.get(ledgerAccountId);
        ledgerAccount = acct?.uid ? { uid: acct.uid, name: acct.name, type: acct.type } : null;
        const entryRow = await db.ledgerEntries.get(ledgerEntryId);
        ledgerEntry = entryRow?.uid
          ? {
              uid: entryRow.uid,
              date: entryRow.date,
              description: entryRow.description,
              debit: entryRow.debit,
              credit: entryRow.credit,
            }
          : null;

        if (ledgerAccount?.uid && ledgerEntry?.uid) {
          await db.outbox.add(
            makeSyncEvent({
              entityType: "ledger.entry",
              entityId: ledgerEntry.uid,
              op: "create",
              payload: { account: ledgerAccount, entry: ledgerEntry },
            })
          );
        }

        const accountIdDb = await getOrCreateDefaultCashAccountId();
        const acctDb = await db.financialAccounts.get(accountIdDb);
        dayBookUid = newUid();
        dayBookEntry = {
          uid: dayBookUid,
          time,
          timeBs,
          type: "Expense",
          category: "Purchase",
          amount: totalCost,
          description: `${description} (Credit)`,
          method: "Credit",
          accountId: accountIdDb,
          affectsCash: false,
          party: supplierName,
          entryStatus: "Due",
          refType: "purchase",
          refId: purchaseBatchUid,
        };
        dayBookId = (await db.dayBook.add(dayBookEntry as Omit<DayBookEntry, "id">)) as number;
        await db.outbox.add(
          makeSyncEvent({
            entityType: "daybook.entry",
            entityId: dayBookUid,
            op: "create",
            payload: {
              entry: {
                ...dayBookEntry,
                account: acctDb?.uid ? { uid: acctDb.uid, name: acctDb.name, type: acctDb.type } : null,
              },
            },
          })
        );
      }

      await db.outbox.add(
        makeSyncEvent({
          entityType: "order.purchase",
          entityId: purchaseBatchUid,
          op: "create",
          payload: {
            purchaseBatchUid,
            supplierName,
            date,
            paymentType: purchaseForm.paymentType,
            method: purchaseForm.method,
            totalCost,
            purchases: purchaseRows.map(({ localId, ...p }) => p),
            movements: movementRows.map(({ localId, ...m }) => m),
            inventoryDeltas,
            dayBookUid,
            ledgerEntryUid: ledgerEntry?.uid ?? null,
            ledgerAccountUid: ledgerAccount?.uid ?? null,
          },
        })
      );
    });

    setShowForm(false);
    setPurchaseUnitCostStr("");
    setPurchaseForm({
      supplierName: "",
      date: todayAdYmd(),
      paymentType: "Credit",
      method: "Cash",
      financialAccountId: 0,
      lineItemDraft: { itemId: 0, quantity: 1 },
      lineItems: [],
    });
  };

  const sortedSales = useMemo(
    () => [...sales].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [sales]
  );
  const sortedPurchases = useMemo(
    () => [...purchases].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [purchases]
  );

  return (
    <PageRoot>
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900">Order Management</h1>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-full sm:w-auto bg-slate-100 p-1 rounded-lg">
            <button onClick={() => setActiveTab('Sales')} className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'Sales' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>Sales (POS)</button>
            <button onClick={() => setActiveTab('Purchases')} className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'Purchases' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>Purchases</button>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>{showForm ? "Cancel" : activeTab === 'Sales' ? "New Sale" : "New Purchase"}</span>
          </button>
        </div>
      </div>

      {showForm && activeTab === 'Sales' && (
        <form onSubmit={handleSaleSubmit} className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Select Item</label>
            <select
              required
              value={saleForm.itemId}
              onChange={(e) => {
                const id = Number(e.target.value);
                setSaleForm({ ...saleForm, itemId: id });
                setSaleUnitPriceStr("");
                const inv = inventory.find((i) => i.id === id);
                if (inv) setSaleUnit(normalizeSaleUnit(inv.unit, "pcs"));
              }}
              className="w-full px-3 py-2 border rounded-md bg-white"
            >
              <option value={0}>Select...</option>
              {inventory.map(i => <option key={i.id} value={i.id}>{i.name} ({i.quantity} {i.unit} left)</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Quantity</label>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={saleQuantityStr}
              onChange={(e) => setSaleQuantityStr(normalizeSaleQtyInput(e.target.value))}
              className="w-full px-3 py-2 border rounded-md"
              placeholder="e.g. 29.8"
            />
            <p className="mt-1 text-xs text-slate-500">Stock is deducted in inventory units; pick a bill label below.</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Unit</label>
            <select
              value={saleUnit}
              onChange={(e) => setSaleUnit(e.target.value)}
              className="w-full px-3 py-2 border rounded-md bg-white"
            >
              {SALE_UNIT_OPTIONS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Selling price (per unit)</label>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={saleUnitPriceStr}
              onChange={(e) => setSaleUnitPriceStr(normalizeSaleQtyInput(e.target.value))}
              className="w-full px-3 py-2 border rounded-md"
              placeholder="Enter price per unit"
              title="Retail rate for this sale (cash or credit)"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Customer</label>
            <select
              value={saleForm.customerName}
              onChange={(e) => setSaleForm({ ...saleForm, customerName: e.target.value })}
              className="w-full px-3 py-2 border rounded-md bg-white"
            >
              {customerOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <DualDateField value={saleForm.date} onChange={(ad) => setSaleForm({ ...saleForm, date: ad })} required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Payment Type</label>
            <select value={saleForm.paymentType} onChange={e => setSaleForm({...saleForm, paymentType: e.target.value as "Cash"|"Credit"})} className="w-full px-3 py-2 border rounded-md bg-white">
              <option value="Cash">Cash</option>
              <option value="Credit">Credit (Update Ledger)</option>
            </select>
          </div>
          {saleForm.paymentType === "Cash" ? (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Payment Mode</label>
                <select
                  value={saleForm.method}
                  onChange={(e) => setSaleForm({ ...saleForm, method: e.target.value as PaymentMethod })}
                  className="w-full px-3 py-2 border rounded-md bg-white"
                >
                  <option value="Cash">Cash</option>
                  <option value="QR">QR</option>
                  <option value="BankTransfer">Bank Transfer</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Account</label>
                <select
                  value={saleForm.financialAccountId}
                  onChange={(e) => setSaleForm({ ...saleForm, financialAccountId: Number(e.target.value) })}
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
          <div className="sm:col-span-2 lg:col-span-4 flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mt-2 border-t pt-4">
            <div className="text-lg font-semibold text-slate-900">
              Total: Rs. {saleTotal}
            </div>
            <button type="submit" className="px-6 py-2 bg-alert-green text-white rounded-md hover:bg-alert-green/90">Complete Sale</button>
          </div>
        </form>
      )}

      {showForm && activeTab === 'Purchases' && (
        <form onSubmit={handlePurchaseSubmit} className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Supplier</label>
              <input
                required
                type="text"
                list="orders-purchase-supplier-names"
                autoComplete="off"
                value={purchaseForm.supplierName}
                onChange={(e) => setPurchaseForm({ ...purchaseForm, supplierName: e.target.value })}
                className="w-full px-3 py-2 border rounded-md bg-white"
                placeholder="Pick from list or type a new supplier"
              />
              <datalist id="orders-purchase-supplier-names">
                {supplierOptions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              <p className="mt-1 text-xs text-slate-500">New supplier names are added to the ledger automatically.</p>
            </div>
            <div>
              <DualDateField
                value={purchaseForm.date}
                onChange={(ad) => setPurchaseForm({ ...purchaseForm, date: ad })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Payment Type</label>
              <select
                value={purchaseForm.paymentType}
                onChange={(e) => setPurchaseForm({ ...purchaseForm, paymentType: e.target.value as "Cash" | "Credit" })}
                className="w-full px-3 py-2 border rounded-md bg-white"
              >
                <option value="Credit">Credit (Payable in Ledger)</option>
                <option value="Cash">Paid Now (Affects Account)</option>
              </select>
            </div>
          </div>

          {purchaseForm.paymentType === "Cash" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
              <div className="sm:col-span-2">
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
            </div>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium mb-1">Select Item</label>
              <select
                value={purchaseForm.lineItemDraft.itemId}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  const row = inventory.find((i) => i.id === id);
                  setPurchaseForm({
                    ...purchaseForm,
                    lineItemDraft: { ...purchaseForm.lineItemDraft, itemId: id },
                  });
                  setPurchaseUnitCostStr(row ? String(row.costPrice ?? "") : "");
                }}
                className="w-full px-3 py-2 border rounded-md bg-white"
              >
                <option value={0}>Select...</option>
                {inventory.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} (Current: {i.quantity} {i.unit})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Quantity</label>
              <input
                type="number"
                min={0}
                step="any"
                value={purchaseForm.lineItemDraft.quantity}
                onChange={(e) =>
                  setPurchaseForm({
                    ...purchaseForm,
                    lineItemDraft: { ...purchaseForm.lineItemDraft, quantity: Number(e.target.value) },
                  })
                }
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Cost (per unit)</label>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={purchaseUnitCostStr}
                onChange={(e) => setPurchaseUnitCostStr(normalizeSaleQtyInput(e.target.value))}
                className="w-full px-3 py-2 border rounded-md"
                placeholder="Buy rate per unit"
                title="Leave blank to use the item list cost"
              />
            </div>
            <div>
              <button
                type="button"
                onClick={addPurchaseLineItem}
                className="w-full px-4 py-2 bg-secondary text-white rounded-md hover:bg-secondary/90"
              >
                Add Item
              </button>
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden">
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
                    const item = inventory.find((i) => i.id === li.itemId);
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

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center border-t pt-4">
            <div className="text-lg font-semibold text-slate-900">Total Cost: Rs. {purchaseTotal.toLocaleString()}</div>
            <button type="submit" className="px-6 py-2 bg-primary text-white rounded-md hover:bg-primary/90">
              Complete Purchase
            </button>
          </div>
        </form>
      )}

      {/* History */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden min-w-0">
        {activeTab === 'Sales' ? (
          sortedSales.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
               <ShoppingCart className="w-12 h-12 mx-auto mb-4 text-slate-300" />
               <p className="text-lg font-medium text-slate-900">No sales recorded</p>
            </div>
          ) : (
            <>
              <div className="md:hidden divide-y divide-slate-100">
                {sortedSales.map((sale) => {
                  const item = inventory.find((i) => i.id === sale.itemId);
                  const customerLabel = sale.customerName?.trim()
                    ? sale.customerName.trim()
                    : sale.paymentType === "Cash"
                      ? "Cash sale"
                      : "Credit sale";
                  const unitLabel = sale.saleUnit ?? item?.unit ?? "pcs";
                  const unitPrice =
                    sale.unitPrice ?? (sale.quantity ? sale.totalPrice / sale.quantity : 0);
                  return (
                    <div key={sale.id} className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900 break-words">
                            {customerLabel}{" "}
                            <span className="text-slate-500 font-normal">({sale.paymentType})</span>
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            <DualDateDisplay iso={sale.date} dateBs={sale.dateBs} layout="inline" />
                          </div>
                        </div>
                        <div className="shrink-0 text-sm font-semibold text-alert-green tabular-nums">
                          + Rs. {sale.totalPrice.toLocaleString()}
                        </div>
                      </div>
                      <div className="text-sm text-slate-700 break-words">
                        {sale.quantity}x {item?.name || "Unknown"}
                      </div>
                      <div className="text-xs text-slate-500">
                        {unitLabel} @ Rs. {unitPrice.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                        /{unitLabel}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Date</th>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Customer</th>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Item</th>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {sortedSales.map((sale) => {
                      const item = inventory.find((i) => i.id === sale.itemId);
                      return (
                        <tr key={sale.id}>
                          <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-slate-500"><DualDateDisplay iso={sale.date} dateBs={sale.dateBs} /></td>
                          <td className="px-4 lg:px-6 py-4 text-sm text-slate-900">
                            {sale.customerName?.trim()
                              ? sale.customerName.trim()
                              : sale.paymentType === "Cash"
                                ? "Cash sale"
                                : "Credit sale"}{" "}
                            ({sale.paymentType})
                          </td>
                          <td className="px-4 lg:px-6 py-4 text-sm text-slate-900">
                            {sale.quantity}x {item?.name || "Unknown"}
                            <span className="block text-xs text-slate-500 mt-0.5">
                              {sale.saleUnit ?? item?.unit ?? "pcs"} @ Rs.{" "}
                              {(sale.unitPrice ??
                                (sale.quantity ? sale.totalPrice / sale.quantity : 0)
                              ).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                              /{sale.saleUnit ?? item?.unit ?? "unit"}
                            </span>
                          </td>
                          <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm font-medium text-alert-green">+ Rs. {sale.totalPrice}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )
        ) : (
          sortedPurchases.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
               <ShoppingCart className="w-12 h-12 mx-auto mb-4 text-slate-300" />
               <p className="text-lg font-medium text-slate-900">No purchases recorded</p>
            </div>
          ) : (
            <>
              <div className="md:hidden divide-y divide-slate-100">
                {sortedPurchases.map((purchase) => {
                  const item = inventory.find((i) => i.id === purchase.itemId);
                  return (
                    <div key={purchase.id} className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900 break-words">
                            {purchase.supplierName}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            <DualDateDisplay iso={purchase.date} dateBs={purchase.dateBs} layout="inline" />
                          </div>
                        </div>
                        <div className="shrink-0 text-sm font-semibold text-slate-900 tabular-nums">
                          - Rs. {purchase.totalCost.toLocaleString()}
                        </div>
                      </div>
                      <div className="text-sm text-slate-700 break-words">
                        {purchase.quantity}x {item?.name || "Unknown"}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Date</th>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Supplier</th>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Item</th>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {sortedPurchases.map((purchase) => {
                      const item = inventory.find((i) => i.id === purchase.itemId);
                      return (
                        <tr key={purchase.id}>
                          <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-slate-500"><DualDateDisplay iso={purchase.date} dateBs={purchase.dateBs} /></td>
                          <td className="px-4 lg:px-6 py-4 text-sm text-slate-900">{purchase.supplierName}</td>
                          <td className="px-4 lg:px-6 py-4 text-sm text-slate-900">{purchase.quantity}x {item?.name || "Unknown"}</td>
                          <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">- Rs. {purchase.totalCost}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )
        )}
      </div>
    </PageRoot>
  );
}
