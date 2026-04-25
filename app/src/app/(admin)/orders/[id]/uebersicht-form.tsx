"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Building2, MapPin, User2, Info } from "lucide-react";
import { useOrderEditShellOptional } from "./order-edit-shell-context";
import { Section } from "./_shared";

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
      className="space-y-5"
      onInput={markTouched}
    >
      <input type="hidden" name="order_no" value={order.order_no} />

      <Section
        title="Rechnungsempfänger"
        icon={bookingType === 'firma' ? <Building2 /> : <User2 />}
      >
        <div className="bd-seg" role="radiogroup" aria-label="Buchungstyp">
          <SegOption
            name="booking_type"
            value="firma"
            label="Firma"
            icon={<Building2 />}
            checked={bookingType === 'firma'}
            disabled={!isEditing}
            onSelect={() => setBookingType('firma')}
          />
          <SegOption
            name="booking_type"
            value="privat"
            label="Privatperson"
            icon={<User2 />}
            checked={bookingType === 'privat'}
            disabled={!isEditing}
            onSelect={() => setBookingType('privat')}
          />
        </div>

        {bookingType === 'firma' && (
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
        )}

        <div className="bd-hint-strip">
          <Info />
          <span>Mindestens eine Person mit E-Mail – diese wird als Schlüssel in der Kundenkartei verwendet.</span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[140px_1fr_1fr]">
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
            hint="Optional, falls im Nachname-Feld der vollständige Name steht"
          />
          <Field
            label="Nachname"
            name="contact_last_name"
            defaultValue={order.contact_last_name ?? ''}
            disabled={!isEditing}
            required
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field
            label="E-Mail"
            name="contact_email"
            type="email"
            defaultValue={order.contact_email ?? ''}
            disabled={!isEditing}
            required
            link
          />
          <Field
            label="Telefon"
            name="contact_phone"
            type="tel"
            defaultValue={order.contact_phone ?? ''}
            disabled={!isEditing}
            mono
          />
        </div>
      </Section>

      <Section title="Rechnungsadresse" icon={<MapPin />}>
        <Field
          label="Strasse"
          name="billing_street"
          defaultValue={order.billing_street ?? ''}
          disabled={!isEditing}
          required
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[140px_1fr]">
          <Field
            label="PLZ"
            name="billing_zip"
            defaultValue={order.billing_zip ?? ''}
            disabled={!isEditing}
            required
            mono
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

function SegOption({
  name, value, label, icon, checked, disabled, onSelect,
}: {
  name: string;
  value: string;
  label: string;
  icon: React.ReactNode;
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <label className={`bd-seg-opt${checked ? ' is-active' : ''}`}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        className="sr-only"
      />
      {icon}
      <span>{label}</span>
    </label>
  );
}

function Field({
  label, name, defaultValue = '', type = 'text', disabled, required, autoComplete, maxLength, hint, mono, link,
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
  mono?: boolean;
  link?: boolean;
}) {
  const inputId = `bd-field-${name}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  return (
    <div className="bd-field">
      <label htmlFor={inputId}>
        {label}{required && <span className="req"> *</span>}
      </label>
      {disabled ? (
        <div
          id={inputId}
          className={`bd-field-input${mono ? ' is-mono' : ''}${link ? ' is-link' : ''}`}
        >
          {defaultValue || <span className="bd-ph">—</span>}
          {/* Defensiver Hidden-Input: stellt sicher, dass der Wert auch dann
              im FormData landet, wenn ein anderer Trigger das Form submitted. */}
          <input type="hidden" name={name} value={defaultValue} />
        </div>
      ) : (
        <input
          id={inputId}
          name={name}
          type={type}
          defaultValue={defaultValue}
          required={required}
          maxLength={maxLength}
          autoComplete={autoComplete}
          aria-describedby={hintId}
          className={mono ? 'bd-mono' : ''}
        />
      )}
      {hint && <div id={hintId} className="bd-field-hint">{hint}</div>}
    </div>
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
  const inputId = `bd-field-${name}`;
  return (
    <div className="bd-field">
      <label htmlFor={inputId}>{label}</label>
      {disabled ? (
        <div id={inputId} className="bd-field-input">
          {defaultValue}
          <input type="hidden" name={name} value={defaultValue} />
        </div>
      ) : (
        <select id={inputId} name={name} defaultValue={defaultValue}>
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      )}
    </div>
  );
}
