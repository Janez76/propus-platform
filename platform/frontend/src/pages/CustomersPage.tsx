import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowUpDown, Building2, CheckCircle2, ChevronDown, ChevronUp, Mail, PackageX, Phone, Plus, Search, ShoppingBag, User, UserPlus, Users, X } from "lucide-react";
import { createContact, createCustomer, createCustomerContact, deleteCustomer, getContacts, getCustomers, getCustomerImpersonateUrl, patchCustomerNasFolderBases, updateContact, updateCustomer, updateCustomerAdmin, updateCustomerBlocked, type Contact, type Customer } from "../api/customers";
import { CustomerList, type CustomerSortKey } from "../components/customers/CustomerList";
import { ContactModal } from "../components/customers/ContactModal";
import { formatPhoneCH } from "../lib/format";
import { PhoneLink } from "../components/ui/PhoneLink";
import { CustomerViewModal } from "../components/customers/CustomerViewModal";
import { CustomerMergeModal } from "../components/customers/CustomerMergeModal";
import { CreateContactDialog } from "../components/customers/CreateContactDialog";
import { CreateOrderWizard } from "../components/orders/CreateOrderWizard";
import { useMutation } from "../hooks/useMutation";
import { useQuery } from "../hooks/useQuery";
import { customersQueryKey } from "../lib/queryKeys";
import { cn } from "../lib/utils";
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

const CUSTOMER_PAGE_SIZE = 15;

function buildPaginationPages(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const set = new Set<number>([1, total, current, current - 1, current + 1]);
  const sorted = [...set].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | "ellipsis")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i]! - sorted[i - 1]! > 1) {
      out.push("ellipsis");
    }
    out.push(sorted[i]!);
  }
  return out;
}

