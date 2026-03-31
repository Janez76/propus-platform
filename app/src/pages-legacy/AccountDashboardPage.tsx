/**
 * B2C-Kundenbereich (zentrales Panel) – Buchungen, später Touren & Medien.
 */
export function AccountDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--text-main)]">Mein Propus</h1>
        <p className="mt-1 text-sm text-[var(--text-subtle)]">
          Übersicht über deine Buchungen und Dienste. Anbindung an <code className="rounded bg-zinc-100 px-1 bg-[var(--surface-raised)]">/api/customer/*</code>{" "}
          folgt.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 border-[var(--border-soft)] bg-[var(--surface)]">
          <h2 className="font-medium text-[var(--text-main)]">Buchungen</h2>
          <p className="mt-1 text-sm text-[var(--text-subtle)]">Liste und Status deiner Aufträge.</p>
        </div>
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 p-4 border-[var(--border-soft)] bg-[var(--surface)]/50">
          <h2 className="font-medium text-[var(--text-main)]">Touren & Medien</h2>
          <p className="mt-1 text-sm text-[var(--text-subtle)]">Geplant: Verknüpfung mit Tour-Manager und Dateiverwaltung.</p>
        </div>
      </div>
    </div>
  );
}

