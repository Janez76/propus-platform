import type { PropsWithChildren, ReactNode } from "react";

interface SidePanelProps extends PropsWithChildren {
  open: boolean;
  title: string;
  onClose: () => void;
  footer?: ReactNode;
}

export function SidePanel({ open, title, onClose, footer, children }: SidePanelProps) {
  if (!open) return null;
  return (
    <>
      <button type="button" className="sp-overlay" aria-label="Close panel" onClick={onClose} />
      <aside className="sp-panel" role="dialog" aria-modal="true" aria-label={title}>
        <header className="sp-head">
          <div className="flex items-center justify-between gap-2">
            <h3 className="m-0 text-base font-semibold">{title}</h3>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Schliessen
            </button>
          </div>
        </header>
        <div className="sp-body">{children}</div>
        {footer ? <footer className="sp-foot">{footer}</footer> : null}
      </aside>
    </>
  );
}
