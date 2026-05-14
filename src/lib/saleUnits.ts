/** Units offered at POS (inventory item may still use its own default `unit`). */
export const SALE_UNIT_OPTIONS = ["pcs", "kg", "gram", "liter", "bag", "crate", "tray"] as const;
export type SaleUnitOption = (typeof SALE_UNIT_OPTIONS)[number];

export function normalizeSaleUnit(u: string | undefined, fallback: string): string {
  const t = (u ?? "").trim().toLowerCase();
  if (SALE_UNIT_OPTIONS.includes(t as SaleUnitOption)) return t;
  const fb = (fallback ?? "pcs").trim().toLowerCase();
  if (SALE_UNIT_OPTIONS.includes(fb as SaleUnitOption)) return fb;
  return "pcs";
}
