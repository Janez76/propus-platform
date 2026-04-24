'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  User, Building2, ListChecks, CalendarClock,
  MessageSquare, Files, Link2, History,
} from 'lucide-react';

type Tab = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

function getTabs(orderId: string): Tab[] {
  return [
    { href: `/orders/${orderId}`,               label: 'Übersicht',        icon: User },
    { href: `/orders/${orderId}/objekt`,         label: 'Objekt & Vor-Ort', icon: Building2 },
    { href: `/orders/${orderId}/leistungen`,     label: 'Leistungen',       icon: ListChecks },
    { href: `/orders/${orderId}/termin`,         label: 'Termin & Status',  icon: CalendarClock },
    { href: `/orders/${orderId}/kommunikation`,  label: 'Kommunikation',    icon: MessageSquare },
    { href: `/orders/${orderId}/dateien`,        label: 'Dateien',          icon: Files },
    { href: `/orders/${orderId}/verknuepfungen`,  label: 'Verknüpfungen',   icon: Link2 },
    { href: `/orders/${orderId}/verlauf`,        label: 'Verlauf',          icon: History },
  ];
}

export function OrderTabs({ orderId }: { orderId: string }) {
  const pathname = usePathname();
  const tabs = getTabs(orderId);

  return (
    <nav className="flex gap-1 overflow-x-auto -mb-px">
      {tabs.map((tab) => {
        const isActive =
          tab.href === `/orders/${orderId}`
            ? pathname === tab.href
            : pathname === tab.href || pathname.startsWith(tab.href + '/');

        const Icon = tab.icon;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`
              flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors
              ${isActive
                ? 'border-[#B68E20] text-[#B68E20]'
                : 'border-transparent text-white/60 hover:border-white/20 hover:text-white'}
            `}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
