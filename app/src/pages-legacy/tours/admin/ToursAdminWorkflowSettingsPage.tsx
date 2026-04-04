import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import {
  getToursAdminAutomations,
  putToursAdminAutomations,
  getToursAdminEmailTemplatesBundle,
  putToursAdminEmailTemplates,
  getToursAdminConfirmationPending,
  toursAdminPost,
} from "../../../api/toursAdmin";
import { useQuery } from "../../../hooks/useQuery";

type TabId = "workflow" | "templates" | "cleanup";

type Template = { subject?: string; html?: string; text?: string; name?: string; description?: string };

const TAB_LABELS: Record<TabId, string> = {
  workflow: "Workflow",
  templates: "E-Mail-Templates",
  cleanup: "Bereinigungslauf",
};

export function ToursAdminWorkflowSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = (searchParams.get("tab") || "workflow").toLowerCase();
  const activeTab: TabId =
    tabParam === "templates" || tabParam === "cleanup" ? (tabParam as TabId) : "workflow";

  const setTab = (t: TabId) => {
    setSearchParams(t === "workflow" ? {} : { tab: t });
  };

  const autoQk = "toursAdmin:workflow:automations";
  const autoFn = useCallback(() => getToursAdminAutomations(), []);
  const { data: autoData, loading: autoLoading, error: autoError, refetch: refetchAuto } = useQuery(autoQk, autoFn, {
    staleTime: 30_000,
  });

  const [form, setForm] = useState<Record<string, unknown>>({});
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const a = autoData?.automationSettings as Record<string, unknown> | undefined;
    if (a) setForm({ ...a });
  }, [autoData]);

  function num(name: string, fallback: number) {
    const v = form[name];
    const n = parseInt(String(v), 10);
    return Number.isFinite(n) ? n : fallback;
  }

  function bool(name: string) {
    return !!form[name];
  }

  async function onSaveAutomations(e: React.FormEvent) {
    e.preventDefault();
    setSaveErr(null);
    setSaving(true);
    try {
      await putToursAdminAutomations({
        expiringMailEnabled: bool("expiringMailEnabled"),
        expiringMailLeadDays: num("expiringMailLeadDays", 30),
        expiringMailTemplateKey: String(form.expiringMailTemplateKey || "renewal_request"),
        expiringMailCooldownDays: num("expiringMailCooldownDays", 14),
        expiringMailBatchLimit: num("expiringMailBatchLimit", 50),
        expiringMailCreateActionLinks: bool("expiringMailCreateActionLinks"),
        expiryPolicyEnabled: bool("expiryPolicyEnabled"),
        expirySetPendingAfterDays: num("expirySetPendingAfterDays", 0),
        expiryLockMatterportOnPending: bool("expiryLockMatterportOnPending"),
        expiryArchiveAfterDays: num("expiryArchiveAfterDays", 0),
        paymentCheckEnabled: bool("paymentCheckEnabled"),
        paymentCheckBatchLimit: num("paymentCheckBatchLimit", 250),
        matterportAutoLinkEnabled: bool("matterportAutoLinkEnabled"),
        matterportAutoLinkBatchLimit: num("matterportAutoLinkBatchLimit", 500),
        matterportStatusSyncEnabled: bool("matterportStatusSyncEnabled"),
        matterportStatusSyncBatchLimit: num("matterportStatusSyncBatchLimit", 500),
      });
      void refetchAuto();
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSaving(false);
    }
  }

  const tmplQk = "toursAdmin:workflow:templates";
  const tmplFn = useCallback(() => getToursAdminEmailTemplatesBundle(), []);
  const { data: tmplData, loading: tmplLoading, error: tmplError, refetch: refetchTmpl } = useQuery(
    tmplQk,
    tmplFn,
    { staleTime: 60_000, enabled: activeTab === "templates" },
  );

  const [activeKey, setActiveKey] = useState<string>("");
  const [drafts, setDrafts] = useState<Record<string, Template>>({});
  const [tmplSaveErr, setTmplSaveErr] = useState<string | null>(null);
  const [tmplSaving, setTmplSaving] = useState(false);

  const templates = tmplData?.templates as Record<string, Template> | undefined;
  const defaults = tmplData?.defaultTemplates as Record<string, Template> | undefined;
  const keys = useMemo(() => Object.keys(defaults ?? {}).sort(), [defaults]);

  useEffect(() => {
    if (!keys.length) return;
    setActiveKey((prev) => (prev && keys.includes(prev) ? prev : keys[0]));
  }, [keys]);

  useEffect(() => {
    if (!tmplData || !keys.length || !defaults) return;
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
  }, [tmplData, keys, templates, defaults]);

  async function onSaveTemplates(e: React.FormEvent) {
    e.preventDefault();
    setTmplSaveErr(null);
    setTmplSaving(true);
    try {
      await putToursAdminEmailTemplates(drafts);
      void refetchTmpl();
    } catch (err) {
      setTmplSaveErr(err instanceof Error ? err.message : "Fehler");
    } finally {
      setTmplSaving(false);
    }
  }

  const cur = activeKey ? drafts[activeKey] : null;
  const meta = activeKey && defaults ? defaults[activeKey] : null;

  const cleanQk = "toursAdmin:workflow:cleanup";
  const cleanFn = useCallback(() => getToursAdminConfirmationPending(), []);
  const {
    data: cleanData,
    loading: cleanLoading,
    error: cleanError,
    refetch: refetchClean,
  } = useQuery(cleanQk, cleanFn, { staleTime: 15_000, enabled: activeTab === "cleanup" });

  const pendingTours = (cleanData?.tours as Record<string, unknown>[]) ?? [];
  const [cleanMsg, setCleanMsg] = useState<string | null>(null);
  const [cleanBusy, setCleanBusy] = useState(false);

  async function runCleanupDryRun() {
    setCleanBusy(true);
    setCleanMsg(null);
    try {
      const r = (await toursAdminPost("/run-confirmation-batch", {})) as {
        count?: number;
        message?: string;
      };
      setCleanMsg(`Dry-Run: ${r.count ?? 0} Tour(en) — ${r.message || "OK"}`);
      void refetchClean();
    } catch (e) {
      setCleanMsg(e instanceof Error ? e.message : "Fehler");
    } finally {
      setCleanBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--text-main)]">Workflow-Einstellungen</h1>
        <p className="text-sm text-[var(--text-subtle)] mt-1">
          Tour-Ablauf, Reminder-Cron, Archivierung, E-Mail-Vorlagen und Bereinigungslauf (Bestätigung erforderlich).
        </p>
        <p className="text-xs text-[var(--text-subtle)] mt-2">
          Preise Verlängerung / Reaktivierung:{" "}
          <Link to="/settings/invoice-template" className="text-[var(--accent)] hover:underline">
            Rechnungsvorlage &amp; Zahlung
          </Link>{" "}
          (Hosting-Preise, QR-Bill).
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-[var(--border-soft)] pb-3">
        {(Object.keys(TAB_LABELS) as TabId[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              activeTab === t ? "bg-[var(--accent)] text-white" : "border border-[var(--border-soft)] text-[var(--text-main)]"
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {activeTab === "workflow" ? (
        <>
          {autoError ? <p className="text-sm text-red-600">{autoError}</p> : null}
          {saveErr ? (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {saveErr}
            </div>
          ) : null}

          {autoLoading && !autoData ? (
            <p className="text-sm text-[var(--text-subtle)]">Laden …</p>
          ) : (
            <form onSubmit={onSaveAutomations} className="space-y-6">
              <section className="surface-card-strong p-6 space-y-4">
                <h2 className="font-semibold text-[var(--text-main)]">Reminder (Cron)</h2>
                <p className="text-sm text-[var(--text-subtle)] leading-relaxed">
                  Der Cron <code className="rounded bg-[var(--surface)] px-1 font-mono text-xs">POST /cron/send-expiring-soon</code>{" "}
                  nutzt drei feste Fenster: <strong>30</strong>, <strong>10</strong> und <strong>3</strong> Tage vor{" "}
                  <code className="font-mono text-xs">term_end_date</code>. Stufe 1–2: Template{" "}
                  <code className="font-mono text-xs">renewal_request</code>, Stufe 3:{" "}
                  <code className="font-mono text-xs">renewal_request_final</code>.
                </p>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!form.expiringMailEnabled}
                    onChange={(e) => setForm((f) => ({ ...f, expiringMailEnabled: e.target.checked }))}
                  />
                  Verlängerungs-Mails aktiv (Standard: aus)
                </label>
                <label className="text-sm block max-w-xs">
                  <span className="text-[var(--text-subtle)]">Batch-Limit pro Cron-Lauf (gesamt)</span>
                  <input
                    type="number"
                    className="mt-1 w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm"
                    value={String(form.expiringMailBatchLimit ?? "")}
                    onChange={(e) => setForm((f) => ({ ...f, expiringMailBatchLimit: e.target.value }))}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!form.expiringMailCreateActionLinks}
                    onChange={(e) => setForm((f) => ({ ...f, expiringMailCreateActionLinks: e.target.checked }))}
                  />
                  Ja-/Nein-Aktionslinks in Mails
                </label>
                <p className="text-xs text-[var(--text-subtle)]">
                  Die Felder „Vorlauf“, „Cooldown“ und „Template-Key“ werden vom neuen Drei-Stufen-Cron nicht mehr verwendet;
                  sie bleiben in den Einstellungen für Kompatibilität erhalten (optional).
                </p>
                <div className="grid gap-3 sm:grid-cols-2 opacity-70">
                  <label className="text-sm">
                    <span className="text-[var(--text-subtle)]">Vorlauf (Legacy, Tage)</span>
                    <input
                      type="number"
                      className="mt-1 w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm"
                      value={String(form.expiringMailLeadDays ?? "")}
                      onChange={(e) => setForm((f) => ({ ...f, expiringMailLeadDays: e.target.value }))}
                    />
                  </label>
                  <label className="text-sm">
                    <span className="text-[var(--text-subtle)]">Cooldown (Legacy, Tage)</span>
                    <input
                      type="number"
                      className="mt-1 w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm"
                      value={String(form.expiringMailCooldownDays ?? "")}
                      onChange={(e) => setForm((f) => ({ ...f, expiringMailCooldownDays: e.target.value }))}
                    />
                  </label>
                  <label className="text-sm sm:col-span-2">
                    <span className="text-[var(--text-subtle)]">Template-Key (Legacy)</span>
                    <input
                      className="mt-1 w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm"
                      value={String(form.expiringMailTemplateKey || "")}
                      onChange={(e) => setForm((f) => ({ ...f, expiringMailTemplateKey: e.target.value }))}
                    />
                  </label>
                </div>
              </section>

              <section className="surface-card-strong p-6 space-y-4">
                <h2 className="font-semibold text-[var(--text-main)]">Ablauf-Policy</h2>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!form.expiryPolicyEnabled}
                    onChange={(e) => setForm((f) => ({ ...f, expiryPolicyEnabled: e.target.checked }))}
                  />
                  Policy aktiv (Cron <code className="font-mono text-xs">archive-expired</code>)
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">
                    <span className="text-[var(--text-subtle)]">Pending nach (Tage nach Ablauf)</span>
                    <input
                      type="number"
                      className="mt-1 w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm"
                      value={String(form.expirySetPendingAfterDays ?? "")}
                      onChange={(e) => setForm((f) => ({ ...f, expirySetPendingAfterDays: e.target.value }))}
                    />
                  </label>
                  <label className="text-sm">
                    <span className="text-[var(--text-subtle)]">Archiv nach (Tage nach Ablauf)</span>
                    <input
                      type="number"
                      className="mt-1 w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm"
                      value={String(form.expiryArchiveAfterDays ?? "")}
                      onChange={(e) => setForm((f) => ({ ...f, expiryArchiveAfterDays: e.target.value }))}
                    />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!form.expiryLockMatterportOnPending}
                    onChange={(e) => setForm((f) => ({ ...f, expiryLockMatterportOnPending: e.target.checked }))}
                  />
                  Matterport bei Pending sperren
                </label>
              </section>

              <section className="surface-card-strong p-6 space-y-4">
                <h2 className="font-semibold text-[var(--text-main)]">Zahlungsprüfung &amp; Matterport</h2>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!form.paymentCheckEnabled}
                    onChange={(e) => setForm((f) => ({ ...f, paymentCheckEnabled: e.target.checked }))}
                  />
                  Zahlungsprüfung
                </label>
                <label className="text-sm block max-w-xs">
                  <span className="text-[var(--text-subtle)]">Zahlung Batch-Limit</span>
                  <input
                    type="number"
                    className="mt-1 w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm"
                    value={String(form.paymentCheckBatchLimit ?? "")}
                    onChange={(e) => setForm((f) => ({ ...f, paymentCheckBatchLimit: e.target.value }))}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!form.matterportAutoLinkEnabled}
                    onChange={(e) => setForm((f) => ({ ...f, matterportAutoLinkEnabled: e.target.checked }))}
                  />
                  Matterport Auto-Link
                </label>
                <label className="text-sm block max-w-xs">
                  <span className="text-[var(--text-subtle)]">Auto-Link Batch</span>
                  <input
                    type="number"
                    className="mt-1 w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm"
                    value={String(form.matterportAutoLinkBatchLimit ?? "")}
                    onChange={(e) => setForm((f) => ({ ...f, matterportAutoLinkBatchLimit: e.target.value }))}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!form.matterportStatusSyncEnabled}
                    onChange={(e) => setForm((f) => ({ ...f, matterportStatusSyncEnabled: e.target.checked }))}
                  />
                  Matterport Status-Sync
                </label>
                <label className="text-sm block max-w-xs">
                  <span className="text-[var(--text-subtle)]">Status-Sync Batch</span>
                  <input
                    type="number"
                    className="mt-1 w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm"
                    value={String(form.matterportStatusSyncBatchLimit ?? "")}
                    onChange={(e) => setForm((f) => ({ ...f, matterportStatusSyncBatchLimit: e.target.value }))}
                  />
                </label>
              </section>

              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? "Speichern …" : "Speichern"}
              </button>
            </form>
          )}
        </>
      ) : null}

      {activeTab === "templates" ? (
        <>
          {tmplError ? <p className="text-sm text-red-600">{tmplError}</p> : null}
          {tmplSaveErr ? (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {tmplSaveErr}
            </div>
          ) : null}
          {tmplLoading && !tmplData ? (
            <p className="text-sm text-[var(--text-subtle)]">Laden …</p>
          ) : (
            <>
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
                <form onSubmit={onSaveTemplates} className="space-y-4">
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
                  <button
                    type="submit"
                    disabled={tmplSaving}
                    className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {tmplSaving ? "Speichern …" : "Speichern"}
                  </button>
                </form>
              ) : null}
            </>
          )}
        </>
      ) : null}

      {activeTab === "cleanup" ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
            E-Mail-Versand für <code className="font-mono text-xs">tour_confirmation_request</code> ist noch nicht angebunden —
            der Lauf protokolliert nur einen Dry-Run.
          </div>
          {cleanError ? <p className="text-sm text-red-600">{cleanError}</p> : null}
          {cleanMsg ? <p className="text-sm text-[var(--text-main)]">{cleanMsg}</p> : null}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={cleanBusy}
              onClick={() => void runCleanupDryRun()}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {cleanBusy ? "…" : "Bereinigungslauf (Dry-Run)"}
            </button>
            <span className="text-sm text-[var(--text-subtle)]">{pendingTours.length} Tour(en) mit „Bestätigung erforderlich“</span>
          </div>
          {cleanLoading && !cleanData ? (
            <p className="text-sm text-[var(--text-subtle)]">Laden …</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-[var(--border-soft)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-soft)] bg-[var(--surface)] text-left">
                    <th className="px-3 py-2 font-medium">ID</th>
                    <th className="px-3 py-2 font-medium">Objekt</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Ablauf</th>
                    <th className="px-3 py-2 font-medium">Bestät. gesendet</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingTours.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-[var(--text-subtle)]">
                        Keine Touren markiert.
                      </td>
                    </tr>
                  ) : (
                    pendingTours.map((row) => (
                      <tr key={String(row.id)} className="border-b border-[var(--border-soft)]">
                        <td className="px-3 py-2 font-mono">{String(row.id)}</td>
                        <td className="px-3 py-2">
                          {String(row.object_label || row.bezeichnung || "—")}
                        </td>
                        <td className="px-3 py-2">{String(row.status || "—")}</td>
                        <td className="px-3 py-2">
                          {String(row.term_end_date || row.ablaufdatum || "—")}
                        </td>
                        <td className="px-3 py-2">
                          {row.confirmation_sent_at ? String(row.confirmation_sent_at) : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
