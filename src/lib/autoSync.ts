"use client";

import { ensureSupabaseAuth, getSupabaseClient } from "@/lib/supabaseClient";
import { getFarmId } from "@/lib/farm";
import { applyEvents, pullEvents, pushOutbox } from "@/lib/sync";
import { db, type SyncEventOp } from "@/lib/db";

let _started = false;
let _interval: number | null = null;
let _channel: { unsubscribe?: () => void } | null = null;
let _isTicking = false;
let _tickTimer: number | null = null;
let _hooksInstalled = false;

const POLL_MS = 10_000;
const DEBOUNCE_MS = 500;

function scheduleSoon() {
  if (_tickTimer != null) return;
  _tickTimer = window.setTimeout(() => {
    _tickTimer = null;
    void tick();
  }, DEBOUNCE_MS);
}

function canUseSupabase() {
  try {
    getSupabaseClient();
    return true;
  } catch {
    return false;
  }
}

async function tick() {
  if (_isTicking) return;
  if (!navigator.onLine) return;
  if (localStorage.getItem("pf.resetting") === "1") return;
  if (localStorage.getItem("pf.syncPaused") === "1") return;
  const farmId = getFarmId();
  if (!farmId) return;
  try {
    _isTicking = true;
    await pullEvents();
    await pushOutbox();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("pf-sync-complete"));
    }
  } catch (e) {
    console.warn("autoSync tick failed:", e);
  } finally {
    _isTicking = false;
  }
}

function stopRealtimeChannel() {
  try {
    _channel?.unsubscribe?.();
  } catch {
    /* ignore */
  }
  _channel = null;
}

/** Tear down and allow startAutoSync to run again (e.g. after linking a farm). */
export function restartAutoSync() {
  stopRealtimeChannel();
  if (_interval != null) {
    window.clearInterval(_interval);
    _interval = null;
  }
  _started = false;
  void startAutoSync();
}

export async function startAutoSync() {
  if (typeof window === "undefined") return;
  if (_started) return;

  if (!canUseSupabase()) return;

  try {
    if (localStorage.getItem("pf.syncPaused") === "1") return;
    await ensureSupabaseAuth();
    const farmId = getFarmId();
    if (!farmId) return;

    _started = true;
    const supabase = getSupabaseClient();

    if (!_hooksInstalled) {
      _hooksInstalled = true;
      db.outbox.hook("creating", () => scheduleSoon());
      db.outbox.hook("updating", () => scheduleSoon());
      window.addEventListener("online", scheduleSoon);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") scheduleSoon();
      });
    }

    stopRealtimeChannel();
    _channel = supabase
      .channel(`pf-events-${farmId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "events", filter: `farm_id=eq.${farmId}` },
        async (payload: { new?: Record<string, unknown> }) => {
          try {
            if (localStorage.getItem("pf.resetting") === "1") return;
            if (localStorage.getItem("pf.syncPaused") === "1") return;
            const row = payload?.new;
            if (!row?.id) return;
            const opRaw = row.op;
            const op: SyncEventOp =
              opRaw === "update" || opRaw === "delete" || opRaw === "create" ? opRaw : "create";
            await applyEvents([
              {
                id: String(row.id),
                deviceId: String(row.device_id ?? ""),
                createdAt: String(row.created_at ?? ""),
                entityType: String(row.entity_type ?? ""),
                entityId: String(row.entity_id ?? ""),
                op,
                payload: row.payload,
              },
            ]);
            window.dispatchEvent(new CustomEvent("pf-sync-complete"));
          } catch (e) {
            console.warn("realtime apply failed:", e);
            scheduleSoon();
          }
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("autoSync realtime:", status);
          scheduleSoon();
        }
      });

    if (_interval != null) window.clearInterval(_interval);
    _interval = window.setInterval(() => void tick(), POLL_MS);
    void tick();
  } catch (e) {
    console.warn("startAutoSync failed:", e);
    _started = false;
  }
}
