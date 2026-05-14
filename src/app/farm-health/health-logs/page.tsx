"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardList, Plus, X } from "lucide-react";
import { db } from "@/lib/db";
import { newUid } from "@/lib/uid";

export default function HealthLogsPage() {
  const logs = useLiveQuery(() => db.healthLogs.orderBy("date").reverse().toArray()) || [];
  const [open, setOpen] = useState(false);
  const [batch, setBatch] = useState("");
  const [summary, setSummary] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const sorted = useMemo(() => logs.slice(), [logs]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary.trim()) return alert("Summary is required.");
    if (!batch.trim()) return alert("Animal batch is required.");
    setSaving(true);
    try {
      const iso = new Date(`${date}T12:00:00`).toISOString();
      await db.healthLogs.add({
        uid: newUid(),
        date: iso,
        animalBatch: batch.trim(),
        summary: summary.trim(),
        notes: notes.trim() || undefined,
      });
      setOpen(false);
      setBatch("");
      setSummary("");
      setNotes("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="text-sm text-slate-500">
            <Link href="/farm-health/vaccines" className="text-primary font-medium hover:underline">
              Vaccines
            </Link>
            <span className="mx-2">·</span>
            <Link href="/farm-health/dose-schedule" className="text-primary font-medium hover:underline">
              Dose schedule
            </Link>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900 flex items-center gap-2">
            <ClipboardList className="w-7 h-7 text-primary" />
            Health logs
          </h1>
          <p className="mt-1 text-sm text-slate-500">Observations, treatments, and automatic entries from vaccine usage.</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
        >
          <Plus className="w-5 h-5" />
          Add log
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-slate-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div className="font-semibold text-slate-900">New health log</div>
              <button type="button" onClick={() => setOpen(false)} className="p-2 rounded-md hover:bg-slate-50" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={save} className="p-4 space-y-3 text-sm">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Date</label>
                <input type="date" className="w-full px-3 py-2 border rounded-md" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Animal batch</label>
                <input required className="w-full px-3 py-2 border rounded-md" value={batch} onChange={(e) => setBatch(e.target.value)} />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Summary</label>
                <input required className="w-full px-3 py-2 border rounded-md" value={summary} onChange={(e) => setSummary(e.target.value)} />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Notes</label>
                <textarea className="w-full px-3 py-2 border rounded-md" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 rounded-md border border-slate-200">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-md bg-primary text-white disabled:opacity-50">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
        {sorted.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No logs yet.</div>
        ) : (
          sorted.map((l) => (
            <div key={l.id ?? l.uid} className="p-4">
              <div className="font-medium text-slate-900">{l.summary}</div>
              <div className="text-sm text-slate-500 mt-0.5">
                {new Date(l.date).toLocaleDateString()} · Batch {l.animalBatch}
                {l.vaccineUsageId ? " · Linked to vaccine use" : ""}
              </div>
              {l.notes ? <div className="mt-2 text-sm text-slate-600">{l.notes}</div> : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
