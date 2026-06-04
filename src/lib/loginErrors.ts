/** User-facing login error messages (do not leak whether username exists on cloud). */
export function formatLoginError(message: string, hasLocalUsers: boolean): string {
  if (message === "Incorrect password.") return message;
  if (message === "Invalid password") return "Incorrect password.";
  if (message === "User not found") {
    return hasLocalUsers
      ? "Incorrect username or password."
      : "Incorrect username or password. On your main device: sign in → Settings → Sync now, then try again here (internet required).";
  }
  if (/could not link this device/i.test(message)) return message;
  if (/farm linked but no users/i.test(message)) return message;
  if (message === "User has no password set") {
    return "This account has no password yet. Ask an administrator to set one from User Management.";
  }
  if (message === "Password is required" || message === "Username is required") {
    return message;
  }
  if (/anonymous sign-in is disabled/i.test(message)) return message;
  if (/supabase env vars missing/i.test(message)) {
    return "Server sync is not configured. Contact support, or sign in on a device that already has your account.";
  }
  return message;
}
