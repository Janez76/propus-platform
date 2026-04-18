import { GripVertical } from "lucide-react";
import { t, type Lang } from "../../i18n";
import { useAuthStore } from "../../store/authStore";

interface HeroGreetingProps {
  shootingsToday: number;
  deliveriesToday: number;
  openInquiries: number;
  revenueToday: number;
}

function formatDateEyebrow(date: Date, lang: Lang): string {
  try {
    return date.toLocaleDateString(lang === "de" ? "de-CH" : lang, {
      day: "numeric",
      month: "long",
      year: "numeric",
      weekday: "long",
    }).replace(",", " ·");
  } catch {
    return date.toDateString();
  }
}

function pickGreeting(hour: number, lang: Lang): string {
  if (hour < 11) return t(lang, "dashboard.greeting.morning");
  if (hour < 18) return t(lang, "dashboard.greeting.afternoon");
  return t(lang, "dashboard.greeting.evening");
}

function formatChf(n: number): string {
  return new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF", maximumFractionDigits: 0 }).format(n);
}

export function HeroGreeting({
  shootingsToday,
  deliveriesToday,
  openInquiries,
  revenueToday,
}: HeroGreetingProps) {
  const lang = useAuthStore((s) => s.language);
  const role = useAuthStore((s) => s.role);
  const now = new Date();
  const hour = now.getHours();
  const greeting = pickGreeting(hour, lang);

  const roleLabel = t(lang, `auth.role.${role}`);
  const displayName = roleLabel && roleLabel !== `auth.role.${role}` ? roleLabel : t(lang, "nav.admin");

  const summary = t(lang, "dashboard.hero.summary")
    .replace("{{shootings}}", String(shootingsToday))
    .replace("{{deliveries}}", String(deliveriesToday))
    .replace("{{inquiries}}", String(openInquiries));

  return (
    <div className="pds-hero-greet" data-tile="greeting">
      <button className="drag-handle" type="button" aria-label={t(lang, "dashboard.tweaks.drag")}>
        <GripVertical />
      </button>
      <div className="eye">{formatDateEyebrow(now, lang)}</div>
      <h1>{greeting}, {displayName}.</h1>
      <p dangerouslySetInnerHTML={{ __html: summary }} />
      <div className="pds-hero-today">
        <div className="t g">
          <strong>{shootingsToday}</strong>
          <span>{t(lang, "dashboard.hero.shootings")}</span>
        </div>
        <div className="div" />
        <div className="t">
          <strong>{deliveriesToday}</strong>
          <span>{t(lang, "dashboard.hero.deliveries")}</span>
        </div>
        <div className="div" />
        <div className="t">
          <strong>{openInquiries}</strong>
          <span>{t(lang, "dashboard.hero.openOrders")}</span>
        </div>
        <div className="div" />
        <div className="t">
          <strong>{formatChf(revenueToday)}</strong>
          <span>{t(lang, "dashboard.hero.revenueToday")}</span>
        </div>
      </div>
    </div>
  );
}
