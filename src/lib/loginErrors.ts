/** User-facing login error messages (do not leak whether username exists on cloud). */
export function formatLoginError(message: string, hasLocalUsers: boolean): string {
  if (message === "Incorrect password.") return message;
  if (message === "Invalid password") return "Incorrect password.";
  if (message === "User not found") {
    return hasLocalUsers
      ? "Incorrect username or password."
      : "Incorrect username or password. On a new device, use the same credentials as your main device after Settings → Sync once, or join with a farm code.";
  }
  if (message === "User has no password set") {
    return "This account has no password yet. Ask an administrator to set one from User Management.";
  }
  if (message === "Password is required" || message === "Username is required") {
    return message;
  }
  return message;
}
