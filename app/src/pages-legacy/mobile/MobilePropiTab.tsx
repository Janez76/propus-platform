import { PropiChat } from "../../components/cockpit/PropiChat";

/**
 * Mobile-Tab für den Propi-Chat. Bug-Fix Polish-Pass 2: in der bisherigen
 * Mobile-Ansicht (Bottom-Tabs Kalender / Aufträge / Kontakte) gab es keinen
 * Einstieg in den Cockpit-Assistenten — die Side-Panel-Variante wird unter
 * 1024px per `display: none` ausgeblendet.
 *
 * Diese Komponente macht den Chat als 4. Bottom-Tab erreichbar und nutzt die
 * volle verfügbare Höhe (full-bleed unter dem MobileHeader, oberhalb der
 * Bottom-Tabs). Layout-Constraint per `dvh` minus Header (52px) minus Tab-Bar
 * (~80px inkl. Safe-Area).
 */
export function MobilePropiTab() {
  return (
    <div
      className="flex w-full flex-col"
      style={{
        /* Propi-Tab läuft full-bleed: kein MobileHeader oben, nur Tab-Bar unten.
         * 5rem ≈ Tab-Bar-Höhe (button min-h-16 = 4rem + Padding). */
        height: "calc(100dvh - 5rem - env(safe-area-inset-bottom) - env(safe-area-inset-top))",
        background: "var(--surface)",
      }}
    >
      <PropiChat
        greeting="Hi 👋 Was kann ich für dich tun? Du bist im Mobile-Modus — kurze Antworten passen hier am besten."
      />
    </div>
  );
}
