export const commonUnits = [
  "kg",
  "g",
  "L",
  "ml",
  "pcs",
  "dozen",
  "packet",
  "box",
  "bag",
  "tray",
  "bottle",
  "bundle",
  "crate",
] as const;

export type CommonUnit = (typeof commonUnits)[number];

