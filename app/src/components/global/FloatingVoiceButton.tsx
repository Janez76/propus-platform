'use client';

/**
 * FloatingVoiceButton — globaler Trigger im Admin-Layout.
 * Öffnet ein Modal/Drawer mit dem ConversationView.
 *
 * Einsatz: in `app/(admin)/layout.tsx` rendern, dann ist der Button überall verfügbar.
 */

import { useState } from 'react';
import { ConversationView } from '@/app/(admin)/assistant/_components/ConversationView';

export function FloatingVoiceButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Assistant öffnen"
        className="fab"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
          <path d="M19 10v2a7 7 0 01-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      </button>

      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <button className="drawer__close" onClick={() => setOpen(false)} aria-label="Schliessen">
              ✕
            </button>
            <ConversationView />
          </div>
        </div>
      )}

      <style jsx>{`
        .fab {
          position: fixed;
          bottom: 1.5rem;
          right: 1.5rem;
          width: 3.5rem;
          height: 3.5rem;
          border-radius: 9999px;
          background: #b68e20;
          color: #0c0d10;
          border: none;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4), 0 0 0 4px rgba(182, 142, 32, 0.15);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .fab:hover {
          transform: scale(1.05);
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5), 0 0 0 6px rgba(182, 142, 32, 0.2);
        }
        .overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(4px);
          z-index: 200;
          display: flex;
          align-items: stretch;
          justify-content: flex-end;
        }
        .drawer {
          position: relative;
          width: 100%;
          max-width: 520px;
          height: 100vh;
          background: #0c0d10;
          box-shadow: -16px 0 40px rgba(0, 0, 0, 0.5);
          animation: slide-in 0.25s ease-out;
        }
        .drawer__close {
          position: absolute;
          top: 1rem;
          right: 1rem;
          width: 2rem;
          height: 2rem;
          background: transparent;
          border: none;
          color: rgba(245, 240, 225, 0.6);
          font-size: 1.25rem;
          cursor: pointer;
          z-index: 10;
        }
        .drawer__close:hover {
          color: #f5f0e1;
        }
        @keyframes slide-in {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  );
}
