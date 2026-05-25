import { db, type DoseReminder, type DoseReminderStatus, type ReminderCadence, type VaccineUsage } from "@/lib/db";
import { getOrCreateDefaultCashAccountId } from "@/lib/accounts";
import { addLedgerEntry, getOrCreateCashLedgerAccountId } from "@/lib/ledger";
import { newUid } from "@/lib/uid";
import { makeSyncEvent } from "@/lib/syncEvents";
import { FARM_HEALTH_EXPENSE_CATEGORY } from "@/lib/erp/expenseEntries";
import { enqueueFarmHealthUsageOutbox } from "@/lib/farmHealthSync";
import { adYmdToBsYmd, datePairFromIso } from "@/lib/nepaliDate";

export function isoDateOnly(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDurationToDate(isoDateYYYYMMDD: string, value: number, unit: "days" | "months") {
  const d = new Date(`${isoDateYYYYMMDD}T12:00:00`);
  if (unit === "months") d.setMonth(d.getMonth() + value);
  else d.setDate(d.getDate() + value);
  return isoDateOnly(d);
}

/** Effective status from dates (completed is sticky). */
export function computeDoseReminderStatus(params: {
  reminderDate: string;
  completedAt?: string;
  persisted: DoseReminderStatus;
}): DoseReminderStatus {
  if (params.persisted === "completed" || params.completedAt) return "completed";
  const today = isoDateOnly(new Date());
  if (params.reminderDate < today) return "overdue";
  if (params.reminderDate === today) return "due_today";
  return "upcoming";
}

/** True if date entered (`purchaseDate`) falls within the past `withinDays` days through today (inclusive). */
export function vaccineDateEnteredRecently(v: { purchaseDate?: string }, todayIso: string, withinDays: number): boolean {
  const p = v.purchaseDate?.trim();
  if (!p) return false;
  const start = new Date(`${todayIso}T12:00:00`);
  start.setDate(start.getDate() - withinDays);
  const startKey = isoDateOnly(start);
  return p >= startKey && p <= todayIso;
}

export async function refreshDoseReminderStatuses() {
  const rows = await db.doseReminders.toArray();
  for (const r of rows) {
    if (!r.id) continue;
    if (r.completedAt || r.status === "completed") continue;
    const next = computeDoseReminderStatus({
      reminderDate: r.reminderDate,
      completedAt: r.completedAt,
      persisted: r.status,
    });
    if (next !== r.status) await db.doseReminders.update(r.id, { status: next });
  }
}

export type RecordVaccineUsageInput = {
  vaccineId: number;
  qtyUsed: number;
  animalBatch: string;
  doseDateIso: string;
  nextIntervalValue?: number;
  nextIntervalUnit?: "days" | "months";
  cadence?: ReminderCadence;
  notes?: string;
};

/**
 * Records vaccine usage: stock reduction, day book + cash ledger expense, health log, next-dose reminder.
 * Posts day book + ledger via outbox; vaccine stock / reminders sync via farmHealth.* events.
 */
export async function recordVaccineUsage(inp: RecordVaccineUsageInput) {
  const qty = Number(inp.qtyUsed);
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("Quantity must be greater than 0.");
  const batch = inp.animalBatch.trim();
  if (!batch) throw new Error("Animal batch is required.");

  await db.transaction("rw", db.tables, async () => {
    const vaccine = await db.vaccines.get(inp.vaccineId);
    if (!vaccine?.id) throw new Error("Vaccine not found.");
    const available = Number(vaccine.qtyAvailable ?? 0);
    if (available < qty) throw new Error("Not enough vaccine stock.");

    const dosePair = datePairFromIso(inp.doseDateIso);
    const unitCost = Number(vaccine.costPrice ?? 0);
    const expenseAmount = qty * unitCost;
    const doseDay = isoDateOnly(new Date(dosePair.date));
    const cadence = inp.cadence ?? "daily";
    const nextV = inp.nextIntervalValue;
    const nextU = inp.nextIntervalUnit;
    const nextDoseDate =
      typeof nextV === "number" && nextV > 0 && (nextU === "days" || nextU === "months")
        ? addDurationToDate(doseDay, nextV, nextU)
        : undefined;

    const nextQty = available - qty;
    await db.vaccines.update(vaccine.id, { qtyAvailable: nextQty });
    const vaccineAfter = { ...vaccine, qtyAvailable: nextQty };

    const usageUid = newUid();
    const usage: Omit<VaccineUsage, "id"> = {
      uid: usageUid,
      vaccineId: vaccine.id,
      qtyUsed: qty,
      animalBatch: batch,
      doseDate: dosePair.date,
      doseDateBs: dosePair.dateBs,
      nextDoseDate,
      nextDoseDateBs: nextDoseDate ? adYmdToBsYmd(nextDoseDate) : undefined,
      nextIntervalValue: nextV,
      nextIntervalUnit: nextU,
      notes: inp.notes?.trim() || undefined,
      expenseAmount,
    };
    const usageId = (await db.vaccineUsages.add(usage)) as number;
    const usageRow = { ...usage, id: usageId };

    let reminderRecord: DoseReminder | undefined;

    if (nextDoseDate) {
      const initialStatus = computeDoseReminderStatus({
        reminderDate: nextDoseDate,
        persisted: "upcoming",
      });
      const reminderUid = newUid();
      reminderRecord = {
        uid: reminderUid,
        vaccineUsageId: usageId,
        reminderDate: nextDoseDate,
        reminderDateBs: adYmdToBsYmd(nextDoseDate),
        status: initialStatus,
        cadence,
        title: `${vaccine.name} — ${batch}`,
      };
      const rid = (await db.doseReminders.add(reminderRecord)) as number;
      reminderRecord = { ...reminderRecord, id: rid };
    }

    const logUid = newUid();
    const healthLogRecord = {
      uid: logUid,
      date: dosePair.date,
      dateBs: dosePair.dateBs,
      animalBatch: batch,
      summary: `Vaccine / medicine: ${vaccine.name} (${qty} ${vaccine.unit})`,
      notes: inp.notes?.trim() || undefined,
      vaccineUsageId: usageId,
    };
    const logId = (await db.healthLogs.add(healthLogRecord)) as number;
    const healthLogRow = { ...healthLogRecord, id: logId };

    await enqueueFarmHealthUsageOutbox({
      vaccine: vaccineAfter,
      usage: usageRow,
      reminder: reminderRecord,
      healthLog: healthLogRow,
    });

    const accountId = await getOrCreateDefaultCashAccountId();
    const fin = await db.financialAccounts.get(accountId);
    const dayUid = newUid();
    const desc = `Vaccine / medicine: ${qty} ${vaccine.unit} ${vaccine.name} (${batch})`;
    const dayRow = {
      uid: dayUid,
      time: dosePair.date,
      timeBs: dosePair.dateBs,
      type: "Expense" as const,
      category: FARM_HEALTH_EXPENSE_CATEGORY,
      amount: expenseAmount,
      description: desc,
      method: "Cash" as const,
      accountId,
      affectsCash: true,
      party: vaccine.name,
      entryStatus: "Paid" as const,
      refType: "vaccine.usage",
      refId: usageUid,
    };
    await db.dayBook.add(dayRow);

    await db.outbox.add(
      makeSyncEvent({
        entityType: "daybook.entry",
        entityId: dayUid,
        op: "create",
        payload: {
          entry: {
            ...dayRow,
            account: fin?.uid ? { uid: fin.uid, name: fin.name, type: fin.type } : null,
          },
        },
      })
    );

    const cashLedgerId = await getOrCreateCashLedgerAccountId();
    const ledgerEntryId = (await addLedgerEntry({
      accountId: cashLedgerId,
      date: dosePair.date,
      description: `Vaccine expense: ${vaccine.name} (${batch})`,
      debit: 0,
      credit: expenseAmount,
    })) as number;
    const cashAcct = await db.ledgerAccounts.get(cashLedgerId);
    const entryRow = await db.ledgerEntries.get(ledgerEntryId);
    if (cashAcct?.uid && entryRow?.uid) {
      await db.outbox.add(
        makeSyncEvent({
          entityType: "ledger.entry",
          entityId: entryRow.uid,
          op: "create",
          payload: {
            account: { uid: cashAcct.uid, name: cashAcct.name, type: cashAcct.type },
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
  });
}
