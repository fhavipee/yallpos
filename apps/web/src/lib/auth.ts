export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  roleId?: string | null;
  roleName?: string | null;
  permissions?: string[];
  tenantId: string;
  tenantName: string;
};

const TOKEN_KEY = "yallpos_token";
const USER_KEY = "yallpos_user";

export function getStoredAuth(): { token: string; user: AuthUser } | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const raw = localStorage.getItem(USER_KEY);
  if (!token || !raw) return null;
  try {
    return { token, user: JSON.parse(raw) };
  } catch {
    return null;
  }
}

export function saveAuth(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/** Refresca permisos y rol desde el servidor (sin pedir contraseña de nuevo). */
export async function refreshStoredUser(apiGetMe: () => Promise<{ user: AuthUser }>): Promise<AuthUser | null> {
  const stored = getStoredAuth();
  if (!stored) return null;
  try {
    const { user } = await apiGetMe();
    saveAuth(stored.token, user);
    return user;
  } catch {
    clearAuth();
    return null;
  }
}

export {
  canAccessAdmin,
  canManageConfig,
  canManageRoles,
  canVoidInvoice,
  canViewCash,
  canViewDashboard,
  canViewFloor,
  canViewKds,
  canViewSettings,
  hasPermission,
} from "./permissions";
