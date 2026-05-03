"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

const Sparkline = dynamic(() => import("./_Sparkline").then((m) => m.Sparkline), { ssr: false });

function DeltaText(props: { deltaPct: number }) {
  if (!Number.isFinite(props.deltaPct) || Math.abs(props.deltaPct) < 0.5) return null;
  const up = props.deltaPct >= 0;
  const value = Math.abs(props.deltaPct).toFixed(0);
  return (
    <div className={cn("text-[10px] sm:text-xs font-semibold", up ? "text-[#80a932]" : "text-rose-600")}>
      {up ? "+" : "-"}
      {value}% from yesterday
    </div>
  );
}

export type StatCard = {
  id: string;
  title: string;
  value: string;
  deltaPct: number;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string; // tailwind class
  iconFg: string; // tailwind class
  /** Omit or leave empty to hide the mini chart (e.g. point-in-time balances). */
  spark?: Array<{ x: string; y: number }>;
};

export function StatsCards(props: { cards: StatCard[] }) {
  return (
    <motion.section
      initial="hidden"
      animate="show"
      variants={{
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.06 } },
      }}
      className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3"
    >
      {props.cards.map((c) => (
        <motion.div
          key={c.id}
          variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
          whileHover={{ y: -2 }}
          transition={{ type: "spring", stiffness: 350, damping: 25 }}
          className={cn(
            "relative overflow-hidden rounded-xl bg-[#ffffff] border border-[#e2e8f0] shadow-sm",
            "hover:shadow-md hover:border-[#0871b3]/40"
          )}
        >
          <div className="p-3 sm:p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-0.5 min-w-0">
                <div className="text-[11px] sm:text-xs font-medium text-[#64748b] truncate leading-tight">{c.title}</div>
                <div className="text-base sm:text-lg font-semibold tracking-tight text-[#0f172a] leading-tight">{c.value}</div>
                <DeltaText deltaPct={c.deltaPct} />
              </div>

              <div className={cn("w-8 h-8 shrink-0 rounded-full flex items-center justify-center", c.iconBg)}>
                <c.icon className={cn("w-4 h-4", c.iconFg)} />
              </div>
            </div>

            {c.spark && c.spark.length > 0 ? (
              <div className="mt-2 h-7 sm:h-8">
                <Sparkline data={c.spark} />
              </div>
            ) : null}
          </div>

          <div className="pointer-events-none absolute inset-0 opacity-0 hover:opacity-100 transition-opacity">
            <div className="absolute -inset-24 bg-gradient-to-br from-[#0871b3]/10 to-[#80a932]/10 blur-2xl" />
          </div>
        </motion.div>
      ))}
    </motion.section>
  );
}

