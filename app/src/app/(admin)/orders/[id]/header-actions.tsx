'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Pencil, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function OrderReadOnlyBadge() {
  const searchParams = useSearchParams();
  const isEditing = searchParams.get('edit') === '1';
  if (isEditing) return null;
  return (
    <span className="flex items-center gap-1 text-xs text-white/40">
      <Lock className="h-3 w-3" />
      Schreibgeschützt
    </span>
  );
}

type ActionProps = {
  orderNo: number | string;
};

export function OrderEditActions({ orderNo }: ActionProps) {
  const searchParams = useSearchParams();
  const isEditing = searchParams.get('edit') === '1';

  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/orders/${orderNo}`}>Abbrechen</Link>
        </Button>
        <Button
          type="submit"
          form="order-form"
          size="sm"
          className="bg-[#B68E20] text-black hover:bg-[#d4a82c]"
        >
          Speichern
        </Button>
      </div>
    );
  }

  return (
    <Button
      asChild
      size="sm"
      variant="outline"
      className="border-[#B68E20] text-[#B68E20] hover:bg-[#B68E20]/10 hover:text-[#B68E20]"
    >
      <Link href={`/orders/${orderNo}?edit=1`}>
        <Pencil className="h-4 w-4" />
        Bearbeiten
      </Link>
    </Button>
  );
}
