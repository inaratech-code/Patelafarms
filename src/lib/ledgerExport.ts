import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { formatDualDate } from "@/lib/nepaliDate";

export type LedgerExportRow = {
  date: string;
  dateBs?: string;
  description: string;
  opening: number;
  debit: number;
  credit: number;
  closing: number;
};

export type LedgerExportMeta = {
  accountName: string;
  accountType?: string;
  timePeriod: string;
  closingBalance: number;
  totalDebit: number;
  totalCredit: number;
};

function asDrCr(amount: number) {
  if (amount === 0) return "-";
  return amount >= 0 ? "Dr" : "Cr";
}

function formatBalanceCell(amount: number) {
  if (amount === 0) return "0";
  return `${Math.abs(amount).toLocaleString()} ${asDrCr(amount)}`;
}

function safeFileStem(name: string) {
  const stem = name.replace(/[^\w\-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  return stem || "ledger";
}

function exportStamp() {
  return new Date().toISOString().slice(0, 10);
}

function buildSheetRows(meta: LedgerExportMeta, rows: LedgerExportRow[]) {
  const header: (string | number)[][] = [
    ["Ledger Reconciliation"],
    ["Account", meta.accountName],
    ["Type", meta.accountType ?? ""],
    ["Period", meta.timePeriod],
    ["Closing balance", formatBalanceCell(meta.closingBalance)],
    [],
    [
      "Date (AD · BS)",
      "Description",
      "Opening balance",
      "Debit",
      "Credit",
      "Dr/Cr",
      "Closing balance",
    ],
  ];

  const body = rows.map((r) => [
    formatDualDate(r.date, r.dateBs),
    r.description,
    r.opening ? formatBalanceCell(r.opening) : "-",
    r.debit,
    r.credit,
    asDrCr(r.closing),
    formatBalanceCell(r.closing),
  ]);

  const footer: (string | number)[][] = [
    [],
    ["Total", "", "", meta.totalDebit, meta.totalCredit, "", formatBalanceCell(meta.closingBalance)],
    ["Closing balance", "", "", "", "", "", formatBalanceCell(meta.closingBalance)],
  ];

  return [...header, ...body, ...footer];
}

export function exportLedgerExcel(meta: LedgerExportMeta, rows: LedgerExportRow[]) {
  const data = buildSheetRows(meta, rows);
  const ws = XLSX.utils.aoa_to_sheet(data);
  const colWidths = [
    { wch: 28 },
    { wch: 36 },
    { wch: 18 },
    { wch: 12 },
    { wch: 12 },
    { wch: 8 },
    { wch: 18 },
  ];
  ws["!cols"] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Ledger");
  const filename = `ledger_${safeFileStem(meta.accountName)}_${exportStamp()}.xlsx`;
  XLSX.writeFile(wb, filename);
}

export function exportLedgerPdf(meta: LedgerExportMeta, rows: LedgerExportRow[]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  doc.setFontSize(14);
  doc.text("Ledger Reconciliation", 14, 14);
  doc.setFontSize(10);
  doc.text(`Account: ${meta.accountName}${meta.accountType ? ` (${meta.accountType})` : ""}`, 14, 22);
  if (meta.timePeriod) doc.text(`Period: ${meta.timePeriod}`, 14, 28);
  doc.text(`Closing balance: ${formatBalanceCell(meta.closingBalance)}`, 14, 34);

  const tableBody = rows.map((r) => [
    formatDualDate(r.date, r.dateBs),
    r.description,
    r.opening ? formatBalanceCell(r.opening) : "-",
    r.debit.toLocaleString(),
    r.credit.toLocaleString(),
    asDrCr(r.closing),
    formatBalanceCell(r.closing),
  ]);

  autoTable(doc, {
    startY: 40,
    head: [["Date", "Description", "Opening", "Debit", "Credit", "Dr/Cr", "Closing"]],
    body: tableBody,
    foot: [
      [
        "Total",
        "",
        "",
        meta.totalDebit.toLocaleString(),
        meta.totalCredit.toLocaleString(),
        "",
        formatBalanceCell(meta.closingBalance),
      ],
    ],
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [209, 250, 229], textColor: [15, 23, 42] },
    footStyles: { fillColor: [236, 253, 245], fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 42 },
      1: { cellWidth: 55 },
      2: { cellWidth: 28, halign: "right" },
      3: { cellWidth: 22, halign: "right" },
      4: { cellWidth: 22, halign: "right" },
      5: { cellWidth: 14, halign: "center" },
      6: { cellWidth: 28, halign: "right" },
    },
    margin: { left: 14, right: 14 },
  });

  const filename = `ledger_${safeFileStem(meta.accountName)}_${exportStamp()}.pdf`;
  doc.save(filename);
}
