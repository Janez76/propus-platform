import type { ReactNode } from "react";
import { usePullToRefresh } from "./usePullToRefresh";

interface MobilePullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  children: ReactNode;
  /** Optional: zusätzliche CSS-Klasse für den Scroll-Container. */
  className?: string;
}

/**
 * Wrapper-Komponente die einen Scroll-Container mit Pull-to-Refresh ausstattet.
 * Zeigt einen sanften Spinner-Indikator oben, der beim Pull mitwächst und bei
 * Refresh rotiert.
 *
 * Usage:
 * ```tsx
 * <MobilePullToRefresh onRefresh={async () => { await refetch(); }}>
 *   <MyList items={items} />
 * </MobilePullToRefresh>
 * ```
 */
export function MobilePullToRefresh({ onRefresh, children, className }: MobilePullToRefreshProps) {
  const { ref, pull, refreshing } = usePullToRefresh<HTMLDivElement>(onRefresh);
  const visible = pull > 0 || refreshing;
  const ready = pull >= 1;
  const indicatorY = refreshing ? 36 : Math.min(56, pull * 56);
  const opacity = refreshing ? 1 : Math.min(1, pull * 1.2);
  /** Content schiebt nur leicht runter (max ~32px); kein 1:1-Drag-Mapping,
   *  weil sonst zu schnell zu viel Fläche entsteht. */
  const contentY = refreshing ? 24 : Math.min(32, pull * 28);

  return (
    <div
      ref={ref}
      className={`mob-ptr-wrap${className ? ` ${className}` : ""}`}
    >
      <div
        className="mob-ptr-indicator"
        style={{
          transform: `translate3d(0, ${indicatorY - 32}px, 0)`,
          opacity,
        }}
        aria-hidden={!visible}
      >
        <span
          className={`mob-ptr-spinner${ready ? " mob-ptr-spinner--ready" : ""}${refreshing ? " mob-ptr-spinner--refreshing" : ""}`}
          style={{
            transform: refreshing ? "none" : `rotate(${pull * 360}deg)`,
          }}
        />
      </div>
      <div
        style={{
          transform: visible ? `translate3d(0, ${contentY}px, 0)` : "none",
          transition: refreshing || pull === 0 ? "transform 0.2s ease" : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}
