import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  ChevronDown,
  Link2,
  Mail,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  UserPlus,
  X,
  ClipboardList,
} from "lucide-react";
import type { CompanyMemberRole } from "../api/company";
import {
  createAdminCompany,
  createAdminCompanyInvitation,
  deleteAdminCompany,
  deleteAdminCompanyInvitation,
  getAdminCompanies,
  patchAdminCompanyMemberRole,
  patchAdminCompanyMemberStatus,
  resendAdminCompanyInvitation,
  type AdminCompanyRow,
  type AdminInvitationRow,
} from "../api/adminCompanies";
import { usePermissions } from "../hooks/usePermissions";
import { useAuthStore } from "../store/authStore";
import { cn } from "../lib/utils";
import { CustomerAutocompleteInput } from "../components/ui/CustomerAutocompleteInput";
import type { Customer } from "../api/customers";
import { CustomerContactsSection } from "../components/customers/CustomerContactsSection";

function isSynthCustomerEmail(e?: string) {
  const lower = String(e || "").toLowerCase();
  return lower.endsWith("@company.local") || lower.endsWith("@invite.buchungstool.invalid");
}

type PageTab = "firms" | "invitations";
type StatusFilter = "alle" | "aktiv" | "ausstehend" | "inaktiv";

function roleLabel(r: CompanyMemberRole): string {
  if (r === "company_owner") return "Hauptkontakt";
  if (r === "company_admin") return "Firmen-Admin";
  return "Mitarbeiter";
}

function memberStatusLabel(s: string): string {
  if (s === "active") return "Aktiv";
  if (s === "disabled") return "Deaktiviert";
  return "Eingeladen";
}

function isInvitationExpired(inv: AdminInvitationRow): boolean {
  return new Date(inv.expires_at).getTime() < Date.now();
}

