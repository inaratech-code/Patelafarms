import NepaliDate from "nepali-date-converter";
import { db } from "@/lib/db";
import {
  ensureSupplierLedgerAccount,
  postLedgerEntryWithSync,
  recomputeLedgerBalances,
} from "@/lib/ledger";
import { adYmdFromDate, toIsoFromDateOnly } from "@/lib/nepaliDate";

/** Supplier ledger account for Raj Agro Trade & Suppliers. */
export const RAJ_AGRO_SUPPLIER_NAME = "Raj Agro Trade & Suppliers";

type ImportRow = {
  /** BS `YY/M/D` or AD `YYYY-MM-DD` */
  date: string;
  description: string;
  debit?: number;
  credit?: number;
};

/** Handwritten ledger (page 36) — bills = credit (payable), payments = debit. */
export const RAJ_AGRO_LEDGER_ROW_COUNT = 16;

const RAJ_AGRO_LEDGER_ROWS: ImportRow[] = [
  { date: "081/5/31", description: "Opening balance (पुरानो रकम)", credit: 20_300 },
  { date: "082/2/12", description: "Bill No - 2420", credit: 19_250 },
  { date: "082/3/26", description: "Bill No - 1758", credit: 33_000 },
  { date: "082/5/3", description: "Bill No - 119", credit: 34_500 },
  { date: "082/5/14", description: "Bill No - 262", credit: 17_000 },
  { date: "082/6/1", description: "Bill No - 280", credit: 54_000 },
  { date: "082/6/24", description: "Bill No - 430", credit: 17_000 },
  { date: "2025-10-16", description: "Laxmi Sunris", debit: 100_000 },
  { date: "082/7/15", description: "Bill No - 479", credit: 72_000 },
  { date: "082/8/3", description: "Bill No - 568", credit: 72_000 },
  { date: "082/9/15", description: "Taximar - 660", credit: 3_000 },
  { date: "082/10/6", description: "Bill No - 796", credit: 18_000 },
  { date: "082/11/17", description: "Bill No - 807", credit: 36_000 },
  { date: "082/12/30", description: "Bill No - 861", credit: 66_000 },
  { date: "083/1/18", description: "Cash", debit: 100_000 },
  { date: "083/1/18", description: "Bill No - 890", credit: 99_000 },
];

/** `082/2/12` → ISO (AD midday). */
export function ledgerBsSlashToIso(bsSlash: string): string {
  const parts = bsSlash.split("/").map((p) => parseInt(p.trim(), 10));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error(`Invalid BS date: ${bsSlash}`);
  }
  const [yy, mm, dd] = parts;
  const year = yy >= 1000 ? yy : yy >= 100 ? 2000 + (yy % 100) : 2000 + yy;
  const monthIndex = mm - 1;
  const nd = new NepaliDate(year, monthIndex, dd);
  return toIsoFromDateOnly(adYmdFromDate(nd.toJsDate()));
}

function rowToIso(date: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return toIsoFromDateOnly(date);
  return ledgerBsSlashToIso(date);
}

export async function importRajAgroTradeSupplierLedger(options?: { replaceExisting?: boolean }) {
  const replaceExisting = options?.replaceExisting ?? true;
  const accountId = await ensureSupplierLedgerAccount(RAJ_AGRO_SUPPLIER_NAME);
  const acct = await db.ledgerAccounts.get(accountId);

  const existing = await db.ledgerEntries.where("accountId").equals(accountId).toArray();

  let removed = 0;
  let created = 0;

  await db.transaction("rw", db.tables, async () => {
    if (replaceExisting && existing.length > 0) {
      await db.ledgerEntries.where("accountId").equals(accountId).delete();
      removed = existing.length;
    } else if (existing.length > 0) {
      throw new Error(
        "This supplier already has ledger entries. Open the ledger and use Replace import, or clear entries first."
      );
    }

    for (const row of RAJ_AGRO_LEDGER_ROWS) {
      const iso = rowToIso(row.date);
      await postLedgerEntryWithSync({
        accountId,
        date: iso,
        description: row.description,
        debit: row.debit ?? 0,
        credit: row.credit ?? 0,
      });
      created += 1;
    }

    await recomputeLedgerBalances(accountId);
  });

  const entries = await db.ledgerEntries.where("accountId").equals(accountId).toArray();
  const sorted = entries.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const closing = sorted.length ? sorted[sorted.length - 1].balance : 0;

  return {
    accountId,
    accountName: acct?.name ?? RAJ_AGRO_SUPPLIER_NAME,
    removed,
    created,
    closingBalance: closing,
  };
}
