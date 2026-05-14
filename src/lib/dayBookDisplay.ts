import type { DayBookEntry } from "@/lib/db";
import { dayBookEntryAffectsCash } from "@/lib/dayBookCash";

export function dayBookJournalType(e: DayBookEntry): string {
  if (e.refType === "payment") {
    return e.type === "Income" ? "Receipt" : "Payment";
  }
  if (e.category === "Sale") return "Sale";
  if (e.category === "Purchase") return "Purchase";
  if (e.category === "Vaccine") return "Vaccine";
  if (e.refType === "inventory_loss") return "Loss";
  if (e.refType === "consumption") return "Feed use";
  return "Expense";
}

export function dayBookPaymentModeLabel(e: DayBookEntry): string {
  if (e.method === "Credit") return "Credit";
  if (e.method === "QR") return "QR";
  if (e.method === "BankTransfer") return "Bank";
  if (e.method === "Cash") return "Cash";
  return e.type === "Income" ? "Cash" : "—";
}

export function dayBookStatusLabel(e: DayBookEntry): string {
  if (e.entryStatus) return e.entryStatus;
  if (!dayBookEntryAffectsCash(e)) {
    if (e.category === "Sale") return "Unpaid";
    if (e.category === "Purchase") return "Due";
  }
  return "Paid";
}

export function dayBookPartyLabel(e: DayBookEntry): string {
  if (e.party?.trim()) return e.party.trim();
  const m = e.description.match(/from\s+(.+?)\s*\(/i);
  if (m?.[1]) return m[1].trim();
  const m2 = e.description.match(/to\s+(.+?)\s*\(/i);
  if (m2?.[1]) return m2[1].trim();
  return "—";
}
