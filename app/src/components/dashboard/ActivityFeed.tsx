import { ArrowUpRight, GripVertical } from "lucide-react";
import { Link } from "react-router-dom";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";

export function ActivityFeed() {
  const lang = useAuthStore((s) => s.language);

  return (
    <div className="pds-panel" data-tile="activity">
      <button className="drag-handle" type="button" aria-label={t(lang, "dashboard.tweaks.drag")}>
        <GripVertical />
      </button>
      <div className="pds-panel-head">
        <div>
          <h2>{t(lang, "dashboard.activity.title")}</h2>
          <div className="sub">{t(lang, "dashboard.activity.subtitle")}</div>
        </div>
        <Link className="see" to="/orders">
          {t(lang, "dashboard.activity.all")} <ArrowUpRight />
        </Link>
      </div>
      <div className="pds-act-empty">{t(lang, "dashboard.activity.empty")}</div>
    </div>
  );
}
