import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="u-container" style={{ padding: "2rem", maxWidth: "42rem", margin: "0 auto" }}>
          <h1 style={{ fontSize: "1.25rem", marginBottom: "0.75rem" }}>Die Ansicht ist fehlgeschlagen</h1>
          <p style={{ color: "var(--color-text-muted)", marginBottom: "1rem" }}>{this.state.error.message}</p>
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
            Details stehen in der Browser-Konsole (F12). Seite neu laden oder Support kontaktieren.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
