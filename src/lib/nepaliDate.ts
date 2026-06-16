import NepaliDate, { dateConfigMap } from "nepali-date-converter";

export type DateInputCalendar = "AD" | "BS";

const INPUT_MODE_KEY = "patela-date-input-mode";

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

export function getStoredDateInputMode(): DateInputCalendar {
  if (typeof window === "undefined") return "AD";
  const v = localStorage.getItem(INPUT_MODE_KEY);
  return v === "BS" ? "BS" : "AD";
}

export function setStoredDateInputMode(mode: DateInputCalendar) {
  if (typeof window === "undefined") return;
  localStorage.setItem(INPUT_MODE_KEY, mode);
}

export function adYmdFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayAdYmd(): string {
  return adYmdFromDate(new Date());
}

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

export function getBsMonthDays(year: number, monthIndex: number): number | null {
  const monthName = NEPALI_MONTHS[monthIndex];
  if (!monthName) return null;
  return dateConfigMap[String(year)]?.[monthName] ?? null;
}

export function isValidBsParts(parts: BsDateParts): boolean {
  if (!Number.isInteger(parts.year) || !Number.isInteger(parts.monthIndex) || !Number.isInteger(parts.day)) return false;
  const daysInMonth = getBsMonthDays(parts.year, parts.monthIndex);
  return daysInMonth != null && parts.day >= 1 && parts.day <= daysInMonth;
}

export function bsPartsToAdYmd(parts: BsDateParts): string {
  if (!isValidBsParts(parts)) throw new Error("Invalid BS date");
  const nd = new NepaliDate(parts.year, parts.monthIndex, parts.day);
  return adYmdFromDate(nd.toJsDate());
}

export function isoToBsYmd(iso: string): string {
  return adYmdToBsYmd(isoToAdYmd(iso));
}

/** Canonical AD ISO + parallel BS for `date` fields. */
export function datePairFromAdYmd(adYmd: string): { date: string; dateBs: string } {
  const ymd = adYmd.trim();
  return { date: toIsoFromDateOnly(ymd), dateBs: adYmdToBsYmd(ymd) };
}

/** Same as datePairFromAdYmd but accepts ISO or YYYY-MM-DD. */
export function datePairFromIso(isoOrAd: string): { date: string; dateBs: string } {
  return datePairFromAdYmd(isoToAdYmd(isoOrAd));
}

export function timePairFromAdYmd(adYmd: string): { time: string; timeBs: string } {
  const p = datePairFromAdYmd(adYmd);
  return { time: p.date, timeBs: p.dateBs };
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

export function formatDualDate(isoOrAd?: string, dateBs?: string): string {
  if (!isoOrAd && !dateBs) return "—";
  return `${formatAdDate(isoOrAd ?? (dateBs ? bsYmdToAdYmd(dateBs) : ""))} · ${formatBsDate(isoOrAd, dateBs)} BS`;
}

export function bsYmdFromStored(isoOrAd?: string, existingBs?: string): string | undefined {
  if (existingBs?.trim()) return existingBs.trim();
  if (!isoOrAd?.trim()) return undefined;
  try {
    return isoToBsYmd(isoOrAd);
  } catch {
    return undefined;
  }
}
