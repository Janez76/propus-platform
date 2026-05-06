'use client';

import { useAuthStore } from '../../store/authStore';
import { MailsCard } from '../dashboard-v2/MailsCard';
import { TicketsCard } from '../dashboard-v2/TicketsCard';
import '../dashboard-v2/dashboard-v2.css';
import './cockpit-panes.css';

export function ActivityPane() {
  const lang = useAuthStore((s) => s.language);

  return (
    <div className="propus-pane-stack">
      <TicketsCard lang={lang} />
      <MailsCard lang={lang} />
    </div>
  );
}
