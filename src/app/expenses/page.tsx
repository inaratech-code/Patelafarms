"use client";

import { Plus, Receipt } from "lucide-react";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type DayBookEntry } from "@/lib/db";
import { getOrCreateDefaultCashAccountId, sortAccountsForPicker, type PaymentMethod } from "@/lib/accounts";
import { makeSyncEvent } from "@/lib/syncEvents";
import { newUid } from "@/lib/uid";

const expenseCategories: Array<DayBookEntry["category"]> = ["Transport", "Wage", "Other", "Purchase"];

export default function ExpensesPage() {
  const entries = useLiveQuery(() => db.dayBook.where("type").equals("Expense").toArray()) || [];
  const financialAccounts = useLiveQuery(() => db.financialAccounts.toArray()) || [];

  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10), // YYYY-MM-DD
    category: "Other" as DayBookEntry["category"],
    amount: "" as string,
    description: "",
    method: "Cash" as PaymentMethod,
    accountId: 0,
  });

  const sorted = useMemo(
    () => entries.slice().sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()),
    [entries]
  );

  const totalThisMonth = useMemo(() => {
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return entries
      .filter((e) => e.time.startsWith(key))
      .reduce((acc, e) => acc + e.amount, 0);
  }, [entries]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) return alert("Amount must be greater than 0.");
    if (!form.description.trim()) return alert("Description is required.");

    const time = new Date(`${form.date}T12:00:00`).toISOString();
    const accountId = Number(form.accountId) || (await getOrCreateDefaultCashAccountId());

    try {
      setIsSaving(true);
      const entry = {
        uid: newUid(),
        time,
        type: "Expense" as const,
        category: form.category,
        amount,
        description: form.description.trim(),
        method: form.method,
        accountId,
      };

      await db.transaction("rw", db.tables, async () => {
        const id = await db.dayBook.add(entry);
        await db.outbox.add(
          makeSyncEvent({
            entityType: "daybook.expense",
            entityId: entry.uid!,
            op: "create",
            payload: { id, entry },
          })
        );
      });
      setShowForm(false);
      setForm({
        date: new Date().toISOString().slice(0, 10),
        category: "Other",
        amount: "",
        description: "",
        method: "Cash",
        accountId: 0,
      });
    } catch (err) {
      console.error(err);
      alert("Failed to save expense. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Expenses</h1>
          <div className="mt-1 text-sm text-slate-500">This month: Rs. {totalThisMonth.toLocaleString()}</div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>{showForm ? "Cancel" : "Add Expense"}</span>
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Date</label>
              <input
                required
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as DayBookEntry["category"] })}
                className="w-full px-3 py-2 border rounded-md bg-white"
              >
                {expenseCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Payment Mode</label>
              <select
                value={form.method}
                onChange={(e) => setForm({ ...form, method: e.target.value as PaymentMethod })}
                className="w-full px-3 py-2 border rounded-md bg-white"
              >
                <option value="Cash">Cash</option>
                <option value="QR">QR</option>
                <option value="BankTransfer">Bank Transfer</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Amount</label>
              <input
                required
                type="number"
                min={1}
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <label className="block text-sm font-medium mb-1">Account</label>
              <select
                value={form.accountId}
                onChange={(e) => setForm({ ...form, accountId: Number(e.target.value) })}
                className="w-full px-3 py-2 border rounded-md bg-white"
              >
                <option value={0}>Select account…</option>
                {sortAccountsForPicker(financialAccounts).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.type} — {a.name}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-xs text-slate-500">If you don’t select, it will use Cash in Hand.</div>
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <label className="block text-sm font-medium mb-1">Description</label>
              <input
                required
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
                placeholder="e.g. Transport cost, worker wage, diesel, etc."
              />
            </div>
          </div>

          <div className="flex justify-end border-t pt-4">
            <button
              type="submit"
              disabled={isSaving}
              className={`px-6 py-2 bg-secondary text-white rounded-md hover:bg-secondary/90 ${isSaving ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              {isSaving ? "Saving..." : "Save Expense"}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-900">Expense History</h2>
          <Receipt className="w-5 h-5 text-slate-400" />
        </div>

        {sorted.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No expenses recorded.</div>
        ) : (
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Category</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Description</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Amount</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {sorted.slice(0, 50).map((e) => (
                <tr key={e.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                    {new Date(e.time).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">{e.category}</td>
                  <td className="px-6 py-4 text-sm text-slate-900">{e.description}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-right text-slate-900">
                    Rs. {e.amount.toLocaleString()}
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

