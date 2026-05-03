import { ensureSupabaseAuth, getSupabaseClient } from "@/lib/supabaseClient";

type PostgrestLikeError = {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
};

function formatPostgrestDetails(err: unknown): string {
  const e = err as PostgrestLikeError | null | undefined;
  const parts: string[] = [];
  if (typeof e?.message === "string" && e.message) parts.push(e.message);
  else if (err != null) parts.push(String(err));
  if (typeof e?.code === "string" && e.code) parts.push(`code=${e.code}`);
  if (typeof e?.details === "string" && e.details) parts.push(`details: ${e.details}`);
  if (typeof e?.hint === "string" && e.hint) parts.push(`hint: ${e.hint}`);
  return parts.join(" · ");
}

function formatFarmDbError(prefix: string, err: unknown): string {
  const e = err as PostgrestLikeError | null | undefined;
  const msg = formatPostgrestDetails(err);
  const code = e?.code;
  const lower = msg.toLowerCase();
  if (
    code === "42501" ||
    lower.includes("row-level security") ||
    lower.includes("violates row-level security")
  ) {
    return `${prefix}: ${msg} — In Supabase: Authentication → Providers → Anonymous (enable). SQL Editor: run supabase/fix_farms_rls_v2.sql (after events.sql + tenancy_rls.sql). See README “Supabase”.`;
  }
  return `${prefix}: ${msg}`;
}

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
  if (listErr) throw new Error(formatFarmDbError("Could not list farms", listErr));

  let farmId: string;
  if (existingRows?.length) {
    farmId = String((existingRows[0] as { id: string }).id);
  } else {
    const { data: farm, error: farmErr } = await supabase
      .from("farms")
      .insert({ name: "Patela Farm", created_by: user.id })
      .select("id")
      .single();
    if (farmErr) throw new Error(formatFarmDbError("Could not create farm", farmErr));
    farmId = String((farm as { id: string }).id);
  }

  const { error: memErr } = await supabase.from("farm_members").insert({ farm_id: farmId, user_id: user.id, role: "owner" });
  if (memErr) {
    const msg = typeof memErr.message === "string" ? memErr.message : "";
    const isDup =
      (memErr as { code?: string }).code === "23505" ||
      msg.includes("duplicate key") ||
      msg.includes("unique constraint");
    if (!isDup) throw new Error(formatFarmDbError("Could not add farm member", memErr));
  }

  setFarmId(farmId);
  return farmId;
}

