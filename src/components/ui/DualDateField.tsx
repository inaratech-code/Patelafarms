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
  /** Default picker calendar when no saved preference */
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
    try {
      onChange(bsPartsToAdYmd({ year, monthIndex, day }));
    } catch {
      /* invalid BS date */
    }
  };

  const bsYmd = adYmdToBsYmd(adValue);

  return (
    <div className={className ?? "space-y-3"}>
      <div>
        <span className="block text-xs font-medium text-slate-600 mb-1.5">Choose calendar to enter date</span>
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
          <button
            type="button"
            disabled={disabled}
            onClick={() => switchMode("AD")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              mode === "AD" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            English (AD)
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => switchMode("BS")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              mode === "BS" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Nepali (BS)
          </button>
        </div>
      </div>

      {mode === "AD" ? (
        <div>
          <label htmlFor={`${fieldId}-ad`} className="block text-sm font-medium text-slate-700 mb-1">
            Date (AD)
          </label>
          <input
            id={`${fieldId}-ad`}
            type="date"
            required={required}
            disabled={disabled}
            value={adValue}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-3 py-2 border rounded-md bg-white"
          />
        </div>
      ) : (
        <div>
          <span className="block text-sm font-medium text-slate-700 mb-1">Date (BS)</span>
          <div className="grid grid-cols-3 gap-2">
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
              className="px-2 py-2 border rounded-md bg-white text-sm"
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
              className="px-2 py-2 border rounded-md bg-white text-sm"
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
              className="px-2 py-2 border rounded-md bg-white text-sm"
              aria-label="BS day"
            />
          </div>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">{bsYmd}</p>
        </div>
      )}

      <div className="rounded-md bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-600">
        <span className="font-medium text-slate-700">Both calendars: </span>
        AD {formatAdDate(adValue)} · BS {formatBsDate(adValue, bsYmd)}
      </div>
    </div>
  );
}
