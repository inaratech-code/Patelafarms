"use client";

import { ensureSupabaseAuth, getSupabaseClient } from "@/lib/supabaseClient";
import { getFarmId } from "@/lib/farm";
import { applyEvents, pullEvents, pushOutbox } from "@/lib/sync";
import { db } from "@/lib/db";

let _started = false;
let _interval: number | null = null;
let _channel: { unsubscribe?: () => any } | null = null;
let _isTicking = false;
let _tickTimer: number | null = null;
let _hooksInstalled = false;

function scheduleSoon() {
  if (_tickTimer != null) return;
  // Debounce rapid writes (e.g. purchase creates multiple events) into one push/pull.
  _tickTimer = window.setTimeout(() => {
    _tickTimer = null;
    void tick();
  }, 800);
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
    await pushOutbox();
    await pullEvents();
  } catch (e) {
    console.warn("autoSync tick failed:", e);
  } finally {
    _isTicking = false;
  }
}

export async function startAutoSync() {
  if (typeof window === "undefined") return;
  if (_started) return;

  if (!canUseSupabase()) return;

  try {
    if (localStorage.getItem("pf.syncPaused") === "1") return;
    await ensureSupabaseAuth();
    // Important: do NOT create a new farm automatically.
    // Auto-sync should only run after this browser is linked to an existing farm id.
    const farmId = getFarmId();
    if (!farmId) return;
    _started = true;

    const supabase = getSupabaseClient();

    // Auto-push: any new local outbox event triggers a debounced sync.
    if (!_hooksInstalled) {
      _hooksInstalled = true;
      db.outbox.hook("creating", () => scheduleSoon());
      db.outbox.hook("updating", () => scheduleSoon());
      window.addEventListener("online", scheduleSoon);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") scheduleSoon();
      });
    }

    // Realtime: apply new events immediately without requiring manual Sync.
    _channel = supabase
      .channel(`pf-events-${farmId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "events", filter: `farm_id=eq.${farmId}` },
        async (payload: any) => {
          try {
            if (localStorage.getItem("pf.resetting") === "1") return;
            if (localStorage.getItem("pf.syncPaused") === "1") return;
            const row = payload?.new;
            if (!row?.id) return;
            await applyEvents([
              {
                id: String(row.id),
                deviceId: String(row.device_id ?? ""),
                createdAt: String(row.created_at ?? ""),
                entityType: String(row.entity_type ?? ""),
                entityId: String(row.entity_id ?? ""),
                op: row.op,
                payload: row.payload,
              },
            ]);
          } catch (e) {
            console.warn("realtime apply failed:", e);
          }
        }
      )
      .subscribe();

    // Background polling: covers missed realtime events / offline periods.
    _interval = window.setInterval(() => void tick(), 25_000);
    // First sync quickly after boot.
    void tick();
  } catch (e) {
    console.warn("startAutoSync failed:", e);
  }
}

