import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Globe, FileText, Users, AlertCircle } from "lucide-react";
import { getPortalTours, getPortalInvoices, type PortalTour, type PortalInvoice } from "../../api/portalTours";
import { usePortalNav } from "../../hooks/usePortalNav";

export function PortalDashboardPage() {
  const { portalPath } = usePortalNav();
  const [tours, setTours] = useState<PortalTour[]>([]);
  const [invoices, setInvoices] = useState<PortalInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getPortalTours(), getPortalInvoices()])
      .then(([t, i]) => {
        setTours(t.tours);
        setInvoices(i.invoices);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const activeTours = tours.filter((t) => !t.archiv && t.status !== "ARCHIVED");
  const openInvoices = invoices.filter((i) => i.invoice_status === "open" || i.invoice_status === "sent");
  const expiringSoon = tours.filter((t) => {
    const end = t.term_end_date ?? t.ablaufdatum;
    if (!end) return false;
    const days = Math.ceil((new Date(end).getTime() - Date.now()) / 86400000);
    return days >= 0 && days <= 30;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-[var(--text-main)]">Dashboard</h1>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* KPI-Kacheln */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link
          to={portalPath("tours")}
          className="group cust-form-section p-5 hover:border-[var(--accent)]/60 hover:shadow-sm transition-all"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="rounded-lg bg-[var(--accent)]/10 p-2">
              <Globe className="h-5 w-5 text-[var(--accent)]" />
            </div>
            <span className="text-sm font-medium text-[var(--text-subtle)]">Aktive Touren</span>
          </div>
          <p className="text-3xl font-bold text-[var(--text-main)]">{activeTours.length}</p>
        </Link>

        <Link
          to={portalPath("invoices")}
          className="group cust-form-section p-5 hover:border-[var(--accent)]/60 hover:shadow-sm transition-all"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 p-2">
              <FileText className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <span className="text-sm font-medium text-[var(--text-subtle)]">Offene Rechnungen</span>
          </div>
          <p className="text-3xl font-bold text-[var(--text-main)]">{openInvoices.length}</p>
        </Link>

        <div className="cust-form-section p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-2">
              <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="text-sm font-medium text-[var(--text-subtle)]">Touren gesamt</span>
          </div>
          <p className="text-3xl font-bold text-[var(--text-main)]">{tours.length}</p>
        </div>
      </div>

      {/* Ablaufende Touren */}
      {expiringSoon.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800 p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <h2 className="font-semibold text-amber-800 dark:text-amber-300">
              {expiringSoon.length} Tour{expiringSoon.length > 1 ? "en laufen" : " läuft"} bald ab
            </h2>
          </div>
          <div className="space-y-2">
            {expiringSoon.map((t) => {
              const end = t.term_end_date ?? t.ablaufdatum;
              const days = Math.ceil((new Date(end!).getTime() - Date.now()) / 86400000);
              return (
                <div key={t.id} className="flex items-center justify-between text-sm">
                  <span className="text-amber-800 dark:text-amber-200">
                    {t.object_label || t.bezeichnung || `Tour #${t.id}`}
                  </span>
                  <span className="font-medium text-amber-700 dark:text-amber-400">
                    in {days} Tag{days !== 1 ? "en" : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Letzte Touren */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-[var(--text-main)]">Letzte Touren</h2>
          <Link to={portalPath("tours")} className="text-sm text-[var(--accent)] hover:underline">
            Alle anzeigen →
          </Link>
        </div>
        {tours.length === 0 ? (
          <div className="cust-form-section p-8 text-center">
            <Globe className="h-10 w-10 mx-auto mb-3 text-[var(--text-subtle)]" />
            <p className="text-[var(--text-subtle)]">Noch keine Touren vorhanden.</p>
          </div>
        ) : (
          <div className="cust-form-section overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-soft)]">
                  <th className="text-left px-4 py-3 font-medium text-[var(--text-subtle)]">Objekt</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--text-subtle)] hidden sm:table-cell">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--text-subtle)] hidden md:table-cell">Läuft bis</th>
                </tr>
              </thead>
              <tbody>
                {tours.slice(0, 5).map((t) => (
                  <tr key={t.id} className="border-b border-[var(--border-soft)]/50 last:border-0 hover:bg-[var(--surface-raised)]/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-[var(--text-main)]">
                        {t.object_label || t.bezeichnung || `Tour #${t.id}`}
                      </div>
                      {t.matterport_model_id && (
                        <div className="text-xs text-[var(--text-subtle)] mt-0.5">{t.matterport_model_id}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <TourStatusBadge status={t.status} />
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-[var(--text-subtle)]">
                      {formatDate(t.term_end_date ?? t.ablaufdatum)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function TourStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    ACTIVE: { label: "Aktiv", cls: "cust-status-badge cust-status-confirmed" },
    ARCHIVED: { label: "Archiviert", cls: "cust-status-badge cust-status-draft" },
    PENDING: { label: "Ausstehend", cls: "cust-status-badge cust-status-pending" },
    CUSTOMER_ACCEPTED_AWAITING_PAYMENT: { label: "Zahlung ausstehend", cls: "cust-status-badge cust-status-open" },
  };
  const s = map[status] ?? { label: status, cls: "cust-status-badge cust-status-draft" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "–";
  return new Date(dateStr).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}



