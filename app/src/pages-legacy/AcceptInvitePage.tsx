import { useState, useEffect, type FormEvent } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";

const INVITE_API = "/tour-manager/api/invite";

export function AcceptInvitePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";
  const [inviteEmail, setInviteEmail] = useState<string | null>(null);
  const [inviteExpires, setInviteExpires] = useState<string | null>(null);
  const [valid, setValid] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) { setValid(false); setError("Einladung fehlt."); return; }
    fetch(`${INVITE_API}/check?token=${encodeURIComponent(token)}`, { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d: { ok: boolean; valid: boolean; email?: string; expiresAt?: string; error?: string }) => {
        setValid(d.valid);
        if (d.email) setInviteEmail(d.email);
        if (d.expiresAt) setInviteExpires(new Date(d.expiresAt).toLocaleString("de-CH"));
        if (!d.valid) setError(d.error ?? "Einladung ungültig oder abgelaufen.");
      })
      .catch(() => { setValid(false); setError("Verbindungsfehler."); });
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${INVITE_API}/accept`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, passwordRepeat }),
      });
      const body = await res.json() as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Fehler beim Annehmen.");
      navigate("/login?accepted=1", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="aip-page">
      <style>{aipStyles}</style>
      <div className="aip-card">
        <div className="aip-brand">
          <img src="https://propus.ch/wp-content/uploads/2024/06/Asset-2-2.png" alt="Propus" />
        </div>
        <h1>Team-Einladung annehmen</h1>

        {error && <div className="aip-alert aip-alert-error">{error}</div>}

        {valid === null && <p style={{ textAlign: "center", color: "#706b63" }}>Einladung wird geprüft...</p>}

        {valid === false && (
          <div className="aip-back">
            <p style={{ color: "#706b63", marginBottom: "1rem" }}>Bitte nutze den vollständigen Einladungslink aus der E-Mail.</p>
            <a href="/login" onClick={(e) => { e.preventDefault(); navigate("/login"); }}>Zum Login</a>
          </div>
        )}

        {valid && (
          <>
            <p className="aip-meta">
              Einladung für <strong>{inviteEmail}</strong>
              {inviteExpires && <> · gültig bis <strong>{inviteExpires}</strong></>}
            </p>
            <form onSubmit={handleSubmit}>
              <label>Neues Passwort</label>
              <input
                type="password"
                required
                minLength={8}
                placeholder="Mindestens 8 Zeichen"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              <label>Passwort wiederholen</label>
              <input
                type="password"
                required
                minLength={8}
                placeholder="Passwort wiederholen"
                value={passwordRepeat}
                onChange={(e) => setPasswordRepeat(e.target.value)}
                autoComplete="new-password"
              />
              <div className="aip-actions">
                <button type="submit" disabled={loading}>
                  {loading ? "Wird angenommen..." : "Einladung annehmen"}
                </button>
                <a href="/login" onClick={(e) => { e.preventDefault(); navigate("/login"); }}>Abbrechen</a>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

const aipStyles = `
  .aip-page {
    font-family: 'Roboto', system-ui, sans-serif;
    min-height: 100vh;
    display: grid;
    place-items: center;
    background: #F1F2EA;
    color: #3b3833;
    padding: 1.5rem;
  }
  .aip-card {
    width: 100%;
    max-width: 520px;
    background: #fff;
    border: 1px solid #e8e6e2;
    border-radius: 18px;
    padding: 2rem;
    box-shadow: 0 12px 28px rgba(20,19,17,0.06);
  }
  .aip-brand { text-align: center; margin-bottom: 1.5rem; }
  .aip-brand img { height: 52px; width: auto; }
  .aip-card h1 {
    font-family: 'Montserrat', system-ui, sans-serif;
    font-size: 1.5rem;
    color: #111;
    text-align: center;
    margin-bottom: 1rem;
  }
  .aip-meta { color: #706b63; font-size: 0.9rem; margin-bottom: 1.25rem; text-align: center; }
  .aip-alert { padding: 0.8rem 0.9rem; border-radius: 10px; margin-bottom: 1rem; font-size: 0.88rem; }
  .aip-alert-error { background: #fef3f2; color: #b42318; border: 1px solid #fee4e2; }
  .aip-card label { display: block; margin-bottom: 0.35rem; color: #555; font-size: 0.84rem; font-weight: 500; }
  .aip-card input {
    width: 100%; padding: 0.78rem 0.95rem; border: 1px solid #e8e6e2;
    border-radius: 10px; font: inherit; margin-bottom: 1rem;
  }
  .aip-card input:focus { outline: none; border-color: #7A5E10; box-shadow: 0 0 0 3px rgba(182,142,32,0.2); }
  .aip-actions { display: flex; gap: 10px; flex-wrap: wrap; }
  .aip-card button {
    flex: 1; min-width: 160px; border: 0; border-radius: 10px; padding: 0.82rem 1rem;
    background: #7A5E10; color: #fff; font: inherit; font-weight: 600; cursor: pointer;
  }
  .aip-card button:hover { background: #5e470d; }
  .aip-card button:disabled { opacity: 0.7; cursor: not-allowed; }
  .aip-actions a, .aip-back a {
    color: #7A5E10; text-decoration: none; font-weight: 600; font-size: 0.9rem;
    display: inline-flex; align-items: center; padding: 0.82rem 1rem;
  }
  .aip-back { text-align: center; margin-top: 1rem; }
`;
