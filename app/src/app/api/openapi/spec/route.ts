import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import yaml from "js-yaml";

export const runtime = "nodejs";
// Spec aendert sich nur bei Deploys (regeneriert via scripts/extract-routes.js).
// Innerhalb eines Deploys ist sie statisch — dynamisches Force-Reading ist
// unnoetig, aber ein Process-Cache spart Disk-Reads bei jeder Anfrage.
export const dynamic = "force-static";

let cached: { json: unknown; raw: string } | null = null;

async function loadSpec(): Promise<{ json: unknown; raw: string }> {
  if (cached) return cached;
  // process.cwd() in Next.js production = app/. docs/ liegt eine Ebene drueber.
  // Wir suchen die Spec relativ zum Repo-Root und fallen auf einen kopierten
  // Pfad in app/public/openapi.yaml zurueck (falls Build-Step die Spec dorthin
  // mitkopiert hat — aktuell nicht der Fall, aber laesst sich spaeter aktivieren).
  const candidates = [
    path.resolve(process.cwd(), "..", "docs/openapi/openapi.yaml"),
    path.resolve(process.cwd(), "docs/openapi/openapi.yaml"),
    path.resolve(process.cwd(), "public/openapi.yaml"),
  ];
  let raw: string | null = null;
  for (const p of candidates) {
    try {
      raw = await fs.readFile(p, "utf8");
      break;
    } catch {
      // weitersuchen
    }
  }
  if (!raw) throw new Error("openapi.yaml nicht gefunden");
  const json = yaml.load(raw);
  cached = { json, raw };
  return cached;
}

export async function GET(req: Request) {
  try {
    const { json, raw } = await loadSpec();
    const accept = req.headers.get("accept") || "";
    const wantsYaml = accept.includes("yaml") || new URL(req.url).searchParams.get("format") === "yaml";
    if (wantsYaml) {
      return new NextResponse(raw, {
        status: 200,
        headers: {
          "Content-Type": "application/yaml; charset=utf-8",
          "Cache-Control": "private, max-age=300",
        },
      });
    }
    return NextResponse.json(json, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "spec load failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
