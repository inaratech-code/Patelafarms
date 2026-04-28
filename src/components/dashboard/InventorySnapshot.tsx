"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Package, ArrowRight } from "lucide-react";

type Item = {
  id?: number;
  name: string;
  quantity: number;
  unit: string;
  minStockThreshold: number;
};

function statusFor(item: Item) {
  if (item.quantity <= 0) return { label: "Critical", cls: "bg-rose-500/10 text-rose-700 border-rose-500/25" };
  if (item.quantity <= item.minStockThreshold) return { label: "Low", cls: "bg-amber-500/10 text-amber-700 border-amber-500/25" };
  return { label: "Good", cls: "bg-[#80a932]/10 text-[#80a932] border-[#80a932]/25" };
}

export function InventorySnapshot(props: { items: Item[] }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="rounded-2xl bg-white border border-[#e2e8f0] shadow-sm overflow-hidden"
    >
      <div className="p-6 border-b border-[#e2e8f0] flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-[#64748b]">Inventory Snapshot</div>
          <div className="mt-1 text-lg font-semibold text-[#0f172a]">Top low stock items</div>
        </div>
        <Package className="w-5 h-5 text-[#64748b]" />
      </div>

      <div className="p-6">
        {props.items.length === 0 ? (
          <div className="text-sm text-[#64748b]">No low stock items right now.</div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="min-w-[720px] w-full">
              <thead>
                <tr className="text-xs font-semibold text-[#64748b]">
                  <th className="text-left pb-3">Item</th>
                  <th className="text-left pb-3">Qty</th>
                  <th className="text-left pb-3">Status</th>
                  <th className="text-right pb-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e8f0]">
                {props.items.map((i) => {
                  const s = statusFor(i);
                  return (
                    <tr key={i.id ?? i.name} className="h-12">
                      <td className="py-3 text-sm font-semibold text-[#0f172a]">{i.name}</td>
                      <td className="py-3 text-sm text-[#0f172a]">
                        {i.quantity} {i.unit}
                      </td>
                      <td className="py-3">
                        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${s.cls}`}>
                          {s.label}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <Link href="/inventory" className="inline-flex items-center gap-2 text-sm font-semibold text-[#0871b3] hover:underline">
                          Open <ArrowRight className="w-4 h-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.section>
  );
}