export function CompanyManagementPage() {
  const token = useAuthStore((s) => s.token);
  const authRole = useAuthStore((s) => s.role);
  const { can } = usePermissions();
  const canManage = can("users.manage");
  const isSuperAdmin = authRole === "super_admin";

  const [tab, setTab] = useState<PageTab>("firms");
  const [companies, setCompanies] = useState<AdminCompanyRow[]>([]);
  const [stats, setStats] = useState({
    aktiveFirmen: 0,
    hauptkontakte: 0,
    mitarbeiterZugaenge: 0,
    ausstehendeEinladungen: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("alle");
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [saving, setSaving] = useState<string | null>(null);

  const [showNewCompany, setShowNewCompany] = useState(false);
  const [newName, setNewName] = useState("");
  const [newStandort, setNewStandort] = useState("");
  const [newNotiz, setNewNotiz] = useState("");
  const [newInviteEmail, setNewInviteEmail] = useState("");
  const [newBillingCustomerId, setNewBillingCustomerId] = useState<number | null>(null);
  const [newSaving, setNewSaving] = useState(false);
  const [newErr, setNewErr] = useState("");

  const [inviteCompanyId, setInviteCompanyId] = useState<number | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<CompanyMemberRole>("company_employee");
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteErr, setInviteErr] = useState("");

  const load = useCallback(async () => {
    if (!token || !canManage) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await getAdminCompanies(token);
      setStats(res.stats);
      setCompanies(res.companies || []);
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
      if (filter !== "alle" && c.uiStatus !== filter) return false;
      if (!q) return true;
      const bid = c.billing_customer_id != null ? String(c.billing_customer_id) : "";
      const hay = `${c.name} ${c.slug} ${c.standort || ""} ${bid}`.toLowerCase();
      if (hay.includes(q)) return true;
      return (c.members || []).some((m) => m.email.toLowerCase().includes(q));
    });
  }, [companies, search, filter]);

  const allPendingInvitations = useMemo(() => {
    const rows: { company: AdminCompanyRow; inv: AdminInvitationRow }[] = [];
    for (const c of companies) {
      for (const inv of c.invitations || []) {
        if (!inv.accepted_at) rows.push({ company: c, inv });
      }
    }
    rows.sort((a, b) => new Date(b.inv.expires_at).getTime() - new Date(a.inv.expires_at).getTime());
    return rows;
  }, [companies]);

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function handleCreateCompany(e: React.FormEvent) {
    e.preventDefault();
    setNewErr("");
    if (!newName.trim()) {
      setNewErr("Firmenname erforderlich.");
      return;
    }
    if (!token) return;
    setNewSaving(true);
    try {
      await createAdminCompany(token, {
        name: newName.trim(),
        standort: newStandort.trim(),
        notiz: newNotiz.trim(),
        inviteEmail: newInviteEmail.trim(),
        inviteRole: "company_owner",
        billingCustomerId: newBillingCustomerId ?? undefined,
      });
      setShowNewCompany(false);
      setNewName("");
      setNewStandort("");
      setNewNotiz("");
      setNewInviteEmail("");
      setNewBillingCustomerId(null);
      await load();
    } catch (e) {
      setNewErr(e instanceof Error ? e.message : "Fehler");
    } finally {
      setNewSaving(false);
    }
  }

  async function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteErr("");
    if (!token || inviteCompanyId == null) return;
    const em = inviteEmail.trim().toLowerCase();
    if (!em.includes("@")) {
      setInviteErr("Gültige E-Mail erforderlich.");
      return;
    }
    setInviteSaving(true);
    try {
      await createAdminCompanyInvitation(token, inviteCompanyId, { email: em, role: inviteRole });
      setInviteCompanyId(null);
      setInviteEmail("");
      setInviteRole("company_employee");
      await load();
    } catch (e) {
      setInviteErr(e instanceof Error ? e.message : "Fehler");
    } finally {
      setInviteSaving(false);
    }
  }

  async function onMemberRole(companyId: number, memberId: number, role: CompanyMemberRole) {
    if (!token) return;
    setSaving(`role:${memberId}`);
    try {
      await patchAdminCompanyMemberRole(token, companyId, memberId, role);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setSaving(null);
    }
  }

  async function onMemberActive(companyId: number, memberId: number, active: boolean) {
    if (!token) return;
    setSaving(`st:${memberId}`);
    try {
      await patchAdminCompanyMemberStatus(token, companyId, memberId, active ? "active" : "disabled");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setSaving(null);
    }
  }

  async function onDeleteCompany(companyId: number) {
    if (!token || !isSuperAdmin) return;
    if (!window.confirm("Firma wirklich löschen? Dies kann nicht rückgängig gemacht werden.")) return;
    setSaving(`del:${companyId}`);
    try {
      await deleteAdminCompany(token, companyId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setSaving(null);
    }
  }

  async function onResendInvitation(invitationId: number) {
    if (!token) return;
    setSaving(`rs:${invitationId}`);
    try {
      await resendAdminCompanyInvitation(token, invitationId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setSaving(null);
    }
  }

  async function onDeleteInvitation(companyId: number, invitationId: number) {
    if (!token) return;
    if (!window.confirm("Einladung löschen?")) return;
    setSaving(`di:${invitationId}`);
    try {
      await deleteAdminCompanyInvitation(token, companyId, invitationId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setSaving(null);
    }
  }

  if (!canManage) {
    return (
      <div className="min-h-screen bg-[var(--bg)] p-8 text-[var(--text-muted)]">
        Keine Berechtigung für die Firmenverwaltung.
      </div>
    );
  }

  const TABS: { id: PageTab; label: string; icon: React.ReactNode }[] = [
    { id: "firms", label: "Firmen", icon: <Building2 className="h-4 w-4" /> },
    { id: "invitations", label: "Einladungen", icon: <Mail className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg)] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]/10">
            <Building2 className="h-5 w-5 text-[var(--accent)]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--text-main)]">Firmenverwaltung</h1>
            <p className="text-sm text-[var(--text-muted)]">
              Externe Firmen und Kundenzugänge verwalten – synchron mit Logto Organisationen
            </p>
          </div>
        </div>

        <div className="flex w-full gap-1 rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all",
                tab === t.id
                  ? "bg-[var(--accent)] text-black shadow-sm"
                  : "text-[var(--text-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-main)]",
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/30 px-4 py-3 text-sm text-red-400">
            <span className="flex-1">{error}</span>
            <button type="button" onClick={() => setError("")} className="opacity-70 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {tab === "firms" ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <StatChip label="Aktive Firmen" value={stats.aktiveFirmen} />
              <StatChip label="Hauptkontakte" value={stats.hauptkontakte} />
              <StatChip label="Mitarbeiter" value={stats.mitarbeiterZugaenge} />
              <StatChip label="Offene Einladungen" value={stats.ausstehendeEinladungen} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {(["alle", "aktiv", "ausstehend", "inaktiv"] as StatusFilter[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                      filter === f
                        ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--text-main)]"
                        : "border-[var(--border-soft)] text-[var(--text-muted)] hover:border-[var(--accent)]/30",
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void load()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-main)]"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                  Aktualisieren
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNewBillingCustomerId(null);
                    setShowNewCompany(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-1.5 text-sm font-semibold text-black hover:bg-[var(--accent)]/90"
                >
                  <Plus className="h-4 w-4" />
                  Neue Firma
                </button>
              </div>
            </div>
            <input
              type="search"
              placeholder="Firma, E-Mail oder Rechnungs-Kunden-ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ui-input w-full"
            />

            <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-[var(--text-muted)]">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Wird geladen…
                </div>
              ) : filteredCompanies.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-16 text-[var(--text-muted)]">
                  <Building2 className="h-10 w-10 opacity-20" />
                  <p className="text-sm">Keine Firmen gefunden</p>
                </div>
              ) : (
                <div className="divide-y divide-[var(--border-soft)]">
                  {filteredCompanies.map((c) => {
                    const open = expanded.has(c.id);
                    return (
                      <div key={c.id} className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggleExpand(c.id)}
                          className="flex w-full items-center gap-3 text-left"
                        >
                          <div
                            className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
                              "bg-[var(--accent)]/15 text-[var(--accent)]",
                            )}
                          >
                            {c.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="font-semibold text-[var(--text-main)] text-sm">{c.name}</div>
                              {c.billing_customer_id != null && Number(c.billing_customer_id) > 0 ? (
                                <Link
                                  to={`/customers?focusCustomerId=${c.billing_customer_id}`}
                                  onClick={(e) => e.stopPropagation()}
                                  title="Rechnungskunde im Stamm öffnen"
                                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--accent)]/35 bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--accent)] hover:bg-[var(--accent)]/18"
                                >
                                  <Link2 className="h-3 w-3" />
                                  Kunde #{c.billing_customer_id}
                                </Link>
                              ) : null}
                            </div>
                            <div className="text-xs text-[var(--text-muted)]">
                              {c.hauptkontakte_count ?? 0} Hauptkontakt(e) · {c.mitarbeiter_count ?? 0} Mitarbeiter
                            </div>
                          </div>
                          <span
                            className={cn(
                              "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize",
                              c.uiStatus === "aktiv" && "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
                              c.uiStatus === "ausstehend" && "border-amber-500/40 bg-amber-500/10 text-amber-300",
                              c.uiStatus === "inaktiv" && "border-[var(--border-soft)] text-[var(--text-subtle)]",
                            )}
                          >
                            {c.uiStatus}
                          </span>
                          <ChevronDown
                            className={cn("h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform", open && "rotate-180")}
                          />
                        </button>
                        {open && (
                          <div className="mt-4 space-y-4 border-t border-[var(--border-soft)] pt-4 pl-1">
                            {c.billing_customer_id != null && Number(c.billing_customer_id) > 0 ? (
                              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2 text-xs text-[var(--text-muted)]">
                                <Link2 className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                                <span>
                                  Rechnungsverknüpfung: Kunde{" "}
                                  <span className="font-mono tabular-nums text-[var(--text-main)]">#{c.billing_customer_id}</span>
                                </span>
                                <Link
                                  to={`/customers?focusCustomerId=${c.billing_customer_id}`}
                                  className="ml-auto shrink-0 rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2 py-1 font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20"
                                >
                                  Im Stamm öffnen
                                </Link>
                              </div>
                            ) : null}
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setInviteCompanyId(c.id);
                                  setInviteErr("");
                                }}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] px-3 py-1.5 text-xs font-medium text-[var(--text-main)] hover:border-[var(--accent)]/40"
                              >
                                <UserPlus className="h-3.5 w-3.5" />
                                Einladen
                              </button>
                              {isSuperAdmin && (
                                <button
                                  type="button"
                                  onClick={() => void onDeleteCompany(c.id)}
                                  disabled={saving === `del:${c.id}`}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Firma löschen
                                </button>
                              )}
                            </div>
                            {c.billing_customer_id != null && Number(c.billing_customer_id) > 0 && token && (
                              <div>
                                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                                  Kontaktpersonen
                                </div>
                                <CustomerContactsSection
                                  token={token}
                                  customerId={Number(c.billing_customer_id)}
                                  readonly={!canManage}
                                />
                              </div>
                            )}
                            <div>
                              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                                Portal-Zugänge (Mitglieder)
                              </div>
                              <div className="space-y-2">
                                {(c.members || []).map((m) => (
                                  <div
                                    key={m.id}
                                    className="flex flex-col gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] p-3 sm:flex-row sm:items-center"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="text-sm text-[var(--text-main)]">{m.email}</div>
                                      <div className="text-[11px] text-[var(--text-subtle)]">
                                        {memberStatusLabel(m.status)}
                                      </div>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                      {(["company_owner", "company_admin", "company_employee"] as CompanyMemberRole[]).map((r) => (
                                        <button
                                          key={r}
                                          type="button"
                                          disabled={saving === `role:${m.id}`}
                                          onClick={() => void onMemberRole(c.id, m.id, r)}
                                          className={cn(
                                            "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                                            m.role === r
                                              ? "border-[var(--accent)]/50 bg-[var(--accent)]/10 text-[var(--text-main)]"
                                              : "border-[var(--border-soft)] text-[var(--text-subtle)] hover:border-[var(--accent)]/30",
                                          )}
                                        >
                                          {roleLabel(r)}
                                        </button>
                                      ))}
                                    </div>
                                    <div className="flex gap-1">
                                      {m.status !== "active" ? (
                                        <button
                                          type="button"
                                          disabled={saving === `st:${m.id}`}
                                          onClick={() => void onMemberActive(c.id, m.id, true)}
                                          className="rounded-lg border border-emerald-500/30 px-2 py-1 text-[11px] text-emerald-400"
                                        >
                                          Aktivieren
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          disabled={saving === `st:${m.id}`}
                                          onClick={() => void onMemberActive(c.id, m.id, false)}
                                          className="rounded-lg border border-[var(--border-soft)] px-2 py-1 text-[11px] text-[var(--text-muted)]"
                                        >
                                          Deaktivieren
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                            {(c.invitations || []).filter((i) => !i.accepted_at).length > 0 && (
                              <div>
                                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                                  Offene Einladungen
                                </div>
                                <ul className="space-y-2">
                                  {(c.invitations || [])
                                    .filter((i) => !i.accepted_at)
                                    .map((inv) => (
                                      <li
                                        key={inv.id}
                                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-soft)] px-3 py-2 text-xs"
                                      >
                                        <span className="text-[var(--text-main)]">{inv.email}</span>
                                        <div className="flex gap-1">
                                          <button
                                            type="button"
                                            onClick={() => void onResendInvitation(inv.id)}
                                            disabled={saving === `rs:${inv.id}`}
                                            className="inline-flex items-center gap-1 rounded border border-[var(--border-soft)] px-2 py-0.5 text-[10px]"
                                          >
                                            <Send className="h-3 w-3" />
                                            Erneut
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => void onDeleteInvitation(c.id, inv.id)}
                                            disabled={saving === `di:${inv.id}`}
                                            className="inline-flex items-center gap-1 rounded border border-red-500/30 px-2 py-0.5 text-[10px] text-red-400"
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </button>
                                        </div>
                                      </li>
                                    ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-4 py-3 text-xs text-[var(--text-subtle)]">
              <ClipboardList className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
              <span>
                Neue und geänderte Firmen werden als <strong className="text-[var(--text-muted)]">Organisationen in Logto</strong>{" "}
                gepflegt. Aktive Firmenmitglieder mit Logto-Konto werden der Organisation zugeordnet. Ist eine Firma mit einem
                Kundenstamm-Eintrag verknüpft (Rechnungskontext), werden{" "}
                <strong className="text-[var(--text-muted)]">Rechnungsname und Standort</strong> beim Speichern des Kunden
                automatisch übernommen (Logto-Organisationsname folgt).
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-between gap-2">
              <p className="text-sm text-[var(--text-muted)]">Alle ausstehenden Einladungen über alle Firmen</p>
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-1.5 text-sm text-[var(--text-muted)]"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                Aktualisieren
              </button>
            </div>
            <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] overflow-hidden">
              {allPendingInvitations.length === 0 ? (
                <div className="py-16 text-center text-sm text-[var(--text-muted)]">Keine offenen Einladungen</div>
              ) : (
                <ul className="divide-y divide-[var(--border-soft)]">
                  {allPendingInvitations.map(({ company, inv }) => (
                    <li key={inv.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-sm font-medium text-[var(--text-main)]">{inv.email}</div>
                        <div className="text-xs text-[var(--text-muted)]">
                          {company.name} · {roleLabel(inv.role)} ·{" "}
                          {isInvitationExpired(inv) ? (
                            <span className="text-red-400">Abgelaufen</span>
                          ) : (
                            `Gültig bis ${new Date(inv.expires_at).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" })}`
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => void onResendInvitation(inv.id)}
                          disabled={saving === `rs:${inv.id}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-soft)] px-3 py-1 text-xs"
                        >
                          <Send className="h-3 w-3" />
                          Erneut senden
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDeleteInvitation(company.id, inv.id)}
                          disabled={saving === `di:${inv.id}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 px-3 py-1 text-xs text-red-400"
                        >
                          <Trash2 className="h-3 w-3" />
                          Löschen
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      {showNewCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <form
            onSubmit={(e) => void handleCreateCompany(e)}
            className="w-full max-w-md rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-[var(--text-main)]">Neue Firma</h2>
              <button
                type="button"
                onClick={() => {
                  setShowNewCompany(false);
                  setNewErr("");
                  setNewBillingCustomerId(null);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border-soft)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <label className="block text-xs text-[var(--text-muted)]">
                Name *
                <CustomerAutocompleteInput
                  token={token || undefined}
                  className="ui-input mt-1 w-full"
                  value={newName}
                  minChars={2}
                  maxSuggestions={10}
                  placeholder="Tippen für Kundenvorschläge (Name, Firma, E-Mail)…"
                  selectValue={(c) => String(c.company || "").trim() || c.name || ""}
                  onChange={(v) => {
                    setNewName(v);
                    setNewBillingCustomerId(null);
                  }}
                  onSelectCustomer={(c: Customer) => {
                    setNewBillingCustomerId(Number(c.id) > 0 ? c.id : null);
                    const loc = [c.zip, c.city].filter(Boolean).join(" ");
                    setNewStandort((prev) => (prev.trim() ? prev : loc || c.zipcity || ""));
                    setNewInviteEmail((prev) => {
                      if (prev.trim()) return prev;
                      const em = String(c.email || "").trim();
                      if (em && !isSynthCustomerEmail(em)) return em;
                      return prev;
                    });
                  }}
                  required
                />
                <span className="mt-1 block text-[11px] text-[var(--text-subtle)]">
                  Vorschläge aus dem Kundenstamm (Rechnungsdaten); bei Auswahl ist die Firma mit diesem Kunden verknüpft und
                  übernimmt künftig Rechnungsname und Standort von dort.
                </span>
              </label>
              <label className="block text-xs text-[var(--text-muted)]">
                Standort
                <input className="ui-input mt-1" value={newStandort} onChange={(e) => setNewStandort(e.target.value)} />
              </label>
              <label className="block text-xs text-[var(--text-muted)]">
                Notiz
                <input className="ui-input mt-1" value={newNotiz} onChange={(e) => setNewNotiz(e.target.value)} />
              </label>
              <label className="block text-xs text-[var(--text-muted)]">
                Hauptkontakt E-Mail (optional, Einladung)
                <input
                  type="email"
                  className="ui-input mt-1"
                  value={newInviteEmail}
                  onChange={(e) => setNewInviteEmail(e.target.value)}
                />
              </label>
            </div>
            {newErr && <p className="mt-2 text-sm text-red-400">{newErr}</p>}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowNewCompany(false);
                  setNewBillingCustomerId(null);
                }}
                className="flex-1 rounded-lg border border-[var(--border-soft)] py-2 text-sm"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={newSaving}
                className="flex-1 rounded-lg bg-[var(--accent)] py-2 text-sm font-semibold text-black disabled:opacity-50"
              >
                {newSaving ? "…" : "Anlegen"}
              </button>
            </div>
          </form>
        </div>
      )}

      {inviteCompanyId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <form
            onSubmit={(e) => void submitInvite(e)}
            className="w-full max-w-md rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-[var(--text-main)]">Einladung</h2>
              <button
                type="button"
                onClick={() => setInviteCompanyId(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border-soft)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <label className="block text-xs text-[var(--text-muted)]">
              E-Mail *
              <input
                type="email"
                className="ui-input mt-1"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
            </label>
            <label className="mt-3 block text-xs text-[var(--text-muted)]">
              Rolle
              <select
                className="ui-input mt-1"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as CompanyMemberRole)}
              >
                <option value="company_owner">Hauptkontakt</option>
                <option value="company_admin">Firmen-Admin</option>
                <option value="company_employee">Mitarbeiter</option>
              </select>
            </label>
            {inviteErr && <p className="mt-2 text-sm text-red-400">{inviteErr}</p>}
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setInviteCompanyId(null)} className="flex-1 rounded-lg border py-2 text-sm">
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={inviteSaving}
                className="flex-1 rounded-lg bg-[var(--accent)] py-2 text-sm font-semibold text-black disabled:opacity-50"
              >
                {inviteSaving ? "…" : "Senden"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-1.5">
      <span className="text-sm font-bold text-[var(--text-main)]">{value}</span>
      <span className="text-xs text-[var(--text-subtle)]">{label}</span>
    </div>
  );
}

