'use client';

import { useState } from 'react';
import { Building2, MapPin, User2 } from 'lucide-react';

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
  const [bookingType, setBookingType] = useState<'firma' | 'privat'>(order.booking_type);

  return (
    <form id="order-form" action={action} className="space-y-8">
      <input type="hidden" name="order_no" value={order.order_no} />

      <Section title="Ich buche als">
        <div className="grid grid-cols-2 gap-3">
          <RadioCard
            name="booking_type"
            value="firma"
            icon={<Building2 className="h-4 w-4" />}
            label="Firma"
            checked={bookingType === 'firma'}
            disabled={!isEditing}
            onChange={() => setBookingType('firma')}
          />
          <RadioCard
            name="booking_type"
            value="privat"
            icon={<User2 className="h-4 w-4" />}
            label="Privatperson"
            checked={bookingType === 'privat'}
            disabled={!isEditing}
            onChange={() => setBookingType('privat')}
          />
        </div>
      </Section>

      {bookingType === 'firma' && (
        <Section title="Firmenangaben" icon={<Building2 className="h-4 w-4" />}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
        </Section>
      )}

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

      <Section title="Hauptkontakt" icon={<User2 className="h-4 w-4" />}>
        <p className="mb-4 text-xs text-white/50">
          Mindestens eine Person mit E-Mail – diese wird als Schlüssel in der Kundenkartei verwendet.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SelectField
            label="Anrede"
            name="contact_salutation"
            defaultValue={order.contact_salutation ?? 'Herr'}
            disabled={!isEditing}
            options={['Herr', 'Frau', 'Divers']}
          />
          <Field
            label="Vorname"
            name="contact_first_name"
            defaultValue={order.contact_first_name ?? ''}
            disabled={!isEditing}
            hint="Optional, falls im Nachname-Feld der vollständige Name steht (wird beim Speichern getrennt)"
          />
          <Field
            label="Nachname"
            name="contact_last_name"
            defaultValue={order.contact_last_name ?? ''}
            disabled={!isEditing}
            required
          />
          <Field
            label="E-Mail"
            name="contact_email"
            type="email"
            defaultValue={order.contact_email ?? ''}
            disabled={!isEditing}
            required
          />
          <Field
            label="Telefon"
            name="contact_phone"
            type="tel"
            defaultValue={order.contact_phone ?? ''}
            disabled={!isEditing}
          />
        </div>
      </Section>
    </form>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
      <h2 className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({
  label, name, defaultValue = '', type = 'text', disabled, required, autoComplete, maxLength, hint,
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
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/50">
        {label}{required && ' *'}
      </span>
      {hint && <p className="mb-1 text-[10px] text-white/40">{hint}</p>}
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
    </label>
  );
}

function SelectField({
  label, name, defaultValue, disabled, options,
}: {
  label: string;
  name: string;
  defaultValue: string;
  disabled?: boolean;
  options: string[];
}) {
  return (
    <label className="block">
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

function RadioCard({
  name, value, icon, label, checked, disabled, onChange,
}: {
  name: string;
  value: string;
  icon: React.ReactNode;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: () => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center justify-center gap-2 rounded-md border px-4 py-3 text-sm transition-colors ${
        checked ? 'border-[#B68E20] bg-[#B68E20]/10 text-[#B68E20]' : 'border-white/10 bg-white/[0.02] text-white/70 hover:border-white/20'
      } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="sr-only"
      />
      {icon}
      {label}
    </label>
  );
}
