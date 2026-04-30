/**
 * POST /api/assistant/transcribe
 *
 * Nimmt: multipart/form-data mit Feld "audio" (Blob/File).
 * Liefert: { text, durationMs, language }
 */

import { NextRequest, NextResponse } from 'next/server';
import { transcribeAudio } from '@/lib/assistant/whisper';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('audio');

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'Audio-Datei fehlt (Feld: "audio")' }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const mimeType = file.type || 'audio/webm';

  try {
    const result = await transcribeAudio(buffer, mimeType);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transkription fehlgeschlagen';
    console.error('[TRANSCRIBE] Fehler:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
