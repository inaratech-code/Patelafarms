"use client";

import { ensureSupabaseAuth, getSupabaseClient } from "@/lib/supabaseClient";
import { getFarmId } from "@/lib/farm";
import { applyEvents, pullEvents, pushOutbox } from "@/lib/sync";

let _started = false;
let _interval: number | null = null;
let _channel: { unsubscribe?: () => any } | null = null;
let _isTicking = false;

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
  _started = true;

  if (!canUseSupabase()) return;

  try {
    await ensureSupabaseAuth();
    // Important: do NOT create a new farm automatically.
    // Auto-sync should only run after this browser is linked to an existing farm id.
    const farmId = getFarmId();
    if (!farmId) return;

    const supabase = getSupabaseClient();

    // Realtime: apply new events immediately without requiring manual Sync.
    _channel = supabase
      .channel(`pf-events-${farmId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "events", filter: `farm_id=eq.${farmId}` },
        async (payload: any) => {
          try {
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
    const runNow = () => void tick();
    window.addEventListener("online", runNow);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") runNow();
    });

    _interval = window.setInterval(() => void tick(), 25_000);
    // First sync quickly after boot.
    void tick();
  } catch (e) {
    console.warn("startAutoSync failed:", e);
  }
}

