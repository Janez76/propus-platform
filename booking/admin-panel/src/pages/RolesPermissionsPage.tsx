import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  Plus,
  Trash2,
  Save,
  Search,
  ChevronDown,
  ShoppingCart,
  Users,
  Camera,
  MessageSquare,
  Settings,
  Building2,
  Check,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { usePermissions } from "../hooks/usePermissions";
import { t } from "../i18n";
import { cn } from "../lib/utils";
import {
  getAccessGroups,
  createAccessGroup,
  updateAccessGroup,
  deleteAccessGroup,
  type AccessGroup,
} from "../api/access";

// ─── Permission Categories ───────────────────────────────────────────
type PermissionCategory = {
  key: string;
  label: string;
  icon: LucideIcon;
  permissions: { key: string; label: string }[];
};

const PERMISSION_CATEGORIES: PermissionCategory[] = [
  {
    key: "system",
    label: "System",
    icon: Settings,
    permissions: [
      { key: "dashboard.view", label: "Dashboard ansehen" },
      { key: "settings.manage", label: "Einstellungen verwalten" },
      { key: "roles.manage", label: "Rollen & Rechte verwalten" },
      { key: "backups.manage", label: "Backups verwalten" },
      { key: "bugs.read", label: "Fehlerberichte ansehen" },
    ],
  },
  {
    key: "orders",
    label: "Aufträge",
    icon: ShoppingCart,
    permissions: [
      { key: "orders.read", label: "Aufträge ansehen" },
      { key: "orders.create", label: "Aufträge erstellen" },
      { key: "orders.update", label: "Aufträge bearbeiten" },
      { key: "orders.delete", label: "Aufträge löschen" },
      { key: "orders.assign", label: "Aufträge zuweisen" },
    ],
  },
  {
    key: "customers",
    label: "Kunden",
    icon: Users,
    permissions: [
      { key: "customers.read", label: "Kunden ansehen" },
      { key: "customers.create", label: "Kunden erstellen" },
      { key: "customers.update", label: "Kunden bearbeiten" },
      { key: "customers.delete", label: "Kunden löschen" },
      { key: "company.manage", label: "Firmen verwalten" },
      { key: "team.manage", label: "Team / Mitarbeiter verwalten" },
    ],
  },
  {
    key: "photographers",
    label: "Fotografen",
    icon: Camera,
    permissions: [
      { key: "photographers.read", label: "Fotografen ansehen" },
      { key: "photographers.manage", label: "Fotografen verwalten" },
      { key: "calendar.view", label: "Kalender ansehen" },
    ],
  },
  {
    key: "products",
    label: "Produkte & Preise",
    icon: Building2,
    permissions: [
      { key: "products.manage", label: "Produkte verwalten" },
      { key: "discount_codes.manage", label: "Gutscheine verwalten" },
      { key: "reviews.manage", label: "Reviews verwalten" },
    ],
  },
  {
    key: "communication",
    label: "Kommunikation",
    icon: MessageSquare,
    permissions: [
      { key: "emails.manage", label: "E-Mail-Vorlagen verwalten" },
      { key: "chat.read", label: "Nachrichten lesen" },
      { key: "chat.write", label: "Nachrichten senden" },
    ],
  },
];

