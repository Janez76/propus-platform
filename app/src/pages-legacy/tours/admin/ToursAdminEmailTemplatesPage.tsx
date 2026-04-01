import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { getToursAdminEmailTemplatesBundle, putToursAdminEmailTemplates } from "../../../api/toursAdmin";
import { useQuery } from "../../../hooks/useQuery";
import { toursAdminEmailTemplatesQueryKey } from "../../../lib/queryKeys";

type Template = { subject?: string; html?: string; text?: string; name?: string; description?: string };

export function ToursAdminEmailTemplatesPage() {
  const qk = toursAdminEmailTemplatesQueryKey();
  const queryFn = useCallback(() => getToursAdminEmailTemplatesBundle(), []);
  const { data, loading, error, refetch } = useQuery(qk, queryFn, { staleTime: 60_000 });

  const [activeKey, setActiveKey] = useState<string>("");
  const [drafts, setDrafts] = useState<Record<string, Template>>({});
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const templates = data?.templates as Record<string, Template> | undefined;
  const defaults = data?.defaultTemplates as Record<string, Template> | undefined;
  const keys = useMemo(() => Object.keys(defaults ?? {}).sort(), [defaults]);

  useEffect(() => {
    if (!keys.length) return;
    setActiveKey((prev) => (prev && keys.includes(prev) ? prev : keys[0]));
  }, [keys]);

  useEffect(() => {
    if (!data || !keys.length || !defaults) return;
    const next: Record<string, Template> = {};
    for (const k of keys) {
      const t = (templates?.[k] || defaults[k] || {}) as Template;
      next[k] = {
        subject: String(t.subject ?? ""),
        html: String(t.html ?? ""),
        text: String(t.text ?? ""),
      };
    }
    setDrafts(next);
  }, [data, keys, templates, defaults]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveErr(null);
    setSaving(true);
    try {
      await putToursAdminEmailTemplates(drafts);
      void refetch();
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSaving(false);
    }
  }

  const cur = activeKey ? drafts[activeKey] : null;
  const meta = activeKey && defaults ? defaults[activeKey] : null;

  if (loading && !data) return <p className="text-sm text-[var(--text-subtle)]">Laden …</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--text-main)]">E-Mail-Templates</h1>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {saveErr ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {saveErr}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setActiveKey(k)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              k === activeKey ? "bg-[var(--accent)] text-white" : "border border-[var(--border-soft)] text-[var(--text-main)]"
            }`}
          >
            {String((defaults?.[k]?.name as string) || k)}
          </button>
        ))}
      </div>

      {cur && activeKey ? (
        <form onSubmit={onSave} className="space-y-4">
          {meta?.description ? <p className="text-sm text-[var(--text-subtle)]">{String(meta.description)}</p> : null}
          <label className="block text-sm">
            <span className="text-[var(--text-subtle)]">Betreff</span>
            <input
              className="mt-1 w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm"
              value={cur.subject || ""}
              onChange={(e) => setDrafts((d) => ({ ...d, [activeKey]: { ...cur, subject: e.target.value } }))}
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--text-subtle)]">HTML</span>
            <textarea
              className="mt-1 w-full min-h-[200px] rounded-lg border border-[var(--border-soft)] px-3 py-2 text-xs font-mono"
              value={cur.html || ""}
              onChange={(e) => setDrafts((d) => ({ ...d, [activeKey]: { ...cur, html: e.target.value } }))}
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--text-subtle)]">Text</span>
            <textarea
              className="mt-1 w-full min-h-[160px] rounded-lg border border-[var(--border-soft)] px-3 py-2 text-xs font-mono"
              value={cur.text || ""}
              onChange={(e) => setDrafts((d) => ({ ...d, [activeKey]: { ...cur, text: e.target.value } }))}
            />
          </label>
          <button type="submit" disabled={saving} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {saving ? "Speichern …" : "Speichern"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
