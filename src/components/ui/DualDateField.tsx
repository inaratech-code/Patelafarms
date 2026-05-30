"use client";

import { useEffect, useId, useState } from "react";
import {
  type DateInputCalendar,
  NEPALI_MONTHS,
  adYmdToBsParts,
  adYmdToBsYmd,
  coerceBsPartsToAdYmd,
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
  const adValue = value || todayAdYmd();

  const [mode, setMode] = useState<DateInputCalendar>(defaultMode);
  const [bsYear, setBsYear] = useState(() => adYmdToBsParts(adValue).year);
  const [bsMonthIndex, setBsMonthIndex] = useState(() => adYmdToBsParts(adValue).monthIndex);
  const [bsDay, setBsDay] = useState(() => adYmdToBsParts(adValue).day);

  useEffect(() => {
    setMode(getStoredDateInputMode());
  }, []);

  useEffect(() => {
    const parts = adYmdToBsParts(adValue);
    queueMicrotask(() => {
      setBsYear(parts.year);
      setBsMonthIndex(parts.monthIndex);
      setBsDay(parts.day);
    });
  }, [adValue]);

  const switchMode = (next: DateInputCalendar) => {
    setMode(next);
    setStoredDateInputMode(next);
  };

  const applyBs = (year: number, monthIndex: number, day: number) => {
    const resolved = coerceBsPartsToAdYmd({ year, monthIndex, day });
    if (!resolved) return;
    setBsYear(resolved.parts.year);
    setBsMonthIndex(resolved.parts.monthIndex);
    setBsDay(resolved.parts.day);
    onChange(resolved.adYmd);
  };

  const bsYmd = adYmdToBsYmd(adValue);

  return (
    <div className={className}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
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
            value={adValue}
            onChange={(e) => onChange(e.target.value)}
            className="min-w-0 flex-1 sm:flex-none sm:w-[11.5rem] px-2.5 py-1.5 border rounded-md bg-white text-sm"
            aria-label="Date (English AD)"
          />
        ) : (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 sm:flex-none">
            <input
              type="number"
              min={2000}
              max={2100}
              disabled={disabled}
              required={required}
              value={bsYear}
              onChange={(e) => {
                const y = Number(e.target.value);
                if (!Number.isFinite(y)) return;
                applyBs(y, bsMonthIndex, bsDay);
              }}
              className="w-[4.25rem] shrink-0 px-2 py-1.5 border rounded-md bg-white text-sm tabular-nums"
              aria-label="BS year"
            />
            <select
              disabled={disabled}
              required={required}
              value={bsMonthIndex}
              onChange={(e) => {
                const mi = Number(e.target.value);
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
              required={required}
              value={bsDay}
              onChange={(e) => {
                const d = Number(e.target.value);
                if (!Number.isFinite(d)) return;
                applyBs(bsYear, bsMonthIndex, d);
              }}
              className="w-12 shrink-0 px-2 py-1.5 border rounded-md bg-white text-sm tabular-nums"
              aria-label="BS day"
            />
          </div>
        )}
      </div>

      <p className="mt-1 text-xs text-slate-500">
        AD {formatAdDate(adValue)} · BS {formatBsDate(adValue, bsYmd)}
      </p>
    </div>
  );
}
