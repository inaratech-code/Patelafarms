import type { DayBookEntry } from "@/lib/db";
import { dayBookEntryAffectsCash } from "@/lib/dayBookCash";

/** Day book category for consumable feed usage (inventory → Consumption). */
export const FEED_EXPENSE_CATEGORY = "Feed";

/** Day book category for inventory loss and wastage. */
export const LOSS_EXPENSE_CATEGORY = "Loss";

/** Day book category for farm health vaccine / medicine usage. */
export const FARM_HEALTH_EXPENSE_CATEGORY = "Farm health";

/** @deprecated Use FARM_HEALTH_EXPENSE_CATEGORY — kept for legacy day-book rows. */
export const VACCINE_EXPENSE_CATEGORY_LEGACY = "Vaccine";

/** Feed usage posted from Consumption (and legacy rows). */
export function isFeedExpenseEntry(e: DayBookEntry): boolean {
  if (e.refType === "consumption") return true;
  if (e.category === FEED_EXPENSE_CATEGORY) return true;
  if (e.type === "Expense" && /^Consumption \(/i.test(e.description)) return true;
  return false;
}

/** Loss / wastage posted from Inventory Loss (and legacy rows). */
export function isLossExpenseEntry(e: DayBookEntry): boolean {
  if (e.refType === "inventory_loss") return true;
  if (e.category === LOSS_EXPENSE_CATEGORY) return true;
  if (e.type === "Expense" && /^Inventory loss \(/i.test(e.description)) return true;
  return false;
}

/** Vaccine / medicine usage posted from Farm Health (and legacy rows). */
export function isFarmHealthExpenseEntry(e: DayBookEntry): boolean {
  if (e.refType === "vaccine.usage") return true;
  if (e.category === FARM_HEALTH_EXPENSE_CATEGORY || e.category === VACCINE_EXPENSE_CATEGORY_LEGACY) return true;
  if (e.type === "Expense" && /^Vaccine \/ medicine:/i.test(e.description)) return true;
  return false;
}

/** Tracked on their own ERP lines (not mixed into “other operating expenses”). */
export function isDedicatedErpExpenseEntry(e: DayBookEntry): boolean {
  return isFeedExpenseEntry(e) || isLossExpenseEntry(e) || isFarmHealthExpenseEntry(e);
}

/** @deprecated Use isDedicatedErpExpenseEntry */
export function isFeedOrLossExpenseEntry(e: DayBookEntry): boolean {
  return isFeedExpenseEntry(e) || isLossExpenseEntry(e);
}

/** Wages, transport, etc. — excludes purchases and feed / loss / farm health. */
export function isGeneralOperatingExpenseEntry(e: DayBookEntry): boolean {
  return (
    dayBookEntryAffectsCash(e) &&
    e.type === "Expense" &&
    e.category !== "Purchase" &&
    !isDedicatedErpExpenseEntry(e)
  );
}

/** Any cash expense line for lists and cash totals (includes feed, loss, and farm health). */
export function isCashExpenseEntry(e: DayBookEntry): boolean {
  return dayBookEntryAffectsCash(e) && e.type === "Expense" && e.category !== "Purchase";
}

export function expenseDisplayCategory(e: DayBookEntry): string {
  if (isFeedExpenseEntry(e)) return FEED_EXPENSE_CATEGORY;
  if (isLossExpenseEntry(e)) return LOSS_EXPENSE_CATEGORY;
  if (isFarmHealthExpenseEntry(e)) return FARM_HEALTH_EXPENSE_CATEGORY;
  return e.category;
}
