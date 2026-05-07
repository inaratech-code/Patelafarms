"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type HandledFile = {
  name: string;
  type: string;
  size: number;
  textPreview?: string;
  error?: string;
};

export default function FileHandlerPage() {
  const [files, setFiles] = useState<HandledFile[]>([]);
  const [status, setStatus] = useState<string>("Waiting for files…");

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      // File Handling API is not available in all browsers/hosts.
      const w = window as unknown as {
        launchQueue?: {
          setConsumer?: (consumer: (params: { files: Array<{ getFile: () => Promise<File> }> }) => void) => void;
        };
      };

      if (!w.launchQueue?.setConsumer) {
        setStatus("No files were provided (File Handling API not available here).");
        return;
      }

      setStatus("Ready. Drop/open a supported file to test.");
      w.launchQueue.setConsumer(async (launchParams) => {
        const next: HandledFile[] = [];
        for (const fh of launchParams.files ?? []) {
          try {
            const f = await fh.getFile();
            const row: HandledFile = { name: f.name, type: f.type, size: f.size };
            // Best-effort preview for small text files.
            if (f.size <= 200_000 && (f.type.startsWith("text/") || f.type === "application/json" || f.name.endsWith(".csv"))) {
              row.textPreview = (await f.text()).slice(0, 2000);
            }
            next.push(row);
          } catch (e: unknown) {
            next.push({ name: "unknown", type: "", size: 0, error: e instanceof Error ? e.message : String(e) });
          }
        }
        if (!cancelled) {
          setFiles(next);
          setStatus(next.length ? `Received ${next.length} file(s).` : "No files received.");
        }
      });
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">File handler</h1>
      <p className="text-sm text-slate-600">
        This page is the entry point for files opened with this app (configured in <code className="px-1 py-0.5 rounded bg-slate-100">manifest.json</code>).
      </p>

      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <div className="text-xs font-semibold text-slate-500 mb-1">Status</div>
        <div className="text-slate-900">{status}</div>
      </div>

      {files.length ? (
        <div className="space-y-3">
          {files.map((f, idx) => (
            <div key={idx} className="rounded-xl border border-slate-200 bg-white p-4 text-sm space-y-2">
              <div className="font-semibold text-slate-900 break-words">{f.name}</div>
              <div className="text-xs text-slate-600">
                {f.type || "unknown type"} · {f.size.toLocaleString()} bytes
              </div>
              {f.error ? <div className="text-xs text-rose-600">{f.error}</div> : null}
              {f.textPreview ? (
                <pre className="text-xs whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 border border-slate-100 max-h-64 overflow-auto">
{f.textPreview}
                </pre>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

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

