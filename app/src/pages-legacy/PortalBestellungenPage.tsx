import { useCallback, useEffect, useState } from "react";
import { getCompanyOrders, type CompanyOrder } from "../api/company";
import { useAuth } from "../hooks/useAuth";

/** Kundenportal Mitarbeiter: nur eigene Aufträge (serverseitig gefiltert). */
export function PortalBestellungenPage() {
  const { token } = useAuth();
  const [orders, setOrders] = useState<CompanyOrder[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      const res = await getCompanyOrders(token);
      setOrders(res.orders || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Aufträge konnten nicht geladen werden");
    } finally {
      setBusy(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (busy) {
    return <div className="p-6 text-sm text-[var(--text-subtle)]">Bestellungen werden geladen…</div>;
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--text-main)]">Meine Bestellungen</h1>
        <p className="mt-1 text-sm text-[var(--text-subtle)]">
          Hier siehst du nur Aufträge, die dir zugeordnet sind.
        </p>
      </div>
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      ) : null}
      <div className="cust-table-wrap overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 border-[var(--border-soft)] bg-[var(--surface)]/80">
            <tr>
              <th className="px-4 py-3 font-medium text-[var(--text-muted)]">Nr.</th>
              <th className="px-4 py-3 font-medium text-[var(--text-muted)]">Status</th>
              <th className="px-4 py-3 font-medium text-[var(--text-muted)]">Adresse</th>
              <th className="px-4 py-3 font-medium text-[var(--text-muted)]">Erfasst</th>
              <th className="px-4 py-3 font-medium text-[var(--text-muted)]">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[var(--text-subtle)]">
                  Keine Aufträge gefunden.
                </td>
              </tr>
            ) : (
              orders.map((o) => (
                <tr
                  key={String(o.orderNo ?? Math.random())}
                  className="border-b border-slate-100 last:border-0 border-[var(--border-soft)]"
                >
                  <td className="px-4 py-3 font-mono text-[var(--text-main)]">{String(o.orderNo ?? "–")}</td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">{o.status ?? "–"}</td>
                  <td className="px-4 py-3 text-[var(--text-subtle)]">{o.address ?? "–"}</td>
                  <td className="px-4 py-3 text-[var(--text-subtle)]">
                    {o.createdAt ? new Date(o.createdAt).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" }) : "–"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="cust-action-icon text-xs px-2.5 py-1"
                      >
                        Dateien
                      </button>
                      <button
                        type="button"
                        className="cust-action-icon text-xs px-2.5 py-1"
                      >
                        Feedback
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}



