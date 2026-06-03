export type InventoryCostSnapshot = {
  quantity?: number;
  avgCost?: number;
  costPrice?: number;
};

export type InventoryCostPatch = {
  quantity: number;
  avgCost?: number;
  costPrice?: number;
};

export function applyIncomingPurchaseCost(
  snapshot: InventoryCostSnapshot,
  delta: number,
  unitCost: number | undefined
): InventoryCostPatch {
  const prevQty = Number(snapshot.quantity ?? 0);
  const nextQty = prevQty + delta;

  if (delta > 0 && typeof unitCost === "number" && Number.isFinite(unitCost) && unitCost > 0) {
    const prevAvg = Number(snapshot.avgCost ?? snapshot.costPrice ?? 0);
    const avgCost = nextQty > 0 ? (prevAvg * prevQty + unitCost * delta) / nextQty : unitCost;
    return { quantity: nextQty, avgCost, costPrice: unitCost };
  }

  return { quantity: nextQty };
}
