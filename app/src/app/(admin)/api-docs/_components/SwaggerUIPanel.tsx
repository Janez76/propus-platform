"use client";

import { useEffect, useRef, useState } from "react";

const SWAGGER_VERSION = "5.17.14";
const CSS_HREF = `https://unpkg.com/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui.css`;
const JS_SRC = `https://unpkg.com/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui-bundle.js`;
const PRESET_SRC = `https://unpkg.com/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui-standalone-preset.js`;

declare global {
  interface Window {
    SwaggerUIBundle?: (cfg: Record<string, unknown>) => unknown;
    SwaggerUIStandalonePreset?: { slice: (start: number, end: number) => unknown[] } & unknown[];
  }
}

function loadCss(href: string): void {
  if (document.head.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.head.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === "1") return resolve();
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`failed to load ${src}`)), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.addEventListener("load", () => {
      script.dataset.loaded = "1";
      resolve();
    });
    script.addEventListener("error", () => reject(new Error(`failed to load ${src}`)));
    document.head.appendChild(script);
  });
}

export function SwaggerUIPanel() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        loadCss(CSS_HREF);
        await loadScript(JS_SRC);
        await loadScript(PRESET_SRC);
        if (cancelled) return;
        if (!window.SwaggerUIBundle) throw new Error("SwaggerUIBundle nicht geladen");
        if (!containerRef.current) return;
        const presets: unknown[] = [];
        const SUI = window.SwaggerUIBundle as unknown as {
          presets: { apis: unknown };
          SwaggerUIStandalonePreset?: unknown;
        } & ((cfg: Record<string, unknown>) => unknown);
        if (SUI.presets?.apis) presets.push(SUI.presets.apis);
        if (window.SwaggerUIStandalonePreset) presets.push(window.SwaggerUIStandalonePreset);
        SUI({
          url: "/api/openapi/spec",
          dom_id: "#swagger-ui-root",
          presets,
          deepLinking: true,
          docExpansion: "none",
          defaultModelsExpandDepth: 0,
          tryItOutEnabled: true,
          persistAuthorization: true,
          filter: true,
        });
        if (!cancelled) setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Swagger UI konnte nicht geladen werden");
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#fafafa" }}>
      <div
        style={{
          padding: "12px 24px",
          borderBottom: "1px solid #e5e7eb",
          background: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <strong style={{ fontSize: 14 }}>Propus Platform API</strong>
          <span style={{ marginLeft: 12, fontSize: 12, color: "#6b7280" }}>
            Auto-Stubs aus <code>booking/server.js</code>, <code>tours/routes/*</code> und{" "}
            <code>app/src/app/api/**/route.ts</code>. Regenerieren mit{" "}
            <code>node scripts/extract-routes.js</code>.
          </span>
        </div>
        <div style={{ fontSize: 12 }}>
          <a href="/api/openapi/spec" target="_blank" rel="noreferrer" style={{ marginRight: 12 }}>
            JSON
          </a>
          <a href="/api/openapi/spec?format=yaml" target="_blank" rel="noreferrer">
            YAML
          </a>
        </div>
      </div>
      {error && (
        <div style={{ padding: 16, color: "#b91c1c", background: "#fef2f2" }}>
          Fehler: {error}
        </div>
      )}
      {loading && !error && (
        <div style={{ padding: 16, color: "#6b7280" }}>Swagger UI laedt...</div>
      )}
      <div id="swagger-ui-root" ref={containerRef} />
    </div>
  );
}
