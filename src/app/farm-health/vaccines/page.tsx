"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Syringe, X } from "lucide-react";
import { db, type ReminderCadence, type Vaccine } from "@/lib/db";
import { newUid } from "@/lib/uid";
import { recordVaccineUsage } from "@/lib/farmHealth";

const cadenceOptions: Array<{ id: ReminderCadence; label: string }> = [
  { id: "daily", label: "Daily reminder" },
  { id: "weekly", label: "Weekly reminder" },
  { id: "monthly", label: "Monthly reminder" },
];

/** Add form uses string fields for numbers so the user can clear the field before typing. */
type VaccineAddForm = {
  uid: string;
  name: string;
  animalType: string;
  doseType?: string;
  unit: string;
  qtyStr: string;
  costStr: string;
  dateEntered: string;
  reDoseStr: string;
  reDoseIntervalUnit: "days" | "months";
};

function emptyVaccineForm(): VaccineAddForm {
  return {
    uid: newUid(),
    name: "",
    animalType: "",
    doseType: "",
    unit: "pcs",
    qtyStr: "",
    costStr: "",
    dateEntered: new Date().toISOString().slice(0, 10),
    reDoseStr: "",
    reDoseIntervalUnit: "days",
  };
}

function parseNonNegative(s: string): number {
  const n = Number(String(s).trim());
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function parseOptionalPositiveInt(s: string): number | undefined {
  const t = String(s).trim();
  if (t === "") return undefined;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.floor(n);
}

export default function VaccinesPage() {
  const vaccines = useLiveQuery(() => db.vaccines.orderBy("name").toArray()) || [];
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyVaccineForm);
  const [usageOpen, setUsageOpen] = useState(false);
  const [usageVaccineId, setUsageVaccineId] = useState(0);
  const [usageQty, setUsageQty] = useState("1");
  const [usageBatch, setUsageBatch] = useState("");
  const [usageDate, setUsageDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [usageNextVal, setUsageNextVal] = useState("21");
  const [usageNextUnit, setUsageNextUnit] = useState<"days" | "months">("days");
  const [usageCadence, setUsageCadence] = useState<ReminderCadence>("daily");
  const [usageNotes, setUsageNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedVax = useMemo(() => vaccines.find((v) => v.id === usageVaccineId), [vaccines, usageVaccineId]);

  const openUsage = (id: number) => {
    setUsageVaccineId(id);
    const v = vaccines.find((x) => x.id === id);
    const def = v?.reDoseIntervalValue && v.reDoseIntervalValue > 0 ? String(v.reDoseIntervalValue) : "21";
    setUsageNextVal(def);
    setUsageNextUnit(v?.reDoseIntervalUnit ?? "days");
    setUsageQty("1");
    setUsageBatch("");
    setUsageDate(new Date().toISOString().slice(0, 10));
    setUsageCadence("daily");
    setUsageNotes("");
    setUsageOpen(true);
  };

  const saveVaccine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return alert("Name is required.");
    setSaving(true);
    try {
      const qtyAvailable = parseNonNegative(form.qtyStr);
      const costPrice = parseNonNegative(form.costStr);
      const reDoseIntervalValue = parseOptionalPositiveInt(form.reDoseStr);
      const row: Omit<Vaccine, "id"> = {
        uid: form.uid || newUid(),
        name: form.name.trim(),
        animalType: form.animalType.trim(),
        doseType: form.doseType?.trim() || undefined,
        unit: form.unit.trim() || "pcs",
        qtyAvailable,
        costPrice,
        purchaseDate: form.dateEntered?.trim() || undefined,
        reDoseIntervalValue,
        reDoseIntervalUnit: reDoseIntervalValue ? form.reDoseIntervalUnit : undefined,
      };
      await db.vaccines.add(row);
      setShowAdd(false);
      setForm(emptyVaccineForm());
    } finally {
      setSaving(false);
    }
  };

  const submitUsage = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(usageQty);
    if (!Number.isFinite(qty) || qty <= 0) return alert("Enter quantity used.");
    if (!usageBatch.trim()) return alert("Animal batch is required.");
    const nextV = Number(usageNextVal);
    const hasNext = Number.isFinite(nextV) && nextV > 0;
    const iso = new Date(`${usageDate}T12:00:00`).toISOString();
    setSaving(true);
    try {
      await recordVaccineUsage({
        vaccineId: usageVaccineId,
        qtyUsed: qty,
        animalBatch: usageBatch.trim(),
        doseDateIso: iso,
        nextIntervalValue: hasNext ? nextV : undefined,
        nextIntervalUnit: hasNext ? usageNextUnit : undefined,
        cadence: usageCadence,
        notes: usageNotes.trim() || undefined,
      });
      setUsageOpen(false);
      alert("Usage recorded: stock reduced, expense posted, reminder created.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to record usage.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="text-sm text-slate-500">
            <Link href="/farm-health/dose-schedule" className="text-primary font-medium hover:underline">
              Dose schedule
            </Link>
            <span className="mx-2">·</span>
            <Link href="/farm-health/health-logs" className="text-primary font-medium hover:underline">
              Health logs
            </Link>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900 flex items-center gap-2">
            <Syringe className="w-7 h-7 text-primary" />
            Vaccines & medicine stock
          </h1>
          <p className="mt-1 text-sm text-slate-500">Consumable health inventory — record usage to post expenses and schedule next doses.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setForm(emptyVaccineForm());
            setShowAdd(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
        >
          <Plus className="w-5 h-5" />
          Add vaccine / medicine
        </button>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-slate-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div className="font-semibold text-slate-900">New vaccine / medicine</div>
              <button type="button" onClick={() => setShowAdd(false)} className="p-2 rounded-md hover:bg-slate-50" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={saveVaccine} className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="sm:col-span-2">
                <label className="block font-medium text-slate-700 mb-1">Name</label>
                <input
                  required
                  className="w-full px-3 py-2 border rounded-md"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Animal type</label>
                <input
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder="e.g. Chicken, Fish"
                  value={form.animalType}
                  onChange={(e) => setForm({ ...form, animalType: e.target.value })}
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Dose type</label>
                <input
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder="Booster, course…"
                  value={form.doseType ?? ""}
                  onChange={(e) => setForm({ ...form, doseType: e.target.value })}
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Qty available</label>
                <input
                  inputMode="decimal"
                  className="w-full px-3 py-2 border rounded-md"
                  value={form.qtyStr}
                  onChange={(e) => setForm({ ...form, qtyStr: e.target.value })}
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Unit</label>
                <input
                  className="w-full px-3 py-2 border rounded-md"
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Cost price (per unit)</label>
                <input
                  inputMode="decimal"
                  className="w-full px-3 py-2 border rounded-md"
                  value={form.costStr}
                  onChange={(e) => setForm({ ...form, costStr: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-medium text-slate-700 mb-1">Date entered</label>
                <input
                  type="date"
                  className="w-full px-3 py-2 border rounded-md"
                  value={form.dateEntered}
                  onChange={(e) => setForm({ ...form, dateEntered: e.target.value })}
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Re-dose interval</label>
                <div className="flex gap-2">
                  <input
                    inputMode="numeric"
                    className="w-full px-3 py-2 border rounded-md"
                    placeholder="Optional"
                    value={form.reDoseStr}
                    onChange={(e) => setForm({ ...form, reDoseStr: e.target.value })}
                  />
                  <select
                    className="px-2 py-2 border rounded-md bg-white"
                    value={form.reDoseIntervalUnit}
                    onChange={(e) => setForm({ ...form, reDoseIntervalUnit: e.target.value as "days" | "months" })}
                  >
                    <option value="days">days</option>
                    <option value="months">months</option>
                  </select>
                </div>
              </div>
              <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-md border border-slate-200">
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

      {usageOpen && selectedVax?.id && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-slate-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div className="font-semibold text-slate-900">Record usage — {selectedVax.name}</div>
              <button type="button" onClick={() => setUsageOpen(false)} className="p-2 rounded-md hover:bg-slate-50" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={submitUsage} className="p-4 space-y-3 text-sm">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Quantity used</label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  required
                  className="w-full px-3 py-2 border rounded-md"
                  value={usageQty}
                  onChange={(e) => setUsageQty(e.target.value)}
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Animal batch</label>
                <input
                  required
                  className="w-full px-3 py-2 border rounded-md"
                  value={usageBatch}
                  onChange={(e) => setUsageBatch(e.target.value)}
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Dose date</label>
                <input
                  type="date"
                  required
                  className="w-full px-3 py-2 border rounded-md"
                  value={usageDate}
                  onChange={(e) => setUsageDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Next dose after (optional)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={0}
                    className="w-full px-3 py-2 border rounded-md"
                    placeholder="Leave 0 for no reminder"
                    value={usageNextVal}
                    onChange={(e) => setUsageNextVal(e.target.value)}
                  />
                  <select
                    className="px-2 py-2 border rounded-md bg-white"
                    value={usageNextUnit}
                    onChange={(e) => setUsageNextUnit(e.target.value as "days" | "months")}
                  >
                    <option value="days">days</option>
                    <option value="months">months</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Reminder cadence</label>
                <select
                  className="w-full px-3 py-2 border rounded-md bg-white"
                  value={usageCadence}
                  onChange={(e) => setUsageCadence(e.target.value as ReminderCadence)}
                >
                  {cadenceOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Notes</label>
                <textarea className="w-full px-3 py-2 border rounded-md" rows={2} value={usageNotes} onChange={(e) => setUsageNotes(e.target.value)} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setUsageOpen(false)} className="px-4 py-2 rounded-md border border-slate-200">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-md bg-primary text-white disabled:opacity-50">
                  Save usage
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2 text-left font-semibold text-slate-600">Name</th>
              <th className="px-4 py-2 text-left font-semibold text-slate-600">Animal</th>
              <th className="px-4 py-2 text-left font-semibold text-slate-600">Dose</th>
              <th className="px-4 py-2 text-right font-semibold text-slate-600">Qty</th>
              <th className="px-4 py-2 text-left font-semibold text-slate-600">Unit</th>
              <th className="px-4 py-2 text-right font-semibold text-slate-600">Cost</th>
              <th className="px-4 py-2 text-left font-semibold text-slate-600">Date entered</th>
              <th className="px-4 py-2 text-right font-semibold text-slate-600">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {vaccines.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  No vaccines yet. Add chicken vaccine, fish medicine, supplements, etc.
                </td>
              </tr>
            ) : (
              vaccines.map((v) => (
                <tr key={v.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-2 font-medium text-slate-900">{v.name}</td>
                  <td className="px-4 py-2 text-slate-600">{v.animalType || "—"}</td>
                  <td className="px-4 py-2 text-slate-600">{v.doseType || "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{v.qtyAvailable}</td>
                  <td className="px-4 py-2 text-slate-600">{v.unit}</td>
                  <td className="px-4 py-2 text-right tabular-nums">Rs. {Number(v.costPrice ?? 0).toLocaleString()}</td>
                  <td className="px-4 py-2 text-slate-600">{v.purchaseDate || "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      disabled={!v.id || v.qtyAvailable <= 0}
                      onClick={() => v.id && openUsage(v.id)}
                      className="text-primary font-semibold hover:underline disabled:opacity-40 disabled:no-underline"
                    >
                      Use
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
