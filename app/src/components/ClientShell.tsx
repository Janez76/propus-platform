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

import { BrowserRouter, Routes, Route, Navigate, useParams, useSearchParams } from "react-router-dom";
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
const AcceptInvitePage = lazy(() => import("../pages-legacy/AcceptInvitePage").then((m) => ({ default: m.AcceptInvitePage })));
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
const PicdropPage = lazy(() => import("../pages-legacy/PicdropPage").then((m) => ({ default: m.PicdropPage })));
const PaymentSettingsPage = lazy(() => import("../pages-legacy/PaymentSettingsPage").then((m) => ({ default: m.PaymentSettingsPage })));
const InvoiceTemplatePage = lazy(() => import("../pages-legacy/InvoiceTemplatePage").then((m) => ({ default: m.InvoiceTemplatePage })));
const RoleMatrixPage = lazy(() => import("../pages-legacy/RoleMatrixPage").then((m) => ({ default: m.RoleMatrixPage })));
const CompanyManagementPage = lazy(() => import("../pages-legacy/CompanyManagementPage").then((m) => ({ default: m.CompanyManagementPage })));
const PortalFirmaPage = lazy(() => import("../pages-legacy/PortalFirmaPage").then((m) => ({ default: m.PortalFirmaPage })));
const PortalBestellungenPage = lazy(() => import("../pages-legacy/PortalBestellungenPage").then((m) => ({ default: m.PortalBestellungenPage })));
const BookingWizardPage = lazy(() => import("../pages-legacy/BookingWizardPage").then((m) => ({ default: m.BookingWizardPage })));
const AccountDashboardPage = lazy(() => import("../pages-legacy/AccountDashboardPage").then((m) => ({ default: m.AccountDashboardPage })));
const CompanyDashboardPage = lazy(() => import("../pages-legacy/CompanyDashboardPage").then((m) => ({ default: m.CompanyDashboardPage })));

// Admin central pages
const AdminInvoicesPage = lazy(() => import("../pages-legacy/admin/invoices/AdminInvoicesPage").then((m) => ({ default: m.AdminInvoicesPage })));
const AdminOpenInvoicesPage = lazy(() => import("../pages-legacy/admin/invoices/AdminOpenInvoicesPage").then((m) => ({ default: m.AdminOpenInvoicesPage })));
const AdminPaidInvoicesPage = lazy(() => import("../pages-legacy/admin/invoices/AdminPaidInvoicesPage").then((m) => ({ default: m.AdminPaidInvoicesPage })));
const AdminRemindersPage = lazy(() => import("../pages-legacy/admin/invoices/AdminRemindersPage").then((m) => ({ default: m.AdminRemindersPage })));
const AdminExxasSyncPage = lazy(() => import("../pages-legacy/admin/invoices/AdminExxasSyncPage").then((m) => ({ default: m.AdminExxasSyncPage })));

// Tours Admin pages
const ToursAdminDashboardPage = lazy(() => import("../pages-legacy/tours/admin/ToursAdminDashboardPage").then((m) => ({ default: m.ToursAdminDashboardPage })));
const ToursAdminListPage = lazy(() => import("../pages-legacy/tours/admin/ToursAdminListPage").then((m) => ({ default: m.ToursAdminListPage })));
const TourDetailPage = lazy(() => import("../pages-legacy/tours/admin/TourDetailPage").then((m) => ({ default: m.TourDetailPage })));
const ToursAdminInvoicesPage = lazy(() => import("../pages-legacy/tours/admin/ToursAdminInvoicesPage").then((m) => ({ default: m.ToursAdminInvoicesPage })));
const ToursAdminBankImportPage = lazy(() => import("../pages-legacy/tours/admin/ToursAdminBankImportPage").then((m) => ({ default: m.ToursAdminBankImportPage })));
const ToursAdminLinkMatterportPage = lazy(() => import("../pages-legacy/tours/admin/ToursAdminLinkMatterportPage").then((m) => ({ default: m.ToursAdminLinkMatterportPage })));
const ToursAdminLinkInvoicePage = lazy(() => import("../pages-legacy/tours/admin/ToursAdminLinkInvoicePage").then((m) => ({ default: m.ToursAdminLinkInvoicePage })));
const ToursAdminLinkExxasCustomerPage = lazy(() => import("../pages-legacy/tours/admin/ToursAdminLinkExxasCustomerPage").then((m) => ({ default: m.ToursAdminLinkExxasCustomerPage })));
const ToursAdminPortalRolesPage = lazy(() => import("../pages-legacy/tours/admin/ToursAdminPortalRolesPage").then((m) => ({ default: m.ToursAdminPortalRolesPage })));
const ToursAdminTourSettingsPage = lazy(() => import("../pages-legacy/tours/admin/ToursAdminTourSettingsPage").then((m) => ({ default: m.ToursAdminTourSettingsPage })));
const ToursAdminWorkflowSettingsPage = lazy(() =>
  import("../pages-legacy/tours/admin/ToursAdminWorkflowSettingsPage").then((m) => ({ default: m.ToursAdminWorkflowSettingsPage })),
);
const ToursAdminTeamPage = lazy(() => import("../pages-legacy/tours/admin/ToursAdminTeamPage").then((m) => ({ default: m.ToursAdminTeamPage })));
const ToursAdminAiChatPage = lazy(() => import("../pages-legacy/tours/admin/ToursAdminAiChatPage").then((m) => ({ default: m.ToursAdminAiChatPage })));
const PortalPreviewPage = lazy(() => import("../pages-legacy/tours/admin/PortalPreviewPage").then((m) => ({ default: m.PortalPreviewPage })));
const AdminTicketsPage = lazy(() => import("../pages-legacy/tours/admin/AdminTicketsPage").then((m) => ({ default: m.AdminTicketsPage })));
const ToursAdminCleanupPage = lazy(() => import("../pages-legacy/tours/admin/ToursAdminCleanupPage").then((m) => ({ default: m.ToursAdminCleanupPage })));

