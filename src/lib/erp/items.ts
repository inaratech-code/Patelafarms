import type { InventoryItem, ItemTypeErp } from "@/lib/db";

export function resolveItemType(item: InventoryItem): ItemTypeErp {
  return item.itemType ?? "sellable";
}

export function isSellable(item: InventoryItem): boolean {
  return resolveItemType(item) === "sellable";
}

export function isConsumable(item: InventoryItem): boolean {
  return resolveItemType(item) === "consumable";
}

export function isActiveItem(item: InventoryItem): boolean {
  return item.active !== false;
}

/** Block outbound qty if it would go negative. */
export function assertStockAvailable(currentQty: number, outboundQty: number) {
  if (!Number.isFinite(outboundQty) || outboundQty <= 0) throw new Error("Quantity must be positive.");
  if (currentQty < outboundQty) throw new Error("Not enough stock for this operation.");
}
