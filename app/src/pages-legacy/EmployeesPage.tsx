import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { Calendar, Mail, MoreHorizontal, Plus, Search, X } from "lucide-react";
import { createPhotographer, getPhotographers, type Photographer } from "../api/photographers";
import { AbsenceCalendar } from "../components/employees/AbsenceCalendar";
import { EmployeeModal } from "../components/employees/EmployeeModal";
import { useMutation } from "../hooks/useMutation";
import { useQuery } from "../hooks/useQuery";
import { employeesQueryKey } from "../lib/queryKeys";
import { formatPhoneCH } from "../lib/format";
import { useAuthStore } from "../store/authStore";
import { t } from "../i18n";

type EmployeeFilter = "active" | "all" | "admin" | "inactive";

type StaffMetrics = {
  jobs_week?: number;
  jobs_month?: number;
  capacity?: number;
  rating?: number | null;
};

function staffInitials(p: Photographer): string {
  const explicit = (p.initials || "").trim();
  if (explicit) return explicit.toUpperCase().slice(0, 2);
  const name = (p.name || p.key || "?").trim();
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "?";
}

function readMetrics(p: Photographer): StaffMetrics {
  const r = p as Photographer & StaffMetrics;
  return {
    jobs_week: typeof r.jobs_week === "number" ? r.jobs_week : undefined,
    jobs_month: typeof r.jobs_month === "number" ? r.jobs_month : undefined,
    capacity: typeof r.capacity === "number" ? r.capacity : undefined,
    rating: typeof r.rating === "number" ? r.rating : null,
  };
}

