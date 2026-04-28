"use client";

import { db, type SyncEvent } from "@/lib/db";
import { ensureSupabaseAuth, getSupabaseClient } from "@/lib/supabaseClient";
import { getSyncState, setSyncState } from "@/lib/syncState";
import { ensureFarm, getFarmId } from "@/lib/farm";

function toSupabaseRow(e: SyncEvent) {
  return {
    id: e.id,
    farm_id: (e.payload?.farmId as string | undefined) ?? getFarmId(),
    device_id: e.deviceId,
    created_at: e.createdAt,
    entity_type: e.entityType,
    entity_id: e.entityId,
    op: e.op,
    payload: e.payload,
  };
}

function fromSupabaseRow(r: any): SyncEvent {
  return {
    id: String(r.id),
    deviceId: String(r.device_id),
    createdAt: String(r.created_at),
    entityType: String(r.entity_type),
    entityId: String(r.entity_id),
    op: r.op,
    payload: r.payload,
  };
}

export async function pushOutbox() {
  const supabase = getSupabaseClient();
  await ensureSupabaseAuth();
  await ensureFarm();
  const pending = await db.outbox.where("pushedAt").equals(undefined as any).toArray();
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

      const ensureFinancialAccountIdByUid = async (account: any | null | undefined) => {
        if (!account?.uid) return undefined;
        const found = await db.financialAccounts.where("uid").equals(account.uid).first();
        if (typeof found?.id === "number") return found.id;
        const id = await db.financialAccounts.add({
          uid: account.uid,
          name: String(account.name ?? "Account"),
          type: account.type === "Bank" || account.type === "QR" ? account.type : "Cash",
        } as any);
        return id as any;
      };

      const ensureLedgerAccountIdByUid = async (account: any | null | undefined) => {
        if (!account?.uid) return undefined;
        const found = await db.ledgerAccounts.where("uid").equals(account.uid).first();
        if (typeof found?.id === "number") return found.id;
        const id = await db.ledgerAccounts.add({
          uid: account.uid,
          name: String(account.name ?? "Party"),
          type: account.type === "Supplier" || account.type === "Worker" ? account.type : "Customer",
        } as any);
        return id as any;
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
      if (e.entityType === "inventory.item" && e.op === "create") {
        const item = e.payload?.item;
        if (item?.uid) {
          const found = await db.inventory.where("uid").equals(item.uid).first();
          if (!found) await db.inventory.add(item);
        }
      }
      if (e.entityType === "daybook.entry" && e.op === "create") {
        const entry = e.payload?.entry;
        if (entry?.uid) {
          const found = await db.dayBook.where("uid").equals(entry.uid).first();
          if (!found) {
            const accountId = await ensureFinancialAccountIdByUid(entry.account);
            const row = { ...entry };
            if (typeof accountId === "number") row.accountId = accountId;
            delete row.account;
            await db.dayBook.add(row);
          }
        }
      }
      if (e.entityType === "ledger.entry" && e.op === "create") {
        const account = e.payload?.account;
        const entry = e.payload?.entry;
        if (account?.uid && entry?.uid) {
          const accountId = await ensureLedgerAccountIdByUid(account);
          if (typeof accountId === "number") {
            await addLedgerEntryWithBalance({
              uid: entry.uid,
              accountId,
              date: String(entry.date),
              description: String(entry.description ?? ""),
              debit: Number(entry.debit ?? 0),
              credit: Number(entry.credit ?? 0),
            });
          }
        }
      }
      if (e.entityType === "daybook.expense" && e.op === "create") {
        const entry = e.payload?.entry;
        if (entry?.uid) {
          const found = await db.dayBook.where("uid").equals(entry.uid).first();
          if (!found) await db.dayBook.add(entry);
        }
      }
      if (e.entityType === "payment.posted" && e.op === "create") {
        const payment = e.payload?.payment;
        if (payment?.uid) {
          const found = await db.payments.where("uid").equals(payment.uid).first();
          if (!found) await db.payments.add(payment);
        }
        // DayBook row is included in payload for payments.
        const dayBookUid = e.payload?.dayBookUid;
        const dayBookRow = e.payload?.payment && dayBookUid ? { uid: dayBookUid, ...e.payload.payment.dayBook } : null;
        if (dayBookRow?.uid) {
          const found = await db.dayBook.where("uid").equals(dayBookRow.uid).first();
          if (!found) await db.dayBook.add(dayBookRow as any);
        }
      }
      if (e.entityType === "ledger.account" && e.op === "create") {
        const account = e.payload?.account;
        if (account?.uid) {
          const found = await db.ledgerAccounts.where("uid").equals(account.uid).first();
          if (!found) await db.ledgerAccounts.add(account);
        }
      }
      if (e.entityType === "stock.movement" && e.op === "create") {
        const movement = e.payload?.movement;
        if (movement?.uid) {
          const found = await db.stockMovement.where("uid").equals(movement.uid).first();
          if (!found) await db.stockMovement.add(movement);
        }
      }
      if (e.entityType === "order.sale" && e.op === "create") {
        const sale = e.payload?.sale;
        if (sale?.uid) {
          const found = await db.sales.where("uid").equals(sale.uid).first();
          if (!found) {
            const itemUid = sale.itemUid;
            let itemId = sale.itemId;
            if (itemUid) {
              const inv = await db.inventory.where("uid").equals(itemUid).first();
              if (inv?.id) itemId = inv.id;
            }
            await db.sales.add({ ...sale, itemId });
          }
        }
        const movement = e.payload?.movement;
        if (movement?.uid) {
          const found = await db.stockMovement.where("uid").equals(movement.uid).first();
          if (!found) {
            const itemUid = movement.itemUid;
            let itemId = movement.itemId;
            if (itemUid) {
              const inv = await db.inventory.where("uid").equals(itemUid).first();
              if (inv?.id) itemId = inv.id;
            }
            await db.stockMovement.add({ ...movement, itemId });
          }
        }

        const invDelta = e.payload?.inventoryDelta;
        if (invDelta?.itemUid && typeof invDelta.delta === "number") {
          const inv = await db.inventory.where("uid").equals(invDelta.itemUid).first();
          if (inv?.id) {
            await db.inventory.update(inv.id, { quantity: (inv.quantity ?? 0) + invDelta.delta });
          }
        }
      }
      if (e.entityType === "order.purchase" && e.op === "create") {
        const purchases = Array.isArray(e.payload?.purchases) ? e.payload.purchases : [];
        const movements = Array.isArray(e.payload?.movements) ? e.payload.movements : [];
        const deltas = Array.isArray(e.payload?.inventoryDeltas) ? e.payload.inventoryDeltas : [];

        for (const p of purchases) {
          if (!p?.uid) continue;
          const found = await db.purchases.where("uid").equals(p.uid).first();
          if (found) continue;
          let itemId = p.itemId;
          if (p.itemUid) {
            const inv = await db.inventory.where("uid").equals(p.itemUid).first();
            if (inv?.id) itemId = inv.id;
          }
          await db.purchases.add({ ...p, itemId });
        }

        for (const m of movements) {
          if (!m?.uid) continue;
          const found = await db.stockMovement.where("uid").equals(m.uid).first();
          if (found) continue;
          let itemId = m.itemId;
          if (m.itemUid) {
            const inv = await db.inventory.where("uid").equals(m.itemUid).first();
            if (inv?.id) itemId = inv.id;
          }
          await db.stockMovement.add({ ...m, itemId });
        }

        for (const d of deltas) {
          if (!d?.itemUid || typeof d.delta !== "number") continue;
          const inv = await db.inventory.where("uid").equals(d.itemUid).first();
          if (inv?.id) {
            await db.inventory.update(inv.id, { quantity: (inv.quantity ?? 0) + d.delta });
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

