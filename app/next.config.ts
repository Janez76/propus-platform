import type { NextConfig } from "next";

const PLATFORM_INTERNAL_URL =
  process.env.PLATFORM_INTERNAL_URL || "http://localhost:3100";

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
    return [
      {
        source: "/auth/:path*",
        destination: `${PLATFORM_INTERNAL_URL}/auth/:path*`,
      },
    ];
  },
};

export default nextConfig;
