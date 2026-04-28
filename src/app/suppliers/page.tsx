"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { db } from "@/lib/db";
import { Plus, Truck, ArrowRight, HandCoins } from "lucide-react";

function computeBalances(entries: Array<{ accountId: number; debit: number; credit: number }>) {
  const sums = new Map<number, { debit: number; credit: number }>();
  for (const e of entries) {
    const cur = sums.get(e.accountId) ?? { debit: 0, credit: 0 };
    cur.debit += e.debit;
    cur.credit += e.credit;
    sums.set(e.accountId, cur);
  }
  return sums;
}

export default function SuppliersPage() {
  const accounts = useLiveQuery(() => db.ledgerAccounts.where("type").equals("Supplier").toArray()) || [];
  const entries = useLiveQuery(() => db.ledgerEntries.toArray()) || [];

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");

  const rows = useMemo(() => {
    const sums = computeBalances(entries);
    return accounts
      .map((a) => {
        const s = sums.get(a.id!) ?? { debit: 0, credit: 0 };
        const balance = s.debit - s.credit; // <0 payable, >0 receivable
        return { account: a, balance };
      })
      .sort((a, b) => a.balance - b.balance);
  }, [accounts, entries]);

  const totalPayable = rows.reduce((acc, r) => (r.balance < 0 ? acc + Math.abs(r.balance) : acc), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    await db.ledgerAccounts.add({ name: trimmed, type: "Supplier" });
    setName("");
    setShowForm(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#0f172a]">Suppliers</h1>
          <p className="mt-1 text-sm text-[#64748b]">
            Total payable: <span className="font-semibold text-rose-700">Rs. {totalPayable.toLocaleString()}</span>
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-[#0871b3] text-white rounded-lg hover:bg-[#0871b3]/90 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>{showForm ? "Cancel" : "Add Supplier"}</span>
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl shadow-sm border border-[#e2e8f0] flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">Supplier name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
              placeholder="e.g. Agro Supplier Pvt. Ltd."
            />
          </div>
          <div className="flex items-end">
            <button type="submit" className="px-6 py-2 bg-[#80a932] text-white rounded-md hover:bg-[#80a932]/90">
              Save
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-[#e2e8f0] overflow-hidden">
        <div className="p-6 border-b border-[#e2e8f0] flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#0f172a]">Supplier Ledgers</h2>
          <Truck className="w-5 h-5 text-[#64748b]" />
        </div>

        {rows.length === 0 ? (
          <div className="p-8 text-center text-[#64748b]">No suppliers yet.</div>
        ) : (
          <table className="min-w-full divide-y divide-[#e2e8f0]">
            <thead className="bg-[#f8fafc]">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-[#64748b] uppercase">Supplier</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-[#64748b] uppercase">Payable</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-[#64748b] uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-[#e2e8f0]">
              {rows.map((r) => {
                const payable = r.balance < 0 ? Math.abs(r.balance) : 0;
                return (
                  <tr key={r.account.id}>
                    <td className="px-6 py-4 text-sm font-semibold text-[#0f172a]">{r.account.name}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-right text-rose-700">
                      Rs. {payable.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="inline-flex items-center gap-3">
                        <Link
                          href={`/payments?direction=Pay&partyType=Supplier&accountId=${r.account.id}`}
                          className="inline-flex items-center gap-2 text-sm font-semibold text-[#0871b3]"
                        >
                          <HandCoins className="w-4 h-4" />
                          Pay
                        </Link>
                        <Link
                          href={`/ledger/${r.account.id}`}
                          className="inline-flex items-center gap-2 text-sm font-semibold text-[#0871b3]"
                        >
                          Open <ArrowRight className="w-4 h-4" />
                        </Link>
                      </div>
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

