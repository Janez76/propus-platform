import { useEffect, useMemo, useState } from "react";
import { Edit2, Plus, Save, Trash2, X } from "lucide-react";
import {
  getContacts,
  createCustomerContact,
  deleteCustomerContact,
  getCustomerContacts,
  updateContact,
  updateCustomerContact,
  PORTAL_ROLE_OPTIONS,
  type Contact,
  type CustomerContact,
  type CustomerContactPayload,
  type PortalRole,
} from "../../api/customers";
import { formatPhoneCH, formatSwissDateTime } from "../../lib/format";
import { PhoneLink } from "../ui/PhoneLink";
import { toDisplayString } from "../../lib/utils";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";

type Props = {
  token: string;
  customerId: number;
  readonly?: boolean;
};

type ContactFormState = {
  salutation: string;
  first_name: string;
  last_name: string;
  role: string;
  portal_role: PortalRole;
  phone_direct: string;
  phone_mobile: string;
  email: string;
  department: string;
  exxas_contact_id: string;
};

const EMPTY_FORM: ContactFormState = {
  salutation: "",
  first_name: "",
  last_name: "",
  role: "",
  portal_role: "company_employee",
  phone_direct: "",
  phone_mobile: "",
  email: "",
  department: "",
  exxas_contact_id: "",
};

function toPayload(form: ContactFormState): CustomerContactPayload {
  const name = [form.first_name, form.last_name].filter(Boolean).join(" ").trim() || form.last_name.trim();
  const phoneDirect = formatPhoneCH(form.phone_direct) || form.phone_direct.trim();
  const phoneMobile = formatPhoneCH(form.phone_mobile) || form.phone_mobile.trim();
  return {
    name,
    salutation: form.salutation.trim(),
    first_name: form.first_name.trim(),
    last_name: form.last_name.trim(),
    role: form.role.trim(),
    portal_role: form.portal_role,
    phone_direct: phoneDirect,
    phone_mobile: phoneMobile,
    phone: phoneDirect,
    email: form.email.trim(),
    department: form.department.trim(),
  };
}

function toForm(contact: CustomerContact): ContactFormState {
  const hasExxas = contact.first_name != null || contact.last_name != null;
  let first = contact.first_name || "";
  let last = contact.last_name || "";
  if (!hasExxas && contact.name) {
    const parts = contact.name.trim().split(/\s+/);
    if (parts.length >= 2) {
      first = parts[0] || "";
      last = parts.slice(1).join(" ") || "";
    } else {
      last = contact.name;
    }
  }
  return {
    salutation: contact.salutation || "",
    first_name: first,
    last_name: last,
    role: contact.role || "",
    portal_role: (contact.portal_role as PortalRole) || "company_employee",
    phone_direct: contact.phone_direct || contact.phone || "",
    phone_mobile: contact.phone_mobile || "",
    email: contact.email || "",
    department: contact.department || "",
    exxas_contact_id: contact.exxas_contact_id || "",
  };
}

