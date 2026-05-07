'use client';

import { useState } from 'react';
import { ExternalLink, Eraser, RotateCcw, MessageCircle, KeyboardIcon, Sparkles } from 'lucide-react';
import { useCockpitPanelStore } from '../../store/cockpitPanelStore';
import './cockpit-panes.css';

const COCKPIT_STORAGE_PREFIX = 'propus.cockpit.';
const PROPI_STORAGE_PREFIX = 'propus.cockpit.propi.';

export function ToolsPane() {
  const reset = useCockpitPanelStore((s) => s.setBadge);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const clearCache = (prefix: string, label: string) => {
    if (typeof window === 'undefined') return;
    let removed = 0;
    try {
      const keys: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(prefix)) keys.push(k);
      }
      for (const k of keys) {
        window.localStorage.removeItem(k);
        removed++;
      }
    } catch {
      /* quota / private */
    }
    showToast(`${label}: ${removed} Eintrag${removed === 1 ? '' : 'e'} gelöscht`);
    void reset;
  };

  return (
    <div className="propus-pane-stack">
      <section className="propus-pane-section">
        <h5 className="propus-pane-section-title">
          <Sparkles size={12} aria-hidden /> Schnellzugriff
        </h5>
        <div className="propus-tools-grid">
          <a
            href="/admin/tours/ai-chat"
            className="propus-tools-action"
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle size={14} aria-hidden />
            <span className="propus-tools-action-label">Propi im Vollbild</span>
            <ExternalLink size={11} aria-hidden className="propus-tools-action-ext" />
          </a>
          <a href="/admin/posteingang" className="propus-tools-action">
            <MessageCircle size={14} aria-hidden />
            <span className="propus-tools-action-label">Posteingang öffnen</span>
          </a>
        </div>
      </section>

      <section className="propus-pane-section">
        <h5 className="propus-pane-section-title">
          <Eraser size={12} aria-hidden /> Cache &amp; Reset
        </h5>
        <div className="propus-tools-grid">
          <button
            type="button"
            className="propus-tools-action"
            onClick={() => clearCache(PROPI_STORAGE_PREFIX, 'Propi-Storage')}
          >
            <RotateCcw size={14} aria-hidden />
            <span className="propus-tools-action-label">Propi-Conversation reset</span>
          </button>
          <button
            type="button"
            className="propus-tools-action"
            onClick={() => clearCache(COCKPIT_STORAGE_PREFIX, 'Cockpit-State')}
          >
            <Eraser size={14} aria-hidden />
            <span className="propus-tools-action-label">Cockpit-State löschen</span>
          </button>
        </div>
      </section>

      <section className="propus-pane-section">
        <h5 className="propus-pane-section-title">
          <KeyboardIcon size={12} aria-hidden /> Hotkeys
        </h5>
        <dl className="propus-tools-keys">
          <dt><kbd>\</kbd></dt><dd>Cockpit auf-/zuklappen</dd>
          <dt><kbd>P</kbd></dt><dd>Propi-Tab</dd>
          <dt><kbd>I</kbd></dt><dd>Insights-Tab</dd>
          <dt><kbd>A</kbd></dt><dd>Activity-Tab</dd>
          <dt><kbd>C</kbd></dt><dd>Capture-Tab</dd>
          <dt><kbd>T</kbd></dt><dd>Tools-Tab</dd>
        </dl>
      </section>

      {toast && (
        <div className="propus-tools-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
