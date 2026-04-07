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
    // On VPS: PLATFORM_INTERNAL_URL is set -> proxy runtime API/Auth requests
    // direkt an Express (beforeFiles), damit sie Vorrang vor App-Router-
    // Handlern haben und kein zusaetzlicher interner Fetch-Hop noetig ist.
    // On Vercel: PLATFORM_INTERNAL_URL is empty -> no rewrite; the App Router
    // route handlers at /auth/logto/* handle OIDC directly.
    if (!PLATFORM_INTERNAL_URL) return [];

    return {
      beforeFiles: [
        {
          source: "/api/:path*",
          destination: `${PLATFORM_INTERNAL_URL}/api/:path*`,
        },
        {
          source: "/auth/:path*",
          destination: `${PLATFORM_INTERNAL_URL}/auth/:path*`,
        },
        {
          source: "/portal/api/:path*",
          destination: `${PLATFORM_INTERNAL_URL}/tour-manager/portal/api/:path*`,
        },
        // /webhook/* wird als Next.js-Route (app/webhook/payrexx/route.ts) gehandelt,
        // kein Rewrite - sonst veraendert Next.js die Body-Byte-Reihenfolge und
        // die HMAC-Signatur von Payrexx schlaegt fehl.
        {
          source: "/tour-manager/api/invite/:path*",
          destination: `${PLATFORM_INTERNAL_URL}/tour-manager/api/invite/:path*`,
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
