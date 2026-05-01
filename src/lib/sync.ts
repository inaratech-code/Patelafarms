"use client";

import {
  db,
  type DayBookEntry,
  type FinancialAccount,
  type InventoryItem,
  type LedgerAccount,
  type Payment,
  type Purchase,
  type Sale,
  type StockMovement,
  type SyncEvent,
  type SyncEventOp,
} from "@/lib/db";
import { ensureSupabaseAuth, getSupabaseClient } from "@/lib/supabaseClient";
import { getSyncState, setSyncState } from "@/lib/syncState";
import { ensureFarm, getFarmId } from "@/lib/farm";

type AnyRecord = Record<string, unknown>;

function asRecord(v: unknown): AnyRecord | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  return v as AnyRecord;
}
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function toSupabaseRow(e: SyncEvent) {
  const payload = (e.payload ?? null) as Record<string, unknown> | null;
  return {
    id: e.id,
    farm_id: (payload?.farmId as string | undefined) ?? getFarmId(),
    device_id: e.deviceId,
    created_at: e.createdAt,
    entity_type: e.entityType,
    entity_id: e.entityId,
    op: e.op,
    payload: e.payload,
  };
}

function fromSupabaseRow(r: unknown): SyncEvent {
  const row = asRecord(r) ?? {};
  return {
    id: String(row.id ?? ""),
    deviceId: String(row.device_id ?? ""),
    createdAt: String(row.created_at ?? ""),
    entityType: String(row.entity_type ?? ""),
    entityId: String(row.entity_id ?? ""),
    op: row.op as SyncEventOp,
    payload: row.payload,
  };
}

export async function pushOutbox() {
  const supabase = getSupabaseClient();
  await ensureSupabaseAuth();
  await ensureFarm();
  const pending = await db.outbox.where("pushedAt").equals(undefined as unknown as string).toArray();
  if (pending.length === 0) return { pushed: 0 };

  // Insert in chunks to avoid large payloads.
  const chunkSize = 50;
  let pushed = 0;
  for (let i = 0; i < pending.length; i += chunkSize) {
    const chunk = pending.slice(i, i + chunkSize);
    const rows = chunk.map(toSupabaseRow);
    const { error } = await supabase.from("events").insert(rows);
    if (error) throw error;

    const nowIso = new Date().toISOString();
    await db.transaction("rw", db.outbox, async () => {
      for (const e of chunk) {
        await db.outbox.update(e.id, { pushedAt: nowIso });
      }
    });
    pushed += chunk.length;
  }

  return { pushed };
}

export async function pullEvents() {
  const supabase = getSupabaseClient();
  await ensureSupabaseAuth();
  const farmId = await ensureFarm();
  const state = getSyncState();
  const since = state.lastPulledAt;

  let query = supabase.from("events").select("*").eq("farm_id", farmId).order("created_at", { ascending: true }).limit(500);
  if (since) query = query.gt("created_at", since);

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []).map(fromSupabaseRow);
  if (rows.length === 0) return { pulled: 0 };

  await applyEvents(rows);

  const last = rows[rows.length - 1].createdAt;
  setSyncState({ lastPulledAt: last });

  return { pulled: rows.length };
}

