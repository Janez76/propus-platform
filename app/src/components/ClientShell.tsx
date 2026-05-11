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

import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from "react-router-dom";
import { Suspense, lazy, useEffect, type ReactElement } from "react";
import { ChunkErrorBoundary } from "./StaleClientReloadHandler";
import { CustomerMagicSessionRedirect } from "./auth/CustomerMagicSessionRedirect";
import { CustomerSessionBootstrap } from "./auth/CustomerSessionBootstrap";
import { OfflineIndicator } from "./layout/OfflineIndicator";
import { AppShell } from "./layout/AppShell";
import { useAuth } from "../hooks/useAuth";
import { usePermissions } from "../hooks/usePermissions";
import { isPublicBookingHost } from "../lib/publicBookingHost";
import { isPortalHost } from "../lib/portalHost";
import { isKiAssistantHostname } from "../lib/kiHost";
import { isOnSelektoHost } from "../lib/bildauswahlHost";
import { RouteGuard } from "./routing/RouteGuard";
import { RegisterServiceWorker } from "./pwa/RegisterServiceWorker";
import { deleteOrder } from "../api/orders";
import { useAuthStore } from "../store/authStore";
import { useQueryStore } from "../store/queryStore";
import { ordersQueryKey } from "../lib/queryKeys";

