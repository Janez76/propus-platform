'use client';

import { PropiAvatar } from '../cockpit/PropiAvatar';
import { useCockpitPanelStore } from '../../store/cockpitPanelStore';
import './mascot-sidebar-card.css';

/**
 * Sidebar-Footer-Card mit Propi-Avatar — direkter Einstiegspunkt zum Cockpit-Chat.
 * Klick öffnet Side-Panel + setzt Tab auf "propi". Bei collapsed Sidebar via CSS hidden.
 * Layout entspricht dem Apple-Look-Mockup (propus-shell.html .sb-propi):
 * Avatar links, Name + Themen rechts, darunter ein Chat-CTA.
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
      <div className="propus-mascot-card-head">
        <div className="propus-mascot-card-avatar">
          <PropiAvatar size={36} followCursor={false} />
          <span className="propus-mascot-card-online" aria-hidden />
        </div>
        <div className="propus-mascot-card-text">
          <h5 className="propus-mascot-card-title">Propi</h5>
          <p className="propus-mascot-card-sub">Aufträge · Mahnungen · Wetter</p>
        </div>
      </div>
      <span className="propus-mascot-card-cta">
        <span>Chat öffnen</span>
      </span>
    </button>
  );
}
