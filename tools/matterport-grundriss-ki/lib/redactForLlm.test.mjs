/**
 * Bug-Hunt M06: redactForLlm — sicherstellen, dass Adressen / PLZ /
 * Hausnummern / Strassennamen nicht an Anthropic durchsickern.
 *
 * Run: `node --test lib/redactForLlm.test.mjs` aus tools/matterport-grundriss-ki/.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { redactDescription, redactModelMeta } from './redactForLlm.mjs';

describe('redactDescription', () => {
  it('returns null for empty/non-string input', () => {
    assert.equal(redactDescription(null), null);
    assert.equal(redactDescription(''), null);
    assert.equal(redactDescription(123), null);
    assert.equal(redactDescription('   '), null);
  });

  it('keeps Zimmer-count + Flaeche, drops street/PLZ/city', () => {
    const out = redactDescription('3.5-Zimmer-Wohnung an der Bahnhofstrasse 12, 8001 Zuerich, 122 m²');
    assert.ok(out, 'expected non-null output');
    assert.match(out, /3\.5\s*-?\s*Zimmer/i);
    assert.match(out, /122\s*m[²2]/i);
    assert.doesNotMatch(out, /Bahnhofstrasse/i);
    assert.doesNotMatch(out, /\b8001\b/);
    assert.doesNotMatch(out, /Zuerich|Zürich/i);
    assert.doesNotMatch(out, /\b12\b/);
  });

  it('keeps Buero/Balkon-style features (whether prefixed by mit/und/sowie)', () => {
    const out = redactDescription('5-Zimmer-Maisonette mit Büro und Balkon, Albisstrasse 5, 8045 Zürich');
    assert.ok(out);
    assert.match(out, /5\s*-?\s*Zimmer/);
    assert.match(out, /Maisonette/i);
    assert.match(out, /B[üu]ro/i);
    assert.match(out, /Balkon/i);
    assert.doesNotMatch(out, /Albisstrasse|Zürich|8045/i);
  });

  it('returns null when no recognised hints', () => {
    // Ohne Strukturhints → kein Datenleak; LLM bekommt einfach kein Hint.
    const out = redactDescription('Bahnhofstrasse 12, 8001 Zürich, sehr hell');
    assert.equal(out, null);
  });

  it('caps result length to 200 chars', () => {
    const repeated = Array(50).fill('mit Balkon').join(' ');
    const out = redactDescription(`3-Zimmer-Wohnung ${repeated}`);
    assert.ok(out);
    assert.ok(out.length <= 200, `expected <= 200 chars, got ${out.length}`);
  });

  it('dedupes identical hints case-insensitively', () => {
    const out = redactDescription('5 Zimmer mit Balkon mit BALKON mit balkon');
    assert.ok(out);
    // "mit Balkon" sollte nur einmal vorkommen
    const matches = out.match(/mit\s+balkon/gi) || [];
    assert.equal(matches.length, 1);
  });
});

describe('redactModelMeta', () => {
  it('drops adresse and name entirely', () => {
    const out = redactModelMeta({
      adresse: 'Bahnhofstrasse 12, 8001 Zürich',
      name: 'Showcase Modell — Bahnhofstrasse',
      beschreibung: '3.5-Zimmer mit Büro, 122 m²',
    });
    assert.equal(out.adresse, undefined);
    assert.equal(out.name, undefined);
    assert.match(out.beschreibung_hint, /3\.5\s*-?\s*Zimmer/);
    assert.match(out.beschreibung_hint, /B[üu]ro/i);
  });

  it('handles missing fields gracefully', () => {
    assert.deepEqual(redactModelMeta({}), { beschreibung_hint: null });
    assert.deepEqual(redactModelMeta(undefined), { beschreibung_hint: null });
    assert.deepEqual(redactModelMeta(null), { beschreibung_hint: null });
  });
});
