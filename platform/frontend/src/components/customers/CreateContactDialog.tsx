import { useState, useMemo } from "react";
import type { FormEvent } from "react";
import { Plus, AlertCircle } from "lucide-react";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "../ui/dialog";
import { DuplicateWarningDialog } from "./DuplicateWarningDialog";
import { DbFieldHint } from "../ui/DbFieldHint";
import { CustomerAutocompleteInput } from "../ui/CustomerAutocompleteInput";
import { cn } from "../../lib/utils";
import { formatPhoneCH } from "../../lib/format";
import { findDuplicateCustomers } from "../../lib/duplicateDetection";
import { type Customer } from "../../api/customers";

type CreateContactPayload = {
  name: string;
  email: string;
  company: string;
  phone: string;
  street: string;
  zipcity: string;
  notes: string;
  is_admin: boolean;
  salutation: string;
  first_name: string;
  address_addon_1: string;
  po_box: string;
  zip: string;
  city: string;
  country: string;
  phone_2: string;
  phone_mobile: string;
  phone_fax: string;
  website: string;
};

interface CreateContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateContactPayload, mergeWithId?: number) => Promise<void>;
  onCreateContact: (contact: { name: string; role: string; phone: string; email: string }, customerId?: number | null) => Promise<void>;
  existingCustomers?: Customer[];
}

