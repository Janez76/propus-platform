"use client";

/**
 * LinkifiedText — verwandelt Entity-Referenzen in Bot-Antworten in klickbare Links.
 *
 * Erkannte Muster (deutsch + englisch, mit/ohne #):
 *   - Auftrag/Bestellung/Order  #1234     → /orders/1234
 *   - Tour                       #42       → /admin/tours/42
 *   - Rechnung/Invoice           #99       → /admin/invoices?search=99
 *   - Kunde/Customer             #7        → /admin/customers/7
 *
 * Plus rohe URLs (http/https) und E-Mail-Adressen.
 *
 * Conservative: nur Zahlen-IDs, kein Aliasing — bessere Konfusion vermeiden.
 */
import React from "react";

type Token = { type: "text"; text: string } | { type: "link"; text: string; href: string; external?: boolean };

const PATTERNS: Array<{ regex: RegExp; build: (m: RegExpExecArray) => { text: string; href: string; external?: boolean } }> = [
  // Auftrag/Bestellung/Order #1234 oder Auftrag 1234 — auch "Auftragsnr"/"Bestellnr"
  {
    regex: /\b(?:Auftrag(?:s(?:nummer|-?nr\.?))?|Bestell(?:ung|nummer|-?nr\.?)|Order)\s*#?\s*(\d{2,8})\b/gi,
    build: (m) => ({ text: m[0], href: `/orders/${m[1]}` }),
  },
  // Tour #42 / Tour 42
  {
    regex: /\bTour\s*#?\s*(\d{1,7})\b/gi,
    build: (m) => ({ text: m[0], href: `/admin/tours/${m[1]}` }),
  },
  // Rechnung #99 / Invoice 99
  {
    regex: /\b(?:Rechnung(?:s(?:nummer|-?nr\.?))?|Invoice)\s*#?\s*(\d{1,9})\b/gi,
    build: (m) => ({ text: m[0], href: `/admin/invoices?search=${m[1]}` }),
  },
  // Kunde/Customer #7
  {
    regex: /\b(?:Kunde(?:n(?:nummer|-?nr\.?))?|Customer)\s*#\s*(\d{1,7})\b/gi,
    build: (m) => ({ text: m[0], href: `/admin/customers/${m[1]}` }),
  },
  // Ticket #123
  {
    regex: /\bTicket\s*#?\s*(\d{1,7})\b/gi,
    build: (m) => ({ text: m[0], href: `/admin/tickets?id=${m[1]}` }),
  },
  // URLs
  {
    regex: /\bhttps?:\/\/[^\s<>"']+/gi,
    build: (m) => ({ text: m[0], href: m[0], external: true }),
  },
  // E-Mail
  {
    regex: /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi,
    build: (m) => ({ text: m[0], href: `mailto:${m[0]}`, external: true }),
  },
];

type Match = { start: number; end: number; href: string; external?: boolean; text: string };

function findMatches(text: string): Match[] {
  const all: Match[] = [];
  for (const p of PATTERNS) {
    p.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = p.regex.exec(text))) {
      const built = p.build(m);
      all.push({
        start: m.index,
        end: m.index + m[0].length,
        href: built.href,
        external: built.external,
        text: built.text,
      });
    }
  }
  // Überlappungen entfernen: bevorzugt längster Match, sonst erster
  all.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const filtered: Match[] = [];
  let lastEnd = -1;
  for (const m of all) {
    if (m.start >= lastEnd) {
      filtered.push(m);
      lastEnd = m.end;
    }
  }
  return filtered;
}

function tokenize(text: string): Token[] {
  if (!text) return [];
  const matches = findMatches(text);
  if (matches.length === 0) return [{ type: "text", text }];
  const out: Token[] = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start > cursor) out.push({ type: "text", text: text.slice(cursor, m.start) });
    out.push({ type: "link", text: m.text, href: m.href, external: m.external });
    cursor = m.end;
  }
  if (cursor < text.length) out.push({ type: "text", text: text.slice(cursor) });
  return out;
}

export function LinkifiedText({ text, className }: { text: string; className?: string }) {
  const tokens = React.useMemo(() => tokenize(text), [text]);
  return (
    <span className={className}>
      {tokens.map((t, i) =>
        t.type === "text" ? (
          <React.Fragment key={i}>{t.text}</React.Fragment>
        ) : (
          <a
            key={i}
            href={t.href}
            target={t.external ? "_blank" : undefined}
            rel={t.external ? "noopener noreferrer" : undefined}
            className="font-medium text-[var(--accent)] underline decoration-[var(--accent)]/40 underline-offset-2 hover:decoration-[var(--accent)]"
          >
            {t.text}
          </a>
        ),
      )}
    </span>
  );
}
