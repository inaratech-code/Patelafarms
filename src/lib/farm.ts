import { getSupabaseClient } from "@/lib/supabaseClient";

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

  // Create a farm and add current user as member/owner.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) throw new Error("Supabase auth user missing. Sign in (anonymous) first.");

  const { data: farm, error: farmErr } = await supabase
    .from("farms")
    .insert({ name: "Patela Farm", created_by: user.id })
    .select("id")
    .single();
  if (farmErr) throw farmErr;
  const farmId = String((farm as any).id);

  const { error: memErr } = await supabase.from("farm_members").insert({ farm_id: farmId, user_id: user.id, role: "owner" });
  if (memErr) throw memErr;

  setFarmId(farmId);
  return farmId;
}

