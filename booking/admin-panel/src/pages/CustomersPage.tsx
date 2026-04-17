import { useEffect, useMemo, useState } from "react";
import { ArrowUpDown, Building2, ChevronDown, ChevronUp, Mail, Monitor, Phone, Plus, Search, User, UserPlus, X } from "lucide-react";
import { createContact, createCustomer, createCustomerContact, deleteCustomer, getContacts, getCustomers, getCustomerImpersonateUrl, patchCustomerNasFolderBases, updateContact, updateCustomer, updateCustomerAdmin, updateCustomerBlocked, type Contact, type Customer } from "../api/customers";
import { CustomerList, type CustomerSortKey } from "../components/customers/CustomerList";
import { ContactModal } from "../components/customers/ContactModal";
import { formatPhoneCH } from "../lib/format";
import { PhoneLink } from "../components/ui/PhoneLink";
import { CustomerViewModal } from "../components/customers/CustomerViewModal";
import { CustomerMergeModal } from "../components/customers/CustomerMergeModal";
import { CustomerPreviewDialog } from "../components/customers/CustomerPreviewDialog";
import { CreateContactDialog } from "../components/customers/CreateContactDialog";
import { CreateOrderWizard } from "../components/orders/CreateOrderWizard";
import { useMutation } from "../hooks/useMutation";
import { useQuery } from "../hooks/useQuery";
import { customersQueryKey } from "../lib/queryKeys";
import { useAuthStore } from "../store/authStore";
import { t } from "../i18n";
import { useQueryStore } from "../store/queryStore";


type QuickContactFormState = {
  salutation: string;
  first_name: string;
  last_name: string;
  role: string;
  phone_direct: string;
  phone_mobile: string;
  email: string;
  department: string;
};

const EMPTY_QUICK_CONTACT: QuickContactFormState = {
  salutation: "",
  first_name: "",
  last_name: "",
  role: "",
  phone_direct: "",
  phone_mobile: "",
  email: "",
  department: "",
};

const quickContactInputClass = "ui-input";

