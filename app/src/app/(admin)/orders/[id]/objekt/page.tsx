import { notFound } from 'next/navigation';
import { Building2, MapPin, Users, KeyRound } from 'lucide-react';
import { queryOne } from '@/lib/db';
import { Section, InfoItem, Empty } from '../_shared';

type OnsiteContact = { name?: string; phone?: string; email?: string; calendarInvite?: boolean };
type KeyPickup = { enabled?: boolean; address?: string; floor?: string; info?: string };

export default async function ObjektPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const order = await queryOne<{
    address: string | null;
    object_type: string | null;
    object_area: string | null;
    object_floors: string | null;
    object_rooms: string | null;
    object_desc: string | null;
    onsite_contacts: OnsiteContact[] | null;
    key_pickup: KeyPickup | null;
  }>(`
    SELECT
      address,
      object->>'type'      AS object_type,
      object->>'area'      AS object_area,
      object->>'floors'    AS object_floors,
      object->>'rooms'     AS object_rooms,
      object->>'desc'      AS object_desc,
      onsite_contacts,
      key_pickup
    FROM booking.orders
    WHERE order_no = $1
  `, [id]);

  if (!order) notFound();

  const contacts: OnsiteContact[] = order.onsite_contacts ?? [];
  const kp = order.key_pickup;
  const hasObject = order.object_type || order.object_area || order.object_floors || order.object_rooms || order.object_desc;

  return (
    <div className="space-y-6">
      <Section title="Adresse" icon={<MapPin className="h-4 w-4" />}>
        {order.address
          ? <p className="text-sm">{order.address}</p>
          : <Empty>Keine Adresse hinterlegt</Empty>}
      </Section>

      <Section title="Objekt" icon={<Building2 className="h-4 w-4" />}>
        {hasObject ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {order.object_type && <InfoItem label="Typ" value={order.object_type} />}
            {order.object_area && <InfoItem label="Fläche" value={`${order.object_area} m²`} />}
            {order.object_floors && <InfoItem label="Etagen" value={order.object_floors} />}
            {order.object_rooms && <InfoItem label="Zimmer" value={order.object_rooms} />}
            {order.object_desc && (
              <div className="col-span-full">
                <InfoItem label="Beschreibung" value={order.object_desc} />
              </div>
            )}
          </div>
        ) : (
          <Empty>Keine Objektangaben hinterlegt</Empty>
        )}
      </Section>

      <Section title="Vor-Ort-Kontakte" icon={<Users className="h-4 w-4" />}>
        {contacts.length > 0 ? (
          <div className="space-y-3">
            {contacts.map((c, i) => (
              <div key={i} className="grid grid-cols-1 gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4 md:grid-cols-3">
                {c.name && <InfoItem label="Name" value={c.name} />}
                {c.phone && <InfoItem label="Telefon" value={c.phone} />}
                {c.email && <InfoItem label="E-Mail" value={c.email} />}
              </div>
            ))}
          </div>
        ) : (
          <Empty>Keine Vor-Ort-Kontakte hinterlegt</Empty>
        )}
      </Section>

      {kp?.enabled && (
        <Section title="Schlüsselübergabe" icon={<KeyRound className="h-4 w-4" />}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {kp.address && <InfoItem label="Adresse" value={kp.address} />}
            {kp.floor && <InfoItem label="Stockwerk" value={kp.floor} />}
            {kp.info && <InfoItem label="Hinweis" value={kp.info} />}
          </div>
        </Section>
      )}
    </div>
  );
}
