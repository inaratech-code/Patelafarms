"use client";

import { db } from "@/lib/db";
import { getSession, sha256Base64 } from "@/lib/auth";

/**
 * Require the currently signed-in user's password before destructive actions.
 * Uses a simple prompt to avoid complex modal plumbing.
 */
export async function requirePasswordConfirm(params: { title?: string; message?: string }) {
  const s = getSession();
  if (!s?.userId) throw new Error("Not signed in");
  const me = await db.users.get(s.userId);
  if (!me?.passwordHash) throw new Error("Your account has no password set");

  const promptMsg = `${params.title ?? "Confirm action"}\n\n${params.message ?? "Enter your password to continue."}`;
  const pwd = window.prompt(promptMsg);
  if (pwd == null) return false; // cancelled
  const hash = await sha256Base64(pwd);
  if (hash !== me.passwordHash) throw new Error("Incorrect password");
  return true;
}

