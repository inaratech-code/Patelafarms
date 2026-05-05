"use client";

import { motion } from "framer-motion";
import { CalendarDays, CloudSun, Wifi, WifiOff } from "lucide-react";
import NepaliDate from "nepali-date-converter";
import { useEffect, useMemo, useState } from "react";

function formatLongDate(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "2-digit" });
}

const NEPALI_MONTHS_EN = [
  "Baisakh",
  "Jestha",
  "Ashadh",
  "Shrawan",
  "Bhadra",
  "Ashwin",
  "Kartik",
  "Mangsir",
  "Poush",
  "Magh",
  "Falgun",
  "Chaitra",
] as const;

function formatNepaliDateBS(d: Date) {
  const bs = new NepaliDate(d);
  const y = bs.getYear();
  const m = bs.getMonth(); // 0-based
  const day = bs.getDate();
  const monthLabel = NEPALI_MONTHS_EN[m] ?? `M${m + 1}`;
  return `${y} ${monthLabel} ${String(day).padStart(2, "0")}`;
}

function weatherLabelFromCode(code: number) {
  // Open-Meteo weather codes: https://open-meteo.com/en/docs
  if (code === 0) return "Clear";
  if (code === 1) return "Mainly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code === 51 || code === 53 || code === 55) return "Drizzle";
  if (code === 56 || code === 57) return "Freezing drizzle";
  if (code === 61 || code === 63 || code === 65) return "Rain";
  if (code === 66 || code === 67) return "Freezing rain";
  if (code === 71 || code === 73 || code === 75) return "Snow";
  if (code === 77) return "Snow grains";
  if (code === 80 || code === 81 || code === 82) return "Rain showers";
  if (code === 85 || code === 86) return "Snow showers";
  if (code === 95) return "Thunderstorm";
  if (code === 96 || code === 99) return "Thunderstorm w/ hail";
  return "Weather";
}

export function HeroSection(props: { isOnline: boolean }) {
  const [isMounted, setIsMounted] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);

  useEffect(() => {
    setIsMounted(true);
    setNow(new Date());
    setIsOnline(navigator.onLine);
  }, []);

  const greeting = useMemo(() => {
    if (!now) return "Namaste";
    const hour = now.getHours();
    return hour < 12 ? "Good Morning ☀" : hour < 18 ? "Good Afternoon 🌤" : "Good Evening 🌙";
  }, [now]);

  const [weather, setWeather] = useState<{ tempC: number; code: number; fetchedAt: number } | null>(null);
  const weatherText = useMemo(() => {
    if (!weather) return null;
    const label = weatherLabelFromCode(weather.code);
    const temp = Math.round(weather.tempC);
    return `${temp}°C • ${label}`;
  }, [weather]);

  useEffect(() => {
    const storageKey = "pf.weather.dhangadhi.v1";
    const maxAgeMs = 30 * 60 * 1000; // 30 minutes

    const cachedRaw = localStorage.getItem(storageKey);
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw) as { tempC: number; code: number; fetchedAt: number };
        if (cached && typeof cached.fetchedAt === "number") setWeather(cached);
      } catch {
        // ignore
      }
    }

    const cachedFresh = (() => {
      if (!cachedRaw) return false;
      try {
        const cached = JSON.parse(cachedRaw) as { fetchedAt: number };
        return typeof cached?.fetchedAt === "number" && Date.now() - cached.fetchedAt < maxAgeMs;
      } catch {
        return false;
      }
    })();

    // If offline or cache is fresh, don't fetch.
    if (!navigator.onLine || cachedFresh) return;

    let cancelled = false;
    (async () => {
      try {
        // Dhangadhi, Nepal (approx)
        const latitude = 28.705;
        const longitude = 80.593;
        const url =
          `https://api.open-meteo.com/v1/forecast` +
          `?latitude=${latitude}&longitude=${longitude}` +
          `&current=temperature_2m,weather_code` +
          `&timezone=Asia%2FKathmandu`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`Weather HTTP ${res.status}`);
        const data = (await res.json()) as any;
        const tempC = Number(data?.current?.temperature_2m);
        const code = Number(data?.current?.weather_code);
        if (!Number.isFinite(tempC) || !Number.isFinite(code)) return;

        const next = { tempC, code, fetchedAt: Date.now() };
        if (cancelled) return;
        setWeather(next);
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // ignore network errors; keep cached (if any)
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const weatherFallbackText = useMemo(() => {
    if (!isMounted) return "-- °C • Loading...";
    if (isOnline === false) return "-- °C • Offline";
    return "-- °C • Loading...";
  }, [isMounted, isOnline]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="relative overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-sm"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-[#0871b3]/10 via-white to-[#80a932]/10" />
      <div className="absolute inset-0 backdrop-blur-[1px]" />

      <div className="relative p-4 sm:p-5 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 lg:gap-5">
        <div className="space-y-1.5 min-w-0 flex-1">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-[#0871b3] border border-[#e2e8f0]">
            <span className="w-1 h-1 rounded-full bg-[#0871b3]" />
            {greeting}
          </div>

          <div>
            <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-[#0f172a] leading-snug">
              Namaste 👋 Welcome back, <span className="text-[#0871b3]">Patela Farm</span>
            </h1>
            <p className="mt-0.5 text-xs sm:text-sm text-[#64748b] leading-snug">
              Today&apos;s overview and stock activity.
            </p>
          </div>

          <div className="text-xs text-[#64748b]">
            <span className="font-medium text-[#0f172a]">Location:</span> Dhangadhi, Nepal
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full lg:max-w-md lg:shrink-0">
          <div className="rounded-xl border border-[#e2e8f0] bg-white/80 p-2.5 sm:p-3">
            <div className="flex items-center gap-1 text-[10px] sm:text-xs font-semibold text-[#64748b]">
              <CalendarDays className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              Today
            </div>
            <div className="mt-1 text-[11px] sm:text-xs font-semibold text-[#0f172a] leading-tight" suppressHydrationWarning>
              {now ? formatLongDate(now) : "--"}
            </div>
            <div className="mt-0.5 text-[10px] font-medium text-[#64748b] leading-tight" suppressHydrationWarning>
              {now ? `${formatNepaliDateBS(now)} (BS)` : "--"}
            </div>
          </div>

          <div className="rounded-xl border border-[#e2e8f0] bg-white/80 p-2.5 sm:p-3">
            <div className="flex items-center gap-1 text-[10px] sm:text-xs font-semibold text-[#64748b]">
              <CloudSun className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              Weather
            </div>
            <div className="mt-1 text-[11px] sm:text-xs font-semibold text-[#0f172a] leading-tight break-words">
              {weatherText ?? weatherFallbackText}
            </div>
          </div>

          <div className="rounded-xl border border-[#e2e8f0] bg-white/80 p-2.5 sm:p-3">
            <div className="flex items-center gap-1 text-[10px] sm:text-xs font-semibold text-[#64748b]">
              {props.isOnline ? <Wifi className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" /> : <WifiOff className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />}
              Sync
            </div>
            <div className="mt-1">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] sm:text-xs font-semibold border ${
                  props.isOnline
                    ? "bg-[#80a932]/10 text-[#80a932] border-[#80a932]/25"
                    : "bg-amber-500/10 text-amber-700 border-amber-500/25"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${props.isOnline ? "bg-[#80a932]" : "bg-amber-500"}`} />
                {props.isOnline ? "Online" : "Offline"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

