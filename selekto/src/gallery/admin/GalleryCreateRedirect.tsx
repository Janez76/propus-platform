import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { pathListingAdmin } from "../../paths.ts";
import { createGalleryDraft } from "../galleryApi.ts";

export function GalleryCreateRedirect() {
  const navigate = useNavigate();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const g = await createGalleryDraft();
        if (!cancelled) navigate(pathListingAdmin(`galleries/${g.id}`), { replace: true });
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
