import NepaliDate from "nepali-date-converter";

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
  const ymd = isoToAdYmd(adYmd.trim());
  if (!ymd) return "";
  try {
    const nd = new NepaliDate(new Date(`${ymd}T12:00:00`));
    const y = nd.getYear();
    const m = String(nd.getMonth() + 1).padStart(2, "0");
    const d = String(nd.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  } catch {
    return "";
  }
}

export function bsYmdToAdYmd(bsYmd: string): string {
  if (!bsYmd?.trim()) return "";
  try {
    const nd = new NepaliDate(bsYmd);
    return adYmdFromDate(nd.toJsDate());
  } catch {
    return "";
  }
}

export function adYmdToBsParts(adYmd: string): BsDateParts {
  const ymd = isoToAdYmd(adYmd.trim()) || todayAdYmd();
  try {
    const nd = new NepaliDate(new Date(`${ymd}T12:00:00`));
    return { year: nd.getYear(), monthIndex: nd.getMonth(), day: nd.getDate() };
  } catch {
    const fallback = todayAdYmd();
    const nd = new NepaliDate(new Date(`${fallback}T12:00:00`));
    return { year: nd.getYear(), monthIndex: nd.getMonth(), day: nd.getDate() };
  }
}

export function bsPartsToAdYmd(parts: BsDateParts): string {
  try {
    const nd = new NepaliDate(parts.year, parts.monthIndex, parts.day);
    return adYmdFromDate(nd.toJsDate());
  } catch {
    return todayAdYmd();
  }
}

export function isoToBsYmd(iso: string): string {
  return adYmdToBsYmd(isoToAdYmd(iso));
}

/** Canonical AD ISO + parallel BS for `date` fields. */
export function datePairFromAdYmd(adYmd: string): { date: string; dateBs: string } {
  const ymd = isoToAdYmd(adYmd.trim());
  if (!ymd) throw new Error("Invalid date");
  const dateBs = adYmdToBsYmd(ymd);
  if (!dateBs) throw new Error("Invalid date");
  return { date: toIsoFromDateOnly(ymd), dateBs };
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
  let bs = dateBs?.trim() ?? "";
  if (!bs && isoOrAd) {
    try {
      bs = adYmdToBsYmd(isoToAdYmd(isoOrAd));
    } catch {
      bs = "";
    }
  }
  if (!bs) return "—";
  try {
    return new NepaliDate(bs).format("DD MMMM YYYY", "en");
  } catch {
    return bs;
  }
}

export function formatDualDate(isoOrAd?: string, dateBs?: string): string {
  if (!isoOrAd && !dateBs) return "—";
  const adFallback = dateBs ? bsYmdToAdYmd(dateBs) : "";
  return `${formatAdDate(isoOrAd ?? adFallback)} · ${formatBsDate(isoOrAd, dateBs)} BS`;
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