// Listing (Galerie) pages
const ListingListPage = lazy(() => import("../pages-legacy/admin/listing/ListingListPage").then((m) => ({ default: m.ListingListPage })));
const ListingEditorPage = lazy(() => import("../pages-legacy/admin/listing/ListingEditorPage").then((m) => ({ default: m.ListingEditorPage })));
const ListingEmailTemplatesPage = lazy(() => import("../pages-legacy/admin/listing/ListingEmailTemplatesPage").then((m) => ({ default: m.ListingEmailTemplatesPage })));
const ClientListingPage = lazy(() => import("../pages-legacy/listing/ClientListingPage").then((m) => ({ default: m.ClientListingPage })));
const CleanupDashboardPage = lazy(() => import("../pages-legacy/customer/CleanupDashboardPage").then((m) => ({ default: m.CleanupDashboardPage })));

// Portal pages
const PortalForgotPasswordPage = lazy(() => import("../pages-legacy/portal/PortalForgotPasswordPage").then((m) => ({ default: m.PortalForgotPasswordPage })));
const PortalResetPasswordPage = lazy(() => import("../pages-legacy/portal/PortalResetPasswordPage").then((m) => ({ default: m.PortalResetPasswordPage })));
const PortalTourDetailPage = lazy(() => import("../pages-legacy/portal/PortalTourDetailPage").then((m) => ({ default: m.PortalTourDetailPage })));
const PortalInvoicePrintPage = lazy(() => import("../pages-legacy/portal/PortalInvoicePrintPage").then((m) => ({ default: m.PortalInvoicePrintPage })));
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

/** Frühere Pfade `/admin/listing/galleries/:id` → kanonisch `/admin/listing/:id` */
function RedirectListingLegacyGalleriesSegment() {
  const { legacyId } = useParams<{ legacyId: string }>();
  return <Navigate to={`/admin/listing/${legacyId}`} replace />;
}

/**
 * Leitet /portal/login auf /login weiter und behält Query-Parameter (z.B. ?success=password_reset) bei.
 * Alt-Kompatibilität: PortalForgotPasswordPage / PortalResetPasswordPage navigieren noch auf /portal/login.
 */