export function CustomersPage() {
  const token = useAuthStore((s) => s.token);
  const lang = useAuthStore((s) => s.language);
  const [selectedContactRecord, setSelectedContactRecord] = useState<Customer | null>(null);
  const [viewCustomer, setViewCustomer] = useState<Customer | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [orderWizardCustomer, setOrderWizardCustomer] = useState<Customer | null>(null);
  const [contactCustomer, setContactCustomer] = useState<Customer | null>(null);
  const [createContactDialogOpen, setCreateContactDialogOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"customers" | "contacts">("customers");
  const [customerSortKey, setCustomerSortKey] = useState<CustomerSortKey>("name");
  const [customerSortDir, setCustomerSortDir] = useState<"asc" | "desc">("asc");
  const [contactSortKey, setContactSortKey] = useState<"contactId" | "customerId" | "name" | "contact" | "customer" | "role">("name");
  const [contactSortDir, setContactSortDir] = useState<"asc" | "desc">("asc");
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [linkContact, setLinkContact] = useState<Contact | null>(null);
  const [linkCustomerId, setLinkCustomerId] = useState<string>("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [mergeKeepCustomer, setMergeKeepCustomer] = useState<Customer | null>(null);
  const [contactSaving, setContactSaving] = useState(false);
  const [contactError, setContactError] = useState("");
  const [contactSuccess, setContactSuccess] = useState("");
  const [contactForm, setContactForm] = useState<QuickContactFormState>(EMPTY_QUICK_CONTACT);
  const updateCachedCustomers = useQueryStore((s) => s.updateData);

  const queryKey = customersQueryKey(token);
  const { data: items = [], refetch } = useQuery<Customer[]>(
    queryKey,
    () => getCustomers(token),
    { enabled: Boolean(token), staleTime: 5 * 60 * 1000 },
  );

  const createMutation = useMutation<void, { data: Record<string, unknown>; mergeWithId?: number }>(
    async ({ data, mergeWithId }) => {
      if (mergeWithId) {
        await updateCustomer(token, mergeWithId, data);
      } else {
        await createCustomer(token, data);
      }
    },
    {
      mutationKey: `customers:createOrMerge:${token}`,
      invalidateKeys: [queryKey],
    },
  );

  const saveMutation = useMutation<void, { id: number; payload: Record<string, unknown> }>(
    async ({ id, payload }) => {
      const nasPatch: { nasCustomerFolderBase?: string | null; nasRawFolderBase?: string | null } = {};
      if (Object.prototype.hasOwnProperty.call(payload, "nas_customer_folder_base")) {
        const v = payload.nas_customer_folder_base;
        nasPatch.nasCustomerFolderBase = v === "" || v == null ? null : String(v);
      }
      if (Object.prototype.hasOwnProperty.call(payload, "nas_raw_folder_base")) {
        const v = payload.nas_raw_folder_base;
        nasPatch.nasRawFolderBase = v === "" || v == null ? null : String(v);
      }
      const { nas_customer_folder_base: _nc, nas_raw_folder_base: _nr, ...customerPayload } = payload;
      if (Object.keys(nasPatch).length > 0) {
        await patchCustomerNasFolderBases(token, id, nasPatch);
      }
      await updateCustomer(token, id, customerPayload);
    },
    {
      mutationKey: `customers:save:${token}`,
      invalidateKeys: [queryKey],
    },
  );

  const blockedMutation = useMutation<void, { id: number; blocked: boolean }, { previous?: Customer[] }>(
    async ({ id, blocked }) => {
      await updateCustomerBlocked(token, id, blocked);
    },
    {
      mutationKey: `customers:toggleBlocked:${token}`,
      invalidateKeys: [queryKey],
      onMutate: ({ id, blocked }) => {
        const previous = useQueryStore.getState().queries[queryKey]?.data as Customer[] | undefined;
        updateCachedCustomers<Customer[]>(queryKey, (current = []) =>
          current.map((customer) => (customer.id === id ? { ...customer, blocked } : customer)),
        );
        return { previous: previous ? [...previous] : undefined };
      },
      onError: (_error, _variables, context) => {
        if (!context?.previous) return;
        useQueryStore.getState().setData(queryKey, context.previous);
      },
    },
  );

  const adminMutation = useMutation<void, { id: number; is_admin: boolean }, { previous?: Customer[] }>(
    async ({ id, is_admin }) => {
      await updateCustomerAdmin(token, id, is_admin);
    },
    {
      mutationKey: `customers:toggleAdmin:${token}`,
      invalidateKeys: [queryKey],
      onMutate: ({ id, is_admin }) => {
        const previous = useQueryStore.getState().queries[queryKey]?.data as Customer[] | undefined;
        updateCachedCustomers<Customer[]>(queryKey, (current = []) =>
          current.map((customer) => (customer.id === id ? { ...customer, is_admin } : customer)),
        );
        return { previous: previous ? [...previous] : undefined };
      },
      onError: (_error, _variables, context) => {
        if (!context?.previous) return;
        useQueryStore.getState().setData(queryKey, context.previous);
      },
    },
  );

  const deleteMutation = useMutation<void, { id: number; force?: boolean }, { previous?: Customer[] }>(
    async ({ id, force }) => {
      await deleteCustomer(token, id, force ?? false);
    },
    {
      mutationKey: `customers:delete:${token}`,
      invalidateKeys: [queryKey],
      onMutate: ({ id }) => {
        const previous = useQueryStore.getState().queries[queryKey]?.data as Customer[] | undefined;
        updateCachedCustomers<Customer[]>(queryKey, (current = []) =>
          current.filter((customer) => customer.id !== id),
        );
        return { previous: previous ? [...previous] : undefined };
      },
      onError: (_error, _variables, context) => {
        if (!context?.previous) return;
        useQueryStore.getState().setData(queryKey, context.previous);
      },
    },
  );

  async function create(data: {
    name: string;
    email: string;
    company: string;
    phone: string;
    street: string;
    zipcity: string;
    notes: string;
    is_admin: boolean;
    salutation?: string;
    first_name?: string;
    address_addon_1?: string;
    po_box?: string;
    zip?: string;
    city?: string;
    country?: string;
    phone_2?: string;
    phone_mobile?: string;
    phone_fax?: string;
    website?: string;
  }, mergeWithId?: number) {
    await createMutation.mutate({ data, mergeWithId });
    await refetch({ force: true });
  }

  const fmtPhone = (v: string) => formatPhoneCH(v) || (v || "").trim();
  async function saveContactRecord(payload: Record<string, unknown>) {
    if (!selectedContactRecord) return;
    const p = {
      ...payload,
      phone: fmtPhone(String(payload.phone || "")),
      onsite_phone: payload.onsite_phone ? fmtPhone(String(payload.onsite_phone)) : payload.onsite_phone,
    };
    await saveMutation.mutate({ id: selectedContactRecord.id, payload: p });
    await refetch({ force: true });
  }

  async function toggleBlocked(id: number, blocked: boolean) {
    await blockedMutation.mutate({ id, blocked });
    await refetch({ force: true });
  }
  async function toggleAdmin(id: number, is_admin: boolean) {
    await adminMutation.mutate({ id, is_admin });
    await refetch({ force: true });
  }
  async function removeCustomer(id: number, force = false) {
    await deleteMutation.mutate({ id, force });
    await refetch({ force: true });
  }

  function openQuickContact(customer: Customer) {
    openQuickContactWithPrefill(customer);
  }

  function openQuickContactWithPrefill(customer: Customer, partial?: Partial<QuickContactFormState>) {
    setContactCustomer(customer);
    setContactError("");
    setContactSaving(false);
    setContactForm({ ...EMPTY_QUICK_CONTACT, ...partial });
  }

  function closeQuickContact() {
    setContactCustomer(null);
    setContactError("");
    setContactSaving(false);
  }

  function isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  async function saveQuickContact() {
    if (!contactCustomer) return;
    if (!contactForm.last_name.trim() && !contactForm.first_name.trim()) {
      setContactError(t(lang, "contacts.error.nameRequired"));
      return;
    }
    if (contactForm.email.trim() && !isValidEmail(contactForm.email.trim())) {
      setContactError(t(lang, "customers.error.invalidEmail"));
      return;
    }
    const name =
      [contactForm.first_name, contactForm.last_name].filter(Boolean).join(" ").trim() || contactForm.last_name.trim();
    setContactSaving(true);
    setContactError("");
    try {
      await createCustomerContact(token, contactCustomer.id, {
        name,
        salutation: contactForm.salutation.trim(),
        first_name: contactForm.first_name.trim(),
        last_name: contactForm.last_name.trim(),
        role: contactForm.role.trim(),
        phone_direct: fmtPhone(contactForm.phone_direct.trim()),
        phone_mobile: fmtPhone(contactForm.phone_mobile.trim()),
        phone: fmtPhone(contactForm.phone_direct.trim()),
        email: contactForm.email.trim(),
        department: contactForm.department.trim(),
      });
      if (viewMode === "contacts") {
        const contacts = await getContacts(token);
        setAllContacts(Array.isArray(contacts) ? contacts : []);
      }
      setContactSuccess(t(lang, "customers.success.contactSaved").replace("{{name}}", contactCustomer.company || contactCustomer.name || "-"));
      closeQuickContact();
    } catch (err) {
      setContactError(err instanceof Error ? err.message : t(lang, "customers.error.contactCreateFailed"));
    } finally {
      setContactSaving(false);
    }
  }

  useEffect(() => {
    if (!contactSuccess) return;
    const timer = setTimeout(() => setContactSuccess(""), 2800);
    return () => clearTimeout(timer);
  }, [contactSuccess]);

  useEffect(() => {
    if (viewMode !== "contacts" || !token) return;
    setContactsLoading(true);
    getContacts(token)
      .then((rows) => setAllContacts(Array.isArray(rows) ? rows : []))
      .catch(() => setAllContacts([]))
      .finally(() => setContactsLoading(false));
  }, [viewMode, token]);

  function toggleCustomerSort(key: CustomerSortKey) {
    setCustomerSortKey((current) => {
      if (current === key) {
        setCustomerSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
        return current;
      }
      setCustomerSortDir("asc");
      return key;
    });
  }

  function toggleContactSort(key: "contactId" | "customerId" | "name" | "contact" | "customer" | "role") {
    setContactSortKey((current) => {
      if (current === key) {
        setContactSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
        return current;
      }
      setContactSortDir("asc");
      return key;
    });
  }

  function normalizeSortValue(value: string) {
    return value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
  }

  function compareStrings(a: string, b: string) {
    return normalizeSortValue(a).localeCompare(normalizeSortValue(b), "de-CH");
  }

  const filteredContacts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allContacts;
    return allContacts.filter((ct) =>
      [String(ct.id), ct.customer_id != null ? String(ct.customer_id) : "", ct.name, ct.first_name, ct.last_name, ct.role, ct.email, ct.phone, ct.phone_mobile, ct.customer_name, ct.customer_company, ct.department]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [allContacts, query]);

  const filtered = useMemo(() => items.filter((c) => {
    const q = query.trim().toLowerCase();
    const hit = !q || [String(c.id), c.name, c.email, c.company, c.phone, c.phone_2, c.phone_mobile, c.street, c.zipcity, c.zip, c.city, c.website].join(" ").toLowerCase().includes(q);
    const roleOk = roleFilter === "all" || (roleFilter === "admin" ? Boolean(c.is_admin) : !c.is_admin);
    return hit && roleOk;
  }), [items, query, roleFilter]);

  const sortedCustomers = useMemo(() => {
    const factor = customerSortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (customerSortKey === "name") {
        const sortLabel = (c: Customer) => String(c.company || "").trim() || String(c.name || "").trim();
        return factor * compareStrings(sortLabel(a), sortLabel(b));
      }
      if (customerSortKey === "address") {
        return factor * compareStrings([a.street, a.zipcity].filter(Boolean).join(", "), [b.street, b.zipcity].filter(Boolean).join(", "));
      }
      if (customerSortKey === "role") {
        return factor * ((Number(Boolean(a.is_admin)) - Number(Boolean(b.is_admin))));
      }
      if (customerSortKey === "status") {
        return factor * ((Number(Boolean(a.blocked)) - Number(Boolean(b.blocked))));
      }
      return factor * ((Number(a.order_count || 0) - Number(b.order_count || 0)));
    });
  }, [filtered, customerSortDir, customerSortKey]);

  const sortedContacts = useMemo(() => {
    const factor = contactSortDir === "asc" ? 1 : -1;
    const displayName = (ct: Contact) =>
      [ct.first_name, ct.last_name].filter(Boolean).join(" ").trim() || ct.name || "";
    const displayContact = (ct: Contact) =>
      [ct.email, ct.phone].filter(Boolean).join(" ").trim();
    const displayCustomer = (ct: Contact) => {
      const matchedCustomer = items.find((item) => item.id === (ct.customer_id ?? 0));
      return ct.customer_company || ct.customer_name || matchedCustomer?.company || matchedCustomer?.name || "";
    };

    return [...filteredContacts].sort((a, b) => {
      if (contactSortKey === "contactId") {
        return factor * (a.id - b.id);
      }
      if (contactSortKey === "customerId") {
        const aid = a.customer_id ?? 0;
        const bid = b.customer_id ?? 0;
        return factor * (aid - bid);
      }
      if (contactSortKey === "name") {
        return factor * compareStrings(displayName(a), displayName(b));
      }
      if (contactSortKey === "contact") {
        return factor * compareStrings(displayContact(a), displayContact(b));
      }
      if (contactSortKey === "customer") {
        return factor * compareStrings(displayCustomer(a), displayCustomer(b));
      }
      return factor * compareStrings(a.role || "", b.role || "");
    });
  }, [filteredContacts, contactSortDir, contactSortKey, items]);

  function openLinkDialog(contact: Contact) {
    setLinkContact(contact);
    setLinkCustomerId(contact.customer_id ? String(contact.customer_id) : "");
    setLinkError("");
  }

  function closeLinkDialog() {
    setLinkContact(null);
    setLinkCustomerId("");
    setLinkBusy(false);
    setLinkError("");
  }

  async function saveContactLink() {
    if (!token || !linkContact) return;
    setLinkBusy(true);
    setLinkError("");
    try {
      const customerId = linkCustomerId ? Number(linkCustomerId) : null;
      await updateContact(token, linkContact.id, { customer_id: Number.isFinite(customerId as number) ? customerId : null });
      const rows = await getContacts(token);
      setAllContacts(Array.isArray(rows) ? rows : []);
      setContactSuccess(
        customerId
          ? t(lang, "customers.success.contactLinked")
          : t(lang, "customers.success.contactUnlinked")
      );
      closeLinkDialog();
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : t(lang, "customers.error.contactLinkFailed"));
      setLinkBusy(false);
    }
  }

  function renderSortButton(
    label: string,
    active: boolean,
    dir: "asc" | "desc",
    onClick: () => void,
  ) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
      >
        <span>{label}</span>
        {active ? (dir === "asc" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />) : <ArrowUpDown className="h-3.5 w-3.5 opacity-70" />}
      </button>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight p-text-main mb-2">
            {viewMode === "contacts" ? t(lang, "customers.titleContacts") : t(lang, "customers.title")}
          </h1>
          <p className="p-text-muted">
            {viewMode === "contacts" ? t(lang, "customers.descriptionContacts") : t(lang, "customers.description")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="btn-secondary inline-flex items-center gap-2 px-3 py-2.5 text-sm"
            title="Kundenvorschau – Portal aus Kundensicht öffnen"
          >
            <Monitor className="h-4 w-4" />
            <span className="hidden sm:inline">Vorschau</span>
          </button>
          <button
            onClick={() => setCreateContactDialogOpen(true)}
            className="btn-primary px-4 py-2.5 text-sm shadow-sm"
          >
            <Plus className="h-5 w-5" />
            <span className="hidden sm:inline">{viewMode === "contacts" ? t(lang, "customers.button.newContact") : t(lang, "customers.button.newCustomer")}</span>
          </button>
        </div>
      </div>

      {/* View Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => { setViewMode("customers"); setQuery(""); }}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${viewMode === "customers" ? "btn-primary" : "btn-secondary"}`}
        >
          <Building2 className="h-4 w-4" />
          {t(lang, "customers.view.customers")}
        </button>
        <button
          onClick={() => { setViewMode("contacts"); setQuery(""); }}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${viewMode === "contacts" ? "btn-primary" : "btn-secondary"}`}
        >
          <User className="h-4 w-4" />
          {t(lang, "customers.view.contacts")}
        </button>
      </div>

      {/* Search & Filter */}
      <div className="surface-card p-5">
        <div className="flex flex-col sm:flex-row sm:items-stretch gap-3">
          <div className="flex flex-1 min-w-0 sm:min-w-[14rem] sm:flex-[2_1_62%] group">
            <div
              className="flex w-full min-h-[56px] items-center rounded-[10px] border border-[var(--border-strong)] bg-[var(--surface-raised)] transition-all duration-200 focus-within:border-[var(--accent)] focus-within:bg-[var(--surface)] focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_22%,transparent)] dark:focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_28%,transparent)]"
            >
              <span className="flex shrink-0 items-center justify-center pl-4 pr-2" aria-hidden>
                <Search className="h-5 w-5 p-text-subtle transition-colors group-focus-within:text-[var(--accent)]" />
              </span>
              <input
                type="text"
                autoComplete="off"
                placeholder={viewMode === "contacts" ? t(lang, "customers.placeholder.searchContacts") : t(lang, "customers.placeholder.search")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="min-h-[56px] min-w-0 flex-1 border-0 bg-transparent py-3 pr-2 text-lg text-[var(--text-main)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-0"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="mr-2 flex shrink-0 items-center justify-center rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 hover:bg-[var(--surface-raised)] hover:text-[var(--text-main)]"
                  title="Suche leeren"
                >
                  <X className="h-5 w-5" />
                </button>
              ) : (
                <span className="w-2 shrink-0" aria-hidden />
              )}
            </div>
          </div>
          {viewMode === "customers" && (
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="ui-input py-4 text-base min-h-[56px] shrink-0 w-full sm:w-auto sm:min-w-[11rem]"
            >
              <option value="all">{t(lang, "customers.filter.allRoles")}</option>
              <option value="admin">{t(lang, "customers.filter.adminOnly")}</option>
              <option value="customer">{t(lang, "customers.filter.customersOnly")}</option>
            </select>
          )}
          <div className="flex items-center gap-2 px-4 py-2 sm:py-0 sm:self-center rounded-lg p-bg-raised border p-border-soft whitespace-nowrap shrink-0">
            <span className="text-xs font-semibold uppercase tracking-wider p-text-muted">{t(lang, "customers.label.hits")}</span>
            <span className="text-sm font-bold p-text-accent tabular-nums">{viewMode === "contacts" ? filteredContacts.length : filtered.length}</span>
          </div>
        </div>
      </div>

      {contactSuccess ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
          {contactSuccess}
        </div>
      ) : null}

      {/* Customer List / Contacts List */}
      {viewMode === "customers" ? (
        <CustomerList
          items={sortedCustomers}
          onEdit={setSelectedContactRecord}
          onToggleBlocked={toggleBlocked}
          onView={setViewCustomer}
          onOpenAsCustomer={async (c) => {
            try {
              const data = await getCustomerImpersonateUrl(token, c.id);
              if (data?.url) window.open(data.url, "_blank", "noopener");
            } catch {
              /* ignore: impersonation is best-effort */
            }
          }}
          onAddContact={openQuickContact}
          onMerge={(c) => setMergeKeepCustomer(c)}
          sortKey={customerSortKey}
          sortDir={customerSortDir}
          onSort={toggleCustomerSort}
        />
      ) : (
        <div className="surface-card overflow-hidden">
          {contactsLoading ? (
            <div className="p-12 text-center p-text-muted text-sm">{t(lang, "common.loading")}</div>
          ) : filteredContacts.length === 0 ? (
            <div className="p-12 text-center p-text-muted text-sm">{t(lang, "customers.contacts.empty")}</div>
          ) : (
            <table className="w-full table-fixed">
              <colgroup>
                <col className="w-[5%]" />
                <col className="w-[5%]" />
                <col className="w-[22%]" />
                <col className="w-[24%]" />
                <col className="w-[20%]" />
                <col className="w-[11%]" />
                <col className="w-[13%]" />
              </colgroup>
              <thead>
                <tr style={{ borderBottom: "2px solid color-mix(in srgb, var(--accent) 20%, var(--border-soft))" }}>
                  <th className="px-2 py-4 text-left text-xs font-bold uppercase tracking-wider p-text-accent tabular-nums">{renderSortButton(t(lang, "customers.contacts.col.contactId"), contactSortKey === "contactId", contactSortDir, () => toggleContactSort("contactId"))}</th>
                  <th className="px-2 py-4 text-left text-xs font-bold uppercase tracking-wider p-text-accent tabular-nums">{renderSortButton(t(lang, "customers.contacts.col.customerId"), contactSortKey === "customerId", contactSortDir, () => toggleContactSort("customerId"))}</th>
                  <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider p-text-accent">{renderSortButton(t(lang, "customers.contacts.col.name"), contactSortKey === "name", contactSortDir, () => toggleContactSort("name"))}</th>
                  <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider p-text-accent">{renderSortButton(t(lang, "customers.contacts.col.contact"), contactSortKey === "contact", contactSortDir, () => toggleContactSort("contact"))}</th>
                  <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider p-text-accent">{renderSortButton(t(lang, "customers.contacts.col.firm"), contactSortKey === "customer", contactSortDir, () => toggleContactSort("customer"))}</th>
                  <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider p-text-accent">{renderSortButton(t(lang, "customers.label.role"), contactSortKey === "role", contactSortDir, () => toggleContactSort("role"))}</th>
                  <th className="px-3 py-4 text-right text-xs font-bold uppercase tracking-wider p-text-accent">{t(lang, "common.actions")}</th>
                </tr>
              </thead>
              <tbody style={{ borderColor: "var(--border-soft)" }} className="divide-y">
                {sortedContacts.map((ct) => (
                  <tr
                    key={`contact-${ct.id}`}
                    className="propus-table-row transition-colors cursor-pointer"
                    onClick={() => {
                      const parent = items.find((c) => c.id === (ct.customer_id ?? 0));
                      if (parent) setSelectedContactRecord(parent);
                    }}
                  >
                    <td className="px-2 py-3 text-xs tabular-nums p-text-subtle whitespace-nowrap">{ct.id}</td>
                    <td className="px-2 py-3 text-xs tabular-nums p-text-subtle whitespace-nowrap">{ct.customer_id ?? "—"}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5 shrink-0 p-text-subtle" />
                        <span className="font-semibold text-sm p-text-main truncate">{[ct.first_name, ct.last_name].filter(Boolean).join(" ").trim() || ct.name || "-"}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {ct.email ? (
                        <a href={`mailto:${ct.email}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 text-sm p-text-muted p-hover-accent transition-colors w-fit">
                          <Mail className="h-3.5 w-3.5 shrink-0 p-text-subtle" />
                          <span className="truncate">{ct.email}</span>
                        </a>
                      ) : null}
                      {ct.phone ? (
                        <span onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 text-sm p-text-muted p-hover-accent transition-colors mt-0.5 w-fit">
                          <Phone className="h-3.5 w-3.5 shrink-0 p-text-subtle" />
                          <PhoneLink value={ct.phone} className="p-hover-accent" />
                        </span>
                      ) : null}
                      {!ct.email && !ct.phone ? <span className="text-sm p-text-subtle">-</span> : null}
                    </td>
                    <td className="px-3 py-3">
                      {ct.customer_id ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const parent = items.find((c) => c.id === ct.customer_id);
                            if (parent) setSelectedContactRecord(parent);
                          }}
                          className="flex items-center gap-1.5 text-sm p-text-muted p-hover-accent transition-colors w-fit"
                          title={t(lang, "customers.contacts.openCustomer")}
                        >
                          <Building2 className="h-3.5 w-3.5 shrink-0 p-text-subtle" />
                          <span className="truncate">
                            {ct.customer_company || ct.customer_name || items.find((c) => c.id === ct.customer_id)?.company || items.find((c) => c.id === ct.customer_id)?.name || "-"}
                          </span>
                        </button>
                      ) : (
                        <span className="text-sm p-text-subtle">{t(lang, "customers.contacts.unlinked")}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-sm p-text-muted truncate">{ct.role || "-"}</td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openLinkDialog(ct);
                        }}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 border-[var(--border-soft)] text-[var(--text-main)] hover:bg-[var(--surface-raised)]"
                      >
                        {ct.customer_id ? t(lang, "customers.contacts.reassign") : t(lang, "customers.contacts.link")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <CustomerPreviewDialog
        open={previewOpen}
        token={token}
        customers={items}
        onClose={() => setPreviewOpen(false)}
      />

      {/* Modals */}
      <CreateContactDialog
        open={createContactDialogOpen}
        onOpenChange={setCreateContactDialogOpen}
        onSubmit={create}
        onCreateContact={async (contact, customerId) => {
          await createContact(token, {
            ...contact,
            customer_id: customerId ?? null,
          });
          if (viewMode === "contacts") {
            const rows = await getContacts(token);
            setAllContacts(Array.isArray(rows) ? rows : []);
          }
          setContactSuccess(t(lang, "customers.success.contactSaved"));
        }}
        existingCustomers={items}
      />
      {selectedContactRecord ? (
        <ContactModal
          token={token}
          item={selectedContactRecord}
          onSave={saveContactRecord}
          onToggleAdmin={toggleAdmin}
          onToggleBlocked={toggleBlocked}
          onDelete={removeCustomer}
          onClose={() => setSelectedContactRecord(null)}
        />
      ) : null}
      {viewCustomer ? (
        <CustomerViewModal
          open={!!viewCustomer}
          token={token}
          customer={viewCustomer}
          onClose={() => setViewCustomer(null)}
          onCreateOrder={(customer) => {
            setViewCustomer(null);
            setOrderWizardCustomer(customer);
          }}
        />
      ) : null}

      <CustomerMergeModal
        open={!!mergeKeepCustomer}
        keepCustomer={mergeKeepCustomer}
        customers={items}
        token={token}
        onClose={() => setMergeKeepCustomer(null)}
        onSuccess={async () => {
          await refetch({ force: true });
        }}
      />

      <CreateOrderWizard
        token={token}
        open={!!orderWizardCustomer}
        onOpenChange={(o) => { if (!o) setOrderWizardCustomer(null); }}
        initialCustomer={orderWizardCustomer}
        onSuccess={async () => {
          setOrderWizardCustomer(null);
          await refetch({ force: true });
        }}
      />

      {contactCustomer ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-2 sm:p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveQuickContact();
            }}
            className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-xl border-[var(--border-soft)] bg-[var(--surface)] my-auto"
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="inline-flex items-center gap-2 text-lg font-bold text-[var(--text-main)]">
                <UserPlus className="h-5 w-5 text-[var(--accent)]" />
                {t(lang, "customers.dialog.addContact").replace(
                  "{{name}}",
                  contactCustomer.company || contactCustomer.name || "-",
                )}
              </h3>
              <button
                type="button"
                onClick={closeQuickContact}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 text-[var(--text-subtle)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-main)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-muted)]">{t(lang, "customer.salutation")}</label>
                <select
                  className={quickContactInputClass}
                  value={contactForm.salutation}
                  onChange={(e) => setContactForm((prev) => ({ ...prev, salutation: e.target.value }))}
                >
                  <option value="">—</option>
                  <option value="Herr">{t(lang, "customer.salutation.mr")}</option>
                  <option value="Frau">{t(lang, "customer.salutation.ms")}</option>
                  <option value="Firma">{t(lang, "customer.salutation.company")}</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-muted)]">{t(lang, "contact.firstName")}</label>
                <input
                  type="text"
                  className={quickContactInputClass}
                  value={contactForm.first_name}
                  onChange={(e) => setContactForm((prev) => ({ ...prev, first_name: e.target.value }))}
                  placeholder={t(lang, "contact.firstName")}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-muted)]">{`${t(lang, "contact.lastName")} *`}</label>
                <input
                  type="text"
                  className={quickContactInputClass}
                  value={contactForm.last_name}
                  onChange={(e) => setContactForm((prev) => ({ ...prev, last_name: e.target.value }))}
                  placeholder={`${t(lang, "contact.lastName")} *`}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-muted)]">{t(lang, "customers.label.role")}</label>
                <input
                  type="text"
                  className={quickContactInputClass}
                  value={contactForm.role}
                  onChange={(e) => setContactForm((prev) => ({ ...prev, role: e.target.value }))}
                  placeholder={t(lang, "customers.placeholder.role")}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-muted)]">{t(lang, "contact.phoneDirect")}</label>
                <input
                  type="tel"
                  className={quickContactInputClass}
                  value={contactForm.phone_direct}
                  onChange={(e) => setContactForm((prev) => ({ ...prev, phone_direct: e.target.value }))}
                  placeholder="+41 58 400 91 12"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-muted)]">{t(lang, "customer.phoneMobile")}</label>
                <input
                  type="tel"
                  className={quickContactInputClass}
                  value={contactForm.phone_mobile}
                  onChange={(e) => setContactForm((prev) => ({ ...prev, phone_mobile: e.target.value }))}
                  placeholder="+41 79 123 45 67"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-muted)]">{t(lang, "common.email")}</label>
                <input
                  type="email"
                  className={quickContactInputClass}
                  value={contactForm.email}
                  onChange={(e) => setContactForm((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="max@firma.ch"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-muted)]">{t(lang, "contact.department")}</label>
                <input
                  type="text"
                  className={quickContactInputClass}
                  value={contactForm.department}
                  onChange={(e) => setContactForm((prev) => ({ ...prev, department: e.target.value }))}
                  placeholder={t(lang, "contact.department")}
                />
              </div>
            </div>

            {contactError ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{contactError}</p> : null}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeQuickContact}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 border-[var(--border-soft)] text-[var(--text-main)] hover:bg-[var(--surface-raised)]"
              >
                {t(lang, "common.cancel")}
              </button>
              <button
                type="submit"
                disabled={contactSaving}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
              >
                <UserPlus className="h-4 w-4" />
                {contactSaving ? t(lang, "customers.button.savingContact") : t(lang, "customers.button.saveContact")}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {linkContact ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-2 sm:p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveContactLink();
            }}
            className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-4 shadow-xl border-[var(--border-soft)] bg-[var(--surface)] my-auto"
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-[var(--text-main)]">{t(lang, "customers.contacts.linkDialogTitle")}</h3>
              <button
                type="button"
                onClick={closeLinkDialog}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 text-[var(--text-subtle)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-main)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-3 text-sm text-[var(--text-subtle)]">
              {[linkContact.first_name, linkContact.last_name].filter(Boolean).join(" ").trim() || linkContact.name || "-"}
            </p>
            <label className="mb-1 block text-sm font-medium text-[var(--text-muted)]">
              {t(lang, "customers.contacts.linkField")}
            </label>
            <select
              value={linkCustomerId}
              onChange={(e) => setLinkCustomerId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] border-[var(--border-soft)] bg-[var(--surface-raised)] text-[var(--text-main)]"
            >
              <option value="">{t(lang, "customers.contacts.noLinkOption")}</option>
              {items.map((customer) => {
                const label = customer.company || customer.name || "—";
                return (
                  <option key={customer.id} value={customer.id}>
                    {label} · {t(lang, "customerList.table.id")} {customer.id}
                  </option>
                );
              })}
            </select>
            {linkError ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{linkError}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeLinkDialog}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 border-[var(--border-soft)] text-[var(--text-main)] hover:bg-[var(--surface-raised)]"
              >
                {t(lang, "common.cancel")}
              </button>
              <button
                type="submit"
                disabled={linkBusy}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
              >
                {linkBusy ? t(lang, "common.saving") : t(lang, "common.save")}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}


