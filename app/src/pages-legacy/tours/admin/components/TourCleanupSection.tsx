import { useCallback, useState } from "react";
import { Eye, EyeOff, Mail, Loader2, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import {
  getCleanupSandboxPreview,
  postCleanupSendSingle,
  type CleanupSandboxPreview,
} from "../../../../api/toursAdmin";
import { useQuery } from "../../../../hooks/useQuery";

type Props = {
  tourId: string;
  cleanupSentAt?: string | null;
  cleanupAction?: string | null;
  onRefresh?: () => void;
};

function SandboxPreviewPanel({ tourId, onClose }: { tourId: string; onClose: () => void }) {
  const queryFn = useCallback(() => getCleanupSandboxPreview(tourId), [tourId]);
  const { data, loading, error } = useQuery(`cleanup:sandbox:${tourId}`, queryFn, { staleTime: 60_000 });

  const preview = data as ({ ok: true } & CleanupSandboxPreview) | undefined;

  return (
    <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-card)] mt-2 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-[var(--surface-card-strong)] border-b border-[var(--border-soft)]">
        <span className="text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wide">Sandbox-Vorschau</span>
        <button
          type="button"
          onClick={onClose}
          className="text-[var(--text-subtle)] hover:text-[var(--text-main)] text-xs"
        >
          ✕ Schliessen
        </button>
      </div>
      {loading && (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" />
        </div>
      )}
      {error && <p className="px-4 py-3 text-xs text-red-600">{error}</p>}
      {preview && (
        <div className="px-4 py-3 space-y-3">
          {!preview.withinCleanupWindow && preview.withinCleanupWindowNote && (
            <div className="flex gap-2 rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs text-yellow-800 dark:bg-yellow-950/30 dark:border-yellow-800 dark:text-yellow-300">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              {preview.withinCleanupWindowNote}
            </div>
          )}
          {preview.needsManualReview && (
            <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-300">
              Manueller Review erforderlich — kein automatischer Preis
            </div>
          )}
          <div className="text-xs space-y-1">
            <p><span className="text-[var(--text-subtle)]">Status:</span> <span className="font-medium">{preview.statusLabel}</span></p>
            <p><span className="text-[var(--text-subtle)]">E-Mail:</span> {preview.email || "—"}</p>
            <p><span className="text-[var(--text-subtle)]">Bereits versendet:</span> {preview.alreadySent ? "Ja" : "Nein"}</p>
            <p><span className="text-[var(--text-subtle)]">Aktion gewählt:</span> {preview.alreadyDone ? "Ja" : "Nein"}</p>
            {preview.rule.needsInvoice && (
              <p><span className="text-[var(--text-subtle)]">Rechnungsbetrag:</span> <span className="font-medium">CHF {preview.rule.invoiceAmount}.—</span></p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--text-subtle)] uppercase tracking-wide mb-1">Betreff</p>
            <p className="text-xs bg-[var(--surface)] rounded px-3 py-2 border border-[var(--border-soft)]">{preview.mail.subject}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--text-subtle)] uppercase tracking-wide mb-1">Mail-Vorschau (HTML)</p>
            <div
              className="rounded border border-[var(--border-soft)] overflow-auto max-h-80 bg-white text-xs"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: preview.mail.html }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function TourCleanupSection({ tourId, cleanupSentAt, cleanupAction, onRefresh }: Props) {
  const [sandboxOpen, setSandboxOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; message?: string; error?: string } | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);

  async function handleSend() {
    setConfirmSend(false);
    setSending(true);
    setSendResult(null);
    try {
      const r = await postCleanupSendSingle(tourId);
      setSendResult({ ok: true, message: `Mail versendet an ${r.recipientEmail || "?"}.` });
      onRefresh?.();
    } catch (e) {
      setSendResult({ ok: false, error: e instanceof Error ? e.message : "Fehler beim Versand" });
    } finally {
      setSending(false);
    }
  }

  const alreadySent = !!cleanupSentAt;
  const alreadyDone = !!cleanupAction;

  return (
    <section className="surface-card-strong p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-[var(--text-main)]">Bereinigungslauf</h2>
          <p className="text-xs text-[var(--text-subtle)] mt-0.5">
            Sandbox-Testlauf · kein produktiver Effekt
          </p>
        </div>
        {(alreadySent || alreadyDone) && (
          <div className="text-xs text-[var(--text-subtle)]">
            {alreadyDone
              ? <span className="text-green-700 font-medium">Aktion: {cleanupAction}</span>
              : <span>Versendet: {cleanupSentAt}</span>
            }
          </div>
        )}
      </div>

      <p className="text-xs text-[var(--text-subtle)]">
        Vorschau des Bereinigungsmail-Inhalts, erkannter Status und simulierter Folgeaktionen — ohne Versand, ohne Token-Erstellung und ohne Datenbankänderungen.
      </p>

      {sendResult && (
        <div className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs ${sendResult.ok ? "bg-emerald-50 border border-emerald-200 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300" : "bg-red-50 border border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-900 dark:text-red-300"}`}>
          {sendResult.ok
            ? <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            : <XCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          }
          {sendResult.ok ? sendResult.message : sendResult.error}
        </div>
      )}

      {confirmSend && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-800 px-3 py-2.5 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-orange-800 dark:text-orange-300">
              Bereinigungsmail wird <strong>produktiv</strong> an den Kunden gesendet und ein Token erstellt. Dieser Vorgang kann nicht rückgängig gemacht werden.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={sending}
              onClick={() => void handleSend()}
              className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
            >
              Ja, jetzt senden
            </button>
            <button
              type="button"
              onClick={() => setConfirmSend(false)}
              className="rounded-lg border border-[var(--border-soft)] px-3 py-1.5 text-xs text-[var(--text-subtle)] hover:text-[var(--text-main)]"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSandboxOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-soft)] px-3 py-1.5 text-xs font-medium text-[var(--text-main)] hover:bg-[var(--surface-card-strong)] transition-colors"
        >
          {sandboxOpen ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {sandboxOpen ? "Vorschau schliessen" : "🔬 Sandbox-Vorschau laden"}
        </button>

        {!alreadySent && !alreadyDone && !confirmSend && (
          <button
            type="button"
            disabled={sending}
            onClick={() => setConfirmSend(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--accent)]/30 px-3 py-1.5 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
            📧 Mail jetzt senden (produktiv)
          </button>
        )}

        {(alreadySent || alreadyDone) && !sendResult && (
          <span className="inline-flex items-center gap-1 text-xs text-[var(--text-subtle)] px-3 py-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
            {alreadyDone ? "Aktion bereits ausgeführt" : "Mail bereits versendet"}
          </span>
        )}
      </div>

      {sandboxOpen && (
        <SandboxPreviewPanel tourId={tourId} onClose={() => setSandboxOpen(false)} />
      )}
    </section>
  );
}
