"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

export default function ShareTargetPage() {
  const params = useSearchParams();

  const payload = useMemo(() => {
    const title = params.get("title") ?? "";
    const text = params.get("text") ?? "";
    const url = params.get("url") ?? "";
    return { title, text, url };
  }, [params]);

  return (
    <div className="max-w-xl mx-auto p-6 space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Shared content</h1>
      <p className="text-sm text-slate-600">
        This page receives content shared into the app from the OS share sheet.
      </p>

      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2 text-sm">
        <div>
          <div className="text-xs font-semibold text-slate-500">Title</div>
          <div className="text-slate-900 break-words">{payload.title || "—"}</div>
        </div>
        <div>
          <div className="text-xs font-semibold text-slate-500">Text</div>
          <div className="text-slate-900 break-words">{payload.text || "—"}</div>
        </div>
        <div>
          <div className="text-xs font-semibold text-slate-500">URL</div>
          {payload.url ? (
            <a className="text-primary underline break-words" href={payload.url} target="_blank" rel="noreferrer">
              {payload.url}
            </a>
          ) : (
            <div className="text-slate-900">—</div>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <Link href="/" className="inline-flex items-center px-4 py-2 rounded-lg bg-primary text-white font-semibold">
          Go to dashboard
        </Link>
        <Link
          href="/daybook"
          className="inline-flex items-center px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold text-slate-700"
        >
          Open Day Book
        </Link>
      </div>
    </div>
  );
}

