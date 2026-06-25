import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AuthUser } from "../../lib/auth";
import { canAccessAdminTab, getAccessibleAdminTabs } from "../../lib/permissions";
import { setBranchId } from "../../lib/api";
import type { AdminTab } from "./types";

type AdminContextValue = {
  branchId: string;
  companyId?: string;
  user: AuthUser;
  permissions: string[];
  accessibleTabs: AdminTab[];
  canAccessTab: (tab: AdminTab) => boolean;
  activeTab: AdminTab;
  setActiveTab: (tab: AdminTab) => void;
  toast: (msg: string, type?: "ok" | "err") => void;
  toastMsg: string;
  toastType: "ok" | "err";
};

const AdminContext = createContext<AdminContextValue | null>(null);

export function AdminProvider({
  branchId,
  companyId,
  user,
  children,
}: {
  branchId: string;
  companyId?: string;
  user: AuthUser;
  children: ReactNode;
}) {
  const accessibleTabs = useMemo(() => getAccessibleAdminTabs(user), [user]);
  const [activeTab, setActiveTabState] = useState<AdminTab>("overview");
  const [toastMsg, setToastMsg] = useState("");
  const [toastType, setToastType] = useState<"ok" | "err">("ok");

  const permissions = user.permissions ?? [];

  useEffect(() => {
    setBranchId(branchId);
  }, [branchId]);

  useEffect(() => {
    if (!accessibleTabs.length) return;
    if (!accessibleTabs.includes(activeTab)) {
      setActiveTabState(accessibleTabs.includes("overview") ? "overview" : accessibleTabs[0]);
    }
  }, [accessibleTabs, activeTab]);

  function setActiveTab(tab: AdminTab) {
    if (canAccessAdminTab(user, tab)) setActiveTabState(tab);
  }

  function toast(msg: string, type: "ok" | "err" = "ok") {
    setToastMsg(msg);
    setToastType(type);
    setTimeout(() => setToastMsg(""), 3000);
  }

  return (
    <AdminContext.Provider
      value={{
        branchId,
        companyId,
        user,
        permissions,
        accessibleTabs,
        canAccessTab: (tab) => canAccessAdminTab(user, tab),
        activeTab,
        setActiveTab,
        toast,
        toastMsg,
        toastType,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin outside AdminProvider");
  return ctx;
}
