import { useState, useEffect, useRef, type FormEvent } from "react";
import { getPortalProfile, updatePortalProfile, changePortalPassword } from "../../api/portalTours";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function PortalProfileModal({ open, onClose }: Props) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSuccess(null);
    setCurrentPw("");
    setNewPw("");
    setNewPw2("");
    setPhotoFile(null);
    setRemovePhoto(false);
    if (fileRef.current) fileRef.current.value = "";
    getPortalProfile()
      .then((r) => {
        setDisplayName(r.displayName || "");
        setEmail(r.email || "");
      })
      .catch((e) => setError(e.message));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("displayName", displayName);
      if (removePhoto) fd.append("removePhoto", "1");
      if (photoFile) fd.append("photo", photoFile);
      await updatePortalProfile(fd);
      setSuccess("Profil gespeichert.");
      setPhotoFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  }

  async function handleSavePassword() {
    setError(null);
    setSuccess(null);
    if (newPw !== newPw2) {
      setError("Die neuen Passwörter stimmen nicht überein.");
      return;
    }
    if (newPw.length < 8) {
      setError("Passwort muss mindestens 8 Zeichen lang sein.");
      return;
    }
    setSavingPw(true);
    try {
      await changePortalPassword(currentPw, newPw);
      setCurrentPw("");
      setNewPw("");
      setNewPw2("");
      setSuccess("Passwort geändert.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSavingPw(false);
    }
  }

  return (
    <>
      <style>{modalStyles}</style>
      <div className="ppm-backdrop" onClick={onClose} />
      <div className="ppm-dialog" role="dialog" aria-modal="true">
        <div className="ppm-panel">
          <div className="ppm-head">
            <div>
              <h2 className="ppm-title">Profil bearbeiten</h2>
              <p className="ppm-sub">Kontodaten &amp; Erscheinungsbild</p>
            </div>
            <button type="button" className="ppm-close" onClick={onClose} aria-label="Schließen">&times;</button>
          </div>

          <div className="ppm-body">
            <form onSubmit={handleSaveProfile}>
              <div className="ppm-section">
                <div className="ppm-section-title">Persönliche Angaben</div>
                <label className="ppm-label">Anzeigename</label>
                <input
                  type="text"
                  className="ppm-input"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={120}
                  placeholder="Vor- und Nachname"
                  autoComplete="name"
                />
              </div>

              <div className="ppm-section">
                <div className="ppm-section-title">Passwort ändern</div>
                <p className="ppm-hint">Ihr Login wird intern im Kundenportal verwaltet.</p>
                <label className="ppm-label">Aktuelles Passwort</label>
                <input type="password" className="ppm-input" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} autoComplete="current-password" />
                <label className="ppm-label">Neues Passwort</label>
                <input type="password" className="ppm-input" value={newPw} onChange={(e) => setNewPw(e.target.value)} minLength={8} autoComplete="new-password" />
                <label className="ppm-label">Neues Passwort wiederholen</label>
                <input type="password" className="ppm-input" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} minLength={8} autoComplete="new-password" />
                <button type="button" className="ppm-btn ppm-btn-secondary" onClick={handleSavePassword} disabled={savingPw}>
                  {savingPw ? "Wird gespeichert..." : "Passwort speichern"}
                </button>
              </div>

              <div className="ppm-section">
                <div className="ppm-section-title">Anmeldung &amp; Sicherheit</div>
                <label className="ppm-label">E-Mail-Adresse (Login)</label>
                <input type="text" className="ppm-input ppm-input-readonly" value={email} readOnly tabIndex={-1} />
                <p className="ppm-hint">Nur Anzeige. Die Login-E-Mail ist mit Ihren Touren bzw. Team-Zugriffen verknüpft.</p>
              </div>

              <div className="ppm-section">
                <div className="ppm-section-title">Profilfoto</div>
                <label className="ppm-upload">
                  <span className="ppm-upload-inner">
                    <span className="ppm-upload-text"><strong>Datei wählen</strong> oder hier ablegen</span>
                    <span className="ppm-upload-meta">JPG, PNG, GIF, WebP · max. 512 KB</span>
                  </span>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="ppm-file-native"
                    onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                {photoFile && <p className="ppm-file-name">Ausgewählt: {photoFile.name}</p>}
                <label className="ppm-check">
                  <input type="checkbox" checked={removePhoto} onChange={(e) => setRemovePhoto(e.target.checked)} />
                  <span>Profilfoto entfernen</span>
                </label>
              </div>

              {error && <p className="ppm-error">{error}</p>}
              {success && <p className="ppm-ok">{success}</p>}

              <div className="ppm-actions">
                <button type="button" className="ppm-btn ppm-btn-ghost" onClick={onClose}>Abbrechen</button>
                <button type="submit" className="ppm-btn ppm-btn-primary" disabled={saving}>
                  {saving ? "Speichern..." : "Profil speichern"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}

