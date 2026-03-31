import { Settings, Users, GitBranch, Plug } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { t } from "../i18n";
import { useAuthStore } from "../store/authStore";
import { cn } from "../lib/utils";
import { SettingsPage } from "./SettingsPage";
import { WorkflowSettingsPage } from "./WorkflowSettingsPage";
import { ExxasSettingsPage } from "./ExxasSettingsPage";
import { EmployeesPage } from "./EmployeesPage";

type ConfigTab = "general" | "workflow" | "exxas" | "employees";

const TAB_ITEMS: Array<{
  key: ConfigTab;
  path: string;
  labelKey: string;
  icon: typeof Settings;
}> = [
  { key: "general", path: "/settings", labelKey: "sidebar.nav.general", icon: Settings },
  { key: "workflow", path: "/settings/workflow", labelKey: "sidebar.nav.workflow", icon: GitBranch },
  { key: "exxas", path: "/settings/exxas", labelKey: "sidebar.nav.exxas", icon: Plug },
  { key: "employees", path: "/settings/team", labelKey: "nav.employees", icon: Users },
];

type ConfigurationPageProps = {
  initialTab?: ConfigTab;
};

export function ConfigurationPage({ initialTab = "general" }: ConfigurationPageProps) {
  const lang = useAuthStore((s) => s.language);
  const navigate = useNavigate();

  function selectTab(nextTab: ConfigTab) {
    const target = TAB_ITEMS.find((item) => item.key === nextTab);
    if (target) navigate(target.path);
  }

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm border-[var(--border-soft)] bg-[var(--surface)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#8B6A2B] dark:text-[#E0C58A]">
              <Settings className="h-3.5 w-3.5" />
              {t(lang, "nav.settings")}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[var(--text-main)]">
                {t(lang, "nav.settings")} & {t(lang, "nav.employees")}
              </h1>
              <p className="mt-1 max-w-3xl text-sm text-[var(--text-subtle)]">
                Globale Konfiguration, Workflow-/EXXAS-Optionen und mitarbeiterbezogene Einstellungen sind hier zentral gebuendelt.
              </p>
            </div>
          </div>
          <div className="text-sm text-[var(--text-subtle)]">
            Eine Seite, gleiche Datenquellen, keine getrennten Konfigurationspfade mehr.
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {TAB_ITEMS.map(({ key, labelKey, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => selectTab(key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors",
                initialTab === key
                  ? "border-[var(--accent)] bg-[var(--accent)] text-white shadow-sm"
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white border-[var(--border-soft)] bg-[var(--surface-raised)] text-[var(--text-main)] hover:border-[var(--border-soft)] dark:hover:bg-zinc-900"
              )}
            >
              <Icon className="h-4 w-4" />
              {t(lang, labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div>
        {initialTab === "general" ? <SettingsPage /> : null}
        {initialTab === "workflow" ? <WorkflowSettingsPage /> : null}
        {initialTab === "exxas" ? <ExxasSettingsPage /> : null}
        {initialTab === "employees" ? <EmployeesPage /> : null}
      </div>
    </div>
  );
}

