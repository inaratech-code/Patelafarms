import { db, type LedgerAccount, type LedgerEntry } from "@/lib/db";
import { makeSyncEvent } from "@/lib/syncEvents";
import { newUid } from "@/lib/uid";

export type LedgerAccountType = LedgerAccount["type"];

/** Single ledger account used to track cash sales + expenses as a running balance. */
export const CASH_LEDGER_NAME = "Cash sales & expenses";

/**
 * Ensures a single ledger account to track cash balance movements (sales in, expenses out),
 * with the same outbox sync as accounts created on the Ledger page.
 */
export async function getOrCreateCashLedgerAccountId() {
  const existing = await db.ledgerAccounts
    .where({ name: CASH_LEDGER_NAME, type: "Customer" })
    .first();

  if (typeof existing?.id === "number") {
    if (!existing.uid) await db.ledgerAccounts.update(existing.id, { uid: newUid() });
    return existing.id;
  }

  const uid = newUid();
  const account: LedgerAccount = {
    uid,
    name: CASH_LEDGER_NAME,
    type: "Customer",
  };
  const id = await db.ledgerAccounts.add(account);
  if (typeof id !== "number") throw new Error("Failed to create cash ledger account");

  await db.outbox.add(
    makeSyncEvent({
      entityType: "ledger.account",
      entityId: uid,
      op: "create",
      payload: { id, account: { uid, name: CASH_LEDGER_NAME, type: "Customer" as const } },
    })
  );

  return id;
}

function computeNextBalance(prevBalance: number, debit: number, credit: number) {
  return prevBalance + (debit - credit);
}

export function toIsoFromDateOnly(dateYYYYMMDD: string) {
  return new Date(`${dateYYYYMMDD}T12:00:00`).toISOString();
}

function normalizeLedgerDate(date: string) {
  return date.includes("T") ? date : toIsoFromDateOnly(date);
}

/** Recompute stored running balances after inserts or backdated entries. */
export async function recomputeLedgerBalances(accountId: number) {
  const entries = await db.ledgerEntries.where("accountId").equals(accountId).toArray();
  const sorted = entries.slice().sort((a, b) => {
    const t = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (t !== 0) return t;
    return (a.id ?? 0) - (b.id ?? 0);
  });

  let running = 0;
  await db.transaction("rw", db.ledgerEntries, async () => {
    for (const e of sorted) {
      if (typeof e.id !== "number") continue;
      running = computeNextBalance(running, e.debit, e.credit);
      if (e.balance !== running) await db.ledgerEntries.update(e.id, { balance: running });
    }
  });
}

export async function getOrCreateLedgerAccountId(params: {
  name: string;
  type: LedgerAccountType;
}) {
  const name = params.name.trim();
  if (!name) throw new Error("Ledger account name is required");

  const existing = await db.ledgerAccounts
    .where({ name, type: params.type })
    .first();

  if (typeof existing?.id === "number") {
    if (!existing.uid) {
      const uid = newUid();
      await db.ledgerAccounts.update(existing.id, { uid });
      await db.outbox.add(
        makeSyncEvent({
          entityType: "ledger.account",
          entityId: uid,
          op: "update",
          payload: { id: existing.id, account: { uid, name, type: params.type } },
        })
      );
    }
    return existing.id;
  }

  const uid = newUid();
  const id = await db.ledgerAccounts.add({ uid, name, type: params.type });
  if (typeof id !== "number") throw new Error("Failed to create ledger account");

  await db.outbox.add(
    makeSyncEvent({
      entityType: "ledger.account",
      entityId: uid,
      op: "create",
      payload: { id, account: { uid, name, type: params.type } },
    })
  );

  return id;
}

/** Ensures a Supplier ledger account exists for purchase / payable flows. */
export async function ensureSupplierLedgerAccount(supplierName: string) {
  return getOrCreateLedgerAccountId({ name: supplierName, type: "Supplier" });
}

export async function addLedgerEntry(params: {
  accountId: number;
  date: string; // ISO or YYYY-MM-DD
  description: string;
  debit?: number;
  credit?: number;
}) {
  const debit = Number(params.debit ?? 0);
  const credit = Number(params.credit ?? 0);
  const date = normalizeLedgerDate(params.date);

  const entry: Omit<LedgerEntry, "id"> = {
    uid: newUid(),
    accountId: params.accountId,
    date,
    description: params.description,
    debit,
    credit,
    balance: 0,
  };

  const id = await db.ledgerEntries.add(entry);
  await recomputeLedgerBalances(params.accountId);
  return id;
}

