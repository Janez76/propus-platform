import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  ChevronDown,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Plus,
  RotateCcw,
  Search,
  Send,
  Shield,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import type { CompanyMemberRole } from "../api/company";
import {
  createAdminCompany,
  createAdminCompanyInvitation,
  deleteAdminCompany,
  getAdminCompanies,
  patchAdminCompanyMemberRole,
  patchAdminCompanyMemberStatus,
  type AdminCompanyMemberRow,
  type AdminCompanyRow,
  type AdminCompaniesStats,
  type AdminInvitationRow,
} from "../api/adminCompanies";
import {
  createInternalAdminUser,
  getInternalAdminUsers,
  patchInternalAdminUserRoles,
  patchInternalAdminUserSuspend,
  resetInternalAdminUserPassword,
  sendInternalAdminUserCredentials,
  type InternalAdminUser,
} from "../api/internalUsers";
import { usePermissions } from "../hooks/usePermissions";
import { useAuthStore } from "../store/authStore";
import { cn } from "../lib/utils";

const GOLD = "#c9a84c";
const BG = "#0c0d10";
const S1 = "#13141a";
const S2 = "#1a1c24";
const BORDER = "#252730";
const TEXT = "#e4e5ea";
const MUTED = "#6b6d7d";

function initialsFrom(email: string, name?: string | null) {
  const n = String(name || "").trim();
  if (n) {
    const p = n.split(/\s+/).filter(Boolean);
    if (p.length >= 2) return (p[0][0] + p[p.length - 1][0]).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  }
  const local = String(email || "").split("@")[0] || "?";
  return local.slice(0, 2).toUpperCase();
}

function roleLabel(r: CompanyMemberRole) {
  if (r === "company_owner") return "Hauptkontakt";
  if (r === "company_admin") return "Admin";
  return "Mitarbeiter";
}

function internalRoleLabel(role: string) {
  if (role === "super_admin") return "Super-Admin";
  if (role === "admin") return "Admin";
  return "Mitarbeiter";
}

