"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { ClipboardList, Plus } from "lucide-react";
import { FarmHealthModal } from "@/components/farm-health/FarmHealthModal";
import { FarmHealthSubnav } from "@/components/farm-health/FarmHealthSubnav";
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
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0">
          <FarmHealthSubnav current="health-logs" />
          <h1 className="mt-2 text-xl sm:text-2xl font-semibold text-slate-900 flex items-center gap-2">
            <ClipboardList className="w-6 h-6 sm:w-7 sm:h-7 text-primary shrink-0" />
            <span className="min-w-0">Health logs</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">Observations, treatments, and automatic entries from vaccine usage.</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 shrink-0"
        >
          <Plus className="w-5 h-5" />
          Add log
        </button>
      </div>

      {open && (
        <FarmHealthModal title="New health log" onClose={() => setOpen(false)}>
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
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-md border border-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-md bg-primary text-white disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </form>
        </FarmHealthModal>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
        {sorted.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No logs yet.</div>
        ) : (
          sorted.map((l) => (
            <div key={l.id ?? l.uid} className="p-4">
              <div className="font-medium text-slate-900 break-words">{l.summary}</div>
              <div className="text-sm text-slate-500 mt-0.5 break-words">
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
