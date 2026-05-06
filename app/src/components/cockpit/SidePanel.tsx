'use client';

import { useEffect, type ReactNode } from 'react';
import { Activity, ChevronLeft, MessageCircle, Plus, Settings, Sparkles } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useCockpitPanelStore, type CockpitTab } from '../../store/cockpitPanelStore';
import type { CockpitTabDefinition } from './types';
import './cockpit-panel.css';

const TABS: CockpitTabDefinition[] = [
  { id: 'propi',    label: 'Propi',    icon: MessageCircle, hotkey: 'p' },
  { id: 'insights', label: 'Insights', icon: Sparkles,      hotkey: 'i' },
  { id: 'activity', label: 'Activity', icon: Activity,      hotkey: 'a' },
  { id: 'capture',  label: 'Capture',  icon: Plus,          hotkey: 'c' },
  { id: 'tools',    label: 'Tools',    icon: Settings,      hotkey: 't' },
];

interface SidePanelProps {
  /** Inhalt pro Tab. Fehlende Keys zeigen Stub-Placeholder. */
  panes?: Partial<Record<CockpitTab, ReactNode>>;
  /** Optional: Header-Slot über dem Pane-Body. */
  header?: ReactNode;
}

export function SidePanel({ panes = {}, header }: SidePanelProps) {
  const { state, activeTab, setTab, cycleSize } = useCockpitPanelStore();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.isContentEditable || (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === '\\') {
        e.preventDefault();
        cycleSize();
        return;
      }
      const tab = TABS.find((tab) => tab.hotkey === e.key.toLowerCase());
      if (tab) {
        e.preventDefault();
        setTab(tab.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cycleSize, setTab]);

  if (state === 'hidden') return null;

  const collapsed = state === 'collapsed';
  const targetWidth = collapsed
    ? 'var(--propus-side-panel-rail, 56px)'
    : 'var(--propus-side-panel-w, 400px)';

  return (
    <motion.aside
      role="complementary"
      aria-label="Cockpit"
      className="propus-side-panel"
      initial={false}
      animate={{ width: targetWidth }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      data-state={state}
    >
      <SidePanelTabs activeTab={activeTab} setTab={setTab} collapsed={collapsed} />

      <button
        type="button"
        className="propus-side-collapse"
        onClick={cycleSize}
        title={collapsed ? 'Ausklappen ( \\ )' : 'Einklappen ( \\ )'}
        aria-label={collapsed ? 'Ausklappen' : 'Einklappen'}
      >
        <ChevronLeft aria-hidden />
      </button>

      {!collapsed && (
        <div className="propus-side-pane" role="tabpanel" aria-labelledby={`tab-${activeTab}`}>
          {header ? <div className="propus-side-pane-header">{header}</div> : null}
          <div className="propus-side-pane-body">
            {panes[activeTab] ?? <PaneStub tab={activeTab} />}
          </div>
        </div>
      )}
    </motion.aside>
  );
}

interface SidePanelTabsProps {
  activeTab: CockpitTab;
  setTab: (t: CockpitTab) => void;
  collapsed: boolean;
}

function SidePanelTabs({ activeTab, setTab, collapsed }: SidePanelTabsProps) {
  const badges = useCockpitPanelStore((s) => s.badges);
  return (
    <nav
      className="propus-side-tabs"
      data-collapsed={collapsed}
      role="tablist"
      aria-orientation={collapsed ? 'vertical' : 'horizontal'}
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;
        const badge = badges[tab.id] ?? 0;
        return (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => setTab(tab.id)}
            className="propus-side-tab"
            data-active={active}
            title={`${tab.label} (${tab.hotkey.toUpperCase()})`}
          >
            <Icon size={collapsed ? 18 : 16} aria-hidden />
            {!collapsed && <span className="propus-side-tab-label">{tab.label}</span>}
            {badge > 0 && (
              <span className="propus-side-tab-dot" aria-label={`${badge} neu`}>
                {badge > 9 ? '9+' : badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

function PaneStub({ tab }: { tab: CockpitTab }) {
  const label = TABS.find((t) => t.id === tab)?.label ?? tab;
  return (
    <div className="propus-side-empty">
      <div className="propus-side-empty-title">{label}</div>
      <div className="propus-side-empty-sub">Inhalt folgt — Shell-only Phase.</div>
    </div>
  );
}
