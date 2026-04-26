import type { PropsWithChildren, ReactNode } from "react";

interface HandoffSurfaceProps extends PropsWithChildren {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}

export function HandoffSurface({ title, subtitle, actions, className = "", children }: HandoffSurfaceProps) {
  return (
    <section className={`handoff-surface ${className}`.trim()}>
      <header className="handoff-surface-head">
        <div>
          <h1 className="handoff-surface-title">{title}</h1>
          {subtitle ? <p className="handoff-surface-sub">{subtitle}</p> : null}
        </div>
        {actions ? <div className="handoff-surface-actions">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}