const modalStyles = `
  .ppm-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 9998;
  }
  .ppm-dialog {
    position: fixed; inset: 0; z-index: 9999;
    display: flex; align-items: center; justify-content: center;
    padding: 1rem;
  }
  .ppm-panel {
    background: #fff; border-radius: 16px; width: 100%; max-width: 520px;
    max-height: 90vh; display: flex; flex-direction: column;
    box-shadow: 0 24px 48px rgba(0,0,0,0.18);
  }
  .ppm-head {
    display: flex; justify-content: space-between; align-items: flex-start;
    padding: 1.25rem 1.5rem; border-bottom: 1px solid #e8e6e2;
  }
  .ppm-title { font-size: 1.15rem; font-weight: 600; color: #111; margin: 0; }
  .ppm-sub { font-size: 0.82rem; color: #706b63; margin: 2px 0 0; }
  .ppm-close {
    background: none; border: none; font-size: 1.5rem; cursor: pointer;
    color: #706b63; padding: 4px 8px; line-height: 1;
  }
  .ppm-close:hover { color: #111; }
  .ppm-body { padding: 1.25rem 1.5rem; overflow-y: auto; flex: 1; }
  .ppm-section { margin-bottom: 1.25rem; }
  .ppm-section-title {
    font-size: 0.88rem; font-weight: 600; color: #3b3833;
    margin-bottom: 0.75rem; display: flex; align-items: center; gap: 6px;
  }
  .ppm-label { display: block; font-size: 0.82rem; color: #706b63; margin-bottom: 4px; }
  .ppm-hint { font-size: 0.78rem; color: #a09b92; margin-top: -4px; margin-bottom: 0.75rem; }
  .ppm-input {
    width: 100%; padding: 0.65rem 0.85rem; border: 1px solid #e8e6e2;
    border-radius: 8px; font: inherit; font-size: 0.9rem; margin-bottom: 0.75rem;
  }
  .ppm-input:focus { outline: none; border-color: #B68E20; box-shadow: 0 0 0 3px rgba(182,142,32,0.15); }
  .ppm-input-readonly { background: #f3f2ef; color: #706b63; cursor: default; }
  .ppm-upload {
    display: block; border: 2px dashed #e8e6e2; border-radius: 12px;
    padding: 1.25rem; text-align: center; cursor: pointer; margin-bottom: 0.75rem;
    transition: border-color 0.2s;
  }
  .ppm-upload:hover { border-color: #B68E20; }
  .ppm-upload-inner { display: flex; flex-direction: column; gap: 4px; }
  .ppm-upload-text { font-size: 0.88rem; color: #3b3833; }
  .ppm-upload-meta { font-size: 0.75rem; color: #a09b92; }
  .ppm-file-native { display: none; }
  .ppm-file-name { font-size: 0.82rem; color: #B68E20; margin-bottom: 0.75rem; }
  .ppm-check {
    display: flex; align-items: center; gap: 8px;
    font-size: 0.85rem; color: #3b3833; cursor: pointer;
  }
  .ppm-check input { accent-color: #B68E20; }
  .ppm-error { color: #b42318; font-size: 0.85rem; background: #fef3f2; padding: 8px 12px; border-radius: 8px; margin-bottom: 0.75rem; }
  .ppm-ok { color: #027a48; font-size: 0.85rem; background: #ecfdf3; padding: 8px 12px; border-radius: 8px; margin-bottom: 0.75rem; }
  .ppm-actions {
    display: flex; justify-content: flex-end; gap: 10px;
    padding-top: 0.75rem; border-top: 1px solid #e8e6e2;
  }
  .ppm-btn {
    padding: 0.6rem 1.2rem; border-radius: 10px; font: inherit;
    font-size: 0.9rem; font-weight: 600; cursor: pointer; border: none;
  }
  .ppm-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .ppm-btn-primary { background: #B68E20; color: #fff; }
  .ppm-btn-primary:hover { background: #9a7619; }
  .ppm-btn-secondary { background: #f3f2ef; color: #3b3833; margin-top: 4px; }
  .ppm-btn-secondary:hover { background: #e8e6e2; }
  .ppm-btn-ghost { background: none; color: #706b63; }
  .ppm-btn-ghost:hover { background: #f3f2ef; }
`;
