"use client";

import { useEffect, useId, useState } from "react";
import {
  type DateInputCalendar,
  NEPALI_MONTHS,
  adYmdToBsParts,
  adYmdToBsYmd,
  bsPartsToAdYmd,
  formatAdDate,
  formatBsDate,
  getStoredDateInputMode,
  setStoredDateInputMode,
  todayAdYmd,
} from "@/lib/nepaliDate";

type Props = {
  id?: string;
  /** Canonical value: AD YYYY-MM-DD */
  value: string;
  onChange: (adYmd: string) => void;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  defaultMode?: DateInputCalendar;
};

export function DualDateField({
  id,
  value,
  onChange,
  className,
  disabled,
  required,
  defaultMode = "AD",
}: Props) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const fallbackAdValue = value || todayAdYmd();

  const [mode, setMode] = useState<DateInputCalendar>(defaultMode);
  const [bsYear, setBsYear] = useState(() => adYmdToBsParts(fallbackAdValue).year);
  const [bsMonthIndex, setBsMonthIndex] = useState(() => adYmdToBsParts(fallbackAdValue).monthIndex);
  const [bsDay, setBsDay] = useState(() => adYmdToBsParts(fallbackAdValue).day);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setMode(getStoredDateInputMode());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const parts = adYmdToBsParts(fallbackAdValue);
    queueMicrotask(() => {
      setBsYear(parts.year);
      setBsMonthIndex(parts.monthIndex);
      setBsDay(parts.day);
    });
  }, [fallbackAdValue]);

  const resetBsParts = () => {
    const parts = adYmdToBsParts(fallbackAdValue);
    setBsYear(parts.year);
    setBsMonthIndex(parts.monthIndex);
    setBsDay(parts.day);
  };

  const switchMode = (next: DateInputCalendar) => {
    if (next === "BS" && !value) onChange(fallbackAdValue);
    setMode(next);
    setStoredDateInputMode(next);
  };

  const applyBs = (year: number, monthIndex: number, day: number) => {
    try {
      onChange(bsPartsToAdYmd({ year, monthIndex, day }));
      return true;
    } catch {
      resetBsParts();
      return false;
    }
  };

  const bsYmd = value ? adYmdToBsYmd(value) : "";

  return (
    <div className={`min-w-0 max-w-full ${className ?? ""}`.trim()}>
      <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
        <div
          className="inline-flex shrink-0 rounded-md border border-slate-200 p-0.5 bg-slate-50"
          role="group"
          aria-label="Calendar type"
        >
          <button
            type="button"
            disabled={disabled}
            onClick={() => switchMode("AD")}
            className={`px-2.5 py-1.5 text-xs font-semibold rounded transition-colors ${
              mode === "AD" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            AD
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => switchMode("BS")}
            className={`px-2.5 py-1.5 text-xs font-semibold rounded transition-colors ${
              mode === "BS" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            BS
          </button>
        </div>

        {mode === "AD" ? (
          <input
            id={`${fieldId}-ad`}
            type="date"
            required={required}
            disabled={disabled}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="min-w-0 flex-1 sm:flex-none sm:w-[11.5rem] px-2.5 py-1.5 border rounded-md bg-white text-sm"
            aria-label="Date (English AD)"
          />
        ) : (
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5">
            <input
              type="number"
              min={2000}
              max={2100}
              disabled={disabled}
              value={bsYear}
              onChange={(e) => {
                const y = Number(e.target.value);
                if (!Number.isFinite(y)) return;
                setBsYear(y);
                applyBs(y, bsMonthIndex, bsDay);
              }}
              className="w-[4.25rem] shrink-0 px-2 py-1.5 border rounded-md bg-white text-sm tabular-nums"
              aria-label="BS year"
            />
            <select
              disabled={disabled}
              value={bsMonthIndex}
              onChange={(e) => {
                const mi = Number(e.target.value);
                setBsMonthIndex(mi);
                applyBs(bsYear, mi, bsDay);
              }}
              className="min-w-0 flex-1 sm:w-[6.5rem] px-2 py-1.5 border rounded-md bg-white text-sm"
              aria-label="BS month"
            >
              {NEPALI_MONTHS.map((name, i) => (
                <option key={name} value={i}>
                  {name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              max={32}
              disabled={disabled}
              value={bsDay}
              onChange={(e) => {
                const d = Number(e.target.value);
                if (!Number.isFinite(d)) return;
                setBsDay(d);
                applyBs(bsYear, bsMonthIndex, d);
              }}
              className="w-12 shrink-0 px-2 py-1.5 border rounded-md bg-white text-sm tabular-nums"
              aria-label="BS day"
            />
          </div>
        )}
      </div>

      <p className="mt-1 text-xs text-slate-500">
        AD {formatAdDate(value)} · BS {formatBsDate(value, bsYmd)}
      </p>
    </div>
  );
}
