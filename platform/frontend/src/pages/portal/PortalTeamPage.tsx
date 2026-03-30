import { useEffect, useState, useRef } from "react";
import { Users, Plus, Trash2, AlertCircle, CheckCircle2, Mail } from "lucide-react";
import {
  getPortalTeam,
  invitePortalTeamMember,
  removePortalTeamMember,
  type PortalTeamMember,
} from "../../api/portalTours";

export function PortalTeamPage() {
  const [team, setTeam] = useState<PortalTeamMember[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("mitarbeiter");
  const [inviting, setInviting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setSuccessMsg(null), 4000);
  }

  function load() {
    return getPortalTeam()
      .then((r) => {
        setTeam(r.team);
        setCanManage(r.canManage);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setError(null);
    try {
      await invitePortalTeamMember(inviteEmail.trim(), inviteRole);
      setInviteEmail("");
      showSuccess(`Einladung an ${inviteEmail} gesendet.`);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Fehler beim Einladen");
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(member: PortalTeamMember) {
    if (!confirm(`${member.member_email} wirklich entfernen?`)) return;
    setError(null);
    try {
      await removePortalTeamMember(member.id);
      showSuccess(`${member.member_email} wurde entfernt.`);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Fehler beim Entfernen");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#C5A059]/25 border-t-[#C5A059]" />
      </div>
    );
  }

  const activeMembers = team.filter((m) => m.status === "active");
  const pendingMembers = team.filter((m) => m.status === "pending");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Team</h1>
        <span className="text-sm text-slate-500 dark:text-zinc-400">{activeMembers.length} aktive Mitglieder</span>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">{successMsg}</span>
        </div>
      )}

      {/* Einladungsformular */}
      {canManage && (
        <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-5">
          <h2 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Mitglied einladen
          </h2>
          <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="email"
                placeholder="E-Mail-Adresse"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#C5A059]/50"
              />
            </div>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#C5A059]/50"
            >
              <option value="mitarbeiter">Mitarbeiter</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="submit"
              disabled={inviting}
              className="px-4 py-2 rounded-lg bg-[#C5A059] text-white text-sm font-medium hover:bg-[#b3904a] disabled:opacity-50 transition-colors"
            >
              {inviting ? "Sende…" : "Einladen"}
            </button>
          </form>
        </div>
      )}

      {/* Aktive Mitglieder */}
      <div>
        <h2 className="font-semibold text-slate-700 dark:text-zinc-300 mb-3">
          Aktive Mitglieder ({activeMembers.length})
        </h2>
        {activeMembers.length === 0 ? (
          <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-8 text-center">
            <Users className="h-8 w-8 mx-auto mb-2 text-slate-300 dark:text-zinc-600" />
            <p className="text-slate-500 dark:text-zinc-400 text-sm">Keine aktiven Mitglieder.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden">
            {activeMembers.map((m, idx) => (
              <div
                key={m.id}
                className={`flex items-center justify-between px-4 py-3 ${idx < activeMembers.length - 1 ? "border-b border-slate-50 dark:border-zinc-800/50" : ""}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-8 w-8 rounded-full bg-[#C5A059]/15 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-[#C5A059]">
                      {(m.display_name || m.member_email).charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {m.display_name || m.member_email}
                    </div>
                    {m.display_name && (
                      <div className="text-xs text-slate-400 dark:text-zinc-500 truncate">{m.member_email}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <RoleBadge role={m.role} />
                  {canManage && (
                    <button
                      onClick={() => handleRemove(m)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      title="Mitglied entfernen"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ausstehende Einladungen */}
      {pendingMembers.length > 0 && (
        <div>
          <h2 className="font-semibold text-slate-700 dark:text-zinc-300 mb-3">
            Ausstehende Einladungen ({pendingMembers.length})
          </h2>
          <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 overflow-hidden">
            {pendingMembers.map((m, idx) => (
              <div
                key={m.id}
                className={`flex items-center justify-between px-4 py-3 ${idx < pendingMembers.length - 1 ? "border-b border-amber-100 dark:border-amber-800/50" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-amber-500 dark:text-amber-400 flex-shrink-0" />
                  <div className="text-sm text-slate-700 dark:text-zinc-300">{m.member_email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <RoleBadge role={m.role} />
                  {canManage && (
                    <button
                      onClick={() => handleRemove(m)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    inhaber: { label: "Inhaber", cls: "bg-[#C5A059]/15 text-[#C5A059]" },
    admin: { label: "Admin", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
    mitarbeiter: { label: "Mitarbeiter", cls: "bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400" },
    exxas: { label: "Exxas", cls: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  };
  const s = map[role] ?? { label: role, cls: "bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}
