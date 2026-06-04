import { db } from "@/lib/db";
import { enqueueUserRecordOutbox, publishAllCloudLoginsFromDexie } from "@/lib/sync";
import { ensureFarm, publishFarmCloudLogin } from "@/lib/farm";
import { ensureSupabaseAuth, getSupabaseClient } from "@/lib/supabaseClient";

export const SESSION_KEY = "pf.session.v1";
export const LAST_ACTIVE_KEY = "pf.lastActiveAt.v1";
/** Set on sign-in so the app lands on `/` once before other route guards run. */
export const POST_LOGIN_HOME_KEY = "pf.postLoginHome.v1";
export const DASHBOARD_PATH = "/";
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 64;

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

export function notifySessionChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("pf-session-change"));
}

export function setSession(session: Omit<Session, "createdAt">) {
  if (typeof window === "undefined") return;
  const now = Date.now();
  const full: Session = { ...session, createdAt: now };
  localStorage.setItem(SESSION_KEY, JSON.stringify(full));
  // Fresh sign-in must not inherit a stale idle timestamp (would instant-logout).
  localStorage.setItem(LAST_ACTIVE_KEY, String(now));
  sessionStorage.setItem(POST_LOGIN_HOME_KEY, "1");
  notifySessionChanged();
}

export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
  notifySessionChanged();
}

export async function sha256Base64(input: string) {
  if (!globalThis.crypto?.subtle) throw new Error("Secure crypto unavailable in this browser.");
  const enc = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", enc);
  const bytes = new Uint8Array(hash);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function validateNewPasswordOrThrow(newPassword: string) {
  const pwd = newPassword ?? "";
  // Keep max short to match existing UI and avoid accidental clipboard disasters.
  if (pwd.length < PASSWORD_MIN_LENGTH || pwd.length > PASSWORD_MAX_LENGTH) {
    throw new Error(`New password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters`);
  }
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
  if (hash !== user.passwordHash) throw new Error("Incorrect password.");

  setSession({ userId: user.id, username: user.username, roleId: user.roleId });

  void (async () => {
    try {
      getSupabaseClient();
      await ensureSupabaseAuth();
      await ensureFarm();
      await publishFarmCloudLogin(user.username, hash);
      await publishAllCloudLoginsFromDexie();
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
  await validateNewPasswordOrThrow(newPassword);
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
