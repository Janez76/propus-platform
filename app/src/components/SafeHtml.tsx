/**
 * SafeHtml — wrapper um DOMPurify, ersetzt direkten dangerouslySetInnerHTML-
 * Aufruf bei externem oder benutzergeneriertem HTML.
 *
 * Hintergrund (Bug-Hunt T05 HIGH):
 *  - PosteingangPage.tsx renderte `m.body_html` aus eingehenden Mails ungefiltert
 *  - HeroGreeting.tsx renderte zusammengesetzte Übersetzungs-Templates ungefiltert
 *  Beide Stellen sind XSS-anfällig: ein Mail-Sender bzw. ein manipulierbarer
 *  Metric-Wert kann beliebiges JavaScript im Admin-Kontext ausführen.
 *
 * Diese Komponente sanitisiert eingehendes HTML mit `isomorphic-dompurify`
 * (läuft serverseitig via jsdom + clientseitig nativ). Default-Profile
 * orientieren sich an Mail-Rendering — strict für UI-Strings, etwas
 * großzügiger für Mail-Bodies.
 *
 * Verwendung:
 *   <SafeHtml html={mail.body_html} variant="mail" />
 *   <SafeHtml html={greeting} />          // default = "ui"
 */

import DOMPurify from "isomorphic-dompurify";
import type { Config as DOMPurifyConfig } from "dompurify";
import type { ReactElement } from "react";

export type SafeHtmlVariant = "ui" | "mail";

type WrapperTag = "div" | "span" | "p";

interface SafeHtmlProps {
  html: string | null | undefined;
  /**
   * - "ui": sehr restriktiv, nur Inline-Formatierung. Default.
   * - "mail": typische Mail-HTML-Tags (b, i, p, a, ul, li, br, img, table, …),
   *   `target="_blank" rel="noopener noreferrer"` für alle Links erzwungen.
   */
  variant?: SafeHtmlVariant;
  /** HTML-Element-Type für den Wrapper (default `div` für mail, `span` für ui). */
  as?: WrapperTag;
  className?: string;
}

const PROFILES: Record<SafeHtmlVariant, DOMPurifyConfig> = {
  ui: {
    ALLOWED_TAGS: ["b", "strong", "i", "em", "u", "br", "span"],
    ALLOWED_ATTR: ["class"],
    ALLOW_DATA_ATTR: false,
  },
  mail: {
    ALLOWED_TAGS: [
      "a", "b", "blockquote", "br", "code", "div", "em", "h1", "h2", "h3",
      "h4", "h5", "h6", "hr", "i", "img", "li", "ol", "p", "pre", "small",
      "span", "strong", "sub", "sup", "table", "tbody", "td", "tfoot", "th",
      "thead", "tr", "u", "ul",
    ],
    // `style` bewusst NICHT in der Allowlist: DOMPurify warnt vor CSS-/HTTP-
    // Leak-Vektoren via inline-styles (z.B. background-image:url(...) als
    // Tracking-Pixel, position-tricks fuer click-jacking). Wenn Mail-Layouts
    // auffallen weil sie ohne styles unschoener wirken — Allowlist hier um
    // konkrete Properties (color, font-weight, text-align) erweitern, NICHT
    // pauschal style zulassen.
    ALLOWED_ATTR: [
      "href", "src", "alt", "title", "class", "width", "height",
      "colspan", "rowspan", "align",
    ],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|data:image\/(?:png|jpeg|gif|webp);base64,)/i,
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ["target", "rel"],
  },
};

/**
 * Hook-Setup einmalig beim Modul-Load. Ersetzt das ursprüngliche
 * addHook/removeHook-around-sanitize-Pattern, das bei gleichzeitigen
 * sanitize()-Aufrufen race-anfällig war (CodeRabbit/Codex Review #256).
 *
 * Der Hook ist global registriert — das ist OK, weil er einen einzigen,
 * konservativen Effekt hat: Links bekommen `target="_blank"
 * rel="noopener noreferrer"`. Das ist für JEDES sanitize-Profil sinnvoll;
 * im UI-Profil sind <a>-Tags eh nicht erlaubt, der Hook ist dann no-op.
 */
let _hookInstalled = false;
function ensureGlobalHook(): void {
  if (_hookInstalled) return;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if ((node as Element).tagName === "A") {
      const a = node as HTMLAnchorElement;
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
    }
  });
  _hookInstalled = true;
}

function sanitize(input: string, variant: SafeHtmlVariant): string {
  ensureGlobalHook();
  return DOMPurify.sanitize(String(input || ""), PROFILES[variant]) as unknown as string;
}

export function SafeHtml({ html, variant = "ui", as, className }: SafeHtmlProps): ReactElement {
  const safe = sanitize(html ?? "", variant);
  const Tag: WrapperTag = as ?? (variant === "mail" ? "div" : "span");
  if (Tag === "div") {
    return <div className={className} dangerouslySetInnerHTML={{ __html: safe }} />;
  }
  if (Tag === "p") {
    return <p className={className} dangerouslySetInnerHTML={{ __html: safe }} />;
  }
  return <span className={className} dangerouslySetInnerHTML={{ __html: safe }} />;
}

/** Programmatische Variante (z.B. wenn HTML als String weiterverarbeitet wird). */
export function sanitizeHtml(html: string | null | undefined, variant: SafeHtmlVariant = "ui"): string {
  return sanitize(html ?? "", variant);
}
