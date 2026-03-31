import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getBuildId } from "@/lib/buildVersion";
import { logger } from "@/lib/logger";

export async function GET() {
  const buildId = getBuildId();

  try {
    await pool.query("SELECT 1");
    return NextResponse.json({
      ok: true,
      buildId,
      dbEnabled: true,
      db: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    logger.error("Legacy health check failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      {
        ok: false,
        buildId,
        dbEnabled: false,
        db: "error",
      },
      { status: 503 },
    );
  }
}
