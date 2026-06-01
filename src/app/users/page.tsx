"use client";

import { Users, UserPlus, Trash2, ShieldPlus, X, Eye, EyeOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Role } from "@/lib/db";
import { getSession, sha256Base64, PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from "@/lib/auth";
import { makeSyncEvent } from "@/lib/syncEvents";
import { ensureFarm, publishFarmCloudLogin, deleteFarmCloudLogin } from "@/lib/farm";
import { ensureSupabaseAuth } from "@/lib/supabaseClient";
import { requirePasswordConfirm } from "@/lib/passwordConfirm";
import {
  MobileCardActions,
  MobileCardHeader,
  MobileDataCard,
  PageRoot,
  ResponsiveTableShell,
} from "@/components/ui/responsive-table";

type PermissionId =
  | "dashboard"
  | "reports"
  | "outstanding"
  | "inventory.items"
  | "inventory.consumption"
  | "inventory.stockMovement"
  | "inventory.lossWastage"
  | "transactions.overview"
  | "transactions.sales"
  | "transactions.purchases"
  | "transactions.expenses"
  | "accounts.ledger"
  | "accounts.dayBook"
  | "accounts.payments"
  | "accounts.accounts"
  | "people.customers"
  | "people.suppliers"
  | "people.workers"
  | "people.users"
  | "alerts"
  | "settings"
  | "farmHealth.vaccines"
  | "farmHealth.doseSchedule"
  | "farmHealth.healthLogs";

/** Matches `sidebarConfig` routes and labels for role-based access configuration. */
const PERMISSION_GROUPS: Array<{
  id: "top" | "inventory" | "transactions" | "accounts" | "farmHealth" | "people" | "bottom";
  label: string;
  items: Array<{ id: PermissionId; label: string }>;
}> = [
  {
    id: "top",
    label: "General",
    items: [
      { id: "dashboard", label: "Dashboard" },
      { id: "reports", label: "Reports" },
      { id: "outstanding", label: "Outstanding" },
    ],
  },
  {
    id: "inventory",
    label: "Inventory",
    items: [
      { id: "inventory.items", label: "Items" },
      { id: "inventory.consumption", label: "Feed usage" },
      { id: "inventory.stockMovement", label: "Stock Movement" },
      { id: "inventory.lossWastage", label: "Loss / Wastage" },
    ],
  },
  {
    id: "transactions",
    label: "Transactions",
    items: [
      { id: "transactions.overview", label: "Overview" },
      { id: "transactions.sales", label: "Sales" },
      { id: "transactions.purchases", label: "Purchases" },
      { id: "transactions.expenses", label: "Expenses" },
    ],
  },
  {
    id: "accounts",
    label: "Accounts",
    items: [
      { id: "accounts.ledger", label: "Ledger" },
      { id: "accounts.dayBook", label: "Day Book" },
      { id: "accounts.payments", label: "Payments" },
      { id: "accounts.accounts", label: "Financial Accounts" },
    ],
  },
  {
    id: "farmHealth",
    label: "Farm Health",
    items: [
      { id: "farmHealth.vaccines", label: "Vaccines" },
      { id: "farmHealth.doseSchedule", label: "Dose Schedule" },
      { id: "farmHealth.healthLogs", label: "Health Logs" },
    ],
  },
  {
    id: "people",
    label: "People",
    items: [
      { id: "people.customers", label: "Customers" },
      { id: "people.suppliers", label: "Suppliers" },
      { id: "people.workers", label: "Workers" },
      { id: "people.users", label: "Users" },
    ],
  },
  {
    id: "bottom",
    label: "System",
    items: [
      { id: "alerts", label: "Alerts" },
      { id: "settings", label: "Settings" },
    ],
  },
];

const DEFAULT_PERMISSIONS = new Set<PermissionId>(["dashboard"]);

function toggleSet<T>(s: Set<T>, value: T, checked: boolean) {
  const next = new Set(s);
  if (checked) next.add(value);
  else next.delete(value);
  return next;
}

function isGroupAllSelected(group: (typeof PERMISSION_GROUPS)[number], selected: Set<PermissionId>) {
  return group.items.every((i) => selected.has(i.id));
}

function isGroupAnySelected(group: (typeof PERMISSION_GROUPS)[number], selected: Set<PermissionId>) {
  return group.items.some((i) => selected.has(i.id));
}

export default function UsersPage() {
  const users = useLiveQuery(() => db.users.toArray());
  const roles = useLiveQuery(() => db.roles.toArray());

  const roleById = useMemo(() => {
    const m = new Map<number, Role>();
    for (const r of roles ?? []) if (typeof r.id === "number") m.set(r.id, r);
    return m;
  }, [roles]);

  const [showCreateRole, setShowCreateRole] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showUserPassword, setShowUserPassword] = useState({ password: false, confirm: false });
  const [userFormError, setUserFormError] = useState<string | null>(null);

  const [roleForm, setRoleForm] = useState({
    name: "",
    description: "",
    permissions: new Set<PermissionId>(DEFAULT_PERMISSIONS),
  });

  const firstRoleId = useMemo(() => {
    const list = roles ?? [];
    return list.find((r) => typeof r.id === "number")?.id ?? 0;
  }, [roles]);

  const [userForm, setUserForm] = useState({
    username: "",
    roleId: 0,
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });

  // Keep roleId defaulted when roles load.
  useEffect(() => {
    if (!firstRoleId) return;
    queueMicrotask(() => setUserForm((v) => (v.roleId ? v : { ...v, roleId: firstRoleId })));
  }, [firstRoleId]);

  useEffect(() => {
    if (!showCreateUser) {
      queueMicrotask(() => {
        setShowUserPassword({ password: false, confirm: false });
        setUserFormError(null);
      });
    }
  }, [showCreateUser]);

  const selectedRole = roleById.get(userForm.roleId);
  const isAdminRole = selectedRole?.name?.toLowerCase?.() === "admin";

  const validateUserForm = (): string | null => {
    const username = userForm.username.trim();
    if (!username) return "Username is required.";
    const duplicate = (users ?? []).some(
      (u) => u.username.trim().toLowerCase() === username.toLowerCase()
    );
    if (duplicate) return "That username is already in use.";
    if (!userForm.roleId) return "Select a role.";
    if (isAdminRole && !userForm.email.trim()) return "Email is required for admin users.";
    if (userForm.password.length < PASSWORD_MIN_LENGTH) {
      return `Password must be at least ${PASSWORD_MIN_LENGTH} characters (${userForm.password.length}/${PASSWORD_MIN_LENGTH}).`;
    }
    if (userForm.password.length > PASSWORD_MAX_LENGTH) {
      return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
    }
    if (userForm.password !== userForm.confirmPassword) return "Passwords do not match.";
    return null;
  };

  const userFormValidationError = validateUserForm();

  const createRole = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = roleForm.name.trim();
    if (!name) return;
    const roleUid =
      typeof globalThis.crypto?.randomUUID === "function"
        ? globalThis.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const newRoleId = await db.roles.add({
      uid: roleUid,
      name,
      description: roleForm.description.trim() || undefined,
      permissions: Array.from(roleForm.permissions) as string[],
    });
    const createdRole = await db.roles.get(newRoleId);
    if (createdRole?.uid) {
      await db.outbox.add(
        makeSyncEvent({
          entityType: "role.record",
          entityId: createdRole.uid,
          op: "create",
          payload: { role: { ...createdRole } },
        })
      );
    }
    setShowCreateRole(false);
    setRoleForm({ name: "", description: "", permissions: new Set<PermissionId>(DEFAULT_PERMISSIONS) });
  };

  const deleteUser = async (user: NonNullable<typeof users>[number]) => {
    if (!user.id) return;
    const session = getSession();
    if (session?.userId === user.id) {
      alert("You cannot delete your own account while signed in.");
      return;
    }
    const ok = await requirePasswordConfirm({
      title: "Delete user",
      message: `Delete user "${user.username}"? This cannot be undone.`,
    });
    if (!ok) return;
    if (user.uid) {
      await db.outbox.add(
        makeSyncEvent({
          entityType: "user.record",
          entityId: user.uid,
          op: "delete",
          payload: { uid: user.uid },
        })
      );
    }
    try {
      await deleteFarmCloudLogin(user.username);
    } catch {
      /* offline or Supabase not configured */
    }
    await db.users.delete(user.id);
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateUserForm();
    if (validationError) {
      setUserFormError(validationError);
      return;
    }

    setUserFormError(null);

    try {
      const passwordHash = await sha256Base64(userForm.password);
      const userUid =
        typeof globalThis.crypto?.randomUUID === "function"
          ? globalThis.crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const newUserId = await db.users.add({
        uid: userUid,
        username: userForm.username.trim(),
        roleId: userForm.roleId,
        email: userForm.email.trim() || undefined,
        phone: userForm.phone.trim() || undefined,
        passwordHash,
      });
      const createdUser = await db.users.get(newUserId);
      const role = await db.roles.get(userForm.roleId);
      if (createdUser?.uid) {
        await db.outbox.add(
          makeSyncEvent({
            entityType: "user.record",
            entityId: createdUser.uid,
            op: "create",
            payload: {
              user: { ...createdUser },
              embeddedRole: role?.uid ? { ...role } : undefined,
            },
          })
        );
      }
      try {
        await ensureSupabaseAuth();
        await ensureFarm();
        await publishFarmCloudLogin(createdUser!.username, passwordHash);
      } catch {
        /* offline or Supabase not configured */
      }
      setShowCreateUser(false);
      setUserForm({
        username: "",
        roleId: firstRoleId || 0,
        email: "",
        phone: "",
        password: "",
        confirmPassword: "",
      });
    } catch (err) {
      setUserFormError(err instanceof Error ? err.message : "Could not create user.");
    }
  };

  return (
    <PageRoot>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-semibold text-slate-900">User Management</h1>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => setShowCreateRole(true)}
            className="flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <ShieldPlus className="w-5 h-5" />
            <span>Create Role</span>
          </button>
          <button
            onClick={() => setShowCreateUser(true)}
            className="flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            disabled={!roles || roles.length === 0}
            title={!roles || roles.length === 0 ? "Create a role first" : undefined}
          >
            <UserPlus className="w-5 h-5" />
            <span>Create User</span>
          </button>
        </div>
      </div>

      {/* Create Role Modal */}
      {showCreateRole ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setShowCreateRole(false)} />
          <div className="relative w-[760px] max-w-[96vw] rounded-2xl bg-white border border-slate-200 shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold text-slate-900">Create Role</div>
                <div className="text-sm text-slate-500">Choose which sections this role can access.</div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateRole(false)}
                className="p-2 rounded-md hover:bg-slate-50 text-slate-600"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={createRole} className="p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Role Name *</label>
                  <input
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder="e.g. manager"
                    value={roleForm.name}
                    onChange={(e) => setRoleForm((v) => ({ ...v, name: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <input
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder="Optional"
                    value={roleForm.description}
                    onChange={(e) => setRoleForm((v) => ({ ...v, description: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-900">Permissions *</div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-200 hover:bg-slate-50"
                      onClick={() => setRoleForm((v) => ({ ...v, permissions: new Set(DEFAULT_PERMISSIONS) }))}
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1.5 text-xs font-semibold rounded-md bg-primary text-white hover:bg-primary/90"
                      onClick={() => {
                        const all = new Set<PermissionId>();
                        for (const g of PERMISSION_GROUPS) for (const i of g.items) all.add(i.id);
                        // Always keep dashboard enabled
                        all.add("dashboard");
                        setRoleForm((v) => ({ ...v, permissions: all }));
                      }}
                    >
                      Select all
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                  <div className="max-h-[52vh] overflow-auto">
                    {PERMISSION_GROUPS.map((group) => {
                      const allSelected = isGroupAllSelected(group, roleForm.permissions);
                      const anySelected = isGroupAnySelected(group, roleForm.permissions);
                      return (
                        <div key={group.id} className="border-t border-slate-200 first:border-t-0">
                          <div className="px-4 py-3 bg-slate-50 flex items-center justify-between">
                            <div className="text-sm font-semibold text-slate-900">{group.label}</div>
                            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 select-none">
                              <input
                                type="checkbox"
                                checked={allSelected}
                                ref={(el) => {
                                  if (!el) return;
                                  el.indeterminate = anySelected && !allSelected;
                                }}
                                onChange={(e) => {
                                  const next = new Set(roleForm.permissions);
                                  for (const item of group.items) {
                                    if (item.id === "dashboard") continue; // keep always on
                                    if (e.target.checked) next.add(item.id);
                                    else next.delete(item.id);
                                  }
                                  next.add("dashboard");
                                  setRoleForm((v) => ({ ...v, permissions: next }));
                                }}
                                className="h-4 w-4 accent-primary"
                              />
                              All
                            </label>
                          </div>

                          <div className="divide-y divide-slate-100">
                            {group.items.map((item) => {
                              const checked = roleForm.permissions.has(item.id);
                              const disabled = item.id === "dashboard";
                              return (
                                <label key={item.id} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
                                  <span className={`text-sm ${disabled ? "text-slate-500" : "text-slate-900"}`}>
                                    {item.label}
                                  </span>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={disabled}
                                    onChange={(e) => {
                                      const next = toggleSet(roleForm.permissions, item.id, e.target.checked);
                                      next.add("dashboard");
                                      setRoleForm((v) => ({ ...v, permissions: next }));
                                    }}
                                    className="h-4 w-4 accent-primary"
                                  />
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCreateRole(false)}
                  className="px-4 py-2 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2 rounded-md bg-primary text-white font-semibold hover:bg-primary/90">
                  Create Role
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Create User Modal */}
      {showCreateUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setShowCreateUser(false)} />
          <div className="relative w-[760px] max-w-[96vw] rounded-2xl bg-white border border-slate-200 shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold text-slate-900">Create User</div>
                <div className="text-sm text-slate-500">Add a user and assign a role.</div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateUser(false)}
                className="p-2 rounded-md hover:bg-slate-50 text-slate-600"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={createUser} className="p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Username *</label>
                  <input
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder="e.g. ram"
                    value={userForm.username}
                    onChange={(e) => setUserForm((v) => ({ ...v, username: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Role *</label>
                  <select
                    value={userForm.roleId}
                    onChange={(e) => setUserForm((v) => ({ ...v, roleId: Number(e.target.value) }))}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    {(roles ?? []).map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  {selectedRole?.description ? (
                    <div className="mt-1 text-xs text-slate-500">{selectedRole.description}</div>
                  ) : null}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Email {isAdminRole ? "*" : "(optional)"}
                  </label>
                  <input
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder="name@example.com"
                    value={userForm.email}
                    onChange={(e) => setUserForm((v) => ({ ...v, email: e.target.value }))}
                    required={Boolean(isAdminRole)}
                  />
                  {isAdminRole ? <div className="mt-1 text-xs text-slate-500">Required for admin users.</div> : null}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Phone (optional)</label>
                  <input
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder="98XXXXXXXX"
                    value={userForm.phone}
                    onChange={(e) => setUserForm((v) => ({ ...v, phone: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Password *</label>
                  <div className="relative">
                    <input
                      type={showUserPassword.password ? "text" : "password"}
                      className="w-full rounded-md border border-slate-200 bg-white pl-3 pr-11 py-2 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      placeholder={`${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters`}
                      value={userForm.password}
                      onChange={(e) => {
                        setUserFormError(null);
                        setUserForm((v) => ({ ...v, password: e.target.value }));
                      }}
                      minLength={PASSWORD_MIN_LENGTH}
                      maxLength={PASSWORD_MAX_LENGTH}
                      required
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowUserPassword((s) => ({ ...s, password: !s.password }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                      aria-label={showUserPassword.password ? "Hide password" : "Show password"}
                    >
                      {showUserPassword.password ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <div
                    className={`mt-1 text-xs ${
                      userForm.password.length > 0 && userForm.password.length < PASSWORD_MIN_LENGTH
                        ? "text-rose-600"
                        : "text-slate-500"
                    }`}
                  >
                    {userForm.password.length}/{PASSWORD_MAX_LENGTH}
                    {userForm.password.length > 0 && userForm.password.length < PASSWORD_MIN_LENGTH
                      ? ` — at least ${PASSWORD_MIN_LENGTH} characters required`
                      : null}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Confirm Password *</label>
                  <div className="relative">
                    <input
                      type={showUserPassword.confirm ? "text" : "password"}
                      className="w-full rounded-md border border-slate-200 bg-white pl-3 pr-11 py-2 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      placeholder="Re-enter password"
                      value={userForm.confirmPassword}
                      onChange={(e) => {
                        setUserFormError(null);
                        setUserForm((v) => ({ ...v, confirmPassword: e.target.value }));
                      }}
                      minLength={PASSWORD_MIN_LENGTH}
                      maxLength={PASSWORD_MAX_LENGTH}
                      required
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowUserPassword((s) => ({ ...s, confirm: !s.confirm }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                      aria-label={showUserPassword.confirm ? "Hide confirm password" : "Show confirm password"}
                    >
                      {showUserPassword.confirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <div
                    className={`mt-1 text-xs ${
                      userForm.confirmPassword.length > 0 && userForm.password !== userForm.confirmPassword
                        ? "text-rose-600"
                        : "text-slate-500"
                    }`}
                  >
                    {userForm.confirmPassword.length}/{PASSWORD_MAX_LENGTH}
                    {userForm.confirmPassword.length > 0 && userForm.password !== userForm.confirmPassword
                      ? " — passwords do not match"
                      : null}
                  </div>
                </div>
              </div>

              {userFormError ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {userFormError}
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCreateUser(false)}
                  className="px-4 py-2 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-md bg-primary text-white font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary"
                  disabled={Boolean(userFormValidationError)}
                >
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {!users || users.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-8 text-center text-slate-500">
            <Users className="w-12 h-12 mx-auto mb-4 text-slate-300" />
            <p className="text-lg font-medium text-slate-900">No users found</p>
            <p className="mt-1">Add workers, managers, or admins to the system.</p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden min-w-0">
          <ResponsiveTableShell
            mobile={users.map((user) => {
              const isSelf = getSession()?.userId === user.id;
              return (
                <MobileDataCard key={user.id}>
                  <MobileCardHeader
                    title={
                      <span className="inline-flex items-center gap-2">
                        <span className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-semibold shrink-0">
                          {user.username.charAt(0).toUpperCase()}
                        </span>
                        {user.username}
                      </span>
                    }
                  />
                  <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                    <span className="px-2 py-1 rounded text-xs font-medium bg-slate-100 text-slate-700">
                      {roleById.get(user.roleId)?.name ?? "role"}
                    </span>
                    <span>{user.phone || "No phone"}</span>
                  </div>
                  <MobileCardActions>
                    <button
                      type="button"
                      onClick={() => void deleteUser(user)}
                      disabled={isSelf}
                      title={isSelf ? "You cannot delete your own account" : `Delete ${user.username}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-rose-200 text-alert-red text-sm font-medium hover:bg-rose-50 disabled:opacity-40 disabled:hover:bg-transparent"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </MobileCardActions>
                </MobileDataCard>
              );
            })}
          >
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Role</th>
                  <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Phone</th>
                  <th className="px-4 lg:px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {users.map((user) => {
                  const isSelf = getSession()?.userId === user.id;
                  return (
                    <tr key={user.id}>
                      <td className="px-4 lg:px-6 py-4 text-sm font-medium text-slate-900">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-semibold shrink-0">
                            {user.username.charAt(0).toUpperCase()}
                          </div>
                          {user.username}
                        </div>
                      </td>
                      <td className="px-4 lg:px-6 py-4 text-sm text-slate-500">
                        <span className="px-2 py-1 rounded text-xs font-medium bg-slate-100 text-slate-700">
                          {roleById.get(user.roleId)?.name ?? "role"}
                        </span>
                      </td>
                      <td className="px-4 lg:px-6 py-4 text-sm text-slate-500">{user.phone || "-"}</td>
                      <td className="px-4 lg:px-6 py-4 text-right text-sm font-medium">
                        <button
                          type="button"
                          onClick={() => void deleteUser(user)}
                          disabled={isSelf}
                          title={isSelf ? "You cannot delete your own account" : `Delete ${user.username}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-rose-200 text-alert-red font-medium hover:bg-rose-50 disabled:opacity-40 disabled:hover:bg-transparent"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ResponsiveTableShell>
        </div>
      )}
    </PageRoot>
  );
}
