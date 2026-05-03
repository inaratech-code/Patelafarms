"use client";

import Link from "next/link";
import { Receipt, ShoppingCart, Truck, HandCoins } from "lucide-react";

const links = [
  {
    href: "/orders",
    title: "Sales",
    description: "Record fish or chicken sales, credit, and receipts.",
    icon: ShoppingCart,
    tone: "bg-[#0871b3]/10 text-[#0871b3]",
  },
  {
    href: "/purchases",
    title: "Purchases",
    description: "Supplier purchases, stock in, and payment status.",
    icon: Truck,
    tone: "bg-amber-500/10 text-amber-800",
  },
  {
    href: "/expenses",
    title: "Expenses",
    description: "Operating expenses outside purchases and feed usage.",
    icon: Receipt,
    tone: "bg-slate-500/10 text-slate-800",
  },
  {
    href: "/payments",
    title: "Payments",
    description: "Receive from customers or pay suppliers.",
    icon: HandCoins,
    tone: "bg-[#80a932]/12 text-[#80a932]",
  },
] as const;

export default function TransactionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Transactions</h1>
        <p className="mt-1 text-sm text-slate-500">Jump to sales, purchases, expenses, or payments.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {links.map((l) => {
          const Icon = l.icon;
          return (
            <Link
              key={l.href}
              href={l.href}
              className="flex gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-primary/30 hover:bg-slate-50/80 transition-colors"
            >
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${l.tone}`}>
                <Icon className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-slate-900">{l.title}</div>
                <p className="mt-1 text-sm text-slate-600">{l.description}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
