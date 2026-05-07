import { notFound } from "next/navigation";
import { Building2, Camera, FileText, KeyRound, MapPin, Users } from "lucide-react";
import { Section, InfoItem, Empty } from "../_shared";
import { ObjektForm } from "./objekt-form";
import { loadOrderContext } from "../_order-context";
import { splitAddressLine } from "@/lib/parseOrderAddress";

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

  // Mobile-Orders-Redesign Phase 4: Objektadresse vs. Rechnungsadresse klar
  // trennen. Wir vergleichen normalisiert (Strasse/PLZ/Stadt) — bewusst
  // tolerant gegen Whitespace und Case-Unterschiede.
  const objAddrParts = splitAddressLine(o.address);
  const billingStreet = (o.billing_street ?? "").trim();
  const billingZip = (o.billing_zip ?? "").trim();
  const billingCity = (o.billing_city ?? "").trim();
  const hasBillingAddr = billingStreet.length > 0 || billingZip.length > 0 || billingCity.length > 0;

  function normaliseFragment(s: string | null | undefined): string {
    return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  }
  const billingMatchesObjekt =
    hasBillingAddr &&
    normaliseFragment(billingStreet) === normaliseFragment(objAddrParts.street) &&
    normaliseFragment(billingZip) === normaliseFragment(objAddrParts.zip) &&
    normaliseFragment(billingCity) === normaliseFragment(objAddrParts.city);

  const billingFullAddress = hasBillingAddr
    ? [billingStreet, [billingZip, billingCity].filter(Boolean).join(" ")].filter(Boolean).join(", ")
    : null;

  return (
    <div className="space-y-6">
      <Section title="Objektadresse" icon={<Camera className="h-4 w-4" />}>
        {order.address ? (
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[var(--accent-soft,rgba(158,134,73,0.12))] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
                <Camera className="h-3 w-3" aria-hidden /> Foto-Standort
              </span>
              <p className="text-sm">{order.address}</p>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Hier wird fotografiert.{" "}
              {hasBillingAddr ? (
                billingMatchesObjekt ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-[#16a34a]">
                    <span aria-hidden>=</span> Rechnungsadresse identisch
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-semibold text-[#b8860b]">
                    <span aria-hidden>≠</span> Rechnung weicht ab — siehe unten
                  </span>
                )
              ) : (
                <span className="text-[var(--text-muted)]">Keine separate Rechnungsadresse hinterlegt.</span>
              )}
            </p>
          </div>
        ) : (
          <Empty>Keine Adresse hinterlegt</Empty>
        )}
      </Section>

      {hasBillingAddr && !billingMatchesObjekt && (
        <Section title="Rechnungsadresse" icon={<FileText className="h-4 w-4" />}>
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[var(--paper-strip)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                <FileText className="h-3 w-3" aria-hidden /> Rechnung geht an
              </span>
              <p className="text-sm">{billingFullAddress}</p>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Bewusst abweichend vom Foto-Standort (z.B. Maklerbüro, Treuhand, Postfach).
            </p>
          </div>
        </Section>
      )}

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
