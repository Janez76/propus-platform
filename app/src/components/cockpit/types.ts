import type { LucideIcon } from 'lucide-react';
import type { CockpitTab } from '../../store/cockpitPanelStore';

export interface CockpitTabDefinition {
  id: CockpitTab;
  label: string;
  icon: LucideIcon;
  hotkey: string;
}
