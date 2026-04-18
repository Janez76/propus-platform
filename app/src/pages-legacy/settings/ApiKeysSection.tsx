import { useCallback, useEffect, useState } from "react";
import { listApiKeys, createApiKey, revokeApiKey, type ApiKey } from "../../api/apiKeys";
import { t, type Lang } from "../../i18n";
import { useAuthStore } from "../../store/authStore";

type NewKey = { label: string; token: string };

function formatDateTime(raw: string | null, lang: Lang): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(lang === "de" ? "de-CH" : lang, { dateStyle: "short", timeStyle: "short" });
}

export function ApiKeysSection() {
  const token = useAuthStore((s) => s.token);
  const lang = useAuthStore((s) => s.language);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<NewKey | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const rows = await listApiKeys(token);
      setKeys(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Laden fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = label.trim();
    if (!trimmed || !token) return;
    setCreating(true);
    setError("");
    try {
      const result = await createApiKey(token, trimmed);
      setNewKey({ label: trimmed, token: result.token });
      setLabel("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Anlegen fehlgeschlagen");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: number) {
    if (!token) return;
    if (!window.confirm(t(lang, "settings.apiKeys.confirmRevoke"))) return;
    try {
      await revokeApiKey(token, id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revoke fehlgeschlagen");
    }
  }

  async function copyToken() {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey.token);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1500);
    } catch {
      /* ignore */
    }
  }

  const activeKeys = keys.filter((k) => !k.revokedAt);
  const revokedKeys = keys.filter((k) => !!k.revokedAt);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-4">
        <h3 className="text-sm font-semibold text-[var(--text-main)]">{t(lang, "settings.apiKeys.title")}</h3>
        <p className="mt-1 text-xs text-[var(--text-subtle)]">{t(lang, "settings.apiKeys.description")}</p>

        <form onSubmit={handleCreate} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm grow min-w-[220px]">
            <span className="font-medium text-[var(--text-muted)]">{t(lang, "settings.apiKeys.labelField")}</span>
            <input
              type="text"
              maxLength={200}
              className="mt-1 w-full rounded border px-3 py-2 text-sm border-[var(--border-soft)] bg-[var(--surface-raised)]"
              placeholder={t(lang, "settings.apiKeys.labelPlaceholder")}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={creating || !label.trim()}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? t(lang, "settings.apiKeys.creating") : t(lang, "settings.apiKeys.newKey")}
          </button>
        </form>

        {error ? <p className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p> : null}
      </div>

      {newKey ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/30">
          <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            {t(lang, "settings.apiKeys.createdTitle")}
          </h4>
          <p className="mt-1 text-xs text-amber-900 dark:text-amber-200">
            {t(lang, "settings.apiKeys.copyWarning")}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="flex-1 break-all rounded bg-white px-3 py-2 text-xs text-slate-800 dark:bg-slate-900 dark:text-slate-100">
              {newKey.token}
            </code>
            <button
              type="button"
              onClick={copyToken}
              className="rounded-lg border border-amber-400 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-600 dark:bg-slate-900 dark:text-amber-200 dark:hover:bg-slate-800"
            >
              {copyState === "copied" ? t(lang, "settings.apiKeys.copied") : t(lang, "settings.apiKeys.copy")}
            </button>
            <button
              type="button"
              onClick={() => setNewKey(null)}
              className="rounded-lg px-3 py-2 text-xs text-amber-900 underline dark:text-amber-200"
            >
              {t(lang, "settings.apiKeys.dismiss")}
            </button>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-4">
        <h4 className="text-sm font-semibold text-[var(--text-main)]">{t(lang, "settings.apiKeys.activeTitle")}</h4>
        {loading ? <p className="mt-2 text-sm text-slate-500">{t(lang, "settings.loading")}</p> : null}
        {!loading && activeKeys.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--text-subtle)]">{t(lang, "settings.apiKeys.noKeys")}</p>
        ) : null}
        {activeKeys.length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--text-subtle)]">
                  <th className="py-2 pr-3">{t(lang, "settings.apiKeys.col.label")}</th>
                  <th className="py-2 pr-3">{t(lang, "settings.apiKeys.col.prefix")}</th>
                  <th className="py-2 pr-3">{t(lang, "settings.apiKeys.col.createdBy")}</th>
                  <th className="py-2 pr-3">{t(lang, "settings.apiKeys.col.createdAt")}</th>
                  <th className="py-2 pr-3">{t(lang, "settings.apiKeys.col.lastUsed")}</th>
                  <th className="py-2 pr-3" />
                </tr>
              </thead>
              <tbody>
                {activeKeys.map((key) => (
                  <tr key={key.id} className="border-t border-[var(--border-soft)]">
                    <td className="py-2 pr-3 font-medium text-[var(--text-main)]">{key.label}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{key.prefix}…</td>
                    <td className="py-2 pr-3 text-[var(--text-subtle)]">
                      {key.createdByName || key.createdByEmail || "—"}
                    </td>
                    <td className="py-2 pr-3 text-[var(--text-subtle)]">{formatDateTime(key.createdAt, lang)}</td>
                    <td className="py-2 pr-3 text-[var(--text-subtle)]">{formatDateTime(key.lastUsedAt, lang)}</td>
                    <td className="py-2 pr-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleRevoke(key.id)}
                        className="rounded-lg border border-red-300 px-3 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950/40"
                      >
                        {t(lang, "settings.apiKeys.revoke")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {revokedKeys.length > 0 ? (
        <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-4">
          <h4 className="text-sm font-semibold text-[var(--text-main)]">{t(lang, "settings.apiKeys.revokedTitle")}</h4>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--text-subtle)]">
                  <th className="py-2 pr-3">{t(lang, "settings.apiKeys.col.label")}</th>
                  <th className="py-2 pr-3">{t(lang, "settings.apiKeys.col.prefix")}</th>
                  <th className="py-2 pr-3">{t(lang, "settings.apiKeys.col.revokedAt")}</th>
                </tr>
              </thead>
              <tbody>
                {revokedKeys.map((key) => (
                  <tr key={key.id} className="border-t border-[var(--border-soft)] text-[var(--text-subtle)]">
                    <td className="py-2 pr-3">{key.label}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{key.prefix}…</td>
                    <td className="py-2 pr-3">{formatDateTime(key.revokedAt, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
