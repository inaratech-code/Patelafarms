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
  date: string; // ISO
  description: string;
  debit?: number;
  credit?: number;
}) {
  const debit = Number(params.debit ?? 0);
  const credit = Number(params.credit ?? 0);

  const last = await db.ledgerEntries
    .where("accountId")
    .equals(params.accountId)
    .sortBy("date");

  const prevBalance = last.length ? last[last.length - 1].balance : 0;
  const balance = computeNextBalance(prevBalance, debit, credit);

  const entry: Omit<LedgerEntry, "id"> = {
    uid: newUid(),
    accountId: params.accountId,
    date: params.date,
    description: params.description,
    debit,
    credit,
    balance,
  };

  return await db.ledgerEntries.add(entry);
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

