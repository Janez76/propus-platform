import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiRequest } from "../api/client";

type ConfirmResponse = {
  ok: boolean;
  confirmed?: boolean;
  already?: boolean;
  status?: string;
  orderNo?: number;
  message?: string;
};

export function ConfirmBookingPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ConfirmResponse | null>(null);

  const safeToken = useMemo(() => String(token || "").trim(), [token]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!safeToken || safeToken.length < 32) {
        setError("Ungültiger Bestätigungslink.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const response = await apiRequest<ConfirmResponse>(`/api/booking/confirm/${encodeURIComponent(safeToken)}`, "GET");
        if (cancelled) return;
        setResult(response);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Bestätigung fehlgeschlagen.";
        setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [safeToken]);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-xl rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900 dark:text-zinc-100">Terminbestätigung</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">
          Wir prüfen Ihren Link und bestätigen den Termin automatisch.
        </p>

        {loading && <p className="mt-6 text-sm text-slate-700 dark:text-zinc-300">Bestätigung läuft…</p>}

        {!loading && error && (
          <div className="mt-6 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {!loading && !error && result?.confirmed && (
          <div className="mt-6 rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300">
            Ihr Termin wurde erfolgreich bestätigt. Vielen Dank.
          </div>
        )}

        {!loading && !error && result?.already && (
          <div className="mt-6 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
            Dieser Termin wurde bereits bearbeitet ({result.status || "status unbekannt"}).
          </div>
        )}

        <div className="mt-6">
          <Link to="/login" className="text-sm font-medium text-[#9E8649] hover:underline">
            Zum Login
          </Link>
        </div>
      </div>
    </div>
  );
}
