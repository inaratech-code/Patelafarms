"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { db, type FinancialAccount } from "@/lib/db";
import { computeAccountBalance, sortAccountsForPicker } from "@/lib/accounts";
import { Landmark, Plus, QrCode, Wallet } from "lucide-react";

const typeIcon: Record<FinancialAccount["type"], React.ComponentType<{ className?: string }>> = {
  Cash: Wallet,
  Bank: Landmark,
  QR: QrCode,
};

export default function AccountsPage() {
  const financialAccounts = useLiveQuery(() => db.financialAccounts.toArray()) || [];
  const dayBookEntries = useLiveQuery(() => db.dayBook.toArray()) || [];

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{ name: string; type: FinancialAccount["type"] }>({ name: "", type: "Cash" });

  const rows = useMemo(() => {
    const list = sortAccountsForPicker(financialAccounts);
    return list.map((a) => ({
      account: a,
      balance: computeAccountBalance({ accountId: a.id!, dayBookEntries }),
    }));
  }, [dayBookEntries, financialAccounts]);

  const totals = useMemo(() => {
    const cash = rows.filter((r) => r.account.type === "Cash").reduce((acc, r) => acc + r.balance, 0);
    const bank = rows.filter((r) => r.account.type === "Bank").reduce((acc, r) => acc + r.balance, 0);
    const qr = rows.filter((r) => r.account.type === "QR").reduce((acc, r) => acc + r.balance, 0);
    return { cash, bank, qr, total: cash + bank + qr };
  }, [rows]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    await db.financialAccounts.add({ name, type: form.type });
    setForm({ name: "", type: "Cash" });
    setShowForm(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#0f172a]">Accounts</h1>
          <p className="mt-1 text-sm text-[#64748b]">Cash / Bank / QR balances come from Day Book entries posted to each account.</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-[#0871b3] text-white rounded-lg hover:bg-[#0871b3]/90 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>{showForm ? "Cancel" : "Add Account"}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white border border-[#e2e8f0] shadow-sm p-6">
          <div className="text-sm text-[#64748b] font-medium">Cash</div>
          <div className="mt-2 text-2xl font-semibold text-[#0f172a]">Rs. {totals.cash.toLocaleString()}</div>
        </div>
        <div className="rounded-2xl bg-white border border-[#e2e8f0] shadow-sm p-6">
          <div className="text-sm text-[#64748b] font-medium">Bank</div>
          <div className="mt-2 text-2xl font-semibold text-[#0f172a]">Rs. {totals.bank.toLocaleString()}</div>
        </div>
        <div className="rounded-2xl bg-white border border-[#e2e8f0] shadow-sm p-6">
          <div className="text-sm text-[#64748b] font-medium">QR</div>
          <div className="mt-2 text-2xl font-semibold text-[#0f172a]">Rs. {totals.qr.toLocaleString()}</div>
        </div>
        <div className="rounded-2xl bg-white border border-[#e2e8f0] shadow-sm p-6">
          <div className="text-sm text-[#64748b] font-medium">Total</div>
          <div className="mt-2 text-2xl font-semibold text-[#0f172a]">Rs. {totals.total.toLocaleString()}</div>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl shadow-sm border border-[#e2e8f0] grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-1">Account name</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border rounded-md"
              placeholder="e.g. Nabil Bank, eSewa QR, Cash Drawer"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as FinancialAccount["type"] })} className="w-full px-3 py-2 border rounded-md bg-white">
              <option value="Cash">Cash</option>
              <option value="Bank">Bank</option>
              <option value="QR">QR</option>
            </select>
          </div>
          <div className="sm:col-span-3 flex justify-end border-t pt-4">
            <button type="submit" className="px-6 py-2 bg-[#80a932] text-white rounded-md hover:bg-[#80a932]/90">
              Save
            </button>
          </div>
        </form>
      )}

      <div className="rounded-2xl bg-white border border-[#e2e8f0] shadow-sm overflow-hidden">
        <div className="p-6 border-b border-[#e2e8f0]">
          <h2 className="text-lg font-semibold text-[#0f172a]">Account Balances</h2>
        </div>
        {rows.length === 0 ? (
          <div className="p-8 text-center text-[#64748b]">No accounts yet. Add Cash/Bank/QR accounts.</div>
        ) : (
          <table className="min-w-full divide-y divide-[#e2e8f0]">
            <thead className="bg-[#f8fafc]">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-[#64748b] uppercase">Type</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-[#64748b] uppercase">Account</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-[#64748b] uppercase">Balance</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-[#e2e8f0]">
              {rows.map((r) => {
                const Icon = typeIcon[r.account.type];
                return (
                  <tr key={r.account.id}>
                    <td className="px-6 py-4 text-sm text-[#64748b]">
                      <div className="inline-flex items-center gap-2">
                        <Icon className="w-4 h-4" />
                        {r.account.type}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-[#0f172a]">{r.account.name}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-right text-[#0f172a]">Rs. {r.balance.toLocaleString()}</td>
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

