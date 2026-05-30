"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { ArrowLeft, ChevronDown, Download, FileSpreadsheet, FileText, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { exportLedgerExcel, exportLedgerPdf } from "@/lib/ledgerExport";
import {
  backfillSupplierLedgerFromPurchases,
  postLedgerEntryWithSync,
} from "@/lib/ledger";
import {
  MobileCardDl,
  MobileCardHeader,
  MobileDataCard,
  PageRoot,
  ResponsiveTableShell,
} from "@/components/ui/responsive-table";
import { DualDateDisplay } from "@/components/ui/DualDateDisplay";
import { DualDateField } from "@/components/ui/DualDateField";
import { formatDualDate, todayAdYmd } from "@/lib/nepaliDate";

/** Line-item debit/credit: always show the number (including 0) so both columns stay visible. */
function formatLedgerSide(n: number) {
  return n.toLocaleString();
}

function asDrCr(amount: number) {
  if (amount === 0) return "-";
  return amount >= 0 ? "Dr" : "Cr";
}

function isoToday() {
  return todayAdYmd();
}

type EntryKind = "debit" | "credit";

function defaultEntryKind(accountType?: string): EntryKind {
  if (accountType === "Supplier") return "credit";
  return "debit";
}

function entryKindLabel(accountType: string | undefined, kind: EntryKind) {
  if (accountType === "Supplier") {
    return kind === "credit" ? "Payable (purchase / amount owed)" : "Payment (reduces payable)";
  }
  if (accountType === "Worker") {
    return kind === "credit" ? "Paid to worker" : "Amount owed to worker";
  }
  return kind === "debit" ? "Receivable (amount owed to you)" : "Received (reduces receivable)";
}

