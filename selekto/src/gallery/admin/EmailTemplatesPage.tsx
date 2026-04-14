import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildEmailPreviewSrcDoc } from "../emailPreviewShell.ts";
import {
  applyTemplateVars,
  EMAIL_TEMPLATE_FOLLOWUP_ID,
  listEmailTemplates,
  LISTING_EMAIL_TEMPLATE_ID,
  PICDROP_ADMIN_NOTIFY_EMAIL_TEMPLATE_ID,
  saveEmailTemplate,
} from "../galleryApi.ts";
import type { EmailTemplateRow } from "../types.ts";

const PREVIEW_VARS = {
  gallery_link: "https://www.propus.ch/listing/beispiel-magiclink",
  title: "Villa Seeblick, Zürich",
  customer_name: "Max Mustermann",
  address: "8008 Zürich",
  file_list:
    "Aussenansicht_Garten.jpg: Bitte Himmel etwas aufhellen\nKüche.jpg: Kein Kommentar\nBad.jpg: Spiegelung im Fenster reduzieren",
  feedback_body: "Meinen Sie damit den linken Bildrand oder den Himmel?",
  customer_comment: "Der Rand wirkt etwas abgeschnitten.",
  asset_label: "Aussenansicht_Garten.jpg",
  direct_link: "https://www.propus.ch/listing/beispiel-magiclink?bild=beispiel-id",
  revision: "3",
};

const TEMPLATE_OPTIONS: { id: string; label: string; placeholders: string[] }[] = [
  {
    id: LISTING_EMAIL_TEMPLATE_ID,
    label: "E-Mail an Kunden (Auswahl)",
    placeholders: [
      "{{gallery_link}}",
      "{{Link}}",
      "{{title}}",
      "{{Titel}}",
      "{{customer_name}}",
      "{{Kundenname}}",
      "{{customer_name_line}}",
      "{{address}}",
    ],
  },
  {
    id: EMAIL_TEMPLATE_FOLLOWUP_ID,
    label: "Rückfrage (Kommentar)",
    placeholders: [
      "{{customer_name_line}}",
      "{{title}}",
      "{{asset_label}}",
      "{{revision}}",
      "{{feedback_body}}",
      "{{customer_comment}}",
      "{{direct_link}}",
    ],
  },
  {
    id: PICDROP_ADMIN_NOTIFY_EMAIL_TEMPLATE_ID,
    label: "Admin: Bildauswahl eingegangen",
    placeholders: [
      "{{gallery_link}}",
      "{{Link}}",
      "{{title}}",
      "{{Titel}}",
      "{{customer_name}}",
      "{{Kundenname}}",
      "{{Dateiliste}}",
      "{{file_list}}",
      "{{address}}",
    ],
  },
];

