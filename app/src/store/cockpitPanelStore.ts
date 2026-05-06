import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type CockpitPanelState = 'hidden' | 'collapsed' | 'open';
export type CockpitTab = 'propi' | 'insights' | 'activity' | 'capture' | 'tools';

interface CockpitPanelStore {
  state: CockpitPanelState;
  activeTab: CockpitTab;
  badges: Partial<Record<CockpitTab, number>>;
  setState: (s: CockpitPanelState) => void;
  setTab: (t: CockpitTab) => void;
  cycleSize: () => void;
  toggleVisible: () => void;
  setBadge: (tab: CockpitTab, count: number) => void;
}

const STORAGE_KEY = 'propus.cockpit.panel.v1';

export const useCockpitPanelStore = create<CockpitPanelStore>()(
  persist(
    (set) => ({
      state: 'open',
      activeTab: 'propi',
      badges: {},
      setState: (s) => set({ state: s }),
      setTab: (t) =>
        set((prev) => ({
          activeTab: t,
          state: prev.state === 'hidden' || prev.state === 'collapsed' ? 'open' : prev.state,
        })),
      cycleSize: () =>
        set((prev) => ({ state: prev.state === 'open' ? 'collapsed' : 'open' })),
      toggleVisible: () =>
        set((prev) => ({ state: prev.state === 'hidden' ? 'open' : 'hidden' })),
      setBadge: (tab, count) =>
        set((prev) => ({ badges: { ...prev.badges, [tab]: count } })),
    }),
    {
      name: STORAGE_KEY,
      partialize: (s) => ({ state: s.state, activeTab: s.activeTab }),
    },
  ),
);
