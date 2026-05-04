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
import { useMemo, type ReactElement } from "react";

export type SafeHtmlVariant = "ui" | "mail" | "mail_styled";

type WrapperTag = "div" | "span" | "p";

interface SafeHtmlProps {
  html: string | null | undefined;
  /**
   * - "ui": sehr restriktiv, nur Inline-Formatierung. Default.
   * - "mail": typische Mail-HTML-Tags (b, i, p, a, ul, li, br, img, table, …),
   *   `target="_blank" rel="noopener noreferrer"` für alle Links erzwungen,
   *   KEIN inline-style-Attribut.
   * - "mail_styled": wie "mail", erlaubt zusaetzlich `style` mit einer harten
   *   CSS-Property-Allowlist (color, text-align, padding, ... — siehe
   *   SAFE_CSS_PROPS). Dangerous CSS-Vektoren (`position: fixed` fuer
   *   clickjacking, `background-image:url(...)` fuer tracking-pixel,
   *   `expression()`, `javascript:`) werden gestrippt. Fuer Admin-getrustetes
   *   Content, das Layout-Treue braucht (RichTextEditor-Alignment,
   *   Mail-Vorschauen — Codex P2 #265).
   */
  variant?: SafeHtmlVariant;
  /**
   * Wrapper-Tag. Wirkt nur fuer variant="ui" (default: `span`).
   * mail/mail_styled erzwingen `div` damit Block-Elemente im sanitisierten
   * HTML keinen invalid <p>-Nesting-Reparent ausloesen.
   */
  as?: WrapperTag;
  className?: string;
}

const MAIL_TAGS = [
  "a", "b", "blockquote", "br", "code", "div", "em", "h1", "h2", "h3",
  "h4", "h5", "h6", "hr", "i", "img", "li", "ol", "p", "pre", "small",
  "span", "strong", "sub", "sup", "table", "tbody", "td", "tfoot", "th",
  "thead", "tr", "u", "ul",
];

// `class` ist NICHT in der Allowlist — sonst koennten utility-Klassen
// (z.B. Tailwind: `class="fixed top-0 inset-0 bg-red-500"`) den
// SAFE_CSS_PROPS-Filter komplett umgehen und Clickjacking ueber Stylesheet
// statt inline-style erzeugen (CodeRabbit Major #265). Wenn editor-
// spezifische Klassen mal benoetigt werden, hier eine schmale Allowlist
// einfuehren statt "class" pauschal zuzulassen.
const MAIL_BASE_ATTRS = [
  "href", "src", "alt", "title", "width", "height",
  "colspan", "rowspan", "align",
];

const MAIL_URI_REGEXP =
  /^(?:https?:|mailto:|tel:|data:image\/(?:png|jpeg|gif|webp);base64,)/i;

const PROFILES: Record<SafeHtmlVariant, DOMPurifyConfig> = {
  ui: {
    ALLOWED_TAGS: ["b", "strong", "i", "em", "u", "br", "span"],
    ALLOWED_ATTR: ["class"],
    ALLOW_DATA_ATTR: false,
  },
  mail: {
    ALLOWED_TAGS: MAIL_TAGS,
    // `style` bewusst NICHT in der Allowlist — siehe mail_styled fuer
    // Layout-treue Render-Pfade.
    ALLOWED_ATTR: MAIL_BASE_ATTRS,
    ALLOWED_URI_REGEXP: MAIL_URI_REGEXP,
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ["target", "rel"],
  },
  mail_styled: {
    ALLOWED_TAGS: MAIL_TAGS,
    ALLOWED_ATTR: [...MAIL_BASE_ATTRS, "style"],
    ALLOWED_URI_REGEXP: MAIL_URI_REGEXP,
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ["target", "rel"],
  },
};

/**
 * CSS-Properties die im `mail_styled`-Profil per inline-style durchgehen
 * duerfen. Bewusst KEINE Layout-/Position-Properties (clickjacking).
 *
 * `background`-Properties stehen in der Allowlist, aber der
 * DANGEROUS_CSS_VALUE-Filter unten strippt `url(...)`-Werte —
 * `background: #f0f0f0` und `background: linear-gradient(...)` bleiben,
 * `background-image: url(http://tracker)` wird raus (Codex P2 #265).
 */
