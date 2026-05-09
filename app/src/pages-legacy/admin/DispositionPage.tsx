import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarRange, ChevronRight, Loader2 } from "lucide-react";

import {
  assignPhotographer,
  getOrders,
  rescheduleOrder,
  updateOrderStatus,
  type Order,
} from "../../api/orders";
import { getPhotographers, type Photographer } from "../../api/photographers";
import { useQuery } from "../../hooks/useQuery";
import { ordersQueryKey } from "../../lib/queryKeys";
import { useAuthStore } from "../../store/authStore";
import { DeadlineBadge } from "../../components/ui/DeadlineBadge";

type DispositionResult =
  | { orderNo: string; ok: true }
  | { orderNo: string; ok: false; error: string };

const TIME_OPTIONS = (() => {
  const out: string[] = [];
  for (let h = 6; h < 22; h++) {
    for (const m of [0, 15, 30, 45]) {
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return out;
})();

function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Bulk-Disposition: Office wählt mehrere Flex-Aufträge in
 * `disposition_offen` und disponiert sie auf denselben Termin.
 *
 * Pro Auftrag werden serielle PATCH-Requests ausgeführt:
 *   1. assign-photographer
 *   2. reschedule (date+time+duration)
 *   3. status → confirmed (triggert Disposition-Mail)
 *
 * Keine Atomicity über mehrere Aufträge — wenn ein Schritt fehlschlägt,
 * bleibt der Auftrag im aktuellen Zustand und die Disposition-Mail
 * geht nicht raus. Per-Auftrag-Fehler werden im UI gelistet.
 */
export function DispositionPage() {
  const token = useAuthStore((s) => s.token);
  const { data: allOrders = [], isFetching, refetch } = useQuery<Order[]>(
    ordersQueryKey(token),
    () => getOrders(token),
    { enabled: Boolean(token), staleTime: 60_000 },
  );
  const { data: photographers = [] } = useQuery<Photographer[]>(
    `photographers:${token || "anon"}`,
    () => getPhotographers(token),
    { enabled: Boolean(token), staleTime: 10 * 60 * 1000 },
  );

  // Sortiert nach knappster Deadline zuerst — dieselbe Logik wie im Kanban.
  const queue = useMemo(() => {
    return allOrders
      .filter((o) => o.bookingKind === "flexible" && o.status === "disposition_offen")
      .sort((a, b) => {
        const av = a.deadlineAt ? new Date(a.deadlineAt).getTime() : Number.POSITIVE_INFINITY;
        const bv = b.deadlineAt ? new Date(b.deadlineAt).getTime() : Number.POSITIVE_INFINITY;
        return av - bv;
      });
  }, [allOrders]);

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [photographerKey, setPhotographerKey] = useState<string>("");
  const [scheduleDate, setScheduleDate] = useState<string>(tomorrowISO());
  const [scheduleTime, setScheduleTime] = useState<string>("10:00");
  const [durationMin, setDurationMin] = useState<number>(60);
  const [sendEmails, setSendEmails] = useState<boolean>(true);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<DispositionResult[]>([]);

  const allSelected = queue.length > 0 && queue.every((o) => selected.has(o.orderNo));
  const toggleAll = (next: boolean) => {
    setSelected(next ? new Set(queue.map((o) => o.orderNo)) : new Set());
  };
  const toggleOne = (orderNo: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(orderNo)) next.delete(orderNo);
      else next.add(orderNo);
      return next;
    });
  };

  const canSubmit =
    !busy && selected.size > 0 && photographerKey && scheduleDate && scheduleTime && durationMin >= 15;

  const onSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setBusy(true);
    setResults([]);
    const acc: DispositionResult[] = [];
    // Serielle Verarbeitung — paralleles Feuern auf 3 PATCH-Endpunkte pro
    // Order kann den Server unter Last in unsaubere Zustaende bringen
    // (z. B. status-Wechsel vor reschedule); seriell ist sicher und
    // bei sinnvoller Batch-Groesse (~10 Auftraege) schnell genug.
    for (const orderNo of selected) {
      try {
        await assignPhotographer(token, orderNo, photographerKey);
        await rescheduleOrder(token, orderNo, scheduleDate, scheduleTime, durationMin);
        await updateOrderStatus(token, orderNo, "confirmed", {
          sendEmails,
          sendEmailTargets: { customer: true, office: true, photographer: true, cc: true },
        });
        acc.push({ orderNo, ok: true });
      } catch (e) {
        acc.push({
          orderNo,
          ok: false,
          error: e instanceof Error ? e.message : "Unbekannter Fehler",
        });
      }
      setResults([...acc]);
    }
    setBusy(false);
    // Liste neu laden — disponiert Aufträge fallen aus dem Filter raus.
    void refetch({ force: true });
    setSelected(new Set());
  }, [canSubmit, selected, photographerKey, scheduleDate, scheduleTime, durationMin, sendEmails, token, refetch]);

  if (isFetching && allOrders.length === 0) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <CalendarRange className="h-5 w-5 text-[var(--accent)]" />
            Disposition
          </h1>
          <p className="mt-1 text-sm text-[var(--text-subtle)]">
            Flex-Aufträge im Status <code>disposition_offen</code>, sortiert nach knappster Deadline.
          </p>
        </div>
        <Link
          to="/orders/kanban"
          className="text-sm text-[var(--accent)] hover:underline"
        >
          Zum Kanban →
        </Link>
      </header>

      {queue.length === 0 ? (
        <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--text-subtle)]">
          Keine offenen Flex-Dispositionen.
        </div>
      ) : (
        <>
          {/* Form */}
          <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Disponieren auf
            </h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Fotograf</span>
                <select
                  value={photographerKey}
                  onChange={(e) => setPhotographerKey(e.target.value)}
                  className="h-9 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-2 text-sm"
                >
                  <option value="">— wählen —</option>
                  {photographers.map((p) => (
                    <option key={p.key} value={p.key}>{p.name || p.key}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Datum</span>
                <input
                  type="date"
                  value={scheduleDate}
                  min={tomorrowISO()}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="h-9 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Uhrzeit</span>
                <select
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="h-9 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-2 text-sm"
                >
                  {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Dauer (min)</span>
                <input
                  type="number"
                  min={15}
                  step={15}
                  value={durationMin}
                  onChange={(e) => setDurationMin(Number(e.target.value) || 60)}
                  className="h-9 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-2 text-sm"
                />
              </label>
            </div>
            <label className="mt-3 inline-flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <input
                type="checkbox"
                checked={sendEmails}
                onChange={(e) => setSendEmails(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-[var(--border-strong)] text-[var(--accent)]"
              />
              Disposition-Mails an Kunde, Büro und Fotograf senden
            </label>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-[var(--text-subtle)]">
                {selected.size} von {queue.length} ausgewählt
              </span>
              <button
                type="button"
                onClick={onSubmit}
                disabled={!canSubmit}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                {busy ? "Disponiert…" : `Disponieren (${selected.size})`}
              </button>
            </div>
          </section>

          {/* Liste */}
          <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] shadow-sm">
            <header className="flex items-center justify-between border-b border-[var(--border-soft)] px-4 py-2">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--text-muted)]">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => toggleAll(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-[var(--border-strong)] text-[var(--accent)]"
                />
                Alle auswählen
              </label>
              <span className="text-xs text-[var(--text-subtle)]">{queue.length} Aufträge</span>
            </header>
            <ul className="divide-y divide-[var(--border-soft)]">
              {queue.map((o) => {
                const checked = selected.has(o.orderNo);
                const result = results.find((r) => r.orderNo === o.orderNo);
                return (
                  <li key={o.orderNo} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOne(o.orderNo)}
                      disabled={busy || !!result}
                      className="h-4 w-4 rounded border-[var(--border-strong)] text-[var(--accent)]"
                    />
                    <Link to={`/orders/${o.orderNo}`} className="flex-1 hover:underline">
                      <span className="font-mono">#{o.orderNo}</span>
                      <span className="ml-2 text-[var(--text-muted)]">
                        {o.address || "—"}
                        {o.billing?.company ? ` · ${o.billing.company}` : ""}
                      </span>
                    </Link>
                    <DeadlineBadge deadlineAt={o.deadlineAt} />
                    {result && (
                      <span className={result.ok ? "text-xs text-emerald-600" : "text-xs text-red-600"}>
                        {result.ok ? "✓ disponiert" : `Fehler: ${result.error}`}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
