import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { pathSelektoAdmin } from "../../lib/selekto/paths";
import { createGalleryDraft } from "../../lib/selekto/galleryApi";

export function SelektoCreateRedirect() {
  const navigate = useNavigate();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const g = await createGalleryDraft();
        if (!cancelled) navigate(pathSelektoAdmin(`galleries/${g.id}`), { replace: true });
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Fehler");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (err) {
    return (
      <div className="admin-content">
        <p className="admin-msg admin-msg--err">{err}</p>
      </div>
    );
  }
  return (
    <div className="admin-content">
      <p className="admin-muted">Galerie wird angelegt…</p>
    </div>
  );
}