/** Add a ledger line and queue sync (manual adjustments, backfill, etc.). */
export async function postLedgerEntryWithSync(params: {
  accountId: number;
  date: string;
  description: string;
  debit?: number;
  credit?: number;
}) {
  const debit = Number(params.debit ?? 0);
  const credit = Number(params.credit ?? 0);
  if (debit <= 0 && credit <= 0) throw new Error("Enter an amount greater than 0");

  const ledgerEntryId = (await addLedgerEntry({
    accountId: params.accountId,
    date: params.date,
    description: params.description.trim(),
    debit,
    credit,
  })) as number;

  const acct = await db.ledgerAccounts.get(params.accountId);
  const entryRow = await db.ledgerEntries.get(ledgerEntryId);
  if (acct?.uid && entryRow?.uid) {
    await db.outbox.add(
      makeSyncEvent({
        entityType: "ledger.entry",
        entityId: entryRow.uid,
        op: "create",
        payload: {
          account: { uid: acct.uid, name: acct.name, type: acct.type },
          entry: {
            uid: entryRow.uid,
            date: entryRow.date,
            description: entryRow.description,
            debit: entryRow.debit,
            credit: entryRow.credit,
          },
        },
      })
    );
  }

  return ledgerEntryId;
}

/**
 * Create missing supplier ledger credits from recorded due purchases (by date),
 * e.g. when the supplier account was created separately from purchase history.
 */
export async function backfillSupplierLedgerFromPurchases(accountId: number) {
  const account = await db.ledgerAccounts.get(accountId);
  if (!account?.id || account.type !== "Supplier") return { created: 0 };

  const name = account.name.trim();
  const purchases = await db.purchases.toArray();
  const dueLines = purchases.filter(
    (p) =>
      p.supplierName?.trim() === name &&
      (p.paymentStatus === "due" || (p.dueAmount ?? 0) > 0)
  );
  if (!dueLines.length) return { created: 0 };

  const existing = await db.ledgerEntries.where("accountId").equals(accountId).toArray();
  const byDay = new Map<string, number>();
  for (const p of dueLines) {
    const day = p.date.slice(0, 10);
    const due = p.dueAmount ?? 0;
    const amt = due > 0 ? due : p.totalCost;
    byDay.set(day, (byDay.get(day) ?? 0) + amt);
  }

  let created = 0;
  await db.transaction("rw", db.tables, async () => {
    for (const [day, amount] of byDay) {
      if (amount <= 0) continue;
      const already = existing.some(
        (e) =>
          e.date.slice(0, 10) === day &&
          Math.abs(e.credit - amount) < 0.01 &&
          e.description.toLowerCase().includes("purchase")
      );
      if (already) continue;

      const iso = toIsoFromDateOnly(day);
      const uid = newUid();
      const entry: Omit<LedgerEntry, "id"> = {
        uid,
        accountId,
        date: iso,
        description: `Purchase from ${name} (imported)`,
        debit: 0,
        credit: amount,
        balance: 0,
      };
      await db.ledgerEntries.add(entry);

      if (account.uid) {
        await db.outbox.add(
          makeSyncEvent({
            entityType: "ledger.entry",
            entityId: uid,
            op: "create",
            payload: {
              account: { uid: account.uid, name: account.name, type: account.type },
              entry: {
                uid,
                date: iso,
                description: entry.description,
                debit: 0,
                credit: amount,
              },
            },
          })
        );
      }
      created += 1;
    }
    if (created > 0) await recomputeLedgerBalances(accountId);
  });

  return { created };
}

/** Posts a cash outflow to the "Cash sales & expenses" ledger and syncs to outbox. */
export async function postCashLedgerExpense(params: {
  date: string;
  description: string;
  amount: number;
}) {
  const cashLedgerId = await getOrCreateCashLedgerAccountId();
  const ledgerEntryId = (await addLedgerEntry({
    accountId: cashLedgerId,
    date: params.date,
    description: params.description,
    debit: 0,
    credit: params.amount,
  })) as number;
  const acct = await db.ledgerAccounts.get(cashLedgerId);
  const entryRow = await db.ledgerEntries.get(ledgerEntryId);
  if (acct?.uid && entryRow?.uid) {
    await db.outbox.add(
      makeSyncEvent({
        entityType: "ledger.entry",
        entityId: entryRow.uid,
        op: "create",
        payload: {
          account: { uid: acct.uid, name: acct.name, type: acct.type },
          entry: {
            uid: entryRow.uid,
            date: entryRow.date,
            description: entryRow.description,
            debit: entryRow.debit,
            credit: entryRow.credit,
          },
        },
      })
    );
  }
  return { cashLedgerId, ledgerEntryId };
}

