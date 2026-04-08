import { useState, useRef } from "react";
import { X, Upload, Loader2, AlertCircle } from "lucide-react";
import {
  postCreateTicket,
  postTicketUpload,
  type TicketCategory,
  type InboxMessage,
} from "../../../../api/toursAdmin";

const CATEGORIES: { value: TicketCategory; label: string }[] = [
  { value: "sonstiges", label: "Sonstiges" },
  { value: "startpunkt", label: "Startpunkt" },
  { value: "name_aendern", label: "Name ändern" },
  { value: "blur_request", label: "Blur-Anfrage" },
  { value: "sweep_verschieben", label: "Sweep verschieben" },
];

const PRIORITIES = [
  { value: "normal", label: "Normal" },
  { value: "high", label: "Hoch" },
  { value: "low", label: "Niedrig" },
];

type Props = {
  /** Tour-ID wenn direkt von Tour-Detail aufgerufen */
  tourId?: string | number;
  tourLabel?: string;
  /** Wenn aus E-Mail-Postfach aufgerufen: E-Mail-Daten vorab befüllen */
  emailData?: Pick<InboxMessage, "subject" | "bodyPreview" | "fromEmail" | "receivedAt"> & {
    customer_id?: number | null;
    reference_id?: string | null;
    reference_type?: string;
  };
  onClose: () => void;
  onCreated?: () => void;
};

export function TicketCreateDialog({ tourId, tourLabel, emailData, onClose, onCreated }: Props) {
  const [category, setCategory] = useState<TicketCategory>("sonstiges");
  const [subject, setSubject] = useState(
    emailData?.subject ? `E-Mail: ${emailData.subject}` : ""
  );
  const [description, setDescription] = useState(() => {
    if (!emailData) return "";
    const parts: string[] = [];
    if (emailData.fromEmail) parts.push(`Von: ${emailData.fromEmail}`);
    if (emailData.receivedAt) {
      parts.push(`Empfangen: ${new Date(emailData.receivedAt).toLocaleString("de-CH")}`);
    }
    if (emailData.bodyPreview) parts.push(`\n${emailData.bodyPreview}`);
    return parts.join("\n");
  });
  const [priority, setPriority] = useState("normal");
  const [uploading, setUploading] = useState(false);
  const [attachmentPath, setAttachmentPath] = useState<string | null>(null);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const referenceId = emailData?.reference_id ?? (tourId ? String(tourId) : null);
  const referenceType = emailData?.reference_type ?? (tourId ? "tour" : undefined);
  const customerId = emailData?.customer_id ?? null;

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const res = await postTicketUpload(file);
      setAttachmentPath(res.path);
      setAttachmentName(res.filename);
    } catch (err) {
      setError((err as Error).message ?? "Upload fehlgeschlagen");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim()) {
      setError("Bitte gib einen Betreff ein.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await postCreateTicket({
        category,
        subject: subject.trim(),
        description: description.trim() || undefined,
        priority,
        reference_id: referenceId,
        reference_type: referenceType,
        attachment_path: attachmentPath ?? undefined,
        customer_id: customerId,
      });
      onCreated?.();
      onClose();
    } catch (err) {
      setError((err as Error).message ?? "Fehler beim Erstellen");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-lg rounded-2xl bg-[var(--bg-card)] p-6 shadow-[0_24px_64px_rgba(0,0,0,0.4)] space-y-4 relative">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-main)]">Neues Ticket</h2>
            {(tourLabel || emailData?.fromEmail) && (
              <p className="text-xs text-[var(--text-subtle)] mt-0.5">
                {tourLabel ?? emailData?.fromEmail}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--border-soft)] p-1.5 text-[var(--text-subtle)] hover:text-[var(--text-main)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Kategorie */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-subtle)] uppercase tracking-wide">
              Kategorie
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as TicketCategory)}
              className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)]"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Betreff */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-subtle)] uppercase tracking-wide">
              Betreff <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Kurze Beschreibung des Anliegens"
              className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-main)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-[var(--accent)]"
              required
            />
          </div>

          {/* Beschreibung */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-subtle)] uppercase tracking-wide">
              Beschreibung
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Optionale Details…"
              className="w-full resize-none rounded-lg border border-[var(--border-soft)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-main)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          {/* Priorität */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-subtle)] uppercase tracking-wide">
              Priorität
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)]"
            >
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Screenshot Upload */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-subtle)] uppercase tracking-wide">
              Screenshot (optional)
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-main)] hover:border-[var(--accent)]/50 hover:text-[var(--accent)] transition-colors disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {uploading ? "Wird hochgeladen…" : "Datei wählen"}
              </button>
              {attachmentName && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--text-subtle)] truncate max-w-[160px]">
                    {attachmentName}
                  </span>
                  <button
                    type="button"
                    onClick={() => { setAttachmentPath(null); setAttachmentName(null); }}
                    className="text-[var(--text-subtle)] hover:text-red-400 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleUpload}
            />
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--border-soft)] px-4 py-2 text-sm font-medium text-[var(--text-subtle)] hover:text-[var(--text-main)] transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={saving || uploading}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saving ? "Wird erstellt…" : "Ticket erstellen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
