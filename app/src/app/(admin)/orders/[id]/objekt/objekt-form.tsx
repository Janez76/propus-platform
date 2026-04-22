"use client";

import { useState, useTransition, useCallback } from "react";
import { useFieldArray, useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, MapPin, Plus, Trash2, Users, KeyRound } from "lucide-react";
import { objektFormSchema, type ObjektFormValues } from "@/lib/validators/orders/objekt";
import { saveOrderObjekt } from "./actions";
import { FieldError } from "@/components/forms/FieldError";
import { Section, Empty, InfoItem } from "../_shared";
import { splitAddressLine } from "@/lib/parseOrderAddress";

const TYPE_OPTIONS: { value: ObjektFormValues["objectType"]; label: string }[] = [
  { value: "single_house", label: "Einfamilienhaus" },
  { value: "apartment", label: "Wohnung" },
  { value: "commercial", label: "Gewerbe" },
  { value: "land", label: "Grundstück" },
  { value: "other", label: "Anderes" },
];

type Onsite = { name?: string; phone?: string; email?: string; role?: string };
type KeyPickup = { enabled?: boolean; address?: string; floor?: string; info?: string };

type Props = {
  order: {
    order_no: number;
    address: string | null;
    object_type: string | null;
    object_area: string | null;
    object_floors: string | null;
    object_rooms: string | null;
    object_desc: string | null;
    onsite_contacts: Onsite[] | null;
    key_pickup: KeyPickup | null;
  };
};

function defaults(p: Props["order"]): ObjektFormValues {
  const a = splitAddressLine(p.address);
  return {
    orderNo: p.order_no,
    street: a.street || "",
    zip: a.zip || "",
    city: a.city || "",
    objectType: (p.object_type as ObjektFormValues["objectType"]) || null,
    objectAreaM2: p.object_area ? parseInt(p.object_area, 10) : null,
    objectFloors: p.object_floors != null && p.object_floors !== "" ? parseInt(p.object_floors, 10) : null,
    objectRooms: p.object_rooms != null && p.object_rooms !== "" ? parseInt(p.object_rooms, 10) : null,
    objectDesc: p.object_desc ?? "",
    onsiteContacts:
      p.onsite_contacts && p.onsite_contacts.length
        ? p.onsite_contacts.map((c) => ({
            name: c.name || "",
            email: c.email || "",
            phone: c.phone || "",
            role: (c as { role?: string }).role || "",
          }))
        : [],
  };
}

