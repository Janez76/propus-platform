import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App";
import { ErrorBoundary } from "./components/layout/ErrorBoundary";
import { exposeLoggerOnWindow, logger, setupGlobalErrorLogging } from "./utils/logger";
import { applyTheme } from "./store/themeStore";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Root element not found");
}

setupGlobalErrorLogging();
exposeLoggerOnWindow();
applyTheme();
logger.info("Admin panel startup", {
  mode: import.meta.env.MODE,
  apiBase: import.meta.env.VITE_API_BASE || "auto",
});

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
