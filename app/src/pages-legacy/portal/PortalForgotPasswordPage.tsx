import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { portalForgotPassword } from "../../api/portalTours";

const LOGO_URL = "https://propus.ch/wp-content/uploads/2024/06/Asset-2-2.png";

export function PortalForgotPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const r = await portalForgotPassword(email.trim());
      setSuccess(r.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Senden.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="portal-pw-page">
      <style>{portalPwStyles}</style>
      <div className="portal-pw-card">
        <div className="portal-pw-brand">
          <img src={LOGO_URL} alt="Propus" />
        </div>
        <h1>Passwort setzen</h1>
        <p className="portal-pw-sub">
          Geben Sie Ihre E-Mail-Adresse ein. Falls ein Zugang existiert, senden wir Ihnen einen Link zum Setzen oder Zurücksetzen Ihres Passworts.
        </p>

        {error && <div className="portal-pw-alert portal-pw-alert-error">{error}</div>}
        {success && <div className="portal-pw-alert portal-pw-alert-success">{success}</div>}

        <form onSubmit={handleSubmit}>
          <label htmlFor="portal-pw-email">E-Mail</label>
          <input
            type="email"
            id="portal-pw-email"
            placeholder="z.B. info@firma.ch"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <button type="submit" disabled={loading}>
            {loading ? "Wird gesendet..." : "Link senden"}
          </button>
        </form>

        <div className="portal-pw-back">
          <a
            href="/portal/login"
            onClick={(e) => { e.preventDefault(); navigate("/portal/login"); }}
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
