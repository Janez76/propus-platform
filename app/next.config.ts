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
    // On VPS: PLATFORM_INTERNAL_URL is set → proxy /auth/* to Express (beforeFiles
    // so it takes precedence over the Next.js App Router route handlers).
    // On Vercel: PLATFORM_INTERNAL_URL is empty → no rewrite; the App Router
    // route handlers at /auth/logto/* handle OIDC directly.
    if (!PLATFORM_INTERNAL_URL) return [];

    return {
      beforeFiles: [
        {
          source: "/auth/:path*",
          destination: `${PLATFORM_INTERNAL_URL}/auth/:path*`,
        },
        {
          source: "/portal/api/:path*",
          destination: `${PLATFORM_INTERNAL_URL}/tour-manager/portal/api/:path*`,
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
