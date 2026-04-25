import { notFound } from "next/navigation";
import { Building2, MapPin, Users, KeyRound } from "lucide-react";
import { Section, InfoItem, Empty } from "../_shared";
import { ObjektForm } from "./objekt-form";
import { loadOrderContext } from "../_order-context";

type OnsiteContact = { name?: string; phone?: string; email?: string; role?: string; calendarInvite?: boolean };
type KeyPickup = { enabled?: boolean; address?: string; floor?: string; info?: string };

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ edit?: string }>;
};

export default async function ObjektPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = searchParams ? await searchParams : {};
  const isEditing = sp.edit === "1";
  const orderNo = Number(id);
  if (!Number.isInteger(orderNo) || orderNo <= 0) notFound();

  const o = await loadOrderContext(orderNo);
  if (!o) notFound();

  const ro = o.raw_object as Record<string, unknown> | null;
  const objectRoomsRead =
    o.object_rooms ??
    (ro && typeof ro.zimmer === "string" && ro.zimmer.trim() !== "" ? ro.zimmer : null) ??
    (ro && typeof (ro as { Zimmer?: unknown }).Zimmer === "string" ? String((ro as { Zimmer: string }).Zimmer) : null);

  const order = {
    order_no: o.order_no,
    address: o.address,
    object_type: o.object_type,
    object_area: o.object_area,
    object_floors: o.object_floors,
    object_rooms: o.object_rooms,
    object_desc: o.object_desc,
    onsite_contacts: o.onsite_contacts as OnsiteContact[] | null,
    key_pickup: o.key_pickup as KeyPickup | null,
  };

  const contacts: OnsiteContact[] = (order.onsite_contacts ?? []) as OnsiteContact[];
  const kp = order.key_pickup;
  const hasObject = order.object_type || order.object_area || order.object_floors || objectRoomsRead || order.object_desc;

  if (isEditing) {
    return (
      <>
        <ObjektForm order={order} />
      </>
    );
  }

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
            {objectRoomsRead && <InfoItem label="Zimmer" value={objectRoomsRead} />}
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
              <div key={i} className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--border)] bg-[var(--paper-strip)] p-4 md:grid-cols-3">
                {c.name && <InfoItem label="Name" value={c.name} />}
                {c.phone && <InfoItem label="Telefon" value={c.phone} />}
                {c.email && <InfoItem label="E-Mail" value={c.email} />}
                {c.role && <InfoItem label="Rolle" value={c.role} />}
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
