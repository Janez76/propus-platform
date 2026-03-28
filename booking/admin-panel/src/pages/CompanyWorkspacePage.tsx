import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createCompanyInvitation,
  getCompanyCustomers,
  getCompanyInvitations,
  getCompanyMe,
  getCompanyMembers,
  getCompanyOrders,
  updateCompanyProfile,
  type CompanyMemberRole,
} from "../api/company";
import { useAuth } from "../hooks/useAuth";
import { isCompanyAdminLike } from "../lib/companyRoles";

export function CompanyWorkspacePage() {
  const { token, role } = useAuth();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<CompanyMemberRole>("company_employee");
  const [members, setMembers] = useState<Array<{ id: number; email: string; role: string; status: string }>>([]);
  const [invitations, setInvitations] = useState<Array<{ id: number; email: string; role: string; expires_at: string }>>([]);
  const [ordersCount, setOrdersCount] = useState(0);
  const [customersCount, setCustomersCount] = useState(0);

  const canManageCompany = isCompanyAdminLike(role);

  const load = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      const [me, membersRes, invitesRes, ordersRes, customersRes] = await Promise.all([
        getCompanyMe(token),
        getCompanyMembers(token),
        getCompanyInvitations(token),
        getCompanyOrders(token),
        getCompanyCustomers(token),
      ]);
      setCompanyName(me.company?.name || "");
      setMembers(membersRes.members || []);
      setInvitations(invitesRes.invitations || []);
      setOrdersCount((ordersRes.orders || []).length);
      setCustomersCount((customersRes.customers || []).length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Workspace konnte nicht geladen werden");
    } finally {
      setBusy(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeMembers = useMemo(() => members.filter((m) => m.status === "active").length, [members]);

  async function saveCompanyName() {
    if (!token || !companyName.trim()) return;
    try {
      await updateCompanyProfile(token, { name: companyName.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Firma konnte nicht gespeichert werden");
    }
  }

  async function inviteMember() {
    if (!token || !email.trim()) return;
    try {
      await createCompanyInvitation(token, { email: email.trim(), role: inviteRole });
      setEmail("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Einladung konnte nicht erstellt werden");
    }
  }

  if (busy) {
    return <div className="p-6 text-sm text-slate-500">Company-Workspace wird geladen...</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Company Workspace</h1>
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border p-4">
          <div className="text-xs uppercase text-slate-500">Aktive Mitglieder</div>
          <div className="text-2xl font-semibold">{activeMembers}</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-xs uppercase text-slate-500">Kunden</div>
          <div className="text-2xl font-semibold">{customersCount}</div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-xs uppercase text-slate-500">Aufträge</div>
          <div className="text-2xl font-semibold">{ordersCount}</div>
        </div>
      </div>

      <div className="rounded-xl border p-4 space-y-3">
        <h2 className="font-medium">Firmenprofil</h2>
        <div className="flex gap-2">
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="w-full rounded-lg border px-3 py-2"
            placeholder="Firmenname"
            disabled={!canManageCompany}
          />
          <button
            type="button"
            onClick={() => void saveCompanyName()}
            disabled={!canManageCompany}
            className="rounded-lg bg-slate-900 text-white px-4 py-2 disabled:opacity-50"
          >
            Speichern
          </button>
        </div>
      </div>

      {canManageCompany ? (
        <div className="rounded-xl border p-4 space-y-3">
          <h2 className="font-medium">Mitarbeiter einladen</h2>
          <div className="flex flex-col md:flex-row gap-2">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="E-Mail"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as CompanyMemberRole)}
              className="rounded-lg border px-3 py-2"
            >
              <option value="company_employee">Mitarbeiter</option>
              <option value="company_admin">Admin</option>
              {role === "company_owner" ? <option value="company_owner">Hauptkontakt (Inhaber)</option> : null}
            </select>
            <button type="button" onClick={() => void inviteMember()} className="rounded-lg bg-[#9E8649] text-white px-4 py-2">
              Einladung senden
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border p-4">
          <h2 className="font-medium mb-2">Mitglieder</h2>
          <div className="space-y-2 text-sm">
            {members.map((member) => (
              <div key={member.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span>{member.email}</span>
                <span className="text-slate-500">{member.role}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border p-4">
          <h2 className="font-medium mb-2">Offene Einladungen</h2>
          <div className="space-y-2 text-sm">
            {invitations.map((invitation) => (
              <div key={invitation.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span>{invitation.email}</span>
                <span className="text-slate-500">{invitation.role}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
