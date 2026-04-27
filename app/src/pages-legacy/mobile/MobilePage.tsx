import { useState } from "react";
import { MobileHeader } from "./MobileHeader";
import { MobileBottomTabs, type MobileTab } from "./MobileBottomTabs";
import { MobileCalendarTab } from "./MobileCalendarTab";
import { MobileOrdersTab } from "./MobileOrdersTab";
import { MobileContactsTab } from "./MobileContactsTab";

const TAB_TITLES: Record<MobileTab, string> = {
  calendar: "Kalender",
  orders: "Aufträge",
  contacts: "Kontakte",
};

export function MobilePage() {
  const [tab, setTab] = useState<MobileTab>("calendar");

  return (
    <div
      className="flex min-h-dvh flex-col"
      style={{
        background: "var(--surface)",
        color: "var(--text-main)",
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      <MobileHeader title={TAB_TITLES[tab]} />
      <main
        className="flex-1 overflow-y-auto"
        style={{
          paddingBottom: "calc(5rem + env(safe-area-inset-bottom))",
        }}
      >
        <div className="mx-auto w-full max-w-md">
          {tab === "calendar" && <MobileCalendarTab />}
          {tab === "orders" && <MobileOrdersTab />}
          {tab === "contacts" && <MobileContactsTab />}
        </div>
      </main>
      <MobileBottomTabs current={tab} onChange={setTab} />
    </div>
  );
}
