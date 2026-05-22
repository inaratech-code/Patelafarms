import type { DayBookEntry } from "@/lib/db";

export const DEFAULT_EXPENSE_CATEGORIES = ["Transport", "Wage", "Other"] as const;

/** Categories reserved for other day-book flows (not manual expense form). */
const RESERVED_CATEGORIES = new Set(["Sale", "Purchase", "Vaccine", "Farm health", "Feed", "Loss"]);

const STORAGE_KEY = "pf.expenseCategories.v1";

function normalizeCategory(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

function readStoredCustom(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { custom?: string[] };
    if (!Array.isArray(parsed.custom)) return [];
    return parsed.custom.map(normalizeCategory).filter(Boolean);
  } catch {
    return [];
  }
}

function writeStoredCustom(custom: string[]) {
  if (typeof window === "undefined") return;
  const unique = [...new Set(custom.map(normalizeCategory).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ custom: unique }));
}

/** Persist a user-typed category for future expense forms. */
export function rememberExpenseCategory(raw: string) {
  const name = normalizeCategory(raw);
  if (!name) return;
  if (RESERVED_CATEGORIES.has(name)) return;
  const stored = readStoredCustom();
  if (DEFAULT_EXPENSE_CATEGORIES.includes(name as (typeof DEFAULT_EXPENSE_CATEGORIES)[number])) return;
  if (stored.includes(name)) return;
  writeStoredCustom([...stored, name]);
}

/** Options for category datalist: defaults, saved custom, and categories seen on expenses. */
export function buildExpenseCategoryOptions(expenseEntries: DayBookEntry[]): string[] {
  const names = new Set<string>(DEFAULT_EXPENSE_CATEGORIES);

  for (const c of readStoredCustom()) {
    if (!RESERVED_CATEGORIES.has(c)) names.add(c);
  }

  for (const e of expenseEntries) {
    const c = normalizeCategory(e.category ?? "");
    if (!c || RESERVED_CATEGORIES.has(c)) continue;
    names.add(c);
  }

  return Array.from(names).sort((a, b) => {
    const aDefault = DEFAULT_EXPENSE_CATEGORIES.includes(a as (typeof DEFAULT_EXPENSE_CATEGORIES)[number]);
    const bDefault = DEFAULT_EXPENSE_CATEGORIES.includes(b as (typeof DEFAULT_EXPENSE_CATEGORIES)[number]);
    if (aDefault && !bDefault) return -1;
    if (!aDefault && bDefault) return 1;
    return a.localeCompare(b);
  });
}
