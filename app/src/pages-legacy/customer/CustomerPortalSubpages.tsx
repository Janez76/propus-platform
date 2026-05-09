"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useCustomerPermissions } from "@/hooks/useCustomerPermissions";
import { isPortalHost } from "@/lib/portalHost";
import { Loader2 } from "lucide-react";

type OrderRow = {
  orderNo?: number;
  id?: number;
  status?: string;
  address?: string;
  schedule?: { date?: string; time?: string };
  /** Migration 092: bei flexiblen Buchungen 'flexible', sonst 'fixed' (default). */
  bookingKind?: "fixed" | "flexible";
  /** Spätestes Aufnahmedatum bei booking_kind='flexible'. */
  deadlineAt?: string | null;
  /** Frühestmögliches Aufnahmedatum bei booking_kind='flexible'. */
  flexibleEarliestAt?: string | null;
};

type KindFilter = "all" | "fixed" | "flexible";

/**
 * Formatiert einen ISO-String ins de-CH Datumsformat.
 *  - default:  "DD.MM.YYYY"
 *  - compact:  "DD.MM."  (für Listen-Sublines im Portal)
 *
 * Achtung: bei reinen Date-Strings (`YYYY-MM-DD`) interpretiert
 * `new Date(iso)` UTC-Mitternacht; Browser-TZs westlich von UTC
 * würden dadurch das Vortagsdatum anzeigen. Deshalb für reine
 * Date-Strings ohne `T`/`Z` direkt parsen, sonst per `Date`.
 */
function formatDeCH(iso: string | null | undefined, opts?: { compact?: boolean }): string {
  if (!iso) return "—";
  const s = String(iso);
  const compact = opts?.compact === true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-");
    return compact ? `${d}.${m}.` : `${d}.${m}.${y}`;
  }
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return "—";
  return compact
    ? dt.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit" }) + "."
    : dt.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function useJson<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    setErr("");
    setLoading(true);
    try {
      const r = await fetch(url, { credentials: "include" });
      if (r.status === 401) {
        setData(null);
        return;
      }
      if (!r.ok) {
        setErr("Laden fehlgeschlagen");
        return;
      }
      setData((await r.json()) as T);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, loading, err, reload: load };
}

export function CustomerAccountHome() {
  const { data, loading, err, reload } = useJson<{ orders?: OrderRow[] }>("/api/customer/orders");
  const orders = Array.isArray(data?.orders) ? data!.orders! : [];
  const { canPortal } = useCustomerPermissions();
  if (!isPortalHost()) return null;
  if (loading) {
    return <Loader2 className="h-6 w-6 animate-spin text-amber-500" />;
  }
  if (!canPortal("portal.orders.read")) {
    return <p className="text-sm text-zinc-500">Keine Berechtigung für Bestellübersicht.</p>;
  }
  return (
    <div>
      <h1 className="text-xl font-semibold">Willkommen</h1>
      {err ? <p className="mt-2 text-sm text-red-400">{err}</p> : null}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs uppercase text-zinc-500">Bestellungen</p>
          <p className="text-2xl font-semibold">{orders.length}</p>
        </div>
      </div>
      <button type="button" onClick={() => void reload()} className="mt-4 text-sm text-amber-500 underline">
        Aktualisieren
      </button>
    </div>
  );
}

