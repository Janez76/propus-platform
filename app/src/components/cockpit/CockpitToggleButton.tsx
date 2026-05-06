'use client';

import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useCockpitPanelStore } from '../../store/cockpitPanelStore';

interface Props {
  className?: string;
}

export function CockpitToggleButton({ className }: Props) {
  const { state, toggleVisible } = useCockpitPanelStore();
  const visible = state !== 'hidden';
  const Icon = visible ? PanelRightClose : PanelRightOpen;

  return (
    <button
      type="button"
      onClick={toggleVisible}
      className={['propus-cockpit-toggle', className].filter(Boolean).join(' ')}
      aria-pressed={visible}
      title={visible ? 'Cockpit ausblenden' : 'Cockpit einblenden'}
    >
      <Icon size={16} aria-hidden />
    </button>
  );
}