export function ObjektForm({ order }: Props) {
  const kp = order.key_pickup;
  const [err, setErr] = useState("");
  const [pen, start] = useTransition();
  const form = useForm<ObjektFormValues>({
    resolver: zodResolver(objektFormSchema) as import("react-hook-form").Resolver<ObjektFormValues>,
    defaultValues: defaults(order),
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "onsiteContacts" });

  const onSubmit = useCallback(
    (v: ObjektFormValues) => {
      setErr("");
      start(async () => {
        const r = await saveOrderObjekt(v);
        if (r && "ok" in r && r.ok === false) {
          setErr(r.error);
        }
      });
    },
    [],
  );

  return (
    <FormProvider {...form}>
      <form id="order-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {err && <p className="text-sm text-rose-400">{err}</p>}
        <Section title="Adresse" icon={<MapPin className="h-4 w-4" />}>
          <div className="space-y-4">
            <div>
              <span className="mb-1.5 block text-[11px] text-white/50">Strasse *</span>
              <input className="w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm" {...form.register("street")} />
              <FieldError<ObjektFormValues> name="street" />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <span className="mb-1.5 block text-[11px] text-white/50">PLZ *</span>
                <input className="w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm" {...form.register("zip")} />
                <FieldError<ObjektFormValues> name="zip" />
              </div>
              <div className="md:col-span-2">
                <span className="mb-1.5 block text-[11px] text-white/50">Ort *</span>
                <input className="w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm" {...form.register("city")} />
                <FieldError<ObjektFormValues> name="city" />
              </div>
            </div>
          </div>
        </Section>

        <Section title="Objekt" icon={<Building2 className="h-4 w-4" />}>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="col-span-2">
              <span className="mb-1.5 block text-[11px] text-white/50">Typ</span>
              <select
                className="w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm"
                {...form.register("objectType", { setValueAs: (v: string) => (v === "" ? null : v) })}
              >
                <option value="">—</option>
                {TYPE_OPTIONS.map((t) => (
                  <option key={t.value!} value={t.value!}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className="mb-1.5 block text-[11px] text-white/50">Fläche m²</span>
              <input
                type="number"
                min={1}
                className="w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm"
                {...form.register("objectAreaM2", { valueAsNumber: true, setValueAs: (v) => (v === "" || v === null ? null : v) })}
              />
            </div>
            <div>
              <span className="mb-1.5 block text-[11px] text-white/50">Etagen</span>
              <input
                type="number"
                min={0}
                className="w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm"
                {...form.register("objectFloors", { valueAsNumber: true, setValueAs: (v) => (v === "" || v === null ? null : v) })}
              />
            </div>
            <div>
              <span className="mb-1.5 block text-[11px] text-white/50">Zimmer</span>
              <input
                type="number"
                min={0}
                className="w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm"
                {...form.register("objectRooms", { valueAsNumber: true, setValueAs: (v) => (v === "" || v === null ? null : v) })}
              />
            </div>
            <div className="col-span-full">
              <span className="mb-1.5 block text-[11px] text-white/50">Beschreibung</span>
              <textarea
                rows={2}
                className="w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm"
                {...form.register("objectDesc")}
              />
            </div>
          </div>
        </Section>

        <Section title="Vor-Ort-Kontakte" icon={<Users className="h-4 w-4" />}>
          <div className="space-y-3">
            {fields.map((f, i) => (
              <div
                key={f.id}
                className="grid grid-cols-1 gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4 md:grid-cols-12"
              >
                <div className="md:col-span-3">
                  <input className="w-full rounded border border-white/10 bg-white/[0.03] px-2 py-1.5 text-sm" placeholder="Name" {...form.register(`onsiteContacts.${i}.name`)} />
                  <FieldError<ObjektFormValues> name={`onsiteContacts.${i}.name`} />
                </div>
                <div className="md:col-span-3">
                  <input className="w-full rounded border border-white/10 bg-white/[0.03] px-2 py-1.5 text-sm" placeholder="E-Mail" type="email" {...form.register(`onsiteContacts.${i}.email`)} />
                </div>
                <div className="md:col-span-3">
                  <input className="w-full rounded border border-white/10 bg-white/[0.03] px-2 py-1.5 text-sm" placeholder="Telefon" {...form.register(`onsiteContacts.${i}.phone`)} />
                </div>
                <div className="md:col-span-2">
                  <input className="w-full rounded border border-white/10 bg-white/[0.03] px-2 py-1.5 text-sm" placeholder="Rolle / Notiz" {...form.register(`onsiteContacts.${i}.role`)} />
                </div>
                <div className="flex items-start justify-end md:col-span-1">
                  <button type="button" className="rounded p-1 text-rose-400 hover:bg-white/10" onClick={() => remove(i)} title="Entfernen">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded border border-dashed border-white/20 px-3 py-2 text-sm text-white/70"
              onClick={() => append({ name: "", email: "", phone: "", role: "" })}
            >
              <Plus className="h-4 w-4" />
              Kontakt hinzufügen
            </button>
          </div>
        </Section>

        {kp?.enabled && (
          <Section title="Schlüsselübergabe" icon={<KeyRound className="h-4 w-4" />}>
            <p className="text-xs text-white/50">Nur Anzeige — Bearbeitung folgt bei Bedarf.</p>
            {kp.address && <InfoItem label="Adresse" value={kp.address} />}
            {kp.floor && <InfoItem label="Stockwerk" value={kp.floor} />}
            {kp.info && <InfoItem label="Hinweis" value={kp.info} />}
          </Section>
        )}

        {pen && <p className="text-xs text-white/40">Wird gespeichert…</p>}
      </form>
    </FormProvider>
  );
}
