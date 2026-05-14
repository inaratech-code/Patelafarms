"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo } from "react";
import { AlertCircle, Wallet, ArrowRight, Syringe } from "lucide-react";
import { db } from "@/lib/db";
import { doseReminderEffectiveStatus } from "@/lib/notifications";
import { vaccineExpirySoon, refreshDoseReminderStatuses } from "@/lib/farmHealth";
import { localDayKey } from "@/lib/erp/metrics";

export default function AlertsPage() {
  const inventory = useLiveQuery(() => db.inventory.toArray()) || [];

  useEffect(() => {
    void refreshDoseReminderStatuses();
  }, []);
  const accounts = useLiveQuery(() => db.ledgerAccounts.toArray()) || [];
  const entries = useLiveQuery(() => db.ledgerEntries.toArray()) || [];

  const lowStock = useMemo(
    () =>
      inventory
        .filter((i) => {
          const th = i.reorderLevel ?? i.minStockThreshold ?? 0;
          return th > 0 && i.quantity <= th;
        })
        .sort((a, b) => a.quantity - b.quantity),
    [inventory]
  );

  const doseReminders = useLiveQuery(() => db.doseReminders.toArray()) || [];
  const vaccines = useLiveQuery(() => db.vaccines.toArray()) || [];

  const todayKey = useMemo(() => localDayKey(new Date()), []);

  const doseAlerts = useMemo(() => {
    const urgent = doseReminders.filter((r) => {
      const s = doseReminderEffectiveStatus(r);
      return s === "overdue" || s === "due_today";
    });
    const soon = doseReminders.filter((r) => {
      const s = doseReminderEffectiveStatus(r);
      if (s !== "upcoming") return false;
      const rd = r.reminderDate;
      const d = new Date(`${todayKey}T12:00:00`);
      d.setDate(d.getDate() + 3);
      const limit = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return rd > todayKey && rd <= limit;
    });
    const exp = vaccines.filter((v) => vaccineExpirySoon(v, todayKey, 14));
    return { urgent, soon, exp };
  }, [doseReminders, vaccines, todayKey]);

  const pendingPayments = useMemo(() => {
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
              {lowStock.slice(0, 8).map((i) => {
                const th = i.reorderLevel ?? i.minStockThreshold ?? 0;
                return (
                  <div key={i.id} className="p-6 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-slate-900">{i.name}</div>
                      <div className="text-sm text-slate-500">
                        {i.quantity} {i.unit} (reorder at {th})
                      </div>
                    </div>
                    <Link href="/inventory" className="text-primary text-sm font-medium inline-flex items-center gap-1">
                      Open <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                );
              })}
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

        <div className="rounded-xl bg-white shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-500">Farm health</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {doseAlerts.urgent.length} urgent dose(s) · {doseAlerts.exp.length} expiry
              </div>
            </div>
            <Syringe className="w-6 h-6 text-sky-600" />
          </div>
          <div className="p-6 space-y-3 text-sm">
            {doseAlerts.urgent.length === 0 && doseAlerts.soon.length === 0 && doseAlerts.exp.length === 0 ? (
              <div className="text-slate-500">No vaccine alerts.</div>
            ) : (
              <>
                {doseAlerts.urgent.map((r) => (
                  <div key={r.id} className="flex justify-between gap-2 rounded-lg border border-rose-100 bg-rose-50/60 px-3 py-2">
                    <span className="font-medium text-rose-900">{r.title ?? "Dose"}</span>
                    <span className="text-rose-800 shrink-0">{r.reminderDate}</span>
                  </div>
                ))}
                {doseAlerts.soon.map((r) => (
                  <div key={r.id} className="flex justify-between gap-2 rounded-lg border border-orange-100 bg-orange-50/60 px-3 py-2">
                    <span className="font-medium text-orange-900">{r.title ?? "Dose"}</span>
                    <span className="text-orange-800 shrink-0">{r.reminderDate}</span>
                  </div>
                ))}
                {doseAlerts.exp.map((v) => (
                  <div key={v.id} className="flex justify-between gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                    <span className="font-medium text-amber-900">{v.name}</span>
                    <span className="text-amber-800 shrink-0">exp {v.expiryDate}</span>
                  </div>
                ))}
              </>
            )}
            <Link href="/farm-health/dose-schedule" className="inline-flex items-center gap-1 text-primary font-semibold">
              Open dose schedule <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
