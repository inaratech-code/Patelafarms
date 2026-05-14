import type { DoseReminder, InventoryItem, LedgerAccount, LedgerEntry, Vaccine } from "@/lib/db";
import { farmHealthNotificationCount } from "@/lib/farmHealthAlerts";
import { localDayKey } from "@/lib/erp/metrics";

export function computeNavBadgeCount(params: {
  inventory: InventoryItem[];
  ledgerAccounts: LedgerAccount[];
  ledgerEntries: LedgerEntry[];
  doseReminders: DoseReminder[];
  vaccines: Vaccine[];
}) {
  const lowStock = params.inventory.filter((i) => {
    const th = i.reorderLevel ?? i.minStockThreshold ?? 0;
    return th > 0 && i.quantity <= th;
  }).length;

  const sums = new Map<number, { debit: number; credit: number }>();
  for (const e of params.ledgerEntries) {
    const cur = sums.get(e.accountId) ?? { debit: 0, credit: 0 };
    cur.debit += e.debit;
    cur.credit += e.credit;
    sums.set(e.accountId, cur);
  }
  const pending = params.ledgerAccounts.filter((a) => {
    if (typeof a.id !== "number") return false;
    const s = sums.get(a.id) ?? { debit: 0, credit: 0 };
    return s.debit - s.credit !== 0;
  }).length;

  const todayKey = localDayKey(new Date());
  const farm = farmHealthNotificationCount({
    reminders: params.doseReminders,
    vaccines: params.vaccines,
    todayKey,
  });

  return lowStock + pending + farm;
}
