import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  try {
    await pool.query("SELECT 1");
    return NextResponse.json({
      ok: true,
      db: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        db: "error",
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 503 },
    );
  }
}
