"use client";

import { useMemo } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { isPortalHost } from "@/lib/portalHost";
import { useCustomerPermissions } from "@/hooks/useCustomerPermissions";
import { useAuthStore } from "@/store/authStore";
import { Loader2, LogOut, User, Package, FileText, Users, MessageCircle, Home } from "lucide-react";
import {
  CustomerAccountHome,
  CustomerInvoicesPage,
  CustomerMessagesHubPage,
  CustomerOrderDetailPage,
  CustomerOrdersPage,
  CustomerProfilePage,
  CustomerTeamPage,
} from "./CustomerPortalSubpages";

const nav = [
  { to: "/account", end: true, key: "portal.orders.read" as const, label: "Übersicht", icon: Home },
  { to: "/account/orders", key: "portal.orders.read" as const, label: "Bestellungen", icon: Package },
  { to: "/account/messages", key: "portal.messages.read" as const, label: "Nachrichten", icon: MessageCircle },
  { to: "/account/invoices", key: "portal.invoices.read" as const, label: "Rechnungen", icon: FileText },
  { to: "/account/team", key: "portal.team.read" as const, label: "Team", icon: Users },
  { to: "/account/profile", key: "portal.profile.update" as const, label: "Profil", icon: User },
];

export function CustomerPortalLayout() {
  const loc = useLocation();
  const { loading, canPortal, err, permissions } = useCustomerPermissions();
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const visible = useMemo(() => nav.filter((i) => canPortal(i.key)), [canPortal]);

  if (!isPortalHost()) {
    return <Navigate to="/login" replace />;
  }
  if (err === "unauthorized") {
    return <Navigate to="/login" replace state={{ from: loc }} />;
  }
  if (loading && !permissions.length) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-zinc-200">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
        <p className="mt-3 text-sm text-zinc-500">Kundenportal …</p>
      </div>
    );
  }

  const logout = async () => {
    try {
      await fetch("/api/customer/logout", { method: "POST", credentials: "include" });
    } catch {
      /* */
    }
    clearAuth();
    window.location.replace("/login");
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3">
          <div className="text-lg font-semibold text-amber-500/95">Propus · Kundenportal</div>
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex items-center gap-1 rounded border border-zinc-600 px-2 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            <LogOut className="h-4 w-4" />
            Abmelden
          </button>
        </div>
        <nav className="mx-auto flex max-w-5xl flex-wrap gap-1 border-t border-zinc-800/80 px-2 py-2">
          {visible.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm ${
                    isActive ? "bg-amber-600/20 text-amber-400" : "p-text-muted hover:bg-zinc-800/80 hover:text-zinc-200"
                  }`
                }
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Routes>
          <Route path="/" element={<CustomerAccountHome />} />
          <Route path="orders" element={<CustomerOrdersPage />} />
          <Route path="orders/:orderNo" element={<CustomerOrderDetailPage />} />
          <Route path="messages" element={<CustomerMessagesHubPage />} />
          <Route path="invoices" element={<CustomerInvoicesPage />} />
          <Route path="team" element={<CustomerTeamPage />} />
          <Route path="profile" element={<CustomerProfilePage />} />
          <Route path="*" element={<Navigate to="/account" replace />} />
        </Routes>
        {err && err !== "unauthorized" ? (
          <p className="mt-4 text-sm text-amber-600/90">
            Hinweis: {err}. <Link to="/account">Neu laden</Link>
          </p>
        ) : null}
      </main>
    </div>
  );
}
