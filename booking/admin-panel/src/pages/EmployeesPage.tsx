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
import { cn } from "../lib/utils";
import { formatPhoneCH } from "../lib/format";
import { useAuthStore } from "../store/authStore";
import { t } from "../i18n";

export function EmployeesPage() {
  const token = useAuthStore((s) => s.token);
  const lang = useAuthStore((s) => s.language);
  const uiMode = useAuthStore((s) => s.uiMode);
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
  const isModern = uiMode === "modern";
  const createInputClass = cn(
    "w-full rounded-lg border px-3 py-2 text-sm transition-colors",
    isModern ? "bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 hover:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/25 focus:border-[var(--accent)]" : "rounded border px-2 py-1"
  );
  const createLabelClass = isModern
    ? "mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-400"
    : "mb-1 block text-xs font-semibold text-zinc-600";

  return (
    <div className="space-y-3">
      <form className={uiMode === "modern" ? "surface-card p-4" : "rounded-xl border border-zinc-200 bg-white p-3 shadow-sm"} onSubmit={create}>
        <h3 className="mb-3 text-sm font-bold">{t(lang, "employees.title.create")}</h3>
        <div className="grid gap-3 sm:grid-cols-6">
          <div>
            <label className={createLabelClass}>{t(lang, "employees.label.key")}</label>
            <input className={createInputClass} placeholder="z. B. admin01" value={key} onChange={(e) => setKey(e.target.value.toLowerCase())} />
          </div>
          <div>
            <label className={createLabelClass}>{t(lang, "common.name")}</label>
            <input className={createInputClass} placeholder="Max Mustermann" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className={createLabelClass}>{t(lang, "common.email")}</label>
            <input className={createInputClass} placeholder="max@beispiel.ch" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className={createLabelClass}>{t(lang, "common.phone")}</label>
            <input className={createInputClass} placeholder="+41 79 123 45 67" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <label className={createLabelClass}>{t(lang, "employees.label.initials")}</label>
            <input className={createInputClass} placeholder="MM" value={initials} onChange={(e) => setInitials(e.target.value)} />
          </div>
          <div>
            <label className={createLabelClass}>&nbsp;</label>
            <button
              className={cn(
                "inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-all",
                isModern
                  ? "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] hover:shadow-md"
                  : "rounded bg-[var(--accent)] px-3 py-1 text-sm font-semibold text-white hover:bg-[var(--accent-hover)]"
              )}
            >
              <Plus className="h-4 w-4" />
              {t(lang, "common.create")}
            </button>
          </div>
          <label className={cn("inline-flex items-center gap-2 text-sm font-medium", isModern ? "text-zinc-300" : "text-zinc-700")}>
            <input
              type="checkbox"
              checked={isAdmin}
              onChange={(e) => setIsAdmin(e.target.checked)}
              className={cn(
                "h-4 w-4 rounded",
                isModern ? "border-zinc-600 bg-zinc-800 text-[var(--accent)] focus:ring-[var(--accent)]/30" : "border-zinc-300 text-[var(--accent)]"
              )}
            />
            {t(lang, "employees.label.admin")}
          </label>
        </div>
      </form>

      <div className={cn(
        "rounded-xl border p-4 shadow-sm",
        isModern ? "border-slate-200/60 bg-white border-[var(--border-soft)] bg-[var(--surface)]" : "border-zinc-200 bg-white"
      )}>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-subtle)]" />
            <input
              type="text"
              placeholder={t(lang, "employees.placeholder.search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={cn(
                "w-full rounded-lg border py-2 pl-10 pr-3 text-sm transition-colors",
                "placeholder:text-slate-400 hover:border-slate-300 focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20",
                isModern
                  ? "border-slate-200 bg-white text-slate-900 border-[var(--border-soft)] bg-[var(--surface-raised)] text-[var(--text-main)] placeholder:text-[var(--text-subtle)] hover:border-[var(--border-soft)]"
                  : "border-zinc-300 bg-white text-zinc-900"
              )}
            />
          </div>
          <div className={cn(
            "flex items-center gap-2 rounded-lg border px-4 py-2",
            isModern
              ? "border-slate-200 bg-slate-100 border-[var(--border-soft)] bg-[var(--surface-raised)]"
              : "border-zinc-200 bg-zinc-50"
          )}>
            <span className={cn("text-xs font-semibold uppercase tracking-wider", isModern ? "text-[var(--text-subtle)]" : "text-zinc-600")}>
              {t(lang, "employees.label.hits")}
            </span>
            <span className="text-sm font-bold text-[var(--accent)]">{filtered.length}</span>
          </div>
        </div>
      </div>

      <EmployeeList items={filtered} onEdit={setSelected} />
      {selected ? <AbsenceCalendar token={token} employeeKey={selected} employeeEmail={selectedEmployee?.email} /> : null}
      {selected ? <EmployeeModal token={token} employeeKey={selected} isActive={isSelectedActive} onClose={() => setSelected(null)} onSaved={() => { void refetch({ force: true }); }} /> : null}
    </div>
  );
}


