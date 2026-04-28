"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { db } from "@/lib/db";
import { Plus, Users, ArrowRight } from "lucide-react";

export default function CustomersPage() {
  const accounts = useLiveQuery(() => db.ledgerAccounts.where("type").equals("Customer").toArray()) || [];
  const entries = useLiveQuery(() => db.ledgerEntries.toArray()) || [];

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");

  const balances = useMemo(() => {
    const sums = new Map<number, { debit: number; credit: number }>();
    for (const e of entries) {
      const cur = sums.get(e.accountId) ?? { debit: 0, credit: 0 };
      cur.debit += e.debit;
      cur.credit += e.credit;
      sums.set(e.accountId, cur);
    }

    return accounts
      .map((a) => {
        const s = sums.get(a.id!) ?? { debit: 0, credit: 0 };
        const balance = s.debit - s.credit; // money you will receive if positive
        return { account: a, balance };
      })
      .sort((a, b) => b.balance - a.balance);
  }, [accounts, entries]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    await db.ledgerAccounts.add({ name: trimmed, type: "Customer" });
    setName("");
    setShowForm(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Customers</h1>
          <p className="mt-1 text-sm text-slate-500">Each customer has a ledger with running balance.</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>{showForm ? "Cancel" : "Add Customer"}</span>
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">Customer name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
              placeholder="e.g. Ram Bahadur"
            />
          </div>
          <div className="flex items-end">
            <button type="submit" className="px-6 py-2 bg-secondary text-white rounded-md hover:bg-secondary/90">
              Save
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-900">Customer Ledgers</h2>
          <Users className="w-5 h-5 text-slate-400" />
        </div>

        {balances.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No customers yet.</div>
        ) : (
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Customer</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Receivable</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Ledger</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {balances.map((r) => (
                <tr key={r.account.id}>
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">{r.account.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-alert-green">
                    Rs. {Math.max(0, r.balance).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <Link
                      href={`/ledger/${r.account.id}`}
                      className="inline-flex items-center gap-2 text-primary font-medium text-sm"
                    >
                      Open <ArrowRight className="w-4 h-4" />
                    </Link>
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

