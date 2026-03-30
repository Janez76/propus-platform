import { useMemo } from "react";

/**
 * Verweis auf den Tour-Manager (EJS), gemountet unter /tour-manager auf derselben Origin.
 */
export function ToursAdminHomePage() {
  const adminUrl = useMemo(() => {
    if (typeof window === "undefined") return "/tour-manager/admin";
    return `${window.location.origin}/tour-manager/admin`;
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-[var(--text-main)]">Tour Manager</h1>
      <p className="text-sm text-[var(--text-subtle)]">
        Die vollständige Admin-Oberfläche (Touren, Rechnungen, Matterport, …) läuft unter{" "}
        <code className="rounded bg-zinc-100 px-1 bg-[var(--surface-raised)]">/tour-manager</code>. Später kann diese Ansicht in React
        portiert werden.
      </p>
      <a
        href={adminUrl}
        className="inline-flex rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-95"
      >
        Tour Manager öffnen
      </a>
    </div>
  );
}


