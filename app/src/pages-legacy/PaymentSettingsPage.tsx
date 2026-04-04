import { useEffect, useState } from "react";
import { CreditCard, CheckCircle2, XCircle, Percent, Building2, RefreshCw, Save, AlertCircle, Info } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import {
  getPaymentSettings,
  patchPaymentSettings,
  type PaymentSettingsData,
} from "../api/paymentSettings";

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function SettingCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-[var(--text-main)]">{title}</h3>
        {description && <p className="mt-1 text-xs text-[var(--text-subtle)] leading-relaxed">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function StatusBadge({ ok, labelOk, labelNot }: { ok: boolean; labelOk: string; labelNot: string }) {
  return ok ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
      <CheckCircle2 className="h-3.5 w-3.5" />
      {labelOk}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 dark:bg-red-950/30 dark:text-red-300">
      <XCircle className="h-3.5 w-3.5" />
      {labelNot}
    </span>
  );
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export function PaymentSettingsPage() {
  const token = useAuthStore((s) => s.token);

  const [data, setData] = useState<PaymentSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Formular-State
  const [vatPercent, setVatPercent] = useState<string>("8.1");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await getPaymentSettings(token);
      setData(res);
      setVatPercent(String(res.vatPercent));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Einstellungen konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => {});
  }, [token]);

  async function handleSave() {
    setError(null);
    setSuccess(null);
    const vat = Number(vatPercent);
    if (!Number.isFinite(vat) || vat <= 0 || vat > 100) {
      setError("MwSt-Satz muss zwischen 0 und 100% liegen");
      return;
    }
    setSaving(true);
    try {
      const res = await patchPaymentSettings(token, {
        vatPercent: vat,
      });
      setData(res);
      setVatPercent(String(res.vatPercent));
      setSuccess("Einstellungen erfolgreich gespeichert.");
      setTimeout(() => setSuccess(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  const isDirty =
    data !== null &&
    String(vatPercent) !== String(data.vatPercent);
  const missingPayrexxVars = data?.payrexxMissingVars ?? [];
  const webhookReady = (data?.payrexxWebhookSecretConfigured ?? false) || (data?.payrexxApiSecretConfigured ?? false);
  const payrexxStatusText = data?.payrexxConfigured
    ? `Konfiguriert als ${data.payrexxInstance}`
    : missingPayrexxVars.length > 0
      ? `Fehlt: ${missingPayrexxVars.join(", ")}`
      : "Payrexx ist noch nicht vollständig konfiguriert";

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent)]/10">
            <CreditCard className="h-5 w-5 text-[var(--accent)]" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[var(--text-main)]">Zahlungseinstellungen</h1>
            <p className="text-xs text-[var(--text-subtle)]">Payrexx-Integration und MwSt-Satz</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => load()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] px-3 py-1.5 text-xs text-[var(--text-subtle)] hover:text-[var(--text-main)] disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Aktualisieren
        </button>
      </div>

      {/* Fehler */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Erfolg */}
      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {success}
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center gap-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] px-5 py-8 text-sm text-[var(--text-subtle)]">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Einstellungen werden geladen…
        </div>
      ) : (
        <>
          {/* ── Payrexx ── */}
          <SettingCard
            title="Payrexx Online-Zahlung"
            description="Payrexx ist der Zahlungsdienstleister für Online-Zahlungen (Kreditkarte, TWINT, etc.). Die Konfiguration erfolgt über Umgebungsvariablen auf dem Server."
          >
            <div className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-4 py-3">
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-[var(--text-subtle)] shrink-0" />
                <div>
                  <p className="text-sm font-medium text-[var(--text-main)]">Payrexx-Instanz</p>
                  <p className="text-xs text-[var(--text-subtle)] mt-0.5">
                    {data?.payrexxConfigured && data.payrexxInstance ? (
                      <>Konfiguriert als <code className="rounded bg-[var(--surface)] px-1 font-mono text-xs">{data.payrexxInstance}</code></>
                    ) : (
                      payrexxStatusText
                    )}
                  </p>
                </div>
              </div>
              <StatusBadge
                ok={data?.payrexxConfigured ?? false}
                labelOk="Aktiv"
                labelNot="Nicht konfiguriert"
              />
            </div>

            <div className="rounded-lg border border-[var(--border-soft)]/60 bg-[var(--surface-raised)]/40 px-4 py-3 space-y-1.5">
              <div className="flex items-start gap-2 text-xs text-[var(--text-subtle)]">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p>Folgende Umgebungsvariablen müssen auf dem VPS in der <code className="rounded bg-[var(--surface)] px-1 font-mono">.env.vps</code> oder optional in <code className="rounded bg-[var(--surface)] px-1 font-mono">.env.vps.secrets</code> (nur Server, wird bei Deploy nicht überschrieben) gesetzt sein:</p>
                  <ul className="space-y-0.5 pl-2">
                    <li><code className="rounded bg-[var(--surface)] px-1 font-mono">PAYREXX_INSTANCE</code> — Instanzname (z.B. <code className="font-mono">propus</code>)</li>
                    <li><code className="rounded bg-[var(--surface)] px-1 font-mono">PAYREXX_API_SECRET</code> — API-Secret aus dem Payrexx-Dashboard</li>
                    <li><code className="rounded bg-[var(--surface)] px-1 font-mono">PAYREXX_WEBHOOK_SECRET</code> — Webhook-Signing-Key (optional, Fallback auf API-Secret)</li>
                  </ul>
                  {missingPayrexxVars.length > 0 && (
                    <p className="mt-1 text-amber-600 dark:text-amber-400">
                      Aktuell fehlen im laufenden Container: <code className="rounded bg-[var(--surface)] px-1 font-mono">{missingPayrexxVars.join(", ")}</code>
                    </p>
                  )}
                  <p className="mt-1">Nach einer Änderung den `platform`-Container mit `docker compose ... up -d --force-recreate platform` neu erstellen.</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 text-xs">
              {[
                { label: "Online-Zahlung", ok: data?.payrexxConfigured ?? false, hint: "Aktiviert Payrexx-Checkout für Kunden" },
                { label: "API-Secret", ok: data?.payrexxApiSecretConfigured ?? false, hint: "Authentifiziert Requests gegen die Payrexx-API" },
                { label: "Webhook empfangen", ok: webhookReady, hint: "Zahlungsbestätigungen werden verarbeitet" },
              ].map(({ label, ok, hint }) => (
                <div
                  key={label}
                  className={`rounded-lg border px-3 py-2.5 ${ok ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20" : "border-[var(--border-soft)] bg-[var(--surface-raised)]"}`}
                >
                  <div className="flex items-center gap-1.5 font-medium text-[var(--text-main)]">
                    {ok
                      ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      : <XCircle className="h-3.5 w-3.5 text-[var(--text-subtle)]" />
                    }
                    {label}
                  </div>
                  <p className="mt-1 text-[var(--text-subtle)]">{hint}</p>
                </div>
              ))}
            </div>
          </SettingCard>

          {/* ── MwSt ── */}
          <SettingCard
            title="Mehrwertsteuer (MwSt)"
            description="Der MwSt-Satz wird auf alle Rechnungen angewendet, die über das Kunden-Portal ausgestellt werden (Verlängerungen, Reaktivierungen, Grundriss-Bestellungen)."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-main)]">
                  <Percent className="h-4 w-4 text-[var(--text-subtle)]" />
                  MwSt-Satz
                </span>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={vatPercent}
                    onChange={(e) => setVatPercent(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2 pr-8 text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-subtle)]">%</span>
                </div>
                <p className="text-xs text-[var(--text-subtle)]">
                  Schweizer Normalsatz: 8.1% (gültig ab 2024)
                </p>
              </label>

              <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-4 py-3 space-y-2">
                <p className="text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wide">Vorschau</p>
                <div className="space-y-1 text-sm">
                  {[49, 98, 147].map((net) => {
                    const vat = Number(vatPercent);
                    const raw = Number.isFinite(vat) ? net * (1 + vat / 100) : net;
                    const gross = Math.round(raw / 0.05) * 0.05;
                    return (
                      <div key={net} className="flex justify-between text-[var(--text-main)]">
                        <span className="text-[var(--text-subtle)]">CHF {net}.00 netto</span>
                        <span className="font-semibold">→ CHF {gross.toFixed(2)} brutto</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </SettingCard>

          {/* Speichern */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !isDirty}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <><RefreshCw className="h-4 w-4 animate-spin" />Wird gespeichert…</>
              ) : (
                <><Save className="h-4 w-4" />Einstellungen speichern</>
              )}
            </button>
            {isDirty && (
              <span className="text-xs text-amber-600 dark:text-amber-400">Ungespeicherte Änderungen</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
