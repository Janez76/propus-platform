"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Building2, MapPin, User2 } from "lucide-react";
import { useOrderEditShellOptional } from "./order-edit-shell-context";

type Order = {
  id: number | string;
  order_no: number | string;
  booking_type: 'firma' | 'privat';
  company_name: string | null;
  order_reference: string | null;
  billing_street: string | null;
  billing_zip: string | null;
  billing_city: string | null;
  contact_salutation: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
};

type Props = {
  order: Order;
  isEditing: boolean;
  action: (formData: FormData) => Promise<void>;
};

export function UebersichtForm({ order, isEditing, action }: Props) {
  const [bookingType, setBookingType] = useState<"firma" | "privat">(order.booking_type);
  const shell = useOrderEditShellOptional();
  const formRef = useRef<HTMLFormElement>(null);

  const captureSnapshot = useCallback(() => {
    if (!isEditing || !formRef.current || !shell) return;
    shell.setSectionSnapshot("uebersicht", new FormData(formRef.current));
  }, [isEditing, shell]);

  const markTouched = useCallback(() => {
    if (isEditing) {
      shell?.markDirty("uebersicht", true);
      captureSnapshot();
    }
  }, [isEditing, shell, captureSnapshot]);

  useEffect(() => {
    if (isEditing) {
      shell?.markDirty("uebersicht", false);
    }
  }, [isEditing, order.order_no, shell]);

  useEffect(() => {
    if (isEditing) {
      captureSnapshot();
    }
  }, [bookingType, isEditing, captureSnapshot]);

  return (
    <form
      ref={formRef}
      id="order-form"
      action={action}
      className="space-y-6"
      onInput={markTouched}
    >
      <input type="hidden" name="order_no" value={order.order_no} />

      <Section
        title="Rechnungsempfänger"
        icon={bookingType === 'firma' ? <Building2 className="h-4 w-4" /> : <User2 className="h-4 w-4" />}
      >
        <fieldset className="mb-4 inline-flex rounded-md border border-white/10 bg-white/5 p-0.5">
          <legend className="sr-only">Buchungstyp</legend>
          <label className="cursor-pointer">
            <input
              type="radio"
              name="booking_type"
              value="firma"
              checked={bookingType === 'firma'}
              disabled={!isEditing}
              onChange={() => setBookingType('firma')}
              className="peer sr-only"
            />
            <span className="block rounded px-5 py-1.5 text-sm text-white/70 transition-colors peer-checked:bg-[#B68E20]/20 peer-checked:text-[#B68E20] peer-checked:ring-1 peer-checked:ring-[#B68E20]/50 peer-focus-visible:ring-2 peer-focus-visible:ring-white/20 peer-disabled:cursor-not-allowed peer-disabled:opacity-60">
              Firma
            </span>
          </label>
          <label className="cursor-pointer">
            <input
              type="radio"
              name="booking_type"
              value="privat"
              checked={bookingType === 'privat'}
              disabled={!isEditing}
              onChange={() => setBookingType('privat')}
              className="peer sr-only"
            />
            <span className="block rounded px-5 py-1.5 text-sm text-white/70 transition-colors peer-checked:bg-[#B68E20]/20 peer-checked:text-[#B68E20] peer-checked:ring-1 peer-checked:ring-[#B68E20]/50 peer-focus-visible:ring-2 peer-focus-visible:ring-white/20 peer-disabled:cursor-not-allowed peer-disabled:opacity-60">
              Privatperson
            </span>
          </label>
        </fieldset>

        {bookingType === 'firma' && (
          <>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field
                label="Firma"
                name="company_name"
                defaultValue={order.company_name ?? ''}
                disabled={!isEditing}
                required
              />
              <Field
                label="Bestell-Referenz"
                name="order_reference"
                defaultValue={order.order_reference ?? ''}
                disabled={!isEditing}
                maxLength={64}
                hint="Max. 64 Zeichen (interne Referenz)"
              />
            </div>
            <div className="border-t border-white/10 my-4" />
          </>
        )}

        <p className="mb-4 text-xs text-white/70">
          Mindestens eine Person mit E-Mail – diese wird als Schlüssel in der Kundenkartei verwendet.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <SelectField
            label="Anrede"
            name="contact_salutation"
            defaultValue={order.contact_salutation ?? 'Herr'}
            disabled={!isEditing}
            options={['Herr', 'Frau', 'Divers']}
            className="md:col-span-1"
          />
          <Field
            label="Vorname"
            name="contact_first_name"
            defaultValue={order.contact_first_name ?? ''}
            disabled={!isEditing}
            hint="Optional, falls im Nachname-Feld der vollständige Name steht (wird beim Speichern getrennt)"
            className="md:col-span-1"
          />
          <Field
            label="Nachname"
            name="contact_last_name"
            defaultValue={order.contact_last_name ?? ''}
            disabled={!isEditing}
            required
            className="md:col-span-2"
          />
          <Field
            label="E-Mail"
            name="contact_email"
            type="email"
            defaultValue={order.contact_email ?? ''}
            disabled={!isEditing}
            required
            className="md:col-span-2"
          />
          <Field
            label="Telefon"
            name="contact_phone"
            type="tel"
            defaultValue={order.contact_phone ?? ''}
            disabled={!isEditing}
            className="md:col-span-2"
          />
        </div>
      </Section>

      <Section title="Rechnungsadresse" icon={<MapPin className="h-4 w-4" />}>
        <Field
          label="Strasse"
          name="billing_street"
          defaultValue={order.billing_street ?? ''}
          disabled={!isEditing}
          required
        />
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[140px_1fr]">
          <Field
            label="PLZ"
            name="billing_zip"
            defaultValue={order.billing_zip ?? ''}
            disabled={!isEditing}
            required
          />
          <Field
            label="Ort"
            name="billing_city"
            defaultValue={order.billing_city ?? ''}
            disabled={!isEditing}
            required
          />
        </div>
      </Section>
    </form>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-[#B68E20]/80">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({
  label, name, defaultValue = '', type = 'text', disabled, required, autoComplete, maxLength, hint, className,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  disabled?: boolean;
  required?: boolean;
  autoComplete?: string;
  maxLength?: number;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={`block${className ? ` ${className}` : ''}`}>
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/50">
        {label}{required && ' *'}
      </span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        disabled={disabled}
        required={required}
        maxLength={maxLength}
        autoComplete={autoComplete}
        className="w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm outline-none transition-colors focus:border-[#B68E20]/60 focus:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-60"
      />
      {hint && <p className="mt-1 text-xs text-white/40 leading-tight">{hint}</p>}
    </label>
  );
}

function SelectField({
  label, name, defaultValue, disabled, options, className,
}: {
  label: string;
  name: string;
  defaultValue: string;
  disabled?: boolean;
  options: string[];
  className?: string;
}) {
  return (
    <label className={`block${className ? ` ${className}` : ''}`}>
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/50">
        {label}
      </span>
      <select
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
        className="w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm outline-none transition-colors focus:border-[#B68E20]/60 focus:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {options.map((o) => (
          <option key={o} value={o} className="bg-[#0c0d10]">{o}</option>
        ))}
      </select>
    </label>
  );
}

