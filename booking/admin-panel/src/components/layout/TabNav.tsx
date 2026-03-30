import { NavLink } from "react-router-dom";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";

const tabs = [
  ["/dashboard", "nav.dashboard"],
  ["/orders", "nav.orders"],
  ["/calendar", "nav.calendar"],
  ["/employees", "nav.employees"],
  ["/customers", "nav.customers"],
  ["/bugs", "nav.bugs"],
  ["/backups", "nav.backups"],
] as const;

export function TabNav() {
  const lang = useAuthStore((s) => s.language);

  return (
    <nav style={{ borderBottom: "1px solid var(--border-soft)", background: "var(--surface)" }}>
      <div className="mx-auto flex w-full max-w-[92rem] gap-2 overflow-x-auto p-2 sm:p-3">
        {tabs.map(([path, key]) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition min-h-[44px] inline-flex items-center ${
                isActive ? "btn-primary" : "btn-secondary"
              }`
            }
          >
            {t(lang, key)}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

