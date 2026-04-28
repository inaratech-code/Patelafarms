import { db, type DayBookEntry, type FinancialAccount } from "@/lib/db";
import { newUid } from "@/lib/uid";

export type PaymentMethod = NonNullable<DayBookEntry["method"]>;

export async function getOrCreateDefaultCashAccountId() {
  const existing = await db.financialAccounts.where("type").equals("Cash").first();
  if (typeof existing?.id === "number") {
    if (!existing.uid) await db.financialAccounts.update(existing.id, { uid: newUid() });
    return existing.id;
  }
  const id = await db.financialAccounts.add({ uid: newUid(), name: "Cash in Hand", type: "Cash" });
  if (typeof id !== "number") throw new Error("Failed to create default cash account");
  return id;
}

export async function listFinancialAccounts() {
  return await db.financialAccounts.toArray();
}

export function computeAccountBalance(params: {
  accountId: number;
  dayBookEntries: DayBookEntry[];
}) {
  let bal = 0;
  for (const e of params.dayBookEntries) {
    if (e.accountId !== params.accountId) continue;
    bal += e.type === "Income" ? e.amount : -e.amount;
  }
  return bal;
}

export function sortAccountsForPicker(accounts: FinancialAccount[]) {
  const order: Record<FinancialAccount["type"], number> = { Cash: 0, Bank: 1, QR: 2 };
  return accounts
    .slice()
    .sort((a, b) => order[a.type] - order[b.type] || a.name.localeCompare(b.name));
}

