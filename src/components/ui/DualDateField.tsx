"use client";

import { useEffect, useId, useState } from "react";
import {
  NEPALI_MONTHS,
  adYmdToBsParts,
  adYmdToBsYmd,
  bsPartsToAdYmd,
  todayAdYmd,
} from "@/lib/nepaliDate";

type Props = {
  id?: string;
  /** AD date YYYY-MM-DD */
  value: string;
  onChange: (adYmd: string) => void;
  className?: string;
  disabled?: boolean;
  required?: boolean;
};

export function DualDateField({ id, value, onChange, className, disabled, required }: Props) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const adValue = value || todayAdYmd();

  const [bsYear, setBsYear] = useState(() => adYmdToBsParts(adValue).year);
  const [bsMonthIndex, setBsMonthIndex] = useState(() => adYmdToBsParts(adValue).monthIndex);
  const [bsDay, setBsDay] = useState(() => adYmdToBsParts(adValue).day);

  useEffect(() => {
    const parts = adYmdToBsParts(adValue);
    queueMicrotask(() => {
      setBsYear(parts.year);
      setBsMonthIndex(parts.monthIndex);
      setBsDay(parts.day);
    });
  }, [adValue]);

  const applyBs = (year: number, monthIndex: number, day: number) => {
    try {
      onChange(bsPartsToAdYmd({ year, monthIndex, day }));
    } catch {
      /* invalid BS combo — keep previous AD */
    }
  };

  const bsPreview = adYmdToBsYmd(adValue);

  return (
    <div className={className ?? "space-y-2"}>
      <div>
        <label htmlFor={`${fieldId}-ad`} className="block text-xs font-medium text-slate-600 mb-1">
          English date (AD)
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
      <div>
        <span className="block text-xs font-medium text-slate-600 mb-1">Nepali date (BS)</span>
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
        <p className="mt-1 text-xs text-slate-500">BS: {bsPreview}</p>
      </div>
    </div>
  );
}
