import { useCallback, useEffect, useState } from "react";
import {
  addGroupMember,
  createCustomerAccessGroup,
  ensureContactSubject,
  getCustomerAccess,
  type CustomerAccessResponse,
} from "../../api/access";
import { usePermissions } from "../../hooks/usePermissions";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";

type Props = {
  token: string;
  customerId: number;
};

export function CustomerAccessPanel({ token, customerId }: Props) {
  const lang = useAuthStore((s) => s.language);
  const { can } = usePermissions();
  const canManage = can("roles.manage");
  const [data, setData] = useState<CustomerAccessResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [groupPick, setGroupPick] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    if (!token || !canManage) return;
    setLoading(true);
    setError("");
    try {
      const res = await getCustomerAccess(token, customerId);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }, [token, customerId, canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createGroup() {
    if (!newGroupName.trim()) return;
    try {
      await createCustomerAccessGroup(token, customerId, { name: newGroupName.trim(), permission_keys: [] });
      setNewGroupName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    }
  }

  async function activateContact(contactId: number) {
    try {
      await ensureContactSubject(token, customerId, contactId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    }
  }

  async function assignToGroup(groupId: number, subjectId: number) {
    try {
      await addGroupMember(token, groupId, subjectId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    }
  }

  if (!canManage) return null;

  return (
    <div className="mt-4 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">{t(lang, "access.customerSection")}</div>
      {error ? <p className="mb-2 text-xs text-red-600">{error}</p> : null}
      {loading && !data ? <p className="text-xs text-zinc-500">{t(lang, "common.loading")}</p> : null}
      {data ? (
        <div className="space-y-3 text-sm">
          <div>
            <div className="mb-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">Gruppen</div>
            <ul className="space-y-1 text-xs">
              {(data.groups || []).map((g) => (
                <li key={g.id} className="rounded bg-zinc-50 px-2 py-1 dark:bg-zinc-800/80">
                  <span className="font-medium">{g.name}</span>
                  {Array.isArray(g.permission_keys) && g.permission_keys.length ? (
                    <span className="ml-2 font-mono text-[10px] text-zinc-500">({g.permission_keys.join(", ")})</span>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                className="ui-input min-w-0 flex-1 text-xs"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder={t(lang, "access.groupName")}
              />
              <button type="button" className="btn-secondary text-xs" onClick={() => void createGroup()}>
                {t(lang, "access.create")}
              </button>
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">Kontakte</div>
            <ul className="space-y-2">
              {(data.contacts || []).map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-medium">{c.name || c.email || `#${c.id}`}</span>
                  {!c.subject_id ? (
                    <button type="button" className="text-[#9E8649] hover:underline" onClick={() => void activateContact(c.id)}>
                      {t(lang, "access.contactSubject")}
                    </button>
                  ) : (
                    <span className="text-zinc-500">ID {c.subject_id}</span>
                  )}
                  {c.subject_id && (data.groups || []).length ? (
                    <span className="flex items-center gap-1">
                      <select
                        className="ui-input max-w-[140px] py-0.5 text-[11px]"
                        value={groupPick[c.id] ?? ""}
                        onChange={(e) => setGroupPick((p) => ({ ...p, [c.id]: e.target.value }))}
                      >
                        <option value="">{t(lang, "access.addToGroup")}</option>
                        {(data.groups || []).map((g) => (
                          <option key={g.id} value={String(g.id)}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="rounded border border-zinc-300 px-2 py-0.5 dark:border-zinc-600"
                        onClick={() => {
                          const gid = Number(groupPick[c.id]);
                          if (!Number.isFinite(gid) || !c.subject_id) return;
                          void assignToGroup(gid, c.subject_id);
                        }}
                      >
                        OK
                      </button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
