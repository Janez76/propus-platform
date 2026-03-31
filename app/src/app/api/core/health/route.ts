import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    await pool.query("SELECT 1");
    return NextResponse.json({
      ok: true,
      db: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    logger.error("Health check failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { ok: false, db: "error" },
      { status: 503 },
    );
  }
}
