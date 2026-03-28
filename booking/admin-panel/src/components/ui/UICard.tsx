import type { PropsWithChildren } from "react";

export function UICard({ children }: PropsWithChildren) {
  return <div className="surface-card p-4">{children}</div>;
}
