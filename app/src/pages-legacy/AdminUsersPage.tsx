import { useCallback, useEffect, useState } from "react";
import {
  UserRound, Plus, RefreshCw, X, Crown, Camera, Eye, EyeOff,
  Lock, Shield, Check, Users, KeyRound,
} from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { apiRequest } from "../api/client";

// ─── Types ───────────────────────────────────────────────────────────────────

type LogtoUser = {
  id: string;
  name: string;
  email: string;
  username: string;
  roles: string[];
  createdAt: string;
  lastSignInAt: string | null;
  isSuspended: boolean;
};

type Tab = "users" | "roles";

// ─── Constants ───────────────────────────────────────────────────────────────

const ALL_ROLES = ["super_admin", "admin", "photographer"] as const;
type RoleKey = (typeof ALL_ROLES)[number];

function detectLogtoAdminUrl() {
  const configured = String(process.env.NEXT_PUBLIC_LOGTO_ADMIN_URL || "").trim();
  if (configured) return configured;
  if (typeof window !== "undefined") {
    const { hostname } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return "http://localhost:3002";
    }
  }
  return "https://auth-admin.propus.ch/console";
}

const LOGTO_ADMIN_URL = detectLogtoAdminUrl();

const ROLE_CFG: Record<RoleKey, {
  label: string;
  description: string;
  icon: React.ReactNode;
  pill: string;
  card: string;
  permissions: string[];
}> = {
  super_admin: {
    label: "Super-Admin",
    description: "Voller Systemzugriff inkl. Benutzerverwaltung und Einstellungen",
    icon: <Crown className="h-4 w-4" />,
    pill: "cust-badge cust-badge--gold",
    card: "border-[color-mix(in_srgb,var(--propus-gold)_20%,transparent)] bg-[color-mix(in_srgb,var(--propus-gold)_5%,transparent)]",
    permissions: ["dashboard.view", "users.manage", "roles.manage", "settings.manage", "orders.*", "customers.*", "photographers.*", "products.*", "backups.manage"],
  },
  admin: {
    label: "Admin",
    description: "Zugriff auf Aufträge, Kunden, Mitarbeiter, Produkte und Einstellungen",
    icon: <Shield className="h-4 w-4" />,
    pill: "cust-badge cust-badge--info",
    card: "border-[color-mix(in_srgb,#3498db_20%,transparent)] bg-[color-mix(in_srgb,#3498db_5%,transparent)]",
    permissions: ["orders.read", "orders.create", "orders.update", "orders.delete", "customers.manage", "photographers.manage", "products.manage", "settings.manage"],
  },
  photographer: {
    label: "Mitarbeiter",
    description: "Zugriff auf eigene Aufträge und Kalender",
    icon: <Camera className="h-4 w-4" />,
    pill: "cust-badge cust-badge--neutral",
    card: "border-[var(--border-soft)] bg-[var(--surface-raised)]",
    permissions: ["dashboard.view", "orders.read", "orders.update", "calendar.view", "photographers.read"],
  },
};

