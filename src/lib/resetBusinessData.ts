"use client";

import { db } from "@/lib/db";
import { SYNC_STATE_KEY } from "@/lib/syncState";

type ResetOptions = {
  keepUsersAndRoles?: boolean;
};

/**
 * Clears local business data so the app becomes "fresh" again.
 * Keeps auth + farm linkage in localStorage, and (by default) keeps users/roles in IndexedDB.
 */
export async function resetBusinessDataLocal(opts: ResetOptions = {}) {
  const keepUsersAndRoles = opts.keepUsersAndRoles ?? true;

  try {
    if (typeof window !== "undefined") {
      localStorage.setItem("pf.resetting", "1");

      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (!k.startsWith("pf.")) continue;
        if (k === "pf.session.v1") continue;
        if (k === "pf.farmId.v1") continue;
        if (k === "pf.resetting") continue;
        keysToRemove.push(k);
      }
      for (const k of keysToRemove) localStorage.removeItem(k);
      localStorage.removeItem(SYNC_STATE_KEY);

      // After a real reset, we should resume sync (cloud should now be empty + reset event only).
      localStorage.removeItem("pf.syncPaused");
    }

    // Wipe IndexedDB data (avoid huge multi-table tx for flaky mobile browsers).
    const clears: Array<() => Promise<void>> = [
      () => db.inventory.clear(),
      () => db.inventoryLosses.clear(),
      () => db.stockMovement.clear(),
      () => db.sales.clear(),
      () => db.purchases.clear(),
      () => db.dayBook.clear(),
      () => db.ledgerAccounts.clear(),
      () => db.ledgerEntries.clear(),
      () => db.payments.clear(),
      () => db.financialAccounts.clear(),
      () => db.consumptionLogs.clear(),
      () => db.outbox.clear(),
    ];
    if (!keepUsersAndRoles) {
      clears.push(() => db.users.clear(), () => db.roles.clear());
    }

    const failures: string[] = [];
    for (const fn of clears) {
      try {
        await fn();
      } catch (e) {
        failures.push(e instanceof Error ? e.message : String(e));
      }
    }
    if (failures.length) {
      throw new Error(`Some tables could not be cleared:\n- ${failures.join("\n- ")}`);
    }
  } finally {
    if (typeof window !== "undefined") {
      localStorage.removeItem("pf.resetting");
    }
  }
}