function FilterIcon() {
  return (
    <svg className="gal-et-dd-icon-svg" viewBox="0 0 24 24" aria-hidden={true}>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="11" y1="18" x2="13" y2="18" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg className="gal-et-dd-chevron-svg" viewBox="0 0 24 24" aria-hidden={true}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="gal-et-dd-check-svg" viewBox="0 0 24 24" aria-hidden={true}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplateRow[]>([]);
  const [selectedId, setSelectedId] = useState(LISTING_EMAIL_TEMPLATE_ID);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveOkFlash, setSaveOkFlash] = useState(false);
  const [ddOpen, setDdOpen] = useState(false);

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const ddWrapRef = useRef<HTMLDivElement>(null);
  const previewIframeRef = useRef<HTMLIFrameElement | null>(null);
  /** Nächste Vorschau sofort schreiben (Seitenstart, Vorlagenwechsel, erstes Laden). */
  const skipPreviewDebounceRef = useRef(true);

  const selectedUi = useMemo(
    () => TEMPLATE_OPTIONS.find((o) => o.id === selectedId) ?? TEMPLATE_OPTIONS[0],
    [selectedId],
  );

  const previewHtml = useMemo(() => {
    try {
      return applyTemplateVars(body, PREVIEW_VARS);
    } catch {
      return body;
    }
  }, [body]);

  const previewSrcDoc = useMemo(() => buildEmailPreviewSrcDoc(previewHtml), [previewHtml]);

  useEffect(() => {
    if (loaded) skipPreviewDebounceRef.current = true;
  }, [loaded]);

  useEffect(() => {
    const iframe = previewIframeRef.current;
    if (!iframe) return undefined;
    const immediate = skipPreviewDebounceRef.current;
    skipPreviewDebounceRef.current = false;
    const delay = immediate ? 0 : 200;
    const timer = window.setTimeout(() => {
      if (!iframe.isConnected) return;
      try {
        iframe.srcdoc = previewSrcDoc;
      } catch {
        /* z. B. sehr alte Browser */
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [previewSrcDoc]);

  const refresh = useCallback(async () => {
    setErr(null);
    try {
      const rows = await listEmailTemplates();
      setTemplates(rows);
      setLoaded(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Laden fehlgeschlagen");
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const t = templates.find((x) => x.id === selectedId);
    if (t) {
      setSubject(t.subject);
      setBody(t.body);
    }
  }, [templates, selectedId]);

  useEffect(() => {
    if (!ddOpen) return;
    function onDoc(e: MouseEvent) {
      if (ddWrapRef.current?.contains(e.target as Node)) return;
      setDdOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDdOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [ddOpen]);

  useEffect(() => {
    if (!saveOkFlash) return;
    const t = window.setTimeout(() => setSaveOkFlash(false), 2000);
    return () => window.clearTimeout(t);
  }, [saveOkFlash]);

  function insertPlaceholder(ph: string) {
    const ta = bodyRef.current;
    if (!ta) return;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const next = body.slice(0, s) + ph + body.slice(e);
    setBody(next);
    const pos = s + ph.length;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(pos, pos);
      });
    });
  }

  async function onSave() {
    if (!subject.trim()) return;
    setSaving(true);
    try {
      await saveEmailTemplate({ id: selectedId, subject: subject.trim(), body });
      setSaveOkFlash(true);
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  function pickTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (t) {
      setSubject(t.subject);
      setBody(t.body);
    }
    skipPreviewDebounceRef.current = true;
    setSelectedId(id);
    setDdOpen(false);
  }

  return (
    <div className="admin-content gal-admin-listings-page gal-et-page">
      <div className="gal-admin-listings-shell__head">
        <div className="gal-admin-listings-shell__titles">
          <p className="admin-section-title admin-section-title--accent">Backpanel</p>
          <h1 className="gal-admin-listings-shell__h1">E-Mail-Vorlagen</h1>
          <p className="admin-lead">
            Hier passen Sie die Texte für E-Mails an Kundinnen und Kunden an (Versand starten Sie im
            Auswahl-Editor über «E-Mail zur Auswahl»). Zusätzlich können Sie die Vorlage für eine interne
            Hinweis-E-Mail nach bestätigter Kundenauswahl pflegen; diese wird nur angeboten, wenn in der Konfiguration die
            Variable <code className="gal-admin-code">VITE_PICDROP_NOTIFY_EMAIL</code> hinterlegt ist.
          </p>
        </div>
        <button
          type="button"
          className={
            "admin-btn admin-btn--outline gal-admin-btn-new-listing" +
            (saveOkFlash ? " gal-et-save--flash" : "")
          }
          disabled={saving || !loaded}
          onClick={() => void onSave()}
        >
          {saveOkFlash ? "✓ Gespeichert" : saving ? "Speichern…" : "Speichern"}
        </button>
      </div>

      {err ? <p className="admin-msg admin-msg--err gal-et-msg">{err}</p> : null}
      <span className="gal-et-sr-only" role="status" aria-live="polite">
        {saveOkFlash ? "Gespeichert." : ""}
      </span>

      {!loaded ? (
        <p className="admin-muted gal-et-loading">Laden…</p>
      ) : (
        <>
          <div className="gal-et-toolbar">
            <div className="gal-et-dd-wrap" ref={ddWrapRef}>
              <button
                type="button"
                className={"gal-et-dd-trigger" + (ddOpen ? " gal-et-dd-trigger--open" : "")}
                aria-haspopup="listbox"
                aria-expanded={ddOpen}
                onClick={() => setDdOpen((o) => !o)}
              >
                <div className="gal-et-dd-trigger-left">
                  <div className="gal-et-dd-filter">
                    <FilterIcon />
                    Vorlage
                  </div>
                  <div className="gal-et-dd-sep" aria-hidden={true} />
                  <div className="gal-et-dd-selected-label">{selectedUi.label}</div>
                </div>
                <div className={"gal-et-dd-chevron" + (ddOpen ? " gal-et-dd-chevron--open" : "")}>
                  <ChevronIcon />
                </div>
              </button>

              <div className={"gal-et-dd-menu" + (ddOpen ? " gal-et-dd-menu--show" : "")} role="listbox">
                <div className="gal-et-dd-section-label">Vorlage wählen</div>
                {TEMPLATE_OPTIONS.map((opt, i) => (
                  <div key={opt.id}>
                    {i > 0 ? <div className="gal-et-dd-divider" aria-hidden={true} /> : null}
                    <button
                      type="button"
                      role="option"
                      aria-selected={selectedId === opt.id}
                      className={"gal-et-dd-item" + (selectedId === opt.id ? " gal-et-dd-item--active" : "")}
                      onClick={() => pickTemplate(opt.id)}
                    >
                      <span className="gal-et-dd-item-name">{opt.label}</span>
                      {selectedId === opt.id ? (
                        <span className="gal-et-dd-check">
                          <CheckIcon />
                        </span>
                      ) : null}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="gal-et-main">
            <div className="gal-et-editor-col">
              <div className="gal-et-panel-card">
                <div className="gal-et-field-label">Betreff</div>
                <input
                  className="gal-et-subject-input"
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="gal-et-panel-card gal-et-panel-card--grow">
                <div className="gal-et-field-label">HTML-Inhalt</div>
                <textarea
                  ref={bodyRef}
                  className="gal-et-html-editor"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  spellCheck={false}
                />
              </div>
              <div className="gal-et-panel-card">
                <div className="gal-et-field-label">Platzhalter</div>
                <div className="gal-et-ph-wrap">
                  <div className="gal-et-ph-sub">Klick zum Einfügen in den Editor</div>
                  <div className="gal-et-ph-tags">
                    {selectedUi.placeholders.map((ph) => (
                      <button key={ph} type="button" className="gal-et-ph-tag" onClick={() => insertPlaceholder(ph)}>
                        {ph}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="gal-et-preview-col">
              <div className="gal-et-preview-header">
                <span className="gal-et-preview-title">Vorschau</span>
                <span className="gal-et-preview-badge">Beispieldaten</span>
              </div>
              <div className="gal-et-preview-body">
                <iframe
                  ref={previewIframeRef}
                  title="HTML-Vorschau (E-Mail)"
                  className="gal-et-preview-iframe"
                  sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
