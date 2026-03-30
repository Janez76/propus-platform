import { Clock, GitBranch, Wrench, Sparkles, Bug, Shield, ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "../lib/utils";
import { CHANGELOG, type ChangelogVersion, type ChangeType } from "../data/changelogData";
import { API_BASE } from "../api/client";

function stripVersionPrefix(raw: string): string {
  return String(raw || "")
    .trim()
    .replace(/^\uFEFF/, "")
    .replace(/\s+/g, "")
    .replace(/^v+/i, "");
}

const TYPE_CONFIG: Record<ChangeType, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  feature:     { label: "Neu",         color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",  icon: Sparkles },
  fix:         { label: "Bugfix",      color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",                  icon: Bug },
  improvement: { label: "Verbesserung",color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",              icon: Wrench },
  breaking:    { label: "Wichtig",     color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",          icon: Shield },
  security:    { label: "Sicherheit",  color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",      icon: Shield },
};

// ─────────────────────────────────────────────────────────────────────────────


function VersionCard({ entry, defaultOpen }: { entry: ChangelogVersion; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn(
      "rounded-xl border transition-all duration-200",
      open
        ? "border-[var(--accent)]/30 bg-[var(--surface)] shadow-sm"
        : "border-[var(--border-soft)] bg-slate-50/50 bg-[var(--surface)]/50"
    )}>
      <button
        className="w-full flex items-center justify-between px-5 py-4 text-left gap-4"
        onClick={() => setOpen(p => !p)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--accent)]/10 flex items-center justify-center">
            <GitBranch className="h-4 w-4 text-[var(--accent)]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-bold text-[var(--accent)]">v{entry.version}</span>
              <span className="text-sm font-semibold text-[var(--text-main)] truncate">{entry.title}</span>
            </div>
            <div className="flex items-center gap-1 mt-0.5 text-xs text-[var(--text-subtle)]">
              <Clock className="h-3 w-3" />
              <span>{entry.date}</span>
              <span className="mx-1">·</span>
              <span>{entry.changes.length} Änderungen</span>
            </div>
          </div>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400 flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />}
      </button>

      {open && (
        <div className="px-5 pb-4 border-t border-slate-100 border-[var(--border-soft)]">
          <ul className="mt-3 space-y-2">
            {entry.changes.map((c, i) => {
              const cfg = TYPE_CONFIG[c.type];
              const Icon = cfg.icon;
              return (
                <li key={i} className="flex items-start gap-2.5 text-sm">
                  <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 mt-0.5", cfg.color)}>
                    <Icon className="h-3 w-3" />
                    {cfg.label}
                  </span>
                  <span className="text-[var(--text-muted)] leading-relaxed">{c.text}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ChangelogPage() {
  const latest = CHANGELOG[0];
  const [serverVersionNorm, setServerVersionNorm] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const applyRaw = (raw: string) => {
      if (cancelled) return;
      const t = String(raw || "").trim();
      if (!t || t.includes("<!doctype") || t.includes("<html")) {
        setServerVersionNorm(null);
        return;
      }
      const cleaned = stripVersionPrefix(t);
      setServerVersionNorm(cleaned && /^[a-zA-Z0-9._-]+$/.test(cleaned) ? cleaned : null);
    };

    const fallback = () =>
      fetch(`/VERSION?cb=${Date.now()}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.text() : ""))
        .then(applyRaw)
        .catch(() => {
          if (!cancelled) setServerVersionNorm(null);
        });

    fetch(`${API_BASE}/api/health`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        const id = data?.buildId;
        if (typeof id === "string" && id.trim()) {
          applyRaw(id);
          return;
        }
        return fallback();
      })
      .catch(() => fallback());

    return () => {
      cancelled = true;
    };
  }, []);

  const bannerVersionNorm = serverVersionNorm ?? (stripVersionPrefix(latest.version) || latest.version);
  const matched = CHANGELOG.find((e) => stripVersionPrefix(e.version) === bannerVersionNorm);
  const anyBannerMatch = CHANGELOG.some((e) => stripVersionPrefix(e.version) === bannerVersionNorm);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center">
            <GitBranch className="h-5 w-5 text-[var(--accent)]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-main)]">Letzte Änderungen</h1>
            <p className="text-sm text-[var(--text-subtle)]">Changelog aller Versionen</p>
          </div>
        </div>

        {/* Aktuellste Version Banner — gleiche Quelle wie Footer (/api/health, Fallback /VERSION) */}
        <div className="mt-4 p-4 rounded-xl bg-[var(--accent)]/8 border border-[var(--accent)]/30">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Sparkles className="h-4 w-4 text-[var(--accent)]" />
            <span className="text-sm font-semibold text-[var(--accent)]">Aktuelle Version: v{bannerVersionNorm}</span>
            {matched ? (
              <span className="text-xs text-[var(--text-subtle)] ml-1">({matched.date})</span>
            ) : null}
          </div>
          {matched ? (
            <p className="text-sm text-[var(--text-muted)]">{matched.title}</p>
          ) : serverVersionNorm !== null && !anyBannerMatch ? (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Kein Changelog-Eintrag für diese Server-Version in dieser App-Auslieferung — bitte Frontend neu bauen und deployen, damit die Liste zur Version passt.
            </p>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">{latest.title}</p>
          )}
        </div>
      </div>

      {/* Versionen */}
      <div className="space-y-3">
        {CHANGELOG.map((entry, idx) => (
          <VersionCard
            key={entry.version}
            entry={entry}
            defaultOpen={stripVersionPrefix(entry.version) === bannerVersionNorm || (!anyBannerMatch && idx === 0)}
          />
        ))}
      </div>

      <p className="mt-8 text-center text-xs text-slate-400 text-[var(--text-subtle)]">
        Alle Versionen werden hier automatisch angezeigt, wenn der CHANGELOG in
        <code className="mx-1 px-1 py-0.5 bg-[var(--surface-raised)] rounded font-mono">data/changelogData.ts</code>
        erweitert wird.
      </p>
    </div>
  );
}