function PortalLoginRedirect() {
  const [searchParams] = useSearchParams();
  const qs = searchParams.toString();
  return <Navigate to={qs ? `/login?${qs}` : "/login"} replace />;
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
          <Route path="/portal/tours/:tourId/invoices/:invoiceId/print" element={<PortalInvoicePrintPage />} />
          <Route path="/portal/tours/:tourId" element={<PortalTourDetailPage />} />
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
  const embedPaths = [
    "/embed/tours/link-matterport",
    "/embed/tours/",
    "/embed/portal",
  ];
  const currentPath = window.location.pathname;
  if (embedPaths.some((p) => currentPath.startsWith(p))) {
    return (
      <div className="min-h-screen p-4" style={{ background: "var(--bg-classic)" }}>
        <Suspense fallback={<div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" /></div>}>
          <Routes>
            <Route path="/embed/tours/link-matterport" element={guardedElement(toursAdminRoles, <ToursAdminLinkMatterportPage />)} />
            <Route path="/embed/tours/:id/link-invoice" element={guardedElement(toursAdminRoles, <ToursAdminLinkInvoicePage />)} />
            <Route
              path="/embed/tours/:id/link-exxas-customer"
              element={guardedElement(toursAdminRoles, <ToursAdminLinkExxasCustomerPage />)}
            />
            <Route path="/embed/portal/dashboard" element={<PortalDashboardPage />} />
            <Route path="/embed/portal/tours/:tourId/invoices/:invoiceId/print" element={<PortalInvoicePrintPage />} />
            <Route path="/embed/portal/tours/:tourId" element={<PortalTourDetailPage />} />
            <Route path="/embed/portal/tours" element={<PortalToursPage />} />
            <Route path="/embed/portal/invoices" element={<PortalInvoicesPage />} />
            <Route path="/embed/portal/team" element={<PortalTeamPage />} />
            <Route path="/embed/portal" element={<Navigate to="/embed/portal/dashboard" replace />} />
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
        <Route path="/portal/tours/:tourId/invoices/:invoiceId/print" element={<PortalInvoicePrintPage />} />
        <Route path="/portal/tours/:tourId" element={<PortalTourDetailPage />} />
        <Route path="/portal/tours" element={<PortalToursPage />} />
        <Route path="/portal/invoices" element={<PortalInvoicesPage />} />
        <Route path="/portal/team" element={<PortalTeamPage />} />
        <Route path="/portal/firma" element={guardedElement(["company_owner"], <PortalFirmaPage />)} />
        <Route path="/portal/bestellungen" element={guardedElement(["company_employee"], <PortalBestellungenPage />)} />
        <Route path="/settings/users" element={guardedElement(adminOnlyRoles, <CompanyManagementPage />)} />
        <Route path="/settings/companies" element={<Navigate to="/customers" replace />} />
        <Route path="/settings/roles" element={guardedElement(toursAdminRoles, <RoleMatrixPage />)} />
        <Route path="/admin/users" element={<Navigate to="/settings/users" replace />} />
        <Route path="/admin/roles" element={<Navigate to="/settings/roles" replace />} />
        <Route path="/company" element={<Navigate to={companyHome} replace />} />
        <Route path="/company/dashboard" element={guardedElement(["company_owner", "company_employee"], <CompanyDashboardPage />)} />
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
        <Route path="/settings/payment" element={guardedElement(adminOnlyRoles, <PaymentSettingsPage />)} />
        <Route path="/settings/invoice-template" element={guardedElement(adminOnlyRoles, <InvoiceTemplatePage />)} />
        <Route path="/settings/exxas" element={guardedElement(adminOnlyRoles, <ConfigurationPage initialTab="exxas" />)} />
        <Route path="/exxas-reconcile" element={guardedElement(adminOnlyRoles, <ExxasReconcilePage />)} />
        <Route path="/settings/team" element={guardedElement(adminOnlyRoles, <ConfigurationPage initialTab="employees" />)} />
        <Route path="/settings/assignment-explorer" element={<Navigate to="/settings/roles" replace />} />
        <Route path="/reviews" element={guardedElement(adminOnlyRoles, <ReviewsPage />)} />
        <Route path="/picdrop" element={guardedElement(adminOnlyRoles, <PicdropPage />)} />
        <Route path="/bugs" element={guardedElement(adminOnlyRoles, <BugsPage />)} />
        <Route path="/backups" element={guardedElement(adminOnlyRoles, <BackupsPage />)} />
        <Route path="/changelog" element={guardedElement(adminOnlyRoles, <ChangelogPage />)} />
        {/* Central admin modules */}
        <Route path="/admin/finance" element={<Navigate to="/admin/finance/invoices" replace />} />
        <Route path="/admin/finance/invoices" element={guardedElement(toursAdminRoles, <AdminInvoicesPage />)} />
        <Route path="/admin/finance/invoices/open" element={guardedElement(toursAdminRoles, <AdminOpenInvoicesPage />)} />
        <Route path="/admin/finance/invoices/paid" element={guardedElement(toursAdminRoles, <AdminPaidInvoicesPage />)} />
        <Route path="/admin/finance/bank-import" element={guardedElement(toursAdminRoles, <ToursAdminBankImportPage />)} />
        <Route path="/admin/finance/reminders" element={guardedElement(toursAdminRoles, <AdminRemindersPage />)} />
        <Route path="/admin/finance/exxas-sync" element={guardedElement(toursAdminRoles, <AdminExxasSyncPage />)} />
        <Route path="/admin/invoices" element={<Navigate to="/admin/finance/invoices" replace />} />
        {/* Tours Admin */}
        <Route path="/admin/tours/list" element={guardedElement(toursAdminRoles, <ToursAdminListPage />)} />
        <Route path="/admin/tours/invoices" element={<Navigate to="/admin/finance/invoices" replace />} />
        <Route path="/admin/tours/bank-import" element={<Navigate to="/admin/finance/bank-import" replace />} />
        <Route path="/admin/tours/link-matterport" element={guardedElement(toursAdminRoles, <ToursAdminLinkMatterportPage />)} />
        <Route path="/admin/tours/:id/link-invoice" element={guardedElement(toursAdminRoles, <ToursAdminLinkInvoicePage />)} />
        <Route path="/admin/tours/:id/link-exxas-customer" element={guardedElement(toursAdminRoles, <ToursAdminLinkExxasCustomerPage />)} />
        <Route path="/admin/tours/customers/new" element={<Navigate to="/customers" replace />} />
        <Route path="/admin/tours/customers/:customerId" element={<Navigate to="/customers" replace />} />
        <Route path="/admin/tours/customers" element={<Navigate to="/customers" replace />} />
        <Route path="/admin/tours/portal-roles" element={<Navigate to="/settings/roles" replace />} />
        <Route path="/admin/tours/settings" element={guardedElement(toursAdminRoles, <ToursAdminTourSettingsPage />)} />
        <Route path="/admin/tours/workflow-settings" element={guardedElement(toursAdminRoles, <ToursAdminWorkflowSettingsPage />)} />
        <Route path="/admin/tours/email-templates" element={<Navigate to="/admin/tours/workflow-settings?tab=templates" replace />} />
        <Route path="/admin/tours/automations" element={<Navigate to="/admin/tours/workflow-settings?tab=workflow" replace />} />
        <Route path="/admin/tours/bereinigung" element={guardedElement(toursAdminRoles, <ToursAdminCleanupPage />)} />
        <Route path="/admin/tours/team" element={guardedElement(toursAdminRoles, <ToursAdminTeamPage />)} />
        <Route path="/admin/tours/ai-chat" element={guardedElement(toursAdminRoles, <ToursAdminAiChatPage />)} />
        <Route path="/admin/tours/portal-vorschau" element={guardedElement(toursAdminRoles, <PortalPreviewPage />)} />
        <Route path="/admin/tickets" element={guardedElement(toursAdminRoles, <AdminTicketsPage />)} />
        <Route path="/admin/tours/:id" element={guardedElement(toursAdminRoles, <TourDetailPage />)} />
        <Route path="/admin/tours" element={guardedElement(toursAdminRoles, <ToursAdminDashboardPage />)} />
        {/* Listing (Galerie) Admin */}
        <Route path="/admin/listing/galleries/new" element={<Navigate to="/admin/listing/new" replace />} />
        <Route path="/admin/listing/galleries/:legacyId" element={<RedirectListingLegacyGalleriesSegment />} />
        <Route path="/admin/listing/templates" element={guardedElement(toursAdminRoles, <ListingEmailTemplatesPage />)} />
        <Route path="/admin/listing/:id" element={guardedElement(toursAdminRoles, <ListingEditorPage />)} />
        <Route path="/admin/listing" element={guardedElement(toursAdminRoles, <ListingListPage />)} />
      </Routes>
    </AppShell>
  );
}

function PublicBookingIndex() {
  return isPublicBookingHost() ? <BookingWizardPage /> : <Navigate to="/login" replace />;
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
          <Route path="/accept-invite" element={<AcceptInvitePage />} />
          <Route path="/portal/login" element={<PortalLoginRedirect />} />
          <Route path="/portal/forgot-password" element={<PortalForgotPasswordPage />} />
          <Route path="/portal/reset-password" element={<PortalResetPasswordPage />} />
          <Route path="/confirm/:token" element={<ConfirmBookingPage />} />
          <Route path="/print/orders/:orderNo" element={<PrintOrderPage />} />
          <Route path="/print/order/:orderNo" element={<PrintOrderPage />} />
          <Route path="/listing/:slug" element={<ClientListingPage />} />
          <Route path="/cleanup/dashboard" element={<CleanupDashboardPage />} />
          <Route path="*" element={<PrivateRoutes />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
