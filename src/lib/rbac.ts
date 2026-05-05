"use client";

export type PermissionId =
  | "*"
  | "dashboard"
  | "reports"
  | "outstanding"
  | "inventory.items"
  | "inventory.consumption"
  | "inventory.stockMovement"
  | "inventory.lossWastage"
  | "transactions.overview"
  | "transactions.sales"
  | "transactions.purchases"
  | "transactions.expenses"
  | "accounts.ledger"
  | "accounts.dayBook"
  | "accounts.payments"
  | "accounts.accounts"
  | "people.customers"
  | "people.suppliers"
  | "people.workers"
  | "people.users"
  | "alerts"
  | "settings";

const KNOWN_PERMISSIONS = new Set<string>([
  "*",
  "dashboard",
  "reports",
  "outstanding",
  "inventory.items",
  "inventory.consumption",
  "inventory.stockMovement",
  "inventory.lossWastage",
  "transactions.overview",
  "transactions.sales",
  "transactions.purchases",
  "transactions.expenses",
  "accounts.ledger",
  "accounts.dayBook",
  "accounts.payments",
  "accounts.accounts",
  "people.customers",
  "people.suppliers",
  "people.workers",
  "people.users",
  "alerts",
  "settings",
]);

const LEGACY_EXPANSIONS: Record<string, PermissionId[]> = {
  dashboard: ["dashboard"],
  reports: ["reports"],
  outstanding: ["outstanding"],

  inventory: ["inventory.items", "inventory.consumption", "inventory.stockMovement", "inventory.lossWastage"],
  transactions: ["transactions.overview", "transactions.sales", "transactions.purchases", "transactions.expenses"],
  accounts: ["accounts.ledger", "accounts.dayBook", "accounts.payments", "accounts.accounts"],
  people: ["people.customers", "people.suppliers", "people.workers", "people.users"],

  // Older seed used these broad ids.
  orders: ["transactions.sales"],
  purchases: ["transactions.purchases"],
  expenses: ["transactions.expenses"],
  ledger: ["accounts.ledger"],
  daybook: ["accounts.dayBook"],
  payments: ["accounts.payments"],
  alerts: ["alerts"],
  settings: ["settings"],
  users: ["people.users"],
};

export function normalizePermissions(raw: string[] | undefined | null): Set<PermissionId> {
  const out = new Set<PermissionId>();
  for (const p of raw ?? []) {
    const trimmed = String(p ?? "").trim();
    if (!trimmed) continue;
    if (trimmed === "*") {
      out.add("*");
      continue;
    }
    // Exact new permission
    if (KNOWN_PERMISSIONS.has(trimmed)) out.add(trimmed as PermissionId);
    // Legacy group permission
    const expanded = LEGACY_EXPANSIONS[trimmed];
    if (expanded) for (const e of expanded) out.add(e);
    // If stored as new id, keep it anyway.
    if (trimmed.includes(".")) out.add(trimmed as PermissionId);
  }
  return out;
}

export function canAccessPath(perms: Set<PermissionId>, pathname: string) {
  if (perms.has("*")) return true;

  const required = requiredPermissionsForPath(pathname);
  if (required.length === 0) return true;
  return required.some((p) => perms.has(p));
}

export function requiredPermissionsForPath(pathname: string): PermissionId[] {
  const p = (pathname || "/").split("?")[0].split("#")[0];

  if (p === "/") return ["dashboard"];
  if (p.startsWith("/reports")) return ["reports"];
  if (p.startsWith("/outstanding")) return ["outstanding"];
  if (p.startsWith("/inventory")) return ["inventory.items"];
  if (p.startsWith("/consumption")) return ["inventory.consumption"];
  if (p.startsWith("/stock-movement")) return ["inventory.stockMovement"];
  if (p.startsWith("/loss-wastage")) return ["inventory.lossWastage"];

  if (p.startsWith("/transactions")) return ["transactions.overview"];
  if (p.startsWith("/orders")) return ["transactions.sales"];
  if (p.startsWith("/purchases")) return ["transactions.purchases"];
  if (p.startsWith("/expenses")) return ["transactions.expenses"];

  if (p.startsWith("/ledger")) return ["accounts.ledger"];
  if (p.startsWith("/daybook")) return ["accounts.dayBook"];
  if (p.startsWith("/payments")) return ["accounts.payments"];
  if (p.startsWith("/accounts")) return ["accounts.accounts"];

  if (p.startsWith("/customers")) return ["people.customers"];
  if (p.startsWith("/suppliers")) return ["people.suppliers"];
  if (p.startsWith("/workers")) return ["people.workers"];
  if (p.startsWith("/users")) return ["people.users"];

  if (p.startsWith("/alerts")) return ["alerts"];
  if (p.startsWith("/settings")) return ["settings"];

  // Unknown pages default to allow (avoid breaking new routes).
  return [];
}

export function pickDefaultRoute(perms: Set<PermissionId>): string {
  if (perms.has("*") || perms.has("dashboard")) return "/";
  if (perms.has("transactions.sales")) return "/orders";
  if (perms.has("inventory.items")) return "/inventory";
  if (perms.has("accounts.ledger")) return "/ledger";
  if (perms.has("reports")) return "/reports";
  if (perms.has("settings")) return "/settings";
  return "/";
}

