"use client";

/**
 * ClientShell – Mounts the full React SPA inside Next.js.
 *
 * This approach wraps the existing React Router-based SPA in a "use client"
 * boundary. All existing pages, stores, hooks and components work without
 * changes. Individual routes can be extracted to Next.js Server Components
 * incrementally.
 *
 * The shell is mounted at the (admin), (portal) and other layout pages.
 */

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Suspense, lazy } from "react";
import { CustomerMagicSessionRedirect } from "./auth/CustomerMagicSessionRedirect";
import { OfflineIndicator } from "./layout/OfflineIndicator";
import { AppShell } from "./layout/AppShell";
import { useAuth } from "../hooks/useAuth";
import { isCompanyWorkspaceRole } from "../lib/companyRoles";
import { isPublicBookingHost } from "../lib/publicBookingHost";
import { isKundenRole } from "../lib/permissions";
import type { ReactElement } from "react";
import type { Role } from "../types";

// Lazy-load all pages from the legacy pages directory
const LoginPage = lazy(() => import("../pages-legacy/LoginPage").then((m) => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import("../pages-legacy/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const OrdersPage = lazy(() => import("../pages-legacy/OrdersPage").then((m) => ({ default: m.OrdersPage })));
const UploadsPage = lazy(() => import("../pages-legacy/UploadsPage").then((m) => ({ default: m.UploadsPage })));
const CalendarPage = lazy(() => import("../pages-legacy/CalendarPage").then((m) => ({ default: m.CalendarPage })));
const CustomersPage = lazy(() => import("../pages-legacy/CustomersPage").then((m) => ({ default: m.CustomersPage })));
const ProductsPage = lazy(() => import("../pages-legacy/ProductsPage").then((m) => ({ default: m.ProductsPage })));
const DiscountCodesPage = lazy(() => import("../pages-legacy/DiscountCodesPage").then((m) => ({ default: m.DiscountCodesPage })));
const ConfigurationPage = lazy(() => import("../pages-legacy/ConfigurationPage").then((m) => ({ default: m.ConfigurationPage })));
const BugsPage = lazy(() => import("../pages-legacy/BugsPage").then((m) => ({ default: m.BugsPage })));
const BackupsPage = lazy(() => import("../pages-legacy/BackupsPage").then((m) => ({ default: m.BackupsPage })));
const PrintOrderPage = lazy(() => import("../pages-legacy/PrintOrderPage").then((m) => ({ default: m.PrintOrderPage })));
const ConfirmBookingPage = lazy(() => import("../pages-legacy/ConfirmBookingPage").then((m) => ({ default: m.ConfirmBookingPage })));
const EmailTemplatesPage = lazy(() => import("../pages-legacy/EmailTemplatesPage").then((m) => ({ default: m.EmailTemplatesPage })));
const CalendarTemplatesPage = lazy(() => import("../pages-legacy/CalendarTemplatesPage").then((m) => ({ default: m.CalendarTemplatesPage })));
const ReviewsPage = lazy(() => import("../pages-legacy/ReviewsPage").then((m) => ({ default: m.ReviewsPage })));
const ChangelogPage = lazy(() => import("../pages-legacy/ChangelogPage").then((m) => ({ default: m.ChangelogPage })));
const ExxasReconcilePage = lazy(() => import("../pages-legacy/ExxasReconcilePage").then((m) => ({ default: m.ExxasReconcilePage })));
const AdminUsersPage = lazy(() => import("../pages-legacy/AdminUsersPage").then((m) => ({ default: m.AdminUsersPage })));
const CompanyManagementPage = lazy(() => import("../pages-legacy/CompanyManagementPage").then((m) => ({ default: m.CompanyManagementPage })));
const RolesPage = lazy(() => import("../pages-legacy/RolesPage").then((m) => ({ default: m.RolesPage })));
const PortalFirmaPage = lazy(() => import("../pages-legacy/PortalFirmaPage").then((m) => ({ default: m.PortalFirmaPage })));
const PortalBestellungenPage = lazy(() => import("../pages-legacy/PortalBestellungenPage").then((m) => ({ default: m.PortalBestellungenPage })));
const BookingWizardPage = lazy(() => import("../pages-legacy/BookingWizardPage").then((m) => ({ default: m.BookingWizardPage })));
const AccountDashboardPage = lazy(() => import("../pages-legacy/AccountDashboardPage").then((m) => ({ default: m.AccountDashboardPage })));
const CompanyDashboardPage = lazy(() => import("../pages-legacy/CompanyDashboardPage").then((m) => ({ default: m.CompanyDashboardPage })));

// Tours Admin pages
const ToursAdminDashboardPage = lazy(() => import("../pages-legacy/tours/admin/ToursAdminDashboardPage").then((m) => ({ default: m.ToursAdminDashboardPage })));
const ToursAdminListPage = lazy(() => import("../pages-legacy/tours/admin/ToursAdminListPage").then((m) => ({ default: m.ToursAdminListPage })));
const TourDetailPage = lazy(() => import("../pages-legacy/tours/admin/TourDetailPage").then((m) => ({ default: m.TourDetailPage })));
const ToursAdminInvoicesPage = lazy(() => import("../pages-legacy/tours/admin/ToursAdminInvoicesPage").then((m) => ({ default: m.ToursAdminInvoicesPage })));
const ToursAdminBankImportPage = lazy(() => import("../pages-legacy/tours/admin/ToursAdminBankImportPage").then((m) => ({ default: m.ToursAdminBankImportPage })));
const ToursAdminLinkMatterportPage = lazy(() => import("../pages-legacy/tours/admin/ToursAdminLinkMatterportPage").then((m) => ({ default: m.ToursAdminLinkMatterportPage })));
const ToursAdminLinkInvoicePage = lazy(() => import("../pages-legacy/tours/admin/ToursAdminLinkInvoicePage").then((m) => ({ default: m.ToursAdminLinkInvoicePage })));
const ToursAdminLinkExxasCustomerPage = lazy(() => import("../pages-legacy/tours/admin/ToursAdminLinkExxasCustomerPage").then((m) => ({ default: m.ToursAdminLinkExxasCustomerPage })));
const ToursAdminCustomersListPage = lazy(() => import("../pages-legacy/tours/admin/ToursAdminCustomersListPage").then((m) => ({ default: m.ToursAdminCustomersListPage })));
const ToursAdminCustomerNewPage = lazy(() => import("../pages-legacy/tours/admin/ToursAdminCustomerNewPage").then((m) => ({ default: m.ToursAdminCustomerNewPage })));
const ToursAdminCustomerDetailPage = lazy(() => import("../pages-legacy/tours/admin/ToursAdminCustomerDetailPage").then((m) => ({ default: m.ToursAdminCustomerDetailPage })));
const ToursAdminPortalRolesPage = lazy(() => import("../pages-legacy/tours/admin/ToursAdminPortalRolesPage").then((m) => ({ default: m.ToursAdminPortalRolesPage })));
const ToursAdminTourSettingsPage = lazy(() => import("../pages-legacy/tours/admin/ToursAdminTourSettingsPage").then((m) => ({ default: m.ToursAdminTourSettingsPage })));
const ToursAdminEmailTemplatesPage = lazy(() => import("../pages-legacy/tours/admin/ToursAdminEmailTemplatesPage").then((m) => ({ default: m.ToursAdminEmailTemplatesPage })));
const ToursAdminAutomationsPage = lazy(() => import("../pages-legacy/tours/admin/ToursAdminAutomationsPage").then((m) => ({ default: m.ToursAdminAutomationsPage })));
const ToursAdminTeamPage = lazy(() => import("../pages-legacy/tours/admin/ToursAdminTeamPage").then((m) => ({ default: m.ToursAdminTeamPage })));
const ToursAdminAiChatPage = lazy(() => import("../pages-legacy/tours/admin/ToursAdminAiChatPage").then((m) => ({ default: m.ToursAdminAiChatPage })));

// Portal pages
const PortalLoginPage = lazy(() => import("../pages-legacy/portal/PortalLoginPage").then((m) => ({ default: m.PortalLoginPage })));
const PortalForgotPasswordPage = lazy(() => import("../pages-legacy/portal/PortalForgotPasswordPage").then((m) => ({ default: m.PortalForgotPasswordPage })));
const PortalResetPasswordPage = lazy(() => import("../pages-legacy/portal/PortalResetPasswordPage").then((m) => ({ default: m.PortalResetPasswordPage })));
const PortalDashboardPage = lazy(() => import("../pages-legacy/portal/PortalDashboardPage").then((m) => ({ default: m.PortalDashboardPage })));
const PortalToursPage = lazy(() => import("../pages-legacy/portal/PortalToursPage").then((m) => ({ default: m.PortalToursPage })));
const PortalInvoicesPage = lazy(() => import("../pages-legacy/portal/PortalInvoicesPage").then((m) => ({ default: m.PortalInvoicesPage })));
const PortalTeamPage = lazy(() => import("../pages-legacy/portal/PortalTeamPage").then((m) => ({ default: m.PortalTeamPage })));

function PageSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface)]">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--accent,#B68E20)]/25 border-t-[var(--accent,#B68E20)]" />
    </div>
  );
}

