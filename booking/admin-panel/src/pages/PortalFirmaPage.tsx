import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createCompanyInvitation,
  deleteCompanyInvitation,
  resendCompanyInvitation,
  getCompanyCustomers,
  getCompanyInvitations,
  getCompanyInviteSuggestions,
  getCompanyMe,
  getCompanyMembers,
  getCompanyOrders,
  updateCompanyMemberActive,
  updateCompanyMemberRole,
  updateCompanyProfile,
  type Company,
  type CompanyInvitation,
  type CompanyMember,
  type CompanyMemberRole,
  type CompanyOrder,
  type InviteSuggestion,
} from "../api/company";
import { useAuth } from "../hooks/useAuth";
import { isCompanyAdminLike } from "../lib/companyRoles";
import {
  Building2,
  ShoppingCart,
  Users,
  Mail,
  UserPlus,
  ChevronDown,
  ChevronUp,
  Shield,
  Check,
  X,
  RefreshCw,
  Send,
  Clock,
  Pencil,
} from "lucide-react";

function toDateSafe(value?: string) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function orderDate(order: CompanyOrder) {
  return toDateSafe(order.appointmentDate) ?? toDateSafe(order.createdAt);
}

const ROLE_LABELS: Record<CompanyMemberRole, string> = {
  company_owner: "Hauptkontakt",
  company_admin: "Mitarbeiter", // @deprecated - wird nicht mehr vergeben
  company_employee: "Mitarbeiter",
};

const ROLE_PERMISSIONS: Record<CompanyMemberRole, string[]> = {
  company_owner: ["Aufträge lesen", "Aufträge erstellen", "Aufträge bearbeiten", "Kunden einsehen", "Firma verwalten", "Team verwalten", "Kalender"],
  company_admin: ["Aufträge lesen", "Kunden einsehen", "Kalender"], // @deprecated - wird nicht mehr vergeben
  company_employee: ["Aufträge lesen", "Aufträge erstellen", "Kunden einsehen", "Kalender"],
};

const ALL_PERMISSIONS = ["Aufträge lesen", "Aufträge erstellen", "Aufträge bearbeiten", "Kunden einsehen", "Firma verwalten", "Team verwalten", "Kalender"];

type TabKey = "orders" | "team" | "invitations";

