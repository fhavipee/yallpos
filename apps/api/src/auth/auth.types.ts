import { UserRole } from "@prisma/client";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  roleId?: string | null;
  roleName?: string | null;
  permissions: string[];
  tenantId: string;
  tenantName: string;
};

export const MANAGEMENT_ROLES: UserRole[] = [UserRole.owner, UserRole.manager];
export const FLOOR_ROLES: UserRole[] = [
  UserRole.owner,
  UserRole.manager,
  UserRole.cashier,
  UserRole.waiter,
];
export const CASH_ROLES: UserRole[] = [UserRole.owner, UserRole.manager, UserRole.cashier];
export const KITCHEN_ROLES: UserRole[] = [UserRole.owner, UserRole.manager, UserRole.kitchen];
export const BACKOFFICE_ROLES: UserRole[] = [
  UserRole.owner,
  UserRole.manager,
  UserRole.cashier,
  UserRole.kitchen,
  UserRole.baker,
];