const AVATAR_PALETTE = [
  { bg: "color-mix(in srgb, #9b59b6 18%, transparent)", color: "#9b59b6" },
  { bg: "color-mix(in srgb, #1abc9c 18%, transparent)", color: "#1abc9c" },
  { bg: "color-mix(in srgb, var(--propus-gold) 18%, transparent)", color: "var(--propus-gold)" },
  { bg: "color-mix(in srgb, #3498db 18%, transparent)", color: "#3498db" },
  { bg: "color-mix(in srgb, #e74c3c 18%, transparent)", color: "#e74c3c" },
  { bg: "color-mix(in srgb, #2ecc71 18%, transparent)", color: "#2ecc71" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function initials(name: string, email: string) {
  const n = name.trim();
  if (n) {
    const p = n.split(/\s+/);
    if (p.length >= 2) return (p[0][0] + p[p.length - 1][0]).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

function avatarColor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

// ─── API ─────────────────────────────────────────────────────────────────────

async function fetchInternalUsers(token: string): Promise<LogtoUser[]> {
  const res = await apiRequest<{ users: LogtoUser[] }>("/api/admin/internal-users", "GET", token);
  return res.users || [];
}
async function patchUserRoles(token: string, id: string, roles: string[]) {
  return apiRequest("/api/admin/internal-users/" + id + "/roles", "PATCH", token, { roles });
}
async function patchUserSuspend(token: string, id: string, isSuspended: boolean) {
  return apiRequest("/api/admin/internal-users/" + id + "/suspend", "PATCH", token, { isSuspended });
}
async function createInternalUser(token: string, data: {
  name: string; email: string; username: string; password: string; roles: string[];
}) {
  return apiRequest<{ ok: boolean; user: LogtoUser }>("/api/admin/internal-users", "POST", token, data);
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function RolePill({ role, active, busy, onClick }: {
  role: RoleKey; active: boolean; busy: boolean; onClick: () => void;
}) {
  const cfg = ROLE_CFG[role];
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-all select-none",
        active ? cfg.pill : "border-[var(--border-soft)] text-[var(--text-subtle)] hover:border-[var(--accent)]/30 hover:text-[var(--text-muted)]",
        busy ? "opacity-40 cursor-wait" : "cursor-pointer",
      ].join(" ")}
    >
      {cfg.icon}
      {cfg.label}
    </button>
  );
}

function UserAvatar({ user, size = "md" }: { user: LogtoUser; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-[11px]";
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-bold ${sz}`}
      style={{ background: avatarColor(user.id).bg, color: avatarColor(user.id).color }}
    >
      {initials(user.name, user.email)}
    </div>
  );
}

// ─── Tab: Benutzerverwaltung ──────────────────────────────────────────────────

type NewUserForm = { name: string; email: string; username: string; password: string; roles: string[] };
const EMPTY_FORM: NewUserForm = { name: "", email: "", username: "", password: "", roles: ["photographer"] };

function UsersTab({ users, loading, saving, onToggleRole, onToggleSuspend, onReload, token, setUsers }: {
  users: LogtoUser[];
  loading: boolean;
  saving: string | null;
  onToggleRole: (user: LogtoUser, role: RoleKey) => void;
  onToggleSuspend: (user: LogtoUser) => void;
  onReload: () => void;
  token: string;
  setUsers: React.Dispatch<React.SetStateAction<LogtoUser[]>>;
}) {
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<NewUserForm>({ ...EMPTY_FORM });
  const [showPw, setShowPw] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [formSaving, setFormSaving] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormErr("");
    if (!form.email || !form.password || !form.name) { setFormErr("Name, E-Mail und Passwort sind erforderlich."); return; }
    setFormSaving(true);
    try {
      const { user } = await createInternalUser(token, form);
      setUsers((prev) => [...prev, user]);
      setShowNew(false);
      setForm({ ...EMPTY_FORM });
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "Fehler");
    } finally {
      setFormSaving(false);
    }
  }

  const adminCount = users.filter((u) => u.roles.some((r) => ["admin", "super_admin"].includes(r))).length;
  const staffCount = users.filter((u) => u.roles.includes("photographer")).length;
  const activeCount = users.filter((u) => !u.isSuspended).length;

  return (
    <>
      {/* Actions row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <StatChip label="Gesamt" value={users.length} />
          <StatChip label="Aktiv" value={activeCount} color="#2ecc71" />
          <StatChip label="Admins" value={adminCount} color="var(--propus-gold)" />
          <StatChip label="Mitarbeiter" value={staffCount} color="#3498db" />
        </div>
        <div className="flex gap-2">
          <button onClick={onReload}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">
            <RefreshCw className="h-3.5 w-3.5" /> Aktualisieren
          </button>
          <button onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-1.5 text-sm font-semibold text-black hover:bg-[var(--accent)]/90 transition-colors">
            <Plus className="h-4 w-4" /> Neuer Benutzer
          </button>
        </div>
      </div>

      {/* User list */}
      <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-[var(--text-muted)]">
            <RefreshCw className="h-4 w-4 animate-spin" /> Wird geladen…
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-[var(--text-muted)]">
            <UserRound className="h-10 w-10 opacity-20" />
            <p className="text-sm">Keine internen Benutzer gefunden</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-soft)]">
            {users.map((user) => (
              <div key={user.id}
                className={`flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center transition-opacity ${user.isSuspended ? "opacity-40" : ""}`}>
                <UserAvatar user={user} />
                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[var(--text-main)] text-sm">{user.name || user.email}</span>
                    {user.isSuspended && (
                      <span className="cust-status-badge cust-status-cancelled" style={{ borderRadius: "999px", fontSize: "10px" }}>Gesperrt</span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5">{user.email}</div>
                  {user.lastSignInAt && (
                    <div className="text-[11px] text-[var(--text-subtle)] mt-0.5">
                      Letzter Login: {new Date(user.lastSignInAt).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" })}
                    </div>
                  )}
                </div>
                {/* Role pills */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {ALL_ROLES.map((role) => (
                    <RolePill key={role} role={role}
                      active={user.roles.includes(role)}
                      busy={saving === user.id + ":" + role}
                      onClick={() => onToggleRole(user, role)} />
                  ))}
                </div>
                {/* Suspend */}
                <button onClick={() => onToggleSuspend(user)} disabled={saving === user.id + ":suspend"}
                  className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${saving === user.id + ":suspend" ? "opacity-40 cursor-wait" : ""}`}
                  style={user.isSuspended
                    ? { borderColor: "color-mix(in srgb, #2ecc71 30%, transparent)", color: "#1d9e56" }
                    : { borderColor: "var(--border-soft)", color: "var(--text-subtle)" }}>
                  {user.isSuspended ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  {user.isSuspended ? "Aktivieren" : "Sperren"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hint */}
      <div className="flex items-start gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-4 py-3 text-xs text-[var(--text-subtle)]">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
        <span>Rollenänderungen werden sofort in <strong className="text-[var(--text-muted)]">Logto</strong> gespeichert und gelten beim nächsten Login.</span>
      </div>

      {/* New user modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <form onSubmit={handleCreate}
            className="w-full max-w-md rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[var(--text-main)]">Neuer Benutzer</h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">Wird direkt in Logto angelegt</p>
              </div>
              <button type="button" onClick={() => { setShowNew(false); setForm({ ...EMPTY_FORM }); setFormErr(""); }}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-soft)] text-[var(--text-subtle)] hover:bg-[var(--surface-raised)]">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="space-y-3">
              <Field label="Name *">
                <input className="ui-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Vorname Nachname" />
              </Field>
              <Field label="E-Mail *">
                <input type="email" className="ui-input" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="name@propus.ch" />
              </Field>
              <Field label="Benutzername">
                <input className="ui-input" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} placeholder="Automatisch aus E-Mail" />
              </Field>
              <Field label="Passwort *">
                <div className="relative">
                  <input type={showPw ? "text" : "password"} className="ui-input pr-9" value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Mindestens 8 Zeichen" />
                  <button type="button" onClick={() => setShowPw((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-subtle)] hover:text-[var(--text-muted)]">
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>
              <Field label="Rollen">
                <div className="flex flex-wrap gap-2">
                  {ALL_ROLES.map((role) => {
                    const cfg = ROLE_CFG[role];
                    const has = form.roles.includes(role);
                    return (
                      <button key={role} type="button"
                        onClick={() => setForm((f) => ({ ...f, roles: has ? f.roles.filter((r) => r !== role) : [...f.roles, role] }))}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${has ? cfg.pill : "border-[var(--border-soft)] text-[var(--text-subtle)] hover:border-[var(--accent)]/30"}`}>
                        {cfg.icon}{cfg.label}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </div>
            {formErr && <p className="mt-3 text-sm" style={{ color: "#e74c3c" }}>{formErr}</p>}
            <div className="mt-5 flex gap-2.5">
              <button type="button" onClick={() => { setShowNew(false); setForm({ ...EMPTY_FORM }); setFormErr(""); }}
                className="flex-1 rounded-lg border border-[var(--border-soft)] py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-raised)] transition-colors">
                Abbrechen
              </button>
              <button type="submit" disabled={formSaving}
                className="flex-1 rounded-lg bg-[var(--accent)] py-2 text-sm font-semibold text-black hover:bg-[var(--accent)]/90 disabled:opacity-50 transition-colors">
                {formSaving ? "Erstellen…" : "Erstellen"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

// ─── Tab: Rechte & Rollen ────────────────────────────────────────────────────

function RolesTab({ users, loading, saving, onToggleRole, onReload }: {
  users: LogtoUser[];
  loading: boolean;
  saving: string | null;
  onToggleRole: (user: LogtoUser, role: RoleKey) => void;
  onReload: () => void;
}) {
  return (
    <>
      <div className="flex justify-end">
        <button onClick={onReload}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">
          <RefreshCw className="h-3.5 w-3.5" /> Aktualisieren
        </button>
      </div>

      {/* Role cards */}
      <div className="space-y-4">
        {ALL_ROLES.map((roleKey) => {
          const cfg = ROLE_CFG[roleKey];
          const count = users.filter((u) => u.roles.includes(roleKey)).length;
          return (
            <div key={roleKey} className={`rounded-xl border p-5 ${cfg.card}`}>
              {/* Role header */}
              <div className="mb-4 flex items-start gap-3">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${cfg.pill}`}>
                  {cfg.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-[var(--text-main)]">{cfg.label}</h3>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cfg.pill}`}>
                      {count} {count === 1 ? "Benutzer" : "Benutzer"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">{cfg.description}</p>
                </div>
              </div>

              {/* Permissions */}
              <div className="mb-4 flex flex-wrap gap-1.5">
                {cfg.permissions.map((perm) => (
                  <span key={perm} className="inline-flex items-center gap-1 rounded-md border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-0.5 text-[10px] text-[var(--text-subtle)]">
                    <Check className="h-2.5 w-2.5 text-emerald-400" />{perm}
                  </span>
                ))}
              </div>

              {/* Separator */}
              <div className="border-t border-[var(--border-soft)] pt-4">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-subtle)]">
                  Zugewiesene Benutzer
                </div>
                {loading ? (
                  <p className="text-sm text-[var(--text-subtle)]">Wird geladen…</p>
                ) : users.length === 0 ? (
                  <p className="text-sm text-[var(--text-subtle)]">Keine Benutzer</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {users.map((user) => {
                      const has = user.roles.includes(roleKey);
                      const busy = saving === user.id + ":" + roleKey;
                      return (
                        <button key={user.id}
                          onClick={() => onToggleRole(user, roleKey)}
                          disabled={busy}
                          title={has ? `${cfg.label} entfernen` : `${cfg.label} zuweisen`}
                          className={[
                            "inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs transition-all",
                            has ? `${cfg.card} border-current text-[var(--text-main)]` : "border-[var(--border-soft)] bg-[var(--surface)] text-[var(--text-subtle)] hover:border-[var(--accent)]/30",
                            busy ? "opacity-40 cursor-wait" : "cursor-pointer",
                          ].join(" ")}>
                          <div
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
                            style={{ background: avatarColor(user.id).bg, color: avatarColor(user.id).color }}
                          >
                            {initials(user.name, user.email)}
                          </div>
                          <span>{user.name || user.email}</span>
                          {has && <Check className="h-3 w-3 text-emerald-400" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Info + Logto link */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-1 items-start gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-4 py-3 text-xs text-[var(--text-subtle)]">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
          <span>Rollen werden direkt in <strong className="text-[var(--text-muted)]">Logto</strong> gespeichert. Neue Rollen können nur in der Logto Admin Console erstellt werden.</span>
        </div>
        <a href={LOGTO_ADMIN_URL} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-4 py-3 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors whitespace-nowrap">
          Logto Admin öffnen →
        </a>
      </div>
    </>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function StatChip({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-1.5">
      <span className="text-sm font-bold" style={{ color: color ?? "var(--text-main)" }}>{value}</span>
      <span className="text-xs text-[var(--text-subtle)]">{label}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">{label}</label>
      {children}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function AdminUsersPage() {
  const token = useAuthStore((s) => s.token);
  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<LogtoUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try { setUsers(await fetchInternalUsers(token)); }
    catch (e) { setError(e instanceof Error ? e.message : "Fehler beim Laden"); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  async function toggleRole(user: LogtoUser, role: RoleKey) {
    if (!token) return;
    const has = user.roles.includes(role);
    let next: string[];
    if (has) {
      next = user.roles.filter((r) => r !== role);
    } else {
      // Super-Admin und Admin schließen sich gegenseitig aus
      if (role === "super_admin") {
        next = [...user.roles.filter((r) => r !== "admin"), "super_admin"];
      } else if (role === "admin") {
        next = [...user.roles.filter((r) => r !== "super_admin"), "admin"];
      } else {
        next = [...user.roles, role];
      }
    }
    setSaving(user.id + ":" + role);
    try {
      await patchUserRoles(token, user.id, next);
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, roles: next } : u));
    } catch (e) { setError(e instanceof Error ? e.message : "Fehler"); }
    finally { setSaving(null); }
  }

  async function toggleSuspend(user: LogtoUser) {
    if (!token) return;
    setSaving(user.id + ":suspend");
    try {
      await patchUserSuspend(token, user.id, !user.isSuspended);
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, isSuspended: !u.isSuspended } : u));
    } catch (e) { setError(e instanceof Error ? e.message : "Fehler"); }
    finally { setSaving(null); }
  }

  const TABS = [
    { id: "users" as Tab, label: "Benutzer", icon: <Users className="h-4 w-4" /> },
    { id: "roles" as Tab, label: "Rechte & Rollen", icon: <KeyRound className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg)] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-4xl space-y-5">

        {/* Page header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]/10">
            <UserRound className="h-5 w-5 text-[var(--accent)]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--text-main)]">Interne Verwaltung</h1>
            <p className="text-sm text-[var(--text-muted)]">Mitarbeiterzugänge und Berechtigungen zentral verwalten</p>
          </div>
        </div>

        {/* Tab selector */}
        <div className="flex w-full rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-1 gap-1">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={[
                "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all",
                tab === t.id
                  ? "bg-[var(--accent)] text-black shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-raised)]",
              ].join(" ")}>
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="cust-alert cust-alert--error rounded-lg text-sm">
            <span className="flex-1">{error}</span>
            <button onClick={() => setError("")} className="shrink-0 opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
          </div>
        )}

        {/* Tab content */}
        {tab === "users" ? (
          <UsersTab
            users={users} loading={loading} saving={saving}
            onToggleRole={toggleRole} onToggleSuspend={toggleSuspend}
            onReload={load} token={token!} setUsers={setUsers}
          />
        ) : (
          <RolesTab
            users={users} loading={loading} saving={saving}
            onToggleRole={toggleRole} onReload={load}
          />
        )}
      </div>
    </div>
  );
}

