/**
 * Admin-Dashboard – React-Portierung von tours/views/admin/dashboard.ejs
 *
 * Erhält alle Daten via /tour-manager/admin/api/dashboard.
 * Feature-Parität: Schnellzugriffe, unverknüpfte Matterport-Spaces,
 * nächste Abläufe, neueste Touren.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { List, Boxes, FileText, Settings, AlertCircle } from 'lucide-react';
import { getAdminDashboard, type AdminDashboardData } from '../../api/tourAdmin';
import { TourStatusBadge } from './TourStatusBadge';
import type { AdminTourListItem, MatterportSpace } from '../../types/tourManager';
import { TOUR_STATUS_LABELS } from '../../types/tourManager';

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('de-CH', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function DaysCell({ days }: { days: number | null | undefined }) {
  if (days == null) return <span className="text-[var(--text-subtle)]">-</span>;
  const cls =
    days < 0 ? 'text-red-600 font-semibold' :
    days <= 30 ? 'text-amber-600 font-semibold' :
    'text-emerald-700 font-semibold';
  return <span className={cls}>{days}</span>;
}

function QuickLinks() {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white shadow-sm p-4">
      <h2 className="text-sm font-bold text-[var(--text-main)] mb-3">Schnellzugriffe</h2>
      <div className="flex flex-wrap gap-2">
        <Link
          to="/admin/tours/list"
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors"
        >
          <List className="h-3.5 w-3.5" /> Touren öffnen
        </Link>
        <Link
          to="/admin/tours/matterport"
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--text-main)] hover:border-amber-300 transition-colors"
        >
          <Boxes className="h-3.5 w-3.5" /> Matterport verknüpfen
        </Link>
        <Link
          to="/admin/tours/invoices"
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--text-main)] hover:border-amber-300 transition-colors"
        >
          <FileText className="h-3.5 w-3.5" /> Rechnungen
        </Link>
        <Link
          to="/admin/tours/settings"
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--text-main)] hover:border-amber-300 transition-colors"
        >
          <Settings className="h-3.5 w-3.5" /> Einstellungen
        </Link>
      </div>
    </div>
  );
}

function UnlinkedSpacesTable({ spaces }: { spaces: MatterportSpace[] }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)] bg-slate-50">
        <h2 className="text-sm font-bold text-[var(--text-main)]">Ohne Verknüpfung</h2>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--text-subtle)]">Space</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--text-subtle)]">Erstellt</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--text-subtle)]">Link</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--text-subtle)]">Aktion</th>
          </tr>
        </thead>
        <tbody>
          {spaces.length === 0 && (
            <tr><td colSpan={4} className="px-4 py-6 text-center text-xs text-[var(--text-subtle)]">Keine unverknüpften Touren gefunden.</td></tr>
          )}
          {spaces.map((s) => (
            <tr key={s.id} className="border-b border-[var(--border)] last:border-0 hover:bg-slate-50/50">
              <td className="px-3 py-2">
                <div className="font-medium text-[var(--text-main)]">{s.name || 'Ohne Namen'}</div>
                <div className="text-xs text-[var(--text-subtle)]">ID: <code className="font-mono">{s.id}</code></div>
              </td>
              <td className="px-3 py-2 text-xs text-[var(--text-subtle)] whitespace-nowrap">{formatDate(s.created)}</td>
              <td className="px-3 py-2">
                <a
                  href={`https://my.matterport.com/show/?m=${s.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline"
                >
                  Space öffnen
                </a>
              </td>
              <td className="px-3 py-2">
                <Link
                  to={`/admin/tours/matterport?openSpaceId=${encodeURIComponent(s.id)}`}
                  className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors"
                >
                  Verknüpfen
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExpiringToursTable({ tours }: { tours: AdminTourListItem[] }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)] bg-slate-50">
        <h2 className="text-sm font-bold text-[var(--text-main)]">Nächste Abläufe</h2>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--text-subtle)]">Kunde / Objekt</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--text-subtle)]">Ablaufdatum</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--text-subtle)]">Tage</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--text-subtle)]">Status</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--text-subtle)]">Aktion</th>
          </tr>
        </thead>
        <tbody>
          {tours.length === 0 && (
            <tr><td colSpan={5} className="px-4 py-6 text-center text-xs text-[var(--text-subtle)]">Keine aktiven Abläufe gefunden.</td></tr>
          )}
          {tours.map((t) => {
            const expiryDate = t.canonical_term_end_date || t.term_end_date || t.ablaufdatum;
            return (
              <tr key={t.id} className="border-b border-[var(--border)] last:border-0 hover:bg-slate-50/50">
                <td className="px-3 py-2">
                  <div className="font-medium text-[var(--text-main)]">{t.canonical_customer_name || '-'}</div>
                  <div className="text-xs text-[var(--text-subtle)]">{t.canonical_object_label || ''}</div>
                </td>
                <td className="px-3 py-2 text-xs text-[var(--text-subtle)] whitespace-nowrap">{formatDate(expiryDate)}</td>
                <td className="px-3 py-2"><DaysCell days={t.days_until_expiry} /></td>
                <td className="px-3 py-2">
                  <TourStatusBadge status={t.status} />
                </td>
                <td className="px-3 py-2">
                  <Link
                    to={`/admin/tours/${t.id}`}
                    className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors"
                  >
                    Detail
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RecentToursTable({ tours }: { tours: AdminTourListItem[] }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)] bg-slate-50">
        <h2 className="text-sm font-bold text-[var(--text-main)]">Neueste Touren</h2>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--text-subtle)]">Kunde / Objekt</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--text-subtle)]">Status</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--text-subtle)]">Matterport</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--text-subtle)]">Aktion</th>
          </tr>
        </thead>
        <tbody>
          {tours.length === 0 && (
            <tr><td colSpan={4} className="px-4 py-6 text-center text-xs text-[var(--text-subtle)]">Keine Touren vorhanden.</td></tr>
          )}
          {tours.map((t) => (
            <tr key={t.id} className="border-b border-[var(--border)] last:border-0 hover:bg-slate-50/50">
              <td className="px-3 py-2">
                <div className="font-medium text-[var(--text-main)]">{t.canonical_customer_name || '-'}</div>
                <div className="text-xs text-[var(--text-subtle)]">{t.canonical_object_label || ''}</div>
              </td>
              <td className="px-3 py-2"><TourStatusBadge status={t.status} /></td>
              <td className="px-3 py-2 text-xs text-[var(--text-subtle)]">
                {t.canonical_matterport_space_id ? 'Verknüpft' : 'Nicht verknüpft'}
              </td>
              <td className="px-3 py-2">
                <Link
                  to={`/admin/tours/${t.id}`}
                  className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors"
                >
                  Detail
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminToursDashboardPage() {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAdminDashboard()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-main)]">Dashboard</h1>
        <p className="text-sm text-[var(--text-subtle)] mt-1">Schnellzugriffe und die wichtigsten 5 Einträge pro Bereich.</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <QuickLinks />
      <UnlinkedSpacesTable spaces={data?.openMatterportSpaces ?? []} />
      <ExpiringToursTable tours={data?.expiringSoonTours ?? []} />
      <RecentToursTable tours={data?.recentTours ?? []} />
    </div>
  );
}
