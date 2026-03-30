import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";
import { logger } from "../../utils/logger";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    const msg = error?.message;
    const fallback = t("de", "errorBoundary.unknownError");
    return {
      hasError: true,
      message: typeof msg === "string" && msg ? msg : fallback,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logger.error("React Error Boundary ausgelöst", {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    const lang = useAuthStore.getState().language;
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center px-4" style={{ background: "var(--bg-classic)" }}>
        <div className="w-full max-w-lg rounded-xl border border-red-300/60 p-6 text-center shadow dark:border-red-900/50" style={{ background: "var(--surface)" }}>
          <h2 className="mb-2 text-xl font-bold text-red-700 dark:text-red-400">
            {t(lang, "errorBoundary.title")}
          </h2>
          <p className="mb-5 text-sm p-text-muted">
            {t(lang, "errorBoundary.message")}
          </p>
          <p className="mb-6 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300 font-mono break-all">
            {typeof this.state.message === "string" ? this.state.message : String(this.state.message)}
          </p>
          <button
            type="button"
            className="btn-primary px-4 py-2 text-sm"
            onClick={this.handleReload}
          >
            {t(lang, "errorBoundary.button.reload")}
          </button>
        </div>
      </div>
    );
  }
}

