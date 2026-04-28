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
  };

  return await db.transaction("rw", db.tables, async () => {
    const paymentUid = newUid();
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
        payload: { paymentId, ledgerEntryId, dayBookEntryId, payment, dayBookUid },
      })
    );

    return {
      paymentId,
      ledgerEntryId,
      dayBookEntryId,
    };
  });
}

