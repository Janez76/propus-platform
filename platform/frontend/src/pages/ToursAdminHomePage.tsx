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
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Tour Manager</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Die vollständige Admin-Oberfläche (Touren, Rechnungen, Matterport, …) läuft unter{" "}
        <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">/tour-manager</code>. Später kann diese Ansicht in React
        portiert werden.
      </p>
      <a
        href={adminUrl}
        className="inline-flex rounded-lg bg-[#C5A059] px-4 py-2 text-sm font-medium text-white hover:opacity-95"
      >
        Tour Manager öffnen
      </a>
    </div>
  );
}
