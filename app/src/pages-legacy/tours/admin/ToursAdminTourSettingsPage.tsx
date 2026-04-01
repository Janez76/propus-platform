import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { getToursAdminTourSettings, putToursAdminTourSettings } from "../../../api/toursAdmin";
import { useQuery } from "../../../hooks/useQuery";
import { toursAdminTourSettingsQueryKey } from "../../../lib/queryKeys";

export function ToursAdminTourSettingsPage() {
  const qk = toursAdminTourSettingsQueryKey();
  const queryFn = useCallback(() => getToursAdminTourSettings(), []);
  const { data, loading, error, refetch } = useQuery(qk, queryFn, { staleTime: 30_000 });

  const matterport = (data?.matterportStored as { tokenId?: string; hasSecret?: boolean }) || {};

  const [mailPrompt, setMailPrompt] = useState("");
  const [tokenId, setTokenId] = useState("");
  const [tokenSecret, setTokenSecret] = useState("");
  const [clearMp, setClearMp] = useState(false);
  const [localWidgets, setLocalWidgets] = useState<Record<string, boolean>>({});
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Nur auf `data` hören – abgeleitete Objekte (widgets, aiPrompt, …) erzeugen
  // bei jedem Render neue Referenzen und würden sonst einen Endlos-Loop auslösen.
  useEffect(() => {
    if (!data) return;
    const w = (data.widgets as Record<string, boolean>) || {};
    const ap = (data.aiPromptSettings as { mailSystemPrompt?: string }) || {};
    const mp = (data.matterportStored as { tokenId?: string }) || {};
    setMailPrompt(String(ap.mailSystemPrompt || ""));
    setTokenId(String(mp.tokenId || ""));
    setTokenSecret("");
    setClearMp(false);
    setLocalWidgets({ ...w });
    setSaveOk(null);
  }, [data]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveErr(null);
    setSaveOk(null);
    setSaving(true);
    try {
      await putToursAdminTourSettings({
        widgets: localWidgets,
        aiPrompt: { mailSystemPrompt: mailPrompt },
        matterport: {
          tokenId,
          tokenSecret,
          clearStored: clearMp,
        },
      });
      setSaveOk("Einstellungen gespeichert.");
      void refetch();
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  const keys = [
    ["total", "Touren gesamt"],
    ["expiringSoon", "Läuft bald ab"],
    ["awaitingPayment", "Wartet auf Zahlung"],
    ["active", "Aktiv"],
    ["declined", "Keine Verlängerung"],
    ["archived", "Archiviert"],
    ["unlinked", "Ohne Matterport"],
    ["fremdeTouren", "Fremde Touren"],
    ["invoicesOffen", "Rechnungen offen"],
    ["invoicesUeberfaellig", "Rechnungen überfällig"],
    ["invoicesBezahlt", "Rechnungen bezahlt"],
  ] as const;

  if (loading && !data) return <p className="text-sm text-[var(--text-subtle)]">Laden …</p>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--text-main)]">Tour-Manager Einstellungen</h1>
        <p className="text-sm text-[var(--text-subtle)] mt-1">
          Widgets, Matterport-API, KI-Mail-Prompt.
        </p>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {saveErr ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {saveErr}
        </div>
      ) : null}
      {saveOk ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {saveOk}
        </div>
      ) : null}

      <form onSubmit={onSave} className="space-y-6">
        <section className="surface-card-strong p-6 space-y-3">
          <h2 className="text-lg font-semibold text-[var(--text-main)]">Dashboard-Widgets</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {keys.map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!localWidgets[k]}
                  onChange={(e) => {
                    setSaveOk(null);
                    setLocalWidgets((w) => ({ ...w, [k]: e.target.checked }));
                  }}
                />
                {label}
              </label>
            ))}
          </div>
        </section>

        <section className="surface-card-strong p-6 space-y-3">
          <h2 className="text-lg font-semibold text-[var(--text-main)]">Matterport API (Model API)</h2>
          {matterport.hasSecret ? (
            <p className="text-xs text-[var(--text-subtle)]">Ein Secret ist gespeichert (leer lassen = unverändert).</p>
          ) : null}
          <label className="block text-sm">
            <span className="text-[var(--text-subtle)]">Token-ID</span>
            <input
              className="mt-1 w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm"
              value={tokenId}
              onChange={(e) => {
                setSaveOk(null);
                setTokenId(e.target.value);
              }}
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--text-subtle)]">Token-Secret</span>
            <input
              type="password"
              className="mt-1 w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm"
              value={tokenSecret}
              onChange={(e) => {
                setSaveOk(null);
                setTokenSecret(e.target.value);
              }}
              placeholder="Neu setzen …"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={clearMp}
              onChange={(e) => {
                setSaveOk(null);
                setClearMp(e.target.checked);
              }}
            />
            Gespeicherte Zugangsdaten löschen (.env greift)
          </label>
        </section>

        <section className="surface-card-strong p-6 space-y-3">
          <h2 className="text-lg font-semibold text-[var(--text-main)]">KI: System-Prompt (Mail)</h2>
          <textarea
            className="w-full min-h-[120px] rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm font-mono"
            value={mailPrompt}
            onChange={(e) => {
              setSaveOk(null);
              setMailPrompt(e.target.value);
            }}
          />
        </section>

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Speichern …" : "Speichern"}
        </button>
      </form>
    </div>
  );
}
