import { db, type DoseReminder, type HealthLog, type Vaccine, type VaccineUsage } from "@/lib/db";
import { makeSyncEvent } from "@/lib/syncEvents";

const FARM_HEALTH_BACKFILL_KEY = "pf.farmHealthOutboxV1";

/** Push vaccine stock to other devices. */
export async function enqueueVaccineOutbox(vaccine: Vaccine, op: "create" | "update" = "create") {
  const uid = vaccine.uid?.trim();
  if (!uid) return;
  const { id: _id, ...rest } = vaccine;
  await db.outbox.add(
    makeSyncEvent({
      entityType: "farmHealth.vaccine",
      entityId: uid,
      op,
      payload: { vaccine: rest },
    })
  );
}

/** Push usage + optional reminder/log + vaccine qty snapshot. */
export async function enqueueFarmHealthUsageOutbox(params: {
  vaccine: Vaccine;
  usage: VaccineUsage;
  reminder?: DoseReminder;
  healthLog?: HealthLog;
}) {
  const vaccineUid = params.vaccine.uid?.trim();
  const usageUid = params.usage.uid?.trim();
  if (!vaccineUid || !usageUid) return;

  const vaccinePayload = { ...params.vaccine, id: undefined };
  const usagePayload = {
    ...params.usage,
    id: undefined,
    vaccineId: undefined,
    vaccineUid,
  };

  await db.outbox.add(
    makeSyncEvent({
      entityType: "farmHealth.usageBundle",
      entityId: usageUid,
      op: "create",
      payload: {
        vaccine: vaccinePayload,
        usage: usagePayload,
        reminder: params.reminder
          ? { ...params.reminder, id: undefined, vaccineUsageId: undefined, usageUid }
          : undefined,
        healthLog: params.healthLog
          ? { ...params.healthLog, id: undefined, vaccineUsageId: undefined, usageUid }
          : undefined,
      },
    })
  );
}

export async function enqueueReminderOutbox(reminder: DoseReminder, usageUid: string) {
  const uid = reminder.uid?.trim();
  if (!uid || !usageUid) return;
  await db.outbox.add(
    makeSyncEvent({
      entityType: "farmHealth.reminder",
      entityId: uid,
      op: "update",
      payload: {
        reminder: { ...reminder, id: undefined, vaccineUsageId: undefined },
        usageUid,
      },
    })
  );
}

export async function enqueueHealthLogOutbox(healthLog: HealthLog, usageUid?: string) {
  const uid = healthLog.uid?.trim();
  if (!uid) return;
  await db.outbox.add(
    makeSyncEvent({
      entityType: "farmHealth.healthLog",
      entityId: uid,
      op: "create",
      payload: {
        healthLog: {
          ...healthLog,
          id: undefined,
          vaccineUsageId: undefined,
          usageUid,
        },
      },
    })
  );
}

/** One-time: emit farm-health rows that existed before sync was wired. */
export async function enqueueFarmHealthOutboxBackfillOnce() {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(FARM_HEALTH_BACKFILL_KEY)) return;

  const vaccines = await db.vaccines.toArray();
  const usages = await db.vaccineUsages.toArray();
  const reminders = await db.doseReminders.toArray();
  const logs = await db.healthLogs.toArray();
  const vaccineById = new Map(vaccines.filter((v) => v.id).map((v) => [v.id!, v]));
  const usageById = new Map(usages.filter((u) => u.id).map((u) => [u.id!, u]));
  const bundledLogIds = new Set<number>();

  await db.transaction("rw", db.outbox, async () => {
    for (const v of vaccines) {
      if (!v.uid) continue;
      const { id: _id, ...rest } = v;
      await db.outbox.add(
        makeSyncEvent({
          entityType: "farmHealth.vaccine",
          entityId: v.uid,
          op: "create",
          payload: { vaccine: rest },
        })
      );
    }
    for (const u of usages) {
      const v = vaccineById.get(u.vaccineId);
      if (!v?.uid || !u.uid) continue;
      const reminder = reminders.find((r) => r.vaccineUsageId === u.id);
      const log = logs.find((l) => l.vaccineUsageId === u.id);
      if (log?.id) bundledLogIds.add(log.id);
      const vaccinePayload = { ...v, id: undefined };
      const usagePayload = { ...u, id: undefined, vaccineId: undefined, vaccineUid: v.uid };
      await db.outbox.add(
        makeSyncEvent({
          entityType: "farmHealth.usageBundle",
          entityId: u.uid,
          op: "create",
          payload: {
            vaccine: vaccinePayload,
            usage: usagePayload,
            reminder: reminder
              ? { ...reminder, id: undefined, vaccineUsageId: undefined, usageUid: u.uid }
              : undefined,
            healthLog: log
              ? { ...log, id: undefined, vaccineUsageId: undefined, usageUid: u.uid }
              : undefined,
          },
        })
      );
    }
    for (const log of logs) {
      if (!log.uid || (log.id && bundledLogIds.has(log.id))) continue;
      const usage = typeof log.vaccineUsageId === "number" ? usageById.get(log.vaccineUsageId) : undefined;
      await db.outbox.add(
        makeSyncEvent({
          entityType: "farmHealth.healthLog",
          entityId: log.uid,
          op: "create",
          payload: {
            healthLog: {
              ...log,
              id: undefined,
              vaccineUsageId: undefined,
              usageUid: usage?.uid,
            },
          },
        })
      );
    }
    for (const r of reminders) {
      const u = usageById.get(r.vaccineUsageId);
      if (!u?.uid || !r.uid) continue;
      await db.outbox.add(
        makeSyncEvent({
          entityType: "farmHealth.reminder",
          entityId: r.uid,
          op: "update",
          payload: {
            reminder: { ...r, id: undefined, vaccineUsageId: undefined },
            usageUid: u.uid,
          },
        })
      );
    }
  });

  localStorage.setItem(FARM_HEALTH_BACKFILL_KEY, "1");
}
