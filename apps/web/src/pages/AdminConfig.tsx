import type { AuthUser } from "../lib/auth";
import { canAccessAdminTab } from "../lib/permissions";
import { AdminProvider, useAdmin } from "./admin/AdminContext";
import { AdminSidebar } from "./admin/components/AdminSidebar";
import { AdminToast, adminStyles, EmptyState } from "./admin/components/AdminUi";
import { ADMIN_VIEWS } from "./admin/views";

function AdminShell() {
  const { activeTab, toastMsg, toastType, accessibleTabs, canAccessTab } = useAdmin();
  const View = ADMIN_VIEWS[activeTab];

  if (accessibleTabs.length === 0) {
    return (
      <EmptyState text="No tienes permisos para ninguna sección de administración." />
    );
  }

  if (!canAccessTab(activeTab)) {
    return (
      <EmptyState text="No tienes permiso para ver esta sección." />
    );
  }

  return (
    <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
      <AdminSidebar />
      <div style={{ flex: 1, minWidth: 0, ...adminStyles.page }}>
        <AdminToast msg={toastMsg} type={toastType} />
        <View />
      </div>
    </div>
  );
}

export default function AdminConfig({
  branchId,
  companyId,
  user,
}: {
  branchId: string;
  companyId?: string;
  user: AuthUser;
}) {
  return (
    <AdminProvider branchId={branchId} companyId={companyId} user={user}>
      <AdminShell />
    </AdminProvider>
  );
}
