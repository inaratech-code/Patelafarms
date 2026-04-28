"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { AlertCircle, CalendarClock, Wallet, ArrowRight } from "lucide-react";
import { db } from "@/lib/db";

function daysBetween(a: Date, b: Date) {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export default function AlertsPage() {
  const inventory = useLiveQuery(() => db.inventory.toArray()) || [];
  const accounts = useLiveQuery(() => db.ledgerAccounts.toArray()) || [];
  const entries = useLiveQuery(() => db.ledgerEntries.toArray()) || [];

  const lowStock = useMemo(
    () =>
      inventory
        .filter((i) => i.quantity <= i.minStockThreshold)
        .sort((a, b) => a.quantity - b.quantity),
    [inventory]
  );

  const expiryWindowDays = 7;
  const expiry = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return inventory
      .filter((i) => !!i.expiryDate)
      .map((i) => {
        const exp = new Date(`${i.expiryDate}T00:00:00`);
        const d = daysBetween(today, exp);
        return { item: i, exp, daysLeft: d };
      })
      .filter((x) => x.daysLeft <= expiryWindowDays)
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [inventory]);

  const pendingPayments = useMemo(() => {
    // Debit = money you will receive (Customer dues)
    // Credit = money you owe (Supplier dues)
    // balance = sum(debit - credit)
    const byAccount = new Map<number, { debit: number; credit: number }>();
    for (const e of entries) {
      const cur = byAccount.get(e.accountId) ?? { debit: 0, credit: 0 };
      cur.debit += e.debit;
      cur.credit += e.credit;
      byAccount.set(e.accountId, cur);
    }

    const rows = accounts
      .map((a) => {
        const sums = byAccount.get(a.id!) ?? { debit: 0, credit: 0 };
        const balance = sums.debit - sums.credit;
        return { account: a, balance };
      })
      .filter((r) => r.balance !== 0)
      .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

    return rows;
  }, [accounts, entries]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-semibold text-slate-900">Alerts & Notifications</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-xl bg-white shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-500">Low stock alert</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{lowStock.length} item(s)</div>
            </div>
            <AlertCircle className="w-6 h-6 text-alert-yellow" />
          </div>
          {lowStock.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">No low stock items.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {lowStock.slice(0, 8).map((i) => (
                <div key={i.id} className="p-6 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-slate-900">{i.name}</div>
                    <div className="text-sm text-slate-500">
                      {i.quantity} {i.unit} (alert at {i.minStockThreshold})
                    </div>
                  </div>
                  <Link href="/inventory" className="text-primary text-sm font-medium inline-flex items-center gap-1">
                    Open <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl bg-white shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-500">Expiry alert (≤ {expiryWindowDays} days)</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{expiry.length} item(s)</div>
            </div>
            <CalendarClock className="w-6 h-6 text-alert-red" />
          </div>
          {expiry.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">No expiring items in the next {expiryWindowDays} days.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {expiry.slice(0, 8).map((x) => (
                <div key={x.item.id} className="p-6 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-slate-900">{x.item.name}</div>
                    <div className="text-sm text-slate-500">
                      Exp: {x.item.expiryDate} ·{" "}
                      <span className={x.daysLeft < 0 ? "text-alert-red font-semibold" : "text-slate-600"}>
                        {x.daysLeft < 0 ? `${Math.abs(x.daysLeft)} day(s) expired` : `${x.daysLeft} day(s) left`}
                      </span>
                    </div>
                  </div>
                  <Link href="/inventory" className="text-primary text-sm font-medium inline-flex items-center gap-1">
                    Open <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl bg-white shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-500">Pending payments</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{pendingPayments.length} account(s)</div>
            </div>
            <Wallet className="w-6 h-6 text-primary" />
          </div>
          {pendingPayments.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">No pending balances.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {pendingPayments.slice(0, 8).map((r) => {
                const isReceivable = r.balance > 0;
                return (
                  <div key={r.account.id} className="p-6 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-slate-900">{r.account.name}</div>
                      <div className="text-sm text-slate-500">
                        {r.account.type} ·{" "}
                        <span className={isReceivable ? "text-alert-green font-semibold" : "text-alert-red font-semibold"}>
                          {isReceivable ? "Receivable" : "Payable"}
                        </span>
                      </div>
                    </div>
                    <Link
                      href={`/ledger/${r.account.id}`}
                      className="text-primary text-sm font-medium inline-flex items-center gap-2"
                    >
                      Rs. {Math.abs(r.balance).toLocaleString()} <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

