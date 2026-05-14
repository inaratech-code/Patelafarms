"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

function safeHref(raw: string) {
  const v = (raw ?? "").trim();
  if (!v) return "";
  // Allow https/http only; block javascript:, file:, etc.
  if (v.startsWith("https://") || v.startsWith("http://")) return v;
  return "";
}

export default function ProtocolHandlerPage() {
  const params = useSearchParams();
  const raw = params.get("url") ?? "";

  const target = useMemo(() => safeHref(raw), [raw]);

  return (
    <div className="max-w-xl mx-auto p-6 space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Protocol handler</h1>
      <p className="text-sm text-slate-600">
        This page receives links opened via the <code className="px-1 py-0.5 rounded bg-slate-100">web+patelafarm:</code>{" "}
        protocol.
      </p>

      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm space-y-2">
        <div className="text-xs font-semibold text-slate-500">Incoming URL</div>
        <div className="break-words text-slate-900">{raw || "—"}</div>
        {!target && raw ? (
          <div className="text-xs text-rose-600">
            Unsupported URL scheme. Only <span className="font-semibold">http/https</span> links are allowed.
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/" className="inline-flex items-center px-4 py-2 rounded-lg bg-primary text-white font-semibold">
          Go to dashboard
        </Link>
        {target ? (
          <a
            className="inline-flex items-center px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold text-slate-700"
            href={target}
            target="_blank"
            rel="noreferrer"
          >
            Open link
          </a>
        ) : null}
      </div>
    </div>
  );
}