function PrivateRoutes() {
  const { isLoggedIn, role } = useAuth();
  const isCompanyRole = isCompanyWorkspaceRole(role);
  const isKunden = isKundenRole(role);
  const adminOnlyRoles: Role[] = ["admin", "super_admin"];
  const toursAdminRoles: Role[] = ["admin", "super_admin", "tour_manager"];
  const companyHome = role === "company_employee" ? "/portal/bestellungen" : "/portal/firma";

  if (!isLoggedIn) return <Navigate to="/login" replace />;

  function guardedElement(allowed: Role[], element: ReactElement) {
    if (!allowed.includes(role)) {
      if (isKunden) return <Navigate to="/portal/dashboard" replace />;
      return <Navigate to={isCompanyRole ? companyHome : "/dashboard"} replace />;
    }
    return element;
  }

  if (isKunden && !isCompanyRole) {
    return (
      <AppShell>
        <Routes>
          <Route path="/" element={<Navigate to="/portal/dashboard" replace />} />
          <Route path="/account" element={<AccountDashboardPage />} />
          <Route path="/portal/dashboard" element={<PortalDashboardPage />} />
          <Route path="/portal/tours" element={<PortalToursPage />} />
          <Route path="/portal/invoices" element={<PortalInvoicesPage />} />
          {role === "customer_admin" && (
            <Route path="/portal/team" element={<PortalTeamPage />} />
          )}
          <Route path="*" element={<Navigate to="/portal/dashboard" replace />} />
        </Routes>
      </AppShell>
    );
  }

  // Embed-Modus: kein AppShell (Header/Sidebar/Footer), nur Content
  const embedPaths = ["/embed/tours/link-matterport"];
  const currentPath = window.location.pathname;
  if (embedPaths.some((p) => currentPath.startsWith(p))) {
    return (
      <div className="min-h-screen p-4" style={{ background: "var(--bg-classic)" }}>
        <Suspense fallback={<div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" /></div>}>
          <Routes>
            <Route path="/embed/tours/link-matterport" element={guardedElement(toursAdminRoles, <ToursAdminLinkMatterportPage />)} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </div>
    );
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to={isCompanyRole ? companyHome : "/dashboard"} replace />} />
        <Route path="/portal/dashboard" element={<PortalDashboardPage />} />
        <Route path="/portal/tours" element={<PortalToursPage />} />
        <Route path="/portal/invoices" element={<PortalInvoicesPage />} />
        <Route path="/portal/team" element={<PortalTeamPage />} />
        <Route path="/portal/firma" element={guardedElement(["company_owner", "company_admin"], <PortalFirmaPage />)} />
        <Route path="/portal/bestellungen" element={guardedElement(["company_employee"], <PortalBestellungenPage />)} />
        <Route path="/settings/users" element={guardedElement(adminOnlyRoles, <AdminUsersPage />)} />
        <Route path="/settings/companies" element={guardedElement(adminOnlyRoles, <CompanyManagementPage />)} />
        <Route path="/admin/users" element={guardedElement(adminOnlyRoles, <AdminUsersPage />)} />
        <Route path="/admin/roles" element={guardedElement(adminOnlyRoles, <RolesPage />)} />
        <Route path="/company" element={<Navigate to={companyHome} replace />} />
        <Route path="/company/dashboard" element={guardedElement(["company_owner", "company_admin", "company_employee"], <CompanyDashboardPage />)} />
        <Route path="/dashboard" element={guardedElement(adminOnlyRoles, <DashboardPage />)} />
        <Route path="/orders" element={guardedElement([...adminOnlyRoles, "photographer"], <OrdersPage />)} />
        <Route path="/upload" element={guardedElement([...adminOnlyRoles, "photographer"], <UploadsPage />)} />
        <Route path="/calendar" element={guardedElement([...adminOnlyRoles, "photographer"], <CalendarPage />)} />
        <Route path="/employees" element={guardedElement(adminOnlyRoles, <Navigate to="/settings/team" replace />)} />
        <Route path="/customers" element={guardedElement(adminOnlyRoles, <CustomersPage />)} />
        <Route path="/products" element={guardedElement(adminOnlyRoles, <ProductsPage />)} />
        <Route path="/discount-codes" element={guardedElement(adminOnlyRoles, <DiscountCodesPage />)} />
        <Route path="/settings" element={guardedElement(adminOnlyRoles, <ConfigurationPage initialTab="general" />)} />
        <Route path="/settings/workflow" element={guardedElement(adminOnlyRoles, <ConfigurationPage initialTab="workflow" />)} />
        <Route path="/settings/email-templates" element={guardedElement(adminOnlyRoles, <EmailTemplatesPage />)} />
        <Route path="/settings/calendar-templates" element={guardedElement(adminOnlyRoles, <CalendarTemplatesPage />)} />
        <Route path="/settings/exxas" element={guardedElement(adminOnlyRoles, <ConfigurationPage initialTab="exxas" />)} />
        <Route path="/exxas-reconcile" element={guardedElement(adminOnlyRoles, <ExxasReconcilePage />)} />
        <Route path="/settings/team" element={guardedElement(adminOnlyRoles, <ConfigurationPage initialTab="employees" />)} />
        <Route path="/settings/assignment-explorer" element={guardedElement(adminOnlyRoles, <Navigate to="/settings/access" replace />)} />
        <Route path="/settings/access" element={<Navigate to="/settings/users" replace />} />
        <Route path="/reviews" element={guardedElement(adminOnlyRoles, <ReviewsPage />)} />
        <Route path="/bugs" element={guardedElement(adminOnlyRoles, <BugsPage />)} />
        <Route path="/backups" element={guardedElement(adminOnlyRoles, <BackupsPage />)} />
        <Route path="/changelog" element={guardedElement(adminOnlyRoles, <ChangelogPage />)} />
        {/* Tours Admin */}
        <Route path="/admin/tours/list" element={guardedElement(toursAdminRoles, <ToursAdminListPage />)} />
        <Route path="/admin/tours/invoices" element={guardedElement(toursAdminRoles, <ToursAdminInvoicesPage />)} />
        <Route path="/admin/tours/bank-import" element={guardedElement(toursAdminRoles, <ToursAdminBankImportPage />)} />
        <Route path="/admin/tours/link-matterport" element={guardedElement(toursAdminRoles, <ToursAdminLinkMatterportPage />)} />
        <Route path="/admin/tours/:id/link-invoice" element={guardedElement(toursAdminRoles, <ToursAdminLinkInvoicePage />)} />
        <Route path="/admin/tours/:id/link-exxas-customer" element={guardedElement(toursAdminRoles, <ToursAdminLinkExxasCustomerPage />)} />
        <Route path="/admin/tours/customers/new" element={guardedElement(toursAdminRoles, <ToursAdminCustomerNewPage />)} />
        <Route path="/admin/tours/customers/:customerId" element={guardedElement(toursAdminRoles, <ToursAdminCustomerDetailPage />)} />
        <Route path="/admin/tours/customers" element={guardedElement(toursAdminRoles, <ToursAdminCustomersListPage />)} />
        <Route path="/admin/tours/portal-roles" element={guardedElement(toursAdminRoles, <ToursAdminPortalRolesPage />)} />
        <Route path="/admin/tours/settings" element={guardedElement(toursAdminRoles, <ToursAdminTourSettingsPage />)} />
        <Route path="/admin/tours/email-templates" element={guardedElement(toursAdminRoles, <ToursAdminEmailTemplatesPage />)} />
        <Route path="/admin/tours/automations" element={guardedElement(toursAdminRoles, <ToursAdminAutomationsPage />)} />
        <Route path="/admin/tours/team" element={guardedElement(toursAdminRoles, <ToursAdminTeamPage />)} />
        <Route path="/admin/tours/ai-chat" element={guardedElement(toursAdminRoles, <ToursAdminAiChatPage />)} />
        <Route path="/admin/tours/:id" element={guardedElement(toursAdminRoles, <TourDetailPage />)} />
        <Route path="/admin/tours" element={guardedElement(toursAdminRoles, <ToursAdminDashboardPage />)} />
      </Routes>
    </AppShell>
  );
}

function PublicBookingIndex() {
  return isPublicBookingHost() ? <BookingWizardPage /> : <Navigate to="/dashboard" replace />;
}

export default function ClientShell() {
  return (
    <BrowserRouter>
      <CustomerMagicSessionRedirect />
      <OfflineIndicator />
      <Suspense fallback={<PageSkeleton />}>
        <Routes>
          <Route path="/" element={<PublicBookingIndex />} />
          <Route path="/book" element={<BookingWizardPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/portal/login" element={<PortalLoginPage />} />
          <Route path="/portal/forgot-password" element={<PortalForgotPasswordPage />} />
          <Route path="/portal/reset-password" element={<PortalResetPasswordPage />} />
          <Route path="/confirm/:token" element={<ConfirmBookingPage />} />
          <Route path="/print/orders/:orderNo" element={<PrintOrderPage />} />
          <Route path="/print/order/:orderNo" element={<PrintOrderPage />} />
          <Route path="*" element={<PrivateRoutes />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
