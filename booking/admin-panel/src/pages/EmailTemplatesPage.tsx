import { useState, useEffect, useCallback, useRef } from "react";
import {
  Mail,
  ChevronRight,
  Eye,
  Send,
  History,
  RotateCcw,
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
import { t } from "../i18n";

interface EmailTemplate {
  id: number;
  key: string;
  label: string;
  subject: string;
  body_html: string;
  active: boolean;
  updated_at: string;
}

interface HistoryEntry {
  id: number;
  subject: string;
  body_html: string;
  changed_by: string;
  changed_at: string;
}

interface Placeholder {
  key: string;
  desc: string;
}

interface EmailWorkflowConfigEntry {
  id: number;
  status_to: string;
  template_key: string;
  role: "customer" | "office" | "photographer";
  active: boolean;
  ics_customer: boolean;
  ics_office: boolean;
  updated_at: string;
}

function isFullHtmlDocument(html: string): boolean {
  return /<html[\s>]/i.test(html) || /<!doctype\s+html/i.test(html);
}

function extractHeadStyleAssets(html: string): string {
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (!headMatch) return "";
  const inner = headMatch[1];
  const styles = inner.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) || [];
  const links = inner.match(/<link\b[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi) || [];
  return [...styles, ...links].join("\n");
}

function extractBodyContent(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) return html;
  const bodyInner = bodyMatch[1].trim();
  const headAssets = extractHeadStyleAssets(html);
  return headAssets ? `${headAssets}\n${bodyInner}` : bodyInner;
}

function normalizeEmailHtml(html: string): string {
  if (!html) return html;
  if (isFullHtmlDocument(html)) return extractBodyContent(html);
  return html;
}

