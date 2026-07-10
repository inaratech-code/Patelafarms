import { Suspense } from "react";
import { StockMovementClient } from "@/app/stock-movement/StockMovementClient";

export default function StockMovementPage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">Loading stock movement…</div>}>
      <StockMovementClient />
    </Suspense>
  );
}
