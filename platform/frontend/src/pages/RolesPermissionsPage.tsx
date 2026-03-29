import { useCallback, useEffect, useState } from "react";
import { Shield, Crown, Camera, RefreshCw, UserRound, Lock, Check } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { apiRequest } from "../api/client";

type LogtoUser = {
  id: string;
  name: string;
  email: string;
  roles: string[];
  isSuspended: boolean;
};

const ROLE_CONFIG: Record<string, { label: string; description: string; icon: React.ReactNode; color: string; badgeColor: string }> = {
  super_admin: {
    label: "Super-Admin",
    description: "Voller Zugriff auf alle Bereiche, inkl. Systemeinstellungen und Benutzer­verwaltung",
    icon: <Crown className="h-5 w-5" />,
    color: "border-amber-500/40 bg-amber-500/5",
    badgeColor: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  },
  admin: {
    label: "Admin",
    description: "Zugriff auf Aufträge, Kunden, Mitarbeiter, Produkte und Einstellungen",
    icon: <Shield className="h-5 w-5" />,
    color: "border-violet-500/40 bg-violet-500/5",
    badgeColor: "border-violet-500/40 bg-violet-500/10 text-violet-300",
  },
  photographer: {
    label: "Mitarbeiter",
    description: "Zugriff auf eigene Aufträge und Kalender",
    icon: <Camera className="h-5 w-5" />,
    color: "border-sky-500/40 bg-sky-500/5",
    badgeColor: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  },
};

const ROLE_PERMISSIONS: Record<string, { label: string; keys: string[] }[]> = {
  super_admin: [
    { label: "Alle Bereiche", keys: ["dashboard.view", "orders.read", "orders.create", "orders.update", "orders.delete", "customers.manage", "photographers.manage", "products.manage", "settings.manage", "roles.manage", "users.manage", "billing.read", "backups.manage"] },
  ],
  admin: [
    { label: "Aufträge", keys: ["orders.read", "orders.create", "orders.update", "orders.delete", "orders.assign", "orders.export"] },
    { label: "Kunden", keys: ["customers.read", "customers.manage"] },
    { label: "Mitarbeiter", keys: ["photographers.read", "photographers.manage"] },
    { label: "Produkte & Codes", keys: ["products.manage", "discount_codes.manage"] },
    { label: "Einstellungen", keys: ["settings.manage", "emails.manage"] },
  ],
  photographer: [
    { label: "Eingeschränkt", keys: ["dashboard.view", "orders.read", "orders.update", "orders.assign", "calendar.view", "photographers.read"] },
  ],
};

