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
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
