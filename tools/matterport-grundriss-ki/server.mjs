import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import { listModels, getModelDetail } from './matterport-client.mjs';
import { buildFloorPlanPayload } from './buildFloorPlanPayload.mjs';
import { cleanRooms } from './lib/cleanRooms.mjs';
import { classifyRooms } from './lib/classifyRooms.mjs';
import { validateRooms } from './lib/validateRooms.mjs';
import { layoutRooms } from './lib/layoutRooms.mjs';
import { renderFloorSvg } from './lib/renderSvg.mjs';
import { loadCorrections, saveCorrections, applyCorrections } from './lib/corrections.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, '.env') });

const PORT = Number(process.env.PORT || 3333);
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    matterport: !!(process.env.MATTERPORT_TOKEN_ID && process.env.MATTERPORT_TOKEN_SECRET),
    anthropic: !!process.env.ANTHROPIC_API_KEY,
  });
});

app.get('/api/models', async (_req, res) => {
  const { results, error } = await listModels();
  if (error) return res.status(400).json({ ok: false, error });
  res.json({ ok: true, models: results });
});

app.get('/api/models/:id', async (req, res) => {
  const { model, error } = await getModelDetail(req.params.id);
  if (error) return res.status(400).json({ ok: false, error });
  res.json({ ok: true, model });
});

app.get('/api/models/:id/context', async (req, res) => {
  const { model, error } = await getModelDetail(req.params.id);
  if (error) return res.status(400).json({ ok: false, error });
  const payload = buildFloorPlanPayload(model);
  res.json({ ok: true, payload });
});

app.get('/api/models/:id/corrections', async (req, res) => {
  const data = await loadCorrections(__dirname, req.params.id);
  res.json({ ok: true, corrections: data });
});

app.put('/api/models/:id/corrections', async (req, res) => {
  try {
    const saved = await saveCorrections(__dirname, req.params.id, req.body || {});
    res.json({ ok: true, corrections: saved });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

const VIEWPORT = { x: 70, y: 120, w: 1050, h: 620 };

async function processFloor({ anthropic, modelMeta, floor, corrections }) {
  const rawRooms = floor.echte_raeume || [];
  if (!rawRooms.length) {
    return {
      ok: false,
      floorLabel: floor.floorLabel,
      error: 'Keine Räume aus Matterport (Property-Plan-Add-on evtl. nicht aktiv).',
    };
  }

  const cleaned = cleanRooms(rawRooms);
  if (!cleaned.length) {
    return {
      ok: false,
      floorLabel: floor.floorLabel,
      error: 'Nach Bereinigung sind keine Räume übrig.',
    };
  }

  const pipelineNotes = [];
  let naming = new Map();

  if (process.env.ANTHROPIC_API_KEY && anthropic) {
    try {
      naming = await classifyRooms({
        anthropic,
        model: ANTHROPIC_MODEL,
        modelMeta,
        rooms: cleaned,
        mattertags: floor.mattertags || [],
      });
      pipelineNotes.push(`Classifier: ${naming.size}/${cleaned.length} klassifiziert.`);
    } catch (e) {
      console.warn(`[classify] ${floor.floorLabel}:`, e.message);
      pipelineNotes.push(`Classifier-Fehler: ${e.message}`);
    }

    if (naming.size) {
      try {
        const v = await validateRooms({
          anthropic,
          model: ANTHROPIC_MODEL,
          modelMeta,
          rooms: cleaned,
          naming,
        });
        naming = v.map;
        const realChanges = v.notes.filter(
          (n) => !n.startsWith('Validator:') && !n.startsWith('Validator-')
        );
        if (realChanges.length) {
          pipelineNotes.push(`Validator: ${realChanges.length} Korrektur(en) — ${realChanges.join('; ')}`);
        } else {
          pipelineNotes.push('Validator: keine Änderung.');
        }
      } catch (e) {
        console.warn(`[validate] ${floor.floorLabel}:`, e.message);
        pipelineNotes.push(`Validator-Fehler: ${e.message}`);
      }
    }
  }

  const { map: finalNaming, applied } = applyCorrections(naming, corrections);
  if (applied) pipelineNotes.push(`User-Korrekturen angewandt: ${applied}.`);

  let unknownIdx = 0;
  const named = cleaned.map((r) => {
    const hit = finalNaming.get(r.id);
    if (hit) return { ...r, name: hit.name, kategorie: hit.kategorie };
    unknownIdx += 1;
    return { ...r, name: `RAUM ${unknownIdx}`, kategorie: 'unbekannt' };
  });

  const layout = layoutRooms({
    rooms: named,
    viewport: VIEWPORT,
    floorBoundingBoxWorld: floor.boundingBox,
  });

  const totalIndoorAreaM2 = named
    .filter((r) => !['terrasse', 'balkon', 'patio'].includes(r.kategorie))
    .reduce((s, r) => s + (r.flaeche_m2 || 0), 0);

  const svg = renderFloorSvg({
    modelMeta,
    floorLabel: floor.floorLabel,
    layout,
    totalIndoorAreaM2,
    interactive: true,
  });

  return {
    ok: true,
    floorLabel: floor.floorLabel,
    notes: pipelineNotes.join(' '),
    svg,
    rooms: layout.map((r) => ({
      id: r.id,
      name: r.name,
      kategorie: r.kategorie,
      breite_m: r.breite_m,
      tiefe_m: r.tiefe_m,
      flaeche_m2: r.flaeche_m2,
      svgX: r.svgX,
      svgY: r.svgY,
      svgW: r.svgW,
      svgH: r.svgH,
    })),
  };
}

app.post('/api/models/:id/floorplans', async (req, res) => {
  const { model, error } = await getModelDetail(req.params.id);
  if (error) return res.status(400).json({ ok: false, error });

  const payload = buildFloorPlanPayload(model);
  const floors = payload.etagen || [];
  if (!floors.length) {
    return res.status(400).json({ ok: false, error: 'Keine Etagen im Modell.' });
  }

  const corrections = await loadCorrections(__dirname, model.id);

  const anthropic = process.env.ANTHROPIC_API_KEY
    ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    : null;

  try {
    const results = await Promise.all(
      floors.map((f) =>
        processFloor({ anthropic, modelMeta: payload.modell, floor: f, corrections })
      )
    );
    res.json({
      ok: true,
      modelId: model.id,
      modelName: model.name,
      quelle: payload.quelle,
      result: {
        disclaimer:
          'Maße aus Matterport rooms.dimensions; Layout deterministisch (Rechteck-Snapping). Keine Vermessung.',
        address: payload.modell.adresse || payload.modell.name,
        floors: results.map((r) =>
          r.ok
            ? { floorLabel: r.floorLabel, notes: r.notes, svg: r.svg, rooms: r.rooms }
            : { floorLabel: r.floorLabel, notes: `Fehler: ${r.error}`, svg: null }
        ),
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`Matterport Grundriss KI → http://localhost:${PORT}`);
  console.log(
    'Pipeline: matterport rooms → cleanRooms → classifyRooms → validateRooms → applyCorrections → layoutRooms → renderSvg'
  );
});
