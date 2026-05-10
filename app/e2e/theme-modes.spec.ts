import { test, expect, type Page } from "@playwright/test";

/**
 * Theme-Mode Smoke
 *
 * Faengt die haeufigste Klasse von Light/Dark-Bugs ab: eine Komponente rendert
 * dunkel auf hellem Hintergrund (oder umgekehrt), weil ein hartkodierter Farbton
 * statt eines Theme-Tokens benutzt wurde.
 *
 * Strategie:
 *   - Oeffnet eine kurze Liste oeffentlich erreichbarer Routen.
 *   - Setzt explizit `html.classList = ['']` (Light) bzw. `['dark']` (Dark).
 *   - Liest die computed background-color der wichtigsten Layout-Container.
 *   - Erwartet: in Light NICHT (annaehernd) schwarz; in Dark NICHT (annaehernd) weiss.
 *
 * Erweiterbar: zusaetzliche Selektoren / Routen unten anhaengen. Fuer Admin-/
 * Portal-Routen mit Login-Pflicht: separates Auth-Setup ergaenzen, sobald wir
 * E2E-Fixtures fuer Sessions haben.
 */

const ROUTES = [
  { path: "/", name: "home" },
  { path: "/login", name: "login" },
];

const CONTAINER_SELECTORS = ["main", "body", "[role=\"main\"]"];

function rgbDistance(rgb: string, target: [number, number, number]): number {
  const m = rgb.match(/\d+/g);
  if (!m || m.length < 3) return Infinity;
  const [r, g, b] = m.slice(0, 3).map(Number);
  return Math.sqrt(
    (r - target[0]) ** 2 + (g - target[1]) ** 2 + (b - target[2]) ** 2,
  );
}

async function readContainerBg(page: Page): Promise<{ selector: string; rgb: string } | null> {
  for (const sel of CONTAINER_SELECTORS) {
    const el = page.locator(sel).first();
    if (await el.count()) {
      const rgb = await el.evaluate((node) =>
        getComputedStyle(node as Element).backgroundColor,
      );
      if (rgb && !rgb.includes("rgba(0, 0, 0, 0)")) return { selector: sel, rgb };
    }
  }
  return null;
}

async function setMode(page: Page, mode: "light" | "dark") {
  await page.evaluate((m) => {
    const html = document.documentElement;
    html.classList.remove("dark");
    if (m === "dark") html.classList.add("dark");
  }, mode);
  // Eine Frame durchlassen, damit Tailwind v4 die Variant umschalten kann.
  await page.waitForTimeout(50);
}

for (const route of ROUTES) {
  test.describe(`theme modes — ${route.name}`, () => {
    test(`light mode background is not near-black`, async ({ page }) => {
      await page.goto(route.path);
      await setMode(page, "light");
      const bg = await readContainerBg(page);
      expect(bg, `kein Container mit Hintergrund auf ${route.path}`).not.toBeNull();
      const dist = rgbDistance(bg!.rgb, [0, 0, 0]);
      expect(dist, `Light-Mode rendert dunkel (${bg!.selector} = ${bg!.rgb})`).toBeGreaterThan(80);
    });

    test(`dark mode background is not near-white`, async ({ page }) => {
      await page.goto(route.path);
      await setMode(page, "dark");
      const bg = await readContainerBg(page);
      expect(bg, `kein Container mit Hintergrund auf ${route.path}`).not.toBeNull();
      const dist = rgbDistance(bg!.rgb, [255, 255, 255]);
      expect(dist, `Dark-Mode rendert hell (${bg!.selector} = ${bg!.rgb})`).toBeGreaterThan(80);
    });
  });
}
