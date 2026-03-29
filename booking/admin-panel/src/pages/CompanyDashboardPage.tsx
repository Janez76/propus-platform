import { Link } from "react-router-dom";

/**
 * Firmen-Dashboard – Ergänzung zu Portal-Firma / Bestellungen.
 */
export function CompanyDashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Firmen-Übersicht</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Schnellzugriff auf Bestellungen und Einstellungen. Touren-Rechnungen können später hier eingebunden werden.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          to="/portal/firma"
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium dark:border-zinc-700 dark:bg-zinc-950"
        >
          Firma & Team
        </Link>
        <Link
          to="/portal/bestellungen"
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium dark:border-zinc-700 dark:bg-zinc-950"
        >
          Bestellungen
        </Link>
      </div>
    </div>
  );
}
