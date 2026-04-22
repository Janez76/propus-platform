"use client";

import { useCallback, useEffect, useState } from "react";
import { getAuthMe } from "@/api/profile";
import { stopImpersonation } from "@/api/customers";
import { normalizeStoredRole, useAuthStore } from "@/store/authStore";

/**
 * Sticky-Banner, wenn Intern-Admin per Impersonation als Kunde arbeitet.
 */
export function ImpersonateBanner() {
  const token = useAuthStore((s) => s.token);
  const setAuth = useAuthStore((s) => s.setAuth);
  const [me, setMe] = useState<{
    isImpersonating: boolean;
    impersonatorEmail: string | null;
    email: string;
    role: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (!token) {
      setMe(null);
      return;
    }
    try {
      const d = await getAuthMe(token);
      if (d?.ok) {
        setMe({
          isImpersonating: d.isImpersonating,
          impersonatorEmail: d.impersonatorEmail,
          email: d.impersonatedAs?.email || "",
          role: d.impersonatedAs?.role || d.role,
        });
      } else {
        setMe(null);
      }
    } catch {
      setMe(null);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const onStop = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    setErr("");
    try {
      const r = await stopImpersonation(token);
      if (r?.ok && r.token) {
        setAuth(
          r.token,
          normalizeStoredRole(r.role),
          false,
          Array.isArray(r.permissions) ? r.permissions : undefined,
        );
        setMe(null);
        const to = String(r.redirect || "/").trim() || "/";
        window.location.href = to;
        return;
      }
      setErr("Zurücksetzen fehlgeschlagen.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }, [setAuth, token]);

  if (!me?.isImpersonating) return null;

  return (
    <div
      className="sticky top-0 z-[100] flex w-full flex-wrap items-center justify-between gap-2 border-b border-amber-500/30 bg-amber-500/15 px-3 py-2 text-sm text-amber-950 dark:border-amber-400/30 dark:bg-amber-500/20 dark:text-amber-100"
      role="status"
    >
      <span>
        <strong className="font-semibold">Kundenansicht (Test):</strong> Eingeloggt als{" "}
        <code className="rounded bg-amber-500/20 px-1">{me.email || "—"}</code> ({me.role}) — Admin:{" "}
        <code className="rounded bg-amber-500/20 px-1">{me.impersonatorEmail || "—"}</code>
      </span>
      {err ? <span className="text-red-600 dark:text-red-400">{err}</span> : null}
      <button
        type="button"
        className="shrink-0 rounded border border-amber-700/40 bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-950 hover:bg-amber-200 dark:border-amber-300/40 dark:bg-amber-900/40 dark:text-amber-50 dark:hover:bg-amber-800/50"
        disabled={busy}
        onClick={() => {
          void onStop();
        }}
      >
        {busy ? "…" : "Zurück zum Admin"}
      </button>
    </div>
  );
}