export function CustomerContactsSection({ token, customerId, readonly = false }: Props) {
  const lang = useAuthStore((s) => s.language);
  const [contacts, setContacts] = useState<CustomerContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showLinkExisting, setShowLinkExisting] = useState(false);
  const [createForm, setCreateForm] = useState<ContactFormState>(EMPTY_FORM);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [selectedExistingId, setSelectedExistingId] = useState<string>("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<ContactFormState>(EMPTY_FORM);
  const [busy, setBusy] = useState<"create" | "update" | "delete" | null>(null);

  async function loadContacts() {
    setLoading(true);
    setError("");
    try {
      const rows = await getCustomerContacts(token, customerId);
      setContacts(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, "contacts.error.loadFailed"));
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadAllContacts() {
    try {
      const rows = await getContacts(token);
      setAllContacts(Array.isArray(rows) ? rows : []);
    } catch {
      setAllContacts([]);
    }
  }

  useEffect(() => {
    loadContacts();
  }, [token, customerId]);

  useEffect(() => {
    if (readonly || !showLinkExisting) return;
    void loadAllContacts();
  }, [readonly, showLinkExisting, token]);

  const sortedContacts = useMemo(
    () => [...contacts].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id),
    [contacts]
  );

  async function handleCreate() {
    if (!createForm.last_name.trim() && !createForm.first_name.trim()) {
      setError(t(lang, "contacts.error.nameRequired"));
      return;
    }
    const newEmail = createForm.email.trim().toLowerCase();
    const newName = [createForm.first_name, createForm.last_name].filter(Boolean).join(" ").trim().toLowerCase();
    if (newEmail) {
      const emailDup = contacts.find((c) => c.email?.trim().toLowerCase() === newEmail);
      if (emailDup) {
        setError(
          t(lang, "contacts.error.duplicateEmail").replace("{{name}}", emailDup.first_name || emailDup.last_name
            ? [emailDup.first_name, emailDup.last_name].filter(Boolean).join(" ")
            : emailDup.name || `#${emailDup.id}`)
        );
        return;
      }
    }
    if (newName) {
      const nameDup = contacts.find((c) => {
        const existing = [c.first_name, c.last_name].filter(Boolean).join(" ").trim().toLowerCase() || c.name?.trim().toLowerCase() || "";
        return existing === newName;
      });
      if (nameDup) {
        setError(
          t(lang, "contacts.error.duplicateName").replace("{{name}}", nameDup.role || nameDup.email || `#${nameDup.id}`)
        );
        return;
      }
    }
    setBusy("create");
    setError("");
    try {
      await createCustomerContact(token, customerId, toPayload(createForm));
      setCreateForm(EMPTY_FORM);
      setShowCreate(false);
      await loadContacts();
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, "contacts.error.createFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(contactId: number) {
    setBusy("delete");
    setError("");
    try {
      await deleteCustomerContact(token, customerId, contactId);
      if (editId === contactId) {
        setEditId(null);
        setEditForm(EMPTY_FORM);
      }
      await loadContacts();
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, "contacts.error.deleteFailed"));
    } finally {
      setBusy(null);
    }
  }

  function startEdit(contact: CustomerContact) {
    setEditId(contact.id);
    setEditForm(toForm(contact));
    setError("");
  }

  async function handleSaveEdit(contactId: number) {
    if (!editForm.last_name.trim() && !editForm.first_name.trim()) {
      setError(t(lang, "contacts.error.nameRequired"));
      return;
    }
    setBusy("update");
    setError("");
    try {
      await updateCustomerContact(token, customerId, contactId, toPayload(editForm));
      setEditId(null);
      setEditForm(EMPTY_FORM);
      await loadContacts();
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, "contacts.error.updateFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function handleLinkExisting() {
    if (!selectedExistingId) {
      setError(t(lang, "contacts.error.selectContactToLink"));
      return;
    }
    setBusy("update");
    setError("");
    try {
      await updateContact(token, Number(selectedExistingId), { customer_id: customerId });
      setSelectedExistingId("");
      setShowLinkExisting(false);
      await Promise.all([loadContacts(), loadAllContacts()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, "contacts.error.linkFailed"));
    } finally {
      setBusy(null);
    }
  }

  const inputClass = "ui-input w-full";

  const linkCandidates = useMemo(
    () => allContacts.filter((contact) => contact.customer_id !== customerId),
    [allContacts, customerId]
  );

  return (
    <div className="mt-4 rounded-xl p-4 shadow-sm" style={{ background: "var(--surface)", border: "1px solid var(--border-soft)" }}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold uppercase tracking-wider p-text-muted">{t(lang, "contacts.title")}</h4>
        {!readonly ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowLinkExisting((v) => !v)}
              className="btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold"
            >
              {t(lang, "contacts.button.linkExisting")}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold"
            >
              <Plus className="h-3.5 w-3.5" />
              {t(lang, "contacts.button.addContact")}
            </button>
          </div>
        ) : null}
      </div>
      <p className="mb-3 text-xs text-[var(--text-muted)]">{t(lang, "contacts.syncFirmHint")}</p>

      {loading ? <p className="text-sm p-text-muted">{t(lang, "common.loading")}</p> : null}
      {!loading && sortedContacts.length === 0 ? (
        <p className="text-sm p-text-muted">{t(lang, "contacts.empty")}</p>
      ) : null}

      {!loading && sortedContacts.length > 0 ? (
        <div className="space-y-2">
          {sortedContacts.map((contact) => {
            const isEditing = editId === contact.id && !readonly;
            return (
              <div
                key={contact.id}
                className="rounded-lg border border-slate-200 p-3 text-sm border-[var(--border-soft)]"
              >
                <p className="mb-2 text-[11px] font-medium tabular-nums text-zinc-500 text-[var(--text-subtle)]">
                  {t(lang, "customers.contacts.col.contactId")}: {contact.id}
                </p>
                {contact.exxas_contact_id ? (
                  <p className="mb-2 text-[11px] font-medium tabular-nums text-zinc-500 text-[var(--text-subtle)]">
                    EXXAS-ID: {contact.exxas_contact_id}
                  </p>
                ) : null}
                {isEditing ? (
                  <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
                    <select
                      className={inputClass}
                      value={editForm.salutation}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, salutation: e.target.value }))}
                    >
                      <option value="">—</option>
                      <option value="Herr">{t(lang, "customer.salutation.mr")}</option>
                      <option value="Frau">{t(lang, "customer.salutation.ms")}</option>
                    </select>
                    <input className={inputClass} placeholder={t(lang, "contact.firstName")} value={editForm.first_name} onChange={(e) => setEditForm((prev) => ({ ...prev, first_name: e.target.value }))} />
                    <input className={inputClass} placeholder={`${t(lang, "contact.lastName")} *`} value={editForm.last_name} onChange={(e) => setEditForm((prev) => ({ ...prev, last_name: e.target.value }))} />
                    <input className={inputClass} placeholder={t(lang, "customers.label.role")} value={editForm.role} onChange={(e) => setEditForm((prev) => ({ ...prev, role: e.target.value }))} />
                    <input className={inputClass} placeholder={t(lang, "contact.phoneDirect")} value={editForm.phone_direct} onChange={(e) => setEditForm((prev) => ({ ...prev, phone_direct: e.target.value }))} />
                    <input className={inputClass} placeholder={t(lang, "customer.phoneMobile")} value={editForm.phone_mobile} onChange={(e) => setEditForm((prev) => ({ ...prev, phone_mobile: e.target.value }))} />
                    <input className={inputClass} placeholder={t(lang, "common.email")} value={editForm.email} onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))} />
                    <input className={inputClass} placeholder={t(lang, "contact.department")} value={editForm.department} onChange={(e) => setEditForm((prev) => ({ ...prev, department: e.target.value }))} />
                    <div className="md:col-span-2 lg:col-span-4">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
                        Portal-Rolle
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="rounded border border-[var(--border-soft)] bg-[var(--surface-raised)] px-2 py-1 text-xs text-[var(--text-muted)]">
                          {PORTAL_ROLE_OPTIONS.find((o) => o.value === editForm.portal_role)?.label ?? "—"}
                        </span>
                        <a href="/settings/access?tab=portal" className="text-xs text-[var(--accent)] hover:underline">
                          Zentral verwalten →
                        </a>
                      </div>
                    </div>
                    <div className="md:col-span-2 lg:col-span-4">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
                        EXXAS-ID
                      </label>
                      <input
                        className={`${inputClass} bg-[var(--surface-raised)]`}
                        value={editForm.exxas_contact_id}
                        readOnly
                        placeholder="Keine EXXAS-ID hinterlegt"
                      />
                    </div>
                    <div className="md:col-span-4 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(contact.id)}
                        disabled={busy === "update"}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        <Save className="h-3.5 w-3.5" />
                        {t(lang, "common.save")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditId(null);
                          setEditForm(EMPTY_FORM);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 border-[var(--border-soft)] text-[var(--text-main)] hover:bg-[var(--surface-raised)]"
                      >
                        <X className="h-3.5 w-3.5" />
                        {t(lang, "common.cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid flex-1 gap-1 md:grid-cols-2">
                      <p className="text-[var(--text-main)]">
                        <span className="font-semibold">{t(lang, "common.name")}:</span> {toDisplayString([contact.salutation, contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.name, "-")}
                      </p>
                      <p className="text-[var(--text-muted)]">
                        <span className="font-semibold">{t(lang, "customer.salutation")}:</span> {toDisplayString(contact.salutation, "-")}
                      </p>
                      <p className="text-[var(--text-muted)]">
                        <span className="font-semibold">{t(lang, "contact.firstName")}:</span> {toDisplayString(contact.first_name, "-")}
                      </p>
                      <p className="text-[var(--text-muted)]">
                        <span className="font-semibold">{t(lang, "contact.lastName")}:</span> {toDisplayString(contact.last_name, "-")}
                      </p>
                      <p className="text-[var(--text-muted)]">
                        <span className="font-semibold">Anzeigename:</span> {toDisplayString(contact.name, "-")}
                      </p>
                      <p className="text-[var(--text-muted)]">
                        <span className="font-semibold">{t(lang, "customers.label.role")}:</span> {toDisplayString(contact.role, "-")}
                      </p>
                      <p className="text-[var(--text-muted)]">
                        <span className="font-semibold">Portal-Rolle:</span>{" "}
                        {(() => {
                          const opt = PORTAL_ROLE_OPTIONS.find((o) => o.value === contact.portal_role);
                          return opt ? (
                            <span title={opt.description} className="cursor-help rounded bg-[var(--surface-raised)] px-1.5 py-0.5 text-xs font-medium text-[var(--text-main)]">
                              {opt.label}
                            </span>
                          ) : (
                            <span className="rounded bg-[var(--surface-raised)] px-1.5 py-0.5 text-xs text-[var(--text-subtle)]">Firmen-Mitarbeiter</span>
                          );
                        })()}
                      </p>
                      <p className="text-[var(--text-muted)]">
                        <span className="font-semibold">{t(lang, "contact.phoneDirect")}:</span>{" "}
                        <PhoneLink value={contact.phone_direct || contact.phone} className="text-[var(--accent)]" />
                      </p>
                      <p className="text-[var(--text-muted)]">
                        <span className="font-semibold">{t(lang, "customer.phoneMobile")}:</span>{" "}
                        <PhoneLink value={contact.phone_mobile} className="text-[var(--accent)]" />
                      </p>
                      <p className="text-[var(--text-muted)]">
                        <span className="font-semibold">{t(lang, "common.email")}:</span> {toDisplayString(contact.email, "-")}
                      </p>
                      <p className="text-[var(--text-muted)]">
                        <span className="font-semibold">{t(lang, "contact.department")}:</span> {toDisplayString(contact.department, "-")}
                      </p>
                      <p className="text-[var(--text-muted)]">
                        <span className="font-semibold">EXXAS-ID:</span> {toDisplayString(contact.exxas_contact_id, "-")}
                      </p>
                      <p className="text-[var(--text-muted)]">
                        <span className="font-semibold">Sortierung:</span> {toDisplayString(contact.sort_order, "-")}
                      </p>
                      <p className="text-[var(--text-muted)] md:col-span-2">
                        <span className="font-semibold">Erstellt:</span> {contact.created_at ? formatSwissDateTime(contact.created_at) : "-"}
                      </p>
                    </div>
                    {!readonly ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(contact)}
                          className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 text-[var(--text-subtle)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-main)]"
                          title={t(lang, "contacts.tooltip.edit")}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(contact.id)}
                          disabled={busy === "delete"}
                          className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 disabled:opacity-60"
                          title={t(lang, "contacts.tooltip.delete")}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      {!readonly && showCreate ? (
        <div className="mt-3 rounded-lg border border-dashed border-slate-300 p-3 border-[var(--border-soft)]">
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
            <select
              className={inputClass}
              value={createForm.salutation}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, salutation: e.target.value }))}
            >
              <option value="">—</option>
              <option value="Herr">{t(lang, "customer.salutation.mr")}</option>
              <option value="Frau">{t(lang, "customer.salutation.ms")}</option>
            </select>
            <input className={inputClass} placeholder={t(lang, "contact.firstName")} value={createForm.first_name} onChange={(e) => setCreateForm((prev) => ({ ...prev, first_name: e.target.value }))} />
            <input className={inputClass} placeholder={`${t(lang, "contact.lastName")} *`} value={createForm.last_name} onChange={(e) => setCreateForm((prev) => ({ ...prev, last_name: e.target.value }))} />
            <input className={inputClass} placeholder={t(lang, "customers.label.role")} value={createForm.role} onChange={(e) => setCreateForm((prev) => ({ ...prev, role: e.target.value }))} />
            <input className={inputClass} placeholder={t(lang, "contact.phoneDirect")} value={createForm.phone_direct} onChange={(e) => setCreateForm((prev) => ({ ...prev, phone_direct: e.target.value }))} />
            <input className={inputClass} placeholder={t(lang, "customer.phoneMobile")} value={createForm.phone_mobile} onChange={(e) => setCreateForm((prev) => ({ ...prev, phone_mobile: e.target.value }))} />
            <input className={inputClass} placeholder={t(lang, "common.email")} value={createForm.email} onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))} />
            <input className={inputClass} placeholder={t(lang, "contact.department")} value={createForm.department} onChange={(e) => setCreateForm((prev) => ({ ...prev, department: e.target.value }))} />
            <div className="md:col-span-2 lg:col-span-4">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
                Portal-Rolle
              </label>
              <p className="text-xs text-[var(--text-muted)]">
                Wird nach dem Anlegen über{" "}
                <a href="/settings/access?tab=portal" className="text-[var(--accent)] hover:underline">
                  Rechteverwaltung → Portal & Team
                </a>{" "}
                gesetzt.
              </p>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleCreate}
              disabled={busy === "create"}
              className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
            >
              <Save className="h-3.5 w-3.5" />
              {t(lang, "common.save")}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
                setCreateForm(EMPTY_FORM);
              }}
              className="btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold"
            >
              <X className="h-3.5 w-3.5" />
              {t(lang, "common.cancel")}
            </button>
          </div>
        </div>
      ) : null}

      {!readonly && showLinkExisting ? (
        <div className="mt-3 rounded-lg border border-dashed p-3" style={{ borderColor: "var(--border-strong)" }}>
          <label className="mb-1 block text-sm font-medium p-text-muted">
            {t(lang, "contacts.label.selectExisting")}
          </label>
          <select
            value={selectedExistingId}
            onChange={(e) => setSelectedExistingId(e.target.value)}
            className={inputClass}
          >
            <option value="">{t(lang, "contacts.placeholder.selectExisting")}</option>
            {linkCandidates.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {([contact.first_name, contact.last_name].filter(Boolean).join(" ").trim() || contact.name || `#${contact.id}`)}
                {contact.customer_company || contact.customer_name
                  ? ` (${t(lang, "contacts.label.currentlyLinkedTo")}: ${contact.customer_company || contact.customer_name})`
                  : ` (${t(lang, "contacts.label.unlinked")})`}
              </option>
            ))}
          </select>
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleLinkExisting}
              disabled={busy === "update"}
              className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
            >
              {t(lang, "contacts.button.linkNow")}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowLinkExisting(false);
                setSelectedExistingId("");
              }}
              className="btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold"
            >
              {t(lang, "common.cancel")}
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}

