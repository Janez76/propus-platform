import {
  ArrowUpRight,
  CalendarPlus,
  Check,
  CreditCard,
  GripVertical,
  MessageCircle,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";

type IconVariant = "default" | "g" | "k";

interface ActivityItem {
  id: string;
  icon: LucideIcon;
  variant: IconVariant;
  bodyKey: string;
  time: string;
}

// Placeholder until an audit-log endpoint exists.
const SEED_ITEMS: ActivityItem[] = [
  { id: "a1", icon: Check,         variant: "g",       bodyKey: "dashboard.activity.item.release",  time: "12 min" },
  { id: "a2", icon: CalendarPlus,  variant: "k",       bodyKey: "dashboard.activity.item.booking",  time: "42 min" },
  { id: "a3", icon: CreditCard,    variant: "default", bodyKey: "dashboard.activity.item.payment",  time: "08:14" },
  { id: "a4", icon: Upload,        variant: "g",       bodyKey: "dashboard.activity.item.upload",   time: "07:52" },
  { id: "a5", icon: MessageCircle, variant: "default", bodyKey: "dashboard.activity.item.comment",  time: "dashboard.activity.time.yesterday" },
];

export function ActivityFeed() {
  const lang = useAuthStore((s) => s.language);

  const resolveTime = (raw: string): string => {
    if (raw.startsWith("dashboard.")) return t(lang, raw);
    if (/^\d+ min$/.test(raw)) return t(lang, "dashboard.activity.time.minAgo").replace("{{n}}", raw.split(" ")[0]);
    return raw;
  };

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
      <div className="pds-act">
        {SEED_ITEMS.map(({ id, icon: Icon, variant, bodyKey, time }) => {
          const body = t(lang, bodyKey);
          const icClass = variant === "default" ? "ic" : `ic ${variant}`;
          return (
            <div key={id} className="it">
              <div className={icClass}><Icon /></div>
              <p dangerouslySetInnerHTML={{ __html: body }} />
              <time>{resolveTime(time)}</time>
            </div>
          );
        })}
      </div>
    </div>
  );
}
