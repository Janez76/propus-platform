import { useState, useEffect, useCallback } from "react";
import {
  CalendarDays,
  ChevronRight,
  Eye,
  CheckCircle2,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  X,
  Plus,
  Trash2,
} from "lucide-react";
import { apiRequest } from "../api/client";
import { useAuthStore } from "../store/authStore";

interface CalendarTemplate {
  id: number;
  key: string;
  label: string;
  subject: string;
  body: string;
  active: boolean;
  updated_at: string;
}

interface Placeholder {
  key: string;
  desc: string;
}

const RECOMMENDED_BLOCK_PLACEHOLDERS = [
  "{{addressLine}}",
  "{{objectSummary}}",
  "{{customerBlock}}",
  "{{onsiteBlock}}",
  "{{notesBlock}}",
  "{{keyPickupBlock}}",
];

const CALENDAR_TEMPLATE_EXAMPLES = {
  customer_event: {
    subject: "Termin {{address}} – #{{orderNo}}",
    body: `📍 Adresse: {{addressLine}}
📅 Termin: {{appointmentDate}} um {{appointmentTime}} Uhr

Paket:
{{packageName}}

Dienstleistungen:
{{servicesSummary}}

Auftrag: #{{orderNo}}
Status: {{statusLabel}}`,
  },
  photographer_event: {
    subject: "Shooting {{address}} – #{{orderNo}}",
    body: `📍 Adresse: {{addressLine}}
🏠 Objekt: {{objectSummary}}

🛠 Dienstleistungen:
{{servicesSummary}}

📞 Kunde:
{{customerBlock}}

{{onsiteBlock}}

📸 Fotograf:
{{photographerName}}

{{notesBlock}}

{{keyPickupBlock}}

Auftrag: #{{orderNo}}
Status: {{statusLabel}}`,
  },
};

// ─── Haupt-Komponente ─────────────────────────────────────────────────────────

