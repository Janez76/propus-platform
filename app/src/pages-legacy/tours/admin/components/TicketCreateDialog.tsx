import { useEffect, useRef, useState } from "react";
import { X, Upload, Link2, AlertCircle, CheckCircle2 } from "lucide-react";
import { postCreateTicket, postTicketUpload } from "../../../../api/toursAdmin";
import type { TicketCategory } from "../../../../api/toursAdmin";

const CATEGORIES: { value: TicketCategory; label: string }[] = [
  { value: "startpunkt",       label: "Startpunkt ändern" },
  { value: "name_aendern",     label: "Name / Bezeichnung anpassen" },
  { value: "blur_request",     label: "Bereich blurren" },
  { value: "sweep_verschieben",label: "360°-Punkt verschieben" },
  { value: "sonstiges",        label: "Sonstiges" },
];

interface Props {
  tourId: string;
  tourLabel?: string | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export function TicketCreateDialog({ tourId, tourLabel, onClose, onSuccess }: Props) {
  const [category, setCategory] = useState<TicketCategory>("sonstiges");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleFile(f: File | null) {
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith("image/")) handleFile(f);
  }

  async function submit() {
    if (!subject.trim()) { setErr("Bitte einen Betreff eingeben."); return; }
    setBusy(true);
    setErr(null);
    try {
      let attachmentPath: string | undefined;
      if (file) {
        setUploading(true);
        const up = await postTicketUpload(file);
        attachmentPath = up.path;
        setUploading(false);
      }
      await postCreateTicket({
        module: "tours",
        reference_id: tourId,
        reference_type: "tour",
        category,
        subject: subject.trim(),
        description: description.trim() || undefined,
        link_url: linkUrl.trim() || undefined,
        attachment_path: attachmentPath,
      });
      setDone(true);
      onSuccess?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Fehler beim Erstellen");
    } finally {
      setBusy(false);
      setUploading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-lg min-h-0 rounded-2xl bg-[var(--bg-card)] shadow-[0_24px_60px_rgba(0,0,0,0.35)] flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ticket-dialog-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--border-soft)] shrink-0">
          <div>
            <h3 id="ticket-dialog-title" className="text-base font-semibold text-[var(--text-main)]">
              Änderung anfragen
            </h3>
            {tourLabel ? <p className="text-sm text-[var(--text-subtle)] mt-0.5">{tourLabel}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--border-soft)] p-1 text-[var(--text-subtle)] hover:text-[var(--text-main)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center justify-center gap-3 px-5 py-10 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <p className="text-base font-semibold text-[var(--text-main)]">Anfrage eingegangen</p>
            <p className="text-sm text-[var(--text-subtle)]">Deine Änderungsanfrage wurde gespeichert.</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 rounded-lg bg-[var(--accent)] px-5 py-2 text-sm font-medium text-white"
            >
              Schliessen
            </button>
          </div>
        ) : (
          <div className="min-h-0 overflow-y-auto flex-1 px-5 py-4 space-y-4">
            {/* Kategorie */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--text-subtle)]">Art der Änderung</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TicketCategory)}
                className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            {/* Betreff */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--text-subtle)]">Betreff <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="z.B. Startpunkt auf Eingang setzen"
                className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
              />
            </div>

            {/* Beschreibung */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--text-subtle)]">Beschreibung</label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Was genau soll geändert werden? Je mehr Details, desto besser."
                className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 resize-none"
              />
            </div>

            {/* Matterport-Link */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--text-subtle)]">
                <span className="flex items-center gap-1.5">
                  <Link2 className="h-3.5 w-3.5" />
                  Matterport-Link zur genauen Position (optional)
                </span>
              </label>
              <input
                type="text"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://my.matterport.com/show/?m=…&play=1&qs=1&…"
                className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
              />
              <p className="text-xs text-[var(--text-subtle)]">
                Öffne die Tour in Matterport, navigiere zur gewünschten Stelle und kopiere die URL aus der Browser-Adressleiste — sie enthält die genaue Position.
              </p>
            </div>

            {/* Screenshot */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--text-subtle)]">
                <span className="flex items-center gap-1.5">
                  <Upload className="h-3.5 w-3.5" />
                  Screenshot (optional, max. 4 MB)
                </span>
              </label>
              {preview ? (
                <div className="relative">
                  <img src={preview} alt="Vorschau" className="w-full max-h-40 object-contain rounded-lg border border-[var(--border-soft)]" />
                  <button
                    type="button"
                    onClick={() => { setFile(null); setPreview(null); }}
                    className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => fileRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border-soft)] bg-[var(--surface)] px-4 py-6 text-sm text-[var(--text-subtle)] cursor-pointer hover:border-[var(--accent)]/50 hover:text-[var(--text-main)] transition-colors"
                >
                  <Upload className="h-5 w-5" />
                  <span>Datei ablegen oder klicken zum Auswählen</span>
                  <span className="text-xs">JPG, PNG, WebP</span>
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
            </div>

            {err ? (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-950/40">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                <p className="text-sm text-red-700 dark:text-red-300">{err}</p>
              </div>
            ) : null}
          </div>
        )}

        {!done ? (
          <div className="flex shrink-0 justify-end gap-2 px-5 py-4 border-t border-[var(--border-soft)]">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg border border-[var(--border-soft)] px-4 py-2 text-sm font-medium text-[var(--text-main)] transition-opacity disabled:opacity-50"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || !subject.trim()}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? "Wird hochgeladen…" : busy ? "Wird gesendet…" : "Anfrage senden"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
