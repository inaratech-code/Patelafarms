"use client";

import { motion } from "framer-motion";
import { Download, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";

const SalesArea = dynamic(() => import("./_SalesArea").then((m) => m.SalesArea), { ssr: false });

type Range = "7D" | "30D" | "90D";

function formatRs(n: number) {
  return `Rs. ${n.toLocaleString()}`;
}

export function SalesChart(props: {
  salesByDay: Array<{ dayKey: string; label: string; total: number }>;
}) {
  const [range, setRange] = useState<Range>("30D");

  const data = useMemo(() => {
    const take = range === "7D" ? 7 : range === "30D" ? 30 : 90;
    return props.salesByDay.slice(-take);
  }, [props.salesByDay, range]);

  const exportCsv = () => {
    const rows = ["date,total", ...data.map((d) => `${d.dayKey},${d.total}`)].join("\n");
    const blob = new Blob([rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sales-${range.toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="rounded-2xl bg-white border border-[#e2e8f0] shadow-sm overflow-hidden"
    >
      <div className="p-6 border-b border-[#e2e8f0] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#0871b3]/10 text-[#0871b3] flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-medium text-[#64748b]">Sales Overview</div>
            <div className="text-lg font-semibold text-[#0f172a]">Sales Trend</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl bg-[#f8fafc] border border-[#e2e8f0] p-1">
            {(["7D", "30D", "90D"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  range === r ? "bg-white shadow-sm text-[#0f172a]" : "text-[#64748b] hover:text-[#0f172a]"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] text-sm font-semibold text-[#0f172a]"
          >
            <Download className="w-4 h-4 text-[#64748b]" />
            Export
          </button>
        </div>
      </div>

      <div className="p-6">
        <div className="h-72">
          <SalesArea data={data} />
        </div>
      </div>
    </motion.section>
  );
}