export function LedgerDetailClient(props: { accountId: number }) {
  const accountId = props.accountId;
  const [showForm, setShowForm] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [entryForm, setEntryForm] = useState({
    date: isoToday(),
    description: "",
    kind: "credit" as EntryKind,
    amount: "",
  });

  const account = useLiveQuery(
    () => (Number.isFinite(accountId) ? db.ledgerAccounts.get(accountId) : undefined),
    [accountId]
  );

  useEffect(() => {
    if (!account?.type) return;
    queueMicrotask(() => {
      setEntryForm((prev) => ({ ...prev, kind: defaultEntryKind(account.type) }));
    });
  }, [account?.type]);

  useEffect(() => {
    if (!exportOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [exportOpen]);

  const entries =
    useLiveQuery(
      () => (Number.isFinite(accountId) ? db.ledgerEntries.where("accountId").equals(accountId).toArray() : []),
      [accountId]
    ) || [];

  const purchases = useLiveQuery(() => db.purchases.toArray()) || [];

  const duePurchaseDaysForAccount = useMemo(() => {
    if (!account?.name || account.type !== "Supplier") return 0;
    const name = account.name.trim();
    const days = new Set<string>();
    for (const p of purchases) {
      if (p.supplierName?.trim() !== name) continue;
      if (p.paymentStatus !== "due" && (p.dueAmount ?? 0) <= 0) continue;
      days.add(p.date.slice(0, 10));
    }
    return days.size;
  }, [account?.name, account?.type, purchases]);

  const rows = useMemo(() => {
    const sorted = entries.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return sorted.reduce<Array<(typeof sorted)[number] & { opening: number; closing: number }>>((acc, e) => {
      const opening = acc.length ? acc[acc.length - 1].closing : 0;
      const closing = opening + (e.debit - e.credit);
      acc.push({ ...e, opening, closing });
      return acc;
    }, []);
  }, [entries]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.debit += r.debit;
        acc.credit += r.credit;
        return acc;
      },
      { debit: 0, credit: 0 }
    );
  }, [rows]);

  const latestBalance = rows.length ? rows[rows.length - 1].closing : 0;
  const timePeriod = useMemo(() => {
    if (!rows.length) return "";
    const from = formatDualDate(rows[0].date, rows[0].dateBs);
    const to = formatDualDate(rows[rows.length - 1].date, rows[rows.length - 1].dateBs);
    return from === to ? from : `${from} to ${to}`;
  }, [rows]);

  const exportMeta = useMemo(
    () => ({
      accountName: account?.name ?? "Account",
      accountType: account?.type,
      timePeriod,
      closingBalance: latestBalance,
      totalDebit: totals.debit,
      totalCredit: totals.credit,
    }),
    [account?.name, account?.type, timePeriod, latestBalance, totals.debit, totals.credit]
  );

  const exportRows = useMemo(
    () =>
      rows.map((r) => ({
        date: r.date,
        dateBs: r.dateBs,
        description: r.description,
        opening: r.opening,
        debit: r.debit,
        credit: r.credit,
        closing: r.closing,
      })),
    [rows]
  );

  if (!Number.isFinite(accountId)) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-8 text-slate-600">Invalid account.</div>
    );
  }

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(entryForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert("Enter an amount greater than 0.");
      return;
    }
    const description = entryForm.description.trim();
    if (!description) {
      alert("Description is required.");
      return;
    }

    setIsSaving(true);
    try {
      await postLedgerEntryWithSync({
        accountId,
        date: entryForm.date,
        description,
        debit: entryForm.kind === "debit" ? amount : 0,
        credit: entryForm.kind === "credit" ? amount : 0,
      });
      setShowForm(false);
      setEntryForm({
        date: isoToday(),
        description: "",
        kind: defaultEntryKind(account?.type),
        amount: "",
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not save entry.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportPdf = () => {
    exportLedgerPdf(exportMeta, exportRows);
    setExportOpen(false);
  };

  const handleExportExcel = () => {
    exportLedgerExcel(exportMeta, exportRows);
    setExportOpen(false);
  };

  const handleBackfill = async () => {
    setIsBackfilling(true);
    try {
      const { created } = await backfillSupplierLedgerFromPurchases(accountId);
      if (created === 0) {
        alert("No credit purchases found to import for this supplier.");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setIsBackfilling(false);
    }
  };

  return (
    <PageRoot>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <Link
          href="/ledger"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-sm font-medium text-slate-700"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <div className="text-sm text-slate-500">Dr = balance receivable · Cr = balance payable</div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative" ref={exportMenuRef}>
              <button
                type="button"
                disabled={rows.length === 0}
                onClick={() => setExportOpen((v) => !v)}
                title={rows.length === 0 ? "Add entries before exporting" : "Export ledger"}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700 disabled:opacity-50 disabled:hover:bg-white"
              >
                <Download className="w-4 h-4" />
                Export
                <ChevronDown className={`w-4 h-4 transition-transform ${exportOpen ? "rotate-180" : ""}`} />
              </button>
              {exportOpen && rows.length > 0 ? (
                <div
                  role="menu"
                  className="absolute right-0 z-20 mt-1 min-w-[11rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleExportPdf}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <FileText className="w-4 h-4 text-rose-600" />
                    PDF
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleExportExcel}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                    Excel (.xlsx)
                  </button>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => {
                setEntryForm((prev) => ({
                  ...prev,
                  kind: defaultEntryKind(account?.type),
                }));
                setShowForm((v) => !v);
              }}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              {showForm ? "Cancel" : "Add entry"}
            </button>
          </div>
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={handleAddEntry}
          className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          <div>
            <DualDateField
              value={entryForm.date}
              onChange={(ad) => setEntryForm({ ...entryForm, date: ad })}
              required
            />
            <p className="mt-1 text-xs text-slate-500">You can pick earlier dates for past transactions.</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Entry type</label>
            <select
              value={entryForm.kind}
              onChange={(e) => setEntryForm({ ...entryForm, kind: e.target.value as EntryKind })}
              className="w-full px-3 py-2 border rounded-md bg-white"
            >
              <option value="debit">{entryKindLabel(account?.type, "debit")}</option>
              <option value="credit">{entryKindLabel(account?.type, "credit")}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Amount (Rs.)</label>
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              value={entryForm.amount}
              onChange={(e) => setEntryForm({ ...entryForm, amount: e.target.value })}
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <label className="block text-sm font-medium mb-1">Description</label>
            <input
              required
              type="text"
              value={entryForm.description}
              onChange={(e) => setEntryForm({ ...entryForm, description: e.target.value })}
              className="w-full px-3 py-2 border rounded-md"
              placeholder="e.g. Feed purchase on credit"
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2 bg-secondary text-white rounded-md hover:bg-secondary/90 disabled:opacity-60"
            >
              {isSaving ? "Saving…" : "Save entry"}
            </button>
          </div>
        </form>
      )}

      <div className="rounded-xl shadow-sm border border-slate-300 overflow-hidden bg-white min-w-0">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-300 bg-emerald-50">
          <div className="text-center text-lg font-bold text-slate-900">Ledger Reconciliation</div>
        </div>
        <div className="px-4 sm:px-6 py-4 border-b border-slate-300 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-sm text-slate-700">
            <span className="font-semibold">{account?.name ?? "Account"}</span>
            {account?.type ? <span className="text-slate-500"> ({account.type})</span> : null}
            {timePeriod ? <span className="text-slate-500"> · {timePeriod}</span> : null}
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-600">Closing Balance</div>
            <div className="text-lg font-bold text-slate-900">
              Rs. {Math.abs(latestBalance).toLocaleString()}{" "}
              <span className="text-sm font-semibold text-slate-700">{asDrCr(latestBalance)}</span>
            </div>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="p-10 text-center text-slate-500 space-y-4">
            <p>No ledger entries yet.</p>
            {account?.type === "Supplier" && duePurchaseDaysForAccount > 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-slate-600">
                  Found {duePurchaseDaysForAccount} day(s) of credit purchases for this supplier that are not in the
                  ledger yet.
                </p>
                <button
                  type="button"
                  disabled={isBackfilling}
                  onClick={() => void handleBackfill()}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg border border-emerald-600 text-emerald-800 hover:bg-emerald-50 text-sm font-medium disabled:opacity-60"
                >
                  {isBackfilling ? "Importing…" : "Import credit purchases"}
                </button>
              </div>
            ) : (
              <p className="text-sm text-slate-600">
                Use <strong>Add entry</strong> above for past dates, or record a{" "}
                <Link href="/purchases?new=1" className="text-primary font-medium hover:underline">
                  credit purchase
                </Link>{" "}
                with payment type &quot;Credit (Payable in Ledger)&quot;.
              </p>
            )}
          </div>
        ) : (
          <ResponsiveTableShell
            mobile={rows.map((e) => (
              <MobileDataCard key={e.id}>
                <MobileCardHeader
                  title={e.description}
                  subtitle={<DualDateDisplay iso={e.date} dateBs={e.dateBs} layout="inline" />}
                  trailing={
                    <span className="text-sm font-bold text-slate-900 tabular-nums">
                      {e.closing === 0 ? (
                        "0"
                      ) : (
                        <>
                          {Math.abs(e.closing).toLocaleString()}{" "}
                          <span className="text-xs font-semibold text-slate-600">{asDrCr(e.closing)}</span>
                        </>
                      )}
                    </span>
                  }
                />
                <MobileCardDl
                  rows={[
                    { label: "Debit", value: <span className="text-emerald-700">{formatLedgerSide(e.debit)}</span> },
                    { label: "Credit", value: <span className="text-rose-700">{formatLedgerSide(e.credit)}</span> },
                  ]}
                />
              </MobileDataCard>
            ))}
          >
            <table className="min-w-[1100px] w-full border-collapse">
              <thead>
                <tr className="bg-emerald-100">
                  <th className="border border-slate-700 px-3 py-2 text-left text-xs font-semibold uppercase">Date</th>
                  <th className="border border-slate-700 px-3 py-2 text-left text-xs font-semibold uppercase">Description</th>
                  <th className="border border-slate-700 px-3 py-2 text-right text-xs font-semibold uppercase">Opening Balance</th>
                  <th className="border border-slate-700 px-3 py-2 text-right text-xs font-semibold uppercase">Debit</th>
                  <th className="border border-slate-700 px-3 py-2 text-right text-xs font-semibold uppercase">Credit</th>
                  <th className="border border-slate-700 px-3 py-2 text-center text-xs font-semibold uppercase">Dr or Cr</th>
                  <th className="border border-slate-700 px-3 py-2 text-right text-xs font-semibold uppercase">Closing Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="h-10">
                    <td className="border border-slate-700 px-3 py-2 text-sm whitespace-nowrap">
                      <DualDateDisplay iso={e.date} dateBs={e.dateBs} />
                    </td>
                    <td className="border border-slate-700 px-3 py-2 text-sm">{e.description}</td>
                    <td className="border border-slate-700 px-3 py-2 text-sm text-right whitespace-nowrap">
                      {e.opening ? Math.abs(e.opening).toLocaleString() : "-"}{" "}
                      <span className="text-xs text-slate-600">{e.opening ? asDrCr(e.opening) : ""}</span>
                    </td>
                    <td className="border border-slate-700 px-3 py-2 text-sm text-right whitespace-nowrap font-semibold text-emerald-700">
                      {formatLedgerSide(e.debit)}
                    </td>
                    <td className="border border-slate-700 px-3 py-2 text-sm text-right whitespace-nowrap font-semibold text-rose-700">
                      {formatLedgerSide(e.credit)}
                    </td>
                    <td className="border border-slate-700 px-3 py-2 text-sm text-center font-semibold">{asDrCr(e.closing)}</td>
                    <td className="border border-slate-700 px-3 py-2 text-sm text-right whitespace-nowrap font-semibold">
                      {e.closing === 0 ? (
                        <span className="text-slate-500">0</span>
                      ) : (
                        <>
                          {Math.abs(e.closing).toLocaleString()}{" "}
                          <span className="text-xs font-semibold text-slate-600">{asDrCr(e.closing)}</span>
                        </>
                      )}
                    </td>
                  </tr>
                ))}

                <tr className="bg-emerald-50">
                  <td className="border border-slate-700 px-3 py-2 text-sm font-semibold text-center" colSpan={2}>
                    Total
                  </td>
                  <td className="border border-slate-700 px-3 py-2 text-sm" />
                  <td className="border border-slate-700 px-3 py-2 text-sm text-right font-semibold text-emerald-700">
                    {totals.debit.toLocaleString()}
                  </td>
                  <td className="border border-slate-700 px-3 py-2 text-sm text-right font-semibold text-rose-700">
                    {totals.credit.toLocaleString()}
                  </td>
                  <td className="border border-slate-700 px-3 py-2 text-sm" />
                    <td className="border border-slate-700 px-3 py-2 text-sm text-right font-semibold">
                    {Math.abs(latestBalance).toLocaleString()}{" "}
                    <span className="text-xs font-semibold text-slate-700">{asDrCr(latestBalance)}</span>
                  </td>
                </tr>

                <tr className="bg-emerald-100">
                  <td className="border border-slate-700 px-3 py-2 text-sm font-semibold text-center" colSpan={6}>
                    Closing Balance
                  </td>
                  <td className="border border-slate-700 px-3 py-2 text-sm text-right font-bold">
                    {Math.abs(latestBalance).toLocaleString()}{" "}
                    <span className="text-xs font-semibold text-slate-700">{asDrCr(latestBalance)}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </ResponsiveTableShell>
        )}
      </div>
    </PageRoot>
  );
}