// ─── Category Card ───────────────────────────────────────────────────
function CategoryCard({
  category,
  selectedKeys,
  onToggle,
  filter,
  disabled,
}: {
  category: PermissionCategory;
  selectedKeys: Set<string>;
  onToggle: (key: string) => void;
  filter: string;
  disabled: boolean;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const Icon = category.icon;

  const filteredPermissions = useMemo(() => {
    if (!filter) return category.permissions;
    const q = filter.toLowerCase();
    return category.permissions.filter(
      (p) => p.label.toLowerCase().includes(q) || p.key.toLowerCase().includes(q),
    );
  }, [category.permissions, filter]);

  if (filteredPermissions.length === 0) return null;

  const allSelected = filteredPermissions.every((p) => selectedKeys.has(p.key));
  const someSelected = filteredPermissions.some((p) => selectedKeys.has(p.key));

  const toggleAll = () => {
    if (disabled) return;
    if (allSelected) {
      filteredPermissions.forEach((p) => onToggle(p.key));
    } else {
      filteredPermissions.forEach((p) => {
        if (!selectedKeys.has(p.key)) onToggle(p.key);
      });
    }
  };

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ background: "var(--surface)", borderColor: "var(--border-soft)" }}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors"
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-subtle)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: "var(--accent-subtle)" }}
        >
          <Icon className="h-4 w-4" style={{ color: "var(--accent)" }} />
        </div>
        <div className="flex-1">
          <span className="text-[13px] font-semibold" style={{ color: "var(--text-main)" }}>
            {category.label}
          </span>
          <span className="ml-2 text-[11px]" style={{ color: "var(--text-subtle)" }}>
            {filteredPermissions.filter((p) => selectedKeys.has(p.key)).length}/{filteredPermissions.length}
          </span>
        </div>
        <ChevronDown
          className={cn("h-4 w-4 transition-transform duration-200", isOpen && "rotate-180")}
          style={{ color: "var(--text-muted)" }}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="border-t px-4 pb-3 pt-2" style={{ borderColor: "var(--border-soft)" }}>
              {/* Select All */}
              <button
                onClick={toggleAll}
                disabled={disabled}
                className={cn(
                  "mb-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors w-full",
                  disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                )}
                style={{ color: "var(--text-muted)" }}
                onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = "var(--accent-subtle)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <div
                  className={cn(
                    "flex h-4 w-4 items-center justify-center rounded border transition-colors",
                    allSelected ? "border-[var(--accent)]" : someSelected ? "border-[var(--accent)]" : "",
                  )}
                  style={{
                    borderColor: allSelected || someSelected ? "var(--accent)" : "var(--border-strong)",
                    background: allSelected ? "var(--accent)" : "transparent",
                  }}
                >
                  {allSelected && <Check className="h-3 w-3" style={{ color: "var(--primary-contrast)" }} />}
                  {someSelected && !allSelected && (
                    <div className="h-1.5 w-1.5 rounded-sm" style={{ background: "var(--accent)" }} />
                  )}
                </div>
                Alle auswählen
              </button>

              <div className="space-y-0.5">
                {filteredPermissions.map((p) => {
                  const checked = selectedKeys.has(p.key);
                  return (
                    <label
                      key={p.key}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 transition-colors",
                        disabled && "cursor-not-allowed opacity-50",
                      )}
                      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = "var(--accent-subtle)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      <div
                        className={cn(
                          "flex h-4 w-4 items-center justify-center rounded border transition-colors flex-shrink-0",
                        )}
                        style={{
                          borderColor: checked ? "var(--accent)" : "var(--border-strong)",
                          background: checked ? "var(--accent)" : "transparent",
                        }}
                      >
                        {checked && <Check className="h-3 w-3" style={{ color: "var(--primary-contrast)" }} />}
                      </div>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggle(p.key)}
                        disabled={disabled}
                        className="sr-only"
                      />
                      <span className="text-[12.5px]" style={{ color: "var(--text-main)" }}>
                        {p.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Group Panel ─────────────────────────────────────────────────────
function GroupPanel({
  group,
  selectedKeys,
  onToggleKey,
  onSave,
  onDelete,
  saving,
}: {
  group: AccessGroup;
  selectedKeys: Set<string>;
  onToggleKey: (key: string) => void;
  onSave: () => void;
  onDelete: () => void;
  saving: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState("");

  const totalPerms = PERMISSION_CATEGORIES.reduce((sum, c) => sum + c.permissions.length, 0);
  const selectedCount = selectedKeys.size;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("rounded-xl border overflow-hidden transition-colors", isOpen && "!border-[color:var(--accent)]/25")}
      style={{ background: "var(--surface)", borderColor: "var(--border-soft)" }}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-3.5 px-5 py-4 text-left transition-colors"
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-subtle)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg"
          style={{ background: "var(--accent-subtle)" }}
        >
          <Shield className="h-5 w-5" style={{ color: "var(--accent)" }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold truncate" style={{ color: "var(--text-main)" }}>
            {group.name}
          </div>
          <div className="mt-0.5 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
            {selectedCount} von {totalPerms} Berechtigungen aktiv
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
            style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
          >
            {selectedCount} Rechte
          </span>
          <ChevronDown
            className={cn("h-4 w-4 transition-transform duration-200", isOpen && "rotate-180")}
            style={{ color: "var(--text-muted)" }}
          />
        </div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t px-5 pb-5 pt-4" style={{ borderColor: "var(--border-soft)" }}>
              {/* Actions bar */}
              <div className="mb-4 flex items-center gap-3">
                <div className="relative flex-1 max-w-xs">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
                  <input
                    type="text"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Berechtigung suchen…"
                    className="h-8 w-full rounded-lg border pl-8 pr-3 text-[12px] outline-none transition-colors"
                    style={{
                      background: "var(--surface-raised)",
                      borderColor: "var(--border-soft)",
                      color: "var(--text-main)",
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-soft)"; }}
                  />
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    onClick={onSave}
                    disabled={saving}
                    className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium transition-colors"
                    style={{ background: "var(--accent)", color: "var(--primary-contrast)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent)"; }}
                  >
                    <Save className="h-3.5 w-3.5" />
                    {saving ? "Speichert…" : "Speichern"}
                  </button>
                  <button
                    onClick={onDelete}
                    className="flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-medium transition-colors text-red-500 border-red-500/25"
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(220,50,50,.08)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Löschen
                  </button>
                </div>
              </div>

              {/* Categories grid */}
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {PERMISSION_CATEGORIES.map((cat) => (
                  <CategoryCard
                    key={cat.key}
                    category={cat}
                    selectedKeys={selectedKeys}
                    onToggle={onToggleKey}
                    filter={filter}
                    disabled={false}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────
export function RolesPermissionsPage() {
  const token = useAuthStore((s) => s.token);
  const lang = useAuthStore((s) => s.language);
  const { can } = usePermissions();
  const canManage = can("roles.manage");

  const [groups, setGroups] = useState<AccessGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Record<number, Set<string>>>({});
  const [savingGroupId, setSavingGroupId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const groupsRes = await getAccessGroups(token, { scope_type: "system" });
      const loaded = groupsRes.groups || [];
      setGroups(loaded);
      const nextSel: Record<number, Set<string>> = {};
      for (const gr of loaded) {
        const pk = gr.permission_keys;
        let arr: string[] = [];
        if (Array.isArray(pk)) arr = pk;
        else if (typeof pk === "string") {
          try {
            const parsed = JSON.parse(pk) as unknown;
            arr = Array.isArray(parsed) ? (parsed as string[]) : [];
          } catch {
            arr = [];
          }
        }
        nextSel[gr.id] = new Set(arr);
      }
      setSelectedKeys(nextSel);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Laden fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCreate = async () => {
    if (!token || !newGroupName.trim()) return;
    try {
      await createAccessGroup(token, {
        name: newGroupName.trim(),
        scope_type: "system",
        permission_keys: [],
      });
      setNewGroupName("");
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erstellen fehlgeschlagen");
    }
  };

  const handleSave = async (groupId: number) => {
    if (!token) return;
    setSavingGroupId(groupId);
    const keys = selectedKeys[groupId] ?? new Set<string>();
    try {
      await updateAccessGroup(token, groupId, { permission_keys: [...keys] });
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setSavingGroupId(null);
    }
  };

  const handleDelete = async (groupId: number) => {
    if (!token) return;
    if (!window.confirm("Rolle wirklich löschen? Benutzer in dieser Rolle verlieren ihre Berechtigungen.")) return;
    try {
      await deleteAccessGroup(token, groupId);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Löschen fehlgeschlagen");
    }
  };

  const toggleKey = (groupId: number, key: string) => {
    setSelectedKeys((prev) => {
      const current = prev[groupId] ?? new Set<string>();
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...prev, [groupId]: next };
    });
  };

  if (!canManage) {
    return (
      <div
        className="rounded-xl border px-6 py-6 text-sm"
        style={{ borderColor: "var(--border-soft)", background: "var(--surface)", color: "var(--text-muted)" }}
      >
        Keine Berechtigung für diese Seite.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border"
          style={{ background: "var(--accent-subtle)", borderColor: "color-mix(in srgb, var(--accent) 25%, transparent)" }}
        >
          <Shield className="h-5 w-5" style={{ color: "var(--accent)" }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--propus-font-heading)", color: "var(--text-main)" }}>
            {t(lang, "roles.title")}
          </h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
            {t(lang, "roles.description")}
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/25 bg-red-500/8 px-4 py-2.5 text-sm text-red-500">
          {error}
        </div>
      )}

      {/* Create new group */}
      <div
        className="rounded-xl border p-5"
        style={{ background: "var(--surface)", borderColor: "var(--border-soft)" }}
      >
        <h2 className="mb-3 text-[14px] font-semibold" style={{ color: "var(--text-main)" }}>
          Neue Systemgruppe erstellen
        </h2>
        <div className="flex flex-wrap gap-2.5">
          <input
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="Gruppenname (z. B. Fotograf, Sachbearbeiter, …)"
            className="h-10 min-w-[240px] flex-1 rounded-lg border px-3.5 text-[13px] outline-none transition-colors"
            style={{
              background: "var(--surface-raised)",
              borderColor: "var(--border-soft)",
              color: "var(--text-main)",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-soft)"; }}
            onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); }}
          />
          <button
            onClick={() => void handleCreate()}
            className="flex h-10 items-center gap-2 rounded-lg px-5 text-[13px] font-semibold transition-colors"
            style={{ background: "var(--accent)", color: "var(--primary-contrast)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent)"; }}
          >
            <Plus className="h-4 w-4" />
            Erstellen
          </button>
        </div>
      </div>

      {/* Groups */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <GroupPanel
              key={g.id}
              group={g}
              selectedKeys={selectedKeys[g.id] ?? new Set<string>()}
              onToggleKey={(key) => toggleKey(g.id, key)}
              onSave={() => void handleSave(g.id)}
              onDelete={() => void handleDelete(g.id)}
              saving={savingGroupId === g.id}
            />
          ))}
          {!groups.length && (
            <div
              className="rounded-xl border py-12 text-center"
              style={{ background: "var(--surface)", borderColor: "var(--border-soft)" }}
            >
              <Shield className="mx-auto mb-3 h-8 w-8" style={{ color: "var(--text-subtle)" }} />
              <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                Noch keine Gruppen vorhanden. Erstelle eine neue Systemgruppe.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
