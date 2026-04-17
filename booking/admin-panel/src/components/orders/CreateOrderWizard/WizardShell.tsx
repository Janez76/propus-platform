import type { ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../../../lib/utils";
import { useT } from "../../../hooks/useT";

export type WizardStepDef = {
  key: string;
  label: string;
};

type WizardShellProps = {
  steps: WizardStepDef[];
  currentIndex: number;
  canNext: boolean;
  isSubmitting: boolean;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
  onGoto: (index: number) => void;
  children: ReactNode;
  sidebar?: ReactNode;
};

export function WizardShell({
  steps,
  currentIndex,
  canNext,
  isSubmitting,
  onBack,
  onNext,
  onSubmit,
  onGoto,
  children,
  sidebar,
}: WizardShellProps) {
  const t = useT();
  const isLast = currentIndex === steps.length - 1;
  const current = steps[currentIndex];

  return (
    <div className="flex flex-col gap-5">
      {/* Progress-Bar */}
      <nav aria-label="Wizard progress" className="flex flex-col gap-3">
        <ol className="flex items-center gap-2">
          {steps.map((step, idx) => {
            const done = idx < currentIndex;
            const active = idx === currentIndex;
            const clickable = idx <= currentIndex;
            return (
              <li key={step.key} className="flex items-center gap-2 flex-1 min-w-0">
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => clickable && onGoto(idx)}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-2 w-full min-w-0 rounded-lg transition-colors text-left",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                    clickable ? "cursor-pointer" : "cursor-not-allowed",
                  )}
                >
                  <span
                    className={cn(
                      "flex-none h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold border transition-colors",
                      done && "bg-[var(--accent)] border-[var(--accent)] text-white",
                      active && "bg-[var(--accent)]/10 border-[var(--accent)] text-[var(--accent)]",
                      !done && !active && "bg-[var(--surface-raised)] border-[var(--border-soft)] text-[var(--text-subtle)]",
                    )}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : idx + 1}
                  </span>
                  <span
                    className={cn(
                      "text-xs font-semibold truncate",
                      active ? "text-[var(--text-main)]" : "text-[var(--text-subtle)]",
                    )}
                  >
                    {step.label}
                  </span>
                </button>
                {idx < steps.length - 1 && (
                  <span
                    aria-hidden
                    className={cn(
                      "flex-1 h-px",
                      done ? "bg-[var(--accent)]" : "bg-[var(--border-soft)]",
                    )}
                  />
                )}
              </li>
            );
          })}
        </ol>
        <p className="text-xs text-[var(--text-subtle)]">
          {t("wizard.progress.stepOf")
            .replace("{{current}}", String(currentIndex + 1))
            .replace("{{total}}", String(steps.length))}
          {" · "}
          <span className="text-[var(--text-main)] font-semibold">{current.label}</span>
        </p>
      </nav>

      {/* Content + optional Sidebar */}
      <div className={cn("grid gap-5", sidebar ? "lg:grid-cols-[1fr_320px]" : "grid-cols-1")}>
        <div className="min-w-0">{children}</div>
        {sidebar && (
          <aside className="lg:sticky lg:top-4 lg:self-start">
            {sidebar}
          </aside>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-3 border-t border-[var(--border-soft)]">
        <button
          type="button"
          onClick={onBack}
          disabled={currentIndex === 0 || isSubmitting}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
            "bg-[var(--surface-raised)] text-[var(--text-main)] hover:bg-[var(--surface)]",
            "disabled:opacity-40 disabled:cursor-not-allowed",
          )}
        >
          <ChevronLeft className="h-4 w-4" />
          {t("wizard.button.back")}
        </button>
        {!isLast ? (
          <button
            type="button"
            onClick={onNext}
            disabled={!canNext || isSubmitting}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-5 py-2 text-sm font-semibold transition-colors",
              "bg-[var(--accent)] text-white hover:opacity-90",
              "disabled:opacity-40 disabled:cursor-not-allowed",
            )}
          >
            {t("wizard.button.next")}
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canNext || isSubmitting}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-6 py-2 text-sm font-semibold transition-colors",
              "bg-green-600 text-white hover:bg-green-700 shadow-sm",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                {t("common.creating")}
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                {t("wizard.button.createOrder")}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