// Lazy-load all pages from the legacy pages directory
const LoginPage = lazy(() => import("../pages-legacy/LoginPage").then((m) => ({ default: m.LoginPage })));
const AcceptInvitePage = lazy(() => import("../pages-legacy/AcceptInvitePage").then((m) => ({ default: m.AcceptInvitePage })));
const DashboardPage = lazy(() => import("../pages-legacy/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const OrdersPage = lazy(() => import("../pages-legacy/OrdersPage").then((m) => ({ default: m.OrdersPage })));
const OrdersKanbanPage = lazy(() => import("../pages-legacy/OrdersKanbanPage").then((m) => ({ default: m.OrdersKanbanPage })));
const DispositionPage = lazy(() => import("../pages-legacy/admin/DispositionPage").then((m) => ({ default: m.DispositionPage })));
const OrderDetail = lazy(() => import("../components/orders/OrderDetail").then((m) => ({ default: m.OrderDetail })));
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
const BildauswahlListPage = lazy(() => import("../pages-legacy/admin/bildauswahl/BildauswahlListPage").then((m) => ({ default: m.BildauswahlListPage })));
const BildauswahlEditorPage = lazy(() => import("../pages-legacy/admin/bildauswahl/BildauswahlEditorPage").then((m) => ({ default: m.BildauswahlEditorPage })));
const BildauswahlEmailTemplatesPage = lazy(() => import("../pages-legacy/admin/bildauswahl/BildauswahlEmailTemplatesPage").then((m) => ({ default: m.BildauswahlEmailTemplatesPage })));
const ClientBildauswahlPage = lazy(() => import("../pages-legacy/bildauswahl/ClientBildauswahlPage").then((m) => ({ default: m.ClientBildauswahlPage })));
const PaymentSettingsPage = lazy(() => import("../pages-legacy/PaymentSettingsPage").then((m) => ({ default: m.PaymentSettingsPage })));
const InvoiceTemplatePage = lazy(() => import("../pages-legacy/InvoiceTemplatePage").then((m) => ({ default: m.InvoiceTemplatePage })));
const RoleMatrixPage = lazy(() => import("../pages-legacy/RoleMatrixPage").then((m) => ({ default: m.RoleMatrixPage })));
const BookingWizardPage = lazy(() => import("../pages-legacy/BookingWizardPage").then((m) => ({ default: m.BookingWizardPage })));
const MobilePage = lazy(() => import("../pages-legacy/mobile/MobilePage").then((m) => ({ default: m.MobilePage })));

// Admin central pages
const AdminInvoicesPage = lazy(() => import("../pages-legacy/admin/invoices/AdminInvoicesPage").then((m) => ({ default: m.AdminInvoicesPage })));
const AdminOpenInvoicesPage = lazy(() => import("../pages-legacy/admin/invoices/AdminOpenInvoicesPage").then((m) => ({ default: m.AdminOpenInvoicesPage })));
const AdminPaidInvoicesPage = lazy(() => import("../pages-legacy/admin/invoices/AdminPaidInvoicesPage").then((m) => ({ default: m.AdminPaidInvoicesPage })));
const AdminRemindersPage = lazy(() => import("../pages-legacy/admin/invoices/AdminRemindersPage").then((m) => ({ default: m.AdminRemindersPage })));
const AdminBookkeeperPage = lazy(() => import("../pages-legacy/admin/bookkeeper/AdminBookkeeperPage").then((m) => ({ default: m.AdminBookkeeperPage })));
const AdminExxasSyncPage = lazy(() => import("../pages-legacy/admin/invoices/AdminExxasSyncPage").then((m) => ({ default: m.AdminExxasSyncPage })));

// Tours Admin pages
const ToursAdminDashboardPage = lazy(() => import("../pages-legacy/tours/admin/ToursAdminDashboardPage").then((m) => ({ default: m.ToursAdminDashboardPage })));
const ToursAdminListPage = lazy(() => import("../pages-legacy/tours/admin/ToursAdminListPage").then((m) => ({ default: m.ToursAdminListPage })));
const TourDetailPage = lazy(() => import("../pages-legacy/tours/admin/TourDetailPage").then((m) => ({ default: m.TourDetailPage })));
const ToursAdminBankImportPage = lazy(() => import("../pages-legacy/tours/admin/ToursAdminBankImportPage").then((m) => ({ default: m.ToursAdminBankImportPage })));
const ToursAdminLinkMatterportPage = lazy(() => import("../pages-legacy/tours/admin/ToursAdminLinkMatterportPage").then((m) => ({ default: m.ToursAdminLinkMatterportPage })));
const ToursAdminLinkInvoicePage = lazy(() => import("../pages-legacy/tours/admin/ToursAdminLinkInvoicePage").then((m) => ({ default: m.ToursAdminLinkInvoicePage })));
const ToursAdminLinkExxasCustomerPage = lazy(() => import("../pages-legacy/tours/admin/ToursAdminLinkExxasCustomerPage").then((m) => ({ default: m.ToursAdminLinkExxasCustomerPage })));
const ToursAdminTourSettingsPage = lazy(() => import("../pages-legacy/tours/admin/ToursAdminTourSettingsPage").then((m) => ({ default: m.ToursAdminTourSettingsPage })));
const ToursAdminWorkflowSettingsPage = lazy(() =>
  import("../pages-legacy/tours/admin/ToursAdminWorkflowSettingsPage").then((m) => ({ default: m.ToursAdminWorkflowSettingsPage })),
);
const ToursAdminTeamPage = lazy(() => import("../pages-legacy/tours/admin/ToursAdminTeamPage").then((m) => ({ default: m.ToursAdminTeamPage })));
const AdminTicketsPage = lazy(() => import("../pages-legacy/tours/admin/AdminTicketsPage").then((m) => ({ default: m.AdminTicketsPage })));
const PosteingangPage = lazy(() => import("../pages-legacy/admin/posteingang/PosteingangPage").then((m) => ({ default: m.PosteingangPage })));
const PosteingangAufgabenPage = lazy(() =>
  import("../pages-legacy/admin/posteingang/PosteingangAufgabenPage").then((m) => ({ default: m.PosteingangAufgabenPage })),
);
const BkbnOrdersPage = lazy(() => import("../pages-legacy/admin/bkbn/BkbnOrdersPage").then((m) => ({ default: m.BkbnOrdersPage })));
const ToursAdminCleanupPage = lazy(() => import("../pages-legacy/tours/admin/ToursAdminCleanupPage").then((m) => ({ default: m.ToursAdminCleanupPage })));

// Listing (Galerie) pages
const ListingListPage = lazy(() => import("../pages-legacy/admin/listing/ListingListPage").then((m) => ({ default: m.ListingListPage })));
const ListingEditorPage = lazy(() => import("../pages-legacy/admin/listing/ListingEditorPage").then((m) => ({ default: m.ListingEditorPage })));
const ListingEmailTemplatesPage = lazy(() => import("../pages-legacy/admin/listing/ListingEmailTemplatesPage").then((m) => ({ default: m.ListingEmailTemplatesPage })));
const ClientListingPage = lazy(() => import("../pages-legacy/listing/ClientListingPage").then((m) => ({ default: m.ClientListingPage })));
const CleanupDashboardPage = lazy(() => import("../pages-legacy/customer/CleanupDashboardPage").then((m) => ({ default: m.CleanupDashboardPage })));
const CustomerPortalLayout = lazy(() => import("../pages-legacy/customer/CustomerPortalLayout").then((m) => ({ default: m.CustomerPortalLayout })));

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

/** Alte Kunden-Magic-Links `/selekto/listing/:slug` und `/selekto/:slug` → `/bildauswahl/:slug` */
function LegacySelektoClientRedirect() {
  const { slug } = useParams<{ slug: string }>();
  return <Navigate to={`/bildauswahl/${slug ?? ""}`} replace />;
}

function AssistantAppRouterRedirect() {
  useEffect(() => {
    window.location.assign("/assistant");
  }, []);
  return <PageSkeleton />;
}

function OrderDetailRoute() {
  const { orderNo } = useParams<{ orderNo: string }>();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);

  if (!orderNo) return <Navigate to="/orders" replace />;
  if (!token) return <Navigate to="/login" replace />;

  return (
    <OrderDetail
      token={token}
      orderNo={orderNo}
      onClose={() => navigate("/orders")}
      onDelete={async (no) => {
        await deleteOrder(token, no);
        // Sprint 9: Cache global invalidieren — sonst zeigen Dashboard/OrdersMap den
        // gelöschten Auftrag noch beim nächsten Besuch (eigene useQuery-Subscriber).
        useQueryStore.getState().invalidate(ordersQueryKey(token));
        navigate("/orders");
      }}
      onOpenUpload={(no) => navigate(`/upload?orderNo=${encodeURIComponent(no)}`)}
    />
  );
}

function PrivateRoutes() {
  const { isLoggedIn } = useAuth();
  const { canAccessPath } = usePermissions();
  if (!isLoggedIn) return <Navigate to="/login" replace />;

  const eg = (p: string, el: ReactElement) => <RouteGuard path={p}>{el}</RouteGuard>;

  const currentPath = window.location.pathname;
  const kiAssistantOnly = typeof window !== "undefined" && isKiAssistantHostname(window.location.hostname);

  // Mobile-Modus: kein AppShell – eigene volle Viewport-Hülle (nicht auf ki.propus.ch — dort nur Assistant)
  if (currentPath.startsWith("/mobile") && !kiAssistantOnly) {
    return (
      <Suspense fallback={<PageSkeleton />}>
        <Routes>
          <Route path="/mobile" element={eg("/mobile", <MobilePage />)} />
          <Route path="/mobile/*" element={eg("/mobile", <MobilePage />)} />
        </Routes>
      </Suspense>
    );
  }

  // Auto-Redirect: kleine Viewports auf Haupt-Admin-Seiten → /mobile.
  // User kann via "Desktop"-Button im MobileHeader das Flag prefer_desktop setzen
  // und dann frei auf Desktop-Seiten navigieren (Flag gilt für die Session).
  // Permission-Check verhindert Redirect-Loop für User ohne /mobile-Zugriff.
  const MOBILE_REDIRECT_PATHS = new Set(["/", "/dashboard", "/orders", "/calendar", "/customers"]);
  if (!kiAssistantOnly && MOBILE_REDIRECT_PATHS.has(currentPath) && canAccessPath("/mobile")) {
    let preferDesktop = false;
    try {
      preferDesktop = window.sessionStorage.getItem("prefer_desktop") === "1";
    } catch {}
    const isMobileViewport =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 768px)").matches;
    if (isMobileViewport && !preferDesktop) {
      return <Navigate to="/mobile" replace />;
    }
  }

  // Embed-Modus: kein AppShell
  const embedPaths = ["/embed/tours/link-matterport", "/embed/tours/"];
  if (embedPaths.some((p) => currentPath.startsWith(p))) {
    return (
      <div className="min-h-screen p-4" style={{ background: "var(--bg-classic)" }}>
        <Suspense fallback={<div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" /></div>}>
          <Routes>
            <Route
              path="/embed/tours/link-matterport"
              element={eg("/embed/tours/link-matterport", <ToursAdminLinkMatterportPage />)}
            />
            <Route
              path="/embed/tours/:id/link-invoice"
              element={eg("/embed/tours/link-matterport", <ToursAdminLinkInvoicePage />)}
            />
            <Route
              path="/embed/tours/:id/link-exxas-customer"
              element={eg("/embed/tours/link-matterport", <ToursAdminLinkExxasCustomerPage />)}
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
        <Route path="/assistant" element={<AssistantAppRouterRedirect />} />
        <Route path="/settings/roles" element={eg("/settings/roles", <RoleMatrixPage />)} />
        <Route path="/admin/roles" element={<Navigate to="/settings/roles" replace />} />
        <Route path="/dashboard" element={eg("/dashboard", <DashboardPage />)} />
        <Route path="/orders/kanban" element={eg("/orders", <OrdersKanbanPage />)} />
        <Route path="/admin/orders/disposition" element={eg("/orders", <DispositionPage />)} />
        <Route path="/orders/disposition" element={<Navigate to="/admin/orders/disposition" replace />} />
        <Route path="/orders/:orderNo" element={eg("/orders", <OrderDetailRoute />)} />
        <Route path="/orders" element={eg("/orders", <OrdersPage />)} />
        <Route path="/upload" element={eg("/upload", <UploadsPage />)} />
        <Route path="/calendar" element={eg("/calendar", <CalendarPage />)} />
        <Route path="/employees" element={eg("/settings/team", <Navigate to="/settings/team" replace />)} />
        <Route path="/customers" element={eg("/customers", <CustomersPage />)} />
        <Route path="/products" element={eg("/products", <ProductsPage />)} />
        <Route path="/discount-codes" element={eg("/discount-codes", <DiscountCodesPage />)} />
        <Route path="/settings" element={eg("/settings", <ConfigurationPage initialTab="general" />)} />
        <Route path="/settings/workflow" element={eg("/settings/workflow", <ConfigurationPage initialTab="workflow" />)} />
        <Route path="/settings/email-templates" element={eg("/settings/email-templates", <EmailTemplatesPage />)} />
        <Route path="/settings/calendar-templates" element={eg("/settings/calendar-templates", <CalendarTemplatesPage />)} />
        <Route path="/settings/payment" element={eg("/settings/payment", <PaymentSettingsPage />)} />
        <Route path="/settings/invoice-template" element={eg("/settings/invoice-template", <InvoiceTemplatePage />)} />
        <Route path="/settings/exxas" element={eg("/settings/exxas", <ConfigurationPage initialTab="exxas" />)} />
        <Route path="/exxas-reconcile" element={eg("/exxas-reconcile", <ExxasReconcilePage />)} />
        <Route path="/settings/team" element={eg("/settings/team", <ConfigurationPage initialTab="employees" />)} />
        <Route path="/settings/assignment-explorer" element={<Navigate to="/settings/roles" replace />} />
        <Route path="/reviews" element={eg("/reviews", <ReviewsPage />)} />
        <Route path="/picdrop" element={<Navigate to="/admin/selekto" replace />} />
        <Route path="/bugs" element={eg("/bugs", <BugsPage />)} />
        <Route path="/backups" element={eg("/backups", <BackupsPage />)} />
        <Route path="/changelog" element={eg("/changelog", <ChangelogPage />)} />
        <Route path="/admin/finance" element={<Navigate to="/admin/finance/invoices" replace />} />
        <Route path="/admin/finance/invoices" element={eg("/admin/finance/invoices", <AdminInvoicesPage />)} />
        <Route path="/admin/finance/invoices/open" element={eg("/admin/finance/invoices/open", <AdminOpenInvoicesPage />)} />
        <Route path="/admin/finance/invoices/paid" element={eg("/admin/finance/invoices/paid", <AdminPaidInvoicesPage />)} />
        <Route path="/admin/finance/bank-import" element={eg("/admin/finance/bank-import", <ToursAdminBankImportPage />)} />
        <Route path="/admin/finance/reminders" element={eg("/admin/finance/reminders", <AdminRemindersPage />)} />
        <Route path="/admin/finance/bookkeeper" element={eg("/admin/finance/bookkeeper", <AdminBookkeeperPage />)} />
        <Route path="/admin/finance/exxas-sync" element={eg("/admin/finance/exxas-sync", <AdminExxasSyncPage />)} />
        <Route path="/admin/invoices" element={<Navigate to="/admin/finance/invoices" replace />} />
        <Route path="/admin/tours/list" element={eg("/admin/tours/list", <ToursAdminListPage />)} />
        <Route path="/admin/tours/invoices" element={<Navigate to="/admin/finance/invoices" replace />} />
        <Route path="/admin/tours/bank-import" element={<Navigate to="/admin/finance/bank-import" replace />} />
        <Route path="/admin/tours/link-matterport" element={eg("/admin/tours", <ToursAdminLinkMatterportPage />)} />
        <Route path="/admin/tours/:id/link-invoice" element={eg("/admin/tours", <ToursAdminLinkInvoicePage />)} />
        <Route path="/admin/tours/:id/link-exxas-customer" element={eg("/admin/tours", <ToursAdminLinkExxasCustomerPage />)} />
        <Route path="/admin/tours/customers/new" element={<Navigate to="/customers" replace />} />
        <Route path="/admin/tours/customers/:customerId" element={<Navigate to="/customers" replace />} />
        <Route path="/admin/tours/customers" element={<Navigate to="/customers" replace />} />
        <Route path="/admin/tours/portal-roles" element={<Navigate to="/settings/roles" replace />} />
        <Route path="/admin/tours/settings" element={eg("/admin/tours", <ToursAdminTourSettingsPage />)} />
        <Route path="/admin/tours/workflow-settings" element={eg("/admin/tours", <ToursAdminWorkflowSettingsPage />)} />
        <Route path="/admin/tours/email-templates" element={<Navigate to="/admin/tours/workflow-settings?tab=templates" replace />} />
        <Route path="/admin/tours/automations" element={<Navigate to="/admin/tours/workflow-settings?tab=workflow" replace />} />
        <Route path="/admin/tours/bereinigung" element={eg("/admin/tours", <ToursAdminCleanupPage />)} />
        <Route path="/admin/tours/team" element={eg("/admin/tours", <ToursAdminTeamPage />)} />
        <Route path="/admin/tickets" element={eg("/admin/tickets", <AdminTicketsPage />)} />
        <Route path="/admin/bkbn-orders" element={eg("/admin/bkbn-orders", <BkbnOrdersPage />)} />
        <Route path="/admin/bkbn" element={<Navigate to="/admin/bkbn-orders" replace />} />
        <Route path="/admin/posteingang/aufgaben" element={eg("/admin/posteingang", <PosteingangAufgabenPage />)} />
        <Route path="/admin/posteingang/:id" element={eg("/admin/posteingang", <PosteingangPage />)} />
        <Route path="/admin/posteingang" element={eg("/admin/posteingang", <PosteingangPage />)} />
        <Route path="/admin/tours/:id" element={eg("/admin/tours", <TourDetailPage />)} />
        <Route path="/admin/tours" element={eg("/admin/tours", <ToursAdminDashboardPage />)} />
        {/** /admin/selekto-Legacy: alles auf /admin/bildauswahl umleiten. */}
        <Route path="/admin/selekto/new" element={<Navigate to="/admin/bildauswahl" replace />} />
        <Route path="/admin/selekto/templates" element={<Navigate to="/admin/bildauswahl/templates" replace />} />
        <Route path="/admin/selekto/:id" element={<Navigate to="/admin/bildauswahl" replace />} />
        <Route path="/admin/selekto" element={<Navigate to="/admin/bildauswahl" replace />} />
        <Route path="/admin/listing/galleries/new" element={<Navigate to="/admin/listing/new" replace />} />
        <Route path="/admin/listing/galleries/:legacyId" element={<RedirectListingLegacyGalleriesSegment />} />
        <Route path="/admin/listing/templates" element={eg("/admin/listing", <ListingEmailTemplatesPage />)} />
        <Route path="/admin/listing/:id" element={eg("/admin/listing", <ListingEditorPage />)} />
        <Route path="/admin/listing" element={eg("/admin/listing", <ListingListPage />)} />
        <Route path="/admin/bildauswahl/templates" element={eg("/admin/bildauswahl", <BildauswahlEmailTemplatesPage />)} />
        <Route path="/admin/bildauswahl/:id" element={eg("/admin/bildauswahl", <BildauswahlEditorPage />)} />
        <Route path="/admin/bildauswahl" element={eg("/admin/bildauswahl", <BildauswahlListPage />)} />
      </Routes>
    </AppShell>
  );
}

function PublicBookingIndex() {
  if (isPortalHost()) return <Navigate to="/account" replace />;
  return isPublicBookingHost() ? <BookingWizardPage /> : <Navigate to="/login" replace />;
}

/**
 * Auf der Kunden-Portal-Domain (z. B. portal.propus.ch) darf das Admin-Panel nie
 * gerendert werden. Alle Pfade, die nicht ausdrücklich zum Portal gehören (`/account/*`,
 * `/login`, `/accept-invite`, magische Bestätigungs-/Print-/Listing-Links), werden
 * deterministisch auf `/account` umgeleitet — auch wenn ein altes Admin-Token im
 * Browser-`localStorage` liegt. Sonst fielen Pfade wie `/dashboard`, `/orders` …
 * in `PrivateRoutes` und versuchten u. a. Google Maps zu laden, was unter dem
 * Portal-Hostnamen zwangsläufig mit Referrer-Restriction-Fehler scheitert.
 */
function PortalCatchAllOrAdmin() {
  if (isPortalHost()) return <Navigate to="/account" replace />;
  return <PrivateRoutes />;
}

function SelektoIndexPage() {
  return (
    <div style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", padding: "3rem 1.5rem", maxWidth: "32rem", margin: "0 auto", textAlign: "center", color: "#1a1a1a" }}>
      <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.07em", color: "#7A5E10", textTransform: "uppercase", marginBottom: 12 }}>Bildauswahl · Propus</p>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 12px" }}>Willkommen</h1>
      <p style={{ color: "#666", lineHeight: 1.5 }}>
        Bitte öffnen Sie den Link aus Ihrer E-Mail, um Ihre Bildauswahl zu sehen.
      </p>
    </div>
  );
}

/**
 * Eigene SPA-Variante für den Vanity-Host `selekto.propus.ch`: nur die
 * Kunden-Bildauswahl, kein Admin, kein Login, kein Booking-Flow. URL-Schema
 * `selekto.propus.ch/<slug>` (kein `/bildauswahl/`-Präfix).
 */
function SelektoShell() {
  return (
    <BrowserRouter>
      <ChunkErrorBoundary>
        <Suspense fallback={<PageSkeleton />}>
          <Routes>
            <Route path="/" element={<SelektoIndexPage />} />
            <Route path="/:slug" element={<ClientBildauswahlPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </ChunkErrorBoundary>
    </BrowserRouter>
  );
}

export default function ClientShell() {
  if (typeof window !== "undefined" && isOnSelektoHost()) {
    return <SelektoShell />;
  }
  return (
    <BrowserRouter>
      <CustomerSessionBootstrap />
      <CustomerMagicSessionRedirect />
      <OfflineIndicator />
      <RegisterServiceWorker />
      <ChunkErrorBoundary>
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
            <Route path="/bildauswahl/:slug" element={<ClientBildauswahlPage />} />
            {/** Legacy /selekto/* → /bildauswahl/* (server-backed). */}
            <Route path="/selekto/bilder-auswahl" element={<Navigate to="/admin/bildauswahl" replace />} />
            <Route path="/selekto/bilder-auswahl/templates" element={<Navigate to="/admin/bildauswahl/templates" replace />} />
            <Route path="/selekto/bilder-auswahl/galleries/:id" element={<Navigate to="/admin/bildauswahl" replace />} />
            <Route path="/selekto/listing/:slug" element={<LegacySelektoClientRedirect />} />
            <Route path="/selekto/:slug" element={<LegacySelektoClientRedirect />} />
            <Route path="/cleanup/dashboard" element={<CleanupDashboardPage />} />
            <Route
              path="/account/*"
              element={
                <Suspense fallback={<PageSkeleton />}>
                  <CustomerPortalLayout />
                </Suspense>
              }
            />
            <Route path="*" element={<PortalCatchAllOrAdmin />} />
          </Routes>
        </Suspense>
      </ChunkErrorBoundary>
    </BrowserRouter>
  );
}
