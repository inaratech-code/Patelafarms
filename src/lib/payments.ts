import { db, type DayBookEntry, type FinancialAccount, type LedgerAccount, type Payment } from "@/lib/db";
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

  let party = await db.ledgerAccounts.get(params.partyAccountId);
  if (!party?.id) throw new Error("Party account not found");
  let partyUid = party.uid;
  if (!partyUid) {
    partyUid = newUid();
    party = { ...party, uid: partyUid };
    await db.ledgerAccounts.update(party.id, { uid: partyUid });
  }

  const isReceive = params.direction === "Receive";
  const method: PaymentMethod = params.method ?? "Cash";
  const accountId = typeof params.accountId === "number" ? params.accountId : await getOrCreateDefaultCashAccountId();
  let financialAccount = await db.financialAccounts.get(accountId);
  if (!financialAccount?.id) throw new Error("Payment account not found");
  let financialAccountUid = financialAccount.uid;
  if (!financialAccountUid) {
    financialAccountUid = newUid();
    financialAccount = { ...financialAccount, uid: financialAccountUid };
    await db.financialAccounts.update(financialAccount.id, { uid: financialAccountUid });
  }
  const paymentUid = newUid();

  // Option A: Cash always affects Day Book cash-in-hand.
  const dayBook: Omit<DayBookEntry, "id"> = {
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
    const ledgerEntryId = await addLedgerEntry({
      accountId: params.partyAccountId,
      date,
      description: dayBook.description,
      debit: isReceive ? 0 : amount,
      credit: isReceive ? amount : 0,
    });

    const dayBookUid = newUid();
    const dayBookEntryId = await db.dayBook.add({ ...dayBook, uid: dayBookUid });

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
    const ledgerEntry = await db.ledgerEntries.get(ledgerEntryId as number);
    const dayBookEntry = await db.dayBook.get(dayBookEntryId as number);

    const partyAccountPayload = {
      uid: partyUid,
      name: party.name,
      type: party.type,
    } satisfies Pick<LedgerAccount, "uid" | "name" | "type">;
    const financialAccountPayload = {
      uid: financialAccountUid,
      name: financialAccount.name,
      type: financialAccount.type,
    } satisfies Pick<FinancialAccount, "uid" | "name" | "type">;

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
          partyAccount: partyAccountPayload,
          financialAccount: financialAccountPayload,
          ledgerEntry: ledgerEntry
            ? {
                uid: ledgerEntry.uid,
                date: ledgerEntry.date,
                dateBs: ledgerEntry.dateBs,
                description: ledgerEntry.description,
                debit: ledgerEntry.debit,
                credit: ledgerEntry.credit,
              }
            : undefined,
          dayBook: dayBookEntry
            ? {
                uid: dayBookUid,
                time: dayBookEntry.time,
                timeBs: dayBookEntry.timeBs,
                type: dayBookEntry.type,
                category: dayBookEntry.category,
                amount: dayBookEntry.amount,
                description: dayBookEntry.description,
                method: dayBookEntry.method,
                account: financialAccountPayload,
                affectsCash: dayBookEntry.affectsCash,
                party: dayBookEntry.party,
                entryStatus: dayBookEntry.entryStatus,
                refType: dayBookEntry.refType,
                refId: dayBookEntry.refId,
              }
            : undefined,
          dayBookUid,
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

