import { UserRole } from "@prisma/client";

export type PermissionDef = {
  key: string;
  label: string;
  group: string;
  description?: string;
};

export const PERMISSION_CATALOG: PermissionDef[] = [
  { key: "admin.access", label: "Acceso administración", group: "Administración", description: "Pestaña Admin y parametrización" },
  { key: "admin.users", label: "Gestionar usuarios", group: "Administración" },
  { key: "admin.roles", label: "Gestionar roles", group: "Administración" },
  { key: "settings.manage", label: "Configuración sucursal", group: "Administración" },
  { key: "fiscal.manage", label: "Fiscal / DIAN", group: "Administración" },
  { key: "catalog.manage", label: "Catálogo completo", group: "Catálogo" },
  { key: "catalog.view", label: "Ver catálogo", group: "Catálogo" },
  { key: "pos.floor", label: "Mesas y pedidos", group: "Operación POS" },
  { key: "pos.cash", label: "Caja y cobros", group: "Operación POS" },
  { key: "pos.void", label: "Anular facturas", group: "Operación POS" },
  { key: "kds.view", label: "Pantalla KDS", group: "Operación POS" },
  { key: "reports.view", label: "Reportes", group: "Reportes" },
  { key: "cash.session", label: "Sesiones de caja", group: "Caja" },
  { key: "staff.clock", label: "Marcar asistencia", group: "Asistencia", description: "Llegada/salida con huella o PIN" },
  { key: "staff.manage", label: "Gestionar turnos", group: "Asistencia", description: "Programar turnos y ver quién está en el local" },
];

export const ALL_PERMISSION_KEYS = PERMISSION_CATALOG.map((p) => p.key);

export const ROLE_REQUIRED_PERMISSIONS: Record<UserRole, string[]> = {
  owner: [],
  manager: ["admin.access"],
  cashier: ["pos.cash"],
  waiter: ["pos.floor"],
  kitchen: ["kds.view"],
  baker: ["catalog.view"],
};

export type SystemRoleTemplate = {
  slug: string;
  name: string;
  legacyRole: UserRole;
  description: string;
  permissions: string[];
};

export const SYSTEM_ROLE_TEMPLATES: SystemRoleTemplate[] = [
  {
    slug: "owner",
    name: "Propietario",
    legacyRole: "owner",
    description: "Acceso total al tenant",
    permissions: ["*"],
  },
  {
    slug: "manager",
    name: "Gerente",
    legacyRole: "manager",
    description: "Administración y operación",
    permissions: [
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
      "staff.clock",
      "staff.manage",
    ],
  },
  {
    slug: "cashier",
    name: "Cajero",
    legacyRole: "cashier",
    description: "Caja, cobros y mesas",
    permissions: ["pos.floor", "pos.cash", "pos.void", "catalog.view", "cash.session", "staff.clock"],
  },
  {
    slug: "waiter",
    name: "Mesero",
    legacyRole: "waiter",
    description: "Mesas, pedidos y modo mesero",
    permissions: ["pos.floor", "catalog.view", "staff.clock"],
  },
  {
    slug: "kitchen",
    name: "Cocina",
    legacyRole: "kitchen",
    description: "Pantalla KDS",
    permissions: ["kds.view", "staff.clock"],
  },
  {
    slug: "baker",
    name: "Panadero",
    legacyRole: "baker",
    description: "Catálogo operativo",
    permissions: ["catalog.view", "catalog.manage", "staff.clock"],
  },
];

export function hasPermission(userPermissions: string[] | undefined, permission: string): boolean {
  if (!userPermissions?.length) return false;
  if (userPermissions.includes("*")) return true;
  return userPermissions.includes(permission);
}

export function satisfiesLegacyRole(userPermissions: string[] | undefined, legacyRole: UserRole, userEnumRole?: UserRole): boolean {
  if (userEnumRole === legacyRole) return true;
  if (legacyRole === "owner") return hasPermission(userPermissions, "*");
  const required = ROLE_REQUIRED_PERMISSIONS[legacyRole];
  if (!required.length) return false;
  return required.every((p) => hasPermission(userPermissions, p));
}