function wrapEmailPreviewHtml(html: string): string {
  const trimmed = html.trim();
  if (/^<!doctype/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) return html;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${html}</body></html>`;
}

// ─── Haupt-Komponente ─────────────────────────────────────────────────────────

export function EmailTemplatesPage() {
  const token = useAuthStore((s) => s.token);
  const lang = useAuthStore((s) => s.language);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [placeholders, setPlaceholders] = useState<Placeholder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<EmailTemplate | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewSubject, setPreviewSubject] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [testOrderNo, setTestOrderNo] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [testIcsCustomer, setTestIcsCustomer] = useState(false);
  const [testIcsOffice, setTestIcsOffice] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [showPlaceholders, setShowPlaceholders] = useState(false);
  const htmlTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [workflowConfig, setWorkflowConfig] = useState<EmailWorkflowConfigEntry[]>([]);
  const [workflowSavingId, setWorkflowSavingId] = useState<number | null>(null);

  // Neu-Dialog
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newKeyError, setNewKeyError] = useState("");
  const [creating, setCreating] = useState(false);

  // Löschen-Dialog
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const editHtmlRef = useRef("");
  const [editHtmlDisplay, setEditHtmlDisplay] = useState("");

  function setEditHtmlInternal(html: string) {
    editHtmlRef.current = html;
    setEditHtmlDisplay(html);
  }

  // ─── API ────────────────────────────────────────────────────────────────────

  const load = useCallback(async (): Promise<EmailTemplate[]> => {
    setLoading(true);
    try {
      const res = await apiRequest<{ ok: boolean; templates: EmailTemplate[]; placeholders: Placeholder[] }>(
        "/api/admin/email-templates", "GET", token
      );
      const nextTemplates = res.templates || [];
      setTemplates(nextTemplates);
      setSelected((prev) => {
        if (!prev) return prev;
        return nextTemplates.find((tmpl) => tmpl.key === prev.key) || prev;
      });
      setPlaceholders(res.placeholders || []);
      return nextTemplates;
    } catch (e) {
      setMsg({ type: "err", text: (e as Error).message });
      return [];
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const loadWorkflowConfig = useCallback(async () => {
    try {
      const res = await apiRequest<{ ok: boolean; config: EmailWorkflowConfigEntry[] }>(
        "/api/admin/email-workflow-config",
        "GET",
        token
      );
      setWorkflowConfig(res.config || []);
    } catch (e) {
      setMsg({ type: "err", text: (e as Error).message });
    }
  }, [token]);

  useEffect(() => { void loadWorkflowConfig(); }, [loadWorkflowConfig]);

  const selectTemplate = async (tmpl: EmailTemplate) => {
    setSelected(tmpl);
    setEditSubject(tmpl.subject);
    setEditLabel(tmpl.label);
    const normalized = normalizeEmailHtml(tmpl.body_html);
    setEditHtmlInternal(normalized);
    setShowHistory(false);
    setShowPreview(false);
    if (isFullHtmlDocument(tmpl.body_html)) {
      setMsg({
        type: "err",
        text: "Vollständiges HTML-Dokument erkannt: Der E-Mail-Inhalt wurde auf den Body reduziert. <style>- und Stylesheet-Links aus dem <head> bleiben erhalten. Bitte speichern.",
      });
    } else {
      setMsg(null);
    }
    try {
      const res = await apiRequest<{ ok: boolean; history: HistoryEntry[] }>(
        `/api/admin/email-templates/${tmpl.key}`, "GET", token
      );
      setHistory(res.history || []);
    } catch {
      setHistory([]);
    }
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    setMsg(null);
    try {
      await apiRequest<{ ok: boolean }>(`/api/admin/email-templates/${selected.key}`, "PUT", token, {
        subject: editSubject,
        body_html: editHtmlRef.current,
        label: editLabel,
        active: selected.active,
      });
      setMsg({ type: "ok", text: t(lang, "emailTemplates.success.saved") });
      const freshTemplates = await load();
      const fresh = freshTemplates.find((tmpl) => tmpl.key === selected.key);
      if (fresh) {
        setSelected(fresh);
        setEditSubject(fresh.subject);
        setEditLabel(fresh.label);
        setEditHtmlInternal(normalizeEmailHtml(fresh.body_html));
      }
    } catch (e) {
      setMsg({ type: "err", text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const patchWorkflowConfig = async (
    entry: EmailWorkflowConfigEntry,
    patch: Partial<Pick<EmailWorkflowConfigEntry, "active" | "ics_customer" | "ics_office">>
  ) => {
    setWorkflowSavingId(entry.id);
    try {
      const res = await apiRequest<{ ok: boolean; entry: EmailWorkflowConfigEntry }>(
        `/api/admin/email-workflow-config/${entry.id}`,
        "PATCH",
        token,
        patch
      );
      setWorkflowConfig((prev) => prev.map((it) => (it.id === entry.id ? res.entry : it)));
    } catch (e) {
      setMsg({ type: "err", text: (e as Error).message });
    } finally {
      setWorkflowSavingId(null);
    }
  };

  const toggleActive = async (key: string) => {
    try {
      const res = await apiRequest<{ ok: boolean; key: string; active: boolean }>(
        `/api/admin/email-templates/${key}/toggle`,
        "PATCH",
        token
      );
      setTemplates((prev) =>
        prev.map((tmpl) =>
          tmpl.key === res.key ? { ...tmpl, active: res.active } : tmpl
        )
      );
      setSelected((prev) =>
        prev && prev.key === res.key ? { ...prev, active: res.active } : prev
      );
      setMsg({
        type: "ok",
        text: res.active
          ? t(lang, "emailTemplates.badge.active")
          : t(lang, "emailTemplates.badge.inactive"),
      });
    } catch (e) {
      setMsg({ type: "err", text: (e as Error).message });
    }
  };

  const previewTemplate = async () => {
    if (!selected) return;
    setMsg(null);
    try {
      const res = await apiRequest<{ ok: boolean; subject: string; body_html: string }>(
        `/api/admin/email-templates/${selected.key}/preview`, "POST", token,
        { orderNo: testOrderNo ? Number(testOrderNo) : undefined }
      );
      setPreviewSubject(res.subject);
      setPreviewHtml(res.body_html);
      setShowPreview(true);
    } catch (e) {
      setMsg({ type: "err", text: (e as Error).message });
    }
  };

  const sendTest = async () => {
    if (!selected) return;
    setSendingTest(true);
    setMsg(null);
    try {
      const res = await apiRequest<{ ok: boolean; sentTo: string; subject: string }>(
        `/api/admin/email-templates/${selected.key}/test-send`, "POST", token,
        {
          orderNo: testOrderNo ? Number(testOrderNo) : undefined,
          toEmail: testEmail.trim() || undefined,
          includeCustomerIcs: testIcsCustomer,
          includeOfficeIcs: testIcsOffice,
        }
      );
      setMsg({ type: "ok", text: t(lang, "emailTemplates.success.testSent").replace("{{email}}", res.sentTo) });
    } catch (e) {
      setMsg({ type: "err", text: (e as Error).message });
    } finally {
      setSendingTest(false);
    }
  };

  const restoreVersion = async (historyId: number) => {
    if (!selected) return;
    setMsg(null);
    try {
      await apiRequest<{ ok: boolean }>(`/api/admin/email-templates/${selected.key}/restore/${historyId}`, "POST", token);
      setMsg({ type: "ok", text: t(lang, "emailTemplates.success.restored") });
      await selectTemplate(selected);
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
    if (!k) { setNewKeyError(t(lang, "emailTemplates.error.keyRequired")); return; }
    if (!validateKey(k)) { setNewKeyError(t(lang, "emailTemplates.error.keyFormat")); return; }
    if (templates.some((tmpl) => tmpl.key === k)) { setNewKeyError(t(lang, "emailTemplates.error.keyExists")); return; }
    setCreating(true);
    try {
      await apiRequest<{ ok: boolean }>(`/api/admin/email-templates/${k}`, "PUT", token, {
        label: newLabel.trim() || k,
        subject: "",
        body_html: "",
        active: true,
      });
      setShowNewDialog(false);
      await load();
      // Neues Template automatisch auswählen
      const fresh = await apiRequest<{ ok: boolean; template: EmailTemplate }>(
        `/api/admin/email-templates/${k}`, "GET", token
      );
      if (fresh.template) void selectTemplate(fresh.template);
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
      await apiRequest<{ ok: boolean }>(`/api/admin/email-templates/${selected.key}`, "DELETE", token);
      setShowDeleteDialog(false);
      setSelected(null);
      setMsg(null);
      setEditHtmlInternal("");
      await load();
    } catch (e) {
      setMsg({ type: "err", text: (e as Error).message });
      setShowDeleteDialog(false);
    } finally {
      setDeleting(false);
    }
  };

  // Platzhalter in Editor einfügen
  const insertPlaceholder = (key: string) => {
    const ta = htmlTextareaRef.current;
    const placeholder = `{{${key}}}`;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const next = editHtmlRef.current.slice(0, start) + placeholder + editHtmlRef.current.slice(end);
    setEditHtmlInternal(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + placeholder.length, start + placeholder.length);
    });
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="flex items-center gap-3 mb-6">
        <Mail className="h-6 w-6 text-[var(--accent)]" />
        <h1 className="text-2xl font-bold text-[var(--text-main)]">{t(lang, "emailTemplates.title")}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Template-Liste ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1 mb-3">
            <h2 className="text-sm font-semibold text-[var(--text-subtle)] uppercase tracking-wider">
              {t(lang, "emailTemplates.templateCount").replace("{{n}}", String(templates.length))}
            </h2>
            <button
              onClick={openNewDialog}
              className="flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> {t(lang, "emailTemplates.button.new")}
            </button>
          </div>
          {templates.length === 0 ? (
            <p className="text-[var(--text-subtle)] text-sm px-1">{t(lang, "emailTemplates.empty")}</p>
          ) : (
            templates.map((tmpl) => (
              <button
                key={tmpl.key}
                onClick={() => { void selectTemplate(tmpl); }}
                className={`w-full text-left flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                  selected?.key === tmpl.key
                    ? "border-[var(--accent)] bg-[var(--accent)]/10 dark:bg-[var(--accent)]/20"
                    : "border-[var(--border-soft)] hover:border-[var(--accent)]/50 bg-[var(--surface)]"
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-[var(--text-main)] truncate">{tmpl.label || tmpl.key}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${tmpl.active ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" : "bg-slate-100 text-slate-400 bg-[var(--surface-raised)] text-[var(--text-subtle)]"}`}>
                      {tmpl.active ? t(lang, "emailTemplates.badge.active") : t(lang, "emailTemplates.badge.inactive")}
                    </span>
                  </div>
                  <code className="text-[10px] text-[var(--text-subtle)]">{tmpl.key}</code>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300 text-[var(--text-subtle)] flex-shrink-0 ml-2" />
              </button>
            ))
          )}
        </div>

        {/* ── Editor ── */}
        <div className="lg:col-span-2 space-y-4">
          {!selected ? (
            <div className="flex flex-col items-center justify-center min-h-[400px] rounded-xl border-2 border-dashed border-[var(--border-soft)] text-[var(--text-subtle)]">
              <Mail className="h-10 w-10 mb-3" />
              <p className="text-sm">{t(lang, "emailTemplates.selectPrompt")}</p>
            </div>
          ) : (
            <>
              {msg && (
                <div className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${msg.type === "ok" ? "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300" : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"}`}>
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
                        ? <><ToggleRight className="h-5 w-5 text-green-500" /> {t(lang, "emailTemplates.badge.active")}</>
                        : <><ToggleLeft className="h-5 w-5 text-slate-300" /> {t(lang, "emailTemplates.badge.inactive")}</>
                      }
                    </button>
                    <button
                      onClick={() => setShowDeleteDialog(true)}
                      className="flex items-center gap-1 text-sm text-red-400 hover:text-red-600 transition-colors"
                      title={t(lang, "emailTemplates.dialog.deleteTitle")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Bezeichnung */}
                <div>
                  <label className="text-xs font-medium text-[var(--text-subtle)] uppercase tracking-wider">{t(lang, "emailTemplates.label.name")}</label>
                  <input
                    type="text"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
                  />
                </div>

                {/* Betreff */}
                <div>
                  <label className="text-xs font-medium text-[var(--text-subtle)] uppercase tracking-wider">{t(lang, "emailTemplates.label.subject")}</label>
                  <input
                    type="text"
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                    placeholder={t(lang, "emailTemplates.placeholder.subject")}
                    className="mt-1 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
                  />
                </div>

                {/* HTML-Body */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-[var(--text-subtle)] uppercase tracking-wider">{t(lang, "emailTemplates.label.body")}</label>
                    <button
                      onClick={() => setShowPlaceholders(!showPlaceholders)}
                      className="text-xs text-[var(--accent)] hover:underline"
                    >
                      {showPlaceholders ? t(lang, "emailTemplates.toggle.hidePlaceholders") : t(lang, "emailTemplates.toggle.showPlaceholders")}
                    </button>
                  </div>
                  {showPlaceholders && (
                    <div className="mb-2 p-3 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-soft)] grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs">
                      {placeholders.map((p) => (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => insertPlaceholder(p.key)}
                          className="flex items-start gap-1 text-left hover:bg-[var(--surface-raised)] rounded px-1 py-0.5 transition-colors"
                          title={t(lang, "emailTemplates.tooltip.insertPlaceholder")}
                        >
                          <code className="text-[var(--accent)] font-mono whitespace-nowrap">{`{{${p.key}}}`}</code>
                          <span className="text-[var(--text-subtle)]">{p.desc}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <textarea
                    ref={htmlTextareaRef}
                    value={editHtmlDisplay}
                    onChange={(e) => setEditHtmlInternal(e.target.value)}
                    rows={20}
                    placeholder="<p>Guten Tag {{customerName}},</p>"
                    spellCheck={false}
                    className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2 text-xs text-[var(--text-main)] font-mono resize-y focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50 min-h-[320px]"
                  />
                </div>

                {/* Aktionsleiste */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => { void save(); }}
                    disabled={saving}
                    className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
                  >
                    {saving ? t(lang, "common.saving") : t(lang, "common.save")}
                  </button>

                  <div className="flex items-center gap-2 ml-auto flex-wrap">
                    <input
                      type="number"
                      placeholder={t(lang, "emailTemplates.placeholder.orderNo")}
                      value={testOrderNo}
                      onChange={(e) => setTestOrderNo(e.target.value)}
                      className="w-32 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
                    />
                    <input
                      type="email"
                      placeholder="Test-E-Mail (optional)"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      className="w-56 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
                    />
                    <label className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                      <input
                        type="checkbox"
                        checked={testIcsCustomer}
                        onChange={(e) => setTestIcsCustomer(e.target.checked)}
                        className="rounded border-[var(--border-soft)]"
                      />
                      ICS Kunde
                    </label>
                    <label className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                      <input
                        type="checkbox"
                        checked={testIcsOffice}
                        onChange={(e) => setTestIcsOffice(e.target.checked)}
                        className="rounded border-[var(--border-soft)]"
                      />
                      ICS Büro
                    </label>
                    <button
                      onClick={() => { void previewTemplate(); }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border-soft)] text-[var(--text-muted)] text-sm hover:bg-[var(--surface-raised)] transition-colors"
                    >
                      <Eye className="h-4 w-4" /> {t(lang, "emailTemplates.button.preview")}
                    </button>
                    <button
                      onClick={() => { void sendTest(); }}
                      disabled={sendingTest}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border-soft)] text-[var(--text-muted)] text-sm hover:bg-[var(--surface-raised)] disabled:opacity-50 transition-colors"
                    >
                      <Send className="h-4 w-4" /> {sendingTest ? t(lang, "emailTemplates.button.testSending") : t(lang, "emailTemplates.button.testMail")}
                    </button>
                  </div>
                </div>
              </div>

              {/* Versionshistorie */}
              {history.length > 0 && (
                <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] overflow-hidden">
                  <button
                    onClick={() => setShowHistory(!showHistory)}
                    className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-[var(--text-muted)] hover:bg-[var(--surface-raised)] transition-colors"
                  >
                    <span className="flex items-center gap-2"><History className="h-4 w-4" /> {t(lang, "emailTemplates.label.history").replace("{{n}}", String(history.length))}</span>
                    <ChevronRight className={`h-4 w-4 transition-transform ${showHistory ? "rotate-90" : ""}`} />
                  </button>
                  {showHistory && (
                    <div className="border-t border-[var(--border-soft)] divide-y divide-slate-100 dark:divide-zinc-800">
                      {history.map((h) => (
                        <div key={h.id} className="px-5 py-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm text-[var(--text-muted)] truncate">{h.subject || t(lang, "emailTemplates.label.noSubject")}</div>
                            <div className="text-xs text-[var(--text-subtle)] mt-0.5">
                              {new Date(h.changed_at).toLocaleString("de-CH")} &middot; {h.changed_by}
                            </div>
                          </div>
                          <button
                            onClick={() => { void restoreVersion(h.id); }}
                            className="flex-shrink-0 flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                          >
                            <RotateCcw className="h-3 w-3" /> {t(lang, "emailTemplates.button.restore")}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {(() => {
                const entries = workflowConfig.filter((entry) => selected && entry.template_key === selected.key);
                if (entries.length === 0) return null;
                return (
                  <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] overflow-hidden">
                    <div className="px-5 py-3 border-b border-[var(--border-soft)]">
                      <h4 className="text-sm font-medium text-[var(--text-main)]">Versandeinstellungen</h4>
                      <p className="text-xs text-[var(--text-subtle)] mt-0.5">
                        Steuert ob und mit welchen Anhängen diese E-Mail bei Status-Wechsel versendet wird.
                      </p>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                      {entries.map((entry) => (
                        <div key={entry.id} className="px-5 py-3 flex flex-wrap items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-mono text-[var(--text-subtle)]">
                              Bei Status <span className="text-[var(--accent)] font-semibold">{entry.status_to}</span>
                              {" -> "}
                              <span className="text-[var(--text-muted)]">{entry.role}</span>
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              disabled={workflowSavingId === entry.id}
                              onClick={() => { void patchWorkflowConfig(entry, { active: !entry.active }); }}
                              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-all disabled:opacity-50 ${
                                entry.active
                                  ? "bg-green-50 border-green-300 text-green-700 dark:bg-green-950/30 dark:border-green-700 dark:text-green-300"
                                  : "bg-slate-50 border-slate-300 text-slate-500 bg-[var(--surface-raised)] border-[var(--border-soft)] text-[var(--text-subtle)]"
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${entry.active ? "bg-green-500" : "bg-slate-400"}`} />
                              {entry.active ? "Aktiv" : "Inaktiv"}
                            </button>
                            <label className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border cursor-pointer transition-all ${
                              entry.ics_customer
                                ? "bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-950/30 dark:border-blue-700 dark:text-blue-300"
                                : "bg-slate-50 border-slate-300 text-slate-500 bg-[var(--surface-raised)] border-[var(--border-soft)] text-[var(--text-subtle)]"
                            }`}>
                              <input
                                type="checkbox"
                                className="sr-only"
                                checked={entry.ics_customer}
                                disabled={workflowSavingId === entry.id}
                                onChange={() => { void patchWorkflowConfig(entry, { ics_customer: !entry.ics_customer }); }}
                              />
                              ICS Kunde
                            </label>
                            <label className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border cursor-pointer transition-all ${
                              entry.ics_office
                                ? "bg-purple-50 border-purple-300 text-purple-700 dark:bg-purple-950/30 dark:border-purple-700 dark:text-purple-300"
                                : "bg-slate-50 border-slate-300 text-slate-500 bg-[var(--surface-raised)] border-[var(--border-soft)] text-[var(--text-subtle)]"
                            }`}>
                              <input
                                type="checkbox"
                                className="sr-only"
                                checked={entry.ics_office}
                                disabled={workflowSavingId === entry.id}
                                onChange={() => { void patchWorkflowConfig(entry, { ics_office: !entry.ics_office }); }}
                              />
                              ICS Büro
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      </div>

      {/* ── Neu-Dialog ─────────────────────────────────────────────────────── */}
      {showNewDialog && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 bg-black/50">
          <div className="bg-[var(--surface)] rounded-2xl shadow-2xl w-full max-w-md my-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-soft)]">
              <h3 className="font-semibold text-[var(--text-main)]">{t(lang, "emailTemplates.dialog.newTitle")}</h3>
              <button onClick={() => setShowNewDialog(false)} className="p-2 rounded-lg hover:bg-[var(--surface-raised)] transition-colors">
                <X className="h-5 w-5 text-[var(--text-subtle)]" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-[var(--text-subtle)] uppercase tracking-wider">Key <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={newKey}
                  onChange={(e) => { setNewKey(e.target.value.toLowerCase()); setNewKeyError(""); }}
                  placeholder="z.B. welcome_customer"
                  autoFocus
                  className="mt-1 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
                  onKeyDown={(e) => { if (e.key === "Enter") void createTemplate(); }}
                />
                <p className="text-[11px] text-[var(--text-subtle)] mt-1">Nur a–z, 0–9, _, - und . erlaubt.</p>
                {newKeyError && <p className="text-xs text-red-500 mt-1">{newKeyError}</p>}
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--text-subtle)] uppercase tracking-wider">{t(lang, "emailTemplates.label.name")}</label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder={t(lang, "emailTemplates.placeholder.label")}
                  className="mt-1 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-[var(--border-soft)]">
              <button
                onClick={() => setShowNewDialog(false)}
                className="px-4 py-2 rounded-lg border border-[var(--border-soft)] text-sm text-[var(--text-muted)] hover:bg-[var(--surface-raised)] transition-colors"
              >
                {t(lang, "common.cancel")}
              </button>
              <button
                onClick={() => { void createTemplate(); }}
                disabled={creating}
                className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
              >
                {creating ? t(lang, "common.creating") : t(lang, "common.create")}
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
              <h3 className="font-semibold text-red-600 dark:text-red-400">{t(lang, "emailTemplates.dialog.deleteTitle")}</h3>
              <button onClick={() => setShowDeleteDialog(false)} className="p-2 rounded-lg hover:bg-[var(--surface-raised)] transition-colors">
                <X className="h-5 w-5 text-[var(--text-subtle)]" />
              </button>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-[var(--text-muted)]">
                {t(lang, "emailTemplates.dialog.deleteConfirm").replace("{{name}}", selected.label || selected.key)}
              </p>
              <code className="block mt-2 text-xs text-[var(--text-subtle)]">{selected.key}</code>
              <p className="mt-3 text-xs text-red-400">{t(lang, "emailTemplates.dialog.deleteWarning")}</p>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-[var(--border-soft)]">
              <button
                onClick={() => setShowDeleteDialog(false)}
                className="px-4 py-2 rounded-lg border border-[var(--border-soft)] text-sm text-[var(--text-muted)] hover:bg-[var(--surface-raised)] transition-colors"
              >
                {t(lang, "common.cancel")}
              </button>
              <button
                onClick={() => { void confirmDelete(); }}
                disabled={deleting}
                className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {deleting ? t(lang, "emailTemplates.button.deleting") : t(lang, "emailTemplates.button.deleteForever")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Preview-Modal ──────────────────────────────────────────────────── */}
      {showPreview && previewHtml && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 bg-black/50">
          <div className="bg-[var(--surface)] rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col my-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-soft)]">
              <div>
                <h3 className="font-semibold text-[var(--text-main)]">{t(lang, "emailTemplates.dialog.previewTitle")}</h3>
                <p className="text-sm text-[var(--text-subtle)]">{previewSubject}</p>
              </div>
              <button onClick={() => setShowPreview(false)} className="p-2 rounded-lg hover:bg-[var(--surface-raised)] transition-colors">
                <X className="h-5 w-5 text-[var(--text-subtle)]" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6">
              <iframe
                srcDoc={wrapEmailPreviewHtml(previewHtml)}
                className="w-full min-h-[400px] rounded-lg border border-[var(--border-soft)]"
                title={t(lang, "emailTemplates.dialog.previewTitle")}
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


