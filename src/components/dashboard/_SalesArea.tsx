"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function formatRs(n: number) {
  return `Rs. ${n.toLocaleString()}`;
}

export function SalesArea(props: {
  data: Array<{ label: string; total: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={288} minWidth={0} minHeight={0}>
      <AreaChart data={props.data} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0871b3" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#0871b3" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 6" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "#64748b", fontSize: 12 }}
          interval="preserveStartEnd"
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fill: "#64748b", fontSize: 12 }}
          width={56}
          tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const v = payload[0].value as number;
            return (
              <div className="rounded-xl border border-[#e2e8f0] bg-white px-3 py-2 shadow-sm">
                <div className="text-xs font-semibold text-[#64748b]">{label}</div>
                <div className="text-sm font-semibold text-[#0f172a]">{formatRs(v)}</div>
              </div>
            );
          }}
        />
        <Area type="monotone" dataKey="total" stroke="#0871b3" strokeWidth={3} fill="url(#salesFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

