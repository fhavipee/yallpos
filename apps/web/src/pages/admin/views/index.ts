import type { ComponentType } from "react";
import type { AdminTab } from "../types";
import AdminOverviewView from "./AdminOverviewView";
import AdminBranchView from "./AdminBranchView";
import AdminCompanyView from "./AdminCompanyView";
import AdminCategoriesView from "./AdminCategoriesView";
import AdminProductsView from "./AdminProductsView";
import AdminTaxesView from "./AdminTaxesView";
import AdminDailyMenuView from "./AdminDailyMenuView";
import AdminFloorView from "./AdminFloorView";
import AdminStaffView from "./AdminStaffView";
import AdminShiftsView from "./AdminShiftsView";
import AdminUsersView from "./AdminUsersView";
import AdminRolesView from "./AdminRolesView";
import AdminKdsView from "./AdminKdsView";
import AdminCashView from "./AdminCashView";
import AdminInventoryView from "./AdminInventoryView";
import AdminModifiersView from "./AdminModifiersView";
import AdminOperationsView from "./AdminOperationsView";
import AdminFiscalView from "./AdminFiscalView";
import AdminCustomersView from "./AdminCustomersView";
import AdminPaymentsView from "./AdminPaymentsView";
import AdminOnboardingView from "./AdminOnboardingView";
import AdminAuditView from "./AdminAuditView";

export const ADMIN_VIEWS: Record<AdminTab, ComponentType> = {
  overview: AdminOverviewView,
  branch: AdminBranchView,
  company: AdminCompanyView,
  categories: AdminCategoriesView,
  products: AdminProductsView,
  taxes: AdminTaxesView,
  "daily-menu": AdminDailyMenuView,
  floor: AdminFloorView,
  staff: AdminStaffView,
  shifts: AdminShiftsView,
  users: AdminUsersView,
  roles: AdminRolesView,
  kds: AdminKdsView,
  cash: AdminCashView,
  inventory: AdminInventoryView,
  modifiers: AdminModifiersView,
  operations: AdminOperationsView,
  fiscal: AdminFiscalView,
  customers: AdminCustomersView,
  payments: AdminPaymentsView,
  onboarding: AdminOnboardingView,
  audit: AdminAuditView,
};
