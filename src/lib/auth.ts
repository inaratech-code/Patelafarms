import { db } from "@/lib/db";
import { enqueueUserRecordOutbox } from "@/lib/sync";
import { ensureFarm, publishFarmCloudLogin } from "@/lib/farm";
import { ensureSupabaseAuth, getSupabaseClient } from "@/lib/supabaseClient";

export const SESSION_KEY = "pf.session.v1";

export type Session = {
  userId: number;
  username: string;
  roleId: number;
  createdAt: number;
};

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Session;
    if (typeof s?.userId !== "number") return null;
    if (typeof s?.username !== "string") return null;
    if (typeof s?.roleId !== "number") return null;
    return s;
  } catch {
    return null;
  }
}

export function setSession(session: Omit<Session, "createdAt">) {
  if (typeof window === "undefined") return;
  const full: Session = { ...session, createdAt: Date.now() };
  localStorage.setItem(SESSION_KEY, JSON.stringify(full));
}

export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
}

export async function sha256Base64(input: string) {
  if (!globalThis.crypto?.subtle) return btoa(unescape(encodeURIComponent(input))); // fallback (not secure)
  const enc = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", enc);
  const bytes = new Uint8Array(hash);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function findLocalUserByUsername(usernameTrimmed: string) {
  const un = usernameTrimmed.toLowerCase();
  const all = await db.users.toArray();
  return all.find((u) => u.username.trim().toLowerCase() === un);
}

export async function loginWithPassword(params: { username: string; password: string }) {
  const username = params.username.trim();
  const password = params.password;
  if (!username) throw new Error("Username is required");
  if (!password) throw new Error("Password is required");

  const user = await findLocalUserByUsername(username);
  if (!user?.id) throw new Error("User not found");
  if (!user.passwordHash) throw new Error("User has no password set");

  const hash = await sha256Base64(password);
  if (hash !== user.passwordHash) throw new Error("Invalid password");

  setSession({ userId: user.id, username: user.username, roleId: user.roleId });

  void (async () => {
    try {
      getSupabaseClient();
      await ensureSupabaseAuth();
      await ensureFarm();
      await publishFarmCloudLogin(user.username, hash);
    } catch {
      /* Supabase not configured or offline */
    }
  })();

  return { userId: user.id, roleId: user.roleId };
}

export async function changePassword(params: {
  userId: number;
  currentPassword: string;
  newPassword: string;
}) {
  const { userId, currentPassword, newPassword } = params;
  if (newPassword.length < 4 || newPassword.length > 20) {
    throw new Error("New password must be between 4 and 20 characters");
  }
  const user = await db.users.get(userId);
  if (!user?.id) throw new Error("User not found");
  if (!user.passwordHash) throw new Error("This account has no password set");

  const curHash = await sha256Base64(currentPassword);
  if (curHash !== user.passwordHash) throw new Error("Current password is incorrect");

  const newHash = await sha256Base64(newPassword);
  await db.users.update(userId, { passwordHash: newHash });
  await enqueueUserRecordOutbox(userId);
  void publishFarmCloudLogin(user.username, newHash);
}