export function EmployeesPage() {
  const token = useAuthStore((s) => s.token);
  const lang = useAuthStore((s) => s.language);
  const [selected, setSelected] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [initials, setInitials] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<EmployeeFilter>("active");

  const queryKey = employeesQueryKey(token);
  const { data: items = [], refetch } = useQuery<Photographer[]>(
    queryKey,
    () => getPhotographers(token),
    { enabled: Boolean(token), staleTime: 5 * 60 * 1000 },
  );

  const createMutation = useMutation<void, Record<string, unknown>>(
    async (payload) => {
      await createPhotographer(token, payload);
    },
    {
      mutationKey: `employees:create:${token}`,
      invalidateKeys: [queryKey],
    },
  );

  async function create(e: FormEvent) {
    e.preventDefault();
    await createMutation.mutate({
      key,
      name,
      email,
      phone: formatPhoneCH(phone) || phone.trim(),
      initials,
      is_admin: isAdmin,
      home_address: "",
      radius_km: 30,
      skills: { foto: 5, matterport: 0, drohne: 0, video: 0 },
    });
    setKey(""); setName(""); setEmail(""); setPhone(""); setInitials(""); setIsAdmin(false);
    setShowCreate(false);
    await refetch({ force: true });
  }

  const counts = useMemo(() => ({
    all: items.length,
    active: items.filter((e) => e.active !== false).length,
    inactive: items.filter((e) => e.active === false).length,
    admin: items.filter((e) => Boolean(e.is_admin)).length,
  }), [items]);

  const aggregates = useMemo(() => {
    const metrics = items.map(readMetrics);
    const jobsWeek = metrics.reduce((sum, m) => sum + (m.jobs_week ?? 0), 0);
    const capacityValues = metrics.map((m) => m.capacity).filter((c): c is number => typeof c === "number" && c > 0);
    const capacityAvg = capacityValues.length > 0
      ? Math.round(capacityValues.reduce((a, b) => a + b, 0) / capacityValues.length * 100)
      : null;
    const ratingValues = metrics.map((m) => m.rating).filter((r): r is number => typeof r === "number");
    const ratingAvg = ratingValues.length > 0
      ? (ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length)
      : null;
    return { jobsWeek, capacityAvg, ratingAvg };
  }, [items]);

  const filteredByPill = useMemo(() => {
    if (filter === "all") return items;
    if (filter === "active") return items.filter((e) => e.active !== false);
    if (filter === "inactive") return items.filter((e) => e.active === false);
    return items.filter((e) => Boolean(e.is_admin));
  }, [items, filter]);

  const filtered = useMemo(() => filteredByPill.filter((e) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [e.key, e.name, e.email, e.phone, e.initials].join(" ").toLowerCase().includes(q);
  }), [filteredByPill, query]);

  const selectedEmployee = useMemo(() => items.find((item) => item.key === selected) || null, [items, selected]);
  const isSelectedActive = useMemo(() => selectedEmployee?.active !== false, [selectedEmployee]);

  const filterPills: { id: EmployeeFilter; labelKey: string }[] = [
    { id: "active", labelKey: "employees.filter.active" },
    { id: "all", labelKey: "employees.filter.all" },
    { id: "admin", labelKey: "employees.filter.admin" },
    { id: "inactive", labelKey: "employees.filter.inactive" },
  ];

  return (
    <div className="padmin-shell">
      <header className="pad-page-header">
        <div className="pad-ph-top">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="pad-eyebrow">{t(lang, "employees.eyebrow")}</div>
            <h1 className="pad-h1">{t(lang, "employees.title")}</h1>
            <div className="pad-ph-sub">{t(lang, "employees.description")}</div>
          </div>
          <div className="pad-ph-actions">
            <Link to="/calendar" className="pad-btn-ghost">
              <Calendar className="h-3.5 w-3.5" strokeWidth={1.85} />
              <span>{t(lang, "employees.action.calendar")}</span>
            </Link>
            <button
              type="button"
              className="pad-btn-primary"
              onClick={() => setShowCreate((v) => !v)}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              <span>{t(lang, "employees.action.add")}</span>
            </button>
          </div>
        </div>
        <div className="pad-kpis">
          <div className="pad-kpi">
            <div className="pad-kpi-label">{t(lang, "employees.stats.active")}</div>
            <div className="pad-kpi-value">{counts.active}</div>
          </div>
          <div className="pad-kpi">
            <div className="pad-kpi-label">{t(lang, "employees.stats.jobsWeek")}</div>
            <div className="pad-kpi-value">{aggregates.jobsWeek}</div>
          </div>
          <div className={`pad-kpi${aggregates.capacityAvg !== null && aggregates.capacityAvg >= 80 ? " is-warn" : ""}`}>
            <div className="pad-kpi-label">{t(lang, "employees.stats.capacityAvg")}</div>
            <div className="pad-kpi-value">{aggregates.capacityAvg !== null ? `${aggregates.capacityAvg}%` : "—"}</div>
          </div>
          <div className="pad-kpi is-gold">
            <div className="pad-kpi-label">{t(lang, "employees.stats.ratingAvg")}</div>
            <div className="pad-kpi-value is-gold">{aggregates.ratingAvg !== null ? aggregates.ratingAvg.toFixed(2) : "—"}</div>
          </div>
        </div>
      </header>
      <div className="pad-content space-y-3">

        <div className="pad-filterbar">
          <label className="pad-search">
            <Search className="h-3.5 w-3.5" strokeWidth={1.85} />
            <input
              type="text"
              placeholder={t(lang, "employees.placeholder.search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <span className="pad-fb-divider" />
          {filterPills.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`pad-filter-pill${filter === p.id ? " is-active" : ""}`}
              onClick={() => setFilter(p.id)}
            >
              {t(lang, p.labelKey)}
              <span className="pad-count">{counts[p.id]}</span>
            </button>
          ))}
        </div>

        {showCreate ? (
          <form className="pad-card" onSubmit={create}>
            <div className="pad-card-head">
              <h3>{t(lang, "employees.title.create")}</h3>
              <button
                type="button"
                className="pad-action-icon"
                onClick={() => setShowCreate(false)}
                aria-label="close"
                style={{ marginLeft: "auto" }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="pad-card-body">
              <div className="grid gap-3 sm:grid-cols-6">
                <div>
                  <label className="cust-form-label">{t(lang, "employees.label.key")}</label>
                  <input className="cust-form-input" placeholder="z. B. admin01" value={key} onChange={(e) => setKey(e.target.value.toLowerCase())} />
                </div>
                <div>
                  <label className="cust-form-label">{t(lang, "common.name")}</label>
                  <input className="cust-form-input" placeholder="Max Mustermann" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <label className="cust-form-label">{t(lang, "common.email")}</label>
                  <input className="cust-form-input" placeholder="max@beispiel.ch" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div>
                  <label className="cust-form-label">{t(lang, "common.phone")}</label>
                  <input className="cust-form-input" placeholder="+41 79 123 45 67" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div>
                  <label className="cust-form-label">{t(lang, "employees.label.initials")}</label>
                  <input className="cust-form-input" placeholder="MM" value={initials} onChange={(e) => setInitials(e.target.value)} />
                </div>
                <div>
                  <label className="cust-form-label">&nbsp;</label>
                  <button type="submit" className="pad-btn-primary" style={{ width: "100%", justifyContent: "center" }}>
                    <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                    {t(lang, "common.create")}
                  </button>
                </div>
                <label className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-muted)]">
                  <input
                    type="checkbox"
                    checked={isAdmin}
                    onChange={(e) => setIsAdmin(e.target.checked)}
                    className="h-4 w-4 rounded"
                    style={{ accentColor: "var(--accent)" }}
                  />
                  {t(lang, "employees.label.admin")}
                </label>
              </div>
            </div>
          </form>
        ) : null}

        {filtered.length === 0 ? (
          <div className="pad-card">
            <div className="pad-empty">{t(lang, "employees.empty")}</div>
          </div>
        ) : (
          <div className="pad-staff-grid">
            {filtered.map((e) => {
              const inactive = e.active === false;
              const m = readMetrics(e);
              const capacityPct = typeof m.capacity === "number" ? Math.round(m.capacity * 100) : null;
              const capacityWarn = capacityPct !== null && capacityPct > 85;
              return (
                <article
                  key={e.key}
                  className={`pad-staff-card${inactive ? " is-inactive" : ""}`}
                  onClick={() => setSelected(e.key)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      setSelected(e.key);
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <div className="pad-staff-head">
                    <div className="pad-staff-avatar">{staffInitials(e)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="pad-staff-name">{e.name || e.key}</div>
                      <div className="pad-staff-role">{e.email || "—"}</div>
                      <div className="pad-staff-chips">
                        {e.is_admin ? <span className="pad-chip-sm is-admin">{t(lang, "employeeList.role.admin")}</span> : null}
                        {!inactive ? (
                          <span className="pad-chip-sm is-available">
                            <span className="pad-dot" style={{ background: "var(--pad-success)" }} />
                            {t(lang, "employees.status.available")}
                          </span>
                        ) : (
                          <span className="pad-chip-sm is-inactive">{t(lang, "employees.status.inactive")}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="pad-staff-stats">
                    <div>
                      <div className="pad-staff-stat-label">{t(lang, "employees.card.week")}</div>
                      <div className="pad-staff-stat-value">{m.jobs_week ?? "—"}</div>
                    </div>
                    <div>
                      <div className="pad-staff-stat-label">{t(lang, "employees.card.month")}</div>
                      <div className="pad-staff-stat-value">{m.jobs_month ?? "—"}</div>
                    </div>
                    <div>
                      <div className="pad-staff-stat-label">{t(lang, "employees.card.rating")}</div>
                      <div className="pad-staff-stat-value is-gold">{typeof m.rating === "number" ? m.rating.toFixed(1) : "—"}</div>
                    </div>
                  </div>
                  {capacityPct !== null ? (
                    <div className="pad-staff-cap">
                      <div className="pad-staff-cap-row">
                        <span>{t(lang, "employees.card.capacity")}</span>
                        <span className={`pad-staff-cap-value${capacityWarn ? " is-warn" : ""}`}>{capacityPct}%</span>
                      </div>
                      <div className="pad-staff-cap-track">
                        <div
                          className={`pad-staff-cap-fill${capacityWarn ? " is-warn" : ""}`}
                          style={{ width: `${Math.min(100, capacityPct)}%` }}
                        />
                      </div>
                    </div>
                  ) : null}
                  <div className="pad-staff-actions" onClick={(ev) => ev.stopPropagation()}>
                    {e.email ? (
                      <a className="pad-btn-ghost-sm is-flex" href={`mailto:${e.email}`}>
                        <Mail className="h-3 w-3" strokeWidth={1.85} />
                        <span>{t(lang, "employees.action.email")}</span>
                      </a>
                    ) : (
                      <span className="pad-btn-ghost-sm is-flex" style={{ opacity: 0.5, cursor: "not-allowed" }}>
                        <Mail className="h-3 w-3" strokeWidth={1.85} />
                        <span>{t(lang, "employees.action.email")}</span>
                      </span>
                    )}
                    <Link className="pad-btn-ghost-sm is-flex" to="/calendar" onClick={(ev) => ev.stopPropagation()}>
                      <Calendar className="h-3 w-3" strokeWidth={1.85} />
                      <span>{t(lang, "employees.action.plan")}</span>
                    </Link>
                    <button
                      type="button"
                      className="pad-action-icon"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setSelected(e.key);
                      }}
                      aria-label={t(lang, "common.edit")}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {selected ? <AbsenceCalendar token={token} employeeKey={selected} employeeEmail={selectedEmployee?.email} /> : null}
        {selected ? <EmployeeModal token={token} employeeKey={selected} isActive={isSelectedActive} onClose={() => setSelected(null)} onSaved={() => { void refetch({ force: true }); }} /> : null}
      </div>
    </div>
  );
}
