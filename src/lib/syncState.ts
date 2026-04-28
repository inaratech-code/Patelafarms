export const SYNC_STATE_KEY = "pf.syncState.v1";

export type SyncState = {
  lastPulledAt?: string; // ISO timestamptz
};

export function getSyncState(): SyncState {
  if (typeof window === "undefined") return {};
  const raw = localStorage.getItem(SYNC_STATE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as SyncState;
  } catch {
    return {};
  }
}

export function setSyncState(next: SyncState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(next));
}

