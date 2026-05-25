import NepaliDate from "nepali-date-converter";

/** Bikram Sambat month names (index 0 = Baisakh). */
export const NEPALI_MONTHS = [
  "Baisakh",
  "Jestha",
  "Asar",
  "Shrawan",
  "Bhadra",
  "Aswin",
  "Kartik",
  "Mangsir",
  "Poush",
  "Magh",
  "Falgun",
  "Chaitra",
] as const;

export type BsDateParts = { year: number; monthIndex: number; day: number };

/** AD calendar YYYY-MM-DD in local timezone. */
export function adYmdFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayAdYmd(): string {
  return adYmdFromDate(new Date());
}

/** Stable midday ISO from AD date-only string (avoids timezone day shifts). */
export function toIsoFromDateOnly(dateYYYYMMDD: string): string {
  return new Date(`${dateYYYYMMDD}T12:00:00`).toISOString();
}

export function isoToAdYmd(iso: string): string {
  if (!iso) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return iso.slice(0, 10);
}

export function adYmdToBsYmd(adYmd: string): string {
  if (!adYmd) return "";
  const nd = new NepaliDate(new Date(`${adYmd}T12:00:00`));
  const y = nd.getYear();
  const m = String(nd.getMonth() + 1).padStart(2, "0");
  const d = String(nd.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function bsYmdToAdYmd(bsYmd: string): string {
  const nd = new NepaliDate(bsYmd);
  return adYmdFromDate(nd.toJsDate());
}

export function adYmdToBsParts(adYmd: string): BsDateParts {
  const nd = new NepaliDate(new Date(`${adYmd}T12:00:00`));
  return { year: nd.getYear(), monthIndex: nd.getMonth(), day: nd.getDate() };
}

export function bsPartsToAdYmd(parts: BsDateParts): string {
  const nd = new NepaliDate(parts.year, parts.monthIndex, parts.day);
  return adYmdFromDate(nd.toJsDate());
}

export function isoToBsYmd(iso: string): string {
  return adYmdToBsYmd(isoToAdYmd(iso));
}

/** English (AD) + Nepali (BS) pair for domain `date` fields. */
export function datePairFromAdYmd(adYmd: string): { date: string; dateBs: string } {
  const ymd = adYmd.trim();
  return { date: toIsoFromDateOnly(ymd), dateBs: adYmdToBsYmd(ymd) };
}

export function datePairFromIso(iso: string): { date: string; dateBs: string } {
  const ad = isoToAdYmd(iso);
  const date = iso.includes("T") ? iso : toIsoFromDateOnly(ad);
  return { date, dateBs: adYmdToBsYmd(ad) };
}

/** Day book `time` + parallel BS calendar date. */
export function timePairFromAdYmd(adYmd: string): { time: string; timeBs: string } {
  const { date, dateBs } = datePairFromAdYmd(adYmd);
  return { time: date, timeBs: dateBs };
}

export function formatAdDate(isoOrAd?: string): string {
  const ad = isoOrAd ? isoToAdYmd(isoOrAd) : "";
  if (!ad) return "—";
  return new Date(`${ad}T12:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatBsDate(isoOrAd?: string, dateBs?: string): string {
  const bs =
    dateBs?.trim() ||
    (isoOrAd ? adYmdToBsYmd(isoToAdYmd(isoOrAd)) : "");
  if (!bs) return "—";
  try {
    return new NepaliDate(bs).format("DD MMMM YYYY", "en");
  } catch {
    return bs;
  }
}

/** e.g. `25 May 2026 (08 Jestha 2083 BS)` */
export function formatDualDate(isoOrAd?: string, dateBs?: string): string {
  if (!isoOrAd && !dateBs) return "—";
  const ad = formatAdDate(isoOrAd ?? (dateBs ? bsYmdToAdYmd(dateBs) : ""));
  const bs = formatBsDate(isoOrAd, dateBs);
  return `${ad} (${bs} BS)`;
}

/** Backfill BS field from AD / ISO value (idempotent). */
export function bsYmdFromStored(isoOrAd?: string, existingBs?: string): string | undefined {
  if (existingBs?.trim()) return existingBs.trim();
  if (!isoOrAd?.trim()) return undefined;
  try {
    return isoToBsYmd(isoOrAd);
  } catch {
    return undefined;
  }
}
