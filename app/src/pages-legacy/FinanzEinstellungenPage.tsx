import { useEffect, useState, useCallback } from "react";
import {
  Settings2, Building2, Hash, CreditCard, Mail, Phone, Wallet,
  Save, RefreshCw, AlertCircle, CheckCircle2, Info,
  ChevronDown, ChevronUp, FileText, Shield, Palette,
} from "lucide-react";
import { useAuthStore } from "../store/authStore";
import {
  getFinanzEinstellungen,
  patchFinanzEinstellungen,
} from "../api/finanzEinstellungen";
import type {
  FinanzEinstellungenData,
  NummernkreisTyp,
  DokumentTyp,
  BerechtigungKey,
  RolleTyp,
} from "../types/finanzEinstellungen";
import { FINANZ_DEFAULTS } from "../types/finanzEinstellungen";

// ─── Hilfskomponenten ────────────────────────────────────────────────────────

type TabKey = "firma" | "standards" | "nummernkreise" | "typen" | "berechtigungen" | "pdf" | "payrexx";

function SectionCard({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 hover:bg-[var(--surface-raised)] transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Icon className="h-4 w-4 text-[var(--accent)] shrink-0" />
          <span className="text-sm font-semibold text-[var(--text-main)]">{title}</span>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-[var(--text-subtle)]" />
        ) : (
          <ChevronDown className="h-4 w-4 text-[var(--text-subtle)]" />
        )}
      </button>
      {open && <div className="px-5 pb-5 pt-1 space-y-4">{children}</div>}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wide">{label}</label>
      {children}
      {hint && <p className="text-xs text-[var(--text-subtle)]">{hint}</p>}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  mono,
  icon: Icon,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  icon?: React.ElementType;
}) {
  if (Icon) {
    return (
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-subtle)]" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2 pl-9 text-sm text-[var(--text-main)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] ${mono ? "font-mono" : ""}`}
        />
      </div>
    );
  }
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-main)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] ${mono ? "font-mono" : ""}`}
    />
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <div className="relative">
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2 pr-8 text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
      />
      {suffix && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-subtle)]">
          {suffix}
        </span>
      )}
    </div>
  );
}

function Textarea({ value, onChange, rows = 3 }: { value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-main)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-y"
    />
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-4 py-3">
      <div>
        <p className="text-sm font-medium text-[var(--text-main)]">{label}</p>
        {description && <p className="text-xs text-[var(--text-subtle)] mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
          checked ? "bg-[var(--accent)]" : "bg-[var(--border-strong)]"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

// ─── Konstanten ──────────────────────────────────────────────────────────────

const NUMMERNKREIS_TYPEN: { key: NummernkreisTyp; label: string }[] = [
  { key: "offerte", label: "Offerte" },
  { key: "auftrag", label: "Auftrag" },
  { key: "rechnung", label: "Rechnung" },
  { key: "teilrechnung", label: "Teilrechnung" },
  { key: "schlussrechnung", label: "Schlussrechnung" },
  { key: "gutschrift", label: "Gutschrift" },
];

const DOKUMENT_TYPEN: { key: DokumentTyp; label: string; description: string }[] = [
  { key: "offerte", label: "Offerte", description: "Angebote erstellen und versenden" },
  { key: "auftrag", label: "Auftrag", description: "Aus Offerte konvertieren oder manuell" },
  { key: "rechnung", label: "Rechnung", description: "Direkt oder aus Auftrag" },
  { key: "teilrechnung", label: "Teilrechnung", description: "Mehrere Teilbeträge pro Auftrag" },
  { key: "gutschrift", label: "Gutschrift", description: "Stornierung oder Rückerstattung" },
  { key: "mahnungen", label: "Mahnungen", description: "Automatisch nach Zahlungsfrist" },
];

const BERECHTIGUNGEN: { key: BerechtigungKey; label: string }[] = [
  { key: "offerte_erstellen", label: "Offerte erstellen" },
  { key: "auftrag_erstellen", label: "Auftrag erstellen" },
  { key: "rechnung_erstellen", label: "Rechnung erstellen" },
  { key: "dokument_versenden", label: "Dokument versenden" },
  { key: "rabatt_vergeben", label: "Rabatt vergeben" },
  { key: "gutschrift_erstellen", label: "Gutschrift ausstellen" },
  { key: "einstellungen_aendern", label: "Einstellungen ändern" },
];

const ROLLEN: { key: RolleTyp; label: string }[] = [
  { key: "admin", label: "Admin" },
  { key: "fotograf", label: "Fotograf" },
];

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "firma", label: "Firma", icon: Building2 },
  { key: "standards", label: "Standards", icon: Settings2 },
  { key: "nummernkreise", label: "Nummernkreise", icon: Hash },
  { key: "typen", label: "Dokumenttypen", icon: FileText },
  { key: "berechtigungen", label: "Berechtigungen", icon: Shield },
  { key: "pdf", label: "PDF & Layout", icon: Palette },
  { key: "payrexx", label: "Payrexx", icon: Wallet },
];

// ─── Hauptkomponente ─────────────────────────────────────────────────────────

export function FinanzEinstellungenPage() {
  const token = useAuthStore((s) => s.token);

  const [data, setData] = useState<FinanzEinstellungenData | null>(null);
  const [draft, setDraft] = useState<FinanzEinstellungenData>(FINANZ_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("firma");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getFinanzEinstellungen(token);
      setData(res);
      setDraft(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Einstellungen konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  function update<K extends keyof FinanzEinstellungenData>(key: K, value: FinanzEinstellungenData[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const res = await patchFinanzEinstellungen(token, draft);
      setData(res);
      setDraft(res);
      setSuccess("Einstellungen erfolgreich gespeichert.");
      setTimeout(() => setSuccess(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  const isDirty = data !== null && JSON.stringify(draft) !== JSON.stringify(data);

  if (loading && !data) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] px-5 py-10 text-sm text-[var(--text-subtle)]">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Finanz-Einstellungen werden geladen…
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent)]/10">
            <Settings2 className="h-5 w-5 text-[var(--accent)]" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[var(--text-main)]">Finanzen & Dokumente</h1>
            <p className="text-xs text-[var(--text-subtle)]">
              Firmendaten, Nummernkreise, Dokumenttypen, Berechtigungen und PDF-Layout
            </p>
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

      {/* Meldungen */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {success}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-1 overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === key
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--text-subtle)] hover:text-[var(--text-main)]"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab: Firma ── */}
      {activeTab === "firma" && (
        <div className="space-y-4">
          <SectionCard title="Firmeninformationen" icon={Building2}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Firmenname">
                <TextInput value={draft.firmenname} onChange={(v) => update("firmenname", v)} placeholder="Propus GmbH" />
              </Field>
              <Field label="UID (MwSt-Nummer)" hint="z.B. CHE-424.310.597">
                <TextInput value={draft.uid ?? ""} onChange={(v) => update("uid", v || null)} placeholder="CHE-XXX.XXX.XXX" icon={Hash} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Strasse & Nr.">
                <TextInput value={draft.strasse ?? ""} onChange={(v) => update("strasse", v || null)} placeholder="Untere Roostmatt 8" />
              </Field>
              <Field label="PLZ / Ort">
                <TextInput value={draft.plzOrt ?? ""} onChange={(v) => update("plzOrt", v || null)} placeholder="6300 Zug" />
              </Field>
            </div>
          </SectionCard>

          <SectionCard title="Kontakt" icon={Phone}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="E-Mail Absender">
                <TextInput
                  value={draft.emailAbsender ?? ""}
                  onChange={(v) => update("emailAbsender", v || null)}
                  placeholder="rechnung@propus.ch"
                  icon={Mail}
                />
              </Field>
              <Field label="Telefon">
                <TextInput
                  value={draft.telefon ?? ""}
                  onChange={(v) => update("telefon", v || null)}
                  placeholder="+41 44 589 63 63"
                  icon={Phone}
                />
              </Field>
            </div>
          </SectionCard>

          <SectionCard title="Bankverbindung" icon={CreditCard}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="IBAN" hint="Format: CH13 3000 5204 1906 0401 W">
                <TextInput
                  value={draft.iban ?? ""}
                  onChange={(v) => update("iban", v || null)}
                  placeholder="CH13 3000 5204 1906 0401 W"
                  mono
                  icon={CreditCard}
                />
              </Field>
              <Field label="Bankname">
                <TextInput value={draft.bankname ?? ""} onChange={(v) => update("bankname", v || null)} placeholder="Zuger Kantonalbank" />
              </Field>
            </div>
          </SectionCard>
        </div>
      )}

      {/* ── Tab: Standards ── */}
      {activeTab === "standards" && (
        <div className="space-y-4">
          <SectionCard title="Steuer & Zahlung" icon={CreditCard}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="MwSt-Satz" hint="Schweizer Normalsatz: 8.1% (gültig ab 2024)">
                <NumberInput value={draft.mwstSatz} onChange={(v) => update("mwstSatz", v)} min={0} max={100} step={0.1} suffix="%" />
              </Field>
              <Field label="Zahlungsfrist" hint="Standard-Frist in Tagen">
                <NumberInput value={draft.zahlungsfristTage} onChange={(v) => update("zahlungsfristTage", v)} min={1} max={365} suffix="Tage" />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Währung">
                <select
                  value={draft.waehrung}
                  onChange={(e) => update("waehrung", e.target.value as "CHF" | "EUR")}
                  className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                >
                  <option value="CHF">CHF – Schweizer Franken</option>
                  <option value="EUR">EUR – Euro</option>
                </select>
              </Field>
              <Field label="Dokumentsprache">
                <select
                  value={draft.sprache}
                  onChange={(e) => update("sprache", e.target.value as "de_CH" | "en")}
                  className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                >
                  <option value="de_CH">Deutsch (CH)</option>
                  <option value="en">Englisch</option>
                </select>
              </Field>
            </div>
          </SectionCard>

          <SectionCard title="Standardtexte" icon={FileText}>
            <Field label="Standard-Notiz" hint="Wird auf Offerten und Aufträgen angezeigt">
              <Textarea value={draft.standardNotiz ?? ""} onChange={(v) => update("standardNotiz", v || null)} />
            </Field>
            <Field label="Standard-Fussnote (Rechnung)" hint="Erscheint am Ende jeder Rechnung">
              <Textarea value={draft.standardFussnote ?? ""} onChange={(v) => update("standardFussnote", v || null)} />
            </Field>
          </SectionCard>
        </div>
      )}

      {/* ── Tab: Nummernkreise ── */}
      {activeTab === "nummernkreise" && (
        <div className="space-y-4">
          <SectionCard title="Nummernkreise" icon={Hash} defaultOpen>
            <p className="text-xs text-[var(--text-subtle)] -mt-1 mb-2">
              Präfix und nächste laufende Nummer für jeden Dokumenttyp. Vorschau zeigt das resultierende Format.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {NUMMERNKREIS_TYPEN.map(({ key, label }) => {
                const nk = draft.nummernkreise[key];
                const preview = `${nk.prefix}-${new Date().getFullYear()}-${String(nk.naechste).padStart(3, "0")}`;
                return (
                  <div
                    key={key}
                    className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] p-3 space-y-2"
                  >
                    <p className="text-xs font-semibold text-[var(--accent)] uppercase tracking-wide">{label}</p>
                    <div className="flex gap-2">
                      <div className="w-20">
                        <label className="block text-[10px] text-[var(--text-subtle)] mb-0.5">Präfix</label>
                        <input
                          type="text"
                          maxLength={4}
                          value={nk.prefix}
                          onChange={(e) =>
                            update("nummernkreise", {
                              ...draft.nummernkreise,
                              [key]: { ...nk, prefix: e.target.value.toUpperCase() },
                            })
                          }
                          className="w-full rounded-md border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1.5 text-xs font-mono text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-[10px] text-[var(--text-subtle)] mb-0.5">Nächste Nr.</label>
                        <input
                          type="number"
                          min={1}
                          value={nk.naechste}
                          onChange={(e) =>
                            update("nummernkreise", {
                              ...draft.nummernkreise,
                              [key]: { ...nk, naechste: parseInt(e.target.value) || 1 },
                            })
                          }
                          className="w-full rounded-md border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-[var(--text-subtle)] font-mono">→ {preview}</p>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </div>
      )}

      {/* ── Tab: Dokumenttypen ── */}
      {activeTab === "typen" && (
        <div className="space-y-4">
          <SectionCard title="Aktive Dokumenttypen" icon={FileText} defaultOpen>
            <p className="text-xs text-[var(--text-subtle)] -mt-1 mb-2">
              Bestimmt welche Dokumenttypen im System verfügbar sind.
            </p>
            <div className="space-y-2">
              {DOKUMENT_TYPEN.map(({ key, label, description }) => (
                <ToggleRow
                  key={key}
                  label={label}
                  description={description}
                  checked={draft.aktiveTypen[key] ?? false}
                  onChange={(v) => update("aktiveTypen", { ...draft.aktiveTypen, [key]: v })}
                />
              ))}
            </div>
          </SectionCard>
        </div>
      )}

      {/* ── Tab: Berechtigungen ── */}
      {activeTab === "berechtigungen" && (
        <div className="space-y-4">
          <SectionCard title="Berechtigungsmatrix" icon={Shield} defaultOpen>
            <p className="text-xs text-[var(--text-subtle)] -mt-1 mb-3">
              Super Admin ist immer vollständig berechtigt. Hier werden Rechte für Admin und Fotograf konfiguriert.
            </p>
            <div className="rounded-lg border border-[var(--border-soft)] overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr] bg-[var(--surface-raised)]">
                {["Aktion", "Super Admin", "Admin", "Fotograf"].map((h, i) => (
                  <div
                    key={h}
                    className={`px-3 py-2.5 text-xs font-semibold text-[var(--accent)] uppercase tracking-wide border-b border-[var(--border-soft)] ${
                      i === 0 ? "text-left" : "text-center"
                    }`}
                  >
                    {h}
                  </div>
                ))}
              </div>
              {/* Rows */}
              {BERECHTIGUNGEN.map(({ key, label }, i) => (
                <div
                  key={key}
                  className={`grid grid-cols-[1.6fr_1fr_1fr_1fr] ${
                    i < BERECHTIGUNGEN.length - 1 ? "border-b border-[var(--border-soft)]" : ""
                  }`}
                >
                  <div className="px-3 py-2.5 text-sm text-[var(--text-main)] border-r border-[var(--border-soft)]">
                    {label}
                  </div>
                  {/* Super Admin — always checked, disabled */}
                  <div className="flex items-center justify-center border-r border-[var(--border-soft)]">
                    <input type="checkbox" checked disabled className="h-4 w-4 accent-[var(--accent)] opacity-50" />
                  </div>
                  {/* Admin & Fotograf */}
                  {ROLLEN.map(({ key: rolle }) => (
                    <div key={rolle} className="flex items-center justify-center border-r border-[var(--border-soft)] last:border-r-0">
                      <input
                        type="checkbox"
                        checked={draft.berechtigungen[key]?.[rolle] ?? false}
                        onChange={(e) =>
                          update("berechtigungen", {
                            ...draft.berechtigungen,
                            [key]: { ...draft.berechtigungen[key], [rolle]: e.target.checked },
                          })
                        }
                        className="h-4 w-4 accent-[var(--accent)] cursor-pointer"
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      )}

      {/* ── Tab: PDF & Layout ── */}
      {activeTab === "pdf" && (
        <div className="space-y-4">
          <SectionCard title="Branding" icon={Palette}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Logo URL" hint="Wird im PDF-Header angezeigt">
                <TextInput value={draft.logoUrl ?? ""} onChange={(v) => update("logoUrl", v || null)} placeholder="https://..." />
              </Field>
              <Field label="Akzentfarbe" hint="Hex-Farbwert für PDF-Akzente">
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={draft.akzentfarbe}
                    onChange={(e) => update("akzentfarbe", e.target.value)}
                    className="h-9 w-9 rounded border border-[var(--border-soft)] cursor-pointer"
                  />
                  <input
                    type="text"
                    value={draft.akzentfarbe}
                    onChange={(e) => update("akzentfarbe", e.target.value)}
                    className="flex-1 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-mono text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  />
                </div>
              </Field>
            </div>
          </SectionCard>

          <SectionCard title="PDF-Optionen" icon={FileText}>
            <div className="space-y-2">
              <ToggleRow
                label="QR-Code auf Rechnung"
                description="Swiss QR Bill Standard — automatischer QR-Einzahlungsschein"
                checked={draft.qrCodeAktiv}
                onChange={(v) => update("qrCodeAktiv", v)}
              />
              <ToggleRow
                label="Unterschriftsfeld"
                description="Platzhalter für Unterschrift auf Aufträgen und Offerten"
                checked={draft.unterschriftsfeld}
                onChange={(v) => update("unterschriftsfeld", v)}
              />
              <ToggleRow
                label="Fotograf auf Dokument"
                description="Name des zugewiesenen Fotografen auf dem Dokument anzeigen"
                checked={draft.fotografAufDokument}
                onChange={(v) => update("fotografAufDokument", v)}
              />
            </div>
          </SectionCard>
        </div>
      )}

      {/* ── Tab: Payrexx ── */}
      {activeTab === "payrexx" && (
        <div className="space-y-4">
          <SectionCard title="Payrexx Online-Zahlung" icon={Wallet}>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2 dark:border-amber-800/40 dark:bg-amber-950/20">
              <Info className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Die Payrexx-Verbindung (Instance & API-Secret) wird über Umgebungsvariablen auf dem Server konfiguriert
                (<code className="rounded bg-[var(--surface)] px-1 font-mono">PAYREXX_INSTANCE</code>,{" "}
                <code className="rounded bg-[var(--surface)] px-1 font-mono">PAYREXX_API_SECRET</code>).
                Hier werden nur die Funktions-Einstellungen verwaltet.
              </p>
            </div>
            <div className="space-y-2">
              <ToggleRow
                label="Online-Zahlung aktivieren"
                description="Payrexx-Button in Rechnungs-E-Mails und PDF anzeigen"
                checked={draft.payrexxAktiv}
                onChange={(v) => update("payrexxAktiv", v)}
              />
            </div>
          </SectionCard>

          <SectionCard title="Zahlungsmethoden" icon={CreditCard}>
            <p className="text-xs text-[var(--text-subtle)] -mt-1 mb-2">
              Welche Zahlungsmethoden sollen Kunden im Payrexx-Checkout angeboten werden?
            </p>
            <div className="space-y-2">
              <ToggleRow
                label="Kreditkarte"
                description="Visa / Mastercard"
                checked={draft.payrexxKarte}
                onChange={(v) => update("payrexxKarte", v)}
              />
              <ToggleRow
                label="TWINT"
                description="Schweizer Mobile Payment"
                checked={draft.payrexxTwint}
                onChange={(v) => update("payrexxTwint", v)}
              />
              <ToggleRow
                label="PostFinance"
                description="PostFinance Card & E-Finance"
                checked={draft.payrexxPostfinance}
                onChange={(v) => update("payrexxPostfinance", v)}
              />
              <ToggleRow
                label="PayPal"
                description="Internationale Zahlungen"
                checked={draft.payrexxPaypal}
                onChange={(v) => update("payrexxPaypal", v)}
              />
            </div>
          </SectionCard>
        </div>
      )}

      {/* Speichern-Leiste */}
      <div className="sticky bottom-4 flex items-center gap-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] px-5 py-3 shadow-lg">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !isDirty}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Wird gespeichert…
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Einstellungen speichern
            </>
          )}
        </button>
        {isDirty && <span className="text-xs text-amber-600 dark:text-amber-400">Ungespeicherte Änderungen</span>}
        {!isDirty && success && <span className="text-xs text-emerald-600 dark:text-emerald-400">{success}</span>}
      </div>
    </div>
  );
}
