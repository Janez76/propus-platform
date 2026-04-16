import { useState, useEffect, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { portalCheckResetToken, portalResetPassword } from "../../api/portalTours";

const LOGO_URL = "https://propus.ch/wp-content/uploads/2024/06/Asset-2-2.png";

export function PortalResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [tokenEmail, setTokenEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setTokenValid(false);
      return;
    }
    portalCheckResetToken(token)
      .then((r) => { setTokenValid(r.valid); setTokenEmail(r.email); })
      .catch(() => setTokenValid(false));
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== passwordRepeat) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }
    if (password.length < 8) {
      setError("Passwort muss mindestens 8 Zeichen lang sein.");
      return;
    }
    setLoading(true);
    try {
      await portalResetPassword(token, password);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern.");
    } finally {
      setLoading(false);
    }
  }

  if (tokenValid === null) {
    return (
      <div className="portal-pw-page">
        <style>{portalPwStyles}</style>
        <div className="portal-pw-card" style={{ textAlign: "center" }}>
          <div className="portal-pw-brand"><img src={LOGO_URL} alt="Propus" /></div>
          <p>Token wird geprüft...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="portal-pw-page">
      <style>{portalPwStyles}</style>
      <div className="portal-pw-card">
        <div className="portal-pw-brand">
          <img src={LOGO_URL} alt="Propus" />
        </div>
        <h1>Neues Passwort</h1>
        <p className="portal-pw-sub">Setzen Sie ein neues Passwort für Ihr Kundenportal-Konto.</p>

        {error && <div className="portal-pw-alert portal-pw-alert-error">{error}</div>}
        {success && (
          <div className="portal-pw-alert portal-pw-alert-success">
            Passwort gespeichert. Sie können sich jetzt anmelden.
          </div>
        )}

        {tokenValid && !success ? (
          <>
            {tokenEmail && <div className="portal-pw-meta">{tokenEmail}</div>}
            <form onSubmit={handleSubmit}>
              <label htmlFor="portal-new-pw">Neues Passwort</label>
              <input
                type="password"
                id="portal-new-pw"
                minLength={8}
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <label htmlFor="portal-pw-repeat">Neues Passwort wiederholen</label>
              <input
                type="password"
                id="portal-pw-repeat"
                minLength={8}
                required
                autoComplete="new-password"
                value={passwordRepeat}
                onChange={(e) => setPasswordRepeat(e.target.value)}
              />
              <button type="submit" disabled={loading}>
                {loading ? "Wird gespeichert..." : "Passwort speichern"}
              </button>
            </form>
          </>
        ) : !success ? (
          <div className="portal-pw-back">
            <a
              href="/portal/forgot-password"
              onClick={(e) => { e.preventDefault(); navigate("/portal/forgot-password"); }}
            >
              Neuen Link anfordern
            </a>
          </div>
        ) : null}

        <div className="portal-pw-back">
          <a
            href={success ? "/login?success=password_reset" : "/login"}
            onClick={(e) => {
              e.preventDefault();
              navigate(success ? "/login?success=password_reset" : "/login");
            }}
          >
            Zurück zum Login
          </a>
        </div>
      </div>
    </div>
  );
}

const portalPwStyles = `
  .portal-pw-page {
    font-family: 'Roboto', system-ui, sans-serif;
    min-height: 100vh;
    display: grid;
    place-items: center;
    background: #F1F2EA;
    color: #3b3833;
    padding: 1.5rem;
  }
  .portal-pw-card {
    width: 100%;
    max-width: 460px;
    background: #fff;
    border: 1px solid #e8e6e2;
    border-radius: 18px;
    padding: 2rem;
    box-shadow: 0 12px 28px rgba(20, 19, 17, 0.06);
  }
  .portal-pw-brand { text-align: center; margin-bottom: 1.5rem; }
  .portal-pw-brand img { height: 52px; width: auto; }
  .portal-pw-card h1 {
    font-family: 'Montserrat', system-ui, sans-serif;
    font-size: 1.7rem;
    color: #111;
    text-align: center;
    margin-bottom: 0.5rem;
  }
  .portal-pw-sub { color: #555; text-align: center; line-height: 1.55; margin-bottom: 1.5rem; }
  .portal-pw-alert {
    padding: 0.8rem 0.9rem;
    border-radius: 10px;
    margin-bottom: 1rem;
    font-size: 0.88rem;
  }
  .portal-pw-alert-error { background: #fef3f2; color: #b42318; border: 1px solid #fee4e2; }
  .portal-pw-alert-success { background: #ecfdf3; color: #027a48; border: 1px solid #abefc6; }
  .portal-pw-meta { font-size: 0.82rem; color: #888; margin-top: -0.5rem; margin-bottom: 1rem; text-align: center; }
  .portal-pw-card label { display: block; margin-bottom: 0.35rem; color: #555; font-size: 0.84rem; }
  .portal-pw-card input {
    width: 100%;
    padding: 0.78rem 0.95rem;
    border: 1px solid #e8e6e2;
    border-radius: 10px;
    font: inherit;
    margin-bottom: 1rem;
  }
  .portal-pw-card input:focus {
    outline: none;
    border-color: #B68E20;
    box-shadow: 0 0 0 3px rgba(182, 142, 32, 0.2);
  }
  .portal-pw-card button {
    width: 100%;
    border: 0;
    border-radius: 10px;
    padding: 0.82rem 1rem;
    background: #B68E20;
    color: #fff;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .portal-pw-card button:hover { background: #9a7619; }
  .portal-pw-card button:disabled { opacity: 0.7; cursor: not-allowed; }
  .portal-pw-back { margin-top: 1rem; text-align: center; font-size: 0.84rem; }
  .portal-pw-back a { color: #B68E20; text-decoration: none; font-weight: 600; }
`;
