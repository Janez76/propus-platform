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
    return <div className="p-6 text-sm text-slate-500 dark:text-zinc-400">Bestellungen werden geladen…</div>;
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-zinc-100">Meine Bestellungen</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
          Hier siehst du nur Aufträge, die dir zugeordnet sind.
        </p>
      </div>
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 dark:border-zinc-800 dark:bg-zinc-950/80">
            <tr>
              <th className="px-4 py-3 font-medium text-slate-700 dark:text-zinc-300">Nr.</th>
              <th className="px-4 py-3 font-medium text-slate-700 dark:text-zinc-300">Status</th>
              <th className="px-4 py-3 font-medium text-slate-700 dark:text-zinc-300">Adresse</th>
              <th className="px-4 py-3 font-medium text-slate-700 dark:text-zinc-300">Erfasst</th>
              <th className="px-4 py-3 font-medium text-slate-700 dark:text-zinc-300">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500 dark:text-zinc-500">
                  Keine Aufträge gefunden.
                </td>
              </tr>
            ) : (
              orders.map((o) => (
                <tr
                  key={String(o.orderNo ?? Math.random())}
                  className="border-b border-slate-100 last:border-0 dark:border-zinc-800"
                >
                  <td className="px-4 py-3 font-mono text-slate-900 dark:text-zinc-100">{String(o.orderNo ?? "–")}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-zinc-300">{o.status ?? "–"}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-zinc-400">{o.address ?? "–"}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-zinc-400">
                    {o.createdAt ? new Date(o.createdAt).toLocaleDateString("de-CH") : "–"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 dark:border-zinc-700 dark:text-zinc-300"
                      >
                        Dateien
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 dark:border-zinc-700 dark:text-zinc-300"
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
