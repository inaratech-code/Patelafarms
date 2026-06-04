export const SESSION_KEY = "pf.session.v1";

export type SessionGuardShape = {
  userId: number;
  username: string;
  roleId: number;
  createdAt?: number;
};

/** Parse session from a raw localStorage value (browser-only guard scripts). */
export function parseSessionRaw(raw: string | null): SessionGuardShape | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as SessionGuardShape;
    if (typeof s?.userId !== "number") return null;
    if (typeof s?.username !== "string") return null;
    if (typeof s?.roleId !== "number") return null;
    return s;
  } catch {
    return null;
  }
}

export function readSessionFromStorage(): SessionGuardShape | null {
  if (typeof window === "undefined") return null;
  return parseSessionRaw(localStorage.getItem(SESSION_KEY));
}

export function clearInvalidSessionStorage() {
  if (typeof window === "undefined") return;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return;
  if (parseSessionRaw(raw)) return;
  localStorage.removeItem(SESSION_KEY);
}

/** Inline script for layout `<head>` — must stay ES5-safe (no imports). */
export const SESSION_GUARD_SCRIPT = `(function(){try{var k="pf.session.v1";var p=location.pathname;if(p==="/login"||p==="/users")return;var raw=localStorage.getItem(k);if(!raw){location.replace("/login");return;}try{var s=JSON.parse(raw);if(typeof s.userId!=="number"||typeof s.username!=="string"||typeof s.roleId!=="number"){localStorage.removeItem(k);location.replace("/login");}}catch(e){localStorage.removeItem(k);location.replace("/login");}}catch(e){}})();`;