export function PortalFirmaPage() {
  const { token, role } = useAuth();
  const canManage = isCompanyAdminLike(role);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("orders");

  const [company, setCompany] = useState<Company | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [orders, setOrders] = useState<CompanyOrder[]>([]);
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [invitations, setInvitations] = useState<CompanyInvitation[]>([]);
  const [employeesCount, setEmployeesCount] = useState(0);
  const [myMembership, setMyMembership] = useState<CompanyMember | null>(null);

  const [statusFilter, setStatusFilter] = useState("alle");
  const [memberFilter, setMemberFilter] = useState("alle");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<CompanyMemberRole>("company_employee");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteSuggestions, setInviteSuggestions] = useState<InviteSuggestion[]>([]);

  const [actionBusy, setActionBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      const [me, ordersRes, membersRes, invitesRes, customersRes, suggestionsRes] = await Promise.all([
        getCompanyMe(token),
        getCompanyOrders(token),
        getCompanyMembers(token),
        canManage ? getCompanyInvitations(token) : Promise.resolve({ ok: true as const, invitations: [] }),
        getCompanyCustomers(token),
        canManage ? getCompanyInviteSuggestions(token).catch(() => ({ ok: true as const, suggestions: [] })) : Promise.resolve({ ok: true as const, suggestions: [] }),
      ]);
      setCompany(me.company || null);
      setCompanyName(me.company?.name || "");
      setMyMembership(me.membership || null);
      setOrders(ordersRes.orders || []);
      setMembers(membersRes.members || []);
      setInvitations(invitesRes.invitations || []);
      setEmployeesCount((customersRes.customers || []).length);
      setInviteSuggestions(suggestionsRes.suggestions || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Portal konnte nicht geladen werden");
    } finally {
      setBusy(false);
    }
  }, [token, canManage]);

  useEffect(() => { void load(); }, [load]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const o of orders) if (o.status) set.add(String(o.status));
    return ["alle", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [orders]);

  const activeEmployees = useMemo(
    () => members.filter((m) => m.status === "active" && m.role === "company_employee"),
    [members],
  );

  const filteredOrders = useMemo(() => {
    const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
    const to = toDate ? new Date(`${toDate}T23:59:59`) : null;
    return orders.filter((o) => {
      if (statusFilter !== "alle" && String(o.status || "") !== statusFilter) return false;
      if (memberFilter !== "alle" && String(o.createdByMemberId || "") !== memberFilter) return false;
      const d = orderDate(o);
      if (from && (!d || d < from)) return false;
      if (to && (!d || d > to)) return false;
      return true;
    });
  }, [orders, statusFilter, memberFilter, fromDate, toDate]);

  const pendingInvitations = useMemo(
    () => invitations.filter((i) => !i.accepted_at && new Date(i.expires_at) > new Date()),
    [invitations],
  );

  async function handleSaveCompanyName() {
    if (!token || !companyName.trim()) return;
    try {
      await updateCompanyProfile(token, { name: companyName.trim() });
      setEditingName(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Firma konnte nicht gespeichert werden");
    }
  }

  async function handleInvite() {
    if (!token || !inviteEmail.trim()) return;
    setInviteBusy(true);
    setError("");
    try {
      await createCompanyInvitation(token, { email: inviteEmail.trim(), role: inviteRole });
      setInviteEmail("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Einladung konnte nicht erstellt werden");
    } finally {
      setInviteBusy(false);
    }
  }

  async function handleDeleteInvitation(invitationId: number) {
    if (!token) return;
    setError("");
    try {
      await deleteCompanyInvitation(token, invitationId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Einladung konnte nicht gelöscht werden");
    }
  }

  async function handleResendInvitation(invitationId: number) {
    if (!token) return;
    setError("");
    try {
      await resendCompanyInvitation(token, invitationId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Einladung konnte nicht erneut gesendet werden");
    }
  }

  async function handleRoleChange(memberId: number, newRole: CompanyMemberRole) {
    if (!token) return;
    setActionBusy(memberId);
    setError("");
    try {
      await updateCompanyMemberRole(token, memberId, newRole);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rolle konnte nicht geändert werden");
    } finally {
      setActionBusy(null);
    }
  }

  async function handleToggleActive(memberId: number, currentlyActive: boolean) {
    if (!token) return;
    setActionBusy(memberId);
    setError("");
    try {
      await updateCompanyMemberActive(token, memberId, !currentlyActive);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status konnte nicht geändert werden");
    } finally {
      setActionBusy(null);
    }
  }

  if (busy) return <div className="p-6 text-sm text-[var(--text-subtle)]">Firmenportal wird geladen…</div>;

  const tabs: { key: TabKey; label: string; icon: typeof ShoppingCart; badge?: number }[] = [
    { key: "orders", label: "Aufträge", icon: ShoppingCart },
    ...(canManage ? [
      { key: "team" as const, label: "Team & Rechte", icon: Users },
      { key: "invitations" as const, label: "Einladungen", icon: Mail, badge: pendingInvitations.length || undefined },
    ] : []),
  ];

  return (
    <div className="space-y-5 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent)]/10">
            <Building2 className="h-5 w-5 text-[var(--accent)]" />
          </div>
          <div>
            {editingName && canManage ? (
              <div className="flex items-center gap-2">
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="rounded-lg border border-slate-300 px-2 py-1 text-lg font-semibold border-[var(--border-soft)] bg-[var(--surface-raised)] text-[var(--text-main)]"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") void handleSaveCompanyName(); if (e.key === "Escape") setEditingName(false); }}
                />
                <button onClick={() => void handleSaveCompanyName()} className="rounded-md bg-[var(--accent)] p-1.5 text-white hover:bg-[#b08f4a]"><Check className="h-4 w-4" /></button>
                <button onClick={() => { setEditingName(false); setCompanyName(company?.name || ""); }} className="rounded-md border border-slate-300 p-1.5 text-slate-500 hover:bg-slate-50 border-[var(--border-soft)] text-[var(--text-subtle)]"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold text-[var(--text-main)]">{company?.name || "Firmenportal"}</h1>
                {canManage && (
                  <button onClick={() => setEditingName(true)} className="rounded-md p-1 text-slate-400 hover:text-slate-600 text-[var(--text-subtle)] hover:text-[var(--text-muted)]"><Pencil className="h-4 w-4" /></button>
                )}
              </div>
            )}
            <p className="text-sm text-[var(--text-subtle)]">
              {members.filter((m) => m.status === "active").length} Mitglieder · {orders.length} Aufträge
              {pendingInvitations.length > 0 && ` · ${pendingInvitations.length} offene Einladung${pendingInvitations.length > 1 ? "en" : ""}`}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
          {error}
          <button onClick={() => setError("")} className="ml-2 text-red-600 underline hover:no-underline dark:text-red-300">Schliessen</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 border-[var(--border-soft)] bg-[var(--surface)]/60">
        {tabs.map(({ key, label, icon: Icon, badge }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
              activeTab === key
                ? "bg-white text-slate-900 shadow-sm bg-[var(--surface-raised)] text-[var(--text-main)]"
                : "text-slate-500 hover:text-slate-700 text-[var(--text-subtle)] hover:text-[var(--text-muted)]"
            }`}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
            {badge != null && badge > 0 && (
              <span className="rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-bold text-white">{badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "orders" && (
        <OrdersTab
          canManage={canManage}
          orders={orders}
          filteredOrders={filteredOrders}
          employeesCount={employeesCount}
          statusOptions={statusOptions}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          memberFilter={memberFilter}
          setMemberFilter={setMemberFilter}
          activeEmployees={activeEmployees}
          fromDate={fromDate}
          setFromDate={setFromDate}
          toDate={toDate}
          setToDate={setToDate}
        />
      )}

      {activeTab === "team" && canManage && (
        <TeamTab
          members={members}
          myMembership={myMembership}
          role={role}
          actionBusy={actionBusy}
          onRoleChange={handleRoleChange}
          onToggleActive={handleToggleActive}
        />
      )}

      {activeTab === "invitations" && canManage && (
        <InvitationsTab
          inviteEmail={inviteEmail}
          setInviteEmail={setInviteEmail}
          inviteRole={inviteRole}
          setInviteRole={setInviteRole}
          inviteBusy={inviteBusy}
          onInvite={handleInvite}
          onDelete={handleDeleteInvitation}
          onResend={handleResendInvitation}
          pendingInvitations={pendingInvitations}
          role={role}
          suggestions={inviteSuggestions}
        />
      )}
    </div>
  );
}

/* ── Orders Tab ────────────────────────────────────────── */
function OrdersTab({
  canManage, orders, filteredOrders, employeesCount, statusOptions, statusFilter, setStatusFilter,
  memberFilter, setMemberFilter, activeEmployees, fromDate, setFromDate, toDate, setToDate,
}: {
  canManage: boolean;
  orders: CompanyOrder[];
  filteredOrders: CompanyOrder[];
  employeesCount: number;
  statusOptions: string[];
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  memberFilter: string;
  setMemberFilter: (v: string) => void;
  activeEmployees: CompanyMember[];
  fromDate: string;
  setFromDate: (v: string) => void;
  toDate: string;
  setToDate: (v: string) => void;
}) {
  const employeeLastOrders = useMemo(() => {
    return activeEmployees.map((m) => {
      const mine = orders
        .filter((o) => Number(o.createdByMemberId) === Number(m.id))
        .sort((a, b) => (orderDate(b)?.getTime() ?? 0) - (orderDate(a)?.getTime() ?? 0));
      return { member: m, lastOrder: mine[0] || null, ordersCount: mine.length };
    });
  }, [activeEmployees, orders]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Aufträge gesamt" value={orders.length} />
        <StatCard label="Sichtbare Aufträge" value={filteredOrders.length} />
        <StatCard label="Mitarbeiter" value={employeesCount} />
      </div>

      <div className={`grid gap-2 rounded-xl border border-slate-200 bg-white p-4 border-[var(--border-soft)] bg-[var(--surface)] ${canManage ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm border-[var(--border-soft)] bg-[var(--surface-raised)] text-[var(--text-main)]">
          {statusOptions.map((s) => <option key={s} value={s}>{s === "alle" ? "Alle Status" : s}</option>)}
        </select>
        {canManage && (
          <select value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm border-[var(--border-soft)] bg-[var(--surface-raised)] text-[var(--text-main)]">
            <option value="alle">Alle Mitarbeiter</option>
            {activeEmployees.map((m) => <option key={m.id} value={String(m.id)}>{m.email}</option>)}
          </select>
        )}
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm border-[var(--border-soft)] bg-[var(--surface-raised)] text-[var(--text-main)]" />
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm border-[var(--border-soft)] bg-[var(--surface-raised)] text-[var(--text-main)]" />
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white border-[var(--border-soft)] bg-[var(--surface)]">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 border-[var(--border-soft)] bg-[var(--surface)]/80">
            <tr>
              <th className="px-4 py-3 font-medium text-[var(--text-muted)]">Nr.</th>
              <th className="px-4 py-3 font-medium text-[var(--text-muted)]">Status</th>
              <th className="px-4 py-3 font-medium text-[var(--text-muted)]">Kunde</th>
              <th className="px-4 py-3 font-medium text-[var(--text-muted)]">Adresse</th>
              <th className="px-4 py-3 font-medium text-[var(--text-muted)]">Termin/Erfasst</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-[var(--text-subtle)]">Keine Aufträge im aktuellen Filter.</td></tr>
            ) : filteredOrders.map((o) => (
              <tr key={String(o.orderNo ?? `${o.createdAt}-${o.address}`)} className="border-b border-slate-100 last:border-0 border-[var(--border-soft)]">
                <td className="px-4 py-3 font-mono text-[var(--text-main)]">{String(o.orderNo ?? "–")}</td>
                <td className="px-4 py-3 text-[var(--text-muted)]">{o.status || "–"}</td>
                <td className="px-4 py-3 text-[var(--text-muted)]">{o.customerName || o.customerEmail || "–"}</td>
                <td className="px-4 py-3 text-[var(--text-subtle)]">{o.address || "–"}</td>
                <td className="px-4 py-3 text-[var(--text-subtle)]">{orderDate(o) ? orderDate(o)?.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" }) : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canManage && employeeLastOrders.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 border-[var(--border-soft)] bg-[var(--surface)]">
          <h2 className="mb-3 text-base font-medium text-[var(--text-main)]">Mitarbeiter mit letzter Bestellung</h2>
          <div className="space-y-2">
            {employeeLastOrders.map((item) => (
              <div key={item.member.id} className="flex flex-col justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-sm border-[var(--border-soft)] bg-[var(--surface)]/60 md:flex-row">
                <div>
                  <div className="font-medium text-[var(--text-main)]">{item.member.email}</div>
                  <div className="text-xs text-[var(--text-subtle)]">{item.ordersCount} Aufträge</div>
                </div>
                <div className="text-xs text-[var(--text-subtle)]">
                  Letzte Bestellung: {item.lastOrder ? `${String(item.lastOrder.orderNo ?? "–")} (${orderDate(item.lastOrder)?.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" }) || "–"})` : "keine"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Team & Rechte Tab ─────────────────────────────────── */
function TeamTab({
  members, myMembership, role, actionBusy, onRoleChange, onToggleActive,
}: {
  members: CompanyMember[];
  myMembership: CompanyMember | null;
  role: string;
  actionBusy: number | null;
  onRoleChange: (id: number, role: CompanyMemberRole) => void;
  onToggleActive: (id: number, active: boolean) => void;
}) {
  const [showMatrix, setShowMatrix] = useState(false);
  const sortedMembers = useMemo(() => {
    const order: Record<string, number> = { company_owner: 0, company_employee: 1 };
    return [...members].sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9) || a.email.localeCompare(b.email));
  }, [members]);

  const isMe = (m: CompanyMember) => myMembership && m.id === myMembership.id;
  const canChangeRole = (m: CompanyMember) => {
    if (isMe(m)) return false;
    if (m.role === "company_owner" && role !== "company_owner") return false;
    return true;
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Aktive Mitglieder" value={members.filter((m) => m.status === "active").length} />
        <StatCard label="Hauptkontakte" value={members.filter((m) => m.status === "active" && m.role === "company_owner").length} />
        <StatCard label="Mitarbeiter" value={members.filter((m) => m.status === "active" && m.role === "company_employee").length} />
      </div>

      <div className="space-y-2">
        {sortedMembers.map((m) => {
          const isBusy = actionBusy === m.id;
          const isActive = m.status === "active";
          const isDisabled = m.status === "disabled";

          return (
            <div key={m.id} className={`rounded-xl border p-4 transition-all ${isDisabled ? "border-slate-200 bg-slate-50 opacity-60 border-[var(--border-soft)] bg-[var(--surface)]/40" : "border-slate-200 bg-white border-[var(--border-soft)] bg-[var(--surface)]"}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${m.role === "company_owner" ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "bg-slate-100 text-slate-600 bg-[var(--surface-raised)] text-[var(--text-subtle)]"}`}>
                    {(m.email || "?")[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--text-main)]">{m.email}</span>
                      {isMe(m) && <span className="rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-bold text-[var(--accent)]">DU</span>}
                      {m.is_primary_contact && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Hauptkontakt</span>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {ROLE_PERMISSIONS[m.role as CompanyMemberRole]?.map((p) => (
                        <span key={p} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 bg-[var(--surface-raised)] text-[var(--text-subtle)]">{p}</span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {canChangeRole(m) ? (
                    <select
                      value={m.role}
                      onChange={(e) => onRoleChange(m.id, e.target.value as CompanyMemberRole)}
                      disabled={isBusy}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium disabled:opacity-50 border-[var(--border-soft)] bg-[var(--surface-raised)] text-[var(--text-main)]"
                    >
                      {role === "company_owner" && <option value="company_owner">Hauptkontakt</option>}
                      <option value="company_employee">Mitarbeiter</option>
                    </select>
                  ) : (
                    <span className={`rounded-lg px-2 py-1.5 text-xs font-medium ${m.role === "company_owner" ? "bg-[var(--accent)]/10 text-[var(--accent)]" : "bg-slate-100 text-slate-600 bg-[var(--surface-raised)] text-[var(--text-subtle)]"}`}>
                      {ROLE_LABELS[m.role as CompanyMemberRole] || m.role}
                    </span>
                  )}

                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isActive ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : isDisabled ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"}`}>
                    {isActive ? "Aktiv" : isDisabled ? "Deaktiviert" : m.status}
                  </span>

                  {!isMe(m) && canChangeRole(m) && (
                    <button
                      onClick={() => onToggleActive(m.id, isActive)}
                      disabled={isBusy}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${isActive ? "border-red-200 text-red-600 hover:bg-red-50" : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"}`}
                    >
                      {isActive ? "Deaktivieren" : "Aktivieren"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Permission Matrix */}
      <div className="rounded-xl border border-slate-200 bg-white border-[var(--border-soft)] bg-[var(--surface)]">
        <button
          onClick={() => setShowMatrix((v) => !v)}
          className="flex w-full items-center justify-between p-4 text-left"
        >
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-[var(--accent)]" />
            <span className="text-sm font-medium text-[var(--text-main)]">Rechte-Übersicht nach Rolle</span>
          </div>
          {showMatrix ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </button>

        {showMatrix && (
          <div className="border-t border-slate-200 p-4 border-[var(--border-soft)]">
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr>
                    <th className="py-2 pr-4 text-left font-medium text-[var(--text-subtle)]">Recht</th>
                    <th className="px-3 py-2 text-center font-medium text-[var(--accent)]">Hauptkontakt</th>
                    <th className="px-3 py-2 text-center font-medium text-[var(--text-subtle)]">Mitarbeiter</th>
                  </tr>
                </thead>
                <tbody>
                  {ALL_PERMISSIONS.map((p) => (
                    <tr key={p} className="border-t border-slate-100 border-[var(--border-soft)]">
                      <td className="py-2 pr-4 text-[var(--text-muted)]">{p}</td>
                      {(["company_owner", "company_employee"] as CompanyMemberRole[]).map((r) => (
                        <td key={r} className="px-3 py-2 text-center">
                          {ROLE_PERMISSIONS[r].includes(p) ? (
                            <Check className="mx-auto h-4 w-4 text-emerald-500" />
                          ) : (
                            <X className="mx-auto h-4 w-4 text-[var(--text-subtle)]" />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Einladungen Tab ───────────────────────────────────── */
function InvitationsTab({
  inviteEmail, setInviteEmail, inviteRole, setInviteRole, inviteBusy, onInvite, onDelete, onResend, pendingInvitations, role, suggestions,
}: {
  inviteEmail: string;
  setInviteEmail: (v: string) => void;
  inviteRole: CompanyMemberRole;
  setInviteRole: (v: CompanyMemberRole) => void;
  inviteBusy: boolean;
  onInvite: () => void;
  onDelete: (id: number) => void;
  onResend: (id: number) => void;
  pendingInvitations: CompanyInvitation[];
  role: string;
  suggestions: InviteSuggestion[];
}) {
  const [showSuggest, setShowSuggest] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = useMemo(() => {
    const q = inviteEmail.toLowerCase().trim();
    if (!suggestions.length) return [];
    return (q.length === 0
      ? suggestions.slice(0, 8)
      : suggestions.filter(
          (s) =>
            s.email.toLowerCase().includes(q) ||
            (s.name || "").toLowerCase().includes(q),
        ).slice(0, 8)
    );
  }, [inviteEmail, suggestions]);

  function pickSuggestion(s: InviteSuggestion) {
    setInviteEmail(s.email);
    setShowSuggest(false);
    setActiveIdx(-1);
    setTimeout(() => inputRef.current?.blur(), 0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showSuggest || filtered.length === 0) {
      if (e.key === "Enter") onInvite();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter") {
      if (activeIdx >= 0) {
        e.preventDefault();
        pickSuggestion(filtered[activeIdx]);
      } else {
        onInvite();
      }
    } else if (e.key === "Escape") {
      setShowSuggest(false);
    }
  }

  function initials(name: string, email: string) {
    const parts = (name || email).trim().split(/\s+/).filter(Boolean).slice(0, 2);
    if (parts.length) return parts.map((p) => p[0].toUpperCase()).join("");
    return email.slice(0, 2).toUpperCase() || "?";
  }

  function highlight(text: string, query: string) {
    if (!query) return <>{text}</>;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx < 0) return <>{text}</>;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-[var(--accent)]/25 rounded-sm">{text.slice(idx, idx + query.length)}</mark>
        {text.slice(idx + query.length)}
      </>
    );
  }

  const q = inviteEmail.trim().toLowerCase();

  return (
    <div className="space-y-4">
      {/* Invite Form */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 border-[var(--border-soft)] bg-[var(--surface)]">
        <div className="mb-3 flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-[var(--accent)]" />
          <h2 className="text-sm font-medium text-[var(--text-main)]">Mitarbeiter einladen</h2>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {/* E-Mail mit Autocomplete */}
          <div className="relative flex-1">
            <input
              ref={inputRef}
              value={inviteEmail}
              onChange={(e) => { setInviteEmail(e.target.value); setShowSuggest(true); setActiveIdx(-1); }}
              onFocus={() => { if (suggestions.length > 0) setShowSuggest(true); }}
              onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
              onKeyDown={handleKeyDown}
              placeholder="E-Mail-Adresse"
              disabled={inviteBusy}
              autoComplete="off"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] disabled:opacity-50 border-[var(--border-soft)] bg-[var(--surface-raised)] text-[var(--text-main)]"
            />
            {showSuggest && filtered.length > 0 && (
              <ul
                ref={listRef}
                className="absolute left-0 right-0 top-full z-50 mt-0.5 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg border-[var(--border-soft)] bg-[var(--surface)]"
                style={{ maxHeight: 220 }}
              >
                {filtered.map((s, i) => (
                  <li key={s.email}>
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); pickSuggestion(s); }}
                      className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                        i === activeIdx
                          ? "bg-[var(--accent)]/10 dark:bg-[var(--accent)]/15"
                          : "hover:bg-[var(--surface-raised)]"
                      }`}
                    >
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/15 text-xs font-bold text-[var(--accent)]">
                        {initials(s.name, s.email)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-[var(--text-main)]">
                          {highlight(s.name || s.email.split("@")[0], q)}
                        </div>
                        <div className="truncate text-xs text-[var(--text-subtle)]">
                          {highlight(s.email, q)}
                        </div>
                      </div>
                      <span className="flex-shrink-0 rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]">
                        Firma
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as CompanyMemberRole)}
            disabled={inviteBusy}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-50 border-[var(--border-soft)] bg-[var(--surface-raised)] text-[var(--text-main)]"
          >
            <option value="company_employee">Mitarbeiter</option>
            {role === "company_owner" && <option value="company_owner">Hauptkontakt</option>}
          </select>
          <button
            onClick={onInvite}
            disabled={inviteBusy || !inviteEmail.trim()}
            className="flex items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#b08f4a] disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {inviteBusy ? "Wird gesendet…" : "Einladen"}
          </button>
        </div>
      </div>

      {/* Pending Invitations */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 border-[var(--border-soft)] bg-[var(--surface)]">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-[var(--text-main)]">
          <Clock className="h-4 w-4 text-amber-500" />
          Offene Einladungen ({pendingInvitations.length})
        </h2>
        {pendingInvitations.length === 0 ? (
          <p className="text-sm text-[var(--text-subtle)]">Keine offenen Einladungen.</p>
        ) : (
          <div className="space-y-2">
            {pendingInvitations.map((inv) => {
              const expiresAt = new Date(inv.expires_at);
              const daysLeft = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
              return (
                <div key={inv.id} className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 border-[var(--border-soft)] bg-[var(--surface)]/60 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-[var(--text-subtle)]" />
                      <span className="text-sm font-medium text-[var(--text-main)]">{inv.email}</span>
                    </div>
                    <div className="ml-6 mt-0.5 text-xs text-[var(--text-subtle)]">
                      {ROLE_LABELS[inv.role] || inv.role} · läuft ab in {daysLeft} Tag{daysLeft !== 1 ? "en" : ""}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onResend(inv.id)}
                      className="flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 border-[var(--border-soft)] text-[var(--text-subtle)] hover:bg-[var(--surface-raised)]"
                    >
                      <RefreshCw className="h-3 w-3" /> Erneut senden
                    </button>
                    <button
                      onClick={() => onDelete(inv.id)}
                      className="flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                    >
                      <X className="h-3 w-3" /> Löschen
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Helpers ───────────────────────────────────────────── */
function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 border-[var(--border-soft)] bg-[var(--surface)]">
      <div className="text-xs uppercase text-[var(--text-subtle)]">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-[var(--text-main)]">{value}</div>
    </div>
  );
}



