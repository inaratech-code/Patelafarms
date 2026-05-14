// Client-side check using Have I Been Pwned's k-anonymity API.
// We only send the first 5 hex chars of SHA-1(password) to the service.

const RANGE_ENDPOINT = "https://api.pwnedpasswords.com/range/";

type RangeCacheEntry = {
  at: number;
  suffixes: Set<string>;
};

// Cache by 5-char prefix to avoid repeated network calls.
const rangeCache = new Map<string, RangeCacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000;

function toHex(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

async function sha1HexUpper(input: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("Secure crypto unavailable in this browser.");
  const enc = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-1", enc);
  const hex = toHex(new Uint8Array(hash));
  return hex.toUpperCase();
}

async function fetchRange(prefix5: string): Promise<Set<string>> {
  const now = Date.now();
  const cached = rangeCache.get(prefix5);
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.suffixes;

  const res = await fetch(`${RANGE_ENDPOINT}${prefix5}`, {
    method: "GET",
    headers: {
      // Explicit UA for HIBP guidance; safe even if ignored.
      "Add-Padding": "true",
    },
  });
  if (!res.ok) throw new Error(`Pwned Passwords range check failed (HTTP ${res.status})`);
  const text = await res.text();
  const suffixes = new Set<string>();
  for (const line of text.split("\n")) {
    const [suffix] = line.trim().split(":");
    if (suffix && /^[0-9A-F]{35}$/.test(suffix)) suffixes.add(suffix);
  }
  rangeCache.set(prefix5, { at: now, suffixes });
  return suffixes;
}

/**
 * Returns true if the password appears in known breaches (HIBP Pwned Passwords).
 * If the check can't be performed (offline / blocked), returns false.
 */
export async function isPasswordPwned(password: string): Promise<boolean> {
  const pwd = password ?? "";
  if (pwd.length < 1) return false;
  try {
    const sha1 = await sha1HexUpper(pwd);
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    const suffixes = await fetchRange(prefix);
    return suffixes.has(suffix);
  } catch {
    // Don't lock users out when offline or blocked; treat as unknown.
    return false;
  }
}

