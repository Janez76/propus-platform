import { useGalleryAuth } from "../auth/GalleryAuthContext.tsx";
import "./gallery-admin-supplement.css";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useGalleryAuth();

  if (loading) {
    return (
      <div className="gal-admin-auth-wait">
        <p className="gal-admin-auth-wait__text">Laden…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="gal-admin-auth-wait gal-admin-auth-wait--blocked">
        <p className="gal-admin-auth-wait__text">Kein Zugang</p>
        <p className="gal-admin-auth-wait__hint">
          Bitte den vollständigen <strong>Magic-Link</strong> aus der Einladung öffnen — er enthält den Zugangscode in
          der Adresszeile (<code className="gal-admin-auth-wait__code">?key=…</code>).
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
