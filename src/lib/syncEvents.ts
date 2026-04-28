import type { SyncEvent, SyncEventOp } from "@/lib/db";
import { getOrCreateDeviceId } from "@/lib/device";

function uuidv4() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
  return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
}

export function makeSyncEvent(params: {
  entityType: string;
  entityId: string;
  op: SyncEventOp;
  payload: any;
}): SyncEvent {
  return {
    id: uuidv4(),
    deviceId: getOrCreateDeviceId(),
    createdAt: new Date().toISOString(),
    entityType: params.entityType,
    entityId: params.entityId,
    op: params.op,
    payload: params.payload,
  };
}

