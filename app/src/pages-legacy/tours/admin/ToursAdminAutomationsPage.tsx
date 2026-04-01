import { useCallback, useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { getToursAdminAutomations, putToursAdminAutomations } from "../../../api/toursAdmin";
import { useQuery } from "../../../hooks/useQuery";
import { toursAdminAutomationsQueryKey } from "../../../lib/queryKeys";

export function ToursAdminAutomationsPage() {
  const qk = toursAdminAutomationsQueryKey();
  const queryFn = useCallback(() => getToursAdminAutomations(), []);
  const { data, loading, error, refetch } = useQuery(qk, queryFn, { staleTime: 30_000 });

  const [form, setForm] = useState<Record<string, unknown>>({});
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const a = data?.automationSettings as Record<string, unknown> | undefined;
    if (a) setForm({ ...a });
  }, [data]);

  function num(name: string, fallback: number) {
    const v = form[name];
    const n = parseInt(String(v), 10);
    return Number.isFinite(n) ? n : fallback;
  }

  function bool(name: string) {
    return !!form[name];
  }

  async function onSave(e: React.FormEvent) {
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
      void refetch();
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !data) return <p className="text-sm text-[var(--text-subtle)]">Laden …</p>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--text-main)]">Automationen</h1>
        <p className="text-sm text-[var(--text-subtle)] mt-1">
          Cron / Hintergrundjobs für den Tour-Manager.
        </p>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {saveErr ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {saveErr}
        </div>
      ) : null}

      <form onSubmit={onSave} className="space-y-6">
        <section className="surface-card-strong p-6 space-y-4">
          <h2 className="font-semibold text-[var(--text-main)]">Ablauf-Mails</h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!form.expiringMailEnabled}
              onChange={(e) => setForm((f) => ({ ...f, expiringMailEnabled: e.target.checked }))}
            />
            Verlängerungs-Mails aktiv
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="text-[var(--text-subtle)]">Vorlauf (Tage)</span>
              <input
                type="number"
                className="mt-1 w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm"
                value={String(form.expiringMailLeadDays ?? "")}
                onChange={(e) => setForm((f) => ({ ...f, expiringMailLeadDays: e.target.value }))}
              />
            </label>
            <label className="text-sm">
              <span className="text-[var(--text-subtle)]">Cooldown (Tage)</span>
              <input
                type="number"
                className="mt-1 w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm"
                value={String(form.expiringMailCooldownDays ?? "")}
                onChange={(e) => setForm((f) => ({ ...f, expiringMailCooldownDays: e.target.value }))}
              />
            </label>
            <label className="text-sm">
              <span className="text-[var(--text-subtle)]">Batch-Limit</span>
              <input
                type="number"
                className="mt-1 w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm"
                value={String(form.expiringMailBatchLimit ?? "")}
                onChange={(e) => setForm((f) => ({ ...f, expiringMailBatchLimit: e.target.value }))}
              />
            </label>
            <label className="text-sm">
              <span className="text-[var(--text-subtle)]">Template-Key</span>
              <input
                className="mt-1 w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm"
                value={String(form.expiringMailTemplateKey || "")}
                onChange={(e) => setForm((f) => ({ ...f, expiringMailTemplateKey: e.target.value }))}
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!form.expiringMailCreateActionLinks}
              onChange={(e) => setForm((f) => ({ ...f, expiringMailCreateActionLinks: e.target.checked }))}
            />
            Aktionslinks in Mails
          </label>
        </section>

        <section className="surface-card-strong p-6 space-y-4">
          <h2 className="font-semibold text-[var(--text-main)]">Ablauf-Policy</h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!form.expiryPolicyEnabled}
              onChange={(e) => setForm((f) => ({ ...f, expiryPolicyEnabled: e.target.checked }))}
            />
            Policy aktiv
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="text-[var(--text-subtle)]">Pending nach (Tage)</span>
              <input
                type="number"
                className="mt-1 w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm"
                value={String(form.expirySetPendingAfterDays ?? "")}
                onChange={(e) => setForm((f) => ({ ...f, expirySetPendingAfterDays: e.target.value }))}
              />
            </label>
            <label className="text-sm">
              <span className="text-[var(--text-subtle)]">Archiv nach (Tage)</span>
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
          <h2 className="font-semibold text-[var(--text-main)]">Zahlungsprüfung & Matterport</h2>
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

        <button type="submit" disabled={saving} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {saving ? "Speichern …" : "Speichern"}
        </button>
      </form>
    </div>
  );
}
