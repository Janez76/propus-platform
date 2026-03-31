function formatDt(v: unknown) {
  if (v == null) return "—";
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("de-CH", { dateStyle: "short", timeStyle: "short" });
}

type Props = {
  rows: Record<string, unknown>[];
};

export function TourActionLog({ rows }: Props) {
  return (
    <section className="surface-card-strong p-5 space-y-3">
      <h2 className="text-lg font-semibold text-[var(--text-main)]">Aktionsprotokoll</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--text-subtle)]">Keine Einträge.</p>
      ) : (
        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full text-xs sm:text-sm">
            <thead className="sticky top-0 bg-[var(--surface)]">
              <tr className="text-left text-[var(--text-subtle)] border-b border-[var(--border-soft)]">
                <th className="py-2 pr-3">Zeit</th>
                <th className="py-2 pr-3">Aktion</th>
                <th className="py-2 pr-3">Akteur</th>
                <th className="py-2">Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r.id ?? Math.random())} className="border-b border-[var(--border-soft)]/40 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap text-[var(--text-subtle)]">{formatDt(r.created_at)}</td>
                  <td className="py-2 pr-3 text-[var(--text-main)]">{String(r.action ?? "")}</td>
                  <td className="py-2 pr-3 text-[var(--text-subtle)]">{String(r.actor_ref ?? r.actor_type ?? "")}</td>
                  <td className="py-2 text-[var(--text-subtle)] font-mono text-[10px] sm:text-xs break-all max-w-xs">
                    {r.details_json != null ? JSON.stringify(r.details_json) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
