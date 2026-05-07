'use client';

import { PropiAvatar } from '../cockpit/PropiAvatar';
import { useCockpitPanelStore } from '../../store/cockpitPanelStore';
import './mascot-sidebar-card.css';

/**
 * Sidebar-Footer-Card mit Propi-Avatar — direkter Einstiegspunkt zum Cockpit-Chat.
 * Klick öffnet Side-Panel + setzt Tab auf "propi". Bei collapsed Sidebar via CSS hidden.
 */
export function MascotSidebarCard() {
  const setTab = useCockpitPanelStore((s) => s.setTab);

  return (
    <button
      type="button"
      className="propus-mascot-card"
      onClick={() => setTab('propi')}
      title="Propi öffnen (P)"
      aria-label="Propi öffnen"
    >
      <div className="propus-mascot-card-avatar">
        <PropiAvatar size={56} followCursor={false} />
      </div>
      <h5 className="propus-mascot-card-title">
        <span className="propus-mascot-card-online" aria-hidden />
        Propi
      </h5>
      <p className="propus-mascot-card-sub">Frag mich was — Aufträge, Mahnungen, Wetter.</p>
      <span className="propus-mascot-card-cta">
        <span>Chat öffnen</span>
        <kbd>P</kbd>
      </span>
    </button>
  );
}
