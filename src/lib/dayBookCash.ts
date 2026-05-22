import type { DayBookEntry } from "@/lib/db";

/** Credit sale / purchase lines are journal-only and must not move cash totals. */
function isCreditJournalLine(
  e: Pick<DayBookEntry, "category" | "method" | "entryStatus" | "description">
): boolean {
  if (e.category === "Sale" && (e.entryStatus === "Unpaid" || e.method === "Credit")) return true;
  if (e.category === "Purchase" && (e.entryStatus === "Due" || e.method === "Credit")) return true;
  if (typeof e.description === "string" && e.description.includes("(Credit)")) return true;
  return false;
}

/**
 * Rows with `affectsCash === false` (or credit journal lines) do not change opening / cash in / cash out.
 * Handles legacy rows where `affectsCash` was backfilled to true before credit journals were distinguished.
 */
export function dayBookEntryAffectsCash(
  e: Pick<DayBookEntry, "affectsCash" | "category" | "method" | "entryStatus" | "description">
): boolean {
  if (e.affectsCash === false) return false;
  if (isCreditJournalLine(e)) return false;
  return true;
}