const SAFE_CSS_PROPS = new Set([
  "color",
  "background", "background-color", "background-image",
  "background-position", "background-repeat", "background-size",
  "background-attachment", "background-clip", "background-origin",
  "font-family", "font-size", "font-weight", "font-style", "font-variant",
  "text-align", "text-decoration", "text-transform", "text-indent",
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "border", "border-top", "border-right", "border-bottom", "border-left",
  "border-color", "border-style", "border-width", "border-radius",
  "border-collapse", "border-spacing",
  "width", "height", "max-width", "max-height", "min-width", "min-height",
  "line-height", "letter-spacing", "word-spacing", "white-space",
  "vertical-align",
  "list-style", "list-style-type", "list-style-position",
  "display",
]);

const DANGEROUS_CSS_VALUE = /url\s*\(|expression\s*\(|javascript\s*:/i;

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
    const el = node as Element;
    if (el.tagName === "A") {
      const a = el as HTMLAnchorElement;
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
    }
    // Property-level CSS-Filter: greift NUR wenn DOMPurify das style-
    // Attribut aufgrund der Profil-Konfig nicht schon gestrippt hat
    // (also nur im mail_styled-Profil). Defense-in-depth gegen
    // dangerous Werte (url(), expression(), javascript:).
    if (typeof el.getAttribute !== "function") return;
    const styleAttr = el.getAttribute("style");
    if (!styleAttr) return;
    const safe: string[] = [];
    for (const decl of styleAttr.split(";")) {
      const idx = decl.indexOf(":");
      if (idx < 0) continue;
      const prop = decl.slice(0, idx).trim().toLowerCase();
      const value = decl.slice(idx + 1).trim();
      if (!prop || !value) continue;
      if (!SAFE_CSS_PROPS.has(prop)) continue;
      if (DANGEROUS_CSS_VALUE.test(value)) continue;
      safe.push(`${prop}: ${value}`);
    }
    if (safe.length === 0) {
      el.removeAttribute("style");
    } else {
      el.setAttribute("style", safe.join("; "));
    }
  });
  _hookInstalled = true;
}

function sanitize(input: string, variant: SafeHtmlVariant): string {
  ensureGlobalHook();
  return DOMPurify.sanitize(String(input || ""), PROFILES[variant]) as unknown as string;
}

export function SafeHtml({ html, variant = "ui", as, className }: SafeHtmlProps): ReactElement {
  // useMemo verhindert dass `DOMPurify.sanitize` bei jedem Re-Render des
  // Parent-Trees neu lauft. PosteingangPage re-rendert die ganze Mail-Liste
  // bei jedem Tastendruck im Reply-Composer — ohne Memo wuerde jeder
  // bereits gerenderte Mail-Body bei jedem Keystroke neu sanitisiert
  // (Codex P2: spuerbarer UI-Lag bei langen Threads).
  const safe = useMemo(() => sanitize(html ?? "", variant), [html, variant]);
  // Wrapper-Tag-Auswahl:
  //  - variant="ui": as wird respektiert (default span).
  //  - mail/mail_styled: as="p" wird auf "div" gemappt — ein <p>-Wrapper
  //    macht beim Rendering von Block-Elementen (div/ul/table) im
  //    sanitisierten HTML einen Auto-Close-Reparenting, was
  //    Layout- und Hydration-Glitches ausloest (CodeRabbit Major #265).
  //    span/div bleiben aber moeglich, damit Caller wie LandingPage
  //    den inline-Flow (z. B. category-description neben dem Titel
  //    mit `ml-2`) erhalten koennen (Codex P2 #265).
  let Tag: WrapperTag;
  if (variant === "ui") {
    Tag = as ?? "span";
  } else if (as === "p") {
    Tag = "div";
  } else {
    Tag = as ?? "div";
  }
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
