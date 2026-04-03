import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { portalLogin } from "../../api/portalTours";

const LOGO_URL = "https://propus.ch/wp-content/uploads/2024/06/Asset-2-2.png";
const BG_URL = "https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=1200&q=80";

export function PortalLoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const successParam = params.get("success");
  const successMap: Record<string, string> = {
    password_reset: "Passwort gespeichert. Sie können sich jetzt anmelden.",
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await portalLogin(email.trim(), password, rememberMe);
      const next = params.get("next");
      navigate(next?.startsWith("/") ? next : "/portal/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Anmeldung fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="portal-login-layout">
      <style>{portalLoginStyles}</style>
      <div className="portal-login-visual">
        <a href="https://propus.ch" target="_blank" rel="noreferrer" className="portal-visual-logo">
          <img src={LOGO_URL} alt="Propus" />
        </a>
        <div className="portal-visual-content">
          <p className="portal-visual-quote">
            Ihre Immobilien-Touren<br /><span>einfach im Blick</span>
          </p>
          <p className="portal-visual-sub">
            Verwalten Sie Ihre VR-Touren einfach, flexibel und ganz nach Ihrem Bedarf.
          </p>
        </div>
      </div>

      <div className="portal-login-form-side">
        <div className="portal-login-form-wrap">
          <div className="portal-brand-wrap">
            <a href="https://propus.ch" target="_blank" rel="noreferrer">
              <img src={LOGO_URL} alt="Propus" />
            </a>
          </div>

          <div className="portal-login-header">
            <h1>Willkommen zurück</h1>
            <p>Melden Sie sich an, um Ihre Touren und Rechnungen im Kundenportal zu verwalten.</p>
          </div>

          {error && <div className="portal-login-error">{error}</div>}
          {successParam && successMap[successParam] && (
            <div className="portal-login-success">{successMap[successParam]}</div>
          )}

          <form onSubmit={handleSubmit} className="portal-login-form">
            <div className="portal-form-group">
              <label htmlFor="portal-email">E-Mail</label>
              <input
                type="email"
                id="portal-email"
                placeholder="z.B. info@firma.ch"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
              />
            </div>
            <div className="portal-form-group">
              <label htmlFor="portal-password">Passwort</label>
              <input
                type="password"
                id="portal-password"
                placeholder="Passwort eingeben"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <div className="portal-login-options">
              <label className="portal-form-checkbox">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>Angemeldet bleiben</span>
              </label>
              <a
                href={`/portal/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ""}`}
                className="portal-forgot-link"
                onClick={(e) => {
                  e.preventDefault();
                  navigate(`/portal/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ""}`);
                }}
              >
                Passwort vergessen?
              </a>
            </div>
            <button type="submit" disabled={loading}>
              {loading ? "Wird angemeldet..." : "Anmelden"}
            </button>
          </form>

          <div className="portal-login-footer">
            <p>Propus Real Estate Photography - by Propus GmbH</p>
          </div>
        </div>
      </div>
    </div>
  );
}

