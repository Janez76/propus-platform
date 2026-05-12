import type { PropsWithChildren, ReactNode } from "react";

interface SidePanelProps extends PropsWithChildren {
  open: boolean;
  title: string;
  onClose: () => void;
  footer?: ReactNode;
  /** Optional content rendered between the title and the close button. */
  headerRight?: ReactNode;
  /** Optional content rendered as a second header row (badges, actions). */
  headerBelow?: ReactNode;
}

export function SidePanel({
  open,
  title,
  onClose,
  footer,
  headerRight,
  headerBelow,
  children,
}: SidePanelProps) {
  if (!open) return null;
  return (
    <>
      <button type="button" className="sp-overlay open" aria-label="Close panel" onClick={onClose} />
      <aside className="sp-panel open" role="dialog" aria-modal="true" aria-label={title}>
        <header className="sp-head">
          <div className="flex items-center gap-2">
            <h3 className="m-0 min-w-0 truncate text-base font-semibold">{title}</h3>
            {headerRight}
            <button type="button" className="btn-ghost ml-auto shrink-0" onClick={onClose}>
              Schliessen
            </button>
          </div>
          {headerBelow ? <div className="mt-2">{headerBelow}</div> : null}
        </header>
        <div className="sp-body">{children}</div>
        {footer ? <footer className="sp-foot">{footer}</footer> : null}
      </aside>
    </>
  );
}
