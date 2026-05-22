import type {
  ConsumptionLog,
  DayBookEntry,
  InventoryItem,
  InventoryLoss,
  Purchase,
  Sale,
  VaccineUsage,
} from "@/lib/db";
import { isFarmHealthExpenseEntry } from "@/lib/erp/expenseEntries";
import { dayBookEntryAffectsCash } from "@/lib/dayBookCash";
import { isGeneralOperatingExpenseEntry } from "@/lib/erp/expenseEntries";

export type ErpMetricInputs = {
  inventory: InventoryItem[];
  sales: Sale[];
  purchases: Purchase[];
  dayBook: DayBookEntry[];
  consumption: ConsumptionLog[];
  losses: InventoryLoss[];
  vaccineUsages: VaccineUsage[];
  monthKey: string; // YYYY-MM
  todayKey: string; // YYYY-MM-DD local via caller
};

/** Calendar YYYY-MM-DD in the user's local timezone (not UTC). */
export function localDayKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Calendar YYYY-MM in local timezone. */
export function localMonthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function dayKeyFromStoredInstant(iso: string) {
  return localDayKey(new Date(iso));
}

export function monthKeyFromStoredInstant(iso: string) {
  return localMonthKey(new Date(iso));
}

function monthPrefix(iso: string, monthKey: string) {
  return monthKeyFromStoredInstant(iso) === monthKey;
}

/** SUM(qty * avgCost) — falls back to costPrice when avgCost missing. */
export function inventoryStockValue(items: InventoryItem[]) {
  return items.reduce((acc, i) => {
    if (i.active === false) return acc;
    const unit = Number(i.avgCost ?? i.costPrice ?? 0);
    return acc + Number(i.quantity ?? 0) * unit;
  }, 0);
}

export function grossSalesMonth(sales: Sale[], monthKey: string) {
  return sales.filter((s) => monthPrefix(s.date, monthKey)).reduce((a, s) => a + Number(s.totalPrice ?? 0), 0);
}

export function purchasesMonth(purchases: Purchase[], monthKey: string) {
  return purchases.filter((p) => monthPrefix(p.date, monthKey)).reduce((a, p) => a + Number(p.totalCost ?? 0), 0);
}

export function feedExpenseMonth(consumption: ConsumptionLog[], monthKey: string) {
  return consumption.filter((c) => monthPrefix(c.date, monthKey)).reduce((a, c) => a + Number(c.cost ?? 0), 0);
}

export function feedExpenseToday(consumption: ConsumptionLog[], todayKey: string) {
  return consumption
    .filter((c) => dayKeyFromStoredInstant(c.date) === todayKey)
    .reduce((a, c) => a + Number(c.cost ?? 0), 0);
}

export function lossExpenseMonth(losses: InventoryLoss[], monthKey: string) {
  return losses.filter((l) => monthPrefix(l.date, monthKey)).reduce((a, l) => a + Number(l.estimatedCost ?? 0), 0);
}

export function operatingExpensesMonth(dayBook: DayBookEntry[], monthKey: string) {
  return dayBook
    .filter((e) => isGeneralOperatingExpenseEntry(e) && monthKeyFromStoredInstant(e.time) === monthKey)
    .reduce((a, e) => a + Number(e.amount ?? 0), 0);
}

/** Farm health (vaccine / medicine) usage cost for the month. */
export function farmHealthExpenseMonth(usages: VaccineUsage[], monthKey: string) {
  return usages
    .filter((u) => monthPrefix(u.doseDate, monthKey))
    .reduce((a, u) => a + Number(u.expenseAmount ?? 0), 0);
}

/** Cash / P&L farm health expenses from day book (matches usage log totals when in sync). */
export function medicineExpenseMonth(dayBook: DayBookEntry[], monthKey: string) {
  return dayBook
    .filter((e) => isFarmHealthExpenseEntry(e) && monthKeyFromStoredInstant(e.time) === monthKey)
    .reduce((a, e) => a + Number(e.amount ?? 0), 0);
}

export function netProfitErp(inp: ErpMetricInputs) {
  const gross = grossSalesMonth(inp.sales, inp.monthKey);
  const buy = purchasesMonth(inp.purchases, inp.monthKey);
  const feed = feedExpenseMonth(inp.consumption, inp.monthKey);
  const loss = lossExpenseMonth(inp.losses, inp.monthKey);
  const farmHealth = farmHealthExpenseMonth(inp.vaccineUsages, inp.monthKey);
  const other = operatingExpensesMonth(inp.dayBook, inp.monthKey);
  return gross - buy - feed - loss - farmHealth - other;
}

export function expenseTrend7d(dayBook: DayBookEntry[]) {
  const now = new Date();
  const out: Array<{ x: string; y: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push({ x: localDayKey(d), y: 0 });
  }
  const idx = new Map(out.map((r, i) => [r.x, i]));
  for (const e of dayBook) {
    if (e.type !== "Expense") continue;
    if (!dayBookEntryAffectsCash(e)) continue;
    const k = dayKeyFromStoredInstant(e.time);
    const j = idx.get(k);
    if (typeof j === "number") out[j] = { ...out[j], y: out[j].y + Number(e.amount ?? 0) };
  }
  return out;
}

export function consumptionTrend7d(consumption: ConsumptionLog[]) {
  const now = new Date();
  const out: Array<{ x: string; y: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push({ x: localDayKey(d), y: 0 });
  }
  const idx = new Map(out.map((r, i) => [r.x, i]));
  for (const c of consumption) {
    const k = dayKeyFromStoredInstant(c.date);
    const j = idx.get(k);
    if (typeof j === "number") out[j] = { ...out[j], y: out[j].y + Number(c.cost ?? 0) };
  }
  return out;
}

export function lossTrend7d(losses: InventoryLoss[]) {
  const now = new Date();
  const out: Array<{ x: string; y: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push({ x: localDayKey(d), y: 0 });
  }
  const idx = new Map(out.map((r, i) => [r.x, i]));
  for (const l of losses) {
    const k = dayKeyFromStoredInstant(l.date);
    const j = idx.get(k);
    if (typeof j === "number") out[j] = { ...out[j], y: out[j].y + Number(l.estimatedCost ?? 0) };
  }
  return out;
}