export async function applyEvents(events: SyncEvent[]) {
  // Idempotency: skip events already applied.
  const existing = new Set<string>((await db.outbox.toArray()).map((e) => e.id));
  const nowIso = new Date().toISOString();

  await db.transaction("rw", db.tables, async () => {
    for (const e of events) {
      if (existing.has(e.id)) continue;

      const ensureFinancialAccountIdByUid = async (account: unknown) => {
        const a = asRecord(account);
        const uid = a ? asString(a.uid) : undefined;
        if (!uid) return undefined;
        const found = await db.financialAccounts.where("uid").equals(uid).first();
        if (typeof found?.id === "number") return found.id;
        const type = a?.type === "Bank" || a?.type === "QR" ? (a.type as FinancialAccount["type"]) : "Cash";
        const id = await db.financialAccounts.add({
          uid,
          name: String(a?.name ?? "Account"),
          type,
        } satisfies Omit<FinancialAccount, "id">);
        return id;
      };

      const ensureLedgerAccountIdByUid = async (account: unknown) => {
        const a = asRecord(account);
        const uid = a ? asString(a.uid) : undefined;
        if (!uid) return undefined;
        const found = await db.ledgerAccounts.where("uid").equals(uid).first();
        if (typeof found?.id === "number") return found.id;
        const type =
          a?.type === "Supplier" || a?.type === "Worker" ? (a.type as LedgerAccount["type"]) : "Customer";
        const id = await db.ledgerAccounts.add({
          uid,
          name: String(a?.name ?? "Party"),
          type,
        } satisfies Omit<LedgerAccount, "id">);
        return id;
      };

      const addLedgerEntryWithBalance = async (params: {
        uid: string;
        accountId: number;
        date: string;
        description: string;
        debit: number;
        credit: number;
      }) => {
        const existingEntry = await db.ledgerEntries.where("uid").equals(params.uid).first();
        if (existingEntry) return;

        const last = await db.ledgerEntries.where("accountId").equals(params.accountId).sortBy("date");
        const prevBalance = last.length ? last[last.length - 1].balance : 0;
        const balance = prevBalance + (Number(params.debit) - Number(params.credit));

        await db.ledgerEntries.add({
          uid: params.uid,
          accountId: params.accountId,
          date: params.date,
          description: params.description,
          debit: Number(params.debit) || 0,
          credit: Number(params.credit) || 0,
          balance,
        });
      };

      // Apply minimal event types we currently emit.
      const payload = asRecord(e.payload);
      if (e.entityType === "inventory.item" && e.op === "create") {
        const item = asRecord(payload?.item);
        const uid = item ? asString(item.uid) : undefined;
        if (uid) {
          const found = await db.inventory.where("uid").equals(uid).first();
          if (!found) await db.inventory.add(item as unknown as Omit<InventoryItem, "id">);
        }
      }
      if (e.entityType === "daybook.entry" && e.op === "create") {
        const entry = asRecord(payload?.entry);
        const uid = entry ? asString(entry.uid) : undefined;
        if (uid && entry) {
          const found = await db.dayBook.where("uid").equals(uid).first();
          if (!found) {
            const accountId = await ensureFinancialAccountIdByUid(entry.account);
            const row: AnyRecord = { ...entry };
            if (typeof accountId === "number") row.accountId = accountId;
            delete row.account;
            await db.dayBook.add(row as unknown as Omit<DayBookEntry, "id">);
          }
        }
      }
      if (e.entityType === "ledger.entry" && e.op === "create") {
        const account = asRecord(payload?.account);
        const entry = asRecord(payload?.entry);
        const aUid = account ? asString(account.uid) : undefined;
        const eUid = entry ? asString(entry.uid) : undefined;
        if (aUid && eUid && entry) {
          const accountId = await ensureLedgerAccountIdByUid(account);
          if (typeof accountId === "number") {
            await addLedgerEntryWithBalance({
              uid: eUid,
              accountId,
              date: String(entry.date ?? ""),
              description: String(entry.description ?? ""),
              debit: Number(entry.debit ?? 0) || 0,
              credit: Number(entry.credit ?? 0) || 0,
            });
          }
        }
      }
      if (e.entityType === "daybook.expense" && e.op === "create") {
        const entry = asRecord(payload?.entry);
        const uid = entry ? asString(entry.uid) : undefined;
        if (uid) {
          const found = await db.dayBook.where("uid").equals(uid).first();
          if (!found) await db.dayBook.add(entry as unknown as Omit<DayBookEntry, "id">);
        }
      }
      if (e.entityType === "payment.posted" && e.op === "create") {
        const payment = asRecord(payload?.payment);
        const pUid = payment ? asString(payment.uid) : undefined;
        if (pUid) {
          const found = await db.payments.where("uid").equals(pUid).first();
          if (!found) await db.payments.add(payment as unknown as Omit<Payment, "id">);
        }
        // DayBook row is included in payload for payments.
        const dayBookUid = asString(payload?.dayBookUid);
        const dayBookObj = payment ? asRecord(payment.dayBook) : undefined;
        const dayBookRow = dayBookUid && dayBookObj ? ({ uid: dayBookUid, ...dayBookObj } as AnyRecord) : undefined;
        const dbUid = dayBookRow ? asString(dayBookRow.uid) : undefined;
        if (dbUid) {
          const found = await db.dayBook.where("uid").equals(dbUid).first();
          if (!found) await db.dayBook.add(dayBookRow as unknown as Omit<DayBookEntry, "id">);
        }
      }
      if (e.entityType === "ledger.account" && e.op === "create") {
        const account = asRecord(payload?.account);
        const uid = account ? asString(account.uid) : undefined;
        if (uid) {
          const found = await db.ledgerAccounts.where("uid").equals(uid).first();
          if (!found) await db.ledgerAccounts.add(account as unknown as Omit<LedgerAccount, "id">);
        }
      }
      if (e.entityType === "stock.movement" && e.op === "create") {
        const movement = asRecord(payload?.movement);
        const uid = movement ? asString(movement.uid) : undefined;
        if (uid) {
          const found = await db.stockMovement.where("uid").equals(uid).first();
          if (!found) await db.stockMovement.add(movement as unknown as Omit<StockMovement, "id">);
        }
      }
      if (e.entityType === "order.sale" && e.op === "create") {
        const sale = asRecord(payload?.sale);
        const uid = sale ? asString(sale.uid) : undefined;
        if (uid && sale) {
          const found = await db.sales.where("uid").equals(uid).first();
          if (!found) {
            const itemUid = asString(sale.itemUid);
            let itemId = asNumber(sale.itemId);
            if (itemUid) {
              const inv = await db.inventory.where("uid").equals(itemUid).first();
              if (inv?.id) itemId = inv.id;
            }
            await db.sales.add({ ...(sale as AnyRecord), itemId: itemId ?? 0 } as unknown as Omit<Sale, "id">);
          }
        }
        const movement = asRecord(payload?.movement);
        const mUid = movement ? asString(movement.uid) : undefined;
        if (mUid && movement) {
          const found = await db.stockMovement.where("uid").equals(mUid).first();
          if (!found) {
            const itemUid = asString(movement.itemUid);
            let itemId = asNumber(movement.itemId);
            if (itemUid) {
              const inv = await db.inventory.where("uid").equals(itemUid).first();
              if (inv?.id) itemId = inv.id;
            }
            await db.stockMovement.add({ ...(movement as AnyRecord), itemId: itemId ?? 0 } as unknown as Omit<StockMovement, "id">);
          }
        }

        const invDelta = asRecord(payload?.inventoryDelta);
        const itemUid = invDelta ? asString(invDelta.itemUid) : undefined;
        const delta = invDelta ? asNumber(invDelta.delta) : undefined;
        if (itemUid && typeof delta === "number") {
          const inv = await db.inventory.where("uid").equals(itemUid).first();
          if (inv?.id) {
            await db.inventory.update(inv.id, { quantity: (inv.quantity ?? 0) + delta });
          }
        }
      }
      if (e.entityType === "order.purchase" && e.op === "create") {
        const purchasesArr = asArray(payload?.purchases);
        const movementsArr = asArray(payload?.movements);
        const deltasArr = asArray(payload?.inventoryDeltas);

        for (const raw of purchasesArr) {
          const p = asRecord(raw);
          const uid = p ? asString(p.uid) : undefined;
          if (!uid) continue;
          const found = await db.purchases.where("uid").equals(uid).first();
          if (found) continue;
          let itemId = p ? asNumber(p.itemId) : undefined;
          const itemUid = p ? asString(p.itemUid) : undefined;
          if (itemUid) {
            const inv = await db.inventory.where("uid").equals(itemUid).first();
            if (inv?.id) itemId = inv.id;
          }
          await db.purchases.add({ ...(p as AnyRecord), itemId: itemId ?? 0 } as unknown as Omit<Purchase, "id">);
        }

        for (const raw of movementsArr) {
          const m = asRecord(raw);
          const uid = m ? asString(m.uid) : undefined;
          if (!uid) continue;
          const found = await db.stockMovement.where("uid").equals(uid).first();
          if (found) continue;
          let itemId = m ? asNumber(m.itemId) : undefined;
          const itemUid = m ? asString(m.itemUid) : undefined;
          if (itemUid) {
            const inv = await db.inventory.where("uid").equals(itemUid).first();
            if (inv?.id) itemId = inv.id;
          }
          await db.stockMovement.add({ ...(m as AnyRecord), itemId: itemId ?? 0 } as unknown as Omit<StockMovement, "id">);
        }

        for (const raw of deltasArr) {
          const d = asRecord(raw);
          const itemUid = d ? asString(d.itemUid) : undefined;
          const delta = d ? asNumber(d.delta) : undefined;
          if (!itemUid || typeof delta !== "number") continue;
          const inv = await db.inventory.where("uid").equals(itemUid).first();
          if (inv?.id) {
            await db.inventory.update(inv.id, { quantity: (inv.quantity ?? 0) + delta });
          }
        }
      }

      await db.outbox.add({ ...e, appliedAt: nowIso, pushedAt: e.pushedAt });
      existing.add(e.id);
    }
  });
}

export async function syncNow() {
  const push = await pushOutbox();
  const pull = await pullEvents();
  return { ...push, ...pull };
}

