import { db, type DayBookEntry, type LedgerAccount, type Payment } from "@/lib/db";
import { addLedgerEntry } from "@/lib/ledger";
import { getOrCreateDefaultCashAccountId, type PaymentMethod } from "@/lib/accounts";
import { makeSyncEvent } from "@/lib/syncEvents";
import { newUid } from "@/lib/uid";

export type PartyType = LedgerAccount["type"];
export type PaymentDirection = Payment["direction"];

function toIsoFromDateOnly(dateYYYYMMDD: string) {
  // stable midday to avoid timezone edge cases
  return new Date(`${dateYYYYMMDD}T12:00:00`).toISOString();
}

export async function postPayment(params: {
  partyAccountId: number;
  partyType: PartyType;
  direction: PaymentDirection; // Receive | Pay
  amount: number;
  dateYYYYMMDD: string; // input date
  note?: string;
  method?: PaymentMethod;
  accountId?: number;
}) {
  const amount = Number(params.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be greater than 0");

  const date = toIsoFromDateOnly(params.dateYYYYMMDD);
  const note = params.note?.trim();

  const party = await db.ledgerAccounts.get(params.partyAccountId);
  if (!party?.id) throw new Error("Party account not found");

  const isReceive = params.direction === "Receive";
  const method: PaymentMethod = params.method ?? "Cash";
  const accountId = typeof params.accountId === "number" ? params.accountId : await getOrCreateDefaultCashAccountId();
  const paymentUid = newUid();

  // Option A: Cash always affects Day Book cash-in-hand.
  const dayBook: Omit<DayBookEntry, "id"> = {
    time: date,
    type: isReceive ? "Income" : "Expense",
    category: "Other",
    amount,
    description: isReceive
      ? `Received ${method} from ${party.name}${note ? ` (${note})` : ""}`
      : `Paid ${method} to ${party.name}${note ? ` (${note})` : ""}`,
    method,
    accountId,
    affectsCash: true,
    party: party.name,
    entryStatus: "Paid",
    refType: "payment",
    refId: paymentUid,
  };

  return await db.transaction("rw", db.tables, async () => {
    let partyUid = party.uid;
    if (!partyUid) {
      partyUid = newUid();
      await db.ledgerAccounts.update(party.id, { uid: partyUid });
      await db.outbox.add(
        makeSyncEvent({
          entityType: "ledger.account",
          entityId: partyUid,
          op: "update",
          payload: {
            id: party.id,
            account: { uid: partyUid, name: party.name, type: party.type },
          },
        })
      );
    }

    const ledgerEntryId = await addLedgerEntry({
      accountId: params.partyAccountId,
      date,
      description: dayBook.description,
      debit: isReceive ? 0 : amount,
      credit: isReceive ? amount : 0,
    });

    const dayBookUid = newUid();
    const dayBookEntryId = await db.dayBook.add({ ...dayBook, uid: dayBookUid });
    const ledgerEntry = await db.ledgerEntries.get(ledgerEntryId);
    const financialAccount = await db.financialAccounts.get(accountId);
    let financialAccountUid = financialAccount?.uid;
    if (financialAccount?.id && !financialAccountUid) {
      financialAccountUid = newUid();
      await db.financialAccounts.update(financialAccount.id, { uid: financialAccountUid });
    }

    const payment: Omit<Payment, "id"> = {
      uid: paymentUid,
      partyAccountId: params.partyAccountId,
      partyType: params.partyType,
      direction: params.direction,
      amount,
      date,
      note,
      method,
      accountId,
      linkedLedgerEntryId: ledgerEntryId,
      linkedDayBookEntryId: dayBookEntryId,
    };

    const paymentId = await db.payments.add(payment);

    // Add an outbox event to sync across devices.
    await db.outbox.add(
      makeSyncEvent({
        entityType: "payment.posted",
        entityId: paymentUid,
        op: "create",
        payload: {
          paymentId,
          ledgerEntryId,
          dayBookEntryId,
          payment,
          partyAccount: { uid: partyUid, name: party.name, type: party.type },
          financialAccount: financialAccount && financialAccountUid
            ? { uid: financialAccountUid, name: financialAccount.name, type: financialAccount.type }
            : null,
          ledgerEntry: ledgerEntry?.uid
            ? {
                uid: ledgerEntry.uid,
                date: ledgerEntry.date,
                description: ledgerEntry.description,
                debit: ledgerEntry.debit,
                credit: ledgerEntry.credit,
              }
            : null,
          dayBook: {
            ...dayBook,
            uid: dayBookUid,
            account: financialAccount && financialAccountUid
              ? { uid: financialAccountUid, name: financialAccount.name, type: financialAccount.type }
              : null,
          },
        },
      })
    );

    return {
      paymentId,
      ledgerEntryId,
      dayBookEntryId,
    };
  });
}

