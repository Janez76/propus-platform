import { useCallback, useState } from "react";
import { AlertCircle } from "lucide-react";
import {
  deleteToursAdminTeamUser,
  getToursAdminTeam,
  postToursAdminTeamInvite,
  postToursAdminTeamRevokeInvite,
  postToursAdminTeamToggleActive,
  putToursAdminTeamUser,
} from "../../../api/toursAdmin";
import { useQuery } from "../../../hooks/useQuery";
import { toursAdminTeamQueryKey } from "../../../lib/queryKeys";


type UserRow = {
  id: number | null;
  email: string;
  name: string | null;
  source?: string;
  isActive: boolean;
};

type InviteRow = { id: number; email: string; invitedBy: string | null };

export function ToursAdminTeamPage() {
  const qk = toursAdminTeamQueryKey();
  const queryFn = useCallback(() => getToursAdminTeam(), []);
  const { data, loading, error, refetch } = useQuery(qk, queryFn, { staleTime: 15_000 });

  const users = (data?.users as UserRow[]) ?? [];
  const pendingInvites = (data?.pendingInvites as InviteRow[]) ?? [];

  const [inviteEmail, setInviteEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<number, { email: string; name: string; password: string }>>({});

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await postToursAdminTeamInvite(inviteEmail.trim());
      setInviteEmail("");
      void refetch();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Einladung fehlgeschlagen");
    }
  }

  async function toggle(email: string, action: "enable" | "disable") {
    setErr(null);
    try {
      await postToursAdminTeamToggleActive(email, action);
      void refetch();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Fehler");
    }
  }

  async function revoke(id: number) {
    setErr(null);
    try {
      await postToursAdminTeamRevokeInvite(id);
      void refetch();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Fehler");
    }
  }

  function startEdit(u: UserRow) {
    if (u.id == null) return;
    setEditing((m) => ({
      ...m,
      [u.id!]: { email: u.email, name: u.name || "", password: "" },
    }));
  }

  async function saveUser(id: number) {
    const row = editing[id];
    if (!row) return;
    setErr(null);
    try {
      await putToursAdminTeamUser(id, {
        email: row.email,
        name: row.name,
        password: row.password || undefined,
      });
      setEditing((m) => {
        const n = { ...m };
        delete n[id];
        return n;
      });
      void refetch();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Update fehlgeschlagen");
    }
  }

  async function delUser(id: number) {
    if (!window.confirm("Benutzer wirklich löschen?")) return;
    setErr(null);
    try {
      const r = await deleteToursAdminTeamUser(id);
      if ((r as { loggedOut?: boolean }).loggedOut) {
        window.location.href = "/login";
        return;
      }
      void refetch();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Löschen fehlgeschlagen");
    }
  }

  if (loading && !data) return <p className="text-sm text-[var(--text-subtle)]">Laden …</p>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--text-main)]">Admin-Team</h1>
        <p className="text-sm text-[var(--text-subtle)] mt-1">
          Zugänge für den Tour-Manager-Login.
        </p>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {err ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {err}
        </div>
      ) : null}

      <form onSubmit={invite} className="surface-card-strong p-4 flex flex-wrap gap-2 items-end">
        <label className="text-sm flex-1 min-w-[200px]">
          <span className="text-[var(--text-subtle)]">E-Mail einladen</span>
          <input
            type="email"
            className="mt-1 w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
        </label>
        <button type="submit" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white">
          Einladen
        </button>
      </form>

      {pendingInvites.length > 0 ? (
        <section className="surface-card-strong p-4">
          <h2 className="font-semibold text-[var(--text-main)] mb-2">Offene Einladungen</h2>
          <ul className="space-y-2 text-sm">
            {pendingInvites.map((inv) => (
              <li key={inv.id} className="flex justify-between gap-2 border-b border-[var(--border-soft)]/60 pb-2">
                <span>{inv.email}</span>
                <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => void revoke(inv.id)}>
                  Widerrufen
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="surface-card-strong overflow-x-auto p-4">
        <h2 className="font-semibold text-[var(--text-main)] mb-3">Benutzer</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border-soft)] text-left text-[var(--text-subtle)]">
              <th className="p-2">E-Mail</th>
              <th className="p-2">Name</th>
              <th className="p-2">Quelle</th>
              <th className="p-2">Aktiv</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const edit = u.id != null ? editing[u.id] : undefined;
              return (
                <tr key={`${u.email}-${u.id ?? "env"}`} className="border-b border-[var(--border-soft)]/60 align-top">
                  <td className="p-2">
                    {edit ? (
                      <input
                        className="w-full rounded border border-[var(--border-soft)] px-2 py-1 text-xs"
                        value={edit.email}
                        onChange={(e) =>
                          setEditing((m) => ({ ...m, [u.id!]: { ...edit, email: e.target.value } }))
                        }
                      />
                    ) : (
                      u.email
                    )}
                  </td>
                  <td className="p-2">
                    {edit ? (
                      <input
                        className="w-full rounded border border-[var(--border-soft)] px-2 py-1 text-xs"
                        value={edit.name}
                        onChange={(e) =>
                          setEditing((m) => ({ ...m, [u.id!]: { ...edit, name: e.target.value } }))
                        }
                      />
                    ) : (
                      u.name || "—"
                    )}
                  </td>
                  <td className="p-2 text-xs text-[var(--text-subtle)]">{u.source || "—"}</td>
                  <td className="p-2">{u.isActive ? "ja" : "nein"}</td>
                  <td className="p-2 text-right space-x-2 whitespace-nowrap">
                    {u.id != null ? (
                      edit ? (
                        <>
                          <input
                            type="password"
                            placeholder="Neues Passwort"
                            className="rounded border border-[var(--border-soft)] px-2 py-1 text-xs w-28"
                            value={edit.password}
                            onChange={(e) =>
                              setEditing((m) => ({ ...m, [u.id!]: { ...edit, password: e.target.value } }))
                            }
                          />
                          <button type="button" className="text-[var(--accent)] text-xs" onClick={() => void saveUser(u.id!)}>
                            Speichern
                          </button>
                          <button type="button" className="text-xs" onClick={() => setEditing((m) => { const n = { ...m }; delete n[u.id!]; return n; })}>
                            Abbruch
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="text-xs text-[var(--accent)]" onClick={() => startEdit(u)}>
                            Bearbeiten
                          </button>
                          <button type="button" className="text-xs" onClick={() => void toggle(u.email, u.isActive ? "disable" : "enable")}>
                            {u.isActive ? "Sperren" : "Aktivieren"}
                          </button>
                          <button type="button" className="text-xs text-red-600" onClick={() => void delUser(u.id!)}>
                            Löschen
                          </button>
                        </>
                      )
                    ) : (
                      <span className="text-xs text-[var(--text-subtle)]">nur .env</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
