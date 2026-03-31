import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Plus, Search } from "lucide-react";
import { createPhotographer, getPhotographers, type Photographer } from "../api/photographers";
import { AbsenceCalendar } from "../components/employees/AbsenceCalendar";
import { EmployeeList } from "../components/employees/EmployeeList";
import { EmployeeModal } from "../components/employees/EmployeeModal";
import { useMutation } from "../hooks/useMutation";
import { useQuery } from "../hooks/useQuery";
import { employeesQueryKey } from "../lib/queryKeys";
import { formatPhoneCH } from "../lib/format";
import { useAuthStore } from "../store/authStore";
import { t } from "../i18n";

export function EmployeesPage() {
  const token = useAuthStore((s) => s.token);
  const lang = useAuthStore((s) => s.language);
  const [selected, setSelected] = useState<string | null>(null);
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [initials, setInitials] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [query, setQuery] = useState("");

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
    await refetch({ force: true });
  }

  const filtered = useMemo(() => items.filter((e) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [e.key, e.name, e.email, e.phone, e.initials].join(" ").toLowerCase().includes(q);
  }), [items, query]);
  const selectedEmployee = useMemo(() => items.find((item) => item.key === selected) || null, [items, selected]);
  const isSelectedActive = useMemo(() => selectedEmployee?.active !== false, [selectedEmployee]);

  return (
    <div className="space-y-3">
      <form className="cust-form-section" onSubmit={create}>
        <h3 className="mb-3 text-sm font-bold text-[var(--text-main)]">{t(lang, "employees.title.create")}</h3>
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
            <button type="submit" className="btn-primary min-h-0 inline-flex w-full items-center justify-center gap-2 px-3 py-2 text-sm">
              <Plus className="h-4 w-4" />
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
      </form>

      <div className="cust-form-section">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="cust-search-wrap flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-subtle)]" />
            <input
              type="text"
              placeholder={t(lang, "employees.placeholder.search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="cust-search-input"
            />
          </div>
          <div className="flex items-center gap-2 rounded-lg border px-4 py-2" style={{ borderColor: "var(--border-soft)", background: "var(--surface-raised)" }}>
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              {t(lang, "employees.label.hits")}
            </span>
            <span className="text-sm font-bold" style={{ color: "var(--accent)" }}>{filtered.length}</span>
          </div>
        </div>
      </div>

      <EmployeeList items={filtered} onEdit={setSelected} />
      {selected ? <AbsenceCalendar token={token} employeeKey={selected} employeeEmail={selectedEmployee?.email} /> : null}
      {selected ? <EmployeeModal token={token} employeeKey={selected} isActive={isSelectedActive} onClose={() => setSelected(null)} onSaved={() => { void refetch({ force: true }); }} /> : null}
    </div>
  );
}

