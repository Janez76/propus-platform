import type { Photographer } from "../../api/photographers";
import { useAuthStore } from "../../store/authStore";
import { t } from "../../i18n";
import { cn } from "../../lib/utils";
import { PhoneLink } from "../ui/PhoneLink";

type Props = { items: Photographer[]; onEdit: (key: string) => void };

export function EmployeeList({ items, onEdit }: Props) {
  const uiMode = useAuthStore((s) => s.uiMode);
  const lang = useAuthStore((s) => s.language);
  const isModern = uiMode === "modern";

  if (items.length === 0) {
    return (
      <div className={isModern ? "rounded-xl border border-slate-200/60 bg-white p-12 text-center shadow-sm border-[var(--border-soft)] bg-[var(--surface)]" : "rounded-xl border border-zinc-200 bg-white p-6 text-center shadow-sm"}>
        <p className={isModern ? "text-[var(--text-subtle)]" : "text-zinc-500"}>{t(lang, "employeeList.empty")}</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4 md:hidden">
        {items.map((e) => {
          const inactive = e.active === false;
          return (
            <article
              key={e.key}
              className={cn(
                isModern ? "rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm transition-shadow hover:shadow-md border-[var(--border-soft)] bg-[var(--surface)]" : "rounded-xl border border-zinc-200 bg-white p-3 shadow-sm",
                inactive && "opacity-50"
              )}
            >
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <div className={isModern ? "mb-1 font-bold text-[var(--text-main)]" : "mb-1 font-semibold"}>{e.name}</div>
                  <div className={isModern ? "text-xs text-[var(--text-subtle)]" : "text-xs text-zinc-500"}>{e.key}</div>
                </div>
                {inactive && (
                  <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 bg-[var(--surface-raised)] text-[var(--text-subtle)]">
                    {t(lang, "employeeList.inactive")}
                  </span>
                )}
              </div>
              <div className="mb-3 space-y-1">
                <div className={isModern ? "text-sm text-[var(--text-muted)]" : "text-sm"}>{e.email || "-"}</div>
                <div className={isModern ? "text-xs text-[var(--text-subtle)]" : "text-xs text-zinc-500"}>
                  {e.phone?.trim() ? <PhoneLink value={e.phone} className="text-inherit hover:underline" /> : "-"}
                </div>
              </div>
              <div className={isModern ? "mb-3 border-t border-slate-200 pt-3 text-xs font-semibold text-slate-600 border-[var(--border-soft)] text-[var(--text-subtle)]" : "mt-2 text-xs text-zinc-600"}>
                {e.is_admin ? t(lang, "employeeList.role.admin") : t(lang, "employeeList.role.employee")}
              </div>
              <button
                className={isModern ? "inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200 bg-[var(--surface-raised)] text-[var(--text-muted)] hover:bg-[var(--surface-raised)]" : "mt-3 w-full rounded border px-3 py-2 text-sm"}
                onClick={() => onEdit(e.key)}
              >
                {t(lang, "common.edit")}
              </button>
            </article>
          );
        })}
      </div>

      <div className={isModern ? "hidden overflow-auto rounded-xl border border-zinc-800/50 bg-transparent md:block" : "hidden overflow-auto rounded-xl border border-zinc-200 bg-white md:block"}>
        <table className="min-w-full text-sm">
          <thead className="border-b-2 border-[var(--accent)]/20">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-[var(--accent)]">{t(lang, "employeeList.table.name")}</th>
              <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-[var(--accent)]">{t(lang, "employeeList.table.contact")}</th>
              <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-[var(--accent)]">{t(lang, "employeeList.table.role")}</th>
              <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-[var(--accent)]">{t(lang, "employeeList.table.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/30">
            {items.map((e) => {
              const inactive = e.active === false;
              return (
                <tr key={e.key} className={cn("transition-colors", inactive ? "opacity-50" : "hover:bg-zinc-800/20")}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div>
                        <div className={isModern ? "font-semibold text-[var(--text-main)]" : "font-semibold"}>{e.name}</div>
                        <div className={isModern ? "text-xs text-[var(--text-subtle)]" : "text-xs text-zinc-500"}>{e.key}</div>
                      </div>
                      {inactive && (
                        <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 bg-[var(--surface-raised)] text-[var(--text-subtle)]">
                          {t(lang, "employeeList.inactive")}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className={isModern ? "text-[var(--text-muted)]" : ""}>{e.email || "-"}</div>
                    <div className={isModern ? "text-xs text-[var(--text-subtle)]" : "text-xs text-zinc-500"}>
                      {e.phone?.trim() ? <PhoneLink value={e.phone} className="text-inherit hover:underline" /> : "-"}
                    </div>
                  </td>
                  <td className={isModern ? "px-6 py-4 text-[var(--text-muted)]" : "px-6 py-4"}>{e.is_admin ? t(lang, "employeeList.role.admin") : t(lang, "employeeList.role.employee")}</td>
                  <td className="px-6 py-4">
                    <button
                      className={isModern ? "inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200 bg-[var(--surface-raised)] text-[var(--text-muted)] hover:bg-[var(--surface-raised)]" : "rounded border px-3 py-2 text-xs"}
                      onClick={() => onEdit(e.key)}
                    >
                      {t(lang, "common.edit")}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

