import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Sichert API-Werte für die Anzeige – verhindert React Error #31 (Objekte als Child). */
export function toDisplayString(val: unknown, fallback = "—"): string {
  if (val == null) return fallback;
  if (typeof val === "string") return val.trim() || fallback;
  return fallback;
}

function safeDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  // Try native parse first (covers ISO 8601 and RFC 2822)
  let d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d;
  // Normalize Postgres format: "YYYY-MM-DD HH:mm:ss.ffffff+00" → ISO 8601
  // Replace space with T, ensure offset has colon (+00 → +00:00)
  const normalized = value
    .replace(" ", "T")
    .replace(/([+-]\d{2})(\d{2})?$/, (_, h, m) => `${h}:${m ?? "00"}`);
  d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatCurrency(value: number): string {
  try {
    return new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(value || 0);
  } catch {
    return `CHF ${(value || 0).toFixed(2)}`;
  }
}

export function formatDateTime(value: string | null | undefined | unknown): string {
  // Accept string, Date object, or number (epoch ms)
  let d: Date | null = null;
  if (value instanceof Date) {
    d = Number.isNaN(value.getTime()) ? null : value;
  } else if (typeof value === "number") {
    d = new Date(value);
  } else if (typeof value === "string") {
    d = safeDate(value);
  }
  if (!d) return typeof value === "string" ? value || "-" : "-";

  try {
    return new Intl.DateTimeFormat("de-CH", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    const day = String(d.getDate()).padStart(2, "0");
    const mon = String(d.getMonth() + 1).padStart(2, "0");
    const yr = d.getFullYear();
    const hr = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${day}.${mon}.${yr} ${hr}:${mi}`;
  }
}

/** ISO date (YYYY-MM-DD) → dd.mm.yyyy */
export function formatDateCH(iso: string): string {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
  return iso;
}

export function getStatusColor(status?: string): string {
  switch ((status || "").toLowerCase()) {
    case "done":
      return "text-emerald-700";
    case "cancelled":
      return "text-red-700";
    case "archived":
      return "text-zinc-600";
    default:
      return "text-amber-700";
  }
}
