"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { Plus, Syringe } from "lucide-react";
import { FarmHealthModal } from "@/components/farm-health/FarmHealthModal";
import { FarmHealthSubnav } from "@/components/farm-health/FarmHealthSubnav";
import { db, type ReminderCadence, type Vaccine } from "@/lib/db";
import { newUid } from "@/lib/uid";
import { recordVaccineUsage } from "@/lib/farmHealth";
import { enqueueVaccineOutbox } from "@/lib/farmHealthSync";

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
    reDoseStr: "21",
    reDoseIntervalUnit: "days",
  };
}

function parseNonNegative(s: string): number {
  const n = Number(String(s).trim());
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Whole number > 0, or null if missing/invalid. */
function parseRequiredReDoseInterval(s: string): number | null {
  const t = String(s).trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
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
    const reDoseIntervalValue = parseRequiredReDoseInterval(form.reDoseStr);
    if (reDoseIntervalValue == null) {
      return alert("Re-dose interval is required. Enter a whole number greater than 0.");
    }
    setSaving(true);
    try {
      const qtyAvailable = parseNonNegative(form.qtyStr);
      const costPrice = parseNonNegative(form.costStr);
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
        reDoseIntervalUnit: form.reDoseIntervalUnit,
      };
      const id = (await db.vaccines.add(row)) as number;
      await enqueueVaccineOutbox({ ...row, id }, "create");
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
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0">
          <FarmHealthSubnav current="vaccines" />
          <h1 className="mt-2 text-xl sm:text-2xl font-semibold text-slate-900 flex items-center gap-2">
            <Syringe className="w-6 h-6 sm:w-7 sm:h-7 text-primary shrink-0" />
            <span className="min-w-0">Vaccines & medicine stock</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Consumable health inventory — record usage to post expenses and schedule next doses.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setForm(emptyVaccineForm());
            setShowAdd(true);
          }}
          className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 shrink-0"
        >
          <Plus className="w-5 h-5" />
          Add vaccine / medicine
        </button>
      </div>

      {showAdd && (
        <FarmHealthModal title="New vaccine / medicine" onClose={() => setShowAdd(false)} maxWidth="lg">
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
                <label className="block font-medium text-slate-700 mb-1">
                  Re-dose interval <span className="text-red-600 font-semibold">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    inputMode="numeric"
                    required
                    className="w-full px-3 py-2 border rounded-md"
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
        </FarmHealthModal>
      )}

      {usageOpen && selectedVax?.id && (
        <FarmHealthModal title={`Record usage — ${selectedVax.name}`} onClose={() => setUsageOpen(false)}>
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
        </FarmHealthModal>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="md:hidden divide-y divide-slate-100">
          {vaccines.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">
              No vaccines yet. Add chicken vaccine, fish medicine, supplements, etc.
            </div>
          ) : (
            vaccines.map((v) => (
              <div key={v.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 break-words">{v.name}</div>
                    <div className="text-sm text-slate-500 mt-0.5">
                      {[v.animalType, v.doseType].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!v.id || v.qtyAvailable <= 0}
                    onClick={() => v.id && openUsage(v.id)}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/15 disabled:opacity-40"
                  >
                    Use
                  </button>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-slate-500">Qty</dt>
                    <dd className="font-medium tabular-nums">
                      {v.qtyAvailable} {v.unit}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Cost</dt>
                    <dd className="font-medium tabular-nums">Rs. {Number(v.costPrice ?? 0).toLocaleString()}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-xs text-slate-500">Date entered</dt>
                    <dd className="text-slate-700">{v.purchaseDate || "—"}</dd>
                  </div>
                </dl>
              </div>
            ))
          )}
        </div>
        <div className="hidden md:block overflow-x-auto">
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
    </div>
  );
}
