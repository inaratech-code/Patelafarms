"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { db, type FinancialAccount, type LedgerAccount, type Payment } from "@/lib/db";
import { postPayment } from "@/lib/payments";
import { computeAccountBalance, sortAccountsForPicker, type PaymentMethod } from "@/lib/accounts";
import { ArrowRight, HandCoins, Plus } from "lucide-react";

type Direction = Payment["direction"];
type PartyType = LedgerAccount["type"];

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function computeBalance(entries: Array<{ accountId: number; debit: number; credit: number }>, accountId: number) {
  let debit = 0;
  let credit = 0;
  for (const e of entries) {
    if (e.accountId !== accountId) continue;
    debit += e.debit;
    credit += e.credit;
  }
  return debit - credit;
}

export function PaymentsClient() {
  const searchParams = useSearchParams();

  const accounts = useLiveQuery(() => db.ledgerAccounts.toArray()) || [];
  const ledgerEntries = useLiveQuery(() => db.ledgerEntries.toArray()) || [];
  const payments = useLiveQuery(() => db.payments.toArray()) || [];
  const financialAccounts = useLiveQuery(() => db.financialAccounts.toArray()) || [];
  const dayBookEntries = useLiveQuery(() => db.dayBook.toArray()) || [];

  const [direction, setDirection] = useState<Direction>("Receive");
  const [partyType, setPartyType] = useState<PartyType>("Customer");
  const [form, setForm] = useState({
    partyAccountId: 0,
    amount: "" as string,
    date: isoToday(),
    note: "",
    method: "Cash" as PaymentMethod,
    accountId: 0,
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const d = searchParams.get("direction");
    const pt = searchParams.get("partyType");
    const id = Number(searchParams.get("accountId") ?? 0);
    const method = searchParams.get("method");
    const finId = Number(searchParams.get("financialAccountId") ?? 0);

    if (d === "Receive" || d === "Pay") setDirection(d);
    if (pt === "Customer" || pt === "Supplier" || pt === "Worker") setPartyType(pt);
    if (Number.isFinite(id) && id > 0) setForm((prev) => ({ ...prev, partyAccountId: id }));
    if (method === "Cash" || method === "QR" || method === "BankTransfer") setForm((prev) => ({ ...prev, method }));
    if (Number.isFinite(finId) && finId > 0) setForm((prev) => ({ ...prev, accountId: finId }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Direction defaults: Receive -> Customer, Pay -> Supplier
  useEffect(() => {
    setPartyType((prev) => {
      if (direction === "Receive") return prev === "Supplier" ? "Customer" : prev;
      return prev === "Customer" ? "Supplier" : prev;
    });
  }, [direction]);

  const parties = useMemo(() => accounts.filter((a) => a.type === partyType), [accounts, partyType]);
  const selectedParty = useMemo(
    () => parties.find((p) => p.id === Number(form.partyAccountId)),
    [form.partyAccountId, parties]
  );

  const financialPicker = useMemo(() => sortAccountsForPicker(financialAccounts), [financialAccounts]);
  const selectedFinancial = useMemo(
    () => financialPicker.find((a) => a.id === Number(form.accountId)),
    [financialPicker, form.accountId]
  );

  const selectedFinancialBalance = useMemo(() => {
    if (!selectedFinancial?.id) return 0;
    return computeAccountBalance({ accountId: selectedFinancial.id, dayBookEntries });
  }, [dayBookEntries, selectedFinancial?.id]);

  const outstanding = useMemo(() => {
    if (!selectedParty?.id) return 0;
    return computeBalance(ledgerEntries, selectedParty.id);
  }, [ledgerEntries, selectedParty?.id]);

  const outstandingLabel = useMemo(() => {
    if (!selectedParty?.id) return "-";
    if (outstanding === 0) return "Settled";
    if (outstanding > 0) return `Receivable: Rs. ${outstanding.toLocaleString()}`;
    return `Payable: Rs. ${Math.abs(outstanding).toLocaleString()}`;
  }, [outstanding, selectedParty?.id]);

  const paymentHistory = useMemo(() => {
    const byId = new Map<number, LedgerAccount>();
    for (const a of accounts) if (typeof a.id === "number") byId.set(a.id, a);

    return payments
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .map((p) => ({
        payment: p,
        party: byId.get(p.partyAccountId),
      }));
  }, [accounts, payments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) return alert("Amount must be greater than 0.");
    if (!selectedParty?.id) return alert("Select a party.");

    // Guardrail: if paying more than payable / receiving more than receivable, confirm.
    const bal = outstanding;
    const exceed =
      (direction === "Receive" && bal > 0 && amount > bal) ||
      (direction === "Pay" && bal < 0 && amount > Math.abs(bal));

    if (exceed && !confirm("This amount is higher than the current outstanding. Continue?")) return;

    try {
      setIsSaving(true);
      await postPayment({
        partyAccountId: selectedParty.id,
        partyType,
        direction,
        amount,
        dateYYYYMMDD: form.date,
        note: form.note,
        method: form.method,
        accountId: Number(form.accountId) || undefined,
      });
      setForm({ partyAccountId: 0, amount: "", date: isoToday(), note: "", method: "Cash", accountId: 0 });
    } catch (err) {
      console.error(err);
      alert("Failed to post payment. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#0f172a]">Payments</h1>
          <p className="mt-1 text-sm text-[#64748b]">
            Receive from customers or pay suppliers. Cash updates Day Book automatically.
          </p>
        </div>
      </div>

      <div className="rounded-2xl bg-white border border-[#e2e8f0] shadow-sm overflow-hidden">
        <div className="p-6 border-b border-[#e2e8f0] flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="inline-flex rounded-xl bg-[#f8fafc] border border-[#e2e8f0] p-1">
            {(["Receive", "Pay"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDirection(d)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  direction === d ? "bg-white shadow-sm text-[#0f172a]" : "text-[#64748b] hover:text-[#0f172a]"
                }`}
              >
                {d}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-sm text-[#64748b]">
            <HandCoins className="w-4 h-4" />
            <span>{selectedParty ? outstandingLabel : "Select a party to see outstanding"}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Party Type</label>
              <select
                value={partyType}
                onChange={(e) => setPartyType(e.target.value as PartyType)}
                className="w-full px-3 py-2 border rounded-md bg-white"
              >
                <option value="Customer">Customer</option>
                <option value="Supplier">Supplier</option>
                <option value="Worker">Worker</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Party</label>
              <select
                required
                value={form.partyAccountId}
                onChange={(e) => setForm({ ...form, partyAccountId: Number(e.target.value) })}
                className="w-full px-3 py-2 border rounded-md bg-white"
              >
                <option value={0}>Select...</option>
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
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

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium mb-1">Account</label>
              <select
                value={form.accountId}
                onChange={(e) => setForm({ ...form, accountId: Number(e.target.value) })}
                className="w-full px-3 py-2 border rounded-md bg-white"
              >
                <option value={0}>Select account…</option>
                {financialPicker.map((a: FinancialAccount) => (
                  <option key={a.id} value={a.id}>
                    {a.type} — {a.name}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-xs text-[#64748b]">
                {selectedFinancial
                  ? `Balance: Rs. ${selectedFinancialBalance.toLocaleString()}`
                  : "Add accounts in Accounts page (Cash/Bank/QR)."}
              </div>
            </div>

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

            <div className="sm:col-span-2 lg:col-span-4">
              <label className="block text-sm font-medium mb-1">Note (optional)</label>
              <input
                type="text"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
                placeholder="e.g. part payment, advance, settlement"
              />
            </div>
          </div>

          <div className="flex justify-end border-t pt-4">
            <button
              type="submit"
              disabled={isSaving}
              className={`px-6 py-2 bg-[#0871b3] text-white rounded-md hover:bg-[#0871b3]/90 ${
                isSaving ? "opacity-60 cursor-not-allowed" : ""
              }`}
            >
              {isSaving ? "Posting..." : direction === "Receive" ? "Receive Cash" : "Pay Cash"}
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-2xl bg-white border border-[#e2e8f0] shadow-sm overflow-hidden">
        <div className="p-6 border-b border-[#e2e8f0] flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#0f172a]">Payment History</h2>
          <Link href="/ledger" className="text-sm font-semibold text-[#0871b3] inline-flex items-center gap-2">
            Ledger <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {paymentHistory.length === 0 ? (
          <div className="p-8 text-center text-[#64748b]">No payments posted yet.</div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="min-w-[900px] w-full divide-y divide-[#e2e8f0]">
              <thead className="bg-[#f8fafc]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[#64748b] uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[#64748b] uppercase">Party</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[#64748b] uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[#64748b] uppercase">Direction</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-[#64748b] uppercase">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[#64748b] uppercase">Note</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-[#64748b] uppercase">Open</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-[#e2e8f0]">
                {paymentHistory.slice(0, 50).map((r) => (
                  <tr key={r.payment.id}>
                    <td className="px-6 py-4 text-sm text-[#64748b] whitespace-nowrap">
                      {new Date(r.payment.date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-[#0f172a]">{r.party?.name ?? "Unknown"}</td>
                    <td className="px-6 py-4 text-sm text-[#64748b]">{r.payment.partyType}</td>
                    <td className="px-6 py-4 text-sm text-[#64748b]">{r.payment.direction}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-right text-[#0f172a]">
                      Rs. {r.payment.amount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-[#64748b]">{r.payment.note || "-"}</td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={r.party?.id ? `/ledger/${r.party.id}` : "/ledger"}
                        className="inline-flex items-center gap-2 text-sm font-semibold text-[#0871b3]"
                      >
                        Open <ArrowRight className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="text-sm text-[#64748b] flex items-center gap-2">
        <Plus className="w-4 h-4" />
        Tip: Use Outstanding page to quickly Receive/Pay from dues list.
      </div>
    </div>
  );
}

