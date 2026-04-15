import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Optional env vars used in frontend:
// - VITE_API_BASE  (leer = im Dev gleicher Host, /api wird per Proxy ans Backend weitergeleitet)
// - VITE_CUSTOMER_PORTAL_URL
const backendPort = process.env.BACKEND_PORT || "3001";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("node_modules")) {
            if (id.includes("@fullcalendar")) return "vendor-fullcalendar";
            if (id.includes("react-dom") || id.includes("react/") || id.includes("react-router")) return "vendor-react";
            if (id.includes("@tiptap") || id.includes("prosemirror")) return "vendor-tiptap";
            if (id.includes("@tanstack/react-table")) return "vendor-table";
            if (id.includes("framer-motion")) return "vendor-framer";
          }
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${backendPort}`,
        changeOrigin: false,
      },
      "/auth": {
        target: `http://127.0.0.1:${backendPort}`,
        changeOrigin: false,
      },
    },
  },
});