export function CustomerOrdersPage() {
  const { data, loading, err } = useJson<{ orders?: OrderRow[] }>("/api/customer/orders");
  const orders = Array.isArray(data?.orders) ? data!.orders! : [];
  const { canPortal } = useCustomerPermissions();
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const filtered = useMemo(() => {
    if (kindFilter === "all") return orders;
    return orders.filter((o) => {
      const kind = o.bookingKind || "fixed";
      return kind === kindFilter;
    });
  }, [orders, kindFilter]);
  const flexCount = useMemo(() => orders.filter((o) => o.bookingKind === "flexible").length, [orders]);

  if (loading) return <Loader2 className="h-6 w-6 animate-spin text-amber-500" />;
  if (!canPortal("portal.orders.read")) {
    return <p className="text-sm text-zinc-500">Kein Zugriff.</p>;
  }
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Bestellungen</h1>
        {orders.length > 0 && flexCount > 0 ? (
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as KindFilter)}
            aria-label="Buchungsart"
            className="h-8 rounded border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-200"
          >
            <option value="all">Alle Buchungsarten</option>
            <option value="fixed">Nur Fix-Termine</option>
            <option value="flexible">Nur Flex (mit Deadline)</option>
          </select>
        ) : null}
      </div>
      {err ? <p className="mt-2 text-sm text-red-400">{err}</p> : null}
      {orders.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">Keine Bestellungen.</p>
      ) : filtered.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">Keine Bestellungen mit dieser Buchungsart.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {filtered.map((o) => {
            const no = o.orderNo ?? o.id;
            const isFlex = o.bookingKind === "flexible";
            const subline = isFlex
              ? o.deadlineAt
                ? `Deadline: ${formatDeCH(o.deadlineAt, { compact: true })}`
                : "Disposition offen"
              : o.schedule?.date
                ? `${formatDeCH(o.schedule.date, { compact: true })}${o.schedule.time ? ` · ${o.schedule.time}` : ""}`
                : null;
            return (
              <li key={String(no)}>
                <Link
                  to={`/account/orders/${no}`}
                  className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm hover:border-amber-600/40"
                >
                  <span className="flex flex-col">
                    <span>
                      #{no}
                      {isFlex && (
                        <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                          Flex
                        </span>
                      )}
                    </span>
                    {subline ? <span className="text-xs text-zinc-500">{subline}</span> : null}
                  </span>
                  <span className="text-zinc-500">{o.status || "—"}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function CustomerOrderDetailPage() {
  const { orderNo: raw } = useParams();
  const navigate = useNavigate();
  const { canPortal } = useCustomerPermissions();
  const [order, setOrder] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (!raw) return;
    setErr("");
    setLoading(true);
    try {
      const r = await fetch(`/api/customer/orders/${encodeURIComponent(raw)}`, { credentials: "include" });
      if (r.status === 401) {
        navigate("/login", { replace: true });
        return;
      }
      if (r.status === 404) {
        setErr("Bestellung nicht gefunden");
        return;
      }
      if (!r.ok) {
        setErr("Laden fehlgeschlagen");
        return;
      }
      const j = (await r.json()) as { order?: Record<string, unknown> };
      setOrder(j.order || null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }, [navigate, raw]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!canPortal("portal.orders.read")) {
    return <p className="text-sm text-zinc-500">Kein Zugriff.</p>;
  }
  if (loading) return <Loader2 className="h-6 w-6 animate-spin text-amber-500" />;

  const o = order as {
    address?: string;
    status?: string;
    orderNo?: number;
    schedule?: { date?: string; time?: string };
    bookingKind?: "fixed" | "flexible";
    deadlineAt?: string | null;
    flexibleEarliestAt?: string | null;
  } | null;
  const isFlex = o?.bookingKind === "flexible";
  // Banner-Zustand am Status festmachen, nicht am Vorhandensein eines Datums.
  // Ein Auftrag in `disposition_offen` mit bereits vorbefuelltem Termin
  // (z. B. Office hat das Datum gesetzt aber noch nicht bestaetigt) soll
  // weiterhin den Pre-Disposition-Hinweis zeigen.
  const flexConfirmed = isFlex && o?.status !== "disposition_offen";
  return (
    <div>
      <button type="button" onClick={() => navigate(-1)} className="mb-3 text-sm text-amber-500">
        ← Zurück
      </button>
      <h1 className="text-lg font-semibold">
        Bestellung #{raw}
        {isFlex && (
          <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 align-middle text-[10px] font-semibold text-amber-400">
            Flex
          </span>
        )}
      </h1>
      {err ? <p className="mt-2 text-sm text-red-400">{err}</p> : null}

      {isFlex && o ? (
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-zinc-200">
          {flexConfirmed ? (
            <>
              <p className="font-semibold text-amber-300">
                {o.status === "cancelled" ? "Buchung storniert" : "Termin disponiert"}
              </p>
              {/* schedule kann fehlen (z. B. cancelled-Order ohne Termin oder
                  confirmed-Order kurz vor dem Persist) — formatDeCH() liefert
                  bei undefined einen "—" Platzhalter, kein Crash. */}
              {o.schedule?.date ? (
                <p className="mt-1 text-zinc-300">
                  {formatDeCH(o.schedule.date)}
                  {o.schedule.time ? ` · ${o.schedule.time}` : ""}
                </p>
              ) : null}
            </>
          ) : (
            <>
              <p className="font-semibold text-amber-300">Wir disponieren Ihren Termin</p>
              <p className="mt-1 text-zinc-300">
                Spätestens am <strong>{formatDeCH(o.deadlineAt)}</strong>
                {o.flexibleEarliestAt ? <> (frühestens ab {formatDeCH(o.flexibleEarliestAt)})</> : null}.
              </p>
              <p className="mt-2 text-xs text-zinc-400">
                Sie erhalten von uns eine separate E-Mail mit Datum, Uhrzeit und zugewiesenem Fotografen, sobald der Termin steht — spätestens einen Tag vor der Aufnahme.
              </p>
            </>
          )}
        </div>
      ) : null}

      {o ? (
        <div className="mt-4 space-y-2 text-sm text-zinc-300">
          <p>
            <span className="text-zinc-500">Status:</span> {o.status || "—"}
          </p>
          {o.address ? (
            <p>
              <span className="text-zinc-500">Adresse:</span> {o.address}
            </p>
          ) : null}
          {!isFlex && o.schedule?.date ? (
            <p>
              <span className="text-zinc-500">Termin:</span> {o.schedule.date} {o.schedule.time}
            </p>
          ) : null}
        </div>
      ) : null}
      <p className="mt-4 text-xs text-zinc-500">
        Stornierung und Umbuchung: über die Schaltflächen in der zukünftigen Vollansicht; API ist unter <code className="text-amber-600/90">/api/customer/orders/…</code>{" "}
        abgesichert.
      </p>
    </div>
  );
}

export function CustomerInvoicesPage() {
  const { canPortal } = useCustomerPermissions();
  const { data, loading, err } = useJson<{ invoices?: Array<Record<string, unknown>> }>("/api/customer/invoices");
  const rows = Array.isArray(data?.invoices) ? data!.invoices! : [];
  if (!canPortal("portal.invoices.read")) {
    return <p className="text-sm text-zinc-500">Keine Berechtigung für Rechnungen.</p>;
  }
  if (loading) return <Loader2 className="h-6 w-6 animate-spin text-amber-500" />;
  return (
    <div>
      <h1 className="text-lg font-semibold">Rechnungen / Aufträge</h1>
      {err ? <p className="mt-2 text-sm text-red-400">{err}</p> : null}
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">Keine Einträge.</p>
      ) : (
        <ul className="mt-4 space-y-2 text-sm">
          {rows.map((r, i) => (
            <li key={i} className="rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2">
              #{String(r.orderNo)} · {String(r.status || "—")}{" "}
              {r.exxasInvoiceId ? <span className="ml-2 text-zinc-500">Exxas: {String(r.exxasInvoiceId)}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CustomerTeamPage() {
  const { canPortal } = useCustomerPermissions();
  const { data, loading, err, reload } = useJson<{ members?: Array<Record<string, unknown>> }>("/api/customer/team");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invBusy, setInvBusy] = useState(false);
  const members = Array.isArray(data?.members) ? data!.members! : [];

  if (!canPortal("portal.team.read")) {
    return <p className="text-sm text-zinc-500">Keine Berechtigung für Teamansicht.</p>;
  }
  if (loading) return <Loader2 className="h-6 w-6 animate-spin text-amber-500" />;

  const invite = async () => {
    if (!canPortal("portal.team.manage")) return;
    setInvBusy(true);
    try {
      const r = await fetch("/api/customer/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: inviteEmail, role: "mitarbeiter" }),
      });
      if (r.ok) {
        setInviteEmail("");
        void reload();
      }
    } catch {
      /* */
    } finally {
      setInvBusy(false);
    }
  };

  return (
    <div>
      <h1 className="text-lg font-semibold">Team</h1>
      {err ? <p className="mt-2 text-sm text-red-400">{err}</p> : null}
      <ul className="mt-4 space-y-2 text-sm">
        {members.length === 0 ? (
          <p className="text-zinc-500">Noch keine Teammitglieder.</p>
        ) : (
          members.map((m, i) => (
            <li key={i} className="rounded border border-zinc-800 px-3 py-2">
              {String(m.member_email || m.email || "—")} — {String(m.display_name || "")}{" "}
              <span className="text-zinc-500">({String(m.status || "—")})</span>
            </li>
          ))
        )}
      </ul>
      {canPortal("portal.team.manage") ? (
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <input
            className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
            placeholder="E-Mail einladen"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
          <button
            type="button"
            disabled={invBusy || !inviteEmail.includes("@")}
            onClick={() => void invite()}
            className="rounded bg-amber-600/90 px-3 py-2 text-sm text-zinc-950 disabled:opacity-50"
          >
            Einladen
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function CustomerProfilePage() {
  const { data, loading, err } = useJson<{
    customer?: Record<string, unknown>;
  }>("/api/customer/me");
  const c = data?.customer;
  if (loading) return <Loader2 className="h-6 w-6 animate-spin text-amber-500" />;
  return (
    <div>
      <h1 className="text-lg font-semibold">Profil</h1>
      {err ? <p className="mt-2 text-sm text-red-400">{err}</p> : null}
      {c ? (
        <dl className="mt-4 space-y-1 text-sm">
          {Object.entries(c).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="w-32 text-zinc-500">{k}</dt>
                <dd>{v === null || v === undefined || v === "" ? "—" : String(v)}</dd>
              </div>
            ))}
        </dl>
      ) : null}
    </div>
  );
}

export function CustomerMessagesHubPage() {
  const { canPortal } = useCustomerPermissions();
  const { data, loading } = useJson<{ orders?: OrderRow[] }>("/api/customer/orders");
  const orders = Array.isArray(data?.orders) ? data!.orders! : [];
  if (!canPortal("portal.messages.read")) {
    return <p className="text-sm text-zinc-500">Keine Nachrichten-Berechtigung.</p>;
  }
  if (loading) return <Loader2 className="h-6 w-6 animate-spin text-amber-500" />;
  return (
    <div>
      <h1 className="text-lg font-semibold">Nachrichten</h1>
      <p className="mt-2 text-sm text-zinc-500">Wähle eine Bestellung – Chat pro Auftrag in der Bestelldetailansicht (API /chat).</p>
      <ul className="mt-4 space-y-2 text-sm">
        {orders.map((o) => {
          const no = o.orderNo ?? o.id;
          return (
            <li key={String(no)}>
              <Link className="text-amber-500 hover:underline" to={`/account/orders/${no}`}>
                Auftrag #{no}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
