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
import { cn } from "../lib/utils";

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
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
        {t(lang, "access.noPermission")}
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex items-center gap-3">
        <Shield className="h-8 w-8 text-[var(--accent)]" />
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-main)]">{t(lang, "access.title")}</h1>
          <p className="text-sm text-[var(--text-subtle)]">{t(lang, "access.description")}</p>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4 border-[var(--border-soft)] bg-[var(--surface)]">
        <h2 className="mb-3 font-semibold text-[var(--text-main)]">{t(lang, "access.newSystemGroup")}</h2>
        <div className="flex flex-wrap gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t(lang, "access.groupName")}
            className={cn(
              "min-w-[200px] flex-1 rounded-lg border px-3 py-2 text-sm",
              "border-slate-200 bg-white border-[var(--border-soft)] bg-[var(--surface-raised)] text-[var(--text-main)]",
            )}
          />
          <button
            type="button"
            onClick={() => void handleCreate()}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-hover)]"
          >
            {t(lang, "access.create")}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-slate-500">{t(lang, "common.loading")}</div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const keys = selectedKeys[g.id] ?? new Set<string>();
            return (
              <div key={g.id} className="rounded-xl border border-slate-200 bg-white p-4 border-[var(--border-soft)] bg-[var(--surface)]">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-[var(--text-main)]">{g.name}</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSaveGroup(g)}
                      className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium border-[var(--border-soft)]"
                    >
                      {t(lang, "common.save")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(g.id)}
                      className="rounded-md border border-red-300 px-3 py-1 text-xs font-medium text-red-700 dark:border-red-800 dark:text-red-400"
                    >
                      {t(lang, "common.delete")}
                    </button>
                  </div>
                </div>
                <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-100 p-2 border-[var(--border-soft)]">
                  <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                    {sortedDefs.map((d) => (
                      <label key={`${g.id}-${d.permission_key}`} className="flex cursor-pointer items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={keys.has(d.permission_key)}
                          onChange={() => toggleKey(g.id, d.permission_key, keys)}
                        />
                        <span className="truncate font-mono text-[var(--text-muted)]">{d.permission_key}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
          {!groups.length ? (
            <p className="text-sm text-[var(--text-subtle)]">{t(lang, "access.noGroups")}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}


