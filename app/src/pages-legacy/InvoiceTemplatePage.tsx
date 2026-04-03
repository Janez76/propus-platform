import { useEffect, useState, useCallback } from "react";
import {
  FileText, Building2, Mail, Eye, Save, RefreshCw,
  AlertCircle, CheckCircle2, RotateCcw, ChevronDown, ChevronUp,
  Info, CreditCard, Phone, Globe, Hash,
} from "lucide-react";
import { useAuthStore } from "../store/authStore";
import {
  getInvoiceTemplate,
  patchInvoiceTemplate,
  type InvoiceCreditor,
  type InvoiceEmailTemplate,
} from "../api/invoiceTemplate";

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

type TabKey = "creditor" | "email" | "preview";

function SectionCard({ title, icon: Icon, children, defaultOpen = true }: {
  title: string; icon: React.ElementType; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 hover:bg-[var(--surface-raised)] transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Icon className="h-4 w-4 text-[var(--accent)] shrink-0" />
          <span className="text-sm font-semibold text-[var(--text-main)]">{title}</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-[var(--text-subtle)]" /> : <ChevronDown className="h-4 w-4 text-[var(--text-subtle)]" />}
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

function TextInput({ value, onChange, placeholder, mono }: {
  value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-main)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] ${mono ? "font-mono" : ""}`}
    />
  );
}

function Textarea({ value, onChange, rows = 4, mono }: {
  value: string; onChange: (v: string) => void; rows?: number; mono?: boolean;
}) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      rows={rows}
      className={`w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-main)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-y ${mono ? "font-mono text-xs" : ""}`}
    />
  );
}

// ─── Vorschau-Komponente ──────────────────────────────────────────────────────

function InvoicePreview({ creditor, emailHtml }: { creditor: InvoiceCreditor; emailHtml: string }) {
  const PROPUS_GOLD = "#B68E20";
  const PROPUS_DARK = "#1C1C1C";

  const sampleData = {
    invLabel: "R-2024-001",
    invoiceDate: "01.01.2025",
    customerName: "Muster AG – Max Mustermann",
    customerEmail: "max.mustermann@muster.ch",
    tourLabel: "Musterstrasse 12, 8001 Zürich",
    tourAddress: "Musterstrasse 12, 8001 Zürich",
    amount: "106.97",
    amountNet: "98.95",
    amountVat: "8.02",
    vatPercent: 8.1,
    billingPeriodLabel: "01.01.2025 bis 30.06.2025",
    bezeichnung: "Virtueller Rundgang – Verlängerung (6 Monate)",
    qrReferenceFormatted: "00 00000 00000 00000 00000 00001",
    creditorIbanFormatted: creditor.iban || "CH13 3000 5204 1906 0401 W",
    paymentDue: "15.01.2025",
  };

  return (
    <div className="space-y-6">
      {/* PDF-Vorschau */}
      <div>
        <h4 className="text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wide mb-3">PDF-Rechnung Vorschau</h4>
        <div
          style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            background: "#fff",
            borderRadius: 4,
            overflow: "hidden",
            boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
            fontSize: 13,
            color: "#1C1C1C",
            maxWidth: 720,
          }}
        >
          {/* Header */}
          <div style={{ background: PROPUS_DARK, color: "#fff", padding: "18px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: "1.05rem", fontWeight: 700, color: PROPUS_GOLD }}>{creditor.name || "Propus GmbH"}</div>
              <div style={{ fontSize: "0.72rem", color: "#9CA3AF", marginTop: 2 }}>{creditor.email} · {creditor.website}</div>
            </div>
            <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "1.5px", border: `1.5px solid ${PROPUS_GOLD}`, color: PROPUS_GOLD, padding: "4px 12px", borderRadius: 2 }}>RECHNUNG</div>
          </div>

          {/* Hero */}
          <div style={{ padding: "24px 32px 16px", borderBottom: "1px solid #F0EFED" }}>
            <div style={{ fontSize: "1.4rem", fontWeight: 800, color: PROPUS_DARK }}>Rechnung</div>
            <div style={{ fontSize: "0.8rem", color: "#6B7280", marginTop: 4 }}>{sampleData.invLabel} · {sampleData.invoiceDate}</div>
          </div>

          {/* Parteien */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid #F0EFED" }}>
            <div style={{ padding: "16px 32px" }}>
              <div style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: PROPUS_GOLD, marginBottom: 6 }}>Rechnungsempfänger</div>
              <div style={{ fontWeight: 600 }}>{sampleData.customerName}</div>
              <div style={{ color: "#4B5563", fontSize: "0.85rem" }}>{sampleData.customerEmail}</div>
            </div>
            <div style={{ padding: "16px 32px", borderLeft: "1px solid #F0EFED" }}>
              <div style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: PROPUS_GOLD, marginBottom: 6 }}>Absender</div>
              <div style={{ fontWeight: 600 }}>{creditor.name}</div>
              <div style={{ color: "#4B5563", fontSize: "0.85rem" }}>{creditor.street} {creditor.buildingNumber}, {creditor.zip} {creditor.city}</div>
              {creditor.vatId && <div style={{ color: "#9CA3AF", fontSize: "0.78rem", marginTop: 2 }}>MwSt: {creditor.vatId}</div>}
            </div>
          </div>

          {/* Tabelle */}
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: PROPUS_DARK }}>
                <th style={{ padding: "10px 32px", fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: "#9CA3AF", textAlign: "left", width: 60 }}>Pos.</th>
                <th style={{ padding: "10px 32px", fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: "#9CA3AF", textAlign: "left" }}>Beschreibung</th>
                <th style={{ padding: "10px 32px", fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: "#9CA3AF", textAlign: "right" }}>Betrag (CHF)</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: "1px solid #F0EFED" }}>
                <td style={{ padding: "14px 32px", color: "#9CA3AF" }}>1</td>
                <td style={{ padding: "14px 32px" }}>
                  <div style={{ fontWeight: 600 }}>{sampleData.bezeichnung}</div>
                  <div style={{ fontSize: "0.75rem", color: "#9CA3AF", marginTop: 2 }}>{sampleData.billingPeriodLabel}</div>
                </td>
                <td style={{ padding: "14px 32px", textAlign: "right", fontWeight: 600 }}>{sampleData.amountNet}</td>
              </tr>
            </tbody>
          </table>

          {/* Summen */}
          <div style={{ padding: "12px 32px 16px", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <div style={{ display: "flex", gap: 48, width: 280, fontSize: "0.85rem", color: "#4B5563" }}>
              <span style={{ flex: 1, textAlign: "right" }}>Zwischensumme</span>
              <span style={{ minWidth: 90, textAlign: "right" }}>CHF {sampleData.amountNet}</span>
            </div>
            <div style={{ display: "flex", gap: 48, width: 280, fontSize: "0.8rem", color: "#6B7280" }}>
              <span style={{ flex: 1, textAlign: "right" }}>MwSt {sampleData.vatPercent}%</span>
              <span style={{ minWidth: 90, textAlign: "right" }}>CHF {sampleData.amountVat}</span>
            </div>
            <div style={{ display: "flex", gap: 48, width: 280, fontSize: "1rem", fontWeight: 800, color: PROPUS_GOLD, borderTop: `2px solid ${PROPUS_DARK}`, paddingTop: 8, marginTop: 4 }}>
              <span style={{ flex: 1, textAlign: "right" }}>Total</span>
              <span style={{ minWidth: 90, textAlign: "right" }}>CHF {sampleData.amount}</span>
            </div>
          </div>

          {/* Zahlung */}
          <div style={{ margin: "0 32px 20px", background: "#FAFAF9", border: "1px solid #F0EFED", borderRadius: 4, padding: "14px 18px" }}>
            <div style={{ display: "flex", gap: 16, marginBottom: 6, fontSize: "0.8rem" }}>
              <span style={{ minWidth: 100, color: "#9CA3AF", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase" }}>IBAN</span>
              <span style={{ fontFamily: "monospace" }}>{sampleData.creditorIbanFormatted}</span>
            </div>
            <div style={{ display: "flex", gap: 16, fontSize: "0.8rem" }}>
              <span style={{ minWidth: 100, color: "#9CA3AF", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase" }}>QR-Referenz</span>
              <span style={{ fontFamily: "monospace" }}>{sampleData.qrReferenceFormatted}</span>
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: "16px 32px 24px", borderTop: "1px solid #F0EFED", fontSize: "0.8rem", color: "#6B7280" }}>
            <p style={{ margin: "0 0 6px" }}>{creditor.footerNote || "Vielen Dank für Ihr Vertrauen. Bei Fragen stehen wir gerne zur Verfügung."}</p>
            <p style={{ margin: 0 }}>Freundliche Grüsse<br />{creditor.name}</p>
          </div>
        </div>
      </div>

      {/* E-Mail-Vorschau */}
      {emailHtml && (
        <div>
          <h4 className="text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wide mb-3">E-Mail Vorschau (mit Beispieldaten)</h4>
          <div className="rounded-xl border border-[var(--border-soft)] overflow-hidden">
            <iframe
              srcDoc={emailHtml
                .replace(/\{\{customerGreeting\}\}/g, "Guten Tag Max Mustermann,")
                .replace(/\{\{objectLabel\}\}/g, "Musterstrasse 12, 8001 Zürich")
                .replace(/\{\{actionLabel\}\}/g, "Verlängerung")
                .replace(/\{\{amountCHF\}\}/g, "106.97")
                .replace(/\{\{dueDateFormatted\}\}/g, "15.01.2025")
                .replace(/\{\{tourLinkHtml\}\}/g, '<strong>Tour:</strong> <a href="#">https://my.matterport.com/show/?m=example</a>')
                .replace(/\{\{portalLinkHtml\}\}/g, '<a href="#">Kundenportal öffnen</a>')
                .replace(/\{\{tourLinkText\}\}/g, "Tour: https://my.matterport.com/show/?m=example")
                .replace(/\{\{portalLinkText\}\}/g, "Kundenportal: https://portal.propus.ch")
                .replace(/\{\{portalUrl\}\}/g, "https://portal.propus.ch")
              }
              className="w-full border-0"
              style={{ height: 500 }}
              title="E-Mail Vorschau"
              sandbox="allow-same-origin"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export function InvoiceTemplatePage() {
  const token = useAuthStore((s) => s.token);

  const [data, setData] = useState<{
    creditor: InvoiceCreditor;
    defaultCreditor: InvoiceCreditor;
    invoiceEmailTemplate: InvoiceEmailTemplate;
    defaultInvoiceEmailTemplate: InvoiceEmailTemplate;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("creditor");

  // Draft-State
  const [creditor, setCreditor] = useState<InvoiceCreditor | null>(null);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailHtml, setEmailHtml] = useState("");
  const [emailText, setEmailText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getInvoiceTemplate(token);
      setData(res);
      setCreditor(res.creditor);
      setEmailSubject(res.invoiceEmailTemplate.subject || "");
      setEmailHtml(res.invoiceEmailTemplate.html || "");
      setEmailText(res.invoiceEmailTemplate.text || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Laden fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  function updateCreditor(key: keyof InvoiceCreditor, value: string) {
    setCreditor(prev => prev ? { ...prev, [key]: value } : prev);
  }

  function resetCreditor() {
    if (data?.defaultCreditor) setCreditor(data.defaultCreditor);
  }

  function resetEmail() {
    if (data?.defaultInvoiceEmailTemplate) {
      setEmailSubject(data.defaultInvoiceEmailTemplate.subject || "");
      setEmailHtml(data.defaultInvoiceEmailTemplate.html || "");
      setEmailText(data.defaultInvoiceEmailTemplate.text || "");
    }
  }

  async function handleSave() {
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const res = await patchInvoiceTemplate(token, {
        creditor: creditor ?? undefined,
        emailTemplate: { subject: emailSubject, html: emailHtml, text: emailText },
      });
      setData(d => d ? {
        ...d,
        creditor: res.creditor,
        invoiceEmailTemplate: res.invoiceEmailTemplate,
      } : d);
      setCreditor(res.creditor);
      setSuccess("Erfolgreich gespeichert.");
      setTimeout(() => setSuccess(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  const isDirty = data !== null && (
    JSON.stringify(creditor) !== JSON.stringify(data.creditor) ||
    emailSubject !== data.invoiceEmailTemplate.subject ||
    emailHtml !== data.invoiceEmailTemplate.html ||
    emailText !== data.invoiceEmailTemplate.text
  );

  const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: "creditor", label: "Absender", icon: Building2 },
    { key: "email", label: "E-Mail-Vorlage", icon: Mail },
    { key: "preview", label: "Vorschau", icon: Eye },
  ];

  const PLACEHOLDERS_EMAIL = [
    { key: "{{customerGreeting}}", desc: "Anrede des Kunden" },
    { key: "{{objectLabel}}", desc: "Tour-Bezeichnung / Objekt" },
    { key: "{{actionLabel}}", desc: "Art der Aktion (Verlängerung, Reaktivierung, …)" },
    { key: "{{amountCHF}}", desc: "Rechnungsbetrag in CHF" },
    { key: "{{dueDateFormatted}}", desc: "Fälligkeitsdatum" },
    { key: "{{tourLinkHtml}}", desc: "Tour-Link als HTML" },
    { key: "{{tourLinkText}}", desc: "Tour-Link als Plaintext" },
    { key: "{{portalLinkHtml}}", desc: "Kundenportal-Link als HTML" },
    { key: "{{portalLinkText}}", desc: "Kundenportal-Link als Plaintext" },
    { key: "{{portalUrl}}", desc: "Kundenportal-URL" },
  ];

  if (loading && !data) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] px-5 py-10 text-sm text-[var(--text-subtle)]">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Rechnungsvorlage wird geladen…
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent)]/10">
            <FileText className="h-5 w-5 text-[var(--accent)]" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[var(--text-main)]">Rechnungsvorlage</h1>
            <p className="text-xs text-[var(--text-subtle)]">Absender-Daten, PDF-Vorlage und E-Mail-Vorlage für Kundenrechnungen</p>
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
      <div className="flex gap-1 rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-1">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
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

      {/* ── Tab: Absender ── */}
      {activeTab === "creditor" && creditor && (
        <div className="space-y-4">
          <SectionCard title="Firmeninformationen" icon={Building2}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Firmenname">
                <TextInput value={creditor.name} onChange={v => updateCreditor("name", v)} placeholder="Propus GmbH" />
              </Field>
              <Field label="MwSt-Nummer" hint="z.B. CHE-424.310.597">
                <div className="relative">
                  <Hash className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-subtle)]" />
                  <input
                    type="text"
                    value={creditor.vatId}
                    onChange={e => updateCreditor("vatId", e.target.value)}
                    placeholder="CHE-424.310.597"
                    className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2 pl-9 text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  />
                </div>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Strasse">
                <TextInput value={creditor.street} onChange={v => updateCreditor("street", v)} placeholder="Untere Roostmatt" />
              </Field>
              <Field label="Hausnummer">
                <TextInput value={creditor.buildingNumber} onChange={v => updateCreditor("buildingNumber", v)} placeholder="8" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="PLZ">
                  <TextInput value={creditor.zip} onChange={v => updateCreditor("zip", v)} placeholder="6300" />
                </Field>
                <Field label="Ort">
                  <TextInput value={creditor.city} onChange={v => updateCreditor("city", v)} placeholder="Zug" />
                </Field>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Kontaktdaten" icon={Phone}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="E-Mail">
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-subtle)]" />
                  <input
                    type="email"
                    value={creditor.email}
                    onChange={e => updateCreditor("email", e.target.value)}
                    placeholder="office@propus.ch"
                    className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2 pl-9 text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  />
                </div>
              </Field>
              <Field label="Telefon">
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-subtle)]" />
                  <input
                    type="tel"
                    value={creditor.phone}
                    onChange={e => updateCreditor("phone", e.target.value)}
                    placeholder="+41 44 589 63 63"
                    className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2 pl-9 text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  />
                </div>
              </Field>
              <Field label="Website">
                <div className="relative">
                  <Globe className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-subtle)]" />
                  <input
                    type="text"
                    value={creditor.website}
                    onChange={e => updateCreditor("website", e.target.value)}
                    placeholder="propus.ch"
                    className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2 pl-9 text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  />
                </div>
              </Field>
            </div>
          </SectionCard>

          <SectionCard title="Bankverbindung (Swiss QR-Bill)" icon={CreditCard}>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2 dark:border-amber-800/40 dark:bg-amber-950/20">
              <Info className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Die IBAN wird für den Swiss QR-Einzahlungsschein verwendet. Nur QR-IBAN (beginnt mit CH) oder normale IBAN sind gültig.
                Änderungen wirken sich auf alle neu erstellten Rechnungen aus.
              </p>
            </div>
            <Field label="IBAN" hint="Format: CH13 3000 5204 1906 0401 W">
              <div className="relative">
                <CreditCard className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-subtle)]" />
                <input
                  type="text"
                  value={creditor.iban}
                  onChange={e => updateCreditor("iban", e.target.value)}
                  placeholder="CH13 3000 5204 1906 0401 W"
                  className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2 pl-9 font-mono text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
              </div>
            </Field>
          </SectionCard>

          <SectionCard title="Rechnungs-Fusszeile" icon={FileText}>
            <Field label="Fusszeile / Dankestext" hint="Erscheint am Ende jeder PDF-Rechnung">
              <Textarea
                value={creditor.footerNote}
                onChange={v => updateCreditor("footerNote", v)}
                rows={2}
              />
            </Field>
          </SectionCard>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={resetCreditor}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] px-3 py-1.5 text-xs text-[var(--text-subtle)] hover:text-[var(--text-main)]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Auf Standardwerte zurücksetzen
            </button>
          </div>
        </div>
      )}

      {/* ── Tab: E-Mail-Vorlage ── */}
      {activeTab === "email" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-main)]">QR-Rechnung E-Mail Vorlage</h3>
              <p className="mt-1 text-xs text-[var(--text-subtle)]">
                Diese E-Mail wird verschickt, wenn ein Kunde die Zahlung per QR-Einzahlungsschein wählt.
                Die PDF-Rechnung wird automatisch als Anhang hinzugefügt.
              </p>
            </div>

            <Field label="Betreff">
              <TextInput
                value={emailSubject}
                onChange={setEmailSubject}
                placeholder="Rechnung – {{actionLabel}} Ihres Rundgangs – {{objectLabel}}"
              />
            </Field>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wide">HTML-Inhalt</label>
                <button
                  type="button"
                  onClick={resetEmail}
                  className="flex items-center gap-1 text-xs text-[var(--text-subtle)] hover:text-[var(--text-main)]"
                >
                  <RotateCcw className="h-3 w-3" />
                  Standard wiederherstellen
                </button>
              </div>
              <Textarea value={emailHtml} onChange={setEmailHtml} rows={14} mono />
              <p className="mt-1 text-xs text-[var(--text-subtle)]">HTML mit Platzhaltern. Der gesamte Inhalt ersetzt den Standard-Template.</p>
            </div>

            <Field label="Plaintext (für E-Mail-Clients ohne HTML)">
              <Textarea value={emailText} onChange={setEmailText} rows={8} mono />
            </Field>
          </div>

          {/* Platzhalter-Referenz */}
          <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5">
            <h3 className="text-sm font-semibold text-[var(--text-main)] mb-3">Verfügbare Platzhalter</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {PLACEHOLDERS_EMAIL.map(({ key, desc }) => (
                <div key={key} className="flex items-start gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2">
                  <code className="rounded bg-[var(--surface)] px-1.5 py-0.5 font-mono text-xs text-[var(--accent)] shrink-0">{key}</code>
                  <span className="text-xs text-[var(--text-subtle)]">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Vorschau ── */}
      {activeTab === "preview" && creditor && (
        <InvoicePreview creditor={creditor} emailHtml={emailHtml} />
      )}

      {/* Speichern-Leiste */}
      {activeTab !== "preview" && (
        <div className="sticky bottom-4 flex items-center gap-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] px-5 py-3 shadow-lg">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !isDirty}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving
              ? <><RefreshCw className="h-4 w-4 animate-spin" />Wird gespeichert…</>
              : <><Save className="h-4 w-4" />Änderungen speichern</>
            }
          </button>
          {isDirty && <span className="text-xs text-amber-600 dark:text-amber-400">Ungespeicherte Änderungen</span>}
          {!isDirty && success && <span className="text-xs text-emerald-600 dark:text-emerald-400">{success}</span>}
        </div>
      )}
    </div>
  );
}
