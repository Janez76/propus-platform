import type { NextConfig } from "next";

const PLATFORM_INTERNAL_URL = process.env.PLATFORM_INTERNAL_URL || "";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "pg",
    "pdfkit",
    "swissqrbill",
    "sharp",
    "nodemailer",
    "winston",
  ],
  async rewrites() {
    // On VPS: PLATFORM_INTERNAL_URL is set -> kritische Runtime-Pfade direkt
    // an Express leiten (beforeFiles), um den internen Next-Proxy-Hop zu umgehen.
    // On Vercel: PLATFORM_INTERNAL_URL is empty -> keine externen Rewrites.
    if (!PLATFORM_INTERNAL_URL) return [];

    return {
      beforeFiles: [
        {
          source: "/api/admin/:path*",
          destination: `${PLATFORM_INTERNAL_URL}/api/admin/:path*`,
        },
        {
          source: "/api/catalog/:path*",
          destination: `${PLATFORM_INTERNAL_URL}/api/catalog/:path*`,
        },
        {
          source: "/api/travel-zone",
          destination: `${PLATFORM_INTERNAL_URL}/api/travel-zone`,
        },
        {
          source: "/api/booking/:path*",
          destination: `${PLATFORM_INTERNAL_URL}/api/booking/:path*`,
        },
        {
          source: "/auth/:path*",
          destination: `${PLATFORM_INTERNAL_URL}/auth/:path*`,
        },
        {
          source: "/portal/api/:path*",
          destination: `${PLATFORM_INTERNAL_URL}/tour-manager/portal/api/:path*`,
        },
        // /webhook/* bleibt bewusst ohne Rewrite (Signatur-Integritaet).
        {
          source: "/tour-manager/api/invite/:path*",
          destination: `${PLATFORM_INTERNAL_URL}/tour-manager/api/invite/:path*`,
        },
        // Cleanup-Dashboard-API (öffentlich, Token-basiert) — VOR dem /cleanup/:path* Rewrite
        {
          source: "/api/cleanup/:path*",
          destination: `${PLATFORM_INTERNAL_URL}/api/cleanup/:path*`,
        },
        // Bereinigungslauf-Aktionsseiten: Express-routen für Token-Links
        // /cleanup/dashboard wird von React gerendert (kein Rewrite)
        {
          source: "/cleanup/weiterfuehren/:path*",
          destination: `${PLATFORM_INTERNAL_URL}/cleanup/weiterfuehren/:path*`,
        },
        {
          source: "/cleanup/weiterfuehren",
          destination: `${PLATFORM_INTERNAL_URL}/cleanup/weiterfuehren`,
        },
        {
          source: "/cleanup/archivieren",
          destination: `${PLATFORM_INTERNAL_URL}/cleanup/archivieren`,
        },
        {
          source: "/cleanup/uebertragen",
          destination: `${PLATFORM_INTERNAL_URL}/cleanup/uebertragen`,
        },
        {
          source: "/cleanup/loeschen",
          destination: `${PLATFORM_INTERNAL_URL}/cleanup/loeschen`,
        },
        {
          source: "/cleanup/preview",
          destination: `${PLATFORM_INTERNAL_URL}/cleanup/preview`,
        },
        // ─── Selekto SPA + Proxy-Routen ────────────────────────────────────
        {
          source: "/selekto/:path*",
          destination: `${PLATFORM_INTERNAL_URL}/selekto/:path*`,
        },
        {
          source: "/__propus-nextcloud/:path*",
          destination: `${PLATFORM_INTERNAL_URL}/__propus-nextcloud/:path*`,
        },
        {
          source: "/__propus-nc-thumb/:path*",
          destination: `${PLATFORM_INTERNAL_URL}/__propus-nc-thumb/:path*`,
        },
        {
          source: "/__propus-pdf-inline",
          destination: `${PLATFORM_INTERNAL_URL}/__propus-pdf-inline`,
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
