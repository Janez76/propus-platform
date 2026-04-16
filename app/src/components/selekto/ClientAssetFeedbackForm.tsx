import { useState } from "react";

type Props = {
  assetLabel: string;
  onSubmit: (text: string) => Promise<void>;
  className?: string;
};

export function ClientAssetFeedbackForm({ assetLabel, onSubmit, className }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    setBusy(true);
    try {
      await onSubmit(text);
      setText("");
      setDone(true);
      window.setTimeout(() => setDone(false), 5000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`client-asset-feedback${className ? ` ${className}` : ""}`}>
      <p className="client-asset-feedback__hint">
        Ihre Anmerkung zu <strong>{assetLabel}</strong>
      </p>
      <textarea
        className="client-asset-feedback__input"
        rows={3}
        maxLength={4000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="z. B. dieses Bild bitte austauschen, Farben wirken hier kühl …"
        disabled={busy}
      />
      <div className="client-asset-feedback__actions">
        <button type="button" className="btn btn--outline btn--sm" disabled={busy || !text.trim()} onClick={() => void submit()}>
          {busy ? "Wird gesendet…" : "Kommentar senden"}
        </button>
      </div>
      {err ? <p className="client-asset-feedback__err" role="alert">{err}</p> : null}
      {done ? (
        <p className="client-asset-feedback__ok" role="status">
          Vielen Dank – Ihr Feedback wurde übermittelt.
        </p>
      ) : null}
    </div>
  );
}
