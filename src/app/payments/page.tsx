import { Suspense } from "react";
import { PaymentsClient } from "@/app/payments/PaymentsClient";

export default function PaymentsPage() {
  return (
    <Suspense fallback={<div className="text-sm text-[#64748b]">Loading payments…</div>}>
      <PaymentsClient />
    </Suspense>
  );
}

