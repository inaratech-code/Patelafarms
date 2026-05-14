import type { DayBookEntry } from "@/lib/db";

/** Rows with `affectsCash === false` are journal-only (credit sales/purchases, etc.). */
export function dayBookEntryAffectsCash(e: Pick<DayBookEntry, "affectsCash">): boolean {
  return e.affectsCash !== false;
}
