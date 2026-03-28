import { useCallback, useEffect, useMemo, useState } from "react";
import { getCompanyCustomers, getCompanyMembers, getCompanyOrders, type CompanyMember, type CompanyOrder } from "../api/company";
import { useAuth } from "../hooks/useAuth";

function toDateSafe(value?: string) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function orderDate(order: CompanyOrder) {
  return toDateSafe(order.appointmentDate) ?? toDateSafe(order.createdAt);
}

export function PortalFirmaPage() {
  const { token } = useAuth();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [orders, setOrders] = useState<CompanyOrder[]>([]);
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [employeesCount, setEmployeesCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState("alle");
  const [memberFilter, setMemberFilter] = useState("alle");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      const [ordersRes, membersRes, customersRes] = await Promise.all([
        getCompanyOrders(token),
        getCompanyMembers(token),
        getCompanyCustomers(token),
      ]);
      setOrders(ordersRes.orders || []);
      setMembers(membersRes.members || []);
      setEmployeesCount((customersRes.customers || []).length);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Portal konnte nicht geladen werden");
    } finally {
      setBusy(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const o of orders) {
      if (o.status) set.add(String(o.status));
    }
    return ["alle", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [orders]);

  const activeEmployees = useMemo(
    () => members.filter((m) => m.status === "active" && m.role === "company_employee"),
    [members]
  );

  const filteredOrders = useMemo(() => {
    const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
    const to = toDate ? new Date(`${toDate}T23:59:59`) : null;
    return orders.filter((o) => {
      if (statusFilter !== "alle" && String(o.status || "") !== statusFilter) return false;
      if (memberFilter !== "alle" && String(o.createdByMemberId || "") !== memberFilter) return false;
      const d = orderDate(o);
      if (from && (!d || d < from)) return false;
      if (to && (!d || d > to)) return false;
      return true;
    });
  }, [orders, statusFilter, memberFilter, fromDate, toDate]);

  const employeeLastOrders = useMemo(() => {
    return activeEmployees.map((m) => {
      const mine = orders
        .filter((o) => Number(o.createdByMemberId) === Number(m.id))
        .sort((a, b) => {
          const aT = orderDate(a)?.getTime() ?? 0;
          const bT = orderDate(b)?.getTime() ?? 0;
          return bT - aT;
        });
      return {
        member: m,
        lastOrder: mine[0] || null,
        ordersCount: mine.length,
      };
    });
  }, [activeEmployees, orders]);

  if (busy) return <div className="p-6 text-sm text-slate-500 dark:text-zinc-400">Kundenportal wird geladen…</div>;

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-zinc-100">Firmenportal</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
          Alle Auftraege der Firma mit Filter nach Status, Datum und Mitarbeiter.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-xs uppercase text-slate-500 dark:text-zinc-500">Auftraege gesamt</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-zinc-100">{orders.length}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-xs uppercase text-slate-500 dark:text-zinc-500">Sichtbare Auftraege</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-zinc-100">{filteredOrders.length}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-xs uppercase text-slate-500 dark:text-zinc-500">Mitarbeiter</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-zinc-100">{employeesCount}</div>
        </div>
      </div>

      <div className="grid gap-2 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-4 dark:border-zinc-800 dark:bg-zinc-900">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        >
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {s === "alle" ? "Alle Status" : s}
            </option>
          ))}
        </select>
        <select
          value={memberFilter}
          onChange={(e) => setMemberFilter(e.target.value)}
          className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        >
          <option value="alle">Alle Mitarbeiter</option>
          {activeEmployees.map((m) => (
            <option key={m.id} value={String(m.id)}>
              {m.email}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        />
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 dark:border-zinc-800 dark:bg-zinc-950/80">
            <tr>
              <th className="px-4 py-3 font-medium text-slate-700 dark:text-zinc-300">Nr.</th>
              <th className="px-4 py-3 font-medium text-slate-700 dark:text-zinc-300">Status</th>
              <th className="px-4 py-3 font-medium text-slate-700 dark:text-zinc-300">Kunde</th>
              <th className="px-4 py-3 font-medium text-slate-700 dark:text-zinc-300">Adresse</th>
              <th className="px-4 py-3 font-medium text-slate-700 dark:text-zinc-300">Termin/Erfasst</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500 dark:text-zinc-500">
                  Keine Auftraege im aktuellen Filter.
                </td>
              </tr>
            ) : (
              filteredOrders.map((o) => (
                <tr key={String(o.orderNo ?? `${o.createdAt}-${o.address}`)} className="border-b border-slate-100 last:border-0 dark:border-zinc-800">
                  <td className="px-4 py-3 font-mono text-slate-900 dark:text-zinc-100">{String(o.orderNo ?? "–")}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-zinc-300">{o.status || "–"}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-zinc-300">{o.customerName || o.customerEmail || "–"}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-zinc-400">{o.address || "–"}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-zinc-400">
                    {orderDate(o) ? orderDate(o)?.toLocaleDateString("de-CH") : "–"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-base font-medium text-slate-900 dark:text-zinc-100">Mitarbeiter mit letzter Bestellung</h2>
        <div className="space-y-2">
          {employeeLastOrders.length === 0 ? (
            <div className="text-sm text-slate-500 dark:text-zinc-500">Keine aktiven Mitarbeiter gefunden.</div>
          ) : (
            employeeLastOrders.map((item) => (
              <div
                key={item.member.id}
                className="flex flex-col justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-sm dark:border-zinc-800 dark:bg-zinc-950/60 md:flex-row"
              >
                <div>
                  <div className="font-medium text-slate-900 dark:text-zinc-100">{item.member.email}</div>
                  <div className="text-xs text-slate-500 dark:text-zinc-500">{item.ordersCount} Auftraege</div>
                </div>
                <div className="text-xs text-slate-600 dark:text-zinc-400">
                  Letzte Bestellung:{" "}
                  {item.lastOrder ? `${String(item.lastOrder.orderNo ?? "–")} (${orderDate(item.lastOrder)?.toLocaleDateString("de-CH") || "–"})` : "keine"}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
