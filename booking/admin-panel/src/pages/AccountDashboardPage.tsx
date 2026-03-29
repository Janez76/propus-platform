/**
 * B2C-Kundenbereich (zentrales Panel) – Buchungen, später Touren & Medien.
 */
export function AccountDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Mein Propus</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Übersicht über deine Buchungen und Dienste. Anbindung an <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">/api/customer/*</code>{" "}
          folgt.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Buchungen</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Liste und Status deiner Aufträge.</p>
        </div>
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
          <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Touren & Medien</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Geplant: Verknüpfung mit Tour-Manager und Dateiverwaltung.</p>
        </div>
      </div>
    </div>
  );
}
