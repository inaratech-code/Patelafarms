import { ensureSupabaseAuth, getSupabaseClient } from "@/lib/supabaseClient";

export const FARM_ID_KEY = "pf.farmId.v1";

export function getFarmId() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(FARM_ID_KEY);
}

export function setFarmId(id: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(FARM_ID_KEY, id);
}

export async function ensureFarm() {
  // Requires Supabase Auth session (including anonymous).
  const supabase = getSupabaseClient();

  const existing = getFarmId();
  if (existing) return existing;

  await ensureSupabaseAuth();

  // Ensure JWT is attached before RLS runs on insert (avoids created_by ≠ auth.uid() races).
  const {
    data: { session },
    error: sessionErr,
  } = await supabase.auth.getSession();
  if (sessionErr) throw sessionErr;
  const user = session?.user;
  if (!user?.id) throw new Error("Supabase auth user missing. Sign in (anonymous) first.");

  // Idempotent: if farm insert succeeded but member insert / setFarmId failed, retry must not create another farm.
  const { data: existingRows, error: listErr } = await supabase
    .from("farms")
    .select("id")
    .eq("created_by", user.id)
    .limit(1);
  if (listErr) throw listErr;

  let farmId: string;
  if (existingRows?.length) {
    farmId = String((existingRows[0] as { id: string }).id);
  } else {
    const { data: farm, error: farmErr } = await supabase
      .from("farms")
      .insert({ name: "Patela Farm", created_by: user.id })
      .select("id")
      .single();
    if (farmErr) throw farmErr;
    farmId = String((farm as { id: string }).id);
  }

  const { error: memErr } = await supabase.from("farm_members").insert({ farm_id: farmId, user_id: user.id, role: "owner" });
  if (memErr) {
    const msg = typeof memErr.message === "string" ? memErr.message : "";
    const isDup =
      (memErr as { code?: string }).code === "23505" ||
      msg.includes("duplicate key") ||
      msg.includes("unique constraint");
    if (!isDup) throw memErr;
  }

  setFarmId(farmId);
  return farmId;
}

