"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useMemo } from "react";
import { HeroSection, StatsCards, SalesChart, QuickActions, RecentActivity, InventorySnapshot, FinanceSnapshot } from "@/components/dashboard";
import { AlertTriangle, IndianRupee, Package, TrendingUp } from "lucide-react";
import { useSyncExternalStore } from "react";

function subscribeOnlineStatus(onStoreChange: () => void) {
  window.addEventListener("online", onStoreChange);
  window.addEventListener("offline", onStoreChange);
  return () => {
    window.removeEventListener("online", onStoreChange);
    window.removeEventListener("offline", onStoreChange);
  };
}
function getOnlineSnapshot() {
  return navigator.onLine;
}
function getOnlineServerSnapshot() {
  return true;
}

export default function Dashboard() {
  const inventory = useLiveQuery(() => db.inventory.toArray()) || [];
  const dayBook = useLiveQuery(() => db.dayBook.toArray()) || [];
  const ledgerAccounts = useLiveQuery(() => db.ledgerAccounts.toArray()) || [];
  const ledgerEntries = useLiveQuery(() => db.ledgerEntries.toArray()) || [];

  const isOnline = useSyncExternalStore(subscribeOnlineStatus, getOnlineSnapshot, getOnlineServerSnapshot);

  const totalStockUnits = inventory.reduce((acc, item) => acc + item.quantity, 0);
  const lowStockCount = inventory.filter(i => i.quantity <= i.minStockThreshold).length;

  const todayKey = new Date().toISOString().split("T")[0];
  const todaySales = dayBook
    .filter((e) => e.category === "Sale" && e.type === "Income" && e.time.startsWith(todayKey))
    .reduce((acc, e) => acc + e.amount, 0);

  const revenue = dayBook
    .filter((e) => e.category === "Sale" && e.type === "Income")
    .reduce((acc, e) => acc + e.amount, 0);

  const yesterdayKey = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
  })();

  const yesterdaySales = dayBook
    .filter((e) => e.category === "Sale" && e.type === "Income" && e.time.startsWith(yesterdayKey))
    .reduce((acc, e) => acc + e.amount, 0);

  const salesDeltaPct = yesterdaySales === 0 ? (todaySales > 0 ? 100 : 0) : ((todaySales - yesterdaySales) / yesterdaySales) * 100;

  const lowStockDeltaPct = 12; // placeholder until we track stock history snapshots
  const totalStockDeltaPct = 6; // placeholder
  const revenueDeltaPct = 8; // placeholder

  const salesByDay = useMemo(() => {
    const now = new Date();
    const days = 90;
    const result: Array<{ dayKey: string; label: string; total: number }> = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dayKey = d.toISOString().split("T")[0];
      const label = d.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
      result.push({ dayKey, label, total: 0 });
    }
    const index = new Map(result.map((r, idx) => [r.dayKey, idx]));
    for (const e of dayBook) {
      if (e.category !== "Sale" || e.type !== "Income") continue;
      const key = e.time.split("T")[0];
      const i = index.get(key);
      if (typeof i === "number") result[i] = { ...result[i], total: result[i].total + e.amount };
    }
    return result;
  }, [dayBook]);

  const spark7 = salesByDay.slice(-7).map((d) => ({ x: d.dayKey, y: d.total }));

  const lowStockItemsTop5 = useMemo(() => {
    return inventory
      .filter((i) => i.quantity <= i.minStockThreshold)
      .slice()
      .sort((a, b) => a.quantity - b.quantity)
      .slice(0, 5);
  }, [inventory]);

  const activityItems = useMemo(() => {
    const tx = dayBook
      .slice()
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 6)
      .map((e) => {
        const isIncome = e.type === "Income";
        return {
          id: `tx-${e.id ?? e.time}`,
          title: e.description,
          subtitle: `${e.category} • Rs.${e.amount.toLocaleString()}`,
          time: new Date(e.time).toLocaleString(),
          chip: { label: isIncome ? "Receipt" : "Payment", tone: isIncome ? "success" : "danger" } as const,
          icon: (isIncome ? "income" : "expense") as "income" | "expense",
        };
      });

    const alerts = lowStockItemsTop5.slice(0, 2).map((i) => ({
      id: `alert-low-${i.id ?? i.name}`,
      title: `Low stock alert for ${i.name}`,
      subtitle: `${i.quantity} ${i.unit} remaining (alert at ${i.minStockThreshold})`,
      time: "Now",
      chip: { label: "Low Stock", tone: "warn" } as const,
      icon: "alert" as const,
    }));

    return [...alerts, ...tx].slice(0, 8);
  }, [dayBook, lowStockItemsTop5]);

  const finance = useMemo(() => {
    const sums = new Map<number, { debit: number; credit: number }>();
    for (const e of ledgerEntries) {
      const cur = sums.get(e.accountId) ?? { debit: 0, credit: 0 };
      cur.debit += e.debit;
      cur.credit += e.credit;
      sums.set(e.accountId, cur);
    }
    let receivable = 0;
    let payable = 0;
    for (const a of ledgerAccounts) {
      if (typeof a.id !== "number") continue;
      const s = sums.get(a.id) ?? { debit: 0, credit: 0 };
      const bal = s.debit - s.credit;
      if (bal > 0) receivable += bal;
      if (bal < 0) payable += Math.abs(bal);
    }

    const expensesToday = dayBook
      .filter((e) => e.type === "Expense" && e.time.startsWith(todayKey))
      .reduce((acc, e) => acc + e.amount, 0);

    const cashInHand = dayBook.reduce((acc, e) => (e.type === "Income" ? acc + e.amount : acc - e.amount), 0);

    return { receivable, payable, expensesToday, cashInHand };
  }, [dayBook, ledgerAccounts, ledgerEntries, todayKey]);

  const statCards = useMemo(() => {
    return [
      {
        id: "stock",
        title: "Total Stock",
        value: `${totalStockUnits.toLocaleString()} units`,
        deltaPct: totalStockDeltaPct,
        icon: Package,
        iconBg: "bg-[#0871b3]/10",
        iconFg: "text-[#0871b3]",
        spark: spark7,
      },
      {
        id: "lowStock",
        title: "Low Stock Alerts",
        value: `${lowStockCount.toLocaleString()} items`,
        deltaPct: lowStockDeltaPct,
        icon: AlertTriangle,
        iconBg: "bg-amber-500/10",
        iconFg: "text-amber-700",
        spark: spark7.map((p, idx) => ({ ...p, y: idx === 0 ? lowStockCount : Math.max(0, lowStockCount - (idx % 3)) })),
      },
      {
        id: "todaySales",
        title: "Today's Sales",
        value: `Rs. ${todaySales.toLocaleString()}`,
        deltaPct: salesDeltaPct,
        icon: TrendingUp,
        iconBg: "bg-[#80a932]/12",
        iconFg: "text-[#80a932]",
        spark: spark7,
      },
      {
        id: "revenue",
        title: "Total Revenue",
        value: `Rs. ${revenue.toLocaleString()}`,
        deltaPct: revenueDeltaPct,
        icon: IndianRupee,
        iconBg: "bg-[#0871b3]/10",
        iconFg: "text-[#0871b3]",
        spark: spark7,
      },
    ];
  }, [lowStockCount, revenue, revenueDeltaPct, salesDeltaPct, spark7, todaySales, totalStockUnits, totalStockDeltaPct, lowStockDeltaPct, todaySales, revenue]);

  return (
    <div className="space-y-6 sm:space-y-8">
      <HeroSection isOnline={isOnline} />
      <StatsCards cards={statCards} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <SalesChart salesByDay={salesByDay} />
        </div>
        <QuickActions />
      </div>

      <FinanceSnapshot
        receivable={finance.receivable}
        payable={finance.payable}
        expensesToday={finance.expensesToday}
        cashInHand={finance.cashInHand}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentActivity items={activityItems} />
        <InventorySnapshot items={lowStockItemsTop5} />
      </div>
    </div>
  );
}
