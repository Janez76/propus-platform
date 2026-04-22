"use client";

import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useCustomerPermissions } from "@/hooks/useCustomerPermissions";
import { isPortalHost } from "@/lib/portalHost";
import { Loader2 } from "lucide-react";

type OrderRow = { orderNo?: number; id?: number; status?: string; address?: string; schedule?: { date?: string; time?: string } };

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
  if (loading) return <Loader2 className="h-6 w-6 animate-spin text-amber-500" />;
  if (!canPortal("portal.orders.read")) {
    return <p className="text-sm text-zinc-500">Kein Zugriff.</p>;
  }
  return (
    <div>
      <h1 className="text-lg font-semibold">Bestellungen</h1>
      {err ? <p className="mt-2 text-sm text-red-400">{err}</p> : null}
      {orders.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">Keine Bestellungen.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {orders.map((o) => {
            const no = o.orderNo ?? o.id;
            return (
              <li key={String(no)}>
                <Link
                  to={`/account/orders/${no}`}
                  className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm hover:border-amber-600/40"
                >
                  <span>#{no}</span>
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

  const o = order as { address?: string; status?: string; orderNo?: number; schedule?: { date?: string; time?: string } } | null;
  return (
    <div>
      <button type="button" onClick={() => navigate(-1)} className="mb-3 text-sm text-amber-500">
        ← Zurück
      </button>
      <h1 className="text-lg font-semibold">Bestellung #{raw}</h1>
      {err ? <p className="mt-2 text-sm text-red-400">{err}</p> : null}
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
          {o.schedule ? (
            <p>
              <span className="text-zinc-500">Termin:</span> {o.schedule?.date} {o.schedule?.time}
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
