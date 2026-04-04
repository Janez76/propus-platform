import { lazy, Suspense, useState } from "react";
import { useSearchParams, Link, Navigate } from "react-router-dom";
import {
  Shield, Users, Building2, UserRound, Globe, BookOpen, RefreshCw,
} from "lucide-react";
import { useAuthStore } from "../store/authStore";

// Lazy-load der Unter-Komponenten
const AdminUsersPage = lazy(() =>
  import("./AdminUsersPage").then((m) => ({ default: m.AdminUsersPage }))
);
const CompanyManagementPage = lazy(() =>
  import("./CompanyManagementPage").then((m) => ({ default: m.CompanyManagementPage }))
);
const RoleMatrixPage = lazy(() =>
  import("./RoleMatrixPage").then((m) => ({ default: m.RoleMatrixPage }))
);

// ─── Tab Definitionen ─────────────────────────────────────────────────────────

type TabId = "intern" | "workspaces" | "portal" | "rollenkatalog";

const TABS: { id: TabId; label: string; icon: React.ReactNode; description: string }[] = [
  {
    id: "intern",
    label: "Intern",
    icon: <UserRound className="h-4 w-4" />,
    description: "Interne Benutzer, Systemrollen und Zugangsdaten",
  },
  {
    id: "workspaces",
    label: "Firmen & Workspaces",
    icon: <Building2 className="h-4 w-4" />,
    description: "Firmenmitglieder, Einladungen und Workspace-Rollen",
  },
  {
    id: "portal",
    label: "Portal & Team",
    icon: <Globe className="h-4 w-4" />,
    description: "Portal-Team, Tour-Manager und externe Kunden-Admins",
  },
  {
    id: "rollenkatalog",
    label: "Rollenkatalog",
    icon: <BookOpen className="h-4 w-4" />,
    description: "Rollenmatrix und Berechtigungsdefinitionen (Anzeige)",
  },
];

// ─── Haupt-Komponente ─────────────────────────────────────────────────────────

export function AccessControlPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.role);

  const isSuperAdmin = role === "super_admin" || role === "admin";

  const rawTab = searchParams.get("tab") as TabId | null;
  const activeTab: TabId = TABS.find((t) => t.id === rawTab)?.id ?? "intern";

  function setTab(id: TabId) {
    const next = new URLSearchParams(searchParams);
    next.set("tab", id);
    setSearchParams(next, { replace: true });
  }

  if (!token || !isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Page header */}
      <div className="border-b border-[var(--border-soft)] bg-[var(--surface)] px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]/10">
              <Shield className="h-5 w-5 text-[var(--accent)]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[var(--text-main)]">Rechteverwaltung</h1>
              <p className="text-sm text-[var(--text-muted)]">
                Zentrale Steuerung aller Rollen, Zugänge und Berechtigungen
              </p>
            </div>
          </div>

          {/* Tab navigation */}
          <div className="mt-5 flex gap-1 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setTab(tab.id)}
                className={[
                  "flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all whitespace-nowrap",
                  activeTab === tab.id
                    ? "bg-[var(--accent)] text-black shadow-sm"
                    : "text-[var(--text-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-main)]",
                ].join(" ")}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <Suspense
        fallback={
          <div className="flex items-center justify-center gap-2 py-24 text-[var(--text-muted)]">
            <RefreshCw className="h-5 w-5 animate-spin" />
            <span>Wird geladen…</span>
          </div>
        }
      >
        {activeTab === "intern" && <AdminUsersPage />}
        {activeTab === "workspaces" && <CompanyManagementPage />}
        {activeTab === "portal" && <PortalRolesSection token={token} />}
        {activeTab === "rollenkatalog" && <RoleMatrixPage />}
      </Suspense>
    </div>
  );
}

// ─── Portal-Rollen Sektion ────────────────────────────────────────────────────

function PortalRolesSection({ token }: { token: string }) {
  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]/10">
          <Globe className="h-5 w-5 text-[var(--accent)]" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-[var(--text-main)]">Portal & Team</h2>
          <p className="text-sm text-[var(--text-muted)]">
            Internes Portal-Team, Tour-Manager und externe Kunden-Admins verwalten
          </p>
        </div>
      </div>

      {/* Quick links to the existing portal roles management */}
      <div className="grid gap-4 sm:grid-cols-2">
        <QuickLinkCard
          icon={<Users className="h-5 w-5 text-[var(--accent)]" />}
          title="Internes Portal-Team"
          description="Mitarbeiter die als Tour-Manager oder Admin im Portal agieren"
          href="/settings/roles?view=portal&tab=intern"
        />
        <QuickLinkCard
          icon={<UserRound className="h-5 w-5 text-[var(--accent)]" />}
          title="Externe Kunden-Admins"
          description="Kontakte die als Kunden-Admin im Portal sehen können"
          href="/settings/roles?view=portal&tab=extern"
        />
      </div>

      <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-4 py-3 text-sm text-[var(--text-muted)]">
        <p className="font-medium text-[var(--text-main)] mb-1">Hinweis: Tour-spezifische Rollen</p>
        <p className="text-xs">
          Tour-bezogene Portalrollen (Zuweisungen pro Tour) werden direkt in der Tour-Administration unter{" "}
          <Link to="/admin/tours" className="text-[var(--accent)] hover:underline">
            Admin → Touren
          </Link>{" "}
          verwaltet.
        </p>
      </div>
    </div>
  );
}

function QuickLinkCard({
  icon,
  title,
  description,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      to={href}
      className="group flex items-start gap-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-4 transition-all hover:border-[var(--accent)]/40 hover:bg-[var(--surface-raised)]"
    >
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]/10 transition-colors group-hover:bg-[var(--accent)]/20">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--text-main)]">{title}</p>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">{description}</p>
      </div>
    </Link>
  );
}