function formatDate(value?: string | null) {
  if (!value) return "Noch kein Login";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Noch kein Login";
  return parsed.toLocaleDateString("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

type UsersView = "companies" | "internal";

type NewInternalUserForm = {
  name: string;
  email: string;
  username: string;
  password: string;
  roles: string[];
};

const EMPTY_INTERNAL_USER_FORM: NewInternalUserForm = {
  name: "",
  email: "",
  username: "",
  password: "",
  roles: ["photographer"],
};

type InviteEntryMode = "email" | "manual";

type CompanyInviteDraft = {
  mode: InviteEntryMode;
  email: string;
  givenName: string;
  familyName: string;
  loginName: string;
  role: CompanyMemberRole;
};

const EMPTY_COMPANY_INVITE_DRAFT: CompanyInviteDraft = {
  mode: "email",
  email: "",
  givenName: "",
  familyName: "",
  loginName: "",
  role: "company_employee",
};

function normalizeCompanyInviteDraft(raw: Partial<CompanyInviteDraft> | undefined): CompanyInviteDraft {
  if (!raw) return { ...EMPTY_COMPANY_INVITE_DRAFT };
  return {
    mode: raw.mode === "manual" ? "manual" : "email",
    email: raw.email ?? "",
    givenName: raw.givenName ?? "",
    familyName: raw.familyName ?? "",
    loginName: raw.loginName ?? "",
    role: (raw.role as CompanyMemberRole) ?? "company_employee",
  };
}

const MANUAL_INVITE_EMAIL_MARKER = "@invite.buchungstool.invalid";

function formatOpenInvitation(inv: AdminInvitationRow): string {
  const g = String(inv.given_name || "").trim();
  const f = String(inv.family_name || "").trim();
  const l = String(inv.login_name || "").trim();
  const em = String(inv.email || "");
  const synthetic = em.endsWith(`@${MANUAL_INVITE_EMAIL_MARKER}`);
  const name = [g, f].filter(Boolean).join(" ");
  const bits: string[] = [];
  if (name) bits.push(name);
  if (l) bits.push(`Login: ${l}`);
  if (!synthetic && em.includes("@")) bits.push(em);
  if (bits.length) return bits.join(" · ");
  return em;
}

const AVATAR_PALETTE = [
  "bg-violet-500/15 text-violet-300",
  "bg-teal-500/15 text-teal-300",
  "bg-amber-500/15 text-amber-200",
  "bg-sky-500/15 text-sky-300",
  "bg-rose-500/15 text-rose-300",
];

export function AdminUsersPage() {
  const token = useAuthStore((s) => s.token);
  const authRole = useAuthStore((s) => s.role);
  const { can } = usePermissions();
  const canManage = can("users.manage");
  const isSuperAdmin = authRole === "super_admin";

  const [view, setView] = useState<UsersView>("companies");
  const [stats, setStats] = useState<AdminCompaniesStats | null>(null);
  const [companies, setCompanies] = useState<AdminCompanyRow[]>([]);
  const [internalUsers, setInternalUsers] = useState<InternalAdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [internalSearch, setInternalSearch] = useState("");
  const [filter, setFilter] = useState<"alle" | "aktiv" | "ausstehend">("alle");
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [createInternalOpen, setCreateInternalOpen] = useState(false);
  const [resetUser, setResetUser] = useState<InternalAdminUser | null>(null);
  const [sendingCredentialsId, setSendingCredentialsId] = useState<string | null>(null);
  const [internalActionId, setInternalActionId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newStandort, setNewStandort] = useState("");
  const [newNotiz, setNewNotiz] = useState("");
  const [newInviteEmail, setNewInviteEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const [inviteDraft, setInviteDraft] = useState<Record<number, Partial<CompanyInviteDraft>>>({});

  const load = useCallback(async () => {
    if (!token || !canManage) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [res, internal] = await Promise.all([getAdminCompanies(token), getInternalAdminUsers(token)]);
      setStats(res.stats);
      setCompanies(res.companies || []);
      setInternalUsers(internal);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Laden fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }, [token, canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredCompanies = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companies.filter((c) => {
      const matchF = filter === "alle" || c.uiStatus === filter;
      if (!matchF) return false;
      if (!q) return true;
      if (c.name.toLowerCase().includes(q)) return true;
      for (const m of c.members || []) {
        if (m.email.toLowerCase().includes(q)) return true;
      }
      for (const i of c.invitations || []) {
        if (i.email.toLowerCase().includes(q)) return true;
        if (formatOpenInvitation(i).toLowerCase().includes(q)) return true;
      }
      return false;
    });
  }, [companies, search, filter]);

  const filteredInternalUsers = useMemo(() => {
    const q = internalSearch.trim().toLowerCase();
    if (!q) return internalUsers;
    return internalUsers.filter((user) => {
      return (
        user.name.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q) ||
        user.username.toLowerCase().includes(q) ||
        user.roles.some((role) => internalRoleLabel(role).toLowerCase().includes(q))
      );
    });
  }, [internalUsers, internalSearch]);

  const internalStats = useMemo(
    () => ({
      total: internalUsers.length,
      active: internalUsers.filter((user) => !user.isSuspended).length,
      admins: internalUsers.filter((user) => user.roles.some((role) => role === "admin" || role === "super_admin")).length,
      suspended: internalUsers.filter((user) => user.isSuspended).length,
    }),
    [internalUsers],
  );

  function toggleExpanded(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submitNewCompany() {
    if (!token || !newName.trim()) return;
    setSaving(true);
    setError("");
    try {
      await createAdminCompany(token, {
        name: newName.trim(),
        standort: newStandort.trim(),
        notiz: newNotiz.trim(),
        inviteEmail: newInviteEmail.trim() || undefined,
        inviteRole: "company_owner",
      });
      setModalOpen(false);
      setNewName("");
      setNewStandort("");
      setNewNotiz("");
      setNewInviteEmail("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Firma konnte nicht angelegt werden");
    } finally {
      setSaving(false);
    }
  }

  async function invite(companyId: number) {
    const d = normalizeCompanyInviteDraft(inviteDraft[companyId]);
    if (!token) return;
    if (d.mode === "email") {
      const em = d.email.trim().toLowerCase();
      if (!em.includes("@")) return;
    } else if (!d.givenName.trim() || !d.familyName.trim() || !d.loginName.trim()) {
      return;
    }
    setError("");
    try {
      await createAdminCompanyInvitation(
        token,
        companyId,
        d.mode === "email"
          ? { email: d.email.trim().toLowerCase(), role: d.role }
          : {
              role: d.role,
              givenName: d.givenName.trim(),
              familyName: d.familyName.trim(),
              loginName: d.loginName.trim(),
            },
      );
      setInviteDraft((prev) => ({ ...prev, [companyId]: { ...EMPTY_COMPANY_INVITE_DRAFT } }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Einladung fehlgeschlagen");
    }
  }

  async function setMemberRole(companyId: number, memberId: number, role: CompanyMemberRole) {
    if (!token) return;
    setError("");
    try {
      await patchAdminCompanyMemberRole(token, companyId, memberId, role);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rolle konnte nicht geändert werden");
    }
  }

  async function removeMember(companyId: number, memberId: number) {
    if (!token || !window.confirm("Zugang wirklich entfernen (deaktivieren)?")) return;
    setError("");
    try {
      await patchAdminCompanyMemberStatus(token, companyId, memberId, "disabled");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Konnte nicht deaktiviert werden");
    }
  }

  async function removeCompany(companyId: number) {
    if (!token || !window.confirm("Firma endgültig löschen? Alle Zuordnungen zu dieser Firma gehen verloren.")) return;
    setError("");
    try {
      await deleteAdminCompany(token, companyId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Firma konnte nicht gelöscht werden");
    }
  }

  async function sendCredentials(user: InternalAdminUser) {
    if (!token) return;
    setSendingCredentialsId(user.id);
    setError("");
    try {
      await sendInternalAdminUserCredentials(token, user.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Zugangsdaten-Mail konnte nicht gesendet werden");
    } finally {
      setSendingCredentialsId(null);
    }
  }

  async function changeInternalRole(user: InternalAdminUser, role: string) {
    if (!token) return;
    setInternalActionId(`${user.id}:role`);
    setError("");
    try {
      await patchInternalAdminUserRoles(token, user.id, [role]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rolle konnte nicht geändert werden");
    } finally {
      setInternalActionId(null);
    }
  }

  async function toggleInternalSuspend(user: InternalAdminUser) {
    if (!token) return;
    setInternalActionId(`${user.id}:suspend`);
    setError("");
    try {
      await patchInternalAdminUserSuspend(token, user.id, !user.isSuspended);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Status konnte nicht geändert werden");
    } finally {
      setInternalActionId(null);
    }
  }

  function partitionMembers(members: AdminCompanyMemberRow[]) {
    const haupt: AdminCompanyMemberRow[] = [];
    const staff: AdminCompanyMemberRow[] = [];
    for (const m of members) {
      if (m.role === "company_owner" || m.role === "company_admin") haupt.push(m);
      else staff.push(m);
    }
    return { haupt, staff };
  }

  if (!canManage) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          Keine Berechtigung für die Benutzerverwaltung (users.manage).
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-full font-sans text-[14px] antialiased"
      style={{
        backgroundColor: BG,
        color: TEXT,
        fontFamily: "'DM Sans', ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        <header className="mb-9 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] border"
              style={{
                backgroundColor: "rgba(201,168,76,.09)",
                borderColor: "rgba(201,168,76,.25)",
                color: GOLD,
              }}
            >
              <Users className="h-[18px] w-[18px]" strokeWidth={1.8} />
            </div>
            <div>
              <h1
                className="text-[26px] leading-tight tracking-wide"
                style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: TEXT }}
              >
                Benutzerverwaltung
              </h1>
              <p className="mt-1.5 max-w-xl font-light" style={{ color: MUTED }}>
                {view === "companies"
                  ? "Firmen, Hauptkontakte und Mitarbeiterzugänge zentral verwalten."
                  : "Interne Admin- und Mitarbeiterkonten inklusive Passwort-Reset verwalten."}
              </p>
            </div>
          </div>
          {view === "companies" ? (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex h-[38px] shrink-0 items-center gap-2 rounded-lg px-[18px] text-[13px] font-medium transition active:scale-[0.97]"
              style={{ backgroundColor: GOLD, color: "#0c0d10" }}
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              Neue Firma
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCreateInternalOpen(true)}
              className="inline-flex h-[38px] shrink-0 items-center gap-2 rounded-lg px-[18px] text-[13px] font-medium transition active:scale-[0.97]"
              style={{ backgroundColor: GOLD, color: "#0c0d10" }}
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              Neuer interner Benutzer
            </button>
          ) : null}
        </header>

        <div className="mb-6 inline-flex rounded-xl border p-1" style={{ borderColor: BORDER, backgroundColor: S1 }}>
          <button
            type="button"
            onClick={() => setView("companies")}
            className="rounded-lg px-4 py-2 text-sm font-medium transition"
            style={view === "companies" ? { backgroundColor: GOLD, color: "#0c0d10" } : { color: MUTED }}
          >
            Firmen & Zugänge
          </button>
          <button
            type="button"
            onClick={() => setView("internal")}
            className="rounded-lg px-4 py-2 text-sm font-medium transition"
            style={view === "internal" ? { backgroundColor: GOLD, color: "#0c0d10" } : { color: MUTED }}
          >
            Interne Benutzer
          </button>
        </div>

        {error ? (
          <div
            className="mb-4 rounded-lg border px-4 py-2 text-sm"
            style={{ borderColor: "rgba(192,57,43,.28)", backgroundColor: "rgba(192,57,43,.12)", color: "#e6a09a" }}
          >
            {error}
          </div>
        ) : null}

        {view === "companies" && stats ? (
          <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { v: stats.aktiveFirmen, l: "Aktive Firmen" },
              { v: stats.hauptkontakte, l: "Hauptkontakte / Admins" },
              { v: stats.mitarbeiterZugaenge, l: "Mitarbeiter-Zugänge" },
              { v: stats.ausstehendeEinladungen, l: "Offene Einladungen" },
            ].map((s) => (
              <div
                key={s.l}
                className="rounded-xl border px-5 py-[18px]"
                style={{ backgroundColor: S1, borderColor: BORDER }}
              >
                <div className="text-[28px] leading-none" style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}>
                  {s.v}
                </div>
                <div className="mt-1.5 text-[11px] tracking-wide" style={{ color: MUTED }}>
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {view === "companies" ? (
          <>
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <div className="relative min-w-[200px] max-w-[340px] flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2"
                  style={{ color: MUTED }}
                  strokeWidth={2}
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Firma oder Benutzer suchen…"
                  className="h-[38px] w-full rounded-lg border pl-9 pr-3 text-[13px] outline-none transition"
                  style={{
                    backgroundColor: S1,
                    borderColor: BORDER,
                    color: TEXT,
                  }}
                />
              </div>
              {(["alle", "aktiv", "ausstehend"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className="h-[38px] rounded-lg border px-3.5 text-xs transition"
                  style={{
                    borderColor: filter === f ? "rgba(201,168,76,.25)" : BORDER,
                    color: filter === f ? GOLD : MUTED,
                    backgroundColor: filter === f ? "rgba(201,168,76,.09)" : S1,
                  }}
                >
                  {f === "alle" ? "Alle" : f === "aktiv" ? "Aktiv" : "Ausstehend"}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="mb-6">
            <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[
                { v: internalStats.total, l: "Interne Benutzer" },
                { v: internalStats.active, l: "Aktiv" },
                { v: internalStats.admins, l: "Admins" },
                { v: internalStats.suspended, l: "Gesperrt" },
              ].map((s) => (
                <div
                  key={s.l}
                  className="rounded-xl border px-5 py-[18px]"
                  style={{ backgroundColor: S1, borderColor: BORDER }}
                >
                  <div className="text-[28px] leading-none" style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}>
                    {s.v}
                  </div>
                  <div className="mt-1.5 text-[11px] tracking-wide" style={{ color: MUTED }}>
                    {s.l}
                  </div>
                </div>
              ))}
            </div>
            <div className="relative min-w-[200px] max-w-[360px]">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2"
                style={{ color: MUTED }}
                strokeWidth={2}
              />
              <input
                value={internalSearch}
                onChange={(e) => setInternalSearch(e.target.value)}
                placeholder="Interne Benutzer suchen…"
                className="h-[38px] w-full rounded-lg border pl-9 pr-3 text-[13px] outline-none transition"
                style={{ backgroundColor: S1, borderColor: BORDER, color: TEXT }}
              />
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center" style={{ color: MUTED }}>
            Daten werden geladen…
          </div>
        ) : view === "companies" && companies.length === 0 ? (
          <div
            className="rounded-[14px] border px-6 py-14 text-center"
            style={{ backgroundColor: S1, borderColor: BORDER }}
          >
            <Building2 className="mx-auto mb-4 h-10 w-10" strokeWidth={1.2} style={{ color: MUTED }} />
            <p className="text-[15px] font-medium" style={{ color: TEXT }}>
              Noch keine Firmen
            </p>
            <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed" style={{ color: MUTED }}>
              Lege Firmen und Zugänge hier intern an. Über „Neue Firma“ erstellst du einen Workspace; Einladungen und
              Rollen verwaltest du in der jeweiligen Firmenkarte.
            </p>
          </div>
        ) : view === "companies" && filteredCompanies.length === 0 ? (
          <div className="py-14 text-center text-[13px]" style={{ color: MUTED }}>
            Keine Treffer für Suche oder Filter.
          </div>
        ) : view === "companies" ? (
          <div className="flex flex-col gap-4">
            {filteredCompanies.map((c, idx) => {
              const isOpen = expanded.has(c.id);
              const { haupt, staff } = partitionMembers(c.members || []);
              const initials = c.name
                .split(/\s+/)
                .map((w) => w[0])
                .join("")
                .slice(0, 2)
                .toUpperCase();
              const avClass = AVATAR_PALETTE[idx % AVATAR_PALETTE.length];
              const draft = normalizeCompanyInviteDraft(inviteDraft[c.id]);
              const canInvite =
                draft.mode === "email"
                  ? draft.email.trim().includes("@")
                  : Boolean(draft.givenName.trim() && draft.familyName.trim() && draft.loginName.trim());

              return (
                <article
                  key={c.id}
                  className="overflow-hidden rounded-[14px] border transition-colors"
                  style={{
                    borderColor: isOpen ? "rgba(201,168,76,.25)" : BORDER,
                    backgroundColor: S1,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleExpanded(c.id)}
                    className="flex w-full cursor-pointer items-center gap-3.5 px-5 py-[18px] text-left transition hover:bg-white/[0.02] sm:gap-3.5"
                  >
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-base",
                        avClass,
                      )}
                      style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}
                    >
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-medium">{c.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px]" style={{ color: MUTED }}>
                        <span className="inline-flex items-center gap-1">
                          <UserRound className="h-3 w-3" strokeWidth={2} />
                          {haupt.filter((m) => m.status === "active").length} Hauptkontakte/Admins ·{" "}
                          {staff.filter((m) => m.status === "active").length} Mitarbeiter
                        </span>
                        {c.standort ? (
                          <span className="inline-flex items-center gap-1">
                            <Building2 className="h-3 w-3" strokeWidth={2} />
                            {c.standort}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2.5">
                      <span
                        className="hidden rounded-full border px-2 py-0.5 text-[11px] font-medium sm:inline-flex"
                        style={
                          c.uiStatus === "aktiv"
                            ? {
                                backgroundColor: "rgba(39,174,96,.1)",
                                borderColor: "rgba(39,174,96,.2)",
                                color: "#27ae60",
                              }
                            : c.uiStatus === "ausstehend"
                              ? {
                                  backgroundColor: "rgba(230,126,34,.1)",
                                  borderColor: "rgba(230,126,34,.2)",
                                  color: "#e67e22",
                                }
                              : {
                                  backgroundColor: "rgba(107,109,125,.12)",
                                  borderColor: "rgba(107,109,125,.25)",
                                  color: MUTED,
                                }
                        }
                      >
                        {c.uiStatus === "aktiv" ? "Aktiv" : c.uiStatus === "ausstehend" ? "Ausstehend" : "Inaktiv"}
                      </span>
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-md border"
                        style={{ borderColor: BORDER, color: MUTED }}
                      >
                        <ChevronDown
                          className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")}
                          strokeWidth={2}
                        />
                      </span>
                    </div>
                  </button>

                  {isOpen ? (
                    <div className="border-t px-5 pb-5" style={{ borderColor: BORDER }}>
                      <MemberBlock
                        title="Hauptkontakte & Admins"
                        rows={haupt}
                        companyId={c.id}
                        onRoleChange={setMemberRole}
                        onRemove={removeMember}
                      />
                      <div className="my-4 h-px" style={{ backgroundColor: BORDER }} />
                      <MemberBlock
                        title="Mitarbeiter"
                        rows={staff}
                        companyId={c.id}
                        onRoleChange={setMemberRole}
                        onRemove={removeMember}
                      />

                      {(c.invitations || []).length > 0 ? (
                        <>
                          <div className="my-4 h-px" style={{ backgroundColor: BORDER }} />
                          <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
                            Offene Einladungen
                          </div>
                          <ul className="mt-2 space-y-1 text-sm" style={{ color: MUTED }}>
                            {c.invitations.map((inv) => (
                              <li key={inv.id}>
                                {formatOpenInvitation(inv)}{" "}
                                <span style={{ color: TEXT }}>({roleLabel(inv.role)})</span>
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : null}

                      <div className="mt-4 space-y-3 border-t pt-4" style={{ borderColor: BORDER }}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
                            Einladung
                          </span>
                          <div
                            className="inline-flex rounded-lg border p-0.5 text-[11px]"
                            style={{ borderColor: BORDER, backgroundColor: S2 }}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setInviteDraft((prev) => ({
                                  ...prev,
                                  [c.id]: { ...draft, mode: "email" },
                                }))
                              }
                              className={cn(
                                "rounded-md px-2.5 py-1 font-medium transition-colors",
                                draft.mode === "email" ? "" : "opacity-70",
                              )}
                              style={
                                draft.mode === "email"
                                  ? { backgroundColor: GOLD, color: "#0c0d10" }
                                  : { color: MUTED }
                              }
                            >
                              E-Mail
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setInviteDraft((prev) => ({
                                  ...prev,
                                  [c.id]: { ...draft, mode: "manual" },
                                }))
                              }
                              className={cn(
                                "rounded-md px-2.5 py-1 font-medium transition-colors",
                                draft.mode === "manual" ? "" : "opacity-70",
                              )}
                              style={
                                draft.mode === "manual"
                                  ? { backgroundColor: GOLD, color: "#0c0d10" }
                                  : { color: MUTED }
                              }
                            >
                              Manuell
                            </button>
                          </div>
                        </div>

                        {draft.mode === "email" ? (
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <Mail className="hidden h-4 w-4 shrink-0 sm:block" style={{ color: MUTED }} strokeWidth={2} />
                            <input
                              type="email"
                              placeholder="E-Mail einladen…"
                              value={draft.email}
                              onChange={(e) =>
                                setInviteDraft((prev) => ({
                                  ...prev,
                                  [c.id]: { ...draft, email: e.target.value },
                                }))
                              }
                              className="h-[34px] flex-1 rounded-lg border px-3 text-[13px] outline-none"
                              style={{ backgroundColor: S2, borderColor: BORDER, color: TEXT }}
                            />
                            <select
                              value={draft.role}
                              onChange={(e) =>
                                setInviteDraft((prev) => ({
                                  ...prev,
                                  [c.id]: { ...draft, role: e.target.value as CompanyMemberRole },
                                }))
                              }
                              className="h-[34px] rounded-md border px-2.5 text-xs outline-none"
                              style={{ backgroundColor: S2, borderColor: BORDER, color: TEXT }}
                            >
                              <option value="company_employee">Mitarbeiter</option>
                              <option value="company_admin">Admin</option>
                              <option value="company_owner">Hauptkontakt</option>
                            </select>
                            <button
                              type="button"
                              disabled={!canInvite}
                              onClick={() => void invite(c.id)}
                              className="h-[34px] shrink-0 rounded-lg px-4 text-xs font-medium disabled:opacity-40"
                              style={{ backgroundColor: GOLD, color: "#0c0d10" }}
                            >
                              Einladen
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2">
                            <div className="grid gap-2 sm:grid-cols-3">
                              <input
                                placeholder="Vorname"
                                value={draft.givenName}
                                onChange={(e) =>
                                  setInviteDraft((prev) => ({
                                    ...prev,
                                    [c.id]: { ...draft, givenName: e.target.value },
                                  }))
                                }
                                className="h-[34px] rounded-lg border px-3 text-[13px] outline-none"
                                style={{ backgroundColor: S2, borderColor: BORDER, color: TEXT }}
                              />
                              <input
                                placeholder="Nachname"
                                value={draft.familyName}
                                onChange={(e) =>
                                  setInviteDraft((prev) => ({
                                    ...prev,
                                    [c.id]: { ...draft, familyName: e.target.value },
                                  }))
                                }
                                className="h-[34px] rounded-lg border px-3 text-[13px] outline-none"
                                style={{ backgroundColor: S2, borderColor: BORDER, color: TEXT }}
                              />
                              <input
                                placeholder="Login-Name"
                                value={draft.loginName}
                                onChange={(e) =>
                                  setInviteDraft((prev) => ({
                                    ...prev,
                                    [c.id]: { ...draft, loginName: e.target.value },
                                  }))
                                }
                                className="h-[34px] rounded-lg border px-3 text-[13px] outline-none"
                                style={{ backgroundColor: S2, borderColor: BORDER, color: TEXT }}
                              />
                            </div>
                            <p className="text-[11px] leading-snug" style={{ color: MUTED }}>
                              Ohne E-Mail wird intern ein Platzhalter gespeichert; beim ersten Login mit Einladungslink
                              wird die echte Adresse aus dem Konto übernommen.
                            </p>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                              <select
                                value={draft.role}
                                onChange={(e) =>
                                  setInviteDraft((prev) => ({
                                    ...prev,
                                    [c.id]: { ...draft, role: e.target.value as CompanyMemberRole },
                                  }))
                                }
                                className="h-[34px] w-full rounded-md border px-2.5 text-xs outline-none sm:w-auto sm:min-w-[140px]"
                                style={{ backgroundColor: S2, borderColor: BORDER, color: TEXT }}
                              >
                                <option value="company_employee">Mitarbeiter</option>
                                <option value="company_admin">Admin</option>
                                <option value="company_owner">Hauptkontakt</option>
                              </select>
                              <button
                                type="button"
                                disabled={!canInvite}
                                onClick={() => void invite(c.id)}
                                className="h-[34px] shrink-0 rounded-lg px-4 text-xs font-medium disabled:opacity-40"
                                style={{ backgroundColor: GOLD, color: "#0c0d10" }}
                              >
                                Einladen
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {(c.uiStatus === "ausstehend" || c.uiStatus === "inaktiv") && isSuperAdmin ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void removeCompany(c.id)}
                            className="rounded-md border px-3 py-1.5 text-xs"
                            style={{
                              borderColor: "rgba(192,57,43,.28)",
                              backgroundColor: "rgba(192,57,43,.12)",
                              color: "#c0392b",
                            }}
                          >
                            Firma löschen
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : filteredInternalUsers.length === 0 ? (
          <div
            className="rounded-[14px] border px-6 py-14 text-center"
            style={{ backgroundColor: S1, borderColor: BORDER }}
          >
            <Shield className="mx-auto mb-4 h-10 w-10" strokeWidth={1.2} style={{ color: MUTED }} />
            <p className="text-[15px] font-medium" style={{ color: TEXT }}>
              Keine internen Benutzer gefunden
            </p>
            <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed" style={{ color: MUTED }}>
              Hier werden lokale Admin- und Mitarbeiterkonten aus `admin_users` angezeigt. Passwörter können direkt aus
              diesem Bereich neu gesetzt werden.
            </p>
          </div>
        ) : (
          <InternalUsersPanel
            users={filteredInternalUsers}
            sendingCredentialsId={sendingCredentialsId}
            internalActionId={internalActionId}
            onResetPassword={setResetUser}
            onSendCredentials={sendCredentials}
            onRoleChange={changeInternalRole}
            onToggleSuspend={toggleInternalSuspend}
          />
        )}
      </div>

      {modalOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div
            className="w-full max-w-[480px] rounded-2xl border p-8"
            style={{ backgroundColor: S1, borderColor: "#2e3040" }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl" style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}>
              Neue Firma anlegen
            </h2>
            <p className="mt-1.5 text-[13px]" style={{ color: MUTED }}>
              Optional kannst du direkt einen Hauptkontakt per E-Mail einladen.
            </p>
            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-[11.5px] font-medium" style={{ color: MUTED }}>
                  Firmenname
                </span>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-10 w-full rounded-lg border px-3.5 text-[13px] outline-none"
                  style={{ backgroundColor: S2, borderColor: BORDER, color: TEXT }}
                  placeholder="z. B. Müller Immobilien AG"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[11.5px] font-medium" style={{ color: MUTED }}>
                  Standort
                </span>
                <input
                  value={newStandort}
                  onChange={(e) => setNewStandort(e.target.value)}
                  className="h-10 w-full rounded-lg border px-3.5 text-[13px] outline-none"
                  style={{ backgroundColor: S2, borderColor: BORDER, color: TEXT }}
                  placeholder="z. B. Zürich"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[11.5px] font-medium" style={{ color: MUTED }}>
                  Hauptkontakt (E-Mail)
                </span>
                <input
                  type="email"
                  value={newInviteEmail}
                  onChange={(e) => setNewInviteEmail(e.target.value)}
                  className="h-10 w-full rounded-lg border px-3.5 text-[13px] outline-none"
                  style={{ backgroundColor: S2, borderColor: BORDER, color: TEXT }}
                  placeholder="kontakt@firma.ch"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[11.5px] font-medium" style={{ color: MUTED }}>
                  Notiz (intern)
                </span>
                <input
                  value={newNotiz}
                  onChange={(e) => setNewNotiz(e.target.value)}
                  className="h-10 w-full rounded-lg border px-3.5 text-[13px] outline-none"
                  style={{ backgroundColor: S2, borderColor: BORDER, color: TEXT }}
                  placeholder="optional"
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="h-9 rounded-lg border px-4 text-[13px]"
                style={{ borderColor: BORDER, color: MUTED }}
              >
                Abbrechen
              </button>
              <button
                type="button"
                disabled={saving || !newName.trim()}
                onClick={() => void submitNewCompany()}
                className="h-9 rounded-lg px-4 text-[13px] font-medium disabled:opacity-50"
                style={{ backgroundColor: GOLD, color: "#0c0d10" }}
              >
                {saving ? "…" : "Firma erstellen"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {resetUser && token ? (
        <InternalPasswordResetModal
          user={resetUser}
          token={token}
          onClose={() => setResetUser(null)}
          onSaved={async () => {
            setResetUser(null);
            await load();
          }}
        />
      ) : null}

      {createInternalOpen && token ? (
        <CreateInternalUserModal
          token={token}
          onClose={() => setCreateInternalOpen(false)}
          onCreated={async () => {
            setCreateInternalOpen(false);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

function CreateInternalUserModal({
  token,
  onClose,
  onCreated,
}: {
  token: string;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const [form, setForm] = useState<NewInternalUserForm>({ ...EMPTY_INTERNAL_USER_FORM });
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      setError("Name, E-Mail und Passwort sind erforderlich.");
      return;
    }
    if (form.password.length < 8) {
      setError("Passwort muss mindestens 8 Zeichen haben.");
      return;
    }
    setSaving(true);
    try {
      await createInternalAdminUser(token, {
        name: form.name.trim(),
        email: form.email.trim(),
        username: form.username.trim(),
        password: form.password,
        roles: form.roles,
      });
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Benutzer konnte nicht erstellt werden");
    } finally {
      setSaving(false);
    }
  }

  const selectedRole = form.roles[0] || "photographer";

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[480px] rounded-2xl border p-8"
        style={{ backgroundColor: S1, borderColor: "#2e3040" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl" style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: TEXT }}>
              Neuer interner Benutzer
            </h2>
            <p className="mt-1.5 text-[13px]" style={{ color: MUTED }}>
              Das Konto wird direkt in der lokalen Tabelle `admin_users` angelegt.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border"
            style={{ borderColor: BORDER, color: MUTED }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[11.5px] font-medium" style={{ color: MUTED }}>
              Name
            </span>
            <input
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              className="h-10 w-full rounded-lg border px-3.5 text-[13px] outline-none"
              style={{ backgroundColor: S2, borderColor: BORDER, color: TEXT }}
              placeholder="Vorname Nachname"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11.5px] font-medium" style={{ color: MUTED }}>
              E-Mail
            </span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              className="h-10 w-full rounded-lg border px-3.5 text-[13px] outline-none"
              style={{ backgroundColor: S2, borderColor: BORDER, color: TEXT }}
              placeholder="name@propus.ch"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11.5px] font-medium" style={{ color: MUTED }}>
              Benutzername
            </span>
            <input
              value={form.username}
              onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
              className="h-10 w-full rounded-lg border px-3.5 text-[13px] outline-none"
              style={{ backgroundColor: S2, borderColor: BORDER, color: TEXT }}
              placeholder="Optional, sonst aus E-Mail"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11.5px] font-medium" style={{ color: MUTED }}>
              Passwort
            </span>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                className="h-10 w-full rounded-lg border px-3.5 pr-10 text-[13px] outline-none"
                style={{ backgroundColor: S2, borderColor: BORDER, color: TEXT }}
                placeholder="Mindestens 8 Zeichen"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2"
                style={{ color: MUTED }}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>

          <div>
            <span className="mb-1.5 block text-[11.5px] font-medium" style={{ color: MUTED }}>
              Rolle
            </span>
            <div className="flex flex-wrap gap-2">
              {[
                { value: "photographer", label: "Mitarbeiter" },
                { value: "admin", label: "Admin" },
                { value: "super_admin", label: "Super-Admin" },
              ].map((role) => {
                const active = selectedRole === role.value;
                return (
                  <button
                    key={role.value}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, roles: [role.value] }))}
                    className="rounded-full border px-3 py-1 text-xs font-medium transition"
                    style={
                      active
                        ? { backgroundColor: GOLD, borderColor: "rgba(201,168,76,.25)", color: "#0c0d10" }
                        : { borderColor: BORDER, color: MUTED, backgroundColor: S2 }
                    }
                  >
                    {role.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {error ? (
          <div
            className="mt-4 rounded-lg border px-4 py-2 text-sm"
            style={{ borderColor: "rgba(192,57,43,.28)", backgroundColor: "rgba(192,57,43,.12)", color: "#e6a09a" }}
          >
            {error}
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border px-4 text-[13px]"
            style={{ borderColor: BORDER, color: MUTED }}
          >
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={saving}
            className="h-9 rounded-lg px-4 text-[13px] font-medium disabled:opacity-50"
            style={{ backgroundColor: GOLD, color: "#0c0d10" }}
          >
            {saving ? "Erstellen…" : "Benutzer erstellen"}
          </button>
        </div>
      </form>
    </div>
  );
}

function InternalUsersPanel({
  users,
  sendingCredentialsId,
  internalActionId,
  onResetPassword,
  onSendCredentials,
  onRoleChange,
  onToggleSuspend,
}: {
  users: InternalAdminUser[];
  sendingCredentialsId: string | null;
  internalActionId: string | null;
  onResetPassword: (user: InternalAdminUser) => void;
  onSendCredentials: (user: InternalAdminUser) => void | Promise<void>;
  onRoleChange: (user: InternalAdminUser, role: string) => void | Promise<void>;
  onToggleSuspend: (user: InternalAdminUser) => void | Promise<void>;
}) {
  return (
    <div className="rounded-[14px] border" style={{ backgroundColor: S1, borderColor: BORDER }}>
      <div className="divide-y" style={{ borderColor: BORDER }}>
        {users.map((user, idx) => {
          const primaryRole = user.roles[0] || "photographer";
          const roleBusy = internalActionId === `${user.id}:role`;
          const suspendBusy = internalActionId === `${user.id}:suspend`;
          const roleText = internalRoleLabel(primaryRole);
          const roleStyle =
            primaryRole === "super_admin"
              ? {
                  backgroundColor: "rgba(201,168,76,.10)",
                  borderColor: "rgba(201,168,76,.25)",
                  color: GOLD,
                }
              : primaryRole === "admin"
                ? {
                    backgroundColor: "rgba(52,152,219,.10)",
                    borderColor: "rgba(52,152,219,.2)",
                    color: "#73b9f1",
                  }
                : {
                    backgroundColor: "rgba(107,109,125,.12)",
                    borderColor: BORDER,
                    color: MUTED,
                  };

          return (
            <div
              key={user.id}
              className={cn("flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center", user.isSuspended && "opacity-60")}
            >
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-base",
                  AVATAR_PALETTE[idx % AVATAR_PALETTE.length],
                )}
                style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}
              >
                {initialsFrom(user.email, user.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="truncate text-[15px] font-medium" style={{ color: TEXT }}>
                    {user.name || user.email}
                  </div>
                  <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium" style={roleStyle}>
                    {roleText}
                  </span>
                  {user.isSuspended ? (
                    <span
                      className="rounded-full border px-2 py-0.5 text-[11px] font-medium"
                      style={{
                        backgroundColor: "rgba(107,109,125,.12)",
                        borderColor: "rgba(107,109,125,.25)",
                        color: MUTED,
                      }}
                    >
                      Gesperrt
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 text-[12px]" style={{ color: MUTED }}>
                  {user.email}
                  {user.username ? ` · ${user.username}` : ""}
                </div>
                <div className="mt-1 text-[11px]" style={{ color: MUTED }}>
                  Letzter Login: {formatDate(user.lastSignInAt)}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={primaryRole}
                  disabled={roleBusy}
                  onChange={(e) => void onRoleChange(user, e.target.value)}
                  className="h-[34px] rounded-lg border px-2.5 text-xs outline-none disabled:opacity-50"
                  style={{ backgroundColor: S2, borderColor: BORDER, color: TEXT }}
                >
                  <option value="photographer">Mitarbeiter</option>
                  <option value="admin">Admin</option>
                  <option value="super_admin">Super-Admin</option>
                </select>
                <button
                  type="button"
                  onClick={() => onResetPassword(user)}
                  className="inline-flex h-[34px] items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition"
                  style={{ borderColor: BORDER, color: TEXT, backgroundColor: S2 }}
                >
                  <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
                  Passwort setzen
                </button>
                <button
                  type="button"
                  onClick={() => void onSendCredentials(user)}
                  disabled={sendingCredentialsId === user.id}
                  className="inline-flex h-[34px] items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition disabled:opacity-40"
                  style={{ borderColor: BORDER, color: MUTED, backgroundColor: S2 }}
                >
                  <Send className="h-3.5 w-3.5" strokeWidth={2} />
                  Zugangsdaten
                </button>
                <button
                  type="button"
                  onClick={() => void onToggleSuspend(user)}
                  disabled={suspendBusy}
                  className="inline-flex h-[34px] items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition disabled:opacity-40"
                  style={
                    user.isSuspended
                      ? {
                          borderColor: "rgba(39,174,96,.25)",
                          color: "#85d6a0",
                          backgroundColor: "rgba(39,174,96,.08)",
                        }
                      : { borderColor: BORDER, color: MUTED, backgroundColor: S2 }
                  }
                >
                  {user.isSuspended ? <Eye className="h-3.5 w-3.5" strokeWidth={2} /> : <EyeOff className="h-3.5 w-3.5" strokeWidth={2} />}
                  {user.isSuspended ? "Aktivieren" : "Sperren"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-start gap-2 border-t px-5 py-4 text-xs" style={{ borderColor: BORDER, color: MUTED }}>
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: GOLD }} />
        <span>Passwortänderungen werden direkt in `admin_users` gespeichert und gelten beim nächsten Login.</span>
      </div>
    </div>
  );
}

function InternalPasswordResetModal({
  user,
  token,
  onClose,
  onSaved,
}: {
  user: InternalAdminUser;
  token: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [sendMail, setSendMail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Passwort muss mindestens 8 Zeichen haben.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await resetInternalAdminUserPassword(token, user.id, password, sendMail);
      setDone(true);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Passwort konnte nicht gespeichert werden");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-[440px] rounded-2xl border p-8"
        style={{ backgroundColor: S1, borderColor: "#2e3040" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl" style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: TEXT }}>
          Passwort setzen
        </h2>
        <p className="mt-1.5 text-[13px]" style={{ color: MUTED }}>
          Neues Passwort für {user.name || user.email}
        </p>

        {done ? (
          <div className="mt-6 space-y-4">
            <div
              className="rounded-lg border px-4 py-3 text-sm"
              style={{
                borderColor: "rgba(39,174,96,.25)",
                backgroundColor: "rgba(39,174,96,.10)",
                color: "#8fe2af",
              }}
            >
              Passwort wurde erfolgreich gespeichert.
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="h-9 rounded-lg px-4 text-[13px] font-medium"
                style={{ backgroundColor: GOLD, color: "#0c0d10" }}
              >
                Schließen
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-[11.5px] font-medium" style={{ color: MUTED }}>
                Neues Passwort
              </span>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-10 w-full rounded-lg border px-3.5 pr-10 text-[13px] outline-none"
                  style={{ backgroundColor: S2, borderColor: BORDER, color: TEXT }}
                  placeholder="Mindestens 8 Zeichen"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2"
                  style={{ color: MUTED }}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>
            <label className="flex items-center gap-2 text-[12px]" style={{ color: MUTED }}>
              <input type="checkbox" checked={sendMail} onChange={(e) => setSendMail(e.target.checked)} />
              Zugangsdaten zusätzlich per E-Mail senden
            </label>
            {error ? (
              <div
                className="rounded-lg border px-4 py-2 text-sm"
                style={{ borderColor: "rgba(192,57,43,.28)", backgroundColor: "rgba(192,57,43,.12)", color: "#e6a09a" }}
              >
                {error}
              </div>
            ) : null}
            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="h-9 rounded-lg border px-4 text-[13px]"
                style={{ borderColor: BORDER, color: MUTED }}
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={saving || password.length < 8}
                className="h-9 rounded-lg px-4 text-[13px] font-medium disabled:opacity-50"
                style={{ backgroundColor: GOLD, color: "#0c0d10" }}
              >
                {saving ? "Speichern…" : "Passwort speichern"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function MemberBlock({
  title,
  rows,
  companyId,
  onRoleChange,
  onRemove,
}: {
  title: string;
  rows: AdminCompanyMemberRow[];
  companyId: number;
  onRoleChange: (companyId: number, memberId: number, role: CompanyMemberRole) => void;
  onRemove: (companyId: number, memberId: number) => void;
}) {
  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
          {title}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="py-3 text-sm" style={{ color: MUTED }}>
                  Keine Einträge.
                </td>
              </tr>
            ) : (
              rows.map((m, i) => (
                <tr key={m.id} className="border-b last:border-0" style={{ borderColor: "#252730" }}>
                  <td className="w-9 py-2.5 pr-2 align-middle">
                    <div
                      className={cn(
                        "flex h-[30px] w-[30px] items-center justify-center rounded-md text-[11px] font-semibold",
                        AVATAR_PALETTE[i % AVATAR_PALETTE.length],
                      )}
                    >
                      {initialsFrom(m.email)}
                    </div>
                  </td>
                  <td className="py-2.5 align-middle">
                    <div className="text-[13px] font-medium" style={{ color: m.status === "invited" ? MUTED : TEXT }}>
                      {m.email}
                    </div>
                  </td>
                  <td className="py-2.5 align-middle">
                    <select
                      value={m.role}
                      disabled={m.status !== "active"}
                      onChange={(e) => onRoleChange(companyId, m.id, e.target.value as CompanyMemberRole)}
                      className="rounded-md border px-2 py-1 text-xs outline-none disabled:opacity-50"
                      style={{ backgroundColor: "#1a1c24", borderColor: "#252730", color: TEXT }}
                    >
                      <option value="company_owner">Hauptkontakt</option>
                      <option value="company_admin">Admin</option>
                      <option value="company_employee">Mitarbeiter</option>
                    </select>
                  </td>
                  <td className="py-2.5 align-middle">
                    <span
                      className="rounded-full border px-2 py-0.5 text-[11px]"
                      style={
                        m.status === "active"
                          ? {
                              backgroundColor: "rgba(39,174,96,.1)",
                              borderColor: "rgba(39,174,96,.2)",
                              color: "#27ae60",
                            }
                          : m.status === "invited"
                            ? {
                                backgroundColor: "rgba(230,126,34,.1)",
                                borderColor: "rgba(230,126,34,.2)",
                                color: "#e67e22",
                              }
                            : {
                                backgroundColor: "rgba(100,100,110,.12)",
                                borderColor: BORDER,
                                color: MUTED,
                              }
                      }
                    >
                      {m.status === "active" ? "Aktiv" : m.status === "invited" ? "Ausstehend" : "Deaktiviert"}
                    </span>
                  </td>
                  <td className="py-2.5 align-middle">
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => onRemove(companyId, m.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-md border transition hover:border-[rgba(192,57,43,.28)] hover:bg-[rgba(192,57,43,.12)] hover:text-red-400"
                        style={{ borderColor: BORDER, color: MUTED }}
                        title="Entfernen"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}