function initials(name: string, email: string) {
  const n = name.trim();
  if (n) {
    const p = n.split(/\s+/);
    if (p.length >= 2) return (p[0][0] + p[p.length - 1][0]).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

const AVATAR_PALETTE = [
  "bg-violet-500/20 text-violet-300",
  "bg-teal-500/20 text-teal-300",
  "bg-amber-500/20 text-amber-300",
  "bg-sky-500/20 text-sky-300",
  "bg-rose-500/20 text-rose-300",
  "bg-emerald-500/20 text-emerald-300",
];
function avatarColor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

async function fetchUsers(token: string): Promise<LogtoUser[]> {
  const res = await apiRequest<{ users: LogtoUser[] }>("/api/admin/internal-users", "GET", token);
  return res.users || [];
}

async function patchUserRoles(token: string, userId: string, roles: string[]) {
  return apiRequest("/api/admin/internal-users/" + userId + "/roles", "PATCH", token, { roles });
}

export function RolesPermissionsPage() {
  const token = useAuthStore((s) => s.token);
  const [users, setUsers] = useState<LogtoUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      setUsers(await fetchUsers(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function toggleRole(user: LogtoUser, role: string) {
    const has = user.roles.includes(role);
    const next = has ? user.roles.filter((r) => r !== role) : [...user.roles, role];
    setSaving(user.id + ":" + role);
    try {
      await patchUserRoles(token!, user.id, next);
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, roles: next } : u));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-4xl space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]/10">
              <Shield className="h-5 w-5 text-[var(--accent)]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[var(--text-main)]">Rechte & Rollen</h1>
              <p className="text-sm text-[var(--text-muted)]">Logto-Rollen und ihre Berechtigungen im Überblick</p>
            </div>
          </div>
          <button onClick={load}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">
            <RefreshCw className="h-4 w-4" />
            Aktualisieren
          </button>
        </div>

        {error && <div className="rounded-lg border border-red-800/50 bg-red-950/30 px-4 py-3 text-sm text-red-400">{error}</div>}

        {/* Role cards */}
        {(["super_admin", "admin", "photographer"] as const).map((roleKey) => {
          const cfg = ROLE_CONFIG[roleKey];
          const roleUsers = users.filter((u) => u.roles.includes(roleKey));
          const permGroups = ROLE_PERMISSIONS[roleKey] || [];

          return (
            <div key={roleKey} className={`rounded-2xl border p-5 ${cfg.color}`}>
              {/* Role header */}
              <div className="mb-4 flex items-start gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${cfg.badgeColor}`}>
                  {cfg.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-[var(--text-main)]">{cfg.label}</h2>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cfg.badgeColor}`}>
                      {roleUsers.length} Benutzer
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-[var(--text-muted)]">{cfg.description}</p>
                </div>
              </div>

              {/* Permissions */}
              <div className="mb-4 flex flex-wrap gap-1.5">
                {permGroups.map((group) => (
                  group.keys.map((k) => (
                    <span key={k} className="inline-flex items-center gap-1 rounded-md border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-0.5 text-[10px] text-[var(--text-subtle)]">
                      <Check className="h-2.5 w-2.5 text-emerald-400" />
                      {k}
                    </span>
                  ))
                ))}
              </div>

              {/* User assignments */}
              <div className="border-t border-[var(--border-soft)] pt-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Zugewiesene Benutzer
                </div>
                {loading ? (
                  <div className="text-sm text-[var(--text-subtle)]">Wird geladen…</div>
                ) : users.length === 0 ? (
                  <div className="text-sm text-[var(--text-subtle)]">Keine Benutzer gefunden</div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {users.map((user) => {
                      const has = user.roles.includes(roleKey);
                      const busy = saving === user.id + ":" + roleKey;
                      return (
                        <button
                          key={user.id}
                          onClick={() => toggleRole(user, roleKey)}
                          disabled={busy}
                          title={has ? `${cfg.label} von ${user.name || user.email} entfernen` : `${cfg.label} an ${user.name || user.email} zuweisen`}
                          className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm transition-all ${
                            has
                              ? `${cfg.color} border-current text-[var(--text-main)]`
                              : "border-[var(--border-soft)] bg-[var(--surface)] text-[var(--text-subtle)] hover:border-[var(--accent)]/30"
                          } ${busy ? "opacity-50 cursor-wait" : "cursor-pointer"}`}
                        >
                          <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${avatarColor(user.id)}`}>
                            {initials(user.name, user.email)}
                          </div>
                          <span>{user.name || user.email}</span>
                          {has && <Check className="h-3.5 w-3.5 text-emerald-400" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Info */}
        <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-raised)] px-4 py-3 text-xs text-[var(--text-subtle)] flex items-start gap-2">
          <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0 text-[var(--accent)]" />
          <span>
            Alle Rollen werden direkt in <strong className="text-[var(--text-muted)]">Logto</strong> gespeichert.
            Änderungen gelten ab dem nächsten Login des Benutzers.
            Neue Rollen können nur im Logto Admin-Panel erstellt werden.
          </span>
        </div>

        {/* Logto Admin Link */}
        <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <UserRound className="h-5 w-5 text-[var(--accent)]" />
            <div>
              <div className="text-sm font-semibold text-[var(--text-main)]">Logto Admin Console</div>
              <div className="text-xs text-[var(--text-muted)]">Erweiterte Einstellungen, neue Rollen, OIDC-Konfiguration</div>
            </div>
          </div>
          <a
            href="http://localhost:3302"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 transition-colors"
          >
            Öffnen →
          </a>
        </div>

      </div>
    </div>
  );
}
