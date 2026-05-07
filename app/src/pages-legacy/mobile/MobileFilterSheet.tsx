/**
 * Mobile-Orders-Redesign Phase 3 — Filter-Bottom-Sheet.
 *
 * Slide-up Sheet mit Status-Auswahl, Mitarbeiter-Filter und Reset.
 * Bewusst keine Headless-UI-Dependency — eigene minimal Implementation
 * mit Backdrop + Esc-Handler + click-outside-close.
 *
 * Wird vom MobileOrdersTab geoeffnet, wenn User auf das Filter-Icon
 * neben der Suchleiste tippt.
 */
import { useEffect, useRef } from "react";
import { Check, X } from "lucide-react";
import "./mobile-ui.css";

export interface MobileFilterState {
  /** Set von Status-Strings (z.B. "pending", "confirmed"). Leer = alle. */
  statuses: Set<string>;
  /** Photographer-Key oder null = alle. */
  photographerKey: string | null;
}

export const EMPTY_FILTERS: MobileFilterState = {
  statuses: new Set(),
  photographerKey: null,
};

export interface MobileFilterStatusOption {
  key: string;
  label: string;
}

export interface MobileFilterPhotographerOption {
  key: string;
  label: string;
}

interface MobileFilterSheetProps {
  open: boolean;
  onClose: () => void;
  state: MobileFilterState;
  onChange: (next: MobileFilterState) => void;
  statusOptions: MobileFilterStatusOption[];
  photographerOptions: MobileFilterPhotographerOption[];
}

export function MobileFilterSheet({
  open,
  onClose,
  state,
  onChange,
  statusOptions,
  photographerOptions,
}: MobileFilterSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  // Esc + click-outside.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onClick = (e: MouseEvent) => {
      if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open, onClose]);

  if (!open) return null;

  const toggleStatus = (key: string) => {
    const next = new Set(state.statuses);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange({ ...state, statuses: next });
  };

  const setPhotographer = (key: string | null) => {
    onChange({ ...state, photographerKey: key });
  };

  const reset = () => onChange(EMPTY_FILTERS);

  const activeCount = state.statuses.size + (state.photographerKey ? 1 : 0);

  return (
    <div
      className="mob-sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Filter"
    >
      <div ref={sheetRef} className="mob-sheet">
        <div className="mob-sheet-h">
          <h2 className="mob-sheet-title">Filter</h2>
          <button
            type="button"
            className="mob-sheet-close"
            onClick={onClose}
            aria-label="Schliessen"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="mob-sheet-section">
          <div className="mob-sheet-section-h">Status</div>
          <div className="mob-sheet-chips">
            {statusOptions.map((opt) => {
              const active = state.statuses.has(opt.key);
              return (
                <button
                  key={opt.key}
                  type="button"
                  className={`mob-sheet-chip${active ? " mob-sheet-chip--active" : ""}`}
                  onClick={() => toggleStatus(opt.key)}
                  aria-pressed={active}
                >
                  {active && <Check size={11} aria-hidden />}
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {photographerOptions.length > 0 && (
          <div className="mob-sheet-section">
            <div className="mob-sheet-section-h">Mitarbeiter</div>
            <div className="mob-sheet-chips">
              <button
                type="button"
                className={`mob-sheet-chip${state.photographerKey === null ? " mob-sheet-chip--active" : ""}`}
                onClick={() => setPhotographer(null)}
                aria-pressed={state.photographerKey === null}
              >
                {state.photographerKey === null && <Check size={11} aria-hidden />}
                <span>Alle</span>
              </button>
              {photographerOptions.map((opt) => {
                const active = state.photographerKey === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    className={`mob-sheet-chip${active ? " mob-sheet-chip--active" : ""}`}
                    onClick={() => setPhotographer(opt.key)}
                    aria-pressed={active}
                  >
                    {active && <Check size={11} aria-hidden />}
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mob-sheet-foot">
          <button
            type="button"
            className="mob-sheet-btn mob-sheet-btn--ghost"
            onClick={reset}
            disabled={activeCount === 0}
          >
            Zurücksetzen
          </button>
          <button
            type="button"
            className="mob-sheet-btn mob-sheet-btn--primary"
            onClick={onClose}
          >
            {activeCount > 0 ? `${activeCount} Filter aktiv · Anwenden` : "Schliessen"}
          </button>
        </div>
      </div>
    </div>
  );
}
