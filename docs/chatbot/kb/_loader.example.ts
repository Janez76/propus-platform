// platform/chat/kb-loader.ts
// Reference implementation. Adapt paths to your build setup.

import fs from 'node:fs';
import path from 'node:path';

type Locale = 'de-CH' | 'en';

interface KbManifest {
  version: number;
  default_locale: Locale;
  locales: Locale[];
  summary_topics: string[];
  topics: Record<string, { files: Record<Locale, string> }>;
  qa_patterns: Record<Locale, string>;
}

interface QaPattern {
  id: string;
  intent: string;
  triggers: string[];
  answer_de: string;
  answer_en: string;
  next_action?: string;
}

const KB_ROOT = path.join(process.cwd(), 'docs', 'chatbot', 'kb');

let cache: {
  manifest: KbManifest;
  topics: Map<string, Record<Locale, string>>;     // topic → { 'de-CH': content, en: content }
  qa: Record<Locale, QaPattern[]>;
  loadedAt: number;
} | null = null;

export function loadKb(): NonNullable<typeof cache> {
  if (cache) return cache;

  const manifestRaw = fs.readFileSync(path.join(KB_ROOT, '_index.json'), 'utf8');
  const manifest = JSON.parse(manifestRaw) as KbManifest;

  const topics = new Map<string, Record<Locale, string>>();
  for (const [topic, def] of Object.entries(manifest.topics)) {
    const entry: Record<Locale, string> = { 'de-CH': '', en: '' };
    for (const locale of manifest.locales) {
      const file = def.files[locale];
      if (!file) continue;
      const fullPath = path.join(KB_ROOT, file);
      if (!fs.existsSync(fullPath)) {
        throw new Error(`KB file missing: ${file} (topic ${topic}, locale ${locale})`);
      }
      entry[locale] = fs.readFileSync(fullPath, 'utf8');
    }
    topics.set(topic, entry);
  }

  const qa: Record<Locale, QaPattern[]> = { 'de-CH': [], en: [] };
  for (const locale of manifest.locales) {
    const file = manifest.qa_patterns[locale];
    if (!file) continue;
    qa[locale] = JSON.parse(fs.readFileSync(path.join(KB_ROOT, file), 'utf8'));
  }

  cache = { manifest, topics, qa, loadedAt: Date.now() };
  return cache;
}

/** Compact summary for the system prompt — concatenated short topics. */
export function buildKbSummary(locale: Locale): string {
  const kb = loadKb();
  return kb.manifest.summary_topics
    .map(topic => {
      const block = kb.topics.get(topic)?.[locale];
      if (!block) return null;
      return `## ${topic}\n${firstParagraph(block)}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

/** Full content of a single topic — returned by the lookup_kb tool. */
export function lookupTopic(topic: string, locale: Locale): string | null {
  const kb = loadKb();
  return kb.topics.get(topic)?.[locale] ?? null;
}

/** Q&A patterns get appended to the system prompt as a compact reference. */
export function buildQaSnippet(locale: Locale): string {
  const kb = loadKb();
  const list = kb.qa[locale] ?? [];
  return list
    .map(p => `- ${p.intent}: ${locale === 'en' ? p.answer_en : p.answer_de}`)
    .join('\n');
}

function firstParagraph(md: string): string {
  // Strip headings and take the first non-empty paragraph.
  const lines = md.split('\n').filter(l => !l.startsWith('#'));
  let buf: string[] = [];
  for (const line of lines) {
    if (line.trim() === '') {
      if (buf.length) break;
    } else {
      buf.push(line);
    }
  }
  return buf.join(' ').trim();
}

// ─── Tool definition for Anthropic ──────────────────────────────────────────
export const lookupKbTool = {
  name: 'lookup_kb',
  description:
    'Retrieves the full Propus knowledge-base entry for a given topic. ' +
    'Use when the user asks for details that are not in the system-prompt summary. ' +
    'Available topics: ' +
    Object.keys(loadKb().manifest.topics).join(', '),
  input_schema: {
    type: 'object',
    properties: {
      topic: { type: 'string' },
      locale: { type: 'string', enum: ['de-CH', 'en'] },
    },
    required: ['topic', 'locale'],
  },
};