export function CreateContactDialog({ open, onOpenChange, onSubmit, onCreateContact, existingCustomers = [] }: CreateContactDialogProps) {
  const lang = useAuthStore((s) => s.language);
  const [form, setForm] = useState<CreateContactPayload>({
    name: "",
    email: "",
    company: "",
    phone: "",
    street: "",
    zipcity: "",
    notes: "",
    is_admin: false,
    salutation: "",
    first_name: "",
    address_addon_1: "",
    po_box: "",
    zip: "",
    city: "",
    country: "Schweiz",
    phone_2: "",
    phone_mobile: "",
    phone_fax: "",
    website: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [duplicateError, setDuplicateError] = useState("");

  const potentialDuplicates = useMemo(() => {
    if (!form.email.trim()) return [];
    if (!form.name.trim() && !form.first_name.trim()) return [];
    return findDuplicateCustomers(
      {
        name: [form.first_name, form.name].filter(Boolean).join(" ").trim() || form.name.trim(),
        email: form.email,
        phone: form.phone,
        company: "",
      },
      existingCustomers
    );
  }, [form.first_name, form.name, form.email, form.phone, existingCustomers]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) return;

    if (potentialDuplicates.length > 0) {
      setShowDuplicateWarning(true);
      return;
    }

    setIsSubmitting(true);
    try {
      const fmtPhone = (v: string) => formatPhoneCH(v) || (v || "").trim();
      await onSubmit({
        ...form,
        name: form.name.trim(),
        email: form.email.trim(),
        company: "",
        phone: fmtPhone(form.phone),
        street: "",
        zipcity: "",
        notes: form.notes.trim(),
        address_addon_1: "",
        po_box: "",
        zip: "",
        city: "",
        phone_2: fmtPhone(form.phone_2),
        phone_mobile: fmtPhone(form.phone_mobile),
        phone_fax: fmtPhone(form.phone_fax),
        website: "",
      });
      resetForm();
      onOpenChange(false);
    } catch (error) {
      setDuplicateError(error instanceof Error ? error.message : t(lang, "createCustomer.error.createFailed"));
      console.error("Failed to create customer:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setForm({
      name: "",
      email: "",
      company: "",
      phone: "",
      street: "",
      zipcity: "",
      notes: "",
      is_admin: false,
      salutation: "",
      first_name: "",
      address_addon_1: "",
      po_box: "",
      zip: "",
      city: "",
      country: "Schweiz",
      phone_2: "",
      phone_mobile: "",
      phone_fax: "",
      website: "",
    });
    setDuplicateError("");
  };

  const inputClass = cn(
    "w-full rounded-lg border px-3 py-2 text-sm transition-colors",
    "bg-[var(--surface)]",
    "border-[var(--border-soft)]",
    "text-zinc-900",
    "placeholder:text-zinc-400",
    "hover:border-zinc-400",
    "focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/25 focus:border-[var(--accent)]",
  );

  function applySelectedCustomer(customer: Customer) {
    setForm((prev) => ({
      ...prev,
      email: customer.email || prev.email,
      name: customer.name || prev.name,
      company: customer.company || prev.company,
      phone: customer.phone || prev.phone,
      street: customer.street || prev.street,
      zipcity: customer.zipcity || prev.zipcity,
    }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogClose onClose={() => onOpenChange(false)} />
        <DialogHeader>
          <DialogTitle>{t(lang, "createCustomer.title")}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-4 space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-semibold uppercase tracking-wider text-zinc-300">
                {t(lang, "customer.salutation")}
              </label>
              <select
                value={form.salutation}
                onChange={(e) => setForm((prev) => ({ ...prev, salutation: e.target.value }))}
                className={inputClass}
              >
                <option value="">—</option>
                <option value="Firma">{t(lang, "customer.salutation.company")}</option>
                <option value="Herr">{t(lang, "customer.salutation.mr")}</option>
                <option value="Frau">{t(lang, "customer.salutation.ms")}</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold uppercase tracking-wider text-zinc-300">
                {t(lang, "customer.firstName")}
              </label>
              <input
                type="text"
                value={form.first_name}
                onChange={(e) => setForm((prev) => ({ ...prev, first_name: e.target.value }))}
                className={inputClass}
                placeholder="Max"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold uppercase tracking-wider text-zinc-300">
                {t(lang, "customerModal.label.lastName")}
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                className={inputClass}
                placeholder="Mustermann"
              />
              <DbFieldHint fieldPath="customers.name" />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold uppercase tracking-wider text-zinc-300">
                {t(lang, "customerModal.label.phonePrimary")}
              </label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                className={inputClass}
                placeholder="+41 79 123 45 67"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold uppercase tracking-wider text-zinc-300">
                {t(lang, "customer.phone2")}
              </label>
              <input
                type="text"
                value={form.phone_2}
                onChange={(e) => setForm((prev) => ({ ...prev, phone_2: e.target.value }))}
                className={inputClass}
                placeholder="+41 44 123 45 67"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold uppercase tracking-wider text-zinc-300">
                {t(lang, "customer.phoneMobile")}
              </label>
              <input
                type="text"
                value={form.phone_mobile}
                onChange={(e) => setForm((prev) => ({ ...prev, phone_mobile: e.target.value }))}
                className={inputClass}
                placeholder="+41 79 123 45 67"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold uppercase tracking-wider text-zinc-300">
                {t(lang, "customer.phoneFax")}
              </label>
              <input
                type="text"
                value={form.phone_fax}
                onChange={(e) => setForm((prev) => ({ ...prev, phone_fax: e.target.value }))}
                className={inputClass}
                placeholder="+41 44 123 45 68"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-semibold uppercase tracking-wider text-zinc-300">
                {t(lang, "common.email")} *
              </label>
              <CustomerAutocompleteInput
                required
                value={form.email}
                onChange={(value) => setForm((prev) => ({ ...prev, email: value }))}
                onSelectCustomer={applySelectedCustomer}
                customers={existingCustomers}
                type="email"
                className={inputClass}
                placeholder="max@beispiel.ch"
              />
              <DbFieldHint fieldPath="customers.email" />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold uppercase tracking-wider text-zinc-300">
              {t(lang, "common.notes")}
            </label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              className={inputClass}
              placeholder="Interne Hinweise zum Kunden"
            />
          </div>

          {duplicateError && (
            <div className="flex items-start gap-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 p-3">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-300">{duplicateError}</p>
            </div>
          )}

          <label className="inline-flex items-center gap-2 text-sm font-medium text-zinc-200">
            <input
              type="checkbox"
              checked={form.is_admin}
              onChange={(e) => setForm((prev) => ({ ...prev, is_admin: e.target.checked }))}
              className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-[var(--accent)] focus:ring-[var(--accent)]/30"
            />
            {t(lang, "createCustomer.label.isAdmin")}
          </label>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-semibold transition-colors",
                "bg-[var(--surface-raised)]",
                "text-[var(--text-muted)]",
                "hover:bg-slate-200 hover:bg-[var(--surface-raised)]",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {t(lang, "common.cancel")}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !form.name.trim() || !form.email.trim()}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
                "bg-[var(--accent)] text-white",
                "hover:bg-[var(--accent-hover)] hover:shadow-md",
                "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
              )}
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  <span>{t(lang, "createCustomer.button.creating")}</span>
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  <span>{t(lang, "createCustomer.button.create")}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </DialogContent>

      <DuplicateWarningDialog
        open={showDuplicateWarning}
        duplicates={potentialDuplicates}
        onMerge={async (duplicateId) => {
          setIsSubmitting(true);
          try {
            const fmt = (v: string) => formatPhoneCH(v) || (v || "").trim();
            await onSubmit(
              {
                ...form,
                company: "",
                street: "",
                zipcity: "",
                phone: fmt(form.phone),
                address_addon_1: "",
                po_box: "",
                zip: "",
                city: "",
                phone_2: fmt(form.phone_2),
                phone_mobile: fmt(form.phone_mobile),
                phone_fax: fmt(form.phone_fax),
                website: "",
              },
              duplicateId
            );
            resetForm();
            setShowDuplicateWarning(false);
            onOpenChange(false);
          } catch (error) {
            setDuplicateError(error instanceof Error ? error.message : t(lang, "createCustomer.error.mergeFailed"));
            console.error("Merge failed:", error);
          } finally {
            setIsSubmitting(false);
          }
        }}
        onCreateAnyway={async () => {
          setIsSubmitting(true);
          try {
            const fmt = (v: string) => formatPhoneCH(v) || (v || "").trim();
            await onSubmit({
              ...form,
              company: "",
              street: "",
              zipcity: "",
              phone: fmt(form.phone),
              address_addon_1: "",
              po_box: "",
              zip: "",
              city: "",
              phone_2: fmt(form.phone_2),
              phone_mobile: fmt(form.phone_mobile),
              phone_fax: fmt(form.phone_fax),
              website: "",
            });
            resetForm();
            setShowDuplicateWarning(false);
            onOpenChange(false);
          } catch (error) {
            setDuplicateError(error instanceof Error ? error.message : t(lang, "createCustomer.error.createFailed"));
            console.error("Create failed:", error);
          } finally {
            setIsSubmitting(false);
          }
        }}
        onAddAsContact={async (duplicateId) => {
          setIsSubmitting(true);
          try {
            const fmtPhone = (v: string) => formatPhoneCH(v) || (v || "").trim();
            const displayName = [form.first_name, form.name].filter(Boolean).join(" ").trim() || form.name.trim();
            await onCreateContact({
              name: displayName,
              role: "",
              phone: fmtPhone(form.phone),
              email: form.email.trim(),
            }, duplicateId);
            resetForm();
            setShowDuplicateWarning(false);
            onOpenChange(false);
          } catch (error) {
            setDuplicateError(error instanceof Error ? error.message : t(lang, "createCustomer.error.createFailed"));
            console.error("Add-as-contact failed:", error);
          } finally {
            setIsSubmitting(false);
          }
        }}
        companyName={undefined}
        onCancel={() => {
          setShowDuplicateWarning(false);
          setDuplicateError("");
        }}
      />
    </Dialog>
  );
}


