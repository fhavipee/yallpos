import type { AuthUser } from "./auth";
import type { AdminTab } from "../pages/admin/types";

const LEGACY_ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: ["*"],
  manager: [
    "admin.access",
    "admin.users",
    "admin.roles",
    "settings.manage",
    "fiscal.manage",
    "catalog.manage",
    "pos.floor",
    "pos.cash",
    "pos.void",
    "kds.view",
    "reports.view",
    "cash.session",
  ],
  cashier: ["pos.floor", "pos.cash", "pos.void", "catalog.view", "cash.session"],
  waiter: ["pos.floor", "catalog.view"],
  kitchen: ["kds.view"],
  baker: ["catalog.view", "catalog.manage"],
};

export function getUserPermissions(user?: AuthUser | null): string[] {
  if (user?.permissions?.length) return user.permissions;
  if (user?.role && LEGACY_ROLE_PERMISSIONS[user.role]) return LEGACY_ROLE_PERMISSIONS[user.role];
  return [];
}

export function hasPermission(user: AuthUser | null | undefined, permission: string): boolean {
  const perms = getUserPermissions(user);
  if (perms.includes("*")) return true;
  return perms.includes(permission);
}

export function hasAllPermissions(user: AuthUser | null | undefined, permissions: string[]): boolean {
  if (!permissions.length) return true;
  if (hasPermission(user, "*")) return true;
  return permissions.every((p) => hasPermission(user, p));
}

/** Permisos requeridos por pestaña del módulo Admin (todas deben cumplirse). */
export const ADMIN_TAB_PERMISSIONS: Record<AdminTab, string[]> = {
  overview: ["admin.access"],
  branch: ["admin.access", "settings.manage"],
  company: ["admin.access", "settings.manage"],
  categories: ["admin.access", "catalog.manage"],
  products: ["admin.access", "catalog.manage"],
  taxes: ["admin.access", "catalog.manage"],
  modifiers: ["admin.access", "catalog.manage"],
  "daily-menu": ["admin.access", "catalog.manage"],
  floor: ["admin.access", "settings.manage"],
  staff: ["admin.access", "settings.manage"],
  shifts: ["admin.access", "reports.view"],
  users: ["admin.access", "admin.users"],
  roles: ["admin.access", "admin.roles"],
  kds: ["admin.access", "settings.manage"],
  cash: ["admin.access", "settings.manage"],
  inventory: ["admin.access", "settings.manage"],
  operations: ["admin.access", "settings.manage"],
  payments: ["admin.access", "settings.manage"],
  customers: ["admin.access", "settings.manage"],
  fiscal: ["admin.access", "fiscal.manage"],
  onboarding: ["admin.access"],
  audit: ["admin.access"],
};

export function canAccessAdminTab(user: AuthUser | null | undefined, tab: AdminTab): boolean {
  return hasAllPermissions(user, ADMIN_TAB_PERMISSIONS[tab]);
}

export function getAccessibleAdminTabs(user: AuthUser | null | undefined): AdminTab[] {
  return (Object.keys(ADMIN_TAB_PERMISSIONS) as AdminTab[]).filter((tab) => canAccessAdminTab(user, tab));
}

export function canAccessAdmin(user: AuthUser | null | undefined): boolean {
  return getAccessibleAdminTabs(user).length > 0;
}

export function canManageConfig(user?: AuthUser | null): boolean {
  return canAccessAdmin(user);
}

export function canManageRoles(user?: AuthUser | null): boolean {
  return hasPermission(user, "admin.roles");
}

export function canVoidInvoice(user?: AuthUser | null): boolean {
  return (
    hasPermission(user, "pos.void") ||
    user?.role === "owner" ||
    user?.role === "manager" ||
    user?.role === "cashier"
  );
}

export function canViewKds(user?: AuthUser | null): boolean {
  return hasPermission(user, "kds.view") || user?.role === "kitchen" || user?.role === "owner" || user?.role === "manager";
}

export function canViewFloor(user?: AuthUser | null): boolean {
  return (
    hasPermission(user, "pos.floor") ||
    user?.role === "waiter" ||
    user?.role === "cashier" ||
    user?.role === "owner" ||
    user?.role === "manager"
  );
}

export function canViewCash(user?: AuthUser | null): boolean {
  return (
    hasPermission(user, "pos.cash") ||
    user?.role === "cashier" ||
    user?.role === "owner" ||
    user?.role === "manager"
  );
}

export function canViewDashboard(user?: AuthUser | null): boolean {
  return hasPermission(user, "reports.view") || hasPermission(user, "admin.access");
}

export function canViewSettings(user?: AuthUser | null): boolean {
  return hasPermission(user, "settings.manage") || hasPermission(user, "admin.access") || canViewFloor(user);
}