export function CalendarTemplatesPage() {
  const token = useAuthStore((s) => s.token);
  const [templates, setTemplates] = useState<CalendarTemplate[]>([]);
  const [placeholders, setPlaceholders] = useState<Placeholder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CalendarTemplate | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editBody, setEditBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewData, setPreviewData] = useState<{ subject: string; body: string } | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [testOrderNo, setTestOrderNo] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [showPlaceholders, setShowPlaceholders] = useState(false);

  // Neu-Dialog
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newKeyError, setNewKeyError] = useState("");
  const [creating, setCreating] = useState(false);

  // Löschen-Dialog
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ─── API ────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ ok: boolean; templates: CalendarTemplate[]; placeholders: Placeholder[] }>(
        "/api/admin/calendar-templates", "GET", token
      );
      const nextTemplates = res.templates || [];
      setTemplates(nextTemplates);
      setSelected((prev) => {
        if (!prev) return prev;
        return nextTemplates.find((tmpl) => tmpl.key === prev.key) || prev;
      });
      setPlaceholders(res.placeholders || []);
    } catch (e) {
      setMsg({ type: "err", text: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const selectTemplate = (tmpl: CalendarTemplate) => {
    setSelected(tmpl);
    setEditSubject(tmpl.subject);
    setEditLabel(tmpl.label);
    setEditBody(tmpl.body);
    setShowPreview(false);
    setMsg(null);
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    setMsg(null);
    try {
      await apiRequest<{ ok: boolean }>(`/api/admin/calendar-templates/${selected.key}`, "PUT", token, {
        subject: editSubject,
        body: editBody,
        label: editLabel,
        active: selected.active,
      });
      setMsg({ type: "ok", text: "Kalender-Template gespeichert." });
      await load();
    } catch (e) {
      setMsg({ type: "err", text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (key: string) => {
    try {
      const res = await apiRequest<{ ok: boolean; key: string; active: boolean }>(
        `/api/admin/calendar-templates/${key}/toggle`,
        "PATCH",
        token
      );
      setTemplates((prev) =>
        prev.map((tmpl) => tmpl.key === res.key ? { ...tmpl, active: res.active } : tmpl)
      );
      setSelected((prev) =>
        prev && prev.key === res.key ? { ...prev, active: res.active } : prev
      );
      setMsg({ type: "ok", text: res.active ? "Aktiv" : "Inaktiv" });
    } catch (e) {
      setMsg({ type: "err", text: (e as Error).message });
    }
  };

  const previewTemplate = async () => {
    if (!selected) return;
    setMsg(null);
    try {
      const res = await apiRequest<{ ok: boolean; subject: string; body: string }>(
        `/api/admin/calendar-templates/${selected.key}/preview`, "POST", token,
        { orderNo: testOrderNo ? Number(testOrderNo) : undefined }
      );
      setPreviewData({ subject: res.subject, body: res.body });
      setShowPreview(true);
    } catch (e) {
      setMsg({ type: "err", text: (e as Error).message });
    }
  };

  // ─── Neu-Dialog ─────────────────────────────────────────────────────────────

  const openNewDialog = () => {
    setNewKey("");
    setNewLabel("");
    setNewKeyError("");
    setShowNewDialog(true);
  };

  const validateKey = (k: string) => /^[a-z0-9_\-.]+$/.test(k);

  const createTemplate = async () => {
    const k = newKey.trim();
    if (!k) { setNewKeyError("Key ist Pflicht."); return; }
    if (!validateKey(k)) { setNewKeyError("Nur a–z, 0–9, _, - und . erlaubt."); return; }
    if (templates.some((tmpl) => tmpl.key === k)) { setNewKeyError("Key existiert bereits."); return; }
    setCreating(true);
    try {
      await apiRequest<{ ok: boolean }>(`/api/admin/calendar-templates/${k}`, "PUT", token, {
        label: newLabel.trim() || k,
        subject: "",
        body: "",
        active: true,
      });
      setShowNewDialog(false);
      await load();
      const fresh = await apiRequest<{ ok: boolean; template: CalendarTemplate }>(
        `/api/admin/calendar-templates/${k}`, "GET", token
      );
      if (fresh.template) selectTemplate(fresh.template);
    } catch (e) {
      setNewKeyError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  // ─── Löschen-Dialog ─────────────────────────────────────────────────────────

  const confirmDelete = async () => {
    if (!selected) return;
    setDeleting(true);
    try {
      await apiRequest<{ ok: boolean }>(`/api/admin/calendar-templates/${selected.key}`, "DELETE", token);
      setShowDeleteDialog(false);
      setSelected(null);
      setMsg(null);
      setEditBody("");
      await load();
    } catch (e) {
      setMsg({ type: "err", text: (e as Error).message });
      setShowDeleteDialog(false);
    } finally {
      setDeleting(false);
    }
  };

  // Platzhalter in Body-Textarea einfügen
  const insertPlaceholder = (key: string) => {
    const tag = `{{${key}}}`;
    setEditBody((prev) => prev + tag);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 " />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="flex items-center gap-3 mb-6">
        <CalendarDays className="h-6 w-6 text-[var(--accent)]" />
        <h1 className="text-2xl font-bold text-[var(--text-main)]">Kalender-Vorlagen (ICS)</h1>
      </div>

      <p className="text-sm text-[var(--text-subtle)] mb-6 max-w-2xl">
        Betreff und Beschreibung für Kalender-Events (ICS-Dateien) anpassen. Platzhalter wie{" "}
        <code className="text-[var(--accent)] font-mono text-xs">{"{{orderNo}}"}</code> werden beim Versand durch echte Werte ersetzt.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Template-Liste ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1 mb-3">
            <h2 className="text-sm font-semibold text-[var(--text-subtle)] uppercase tracking-wider">
              Templates ({templates.length})
            </h2>
            <button
              onClick={openNewDialog}
              className="flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Neu
            </button>
          </div>
          {templates.length === 0 ? (
            <p className="text-[var(--text-subtle)] text-sm px-1">Noch keine Templates angelegt.</p>
          ) : (
            templates.map((tmpl) => (
              <button
                key={tmpl.key}
                onClick={() => selectTemplate(tmpl)}
                className={`w-full text-left flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                  selected?.key === tmpl.key
                    ? "border-[var(--accent)] bg-[var(--accent-subtle)]"
                    : "border-[var(--border-soft)] hover:border-[var(--accent)]/50 bg-[var(--surface)]"
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-[var(--text-main)] truncate">{tmpl.label || tmpl.key}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${tmpl.active ? "cust-status-aktiv" : "cust-status-inaktiv"}`}>
                      {tmpl.active ? "Aktiv" : "Inaktiv"}
                    </span>
                  </div>
                  <code className="text-[10px] text-[var(--text-subtle)]">{tmpl.key}</code>
                </div>
                <ChevronRight className="h-4 w-4 text-[var(--text-subtle)] flex-shrink-0 ml-2" />
              </button>
            ))
          )}

          {/* Info-Box */}
          <div className="mt-4 p-3 rounded-lg cust-alert cust-alert--info text-xs space-y-1">
            <p className="font-semibold">Verwendung</p>
            <p><code className="font-mono">photographer_event</code> — ICS-Anhang in Fotografen-E-Mails</p>
            <p><code className="font-mono">customer_event</code> — Öffentlicher ICS-Download-Link für Kunden</p>
            <p className="pt-1">
              Empfehlung: nur einfache Platzhalter wie <code className="font-mono">{"{{addressLine}}"}</code> oder vorbereitete Blöcke wie <code className="font-mono">{"{{customerBlock}}"}</code> verwenden.
            </p>
          </div>
        </div>

        {/* ── Editor ── */}
        <div className="lg:col-span-2 space-y-4">
          {!selected ? (
            <div className="flex flex-col items-center justify-center min-h-[400px] rounded-xl border-2 border-dashed border-[var(--border-soft)] text-[var(--text-subtle)]">
              <CalendarDays className="h-10 w-10 mb-3" />
              <p className="text-sm">Template aus der Liste auswählen</p>
            </div>
          ) : (
            <>
              {msg && (
                <div className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${msg.type === "ok" ? "cust-alert--success" : "cust-alert--error"}`}>
                  {msg.type === "ok" ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
                  {msg.text}
                </div>
              )}

              <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5 space-y-4">
                {/* Header mit Toggle + Löschen */}
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-[var(--text-main)]">{selected.label || selected.key}</h3>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => { void toggleActive(selected.key); }}
                      className="flex items-center gap-1 text-sm text-[var(--text-subtle)] hover:text-slate-900 hover:text-[var(--text-main)] transition-colors"
                    >
                      {selected.active
                        ? <><ToggleRight className="h-5 w-5 text-green-500" /> Aktiv</>
                        : <><ToggleLeft className="h-5 w-5 text-slate-300" /> Inaktiv</>
                      }
                    </button>
                    <button
                      onClick={() => setShowDeleteDialog(true)}
                      className="flex items-center gap-1 text-sm text-[var(--cust-error,#c0392b)] hover:text-red-600 transition-colors"
                      title="Template löschen"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Bezeichnung */}
                <div>
                  <label className="text-xs font-medium text-[var(--text-subtle)] uppercase tracking-wider">Bezeichnung</label>
                  <input
                    type="text"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                  />
                </div>

                {/* Betreff */}
                <div>
                  <label className="text-xs font-medium text-[var(--text-subtle)] uppercase tracking-wider">Betreff (Kalender-Titel)</label>
                  <input
                    type="text"
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                    placeholder="Betreff mit {{variablen}}"
                    className="mt-1 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                  />
                </div>

                {/* Body (Plain-Text Textarea) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-[var(--text-subtle)] uppercase tracking-wider">Beschreibung (ICS-Body)</label>
                    <button
                      onClick={() => setShowPlaceholders(!showPlaceholders)}
                      className="text-xs text-[var(--accent)] hover:underline"
                    >
                      {showPlaceholders ? "Platzhalter ausblenden" : "Platzhalter anzeigen"}
                    </button>
                  </div>
                  {showPlaceholders && (
                    <div className="mb-2 space-y-3">
                      <div className="p-3 rounded-lg cust-alert cust-alert--warning text-xs">
                        <p className="font-semibold">Empfohlene Verwendung</p>
                        <p className="mt-1">
                          Keine bedingte Syntax wie <code className="font-mono">{"{{field? ...}}"}</code> verwenden.
                          Für optionale Inhalte bitte die vorbereiteten Block-Platzhalter nutzen:
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {RECOMMENDED_BLOCK_PLACEHOLDERS.map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => insertPlaceholder(tag.slice(2, -2))}
                              className="px-2 py-1 rounded border border-amber-300 dark:border-amber-700 bg-white/70 bg-[var(--surface)]/40 font-mono text-[11px] hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                              title="Klicken zum Einfügen"
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-soft)]">
                          <p className="text-xs font-semibold text-[var(--text-muted)] mb-2">Beispiel: customer_event</p>
                          <div className="space-y-2 text-[11px]">
                            <div>
                              <div className="text-[var(--text-subtle)] mb-1">Betreff</div>
                              <pre className="font-mono whitespace-pre-wrap text-[var(--text-muted)]">{CALENDAR_TEMPLATE_EXAMPLES.customer_event.subject}</pre>
                            </div>
                            <div>
                              <div className="text-[var(--text-subtle)] mb-1">Beschreibung</div>
                              <pre className="font-mono whitespace-pre-wrap text-[var(--text-muted)]">{CALENDAR_TEMPLATE_EXAMPLES.customer_event.body}</pre>
                            </div>
                          </div>
                        </div>
                        <div className="p-3 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-soft)]">
                          <p className="text-xs font-semibold text-[var(--text-muted)] mb-2">Beispiel: photographer_event</p>
                          <div className="space-y-2 text-[11px]">
                            <div>
                              <div className="text-[var(--text-subtle)] mb-1">Betreff</div>
                              <pre className="font-mono whitespace-pre-wrap text-[var(--text-muted)]">{CALENDAR_TEMPLATE_EXAMPLES.photographer_event.subject}</pre>
                            </div>
                            <div>
                              <div className="text-[var(--text-subtle)] mb-1">Beschreibung</div>
                              <pre className="font-mono whitespace-pre-wrap text-[var(--text-muted)]">{CALENDAR_TEMPLATE_EXAMPLES.photographer_event.body}</pre>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-soft)] grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs max-h-56 overflow-y-auto">
                        {placeholders.map((p) => (
                          <button
                            key={p.key}
                            type="button"
                            onClick={() => insertPlaceholder(p.key)}
                            className="flex items-start gap-1 text-left hover:bg-[var(--surface-raised)] rounded px-1 py-0.5 transition-colors"
                            title="Klicken zum Einfügen"
                          >
                            <code className="text-[var(--accent)] font-mono whitespace-nowrap">{`{{${p.key}}}`}</code>
                            <span className="text-[var(--text-subtle)]">{p.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={14}
                    placeholder={"📍 Adresse: {{address}}\n🏠 Objekt: {{objectTypeLabel}}\n\n{{customerName}}\nTel: {{customerPhone}}\n\n#{{orderNo}}"}
                    className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-3 text-sm text-[var(--text-main)] font-mono focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 resize-y"
                    spellCheck={false}
                  />
                  <p className="text-[11px] text-[var(--text-subtle)] mt-1">
                    Plain-Text. Zeilenumbrüche werden als <code className="font-mono">\n</code> in der ICS-Datei kodiert.
                  </p>
                </div>

                {/* Aktionsleiste */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => { void save(); }}
                    disabled={saving}
                    className="btn-primary min-h-0 min-w-0 px-4 py-2 text-sm"
                  >
                    {saving ? "Speichert..." : "Speichern"}
                  </button>

                  <div className="flex items-center gap-2 ml-auto flex-wrap">
                    <input
                      type="number"
                      placeholder="Auftrag Nr."
                      value={testOrderNo}
                      onChange={(e) => setTestOrderNo(e.target.value)}
                      className="w-32 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                    />
                    <button
                      onClick={() => { void previewTemplate(); }}
                      className="btn-secondary min-h-0 min-w-0 flex items-center gap-1.5 px-3 py-2 text-sm"
                    >
                      <Eye className="h-4 w-4" /> Vorschau
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Neu-Dialog ─────────────────────────────────────────────────────── */}
      {showNewDialog && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 bg-black/50">
          <div className="bg-[var(--surface)] rounded-2xl shadow-2xl w-full max-w-md my-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-soft)]">
              <h3 className="font-semibold text-[var(--text-main)]">Neues Kalender-Template</h3>
              <button onClick={() => setShowNewDialog(false)} className="p-2 rounded-lg hover:bg-[var(--surface-raised)] transition-colors">
                <X className="h-5 w-5 text-[var(--text-subtle)]" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-[var(--text-subtle)] uppercase tracking-wider">Key <span className="text-[var(--cust-error,#e74c3c)]">*</span></label>
                <input
                  type="text"
                  value={newKey}
                  onChange={(e) => { setNewKey(e.target.value.toLowerCase()); setNewKeyError(""); }}
                  placeholder="z.B. reminder_event"
                  autoFocus
                  className="mt-1 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                  onKeyDown={(e) => { if (e.key === "Enter") void createTemplate(); }}
                />
                <p className="text-[11px] text-[var(--text-subtle)] mt-1">Nur a–z, 0–9, _, - und . erlaubt.</p>
                {newKeyError && <p className="text-xs text-[var(--cust-error,#e74c3c)] mt-1">{newKeyError}</p>}
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--text-subtle)] uppercase tracking-wider">Bezeichnung</label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Lesbare Beschriftung"
                  className="mt-1 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-[var(--border-soft)]">
              <button
                onClick={() => setShowNewDialog(false)}
                className="btn-secondary min-h-0 min-w-0 px-4 py-2 text-sm"
              >
                Abbrechen
              </button>
              <button
                onClick={() => { void createTemplate(); }}
                disabled={creating}
                className="btn-primary min-h-0 min-w-0 px-4 py-2 text-sm"
              >
                {creating ? "Erstellt..." : "Erstellen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Löschen-Dialog ─────────────────────────────────────────────────── */}
      {showDeleteDialog && selected && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 bg-black/50">
          <div className="bg-[var(--surface)] rounded-2xl shadow-2xl w-full max-w-md my-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-soft)]">
              <h3 className="font-semibold text-red-600 dark:text-[var(--cust-error,#c0392b)]">Template löschen</h3>
              <button onClick={() => setShowDeleteDialog(false)} className="p-2 rounded-lg hover:bg-[var(--surface-raised)] transition-colors">
                <X className="h-5 w-5 text-[var(--text-subtle)]" />
              </button>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-[var(--text-muted)]">
                Möchtest du das Template <strong>{selected.label || selected.key}</strong> wirklich löschen?
              </p>
              <code className="block mt-2 text-xs text-[var(--text-subtle)]">{selected.key}</code>
              <p className="mt-3 text-xs text-[var(--cust-error,#c0392b)]">Diese Aktion kann nicht rückgängig gemacht werden.</p>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-[var(--border-soft)]">
              <button
                onClick={() => setShowDeleteDialog(false)}
                className="btn-secondary min-h-0 min-w-0 px-4 py-2 text-sm"
              >
                Abbrechen
              </button>
              <button
                onClick={() => { void confirmDelete(); }}
                disabled={deleting}
                className="btn-primary min-h-0 min-w-0 px-4 py-2 text-sm"
              >
                {deleting ? "Löscht..." : "Endgültig löschen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Preview-Modal ──────────────────────────────────────────────────── */}
      {showPreview && previewData && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 bg-black/50">
          <div className="bg-[var(--surface)] rounded-2xl shadow-2xl w-full max-w-2xl my-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-soft)]">
              <div>
                <h3 className="font-semibold text-[var(--text-main)]">Kalender-Vorschau</h3>
                <p className="text-sm text-[var(--text-subtle)] mt-0.5">
                  {testOrderNo ? `Auftrag #${testOrderNo}` : "Beispiel-Daten"}
                </p>
              </div>
              <button onClick={() => setShowPreview(false)} className="p-2 rounded-lg hover:bg-[var(--surface-raised)] transition-colors">
                <X className="h-5 w-5 text-[var(--text-subtle)]" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <p className="text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wider mb-1">Betreff (Kalender-Titel)</p>
                <div className="rounded-lg bg-[var(--surface-raised)] px-4 py-3 text-sm font-medium text-[var(--text-main)] border border-[var(--border-soft)]">
                  {previewData.subject || <span className="text-slate-400">(kein Betreff)</span>}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wider mb-1">Beschreibung (ICS-Body)</p>
                <pre className="rounded-lg bg-[var(--surface-raised)] px-4 py-3 text-sm text-[var(--text-main)] border border-[var(--border-soft)] whitespace-pre-wrap font-mono overflow-x-auto max-h-96">
                  {previewData.body || <span className="text-slate-400">(keine Beschreibung)</span>}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}




