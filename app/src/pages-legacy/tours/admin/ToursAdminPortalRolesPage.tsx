import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import {
  getToursAdminPortalExternContacts,
  getToursAdminPortalRoles,
  postPortalExternRemove,
  postPortalExternSet,
  postPortalStaffAdd,
  postPortalStaffRemove,
} from "../../../api/toursAdmin";
import { useQuery } from "../../../hooks/useQuery";
import { toursAdminPortalRolesQueryKey } from "../../../lib/queryKeys";

export function ToursAdminPortalRolesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "extern" ? "extern" : "intern";
  const qk = toursAdminPortalRolesQueryKey(tab);
  const queryFn = useCallback(() => getToursAdminPortalRoles(tab), [tab]);
  const { data, loading, error, refetch } = useQuery(qk, queryFn, { staleTime: 20_000 });

  const staffRows = (data?.staffRows as Record<string, unknown>[]) ?? [];
  const externRows = (data?.externRows as Record<string, unknown>[]) ?? [];
  const ownerList = (data?.ownerList as Record<string, unknown>[]) ?? [];

  const [staffEmail, setStaffEmail] = useState("");
  const [extOwner, setExtOwner] = useState("");
  const [extOwnerCid, setExtOwnerCid] = useState("");
  const [extMember, setExtMember] = useState("");
  const [contacts, setContacts] = useState<Record<string, unknown>[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== "extern" || (!extOwner && !extOwnerCid)) {
      setContacts([]);
      return;
    }
    void getToursAdminPortalExternContacts(extOwner || undefined, extOwnerCid || undefined)
      .then((r) => setContacts((r.contacts as Record<string, unknown>[]) ?? []))
      .catch(() => setContacts([]));
  }, [tab, extOwner, extOwnerCid]);

  function setTab(next: string) {
    setSearchParams((p) => {
      const n = new URLSearchParams(p);
      n.set("tab", next);
      return n;
    }, { replace: true });
  }

  async function doStaffAdd(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await postPortalStaffAdd(staffEmail.trim());
      setStaffEmail("");
      setMsg("Interne Rolle hinzugefügt.");
      void refetch();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Fehler");
    }
  }

  async function doStaffRemove(email: string) {
    setErr(null);
    try {
      await postPortalStaffRemove(email);
      void refetch();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Fehler");
    }
  }

  async function doExternSet(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!extOwner || !extMember) {
      setErr("Workspace und Mitglied wählen.");
      return;
    }
    try {
      await postPortalExternSet(extOwner.trim().toLowerCase(), extMember.trim().toLowerCase());
      setMsg("Kunden-Admin gesetzt.");
      void refetch();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Fehler");
    }
  }

  async function doExternRemove(owner: string, member: string) {
    setErr(null);
    try {
      await postPortalExternRemove(owner, member);
      void refetch();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Fehler");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--text-main)]">Portal-Rollen</h1>
        <p className="text-sm text-[var(--text-subtle)] mt-1">
          Intern (Tour-Manager) und extern (Kunden-Admins).
        </p>
      </div>

      <div className="flex gap-2 border-b border-[var(--border-soft)]">
        <button
          type="button"
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === "intern" ? "border-[var(--accent)] text-[var(--text-main)]" : "border-transparent text-[var(--text-subtle)]"}`}
          onClick={() => setTab("intern")}
        >
          Intern
        </button>
        <button
          type="button"
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === "extern" ? "border-[var(--accent)] text-[var(--text-main)]" : "border-transparent text-[var(--text-subtle)]"}`}
          onClick={() => setTab("extern")}
        >
          Extern
        </button>
      </div>

      {msg ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">{msg}</p>
      ) : null}
      {err ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {err}
        </div>
      ) : null}
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : null}

      {tab === "intern" ? (
        <div className="space-y-4">
          <form onSubmit={doStaffAdd} className="surface-card-strong p-4 flex flex-wrap gap-2 items-end">
            <label className="text-sm flex-1 min-w-[200px]">
              <span className="text-[var(--text-subtle)]">E-Mail (Tour-Manager Portal)</span>
              <input
                className="mt-1 w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm"
                value={staffEmail}
                onChange={(e) => setStaffEmail(e.target.value)}
                placeholder="name@firma.ch"
              />
            </label>
            <button type="submit" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white">
              Hinzufügen
            </button>
          </form>
          <div className="surface-card-strong overflow-x-auto">
            {loading && !data ? (
              <p className="p-4 text-sm text-[var(--text-subtle)]">Laden …</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-soft)] text-left text-[var(--text-subtle)]">
                    <th className="p-3">E-Mail</th>
                    <th className="p-3">Rolle</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {staffRows.map((row, i) => {
                    const em = String(row.email_norm || row.member_email || row.email || "");
                    return (
                      <tr key={i} className="border-b border-[var(--border-soft)]/60">
                        <td className="p-3">{em || "—"}</td>
                        <td className="p-3">{String(row.role || "—")}</td>
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            className="text-red-600 text-xs hover:underline"
                            onClick={() => void doStaffRemove(em)}
                          >
                            Entfernen
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <form onSubmit={doExternSet} className="surface-card-strong p-4 space-y-3">
            <p className="text-sm text-[var(--text-subtle)]">
              Workspace-Inhaber aus Touren auswählen und Kontakt als Kunden-Admin setzen.
            </p>
            <label className="block text-sm">
              <span className="text-[var(--text-subtle)]">Workspace (E-Mail)</span>
              <select
                className="mt-1 w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm"
                value={extOwner}
                onChange={(e) => {
                  setExtOwner(e.target.value);
                  const sel = ownerList.find((o) => String(o.owner_email) === e.target.value);
                  setExtOwnerCid(sel?.customer_id != null ? String(sel.customer_id) : "");
                }}
              >
                <option value="">— wählen —</option>
                {ownerList.map((o, i) => (
                  <option key={i} value={String(o.owner_email || "")}>
                    {String(o.customer_name || o.owner_email)} ({String(o.owner_email)})
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-[var(--text-subtle)]">Kunden-ID (optional, für Kontakte)</span>
              <input
                className="mt-1 w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm"
                value={extOwnerCid}
                onChange={(e) => setExtOwnerCid(e.target.value)}
                placeholder="core.customers.id"
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--text-subtle)]">Mitglied (E-Mail)</span>
              <select
                className="mt-1 w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm"
                value={extMember}
                onChange={(e) => setExtMember(e.target.value)}
              >
                <option value="">— Kontakt wählen —</option>
                {contacts.map((c, i) => (
                  <option key={i} value={String(c.email || "")}>
                    {String(c.name || c.email)} ({String(c.position || "")})
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white">
              Als Kunden-Admin setzen
            </button>
          </form>

          <div className="surface-card-strong overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-soft)] text-left text-[var(--text-subtle)]">
                  <th className="p-3">Kunde / Workspace</th>
                  <th className="p-3">Admin-E-Mail</th>
                  <th className="p-3">Rolle</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {externRows.map((row, i) => (
                  <tr key={i} className="border-b border-[var(--border-soft)]/60">
                    <td className="p-3">
                      <div>{String(row.customer_name || row.owner_email || "—")}</div>
                      <div className="text-xs text-[var(--text-subtle)]">{String(row.owner_email || "")}</div>
                    </td>
                    <td className="p-3">{String(row.member_email || "—")}</td>
                    <td className="p-3">{String(row.role || "—")}</td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        className="text-xs text-red-600 hover:underline"
                        onClick={() =>
                          void doExternRemove(
                            String(row.owner_email || "").toLowerCase(),
                            String(row.member_email || "").toLowerCase()
                          )
                        }
                      >
                        Auf Mitarbeiter
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-[var(--text-subtle)]">
            Kunden-Stammdaten:{" "}
            <Link to="/admin/tours/customers" className="text-[var(--accent)] hover:underline">
              Kundenliste
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
