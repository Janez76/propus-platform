import { useEffect, useMemo, useState } from "react";
import { Shield } from "lucide-react";
import {
  createAccessGroup,
  deleteAccessGroup,
  getAccessGroups,
  getAccessPermissions,
  updateAccessGroup,
  type AccessGroup,
  type PermissionDefinition,
} from "../api/access";
import { useAuthStore } from "../store/authStore";
import { usePermissions } from "../hooks/usePermissions";
import { t } from "../i18n";

export function AccessSettingsPage() {
  const token = useAuthStore((s) => s.token);
  const lang = useAuthStore((s) => s.language);
  const { can } = usePermissions();
  const [defs, setDefs] = useState<PermissionDefinition[]>([]);
  const [groups, setGroups] = useState<AccessGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Record<number, Set<string>>>({});

  const canManage = can("roles.manage");

  const sortedDefs = useMemo(() => [...defs].sort((a, b) => a.permission_key.localeCompare(b.permission_key)), [defs]);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const [p, g] = await Promise.all([
        getAccessPermissions(token),
        getAccessGroups(token, { scope_type: "system" }),
      ]);
      setDefs(p.permissions || []);
      const loaded = g.groups || [];
      setGroups(loaded);
      const nextSel: Record<number, Set<string>> = {};
      for (const gr of loaded) {
        const pk = gr.permission_keys;
        let arr: string[] = [];
        if (Array.isArray(pk)) arr = pk as string[];
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
  }

  useEffect(() => {
    void load();
  }, [token]);

  async function handleCreate() {
    if (!token || !newName.trim()) return;
    try {
      await createAccessGroup(token, {
        name: newName.trim(),
        scope_type: "system",
        permission_keys: [],
      });
      setNewName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    }
  }

  async function handleSaveGroup(g: AccessGroup) {
    if (!token) return;
    const keys = selectedKeys[g.id] ?? new Set(g.permission_keys || []);
    try {
      await updateAccessGroup(token, g.id, { permission_keys: [...keys] });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    }
  }

  async function handleDelete(id: number) {
    if (!token) return;
    if (!window.confirm("Gruppe wirklich loeschen?")) return;
    try {
      await deleteAccessGroup(token, id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Loeschen fehlgeschlagen");
    }
  }

  function toggleKey(groupId: number, key: string, current: Set<string>) {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedKeys((prev) => ({ ...prev, [groupId]: next }));
  }

  if (!canManage) {
    return (
      <div className="cust-alert cust-alert--warning rounded-xl p-6 text-sm">
        {t(lang, "access.noPermission")}
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Shield className="h-8 w-8" style={{ color: "var(--accent)" }} />
        <div>
          <h1 className="cust-page-header-title">{t(lang, "access.title")}</h1>
          <p className="cust-page-header-sub">{t(lang, "access.description")}</p>
        </div>
      </div>

      {error && (
        <div className="cust-alert cust-alert--error rounded-lg text-sm">{error}</div>
      )}

      {/* New group form */}
      <div className="cust-form-section">
        <div className="cust-form-section-title">{t(lang, "access.newSystemGroup")}</div>
        <div className="flex flex-wrap gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t(lang, "access.groupName")}
            className="cust-form-input min-w-[200px] flex-1"
          />
          <button
            type="button"
            onClick={() => void handleCreate()}
            className="btn-primary min-h-0 min-w-0 px-4 py-2 text-sm"
          >
            {t(lang, "access.create")}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm" style={{ color: "var(--text-subtle)" }}>{t(lang, "common.loading")}</div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const keys = selectedKeys[g.id] ?? new Set<string>();
            return (
              <div key={g.id} className="cust-form-section">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold" style={{ color: "var(--text-main)" }}>{g.name}</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSaveGroup(g)}
                      className="btn-secondary min-h-0 min-w-0 px-3 py-1 text-xs"
                    >
                      {t(lang, "common.save")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(g.id)}
                      className="cust-action-icon cust-action-icon--danger min-h-0 min-w-0 px-3 py-1 text-xs w-auto rounded-md border"
                      style={{ borderColor: "color-mix(in srgb, #e74c3c 30%, transparent)", color: "#c0392b" }}
                    >
                      {t(lang, "common.delete")}
                    </button>
                  </div>
                </div>
                <div className="max-h-60 overflow-y-auto rounded-lg border p-2" style={{ borderColor: "var(--border-soft)" }}>
                  <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                    {sortedDefs.map((d) => (
                      <label key={`${g.id}-${d.permission_key}`} className="flex cursor-pointer items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={keys.has(d.permission_key)}
                          onChange={() => toggleKey(g.id, d.permission_key, keys)}
                          style={{ accentColor: "var(--accent)" }}
                        />
                        <span className="truncate font-mono" style={{ color: "var(--text-muted)" }}>{d.permission_key}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
          {!groups.length && (
            <p className="text-sm" style={{ color: "var(--text-subtle)" }}>{t(lang, "access.noGroups")}</p>
          )}
        </div>
      )}
    </div>
  );
}
