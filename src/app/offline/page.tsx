"use client";

import Link from "next/link";

export default function OfflinePage() {
  return (
    <div className="max-w-xl mx-auto p-6 space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">You’re offline</h1>
      <p className="text-sm text-slate-600">
        The app couldn’t reach the network. Some features may still work if they were cached before.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link href="/" className="inline-flex items-center px-4 py-2 rounded-lg bg-primary text-white font-semibold">
          Go to dashboard
        </Link>
        <Link
          href="/inventory"
          className="inline-flex items-center px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold text-slate-700"
        >
          Open Inventory
        </Link>
      </div>
    </div>
  );
}

