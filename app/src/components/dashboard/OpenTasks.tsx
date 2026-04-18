import { ArrowUpRight, GripVertical } from "lucide-react";
import { Link } from "react-router-dom";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";

export function OpenTasks() {
  const lang = useAuthStore((s) => s.language);

  return (
    <div className="pds-panel" data-tile="tasks">
      <button className="drag-handle" type="button" aria-label={t(lang, "dashboard.tweaks.drag")}>
        <GripVertical />
      </button>
      <div className="pds-panel-head">
        <div>
          <h2>{t(lang, "dashboard.tasks.title")}</h2>
          <div className="sub">{t(lang, "dashboard.tasks.empty.sub")}</div>
        </div>
        <Link className="see" to="/orders">
          {t(lang, "dashboard.tasks.all")} <ArrowUpRight />
        </Link>
      </div>
      <div className="pds-tasks-empty">{t(lang, "dashboard.tasks.empty")}</div>
    </div>
  );
}
