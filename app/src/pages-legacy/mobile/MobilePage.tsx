import { useState } from "react";
import { MobileHeader } from "./MobileHeader";
import { MobileBottomTabs, type MobileTab } from "./MobileBottomTabs";
import { MobileCalendarTab } from "./MobileCalendarTab";
import { MobileOrdersTab } from "./MobileOrdersTab";
import { MobileContactsTab } from "./MobileContactsTab";
import { MobilePropiTab } from "./MobilePropiTab";

const TAB_TITLES: Record<MobileTab, string> = {
  calendar: "Kalender",
  orders: "Aufträge",
  contacts: "Kontakte",
  propi: "Propi",
};

export function MobilePage() {
  const [tab, setTab] = useState<MobileTab>("calendar");
  /** Propi-Tab: kein Header (PropiChat hat eigenen Header) und kein Auto-Scroll-
   *  Container, weil PropiChat sein eigenes Scrolling managt. */
  const isPropi = tab === "propi";

  return (
    <div
      className="flex min-h-dvh flex-col"
      style={{
        background: "var(--surface)",
        color: "var(--text-main)",
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      {!isPropi && <MobileHeader title={TAB_TITLES[tab]} />}
      {/* Mobile-Phase-2: Tabs (Calendar/Orders/Contacts) bringen jetzt eigenen
       *  Scroll-Container via MobilePullToRefresh mit. Kein outer overflow-y-
       *  auto mehr, sonst doppelter Scrollbar/Konflikt mit Pull-Gesture.
       *  Propi-Tab hat eigenes Scrolling im Chat-Body. */}
      <main
        className="flex flex-1 flex-col overflow-hidden"
        style={{
          paddingBottom: isPropi ? 0 : "calc(5rem + env(safe-area-inset-bottom))",
        }}
      >
        {isPropi ? (
          <MobilePropiTab />
        ) : (
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden">
            {tab === "calendar" && <MobileCalendarTab />}
            {tab === "orders" && <MobileOrdersTab />}
            {tab === "contacts" && <MobileContactsTab />}
          </div>
        )}
      </main>
      <MobileBottomTabs current={tab} onChange={setTab} />
    </div>
  );
}
