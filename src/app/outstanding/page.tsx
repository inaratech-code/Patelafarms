"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { db, type LedgerAccount } from "@/lib/db";
import { ArrowRight, HandCoins } from "lucide-react";

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

type Row = { account: LedgerAccount; balance: number };

export default function OutstandingPage() {
  const accounts = useLiveQuery(() => db.ledgerAccounts.toArray()) || [];
  const entries = useLiveQuery(() => db.ledgerEntries.toArray()) || [];

  const { receivable, payable, totals } = useMemo(() => {
    const sums = computeBalances(entries);
    const all: Row[] = accounts
      .filter((a) => typeof a.id === "number")
      .map((a) => {
        const s = sums.get(a.id!) ?? { debit: 0, credit: 0 };
        const balance = s.debit - s.credit; // >0 receivable, <0 payable
        return { account: a, balance };
      })
      .filter((r) => r.balance !== 0);

    const receivable = all
      .filter((r) => r.balance > 0)
      .sort((a, b) => b.balance - a.balance);
    const payable = all
      .filter((r) => r.balance < 0)
      .sort((a, b) => a.balance - b.balance);

    const totals = {
      receivable: receivable.reduce((acc, r) => acc + r.balance, 0),
      payable: payable.reduce((acc, r) => acc + Math.abs(r.balance), 0),
    };

    return { receivable, payable, totals };
  }, [accounts, entries]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#0f172a]">Outstanding</h1>
          <p className="mt-1 text-sm text-[#64748b]">Quickly collect receivables and pay payables.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-white border border-[#e2e8f0] shadow-sm p-6">
          <div className="text-sm font-medium text-[#64748b]">Total Receivable</div>
          <div className="mt-2 text-2xl font-semibold text-[#80a932]">Rs. {totals.receivable.toLocaleString()}</div>
        </div>
        <div className="rounded-2xl bg-white border border-[#e2e8f0] shadow-sm p-6">
          <div className="text-sm font-medium text-[#64748b]">Total Payable</div>
          <div className="mt-2 text-2xl font-semibold text-rose-700">Rs. {totals.payable.toLocaleString()}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-white border border-[#e2e8f0] shadow-sm overflow-hidden">
          <div className="p-6 border-b border-[#e2e8f0] flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#0f172a]">Receivables</h2>
            <HandCoins className="w-5 h-5 text-[#80a932]" />
          </div>

          {receivable.length === 0 ? (
            <div className="p-8 text-center text-[#64748b]">No receivables.</div>
          ) : (
            <div className="divide-y divide-[#e2e8f0]">
              {receivable.slice(0, 30).map((r) => (
                <div key={r.account.id} className="p-6 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[#0f172a] truncate">{r.account.name}</div>
                    <div className="text-sm text-[#64748b]">{r.account.type}</div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-sm font-semibold text-[#80a932]">Rs. {r.balance.toLocaleString()}</div>
                    <Link
                      href={`/payments?direction=Receive&partyType=${r.account.type}&accountId=${r.account.id}`}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] text-sm font-semibold text-[#0871b3]"
                    >
                      Receive <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white border border-[#e2e8f0] shadow-sm overflow-hidden">
          <div className="p-6 border-b border-[#e2e8f0] flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#0f172a]">Payables</h2>
            <HandCoins className="w-5 h-5 text-rose-700" />
          </div>

          {payable.length === 0 ? (
            <div className="p-8 text-center text-[#64748b]">No payables.</div>
          ) : (
            <div className="divide-y divide-[#e2e8f0]">
              {payable.slice(0, 30).map((r) => (
                <div key={r.account.id} className="p-6 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[#0f172a] truncate">{r.account.name}</div>
                    <div className="text-sm text-[#64748b]">{r.account.type}</div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-sm font-semibold text-rose-700">Rs. {Math.abs(r.balance).toLocaleString()}</div>
                    <Link
                      href={`/payments?direction=Pay&partyType=${r.account.type}&accountId=${r.account.id}`}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] text-sm font-semibold text-[#0871b3]"
                    >
                      Pay <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

