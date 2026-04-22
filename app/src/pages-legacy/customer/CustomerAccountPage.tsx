"use client";

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { isPortalHost } from "@/lib/portalHost";
import { Loader2, LogOut } from "lucide-react";

type MeCustomer = {
  email: string;
  name?: string;
  company?: string;
};

type OrderRow = { orderNo?: number; id?: number; status?: string };

export function CustomerAccountPage() {
  const navigate = useNavigate();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<MeCustomer | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setErr("");
    setLoading(true);
    try {
      const me = await fetch("/api/customer/me", { credentials: "include" });
      if (me.status === 401) {
        clearAuth();
        navigate("/login", { replace: true });
        return;
      }
      if (!me.ok) {
        setErr("Konto konnte nicht geladen werden.");
        return;
      }
      const mj = (await me.json()) as { customer?: MeCustomer };
      clearAuth();
      setCustomer(mj.customer || null);
      const or = await fetch("/api/customer/orders", { credentials: "include" });
      if (or.ok) {
        const oj = (await or.json()) as { orders?: OrderRow[] };
        setOrders(Array.isArray(oj.orders) ? oj.orders : []);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }, [clearAuth, navigate]);

  useEffect(() => {
    if (!isPortalHost()) {
      navigate("/login", { replace: true });
      return;
    }
    void load();
  }, [load, navigate]);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/customer/logout", { method: "POST", credentials: "include" });
    } catch {
      /* ignore */
    }
    clearAuth();
    navigate("/login", { replace: true });
  }, [clearAuth, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-zinc-200">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" aria-hidden />
        <p className="mt-3 text-sm text-zinc-400">Konto wird geladen …</p>
      </div>
    );
  }

  if (err) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-4 text-zinc-200">
        <p className="text-sm text-red-400">{err}</p>
        <button type="button" className="mt-4 text-sm text-amber-500 underline" onClick={() => void load()}>
          Erneut versuchen
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900/80 px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold">Mein Konto</h1>
            <p className="text-sm text-zinc-400">
              {customer?.company || customer?.name || customer?.email || "—"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex items-center gap-1 rounded border border-zinc-600 px-2 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            <LogOut className="h-4 w-4" />
            Abmelden
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">Bestellungen</h2>
        {orders.length === 0 ? (
          <p className="text-sm text-zinc-500">Keine Bestellungen gefunden.</p>
        ) : (
          <ul className="space-y-2">
            {orders.map((o) => (
              <li key={String(o.orderNo ?? o.id)} className="rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm">
                <span className="font-medium">#{o.orderNo ?? o.id}</span>
                {o.status ? <span className="ml-2 text-zinc-500">{o.status}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
