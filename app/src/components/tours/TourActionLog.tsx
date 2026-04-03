import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

function formatDt(v: unknown) {
  if (v == null) return "—";
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("de-CH", { dateStyle: "short", timeStyle: "short" });
}

/** Matterport-Sichtbarkeit wie im Admin-Panel (LINK_ONLY ≙ „Nur Link"). */
const VISIBILITY_LABELS: Record<string, string> = {
  PRIVATE: "Privat",
  LINK_ONLY: "Nur Link",
  UNLISTED: "Nur Link",
  PUBLIC: "Öffentlich",
  PASSWORD: "Passwort",
};

function parseDetailsJson(details: unknown): unknown {
  if (typeof details === "string") {
    try {
      return JSON.parse(details) as unknown;
    } catch {
      return details;
    }
  }
  return details;
}

/** Klartext für bekannte Aktionen; sonst JSON wie bisher. */
function formatDetailsCell(action: string, details: unknown): { text: string; plain: boolean } {
  const d = parseDetailsJson(details);
  if (d == null) return { text: "—", plain: true };

  if (action === "ADMIN_VISIBILITY" && typeof d === "object" && d !== null && !Array.isArray(d)) {
    const o = d as Record<string, unknown>;
    const spaceId = String(o.spaceId ?? "").trim() || "—";
    const visKey = String(o.visibility ?? "").trim().toUpperCase();
    const visLabel = VISIBILITY_LABELS[visKey] || visKey || "—";
    const hasPwd = Boolean(o.hasPassword);
    const pwdPart = hasPwd
      ? "Zusätzliches Viewer-Passwort wurde mitgesetzt."
      : "Kein zusätzliches Viewer-Passwort.";
    const text = `Matterport-Space ${spaceId}: Sichtbarkeit „${visLabel}" (${visKey}). ${pwdPart}`;
    return { text, plain: true };
  }

  if (typeof d === "string") return { text: d, plain: true };
  return { text: JSON.stringify(d), plain: false };
}

type Props = {
  rows: Record<string, unknown>[];
};

export function TourActionLog({ rows }: Props) {
  const [open, setOpen] = useState(false);
  const count = rows.length;
  const summary =
    count === 0 ? "Keine Einträge" : `${count} ${count === 1 ? "Eintrag" : "Einträge"}`;

  return (
    <section className="surface-card-strong p-5 space-y-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-lg text-left transition-colors hover:bg-[var(--surface)]/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35 -m-1 p-1"
      >
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[var(--text-main)]">Aktionsprotokoll</h2>
          {!open ? <p className="text-sm text-[var(--text-subtle)] mt-0.5">{summary}</p> : null}
        </div>
        <span className="shrink-0 text-[var(--text-subtle)]" aria-hidden>
          {open ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
        </span>
      </button>

      {open ? (
        count === 0 ? (
          <p className="text-sm text-[var(--text-subtle)]">Keine Einträge.</p>
        ) : (
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead className="sticky top-0 bg-[var(--surface)]">
                <tr className="text-left text-[var(--text-subtle)] border-b border-[var(--border-soft)]">
                  <th className="py-2 pr-3">Zeit</th>
                  <th className="py-2 pr-3">Aktion</th>
                  <th className="py-2 pr-3">Akteur</th>
                  <th className="py-2">Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const actionStr = String(r.action ?? "");
                  const { text, plain } = formatDetailsCell(actionStr, r.details_json);
                  return (
                  <tr
                    key={r.id != null ? String(r.id) : `log-${i}`}
                    className="border-b border-[var(--border-soft)]/40 align-top"
                  >
                    <td className="py-2 pr-3 whitespace-nowrap text-[var(--text-subtle)]">{formatDt(r.created_at)}</td>
                    <td className="py-2 pr-3 text-[var(--text-main)]">{actionStr}</td>
                    <td className="py-2 pr-3 text-[var(--text-subtle)]">{String(r.actor_ref ?? r.actor_type ?? "")}</td>
                    <td
                      className={[
                        "py-2 text-[var(--text-subtle)] text-[10px] sm:text-xs break-words max-w-md",
                        plain ? "text-[var(--text-main)] leading-snug" : "font-mono break-all",
                      ].join(" ")}
                    >
                      {text}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </section>
  );
}
