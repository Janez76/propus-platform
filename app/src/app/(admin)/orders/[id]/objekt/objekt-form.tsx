"use client";

import { useState, useCallback, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useOrderEditShellOptional } from "../order-edit-shell-context";
import { useFieldArray, useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, MapPin, Plus, Trash2, Users, KeyRound } from "lucide-react";
import { objektFormSchema, type ObjektFormValues } from "@/lib/validators/orders/objekt";
import { saveOrderObjekt } from "./actions";
import { FieldError } from "@/components/forms/FieldError";
import { Section, InfoItem } from "../_shared";
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
  const [saving, setSaving] = useState(false);
  const pathname = usePathname() || `/orders/${order.order_no}/objekt`;
  const form = useForm<ObjektFormValues>({
    resolver: zodResolver(objektFormSchema) as import("react-hook-form").Resolver<ObjektFormValues>,
    defaultValues: defaults(order),
  });
  const shell = useOrderEditShellOptional();
  const isDirty = form.formState.isDirty;
  useEffect(() => {
    shell?.markDirty("objekt", isDirty);
  }, [isDirty, shell]);
  useEffect(() => {
    if (!isDirty) return;
    shell?.setSectionSnapshot("objekt", form.getValues());
    const subscription = form.watch(() => {
      shell?.setSectionSnapshot("objekt", form.getValues());
    });
    return () => subscription.unsubscribe();
  }, [form, isDirty, shell]);
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "onsiteContacts" });

  const onSubmit = useCallback(
    (v: ObjektFormValues) => {
      shell?.setSectionSnapshot("objekt", v);
      setErr("");
      setSaving(true);
      void (async () => {
        try {
          const r = await saveOrderObjekt(v, { skipRedirect: true });
          if (r && "ok" in r && r.ok === false) {
            setErr(r.error);
            return;
          }
          shell?.clearDirty("objekt");
          const p = new URLSearchParams(window.location.search);
          p.set("saved", "1");
          p.delete("edit");
          p.delete("error");
          const q = p.toString();
          shell?.allowNextPageUnload();
          window.location.assign(q ? `${pathname.split("?")[0]}?${q}` : pathname.split("?")[0]);
        } catch (e) {
          setErr(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
        } finally {
          setSaving(false);
        }
      })();
    },
    [pathname, shell],
  );

  return (
    <FormProvider {...form}>
      <form id="order-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {err && <p className="text-sm text-[var(--danger)]">{err}</p>}
        <Section title="Adresse" icon={<MapPin className="h-4 w-4" />}>
          <div className="space-y-4">
            <div>
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Strasse *</span>
              <input className="w-full rounded-md border border-[var(--border)] bg-[var(--paper-strip)] px-3 py-2 text-sm focus:bg-white focus:border-[var(--gold-500)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]/20" {...form.register("street")} />
              <FieldError<ObjektFormValues> name="street" />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">PLZ *</span>
                <input className="w-full rounded-md border border-[var(--border)] bg-[var(--paper-strip)] px-3 py-2 text-sm focus:bg-white focus:border-[var(--gold-500)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]/20" {...form.register("zip")} />
                <FieldError<ObjektFormValues> name="zip" />
              </div>
              <div className="md:col-span-2">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Ort *</span>
                <input className="w-full rounded-md border border-[var(--border)] bg-[var(--paper-strip)] px-3 py-2 text-sm focus:bg-white focus:border-[var(--gold-500)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]/20" {...form.register("city")} />
                <FieldError<ObjektFormValues> name="city" />
              </div>
            </div>
          </div>
        </Section>

        <Section title="Objekt" icon={<Building2 className="h-4 w-4" />}>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="col-span-2">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Typ</span>
              <select
                className="w-full rounded-md border border-[var(--border)] bg-[var(--paper-strip)] px-3 py-2 text-sm focus:bg-white focus:border-[var(--gold-500)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]/20"
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
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Fläche m²</span>
              <input
                type="number"
                min={1}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--paper-strip)] px-3 py-2 text-sm focus:bg-white focus:border-[var(--gold-500)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]/20"
                {...form.register("objectAreaM2", { valueAsNumber: true, setValueAs: (v) => (v === "" || v === null ? null : v) })}
              />
            </div>
            <div>
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Etagen</span>
              <input
                type="number"
                min={0}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--paper-strip)] px-3 py-2 text-sm focus:bg-white focus:border-[var(--gold-500)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]/20"
                {...form.register("objectFloors", { valueAsNumber: true, setValueAs: (v) => (v === "" || v === null ? null : v) })}
              />
            </div>
            <div>
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Zimmer</span>
              <input
                type="number"
                min={0}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--paper-strip)] px-3 py-2 text-sm focus:bg-white focus:border-[var(--gold-500)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]/20"
                {...form.register("objectRooms", { valueAsNumber: true, setValueAs: (v) => (v === "" || v === null ? null : v) })}
              />
            </div>
            <div className="col-span-full">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Beschreibung</span>
              <textarea
                rows={2}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--paper-strip)] px-3 py-2 text-sm focus:bg-white focus:border-[var(--gold-500)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]/20"
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
                  <input className="w-full rounded border border-[var(--border)] bg-[var(--paper-strip)] px-2 py-1.5 text-sm focus:bg-white focus:border-[var(--gold-500)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]/20" placeholder="Name" {...form.register(`onsiteContacts.${i}.name`)} />
                  <FieldError<ObjektFormValues> name={`onsiteContacts.${i}.name`} />
                </div>
                <div className="md:col-span-3">
                  <input className="w-full rounded border border-[var(--border)] bg-[var(--paper-strip)] px-2 py-1.5 text-sm focus:bg-white focus:border-[var(--gold-500)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]/20" placeholder="E-Mail" type="email" {...form.register(`onsiteContacts.${i}.email`)} />
                </div>
                <div className="md:col-span-3">
                  <input className="w-full rounded border border-[var(--border)] bg-[var(--paper-strip)] px-2 py-1.5 text-sm focus:bg-white focus:border-[var(--gold-500)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]/20" placeholder="Telefon" {...form.register(`onsiteContacts.${i}.phone`)} />
                </div>
                <div className="md:col-span-2">
                  <input className="w-full rounded border border-[var(--border)] bg-[var(--paper-strip)] px-2 py-1.5 text-sm focus:bg-white focus:border-[var(--gold-500)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]/20" placeholder="Rolle / Notiz" {...form.register(`onsiteContacts.${i}.role`)} />
                </div>
                <div className="flex items-start justify-end md:col-span-1">
                  <button type="button" className="rounded p-1 text-[var(--danger)] hover:bg-[var(--danger-bg)]" onClick={() => remove(i)} title="Entfernen">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded border border-dashed border-[var(--gold-300)] bg-[var(--gold-50)] px-3 py-2 text-sm text-[var(--gold-800)] hover:border-[var(--gold-600)]"
              onClick={() => append({ name: "", email: "", phone: "", role: "" })}
            >
              <Plus className="h-4 w-4" />
              Kontakt hinzufügen
            </button>
          </div>
        </Section>

        {kp?.enabled && (
          <Section title="Schlüsselübergabe" icon={<KeyRound className="h-4 w-4" />}>
            <p className="text-xs text-[var(--ink-3)]">Nur Anzeige — Bearbeitung folgt bei Bedarf.</p>
            {kp.address && <InfoItem label="Adresse" value={kp.address} />}
            {kp.floor && <InfoItem label="Stockwerk" value={kp.floor} />}
            {kp.info && <InfoItem label="Hinweis" value={kp.info} />}
          </Section>
        )}

        {saving && <p className="text-xs text-[var(--ink-3)]">Wird gespeichert…</p>}
      </form>
    </FormProvider>
  );
}