function normalizeSortValue(value: string) {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function compareStrings(a: string, b: string) {
  return normalizeSortValue(a).localeCompare(normalizeSortValue(b), "de-CH");
}

export function CustomersPage() {
  const token = useAuthStore((s) => s.token);
  const lang = useAuthStore((s) => s.language);
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedContactRecord, setSelectedContactRecord] = useState<Customer | null>(null);
  const [viewCustomer, setViewCustomer] = useState<Customer | null>(null);
  const [orderWizardCustomer, setOrderWizardCustomer] = useState<Customer | null>(null);
  const [contactCustomer, setContactCustomer] = useState<Customer | null>(null);
  const [createContactDialogOpen, setCreateContactDialogOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const raw = searchParams.get("focusCustomerId");
    if (raw == null || raw === "") return;
    if (!/^\d+$/.test(raw.trim())) return;
    setQuery(raw.trim());
    const next = new URLSearchParams(searchParams);
    next.delete("focusCustomerId");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [customerListPage, setCustomerListPage] = useState(1);
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
      const customerPayload = { ...payload } as Record<string, unknown>;
      delete customerPayload.nas_customer_folder_base;
      delete customerPayload.nas_raw_folder_base;
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
    const blocked = Boolean(c.blocked);
    const statusOk =
      statusFilter === "all" ||
      (statusFilter === "active" ? !blocked : blocked);
    return hit && roleOk && statusOk;
  }), [items, query, roleFilter, statusFilter]);

  useEffect(() => {
    setCustomerListPage(1);
  }, [query, roleFilter, statusFilter, viewMode]);

  const customerStats = useMemo(() => {
    const total = items.length;
    const active = items.filter((c) => !c.blocked).length;
    const ordersTotal = items.reduce((sum, c) => sum + (c.order_count || 0), 0);
    const zeroOrders = items.filter((c) => !(c.order_count || 0)).length;
    const rate = total > 0 ? Math.round((active / total) * 100) : 0;
    return { total, active, ordersTotal, zeroOrders, rate };
  }, [items]);

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

  const customerTotalPages = Math.max(1, Math.ceil(sortedCustomers.length / CUSTOMER_PAGE_SIZE));
  const effectiveCustomerPage = Math.min(customerListPage, customerTotalPages);
  const customerPageStart = (effectiveCustomerPage - 1) * CUSTOMER_PAGE_SIZE;
  const paginatedCustomers = sortedCustomers.slice(customerPageStart, customerPageStart + CUSTOMER_PAGE_SIZE);
  const customerPaginationPages = useMemo(
    () => buildPaginationPages(effectiveCustomerPage, customerTotalPages),
    [effectiveCustomerPage, customerTotalPages],
  );

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
        className={cn(
          "inline-flex items-center gap-1.5 font-inherit bg-transparent border-0 p-0 cursor-pointer transition-colors",
          active ? "text-[var(--accent)]" : "text-[var(--text-subtle)] hover:text-[var(--text-main)]",
        )}
      >
        <span>{label}</span>
        {active ? (dir === "asc" ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />) : <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-70" />}
      </button>
    );
  }

  const fromIdx = sortedCustomers.length === 0 ? 0 : customerPageStart + 1;
  const toIdx = Math.min(customerPageStart + CUSTOMER_PAGE_SIZE, sortedCustomers.length);
  const paginationInfo = t(lang, "customers.pagination.showing")
    .replace("{{from}}", String(fromIdx))
    .replace("{{to}}", String(toIdx))
    .replace("{{total}}", String(sortedCustomers.length));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="cust-page-header-title">
            {viewMode === "contacts" ? t(lang, "customers.titleContacts") : t(lang, "customers.title")}
          </h1>
          <p className="cust-page-header-sub">
            {viewMode === "contacts" ? t(lang, "customers.descriptionContacts") : t(lang, "customers.description")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateContactDialogOpen(true)}
          className="cust-btn-new shrink-0 self-start"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
          <span className="hidden sm:inline">
            {viewMode === "contacts" ? t(lang, "customers.button.newContact") : t(lang, "customers.button.newCustomer")}
          </span>
          <span className="sm:hidden">+</span>
        </button>
      </div>

      {viewMode === "customers" ? (
        <div className="cust-stats-row">
          <div className="cust-stat-card relative">
            <div className="cust-stat-label">{t(lang, "customers.stats.total")}</div>
            <div className="cust-stat-value">{customerStats.total}</div>
            <div className="cust-stat-delta cust-stat-delta--muted">—</div>
            <div className="cust-stat-icon" aria-hidden>
              <Users className="h-5 w-5" strokeWidth={1.5} />
            </div>
          </div>
          <div className="cust-stat-card relative">
            <div className="cust-stat-label">{t(lang, "customers.stats.active")}</div>
            <div className="cust-stat-value">{customerStats.active}</div>
            <div className="cust-stat-delta">
              {t(lang, "customers.stats.activeRate").replace("{{n}}", String(customerStats.rate))}
            </div>
            <div className="cust-stat-icon" aria-hidden>
              <CheckCircle2 className="h-5 w-5" strokeWidth={1.5} />
            </div>
          </div>
          <div className="cust-stat-card relative">
            <div className="cust-stat-label">{t(lang, "customers.stats.ordersTotal")}</div>
            <div className="cust-stat-value">{customerStats.ordersTotal}</div>
            <div className="cust-stat-delta cust-stat-delta--muted">—</div>
            <div className="cust-stat-icon" aria-hidden>
              <ShoppingBag className="h-5 w-5" strokeWidth={1.5} />
            </div>
          </div>
          <div className="cust-stat-card relative">
            <div className="cust-stat-label">{t(lang, "customers.stats.zeroOrders")}</div>
            <div className="cust-stat-value">{customerStats.zeroOrders}</div>
            <div className="cust-stat-delta cust-stat-delta--muted">{t(lang, "customers.stats.zeroOrdersHint")}</div>
            <div className="cust-stat-icon" aria-hidden>
              <PackageX className="h-5 w-5" strokeWidth={1.5} />
            </div>
          </div>
        </div>
      ) : null}

      <div className="cust-tab-row" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === "customers"}
          className={`cust-tab ${viewMode === "customers" ? "active" : ""}`}
          onClick={() => {
            setViewMode("customers");
            setQuery("");
          }}
        >
          <Building2 className="h-[13px] w-[13px]" strokeWidth={1.8} />
          {t(lang, "customers.view.customers")}
          <span className={viewMode === "customers" ? "cust-tab-count" : "cust-tab-count cust-tab-count--neutral"}>{items.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === "contacts"}
          className={`cust-tab ${viewMode === "contacts" ? "active" : ""}`}
          onClick={() => {
            setViewMode("contacts");
            setQuery("");
          }}
        >
          <User className="h-[13px] w-[13px]" strokeWidth={1.8} />
          {t(lang, "customers.view.contacts")}
          <span className={viewMode === "contacts" ? "cust-tab-count" : "cust-tab-count cust-tab-count--neutral"}>{allContacts.length}</span>
        </button>
      </div>

      {viewMode === "customers" ? (
        <div className="cust-toolbar">
          <div className="cust-search-wrap">
            <Search className="h-[13px] w-[13px]" strokeWidth={2} aria-hidden />
            <input
              type="search"
              autoComplete="off"
              className="cust-search-input"
              placeholder={t(lang, "customers.placeholder.search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            className="cust-filter-select"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            aria-label={t(lang, "customers.filter.allRoles")}
          >
            <option value="all">{t(lang, "customers.filter.allRoles")}</option>
            <option value="admin">{t(lang, "customers.filter.adminOnly")}</option>
            <option value="customer">{t(lang, "customers.filter.customersOnly")}</option>
          </select>
          <select
            className="cust-filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
            aria-label={t(lang, "customers.filter.allStatus")}
          >
            <option value="all">{t(lang, "customers.filter.allStatus")}</option>
            <option value="active">{t(lang, "customers.filter.statusActive")}</option>
            <option value="inactive">{t(lang, "customers.filter.statusInactive")}</option>
          </select>
          <div className="cust-toolbar-right">
            <span className="cust-count-badge">
              <span>{filtered.length}</span> {t(lang, "customers.label.hitWord")}
            </span>
          </div>
        </div>
      ) : (
        <div className="cust-toolbar">
          <div className="cust-search-wrap">
            <Search className="h-[13px] w-[13px]" strokeWidth={2} aria-hidden />
            <input
              type="search"
              autoComplete="off"
              className="cust-search-input"
              placeholder={t(lang, "customers.placeholder.searchContacts")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="cust-toolbar-right">
            <span className="cust-count-badge">
              <span>{filteredContacts.length}</span> {t(lang, "customers.label.hitWord")}
            </span>
          </div>
        </div>
      )}

      {contactSuccess ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
          {contactSuccess}
        </div>
      ) : null}

      {/* Customer List / Contacts List */}
      {viewMode === "customers" ? (
        <>
          <CustomerList
            items={paginatedCustomers}
            onEdit={setSelectedContactRecord}
            onToggleBlocked={toggleBlocked}
            onView={setViewCustomer}
            onOpenAsCustomer={async (c) => {
              try {
                const data = await getCustomerImpersonateUrl(token, c.id);
                if (data?.url) window.open(data.url, "_blank", "noopener");
              } catch {
                /* ignore impersonation errors */
              }
            }}
            onAddContact={openQuickContact}
            onMerge={(c) => setMergeKeepCustomer(c)}
            sortKey={customerSortKey}
            sortDir={customerSortDir}
            onSort={toggleCustomerSort}
          />
          {sortedCustomers.length > 0 ? (
            <div className="cust-pagination">
              <span className="cust-page-info">{paginationInfo}</span>
              <div className="cust-page-btns">
                <button
                  type="button"
                  className="cust-page-btn"
                  disabled={effectiveCustomerPage <= 1}
                  onClick={() => setCustomerListPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page"
                >
                  ‹
                </button>
                {customerPaginationPages.map((entry, i) =>
                  entry === "ellipsis" ? (
                    <span key={`e-${i}`} className="cust-page-btn border-0 cursor-default text-[var(--text-subtle)]" aria-hidden>
                      …
                    </span>
                  ) : (
                    <button
                      key={entry}
                      type="button"
                      className={`cust-page-btn ${entry === effectiveCustomerPage ? "active" : ""}`}
                      onClick={() => setCustomerListPage(entry)}
                    >
                      {entry}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  className="cust-page-btn"
                  disabled={effectiveCustomerPage >= customerTotalPages}
                  onClick={() => setCustomerListPage((p) => Math.min(customerTotalPages, p + 1))}
                  aria-label="Next page"
                >
                  ›
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="cust-table-wrap overflow-hidden">
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
                <tr>
                  <th className={cn("cust-td-id tabular-nums whitespace-nowrap", contactSortKey === "contactId" && "cust-th-sorted")}>
                    {renderSortButton(t(lang, "customers.contacts.col.contactId"), contactSortKey === "contactId", contactSortDir, () => toggleContactSort("contactId"))}
                  </th>
                  <th className={cn("cust-td-id tabular-nums whitespace-nowrap", contactSortKey === "customerId" && "cust-th-sorted")}>
                    {renderSortButton(t(lang, "customers.contacts.col.customerId"), contactSortKey === "customerId", contactSortDir, () => toggleContactSort("customerId"))}
                  </th>
                  <th className={cn(contactSortKey === "name" && "cust-th-sorted")}>
                    {renderSortButton(t(lang, "customers.contacts.col.name"), contactSortKey === "name", contactSortDir, () => toggleContactSort("name"))}
                  </th>
                  <th className={cn(contactSortKey === "contact" && "cust-th-sorted")}>
                    {renderSortButton(t(lang, "customers.contacts.col.contact"), contactSortKey === "contact", contactSortDir, () => toggleContactSort("contact"))}
                  </th>
                  <th className={cn(contactSortKey === "customer" && "cust-th-sorted")}>
                    {renderSortButton(t(lang, "customers.contacts.col.firm"), contactSortKey === "customer", contactSortDir, () => toggleContactSort("customer"))}
                  </th>
                  <th className={cn(contactSortKey === "role" && "cust-th-sorted")}>
                    {renderSortButton(t(lang, "customers.label.role"), contactSortKey === "role", contactSortDir, () => toggleContactSort("role"))}
                  </th>
                  <th className="text-right pr-5">{t(lang, "common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {sortedContacts.map((ct) => (
                  <tr
                    key={`contact-${ct.id}`}
                    className="cursor-pointer transition-colors"
                    onClick={() => {
                      const parent = items.find((c) => c.id === (ct.customer_id ?? 0));
                      if (parent) setSelectedContactRecord(parent);
                    }}
                  >
                    <td className="cust-td-id whitespace-nowrap">{ct.id}</td>
                    <td className="cust-td-id whitespace-nowrap">{ct.customer_id ?? "—"}</td>
                    <td>
                      <div className="cust-customer-cell">
                        <User className="h-3.5 w-3.5 shrink-0 text-[var(--text-subtle)]" strokeWidth={1.8} />
                        <span className="cust-customer-name truncate">{[ct.first_name, ct.last_name].filter(Boolean).join(" ").trim() || ct.name || "-"}</span>
                      </div>
                    </td>
                    <td className="cust-td-address">
                      {ct.email ? (
                        <a
                          href={`mailto:${ct.email}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1.5 text-[length:12px] text-[var(--text-muted)] p-hover-accent transition-colors w-fit max-w-full"
                        >
                          <Mail className="h-3.5 w-3.5 shrink-0 text-[var(--text-subtle)]" />
                          <span className="truncate">{ct.email}</span>
                        </a>
                      ) : null}
                      {ct.phone ? (
                        <span onClick={(e) => e.stopPropagation()} className="mt-0.5 flex items-center gap-1.5 text-[length:12px] text-[var(--text-muted)] w-fit max-w-full">
                          <Phone className="h-3.5 w-3.5 shrink-0 text-[var(--text-subtle)]" />
                          <PhoneLink value={ct.phone} className="p-hover-accent truncate" />
                        </span>
                      ) : null}
                      {!ct.email && !ct.phone ? <span className="text-[length:12px] text-[var(--text-subtle)]">-</span> : null}
                    </td>
                    <td className="cust-td-address">
                      {ct.customer_id ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const parent = items.find((c) => c.id === ct.customer_id);
                            if (parent) setSelectedContactRecord(parent);
                          }}
                          className="flex max-w-full items-center gap-1.5 text-left text-[length:12px] text-[var(--text-muted)] p-hover-accent transition-colors"
                          title={t(lang, "customers.contacts.openCustomer")}
                        >
                          <Building2 className="h-3.5 w-3.5 shrink-0 text-[var(--text-subtle)]" />
                          <span className="truncate">
                            {ct.customer_company || ct.customer_name || items.find((c) => c.id === ct.customer_id)?.company || items.find((c) => c.id === ct.customer_id)?.name || "-"}
                          </span>
                        </button>
                      ) : (
                        <span className="text-[length:12px] text-[var(--text-subtle)]">{t(lang, "customers.contacts.unlinked")}</span>
                      )}
                    </td>
                    <td className="cust-td-address">
                      <span className="cust-td-address-line block max-w-full">{ct.role || "-"}</span>
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openLinkDialog(ct);
                        }}
                        className="rounded-md border border-[var(--border-soft)] bg-transparent px-2.5 py-1.5 text-xs font-medium text-[var(--text-main)] transition-colors hover:bg-[var(--surface-raised)]"
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