const portalLoginStyles = `
  .portal-login-layout {
    display: grid;
    grid-template-columns: 1.1fr 0.9fr;
    min-height: 100vh;
    font-family: 'Roboto', system-ui, sans-serif;
  }
  .portal-login-visual {
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: flex-start;
    padding: 48px;
  }
  .portal-login-visual::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
      linear-gradient(180deg, rgba(16,24,40,0.15) 0%, rgba(16,24,40,0.92) 100%),
      url('${BG_URL}') center/cover;
    transition: transform 20s linear;
  }
  .portal-login-visual:hover::before { transform: scale(1.05); }
  .portal-visual-content {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 560px;
  }
  .portal-visual-logo {
    position: absolute;
    top: 40px;
    left: 48px;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 12px;
    text-decoration: none;
    opacity: 0;
    animation: portalFadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.3s forwards;
  }
  .portal-visual-logo img { height: 48px; width: auto; object-fit: contain; }
  .portal-visual-quote {
    margin: 0;
    color: #fff;
    font-family: 'Montserrat', system-ui, sans-serif;
    font-size: clamp(2rem, 3.4vw, 3.05rem);
    line-height: 1.25;
    margin-bottom: 18px;
    opacity: 0;
    animation: portalFadeInUp 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.5s forwards;
  }
  .portal-visual-quote span { color: #c9a22a; }
  .portal-visual-sub {
    color: rgba(255,255,255,0.82);
    font-size: 0.95rem;
    line-height: 1.6;
    max-width: 440px;
  }
  .portal-login-form-side {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 48px;
    background: #fff;
    position: relative;
    overflow: hidden;
  }
  .portal-login-form-side::after {
    content: '';
    position: absolute;
    inset: 0;
    background: #fff;
    transform-origin: right;
    animation: portalRevealOverlay 0.7s cubic-bezier(0.65, 0, 0.35, 1) 0.15s forwards;
    z-index: 10;
    pointer-events: none;
  }
  .portal-login-form-wrap {
    width: 100%;
    max-width: 380px;
    text-align: center;
    opacity: 0;
    animation: portalFadeInScale 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.6s forwards;
  }
  .portal-brand-wrap { margin-bottom: 40px; }
  .portal-brand-wrap img { height: 52px; width: auto; object-fit: contain; display: inline-block; }
  .portal-login-header { margin-bottom: 28px; text-align: center; }
  .portal-login-header h1 {
    font-family: 'Montserrat', system-ui, sans-serif;
    font-size: 1.56rem;
    margin-bottom: 6px;
    letter-spacing: -0.01em;
    color: #111;
  }
  .portal-login-header p { color: #706b63; font-size: 0.92rem; }
  .portal-login-form {
    display: flex;
    flex-direction: column;
    gap: 18px;
    text-align: left;
  }
  .portal-login-error,
  .portal-login-success {
    display: block;
    padding: 10px 14px;
    border-radius: 10px;
    font-size: 0.8rem;
    text-align: left;
    margin-bottom: 12px;
  }
  .portal-login-error {
    background: #fef3f2;
    border: 1px solid #fee4e2;
    color: #b42318;
  }
  .portal-login-success {
    background: #ecfdf3;
    border: 1px solid #abefc6;
    color: #027a48;
  }
  .portal-login-form label {
    display: block;
    font-size: 0.84rem;
    font-weight: 500;
    margin-bottom: 0.38rem;
    color: #706b63;
  }
  .portal-login-form input[type="email"],
  .portal-login-form input[type="password"] {
    width: 100%;
    padding: 0.72rem 0.95rem;
    background: #fff;
    border: 1px solid #e8e6e1;
    border-radius: 8px;
    color: #111;
    font-size: 0.94rem;
    font-family: inherit;
  }
  .portal-login-form input:focus {
    outline: none;
    border-color: #B68E20;
    box-shadow: 0 0 0 3px rgba(176, 140, 62, 0.15);
  }
  .portal-login-form button {
    width: 100%;
    padding: 0.82rem 1rem;
    background: #B68E20;
    color: #fff;
    border: none;
    border-radius: 10px;
    font-size: 1rem;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.2s, transform 0.1s;
  }
  .portal-login-form button:hover { background: #9a7619; }
  .portal-login-form button:active { transform: scale(0.98); }
  .portal-login-form button:disabled { opacity: 0.7; cursor: not-allowed; }
  .portal-login-options {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: -6px;
  }
  .portal-form-checkbox {
    font-size: 0.875rem;
    color: #3b3833;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }
  .portal-form-checkbox input {
    width: 16px;
    height: 16px;
    cursor: pointer;
    accent-color: #B68E20;
  }
  .portal-forgot-link {
    font-size: 0.76rem;
    color: #B68E20;
    font-weight: 500;
    text-decoration: none;
  }
  .portal-forgot-link:hover { color: #9a7619; }
  .portal-login-footer { margin-top: 28px; text-align: center; }
  .portal-login-footer p { font-size: 0.76rem; color: #a09b92; }
  @keyframes portalFadeInUp {
    from { opacity: 0; transform: translateY(30px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes portalFadeInScale {
    from { opacity: 0; transform: scale(0.92); }
    to { opacity: 1; transform: scale(1); }
  }
  @keyframes portalRevealOverlay {
    from { transform: scaleX(1); }
    to { transform: scaleX(0); }
  }
  @media (max-width: 900px) {
    .portal-login-layout { grid-template-columns: 1fr; }
    .portal-login-visual { display: none; }
    .portal-login-form-side { border-radius: 0; padding: 32px 24px; }
    .portal-login-form-side::after { display: none; }
  }
`;
