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

import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { Suspense, lazy } from "react";
import { CustomerMagicSessionRedirect } from "./auth/CustomerMagicSessionRedirect";
import { CustomerSessionBootstrap } from "./auth/CustomerSessionBootstrap";
import { OfflineIndicator } from "./layout/OfflineIndicator";
import { AppShell } from "./layout/AppShell";
import { useAuth } from "../hooks/useAuth";
import { isPublicBookingHost } from "../lib/publicBookingHost";
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
const SelektoListPage = lazy(() => import("../pages-legacy/selekto/SelektoListPage").then((m) => ({ default: m.SelektoListPage })));
const SelektoEditorPage = lazy(() => import("../pages-legacy/selekto/SelektoEditorPage").then((m) => ({ default: m.SelektoEditorPage })));
const SelektoEmailTemplatesPage = lazy(() => import("../pages-legacy/selekto/SelektoEmailTemplatesPage").then((m) => ({ default: m.SelektoEmailTemplatesPage })));
const SelektoCreateRedirect = lazy(() => import("../pages-legacy/selekto/SelektoCreateRedirect").then((m) => ({ default: m.SelektoCreateRedirect })));
const ClientSelektoPage = lazy(() => import("../pages-legacy/selekto/ClientSelektoPage").then((m) => ({ default: m.ClientSelektoPage })));
const PaymentSettingsPage = lazy(() => import("../pages-legacy/PaymentSettingsPage").then((m) => ({ default: m.PaymentSettingsPage })));
const InvoiceTemplatePage = lazy(() => import("../pages-legacy/InvoiceTemplatePage").then((m) => ({ default: m.InvoiceTemplatePage })));
const RoleMatrixPage = lazy(() => import("../pages-legacy/RoleMatrixPage").then((m) => ({ default: m.RoleMatrixPage })));
const BookingWizardPage = lazy(() => import("../pages-legacy/BookingWizardPage").then((m) => ({ default: m.BookingWizardPage })));

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
const CustomerAccountPage = lazy(() => import("../pages-legacy/customer/CustomerAccountPage").then((m) => ({ default: m.CustomerAccountPage })));

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

/** Alte Selekto-Editor-URL `/selekto/bilder-auswahl/galleries/:id` → `/admin/selekto/:id` */
function LegacyBildauswahlGalleryRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/admin/selekto/${id ?? ""}`} replace />;
}

/** Alte Kunden-Magic-Links `/selekto/listing/:slug` → `/selekto/:slug` */
function LegacySelektoClientRedirect() {
  const { slug } = useParams<{ slug: string }>();
  return <Navigate to={`/selekto/${slug ?? ""}`} replace />;
}

function PrivateRoutes() {
  const { isLoggedIn, role } = useAuth();
  const adminOnlyRoles: Role[] = ["admin", "super_admin"];
  const toursAdminRoles: Role[] = ["admin", "super_admin", "tour_manager"];

  if (!isLoggedIn) return <Navigate to="/login" replace />;

  function guardedElement(allowed: Role[], element: ReactElement) {
    if (!allowed.includes(role)) {
      return <Navigate to="/dashboard" replace />;
    }
    return element;
  }

  // Embed-Modus: kein AppShell (Header/Sidebar/Footer), nur Content
  const embedPaths = [
    "/embed/tours/link-matterport",
    "/embed/tours/",
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
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </div>
    );
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/settings/roles" element={guardedElement(toursAdminRoles, <RoleMatrixPage />)} />
        <Route path="/admin/roles" element={<Navigate to="/settings/roles" replace />} />
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
        <Route path="/picdrop" element={<Navigate to="/admin/selekto" replace />} />
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
        {/* Selekto (Bildauswahl) Admin */}
        <Route path="/admin/selekto/new" element={guardedElement(toursAdminRoles, <SelektoCreateRedirect />)} />
        <Route path="/admin/selekto/templates" element={guardedElement(toursAdminRoles, <SelektoEmailTemplatesPage />)} />
        <Route path="/admin/selekto/:id" element={guardedElement(toursAdminRoles, <SelektoEditorPage />)} />
        <Route path="/admin/selekto" element={guardedElement(toursAdminRoles, <SelektoListPage />)} />
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
      <CustomerSessionBootstrap />
      <CustomerMagicSessionRedirect />
      <OfflineIndicator />
      <Suspense fallback={<PageSkeleton />}>
        <Routes>
          <Route path="/" element={<PublicBookingIndex />} />
          <Route path="/book" element={<BookingWizardPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/accept-invite" element={<AcceptInvitePage />} />
          <Route path="/confirm/:token" element={<ConfirmBookingPage />} />
          <Route path="/print/orders/:orderNo" element={<PrintOrderPage />} />
          <Route path="/print/order/:orderNo" element={<PrintOrderPage />} />
          <Route path="/listing/:slug" element={<ClientListingPage />} />
          <Route path="/selekto/bilder-auswahl" element={<Navigate to="/admin/selekto" replace />} />
          <Route path="/selekto/bilder-auswahl/templates" element={<Navigate to="/admin/selekto/templates" replace />} />
          <Route path="/selekto/bilder-auswahl/galleries/:id" element={<LegacyBildauswahlGalleryRedirect />} />
          <Route path="/selekto/listing/:slug" element={<LegacySelektoClientRedirect />} />
          <Route path="/selekto/:slug" element={<ClientSelektoPage />} />
          <Route path="/cleanup/dashboard" element={<CleanupDashboardPage />} />
          <Route path="/account" element={<CustomerAccountPage />} />
          <Route path="*" element={<PrivateRoutes />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
