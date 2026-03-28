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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#C5A059]/25 border-t-[#C5A059]" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="flex items-center gap-3 mb-6">
        <CalendarDays className="h-6 w-6 text-[#C5A059]" />
        <h1 className="text-2xl font-bold text-slate-900 dark:text-zinc-100">Kalender-Vorlagen (ICS)</h1>
      </div>

      <p className="text-sm text-slate-500 dark:text-zinc-400 mb-6 max-w-2xl">
        Betreff und Beschreibung für Kalender-Events (ICS-Dateien) anpassen. Platzhalter wie{" "}
        <code className="text-[#C5A059] font-mono text-xs">{"{{orderNo}}"}</code> werden beim Versand durch echte Werte ersetzt.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Template-Liste ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1 mb-3">
            <h2 className="text-sm font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
              Templates ({templates.length})
            </h2>
            <button
              onClick={openNewDialog}
              className="flex items-center gap-1 text-xs font-medium text-[#C5A059] hover:text-[#b8934d] transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Neu
            </button>
          </div>
          {templates.length === 0 ? (
            <p className="text-slate-400 dark:text-zinc-500 text-sm px-1">Noch keine Templates angelegt.</p>
          ) : (
            templates.map((tmpl) => (
              <button
                key={tmpl.key}
                onClick={() => selectTemplate(tmpl)}
                className={`w-full text-left flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                  selected?.key === tmpl.key
                    ? "border-[#C5A059] bg-[#C5A059]/10 dark:bg-[#C5A059]/20"
                    : "border-slate-200 dark:border-zinc-700 hover:border-[#C5A059]/50 bg-white dark:bg-zinc-900"
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-slate-900 dark:text-zinc-100 truncate">{tmpl.label || tmpl.key}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${tmpl.active ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" : "bg-slate-100 text-slate-400 dark:bg-zinc-800 dark:text-zinc-500"}`}>
                      {tmpl.active ? "Aktiv" : "Inaktiv"}
                    </span>
                  </div>
                  <code className="text-[10px] text-slate-400 dark:text-zinc-500">{tmpl.key}</code>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300 dark:text-zinc-600 flex-shrink-0 ml-2" />
              </button>
            ))
          )}

          {/* Info-Box */}
          <div className="mt-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300 space-y-1">
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
            <div className="flex flex-col items-center justify-center min-h-[400px] rounded-xl border-2 border-dashed border-slate-200 dark:border-zinc-700 text-slate-400 dark:text-zinc-500">
              <CalendarDays className="h-10 w-10 mb-3" />
              <p className="text-sm">Template aus der Liste auswählen</p>
            </div>
          ) : (
            <>
              {msg && (
                <div className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${msg.type === "ok" ? "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300" : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"}`}>
                  {msg.type === "ok" ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
                  {msg.text}
                </div>
              )}

              <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-5 space-y-4">
                {/* Header mit Toggle + Löschen */}
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-900 dark:text-zinc-100">{selected.label || selected.key}</h3>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => { void toggleActive(selected.key); }}
                      className="flex items-center gap-1 text-sm text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 transition-colors"
                    >
                      {selected.active
                        ? <><ToggleRight className="h-5 w-5 text-green-500" /> Aktiv</>
                        : <><ToggleLeft className="h-5 w-5 text-slate-300" /> Inaktiv</>
                      }
                    </button>
                    <button
                      onClick={() => setShowDeleteDialog(true)}
                      className="flex items-center gap-1 text-sm text-red-400 hover:text-red-600 transition-colors"
                      title="Template löschen"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Bezeichnung */}
                <div>
                  <label className="text-xs font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Bezeichnung</label>
                  <input
                    type="text"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-3 py-2 text-sm text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#C5A059]/50"
                  />
                </div>

                {/* Betreff */}
                <div>
                  <label className="text-xs font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Betreff (Kalender-Titel)</label>
                  <input
                    type="text"
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                    placeholder="Betreff mit {{variablen}}"
                    className="mt-1 w-full rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-3 py-2 text-sm text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#C5A059]/50"
                  />
                </div>

                {/* Body (Plain-Text Textarea) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Beschreibung (ICS-Body)</label>
                    <button
                      onClick={() => setShowPlaceholders(!showPlaceholders)}
                      className="text-xs text-[#C5A059] hover:underline"
                    >
                      {showPlaceholders ? "Platzhalter ausblenden" : "Platzhalter anzeigen"}
                    </button>
                  </div>
                  {showPlaceholders && (
                    <div className="mb-2 space-y-3">
                      <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
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
                              className="px-2 py-1 rounded border border-amber-300 dark:border-amber-700 bg-white/70 dark:bg-zinc-900/40 font-mono text-[11px] hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                              title="Klicken zum Einfügen"
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700">
                          <p className="text-xs font-semibold text-slate-700 dark:text-zinc-200 mb-2">Beispiel: customer_event</p>
                          <div className="space-y-2 text-[11px]">
                            <div>
                              <div className="text-slate-500 dark:text-zinc-400 mb-1">Betreff</div>
                              <pre className="font-mono whitespace-pre-wrap text-slate-700 dark:text-zinc-200">{CALENDAR_TEMPLATE_EXAMPLES.customer_event.subject}</pre>
                            </div>
                            <div>
                              <div className="text-slate-500 dark:text-zinc-400 mb-1">Beschreibung</div>
                              <pre className="font-mono whitespace-pre-wrap text-slate-700 dark:text-zinc-200">{CALENDAR_TEMPLATE_EXAMPLES.customer_event.body}</pre>
                            </div>
                          </div>
                        </div>
                        <div className="p-3 rounded-lg bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700">
                          <p className="text-xs font-semibold text-slate-700 dark:text-zinc-200 mb-2">Beispiel: photographer_event</p>
                          <div className="space-y-2 text-[11px]">
                            <div>
                              <div className="text-slate-500 dark:text-zinc-400 mb-1">Betreff</div>
                              <pre className="font-mono whitespace-pre-wrap text-slate-700 dark:text-zinc-200">{CALENDAR_TEMPLATE_EXAMPLES.photographer_event.subject}</pre>
                            </div>
                            <div>
                              <div className="text-slate-500 dark:text-zinc-400 mb-1">Beschreibung</div>
                              <pre className="font-mono whitespace-pre-wrap text-slate-700 dark:text-zinc-200">{CALENDAR_TEMPLATE_EXAMPLES.photographer_event.body}</pre>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs max-h-56 overflow-y-auto">
                        {placeholders.map((p) => (
                          <button
                            key={p.key}
                            type="button"
                            onClick={() => insertPlaceholder(p.key)}
                            className="flex items-start gap-1 text-left hover:bg-slate-100 dark:hover:bg-zinc-700 rounded px-1 py-0.5 transition-colors"
                            title="Klicken zum Einfügen"
                          >
                            <code className="text-[#C5A059] font-mono whitespace-nowrap">{`{{${p.key}}}`}</code>
                            <span className="text-slate-500 dark:text-zinc-400">{p.desc}</span>
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
                    className="w-full rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-3 py-3 text-sm text-slate-900 dark:text-zinc-100 font-mono focus:outline-none focus:ring-2 focus:ring-[#C5A059]/50 resize-y"
                    spellCheck={false}
                  />
                  <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1">
                    Plain-Text. Zeilenumbrüche werden als <code className="font-mono">\n</code> in der ICS-Datei kodiert.
                  </p>
                </div>

                {/* Aktionsleiste */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => { void save(); }}
                    disabled={saving}
                    className="px-4 py-2 rounded-lg bg-[#C5A059] text-white text-sm font-medium hover:bg-[#b8934d] disabled:opacity-50 transition-colors"
                  >
                    {saving ? "Speichert..." : "Speichern"}
                  </button>

                  <div className="flex items-center gap-2 ml-auto flex-wrap">
                    <input
                      type="number"
                      placeholder="Auftrag Nr."
                      value={testOrderNo}
                      onChange={(e) => setTestOrderNo(e.target.value)}
                      className="w-32 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-3 py-2 text-sm text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#C5A059]/50"
                    />
                    <button
                      onClick={() => { void previewTemplate(); }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 text-sm hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
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
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md my-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-zinc-700">
              <h3 className="font-semibold text-slate-900 dark:text-zinc-100">Neues Kalender-Template</h3>
              <button onClick={() => setShowNewDialog(false)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors">
                <X className="h-5 w-5 text-slate-500 dark:text-zinc-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Key <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={newKey}
                  onChange={(e) => { setNewKey(e.target.value.toLowerCase()); setNewKeyError(""); }}
                  placeholder="z.B. reminder_event"
                  autoFocus
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-3 py-2 text-sm text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#C5A059]/50"
                  onKeyDown={(e) => { if (e.key === "Enter") void createTemplate(); }}
                />
                <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1">Nur a–z, 0–9, _, - und . erlaubt.</p>
                {newKeyError && <p className="text-xs text-red-500 mt-1">{newKeyError}</p>}
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Bezeichnung</label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Lesbare Beschriftung"
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-3 py-2 text-sm text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#C5A059]/50"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-zinc-700">
              <button
                onClick={() => setShowNewDialog(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 text-sm text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={() => { void createTemplate(); }}
                disabled={creating}
                className="px-4 py-2 rounded-lg bg-[#C5A059] text-white text-sm font-medium hover:bg-[#b8934d] disabled:opacity-50 transition-colors"
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
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md my-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-zinc-700">
              <h3 className="font-semibold text-red-600 dark:text-red-400">Template löschen</h3>
              <button onClick={() => setShowDeleteDialog(false)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors">
                <X className="h-5 w-5 text-slate-500 dark:text-zinc-400" />
              </button>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-slate-700 dark:text-zinc-300">
                Möchtest du das Template <strong>{selected.label || selected.key}</strong> wirklich löschen?
              </p>
              <code className="block mt-2 text-xs text-slate-400 dark:text-zinc-500">{selected.key}</code>
              <p className="mt-3 text-xs text-red-400">Diese Aktion kann nicht rückgängig gemacht werden.</p>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-zinc-700">
              <button
                onClick={() => setShowDeleteDialog(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 text-sm text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={() => { void confirmDelete(); }}
                disabled={deleting}
                className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-50 transition-colors"
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
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-2xl my-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-zinc-700">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-zinc-100">Kalender-Vorschau</h3>
                <p className="text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
                  {testOrderNo ? `Auftrag #${testOrderNo}` : "Beispiel-Daten"}
                </p>
              </div>
              <button onClick={() => setShowPreview(false)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors">
                <X className="h-5 w-5 text-slate-500 dark:text-zinc-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Betreff (Kalender-Titel)</p>
                <div className="rounded-lg bg-slate-50 dark:bg-zinc-800 px-4 py-3 text-sm font-medium text-slate-900 dark:text-zinc-100 border border-slate-200 dark:border-zinc-700">
                  {previewData.subject || <span className="text-slate-400">(kein Betreff)</span>}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Beschreibung (ICS-Body)</p>
                <pre className="rounded-lg bg-slate-50 dark:bg-zinc-800 px-4 py-3 text-sm text-slate-900 dark:text-zinc-100 border border-slate-200 dark:border-zinc-700 whitespace-pre-wrap font-mono overflow-x-auto max-h-96">
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
