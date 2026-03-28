import type { Photographer } from "../../api/photographers";
import { useAuthStore } from "../../store/authStore";
import { t } from "../../i18n";
import { cn } from "../../lib/utils";
import { formatPhoneCH } from "../../lib/format";

type Props = { items: Photographer[]; onEdit: (key: string) => void };

export function EmployeeList({ items, onEdit }: Props) {
  const uiMode = useAuthStore((s) => s.uiMode);
  const lang = useAuthStore((s) => s.language);
  const isModern = uiMode === "modern";

  if (items.length === 0) {
    return (
      <div className={isModern ? "rounded-xl border border-slate-200/60 bg-white p-12 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900" : "rounded-xl border border-zinc-200 bg-white p-6 text-center shadow-sm"}>
        <p className={isModern ? "text-slate-500 dark:text-zinc-400" : "text-zinc-500"}>{t(lang, "employeeList.empty")}</p>
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
                isModern ? "rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900" : "rounded-xl border border-zinc-200 bg-white p-3 shadow-sm",
                inactive && "opacity-50"
              )}
            >
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <div className={isModern ? "mb-1 font-bold text-slate-900 dark:text-zinc-100" : "mb-1 font-semibold"}>{e.name}</div>
                  <div className={isModern ? "text-xs text-slate-500 dark:text-zinc-400" : "text-xs text-zinc-500"}>{e.key}</div>
                </div>
                {inactive && (
                  <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
                    {t(lang, "employeeList.inactive")}
                  </span>
                )}
              </div>
              <div className="mb-3 space-y-1">
                <div className={isModern ? "text-sm text-slate-700 dark:text-zinc-300" : "text-sm"}>{e.email || "-"}</div>
                <div className={isModern ? "text-xs text-slate-500 dark:text-zinc-400" : "text-xs text-zinc-500"}>{e.phone || "-"}</div>
              </div>
              <div className={isModern ? "mb-3 border-t border-slate-200 pt-3 text-xs font-semibold text-slate-600 dark:border-zinc-800 dark:text-zinc-400" : "mt-2 text-xs text-zinc-600"}>
                {e.is_admin ? t(lang, "employeeList.role.admin") : t(lang, "employeeList.role.employee")}
              </div>
              <button
                className={isModern ? "inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700" : "mt-3 w-full rounded border px-3 py-2 text-sm"}
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
          <thead className="border-b-2 border-[#C5A059]/20">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-[#C5A059]">{t(lang, "employeeList.table.name")}</th>
              <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-[#C5A059]">{t(lang, "employeeList.table.contact")}</th>
              <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-[#C5A059]">{t(lang, "employeeList.table.role")}</th>
              <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-[#C5A059]">{t(lang, "employeeList.table.actions")}</th>
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
                        <div className={isModern ? "font-semibold text-slate-900 dark:text-zinc-100" : "font-semibold"}>{e.name}</div>
                        <div className={isModern ? "text-xs text-slate-500 dark:text-zinc-400" : "text-xs text-zinc-500"}>{e.key}</div>
                      </div>
                      {inactive && (
                        <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
                          {t(lang, "employeeList.inactive")}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className={isModern ? "text-slate-700 dark:text-zinc-300" : ""}>{e.email || "-"}</div>
                    <div className={isModern ? "text-xs text-slate-500 dark:text-zinc-400" : "text-xs text-zinc-500"}>{formatPhoneCH(e.phone ?? "") || e.phone || "-"}</div>
                  </td>
                  <td className={isModern ? "px-6 py-4 text-slate-700 dark:text-zinc-300" : "px-6 py-4"}>{e.is_admin ? t(lang, "employeeList.role.admin") : t(lang, "employeeList.role.employee")}</td>
                  <td className="px-6 py-4">
                    <button
                      className={isModern ? "inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700" : "rounded border px-3 py-2 text-xs"}
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
