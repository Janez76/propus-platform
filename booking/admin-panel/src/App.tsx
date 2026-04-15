import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { OfflineIndicator } from "./components/layout/OfflineIndicator";
import { useAuth } from "./hooks/useAuth";
import { isCompanyWorkspaceRole } from "./lib/companyRoles";
import type { ReactElement } from "react";
import type { Role } from "./types";

const LoginPage = lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const OrdersPage = lazy(() => import("./pages/OrdersPage").then((m) => ({ default: m.OrdersPage })));
const UploadsPage = lazy(() => import("./pages/UploadsPage").then((m) => ({ default: m.UploadsPage })));
const CalendarPage = lazy(() => import("./pages/CalendarPage").then((m) => ({ default: m.CalendarPage })));
const CustomersPage = lazy(() => import("./pages/CustomersPage").then((m) => ({ default: m.CustomersPage })));
const ProductsPage = lazy(() => import("./pages/ProductsPage").then((m) => ({ default: m.ProductsPage })));
const DiscountCodesPage = lazy(() => import("./pages/DiscountCodesPage").then((m) => ({ default: m.DiscountCodesPage })));
const ConfigurationPage = lazy(() => import("./pages/ConfigurationPage").then((m) => ({ default: m.ConfigurationPage })));
const BugsPage = lazy(() => import("./pages/BugsPage").then((m) => ({ default: m.BugsPage })));
const BackupsPage = lazy(() => import("./pages/BackupsPage").then((m) => ({ default: m.BackupsPage })));
const PrintOrderPage = lazy(() => import("./pages/PrintOrderPage").then((m) => ({ default: m.PrintOrderPage })));
const ConfirmBookingPage = lazy(() => import("./pages/ConfirmBookingPage").then((m) => ({ default: m.ConfirmBookingPage })));
const EmailTemplatesPage = lazy(() => import("./pages/EmailTemplatesPage").then((m) => ({ default: m.EmailTemplatesPage })));
const CalendarTemplatesPage = lazy(() =>
  import("./pages/CalendarTemplatesPage").then((m) => ({ default: m.CalendarTemplatesPage }))
);
const ReviewsPage = lazy(() => import("./pages/ReviewsPage").then((m) => ({ default: m.ReviewsPage })));
const ChangelogPage = lazy(() => import("./pages/ChangelogPage").then((m) => ({ default: m.ChangelogPage })));
const ExxasReconcilePage = lazy(() => import("./pages/ExxasReconcilePage").then((m) => ({ default: m.ExxasReconcilePage })));
const AdminUsersPage = lazy(() => import("./pages/AdminUsersPage").then((m) => ({ default: m.AdminUsersPage })));
const RolesPage = lazy(() => import("./pages/RolesPage").then((m) => ({ default: m.RolesPage })));
const PortalFirmaPage = lazy(() => import("./pages/PortalFirmaPage").then((m) => ({ default: m.PortalFirmaPage })));
const PortalBestellungenPage = lazy(() =>
  import("./pages/PortalBestellungenPage").then((m) => ({ default: m.PortalBestellungenPage }))
);
const BookingWizardPage = lazy(() => import("./pages/BookingWizardPage").then((m) => ({ default: m.BookingWizardPage })));
const AccountDashboardPage = lazy(() =>
  import("./pages/AccountDashboardPage").then((m) => ({ default: m.AccountDashboardPage }))
);
const CompanyDashboardPage = lazy(() =>
  import("./pages/CompanyDashboardPage").then((m) => ({ default: m.CompanyDashboardPage }))
);
const TicketsPage = lazy(() => import("./pages/TicketsPage").then((m) => ({ default: m.TicketsPage })));
const PicdropPage = lazy(() => import("./pages/PicdropPage").then((m) => ({ default: m.PicdropPage })));
function PageSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface-raised)]">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
    </div>
  );
}

function PrivateRoutes() {
  const { isLoggedIn, role } = useAuth();
  const isCompanyRole = isCompanyWorkspaceRole(role);
  const isCustomer = role === "customer";
  const adminOnlyRoles: Role[] = ["admin", "super_admin"];
  const companyHome = role === "company_employee" ? "/portal/bestellungen" : "/portal/firma";

  if (!isLoggedIn) return <Navigate to="/login" replace />;

  function guardedElement(allowed: Role[], element: ReactElement) {
    if (!allowed.includes(role)) {
      if (isCustomer) return <Navigate to="/account" replace />;
      return <Navigate to={isCompanyRole ? companyHome : "/dashboard"} replace />;
    }
    return element;
  }

  if (isCustomer) {
    return (
      <AppShell>
        <Routes>
          <Route path="/" element={<Navigate to="/account" replace />} />
          <Route path="/account" element={<AccountDashboardPage />} />
          <Route path="*" element={<Navigate to="/account" replace />} />
        </Routes>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to={isCompanyRole ? companyHome : "/dashboard"} replace />} />
        <Route
          path="/portal/firma"
          element={guardedElement(["company_owner", "company_admin"], <PortalFirmaPage />)}
        />
        <Route
          path="/portal/bestellungen"
          element={guardedElement(["company_employee"], <PortalBestellungenPage />)}
        />
        <Route path="/settings/users" element={guardedElement(adminOnlyRoles, <AdminUsersPage />)} />
        <Route path="/admin/users" element={guardedElement(adminOnlyRoles, <AdminUsersPage />)} />
        <Route
          path="/admin/roles"
          element={guardedElement(adminOnlyRoles, <RolesPage />)}
        />
        <Route
          path="/company"
          element={<Navigate to={companyHome} replace />}
        />
        <Route
          path="/company/dashboard"
          element={guardedElement(["company_owner", "company_admin", "company_employee"], <CompanyDashboardPage />)}
        />
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
        <Route
          path="/settings/assignment-explorer"
          element={guardedElement(adminOnlyRoles, <Navigate to="/settings/users" replace />)}
        />
        <Route path="/reviews" element={guardedElement(adminOnlyRoles, <ReviewsPage />)} />
        <Route path="/tickets" element={guardedElement(adminOnlyRoles, <TicketsPage />)} />
        <Route path="/picdrop" element={guardedElement(adminOnlyRoles, <PicdropPage />)} />
        <Route path="/bugs" element={guardedElement(adminOnlyRoles, <BugsPage />)} />
        <Route path="/backups" element={guardedElement(adminOnlyRoles, <BackupsPage />)} />
        <Route path="/changelog" element={guardedElement(adminOnlyRoles, <ChangelogPage />)} />
        <Route path="/admin/tours" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppShell>
  );
}

export default function App() {
  return (
    <>
      <OfflineIndicator />
      <Suspense fallback={<PageSkeleton />}>
        <Routes>
          <Route path="/book" element={<BookingWizardPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/confirm/:token" element={<ConfirmBookingPage />} />
          <Route path="/print/orders/:orderNo" element={<PrintOrderPage />} />
          <Route path="/print/order/:orderNo" element={<PrintOrderPage />} />
          <Route path="*" element={<PrivateRoutes />} />
        </Routes>
      </Suspense>
    </>
  );
}

