import { Link } from "react-router-dom";

/**
 * Firmen-Dashboard – Ergänzung zu Portal-Firma / Bestellungen.
 */
export function CompanyDashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-[var(--text-main)]">Firmen-Übersicht</h1>
      <p className="text-sm text-[var(--text-subtle)]">
        Schnellzugriff auf Bestellungen und Einstellungen. Touren-Rechnungen können später hier eingebunden werden.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          to="/portal/firma"
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium border-[var(--border-soft)] bg-[var(--surface)]"
        >
          Firma & Team
        </Link>
        <Link
          to="/portal/bestellungen"
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium border-[var(--border-soft)] bg-[var(--surface)]"
        >
          Bestellungen
        </Link>
      </div>
    </div>
  );
}


