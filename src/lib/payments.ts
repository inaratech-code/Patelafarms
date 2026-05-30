import { db, type DayBookEntry, type LedgerAccount, type Payment } from "@/lib/db";
import { addLedgerEntry } from "@/lib/ledger";
import { getOrCreateDefaultCashAccountId, type PaymentMethod } from "@/lib/accounts";
import { datePairFromAdYmd, timePairFromAdYmd } from "@/lib/nepaliDate";
import { makeSyncEvent } from "@/lib/syncEvents";
import { newUid } from "@/lib/uid";

export type PartyType = LedgerAccount["type"];
export type PaymentDirection = Payment["direction"];

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

  const { date, dateBs } = datePairFromAdYmd(params.dateYYYYMMDD);
  const { time, timeBs } = timePairFromAdYmd(params.dateYYYYMMDD);
  const note = params.note?.trim();

  const party = await db.ledgerAccounts.get(params.partyAccountId);
  if (!party?.id) throw new Error("Party account not found");

  const isReceive = params.direction === "Receive";
  const method: PaymentMethod = params.method ?? "Cash";
  const accountId = typeof params.accountId === "number" ? params.accountId : await getOrCreateDefaultCashAccountId();
  const paymentUid = newUid();
  const partyUid = party.uid ?? newUid();

  // Option A: Cash always affects Day Book cash-in-hand.
  const dayBookUid = newUid();
  const dayBook: Omit<DayBookEntry, "id"> = {
    uid: dayBookUid,
    time,
    timeBs,
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
    if (!party.uid) await db.ledgerAccounts.update(params.partyAccountId, { uid: partyUid });
    const financialAccount = await db.financialAccounts.get(accountId);
    const financialAccountUid = financialAccount?.uid ?? newUid();
    if (financialAccount?.id && !financialAccount.uid) {
      await db.financialAccounts.update(financialAccount.id, { uid: financialAccountUid });
    }

    const ledgerEntryId = await addLedgerEntry({
      accountId: params.partyAccountId,
      date,
      description: dayBook.description,
      debit: isReceive ? 0 : amount,
      credit: isReceive ? amount : 0,
    });
    const ledgerEntry = typeof ledgerEntryId === "number" ? await db.ledgerEntries.get(ledgerEntryId) : undefined;

    const dayBookEntryId = await db.dayBook.add(dayBook);

    const payment: Omit<Payment, "id"> = {
      uid: paymentUid,
      partyAccountId: params.partyAccountId,
      partyType: params.partyType,
      direction: params.direction,
      amount,
      date,
      dateBs,
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
          financialAccount: financialAccount
            ? { uid: financialAccountUid, name: financialAccount.name, type: financialAccount.type }
            : null,
          ledgerEntry: ledgerEntry?.uid
            ? {
                uid: ledgerEntry.uid,
                date: ledgerEntry.date,
                dateBs: ledgerEntry.dateBs,
                description: ledgerEntry.description,
                debit: ledgerEntry.debit,
                credit: ledgerEntry.credit,
              }
            : null,
          dayBook,
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

