import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Filter, Loader2, Plug, RefreshCcw, Save, Search, SkipForward, UserPlus2 } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { t } from "../i18n";
import { formatPhoneCH } from "../lib/format";
import { PhoneLink } from "../components/ui/PhoneLink";
import { loadExxasConfig, loadExxasConfigMerged, type ExxasMappingConfig } from "../api/exxas";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import {
  confirmExxasReconciliation,
  previewExxasReconciliation,
  type ExxasConfirmDecision,
  type ExxasConfirmResponse,
  type LocalContactIndexEntry,
  type ExxasPreviewItem,
  type ExxasPreviewResponse,
  type LocalCustomerIndexEntry,
} from "../api/exxasReconcile";

type CustomerAction = "link_existing" | "create_customer" | "skip";
type ContactAction = "link_existing" | "create_contact" | "skip";

type ContactState = {
  action: ContactAction;
  localContactId: number | null;
  overwriteFields: string[];
};

type ItemState = {
  customerAction: CustomerAction;
  localCustomerId: number | null;
  overwriteCustomerFields: string[];
  contacts: Record<string, ContactState>;
};

type FilterMode = "all" | "selected" | "ready" | "needs_review" | "reconciled" | "not_reconciled";

function initialStateForItem(item: ExxasPreviewItem): ItemState {
  const contacts: Record<string, ContactState> = {};
  for (const c of item.contactSuggestions) {
    contacts[c.exxasContact.id] = {
      action: c.reviewRequired ? "skip" : c.suggestedAction,
      localContactId: c.suggestedLocalContactId,
      overwriteFields: [],
    };
  }
  return {
    customerAction: item.customerReviewRequired ? "skip" : item.suggestedCustomerAction,
    localCustomerId: item.suggestedLocalCustomerId,
    overwriteCustomerFields: [],
    contacts,
  };
}

function confidenceLabel(value: number): string {
  const pct = Math.round(value * 100);
  if (pct >= 80) return `${pct}% (stark)`;
  if (pct >= 60) return `${pct}% (mittel)`;
  return `${pct}% (niedrig)`;
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

function buildDecisionForItem(item: ExxasPreviewItem, state: ItemState): ExxasConfirmDecision {
  return {
    exxasCustomer: item.exxasCustomer,
    customerAction: state.customerAction,
    localCustomerId: state.localCustomerId,
    overwriteCustomerFields: state.overwriteCustomerFields,
    contactDecisions: item.contactSuggestions.map((contactItem) => {
      const contactState = state.contacts[contactItem.exxasContact.id] || {
        action: contactItem.suggestedAction,
        localContactId: contactItem.suggestedLocalContactId,
        overwriteFields: [],
      };
      return {
        exxasContact: contactItem.exxasContact,
        action: contactState.action,
        localContactId: contactState.localContactId,
        overwriteFields: contactState.overwriteFields,
      };
    }),
  };
}

function customerActionLabel(action: CustomerAction): string {
  if (action === "link_existing") return "Mit bestehendem Kunden verknuepfen";
  if (action === "create_customer") return "Neuen Kunden anlegen";
  return "Ueberspringen";
}

function contactActionLabel(action: ContactAction): string {
  if (action === "link_existing") return "Bestehenden Kontakt verknuepfen";
  if (action === "create_contact") return "Neuen Kontakt anlegen";
  return "Ueberspringen";
}

type ComparisonRow = {
  fieldKey?: string;
  label: string;
  exxas: string;
  local: string;
  exxasPresence: "present" | "missing";
  exxasPresenceLabel: string;
  status: "supplement" | "unchanged" | "same" | "new" | "empty" | "info" | "overwrite";
  statusLabel: string;
  canOverwrite: boolean;
  overwriteChecked: boolean;
  /** Rohwerte fuer klickbare `tel:`-Darstellung in den Vergleichsspalten. */
  phoneSources?: { exxas: unknown; local?: unknown };
};

function displayValue(value: unknown): string {
  const text = String(value ?? "").trim();
  return text || "-";
}

function normalizeCompareValue(value: string): string {
  return value.trim().toLowerCase();
}

function joinParts(...values: Array<unknown>): string {
  return values
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

function displayCustomerEmail(value: unknown): string {
  const text = String(value ?? "").trim();
  if (text.toLowerCase().endsWith("@company.local")) return "";
  return text;
}

function displayPhoneValue(value: unknown): string {
  const raw = String(value ?? "").trim();
  return formatPhoneCH(raw) || raw;
}

function makeComparisonRow(
  label: string,
  exxasRaw: unknown,
  localRaw: unknown,
  options?: {
    fieldKey?: string;
    overwriteChecked?: boolean;
    compareAsPhone?: boolean;
  }
): ComparisonRow {
  const compareAsPhone = Boolean(options?.compareAsPhone);
  const phoneExtra: Pick<ComparisonRow, "phoneSources"> = compareAsPhone
    ? { phoneSources: { exxas: exxasRaw, local: localRaw } }
    : {};
  const exxas = compareAsPhone ? displayValue(displayPhoneValue(exxasRaw)) : displayValue(exxasRaw);
  const local = compareAsPhone ? displayValue(displayPhoneValue(localRaw)) : displayValue(localRaw);
  const fieldKey = options?.fieldKey;
  const overwriteChecked = Boolean(options?.overwriteChecked);

  if (exxas === "-" && local === "-") {
    return {
      fieldKey,
      label,
      exxas,
      local,
      exxasPresence: "missing",
      exxasPresenceLabel: "kein EXXAS-Wert",
      status: "empty",
      statusLabel: "leer",
      canOverwrite: false,
      overwriteChecked: false,
      ...phoneExtra,
    };
  }
  if (exxas !== "-" && local === "-") {
    return {
      fieldKey,
      label,
      exxas,
      local,
      exxasPresence: "present",
      exxasPresenceLabel: "EXXAS vorhanden",
      status: "supplement",
      statusLabel: "wird ergänzt",
      canOverwrite: false,
      overwriteChecked: false,
      ...phoneExtra,
    };
  }
  if (exxas === "-" && local !== "-") {
    return {
      fieldKey,
      label,
      exxas,
      local,
      exxasPresence: "missing",
      exxasPresenceLabel: "kein EXXAS-Wert",
      status: "unchanged",
      statusLabel: "bleibt unverändert",
      canOverwrite: false,
      overwriteChecked: false,
      ...phoneExtra,
    };
  }
  if (normalizeCompareValue(exxas) === normalizeCompareValue(local)) {
    return {
      fieldKey,
      label,
      exxas,
      local,
      exxasPresence: "present",
      exxasPresenceLabel: "EXXAS vorhanden",
      status: "same",
      statusLabel: "gleich",
      canOverwrite: false,
      overwriteChecked: false,
      ...phoneExtra,
    };
  }
  return {
    fieldKey,
    label,
    exxas,
    local,
    exxasPresence: "present",
    exxasPresenceLabel: "EXXAS vorhanden",
    status: overwriteChecked ? "overwrite" : "unchanged",
    statusLabel: overwriteChecked ? "wird ueberschrieben" : "lokal schon belegt",
    canOverwrite: Boolean(fieldKey),
    overwriteChecked,
    ...phoneExtra,
  };
}

function makeCreateRow(label: string, exxasRaw: unknown, opts?: { phone?: boolean }): ComparisonRow {
  const exxas = opts?.phone ? displayValue(displayPhoneValue(exxasRaw)) : displayValue(exxasRaw);
  const phoneExtra: Pick<ComparisonRow, "phoneSources"> = opts?.phone
    ? { phoneSources: { exxas: exxasRaw } }
    : {};
  return {
    fieldKey: undefined,
    label,
    exxas,
    local: exxas === "-" ? "-" : "wird neu angelegt",
    exxasPresence: exxas === "-" ? "missing" : "present",
    exxasPresenceLabel: exxas === "-" ? "kein EXXAS-Wert" : "EXXAS vorhanden",
    status: exxas === "-" ? "empty" : "new",
    statusLabel: exxas === "-" ? "leer" : "wird angelegt",
    canOverwrite: false,
    overwriteChecked: false,
    ...phoneExtra,
  };
}

function makeInfoRow(label: string, exxasRaw: unknown, localRaw: unknown): ComparisonRow {
  return {
    fieldKey: undefined,
    label,
    exxas: displayValue(exxasRaw),
    local: displayValue(localRaw),
    exxasPresence: displayValue(exxasRaw) === "-" ? "missing" : "present",
    exxasPresenceLabel: displayValue(exxasRaw) === "-" ? "kein EXXAS-Wert" : "EXXAS vorhanden",
    status: "info",
    statusLabel: "Info",
    canOverwrite: false,
    overwriteChecked: false,
  };
}

function statusBadgeClass(status: ComparisonRow["status"]): string {
  if (status === "supplement") return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
  if (status === "same") return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
  if (status === "new") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
  if (status === "overwrite") return "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300";
  if (status === "unchanged") return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
  if (status === "empty") return "bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400";
  return "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300";
}

function presenceBadgeClass(presence: ComparisonRow["exxasPresence"]): string {
  if (presence === "present") return "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300";
  return "bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400";
}

function buildCustomerComparisonRows(
  item: ExxasPreviewItem,
  localCandidate?: ExxasPreviewItem["customerSuggestions"][number],
  overwriteFields?: Set<string>,
): ComparisonRow[] {
  const local = localCandidate?.localCustomer;
  if (!localCandidate) {
    return [
      makeCreateRow("EXXAS Kunden-ID", item.exxasCustomer.exxasCustomerId),
      makeCreateRow("EXXAS Adress-ID", item.exxasCustomer.exxasAddressId),
      makeInfoRow("EXXAS Nummer", item.exxasCustomer.nummer, ""),
      makeCreateRow("Anrede", item.exxasCustomer.salutation),
      makeCreateRow("Vorname", item.exxasCustomer.firstName),
      makeCreateRow("Name / Firma", item.exxasCustomer.name),
      makeCreateRow("E-Mail", item.exxasCustomer.email),
      makeCreateRow("Telefon", item.exxasCustomer.phone, { phone: true }),
      makeCreateRow("Telefon 2", item.exxasCustomer.phone2, { phone: true }),
      makeCreateRow("Mobile", item.exxasCustomer.phoneMobile, { phone: true }),
      makeCreateRow("Strasse", item.exxasCustomer.street),
      makeCreateRow("Adresszusatz", item.exxasCustomer.addressAddon1),
      makeCreateRow("PLZ", item.exxasCustomer.zip),
      makeCreateRow("Ort", item.exxasCustomer.city),
      makeCreateRow("Land", item.exxasCustomer.country),
      makeCreateRow("Website", item.exxasCustomer.website),
      makeCreateRow("Notizen", item.exxasCustomer.notes),
      makeInfoRow(
        "Rechnungsadresse",
        joinParts(
          item.exxasCustomer.billingCompany,
          item.exxasCustomer.billingStreet,
          joinParts(item.exxasCustomer.billingZip, item.exxasCustomer.billingCity),
          item.exxasCustomer.billingCountry,
        ),
        "kein separates Feld im Kundenstamm",
      ),
    ];
  }
  return [
    makeComparisonRow("EXXAS Kunden-ID", item.exxasCustomer.exxasCustomerId, local?.exxas_customer_id),
    makeComparisonRow("EXXAS Adress-ID", item.exxasCustomer.exxasAddressId, local?.exxas_address_id),
    makeInfoRow("EXXAS Nummer / Lokale ID", item.exxasCustomer.nummer, local?.id),
    makeComparisonRow("Anrede", item.exxasCustomer.salutation, local?.salutation, { fieldKey: "salutation", overwriteChecked: overwriteFields?.has("salutation") }),
    makeComparisonRow("Vorname", item.exxasCustomer.firstName, local?.first_name, { fieldKey: "first_name", overwriteChecked: overwriteFields?.has("first_name") }),
    makeComparisonRow("Name / Firma", item.exxasCustomer.name, local ? local.company || local.name : "", { fieldKey: "company_or_name", overwriteChecked: overwriteFields?.has("company_or_name") }),
    makeComparisonRow("E-Mail", item.exxasCustomer.email, displayCustomerEmail(local?.email), { fieldKey: "email", overwriteChecked: overwriteFields?.has("email") }),
    makeComparisonRow("Telefon", item.exxasCustomer.phone, local?.phone, { fieldKey: "phone", overwriteChecked: overwriteFields?.has("phone"), compareAsPhone: true }),
    makeComparisonRow("Telefon 2", item.exxasCustomer.phone2, local?.phone_2, { fieldKey: "phone_2", overwriteChecked: overwriteFields?.has("phone_2"), compareAsPhone: true }),
    makeComparisonRow("Mobile", item.exxasCustomer.phoneMobile, local?.phone_mobile, { fieldKey: "phone_mobile", overwriteChecked: overwriteFields?.has("phone_mobile"), compareAsPhone: true }),
    makeComparisonRow("Strasse", item.exxasCustomer.street, local?.street, { fieldKey: "street", overwriteChecked: overwriteFields?.has("street") }),
    makeComparisonRow("Adresszusatz", item.exxasCustomer.addressAddon1, local?.address_addon_1, { fieldKey: "address_addon_1", overwriteChecked: overwriteFields?.has("address_addon_1") }),
    makeComparisonRow("PLZ", item.exxasCustomer.zip, local?.zip, { fieldKey: "zip", overwriteChecked: overwriteFields?.has("zip") }),
    makeComparisonRow("Ort", item.exxasCustomer.city, local?.city, { fieldKey: "city", overwriteChecked: overwriteFields?.has("city") }),
    makeComparisonRow("Land", item.exxasCustomer.country, local?.country, { fieldKey: "country", overwriteChecked: overwriteFields?.has("country") }),
    makeComparisonRow("Website", item.exxasCustomer.website, local?.website, { fieldKey: "website", overwriteChecked: overwriteFields?.has("website") }),
    makeComparisonRow("Notizen", item.exxasCustomer.notes, local?.notes, { fieldKey: "notes", overwriteChecked: overwriteFields?.has("notes") }),
    makeInfoRow(
      "Rechnungsadresse",
      joinParts(
        item.exxasCustomer.billingCompany,
        item.exxasCustomer.billingStreet,
        joinParts(item.exxasCustomer.billingZip, item.exxasCustomer.billingCity),
        item.exxasCustomer.billingCountry,
      ),
      "kein separates Feld im Kundenstamm",
    ),
  ];
}

function buildContactComparisonRows(
  contactItem: ExxasPreviewItem["contactSuggestions"][number],
  localCandidate?: ExxasPreviewItem["contactSuggestions"][number]["localCandidates"][number],
  overwriteFields?: Set<string>,
): ComparisonRow[] {
  const local = localCandidate?.localContact;
  const c = contactItem.exxasContact;
  if (!localCandidate) {
    return [
      makeCreateRow("EXXAS Kontakt-ID", c.id),
      makeInfoRow("Kunden-Referenz", c.customerRef, ""),
      makeCreateRow("Anrede", c.salutation),
      makeInfoRow("Briefanrede (EXXAS)", c.briefAnrede, ""),
      makeCreateRow("Vorname", c.firstName),
      makeCreateRow("Nachname", c.lastName),
      makeInfoRow("Suchname (EXXAS)", c.suchname, ""),
      makeCreateRow("Name", c.name),
      makeCreateRow("E-Mail", c.email),
      makeCreateRow("Direkt", c.phoneDirect || c.phone, { phone: true }),
      makeCreateRow("Mobile", c.phoneMobile, { phone: true }),
      makeCreateRow("Rolle", c.role),
      makeCreateRow("Abteilung", c.department),
      makeInfoRow("Details / Notizen (EXXAS)", c.details, "kein lokales Feld"),
    ];
  }
  return [
    makeComparisonRow("EXXAS Kontakt-ID", c.id, local?.exxas_contact_id),
    makeInfoRow("Kunden-Referenz / Lokaler Kunde", c.customerRef, local?.customer_id),
    makeComparisonRow("Anrede", c.salutation, local?.salutation, { fieldKey: "salutation", overwriteChecked: overwriteFields?.has("salutation") }),
    makeInfoRow("Briefanrede (EXXAS)", c.briefAnrede, "kein lokales Feld"),
    makeComparisonRow("Vorname", c.firstName, local?.first_name, { fieldKey: "first_name", overwriteChecked: overwriteFields?.has("first_name") }),
    makeComparisonRow("Nachname", c.lastName, local?.last_name, { fieldKey: "last_name", overwriteChecked: overwriteFields?.has("last_name") }),
    makeInfoRow("Suchname (EXXAS)", c.suchname, "kein lokales Feld"),
    makeComparisonRow("Name", c.name, local?.name, { fieldKey: "name", overwriteChecked: overwriteFields?.has("name") }),
    makeComparisonRow("E-Mail", c.email, local?.email, { fieldKey: "email", overwriteChecked: overwriteFields?.has("email") }),
    makeComparisonRow("Direkt", c.phoneDirect || c.phone, local?.phone_direct || local?.phone, { fieldKey: "phone", overwriteChecked: overwriteFields?.has("phone"), compareAsPhone: true }),
    makeComparisonRow("Mobile", c.phoneMobile, local?.phone_mobile, { fieldKey: "phone_mobile", overwriteChecked: overwriteFields?.has("phone_mobile"), compareAsPhone: true }),
    makeComparisonRow("Rolle", c.role, local?.role, { fieldKey: "role", overwriteChecked: overwriteFields?.has("role") }),
    makeComparisonRow("Abteilung", c.department, local?.department, { fieldKey: "department", overwriteChecked: overwriteFields?.has("department") }),
    makeInfoRow("Details / Notizen (EXXAS)", c.details, "kein lokales Feld"),
  ];
}

function comparisonPhoneCell(fallbackText: string, raw: unknown) {
  const s = String(raw ?? "").trim();
  if (!s) return fallbackText;
  return <PhoneLink value={s} className="text-[#C5A059]" />;
}

function ComparisonTable({
  rows,
  localTitle,
  onToggleOverwrite,
}: {
  rows: ComparisonRow[];
  localTitle: string;
  onToggleOverwrite?: (fieldKey: string, next: boolean) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-zinc-800">
      <div className="grid grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)_180px] bg-slate-50 dark:bg-zinc-800/60 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
        <div className="px-3 py-2">Feld</div>
        <div className="border-l border-slate-200 px-3 py-2 dark:border-zinc-700">EXXAS</div>
        <div className="border-l border-slate-200 px-3 py-2 dark:border-zinc-700">{localTitle}</div>
        <div className="border-l border-slate-200 px-3 py-2 dark:border-zinc-700">EXXAS / Uebernahme</div>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-zinc-800">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)_180px] text-sm">
            <div className="px-3 py-2 font-medium text-slate-600 dark:text-zinc-300">{row.label}</div>
            <div className="border-l border-slate-100 px-3 py-2 text-slate-800 dark:text-zinc-100 dark:border-zinc-800 break-words">
              {row.phoneSources
                ? comparisonPhoneCell(row.exxas, row.phoneSources.exxas)
                : row.exxas}
            </div>
            <div className="border-l border-slate-100 px-3 py-2 text-slate-700 dark:text-zinc-300 dark:border-zinc-800 break-words">
              {row.phoneSources
                ? comparisonPhoneCell(row.local, row.phoneSources.local)
                : row.local}
            </div>
            <div className="border-l border-slate-100 px-3 py-2 dark:border-zinc-800">
              <div className="flex flex-wrap gap-1">
                <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-medium ${presenceBadgeClass(row.exxasPresence)}`}>
                  {row.exxasPresenceLabel}
                </span>
                <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-medium ${statusBadgeClass(row.status)}`}>
                  {row.statusLabel}
                </span>
              </div>
              {row.canOverwrite && row.fieldKey && onToggleOverwrite ? (
                <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-600 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={row.overwriteChecked}
                    onChange={(e) => onToggleOverwrite(row.fieldKey as string, e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Ueberschreiben
                </label>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EntitySearchInput({
  index,
  value,
  onChange,
  placeholder,
}: {
  index: Array<LocalCustomerIndexEntry | LocalContactIndexEntry>;
  value: number | null;
  onChange: (id: number | null) => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selected = value != null ? index.find((c) => c.id === value) : null;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const byId = /^\d+$/.test(q) ? index.filter((c) => String(c.id).includes(q)) : [];
    const byText = index.filter(
      (c) => c.label.toLowerCase().includes(q) || c.email.toLowerCase().includes(q),
    );
    const merged = new Map<number, LocalCustomerIndexEntry | LocalContactIndexEntry>();
    for (const c of [...byId, ...byText]) merged.set(c.id, c);
    return Array.from(merged.values()).slice(0, 12);
  }, [query, index]);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
  }, []);

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [handleClickOutside]);

  return (
    <div ref={wrapperRef} className="relative">
      <div className="flex items-center gap-1.5">
        <Search className="w-3.5 h-3.5 text-slate-400" />
        <input
          type="text"
          placeholder={placeholder}
          value={open ? query : selected ? `#${selected.id} ${selected.label}` : query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (selected) setQuery("");
            setOpen(true);
          }}
          className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
        />
        {value != null && (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setQuery("");
            }}
            className="text-xs text-slate-400 hover:text-red-500"
            title="Auswahl aufheben"
          >
            &times;
          </button>
        )}
      </div>
      {open && query.trim().length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-52 overflow-auto rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg">
          {results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-400">Kein Treffer</div>
          ) : (
            results.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onChange(c.id);
                  setQuery("");
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-zinc-800 flex justify-between items-center"
              >
                <span className="truncate">
                  <span className="font-mono text-xs text-slate-400 mr-1">#{c.id}</span>
                  {c.label}
                </span>
                {c.email && <span className="text-xs text-slate-400 ml-2 truncate max-w-[180px]">{c.email}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function ExxasReconcilePage() {
  const token = useAuthStore((s) => s.token);
  const lang = useAuthStore((s) => s.language);

  const [preview, setPreview] = useState<ExxasPreviewResponse | null>(null);
  const [states, setStates] = useState<Record<string, ItemState>>({});
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmSummary, setConfirmSummary] = useState<string>("");
  const [confirmResult, setConfirmResult] = useState<ExxasConfirmResponse | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [singlePreviewItemId, setSinglePreviewItemId] = useState<string | null>(null);
  const [singleConfirmingId, setSingleConfirmingId] = useState<string | null>(null);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

  const config = useMemo<ExxasMappingConfig>(() => loadExxasConfig(), []);
  const hasCredentials = Boolean(config.apiKey && config.endpoint);

  function updateItemState(exxasCustomerId: string, updater: (current: ItemState) => ItemState) {
    setStates((current) => {
      const existing = current[exxasCustomerId];
      if (!existing) return current;
      return { ...current, [exxasCustomerId]: updater(existing) };
    });
  }

  function toggleCustomerOverwriteField(exxasCustomerId: string, fieldKey: string, next: boolean) {
    updateItemState(exxasCustomerId, (current) => {
      const set = new Set(current.overwriteCustomerFields);
      if (next) set.add(fieldKey);
      else set.delete(fieldKey);
      return { ...current, overwriteCustomerFields: Array.from(set) };
    });
  }

  function toggleContactOverwriteField(exxasCustomerId: string, exxasContactId: string, fieldKey: string, next: boolean) {
    updateItemState(exxasCustomerId, (current) => {
      const contactState = current.contacts[exxasContactId] || { action: "skip" as ContactAction, localContactId: null, overwriteFields: [] };
      const set = new Set(contactState.overwriteFields);
      if (next) set.add(fieldKey);
      else set.delete(fieldKey);
      return {
        ...current,
        contacts: {
          ...current.contacts,
          [exxasContactId]: {
            ...contactState,
            overwriteFields: Array.from(set),
          },
        },
      };
    });
  }

  function isItemReady(item: ExxasPreviewItem, state: ItemState) {
    if (state.customerAction === "skip") return true;
    if (state.customerAction === "link_existing" && !state.localCustomerId) return false;
    for (const contactItem of item.contactSuggestions) {
      const contactState = state.contacts[contactItem.exxasContact.id];
      if (!contactState || contactState.action === "skip") continue;
      if (contactState.action === "link_existing" && !contactState.localContactId) return false;
    }
    return true;
  }

  function needsReview(item: ExxasPreviewItem) {
  if (item.reviewRequired || item.customerReviewRequired) return true;
    const bestCustomerScore = item.customerSuggestions[0]?.score ?? 0;
    if (bestCustomerScore < 60) return true;
  return item.contactSuggestions.some(
    (contact) => contact.reviewRequired || (contact.localCandidates[0]?.score ?? 0) < 70,
  );
  }

  /**
   * Bereits in der DB mit EXXAS verknuepft: lokaler Kunde traegt dieselbe exxas_customer_id,
   * und jeder gelistete EXXAS-Kontakt ist per exxas_contact_id am Top-Kandidaten erkennbar.
   * (Entspricht dem Zustand nach erfolgreichem Abgleich, solange der beste Kundentreffer der verknuepfte ist.)
   */
  function isAlreadyReconciled(item: ExxasPreviewItem): boolean {
    const top = item.customerSuggestions[0];
    if (!top) return false;
    const exxasCustId = String(item.exxasCustomer.exxasCustomerId || "").trim();
    const localExxasCustId = String(top.localCustomer.exxas_customer_id || "").trim();
    if (!exxasCustId || localExxasCustId !== exxasCustId) return false;

    if (item.contactSuggestions.length === 0) return true;

    for (const cs of item.contactSuggestions) {
      const exxasContId = String(cs.exxasContact.id || "").trim();
      if (!exxasContId) return false;
      const cTop = cs.localCandidates[0];
      if (!cTop) return false;
      if (String(cTop.localContact.exxas_contact_id || "").trim() !== exxasContId) return false;
    }
    return true;
  }

  function getItemIssues(item: ExxasPreviewItem, state: ItemState): string[] {
    const issues: string[] = [];
    if (state.customerAction === "link_existing" && !state.localCustomerId) {
      issues.push("Lokaler Zielkunde ist noch nicht ausgewaehlt.");
    }
    for (const contactItem of item.contactSuggestions) {
      const contactState = state.contacts[contactItem.exxasContact.id];
      if (!contactState || contactState.action === "skip") continue;
      if (contactState.action === "link_existing" && !contactState.localContactId) {
        issues.push(`Beim Kontakt "${contactItem.exxasContact.name || contactItem.exxasContact.email || "-"}" fehlt der lokale Zielkontakt.`);
      }
    }
    return issues;
  }

  function resolveLocalCustomerLabel(
    item: ExxasPreviewItem,
    previewData: ExxasPreviewResponse,
    localCustomerId: number | null,
  ): string {
    if (localCustomerId == null) return "nicht ausgewaehlt";
    const fromSuggestion = item.customerSuggestions.find((c) => c.localCustomerId === localCustomerId);
    if (fromSuggestion) {
      return `#${localCustomerId} ${fromSuggestion.localCustomer.company || fromSuggestion.localCustomer.name}`;
    }
    const fromIndex = previewData.localCustomerIndex?.find((e) => e.id === localCustomerId);
    if (fromIndex?.label) return `#${localCustomerId} ${fromIndex.label}`;
    return `#${localCustomerId} (manuell)`;
  }

  function summarizeContactDecisions(item: ExxasPreviewItem, state: ItemState): string {
    if (item.contactSuggestions.length === 0) return "Keine EXXAS-Kontakte.";
    return item.contactSuggestions
      .map((cs) => {
        const st = state.contacts[cs.exxasContact.id];
        const label = cs.exxasContact.name || cs.exxasContact.email || cs.exxasContact.id;
        if (!st || st.action === "skip") return `${label}: uebersprungen`;
        if (st.action === "create_contact") return `${label}: neuer Kontakt`;
        return `${label}: verknuepfen${st.localContactId != null ? ` -> #${st.localContactId}` : " (Ziel fehlt)"}`;
      })
      .join(" · ");
  }

  function pickDefaultLocalCustomerId(item: ExxasPreviewItem, current: ItemState): number | null {
    if (current.localCustomerId != null) return current.localCustomerId;
    if (item.suggestedLocalCustomerId != null) return item.suggestedLocalCustomerId;
    return item.customerSuggestions[0]?.localCustomerId ?? null;
  }

  function matchesSearch(item: ExxasPreviewItem, query: string) {
    if (!query) return true;
    const haystack = [
      item.exxasCustomer.nummer,
      item.exxasCustomer.name,
      item.exxasCustomer.email,
      item.exxasCustomer.street,
      item.exxasCustomer.zip,
      item.exxasCustomer.city,
      ...item.contactSuggestions.flatMap((contact) => [
        contact.exxasContact.name,
        contact.exxasContact.email,
        contact.exxasContact.department,
        contact.exxasContact.role,
      ]),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  }

  function toggleSelection(exxasCustomerId: string) {
    setSelectedIds((current) => ({
      ...current,
      [exxasCustomerId]: !current[exxasCustomerId],
    }));
  }

  function bulkSelectVisible(items: ExxasPreviewItem[], value: boolean) {
    setSelectedIds((current) => {
      const next = { ...current };
      for (const item of items) next[item.exxasCustomer.id] = value;
      return next;
    });
  }

  function applySuggestedToVisible(items: ExxasPreviewItem[]) {
    setStates((current) => {
      const next = { ...current };
      for (const item of items) {
        next[item.exxasCustomer.id] = initialStateForItem(item);
      }
      return next;
    });
  }

  function applyCustomerActionToVisible(items: ExxasPreviewItem[], action: CustomerAction) {
    setStates((current) => {
      const next = { ...current };
      for (const item of items) {
        const existing = next[item.exxasCustomer.id] || initialStateForItem(item);
        next[item.exxasCustomer.id] = {
          ...existing,
          customerAction: action,
          localCustomerId: action === "link_existing" ? existing.localCustomerId : null,
        };
      }
      return next;
    });
  }

  async function runPreview() {
    if (!token || !configReady) return;
    setLoading(true);
    setError("");
    setSuccess("");
    setConfirmSummary("");
    setConfirmResult(null);
    try {
      const response = await previewExxasReconciliation(token, {
        apiKey: config.apiKey,
        appPassword: config.appPassword,
        endpoint: config.endpoint,
        authMode: config.authMode,
      });
      const nextStates: Record<string, ItemState> = {};
      for (const item of response.items) {
        nextStates[item.exxasCustomer.id] = initialStateForItem(item);
      }
      setPreview(response);
      setStates(nextStates);
      setSelectedIds(
        Object.fromEntries(response.items.map((item) => [item.exxasCustomer.id, true]))
      );
      setSuccess(`${response.items.length} Vorschlaege geladen.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview fehlgeschlagen.");
      setPreview(null);
      setStates({});
    } finally {
      setLoading(false);
    }
  }

  async function runConfirm(): Promise<boolean> {
    if (!token || !preview) return false;
    setConfirming(true);
    setError("");
    setSuccess("");
    setConfirmSummary("");
    setConfirmResult(null);
    try {
      const activeItems = preview.items.filter((item) => selectedIds[item.exxasCustomer.id]);
      const decisions: ExxasConfirmDecision[] = activeItems.map((item) =>
        buildDecisionForItem(item, states[item.exxasCustomer.id] || initialStateForItem(item))
      );
      const result = await confirmExxasReconciliation(token, decisions);
      setSuccess("Bestaetigungen verarbeitet.");
      setConfirmSummary(
        `${result.summary.success}/${result.summary.total} erfolgreich, ${result.summary.failed} fehlgeschlagen.`
      );
      setConfirmResult(result);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bestaetigung fehlgeschlagen.");
      return false;
    } finally {
      setConfirming(false);
    }
  }

  async function handleBulkConfirmExecute() {
    const ok = await runConfirm();
    if (ok) setBulkConfirmOpen(false);
  }

  async function runSingleConfirm(item: ExxasPreviewItem) {
    if (!token) return;
    const state = states[item.exxasCustomer.id] || initialStateForItem(item);
    setSingleConfirmingId(item.exxasCustomer.id);
    setConfirming(true);
    setError("");
    setSuccess("");
    setConfirmSummary("");
    setConfirmResult(null);
    try {
      const result = await confirmExxasReconciliation(token, [buildDecisionForItem(item, state)]);
      setSuccess(`Vorschlag ${item.exxasCustomer.nummer || item.exxasCustomer.id} verarbeitet.`);
      setConfirmSummary(
        `${result.summary.success}/${result.summary.total} erfolgreich, ${result.summary.failed} fehlgeschlagen.`
      );
      setConfirmResult(result);
      setSinglePreviewItemId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Einzelabgleich fehlgeschlagen.");
    } finally {
      setSingleConfirmingId(null);
      setConfirming(false);
    }
  }

  const visibleItems = useMemo(() => {
    const items = preview?.items || [];
    const query = normalizeSearch(searchQuery);
    return items.filter((item) => {
      const state = states[item.exxasCustomer.id] || initialStateForItem(item);
      if (!matchesSearch(item, query)) return false;
      if (filterMode === "selected") return !!selectedIds[item.exxasCustomer.id];
      if (filterMode === "ready") return isItemReady(item, state);
      if (filterMode === "needs_review") return needsReview(item) || !isItemReady(item, state);
      if (filterMode === "reconciled") return isAlreadyReconciled(item);
      if (filterMode === "not_reconciled") return !isAlreadyReconciled(item);
      return true;
    });
  }, [filterMode, preview?.items, searchQuery, selectedIds, states]);

  const selectedCount = useMemo(
    () => Object.values(selectedIds).filter(Boolean).length,
    [selectedIds]
  );
  const readyCount = useMemo(
    () => (preview?.items || []).filter((item) => isItemReady(item, states[item.exxasCustomer.id] || initialStateForItem(item))).length,
    [preview?.items, states]
  );
  const reviewCount = useMemo(
    () => (preview?.items || []).filter((item) => needsReview(item)).length,
    [preview?.items]
  );
  const reconciledCount = useMemo(
    () => (preview?.items || []).filter((item) => isAlreadyReconciled(item)).length,
    [preview?.items]
  );
  const notReconciledCount = useMemo(() => {
    const total = preview?.items?.length ?? 0;
    return Math.max(0, total - reconciledCount);
  }, [preview?.items, reconciledCount]);
  const singlePreviewItem = useMemo(
    () => preview?.items.find((item) => item.exxasCustomer.id === singlePreviewItemId) || null,
    [preview?.items, singlePreviewItemId]
  );
  const singlePreviewState = singlePreviewItem
    ? states[singlePreviewItem.exxasCustomer.id] || initialStateForItem(singlePreviewItem)
    : null;
  const singlePreviewIssues = singlePreviewItem && singlePreviewState
    ? getItemIssues(singlePreviewItem, singlePreviewState)
    : [];

  const bulkSelectedItems = useMemo(() => {
    if (!preview) return [];
    return preview.items.filter((item) => selectedIds[item.exxasCustomer.id]);
  }, [preview, selectedIds]);

  const bulkConfirmBlocked = useMemo(
    () =>
      bulkSelectedItems.some((item) => {
        const state = states[item.exxasCustomer.id] || initialStateForItem(item);
        return !isItemReady(item, state);
      }),
    [bulkSelectedItems, states],
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-zinc-100">{t(lang, "nav.exxasReconcile")}</h1>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
            Vorschlaege werden zuerst berechnet. Gespeichert wird nur, was du manuell bestaetigst.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={runPreview}
            disabled={!hasCredentials || loading || confirming}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-medium text-slate-700 dark:text-zinc-200 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            Preview laden
          </button>
          <button
            type="button"
            onClick={() => setBulkConfirmOpen(true)}
            disabled={!preview || confirming || loading || selectedCount === 0}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#C5A059] text-white text-sm font-semibold disabled:opacity-50"
          >
            {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Bestaetigen
          </button>
        </div>
      </div>

      {!hasCredentials ? (
        <div className="rounded-xl border border-amber-300/60 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-800 dark:text-amber-200">
          Bitte zuerst API-Key und Endpoint in den EXXAS-Einstellungen hinterlegen.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-300/60 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-xl border border-green-300/60 bg-green-50 dark:bg-green-900/20 p-4 text-sm text-green-700 dark:text-green-200 inline-flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          {success}
          {confirmSummary ? <span className="font-medium">{confirmSummary}</span> : null}
        </div>
      ) : null}

      {preview ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 text-sm text-slate-600 dark:text-zinc-300">
            Quelle: <span className="font-mono">{preview.source}</span> | EXXAS Kunden: {preview.stats.exxasCustomers} |
            EXXAS Kontakte: {preview.stats.exxasContacts} | Ausgewaehlt: {selectedCount} | Bereit: {readyCount} | Pruefen:{" "}
            {reviewCount} | Abgeglichen: {reconciledCount} | Noch nicht abgeglichen: {notReconciledCount}
          </div>
          <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Filter className="h-4 w-4 text-slate-500 dark:text-zinc-400" />
              <span className="font-medium text-slate-700 dark:text-zinc-200">Filter</span>
              {([
                ["all", "Alle"],
                ["selected", "Ausgewaehlt"],
                ["ready", "Bereit"],
                ["needs_review", "Pruefen"],
                ["reconciled", "Abgeglichen"],
                ["not_reconciled", "Noch nicht abgeglichen"],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilterMode(key)}
                  className={`px-3 py-1.5 rounded-full border text-xs font-medium ${
                    filterMode === key
                      ? "border-[#C5A059] bg-[#C5A059] text-white"
                      : "border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Suche nach Kunde, E-Mail, Nummer, Kontakt ..."
                className="w-full rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 py-2 pl-9 pr-3 text-sm text-slate-700 dark:text-zinc-200"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => bulkSelectVisible(visibleItems, true)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 text-sm"
              >
                Sichtbare auswaehlen
              </button>
              <button
                type="button"
                onClick={() => bulkSelectVisible(visibleItems, false)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 text-sm"
              >
                Sichtbare abwaehlen
              </button>
              <button
                type="button"
                onClick={() => applySuggestedToVisible(visibleItems)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 text-sm"
              >
                Vorschlaege fuer sichtbare uebernehmen
              </button>
              <button
                type="button"
                onClick={() => applyCustomerActionToVisible(visibleItems, "skip")}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 text-sm"
              >
                Sichtbare Kunden auf Ueberspringen
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-4">
        {visibleItems.map((item) => {
          const state = states[item.exxasCustomer.id] || initialStateForItem(item);
          const isLinkMode = state.customerAction === "link_existing";
          const itemReady = isItemReady(item, state);
          const itemNeedsReview = needsReview(item);
          const itemReconciled = isAlreadyReconciled(item);
          return (
            <div key={item.exxasCustomer.id} className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-zinc-800">
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!selectedIds[item.exxasCustomer.id]}
                      onChange={() => toggleSelection(item.exxasCustomer.id)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <Plug className="h-4 w-4 text-[#C5A059]" />
                    <h3 className="font-semibold text-slate-900 dark:text-zinc-100">{item.exxasCustomer.name || "-"}</h3>
                    <span className="text-xs text-slate-500 dark:text-zinc-400 font-mono">#{item.exxasCustomer.nummer}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSinglePreviewItemId(item.exxasCustomer.id)}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-zinc-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-zinc-200"
                    >
                      Abgleichen
                    </button>
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        itemReady
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                      }`}
                    >
                      {itemReady ? "bereit" : "unvollstaendig"}
                    </span>
                    {itemNeedsReview ? (
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300">
                        manuell pruefen
                      </span>
                    ) : null}
                    {itemReconciled ? (
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-cyan-100 text-cyan-800 dark:bg-cyan-900/35 dark:text-cyan-200">
                        abgeglichen
                      </span>
                    ) : null}
                  </div>
                </div>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                  {item.exxasCustomer.email || "keine E-Mail"} | {item.exxasCustomer.street || "-"}{" "}
                  {item.exxasCustomer.zip || ""} {item.exxasCustomer.city || ""}
                </p>
              </div>

              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="text-xs uppercase tracking-wide text-slate-500 dark:text-zinc-400">Kunden-Aktion</label>
                  <select
                    value={state.customerAction}
                    onChange={(e) => {
                      const next = e.target.value as CustomerAction;
                      updateItemState(item.exxasCustomer.id, (current) => ({ ...current, customerAction: next }));
                    }}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
                  >
                    <option value="link_existing">Mit bestehendem Kunden verknuepfen</option>
                    <option value="create_customer">Neuen Kunden anlegen</option>
                    <option value="skip">Ueberspringen</option>
                  </select>
                </div>

                {isLinkMode ? (
                  <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wide text-slate-500 dark:text-zinc-400">
                      Lokaler Zielkunde
                    </label>
                    {item.customerSuggestions.length > 0 && (
                      <select
                        value={
                          item.customerSuggestions.some((c) => c.localCustomerId === state.localCustomerId)
                            ? (state.localCustomerId ?? "")
                            : ""
                        }
                        onChange={(e) => {
                          const next = e.target.value ? Number(e.target.value) : null;
                          updateItemState(item.exxasCustomer.id, (current) => ({ ...current, localCustomerId: next }));
                        }}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
                      >
                        <option value="">-- Vorschlaege --</option>
                        {item.customerSuggestions.map((candidate) => (
                          <option key={candidate.localCustomerId} value={candidate.localCustomerId}>
                            #{candidate.localCustomerId} {candidate.localCustomer.company || candidate.localCustomer.name} (
                            {confidenceLabel(candidate.confidence)})
                          </option>
                        ))}
                      </select>
                    )}
                    {preview?.localCustomerIndex?.length ? (
                      <EntitySearchInput
                        index={preview.localCustomerIndex}
                        value={
                          !item.customerSuggestions.some((c) => c.localCustomerId === state.localCustomerId)
                            ? state.localCustomerId
                            : null
                        }
                        placeholder="Kunden suchen (Name, E-Mail oder ID)"
                        onChange={(id) =>
                          updateItemState(item.exxasCustomer.id, (current) => ({ ...current, localCustomerId: id }))
                        }
                      />
                    ) : null}
                    {item.customerSuggestions.map((candidate) => (
                      <div key={candidate.localCustomerId} className="text-xs text-slate-500 dark:text-zinc-400">
                        #{candidate.localCustomerId}: {candidate.localCustomer.company || candidate.localCustomer.name} -{" "}
                        {candidate.reasons.join(", ") || "keine Gruende"} - {confidenceLabel(candidate.confidence)}
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
                  <div className="px-4 py-2 bg-slate-50 dark:bg-zinc-800/60 text-xs uppercase tracking-wide text-slate-500 dark:text-zinc-400">
                    Kontakte
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                    {item.contactSuggestions.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-slate-500 dark:text-zinc-400">Keine EXXAS-Kontakte gefunden.</div>
                    ) : (
                      item.contactSuggestions.map((contactItem) => {
                        const contactState = state.contacts[contactItem.exxasContact.id];
                        const activeCustomerId = state.localCustomerId;
                        const byCustomerIndex =
                          activeCustomerId != null
                            ? preview?.localContactIndexByCustomer?.[String(activeCustomerId)] || []
                            : [];
                        const candidateIndex = contactItem.localCandidates.map((candidate) => ({
                          id: candidate.localContactId,
                          label: String(candidate.localContact.name || "").trim(),
                          email: String(candidate.localContact.email || "").trim(),
                        }));
                        const mergedIndex = new Map<number, LocalContactIndexEntry>();
                        for (const entry of [...byCustomerIndex, ...candidateIndex]) {
                          mergedIndex.set(Number(entry.id), {
                            id: Number(entry.id),
                            label: String(entry.label || "").trim(),
                            email: String(entry.email || "").trim(),
                          });
                        }
                        const contactSearchIndex = Array.from(mergedIndex.values());
                        return (
                          <div key={contactItem.exxasContact.id} className="px-4 py-3 space-y-2">
                            <div className="text-sm text-slate-700 dark:text-zinc-200">
                              <span className="font-medium">{contactItem.exxasContact.name || "-"}</span>{" "}
                              <span className="text-slate-500 dark:text-zinc-400">{contactItem.exxasContact.email || ""}</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              <select
                                value={contactState?.action || "skip"}
                                onChange={(e) => {
                                  const next = e.target.value as ContactAction;
                                  updateItemState(item.exxasCustomer.id, (current) => ({
                                    ...current,
                                    contacts: {
                                      ...current.contacts,
                                      [contactItem.exxasContact.id]: {
                                        action: next,
                                        localContactId: current.contacts[contactItem.exxasContact.id]?.localContactId ?? null,
                                        overwriteFields: current.contacts[contactItem.exxasContact.id]?.overwriteFields ?? [],
                                      },
                                    },
                                  }));
                                }}
                                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
                              >
                                <option value="link_existing">Bestehenden Kontakt verknuepfen</option>
                                <option value="create_contact">Neuen Kontakt anlegen</option>
                                <option value="skip">Ueberspringen</option>
                              </select>
                              <div className="space-y-2">
                                <select
                                  value={
                                    contactItem.localCandidates.some((c) => c.localContactId === (contactState?.localContactId ?? null))
                                      ? (contactState?.localContactId ?? "")
                                      : ""
                                  }
                                  onChange={(e) => {
                                    const next = e.target.value ? Number(e.target.value) : null;
                                    updateItemState(item.exxasCustomer.id, (current) => ({
                                      ...current,
                                      contacts: {
                                        ...current.contacts,
                                        [contactItem.exxasContact.id]: {
                                          action: current.contacts[contactItem.exxasContact.id]?.action || "link_existing",
                                          localContactId: next,
                                          overwriteFields: current.contacts[contactItem.exxasContact.id]?.overwriteFields ?? [],
                                        },
                                      },
                                    }));
                                  }}
                                  className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
                                >
                                  <option value="">-- Kontakt waehlen --</option>
                                  {contactItem.localCandidates.map((candidate) => (
                                    <option key={candidate.localContactId} value={candidate.localContactId}>
                                      #{candidate.localContactId} {candidate.localContact.name || candidate.localContact.email} (
                                      {confidenceLabel(candidate.confidence)})
                                    </option>
                                  ))}
                                </select>
                                {contactSearchIndex.length > 0 ? (
                                  <EntitySearchInput
                                    index={contactSearchIndex}
                                    value={contactState?.localContactId ?? null}
                                    placeholder="Kontakt suchen (Name, E-Mail oder ID)"
                                    onChange={(id) => {
                                      updateItemState(item.exxasCustomer.id, (current) => ({
                                        ...current,
                                        contacts: {
                                          ...current.contacts,
                                          [contactItem.exxasContact.id]: {
                                            action: current.contacts[contactItem.exxasContact.id]?.action || "link_existing",
                                            localContactId: id,
                                            overwriteFields: current.contacts[contactItem.exxasContact.id]?.overwriteFields ?? [],
                                          },
                                        },
                                      }));
                                    }}
                                  />
                                ) : null}
                              </div>
                            </div>
                            {contactState?.localContactId != null &&
                              !contactSearchIndex.some((c) => c.id === contactState.localContactId) &&
                              !contactItem.localCandidates.some((c) => c.localContactId === contactState.localContactId) && (
                                <div className="text-xs text-amber-600 dark:text-amber-400">
                                  Manuell eingegebene Kontakt-ID #{contactState.localContactId} (nicht in Vorschlaegen)
                                </div>
                              )}
                            {contactItem.localCandidates.length > 0 ? (
                              <div className="text-xs text-slate-500 dark:text-zinc-400">
                                Beste Treffer: {contactItem.localCandidates
                                  .slice(0, 2)
                                  .map((candidate) => `#${candidate.localContactId} ${candidate.reasons.join(", ")} (${confidenceLabel(candidate.confidence)})`)
                                  .join(" | ")}
                              </div>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {confirmResult ? (
        <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-zinc-100">Letztes Ergebnis</h2>
            <p className="text-sm text-slate-500 dark:text-zinc-400">
              Erfolgreich: {confirmResult.summary.success}, Fehlgeschlagen: {confirmResult.summary.failed}
            </p>
          </div>
          <div className="space-y-3">
            {confirmResult.outcomes.map((outcome, index) => (
              <div
                key={`${outcome.exxasCustomerId || "unknown"}-${index}`}
                className={`rounded-xl border p-3 ${
                  outcome.ok
                    ? "border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-900/10"
                    : "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/10"
                }`}
              >
                <div className="text-sm font-medium text-slate-900 dark:text-zinc-100">
                  EXXAS Kunde: {outcome.exxasCustomerId || "-"}
                  {outcome.localCustomerId ? ` -> lokaler Kunde #${outcome.localCustomerId}` : ""}
                </div>
                <div className="text-xs text-slate-600 dark:text-zinc-300 mt-1">
                  {outcome.ok ? (outcome.skipped ? "Uebersprungen" : "Erfolgreich verarbeitet") : outcome.error}
                </div>
                {outcome.contactOutcomes?.length ? (
                  <div className="mt-2 space-y-1">
                    {outcome.contactOutcomes.map((contactOutcome, contactIndex) => (
                      <div key={`${contactOutcome.exxasContactId || "contact"}-${contactIndex}`} className="text-xs text-slate-600 dark:text-zinc-300">
                        Kontakt {contactOutcome.exxasContactId || "-"}:{" "}
                        {contactOutcome.ok
                          ? contactOutcome.skipped
                            ? "uebersprungen"
                            : `OK${contactOutcome.localContactId ? ` -> #${contactOutcome.localContactId}` : ""}`
                          : contactOutcome.error || "Fehler"}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <Dialog open={!!singlePreviewItem} onOpenChange={(open) => !open && setSinglePreviewItemId(null)}>
        {singlePreviewItem && singlePreviewState ? (
          <DialogContent className="max-w-3xl">
            <DialogClose onClose={() => setSinglePreviewItemId(null)} />
            <DialogHeader>
              <DialogTitle>Abgleich-Vorschau</DialogTitle>
              <p className="text-sm text-slate-500 dark:text-zinc-400">
                EXXAS Kunde #{singlePreviewItem.exxasCustomer.nummer || singlePreviewItem.exxasCustomer.id}{" "}
                {singlePreviewItem.exxasCustomer.name || "-"}
              </p>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 dark:border-zinc-800 p-4 space-y-3">
                <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-zinc-400">Kunde</div>
                <div className="mt-2 text-sm text-slate-800 dark:text-zinc-100">
                  Aktion: <span className="font-semibold">{customerActionLabel(singlePreviewState.customerAction)}</span>
                </div>
                {(() => {
                  const selectedCustomerCandidate = singlePreviewItem.customerSuggestions.find(
                    (entry) => entry.localCustomerId === singlePreviewState.localCustomerId
                  );
                  if (singlePreviewState.customerAction === "link_existing") {
                    return (
                      <>
                        <div className="text-sm text-slate-600 dark:text-zinc-300">
                          Ziel: {selectedCustomerCandidate
                            ? `#${selectedCustomerCandidate.localCustomerId} ${selectedCustomerCandidate.localCustomer.company || selectedCustomerCandidate.localCustomer.name} (${confidenceLabel(selectedCustomerCandidate.confidence)})`
                            : "nicht ausgewaehlt"}
                        </div>
                        <ComparisonTable
                          rows={buildCustomerComparisonRows(
                            singlePreviewItem,
                            selectedCustomerCandidate,
                            new Set(singlePreviewState.overwriteCustomerFields)
                          )}
                          localTitle={selectedCustomerCandidate ? `Lokal #${selectedCustomerCandidate.localCustomerId}` : "Lokaler Datensatz"}
                          onToggleOverwrite={(fieldKey, next) =>
                            toggleCustomerOverwriteField(singlePreviewItem.exxasCustomer.id, fieldKey, next)
                          }
                        />
                        {selectedCustomerCandidate?.reasons?.length ? (
                          <div className="text-xs text-slate-500 dark:text-zinc-400">
                            Treffergruende: {selectedCustomerCandidate.reasons.join(", ")}
                          </div>
                        ) : null}
                      </>
                    );
                  }
                  if (singlePreviewState.customerAction === "create_customer") {
                    return (
                      <>
                        <p className="text-sm text-slate-600 dark:text-zinc-300">
                          Es wird ein neuer lokaler Kunde aus den EXXAS-Daten angelegt.
                        </p>
                        <ComparisonTable
                          rows={buildCustomerComparisonRows(singlePreviewItem)}
                          localTitle="Neu in Buchungstool"
                        />
                      </>
                    );
                  }
                  return <p className="text-sm text-slate-600 dark:text-zinc-300">Dieser Kunde wird uebersprungen.</p>;
                })()}
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-zinc-800 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-zinc-400">Kontakte</div>
                <div className="mt-3 space-y-3">
                  {singlePreviewItem.contactSuggestions.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-zinc-400">Keine EXXAS-Kontakte gefunden.</p>
                  ) : (
                    singlePreviewItem.contactSuggestions.map((contactItem) => {
                      const contactState = singlePreviewState.contacts[contactItem.exxasContact.id];
                      const selectedCandidate = contactItem.localCandidates.find(
                        (candidate) => candidate.localContactId === contactState?.localContactId
                      );
                      return (
                        <div
                          key={contactItem.exxasContact.id}
                          className="rounded-lg border border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/60 p-3 space-y-3"
                        >
                          <div className="text-sm font-medium text-slate-900 dark:text-zinc-100">
                            {contactItem.exxasContact.name || "-"}
                          </div>
                          <div className="mt-1 text-sm text-slate-600 dark:text-zinc-300">
                            Aktion: <span className="font-semibold">{contactActionLabel(contactState?.action || "skip")}</span>
                          </div>
                          {contactState?.action === "link_existing" ? (
                            <>
                              <div className="mt-1 text-sm text-slate-600 dark:text-zinc-300">
                                Ziel: {selectedCandidate
                                  ? `#${selectedCandidate.localContactId} ${selectedCandidate.localContact.name || selectedCandidate.localContact.email} (${confidenceLabel(selectedCandidate.confidence)})`
                                  : "nicht ausgewaehlt"}
                              </div>
                              <ComparisonTable
                                rows={buildContactComparisonRows(
                                  contactItem,
                                  selectedCandidate,
                                  new Set(contactState?.overwriteFields || [])
                                )}
                                localTitle={selectedCandidate ? `Lokal #${selectedCandidate.localContactId}` : "Lokaler Kontakt"}
                                onToggleOverwrite={(fieldKey, next) =>
                                  toggleContactOverwriteField(
                                    singlePreviewItem.exxasCustomer.id,
                                    contactItem.exxasContact.id,
                                    fieldKey,
                                    next
                                  )
                                }
                              />
                              {selectedCandidate?.reasons?.length ? (
                                <div className="text-xs text-slate-500 dark:text-zinc-400">
                                  Treffergruende: {selectedCandidate.reasons.join(", ")}
                                </div>
                              ) : null}
                            </>
                          ) : null}
                          {contactState?.action === "create_contact" ? (
                            <>
                              <p className="text-sm text-slate-600 dark:text-zinc-300">
                                Es wird ein neuer lokaler Kontakt aus den EXXAS-Daten angelegt.
                              </p>
                              <ComparisonTable
                                rows={buildContactComparisonRows(contactItem)}
                                localTitle="Neu in Buchungstool"
                              />
                            </>
                          ) : null}
                          {(!contactState || contactState.action === "skip") ? (
                            <p className="text-sm text-slate-600 dark:text-zinc-300">Dieser Kontakt wird uebersprungen.</p>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {singlePreviewIssues.length > 0 ? (
                <div className="rounded-xl border border-amber-300/60 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-800 dark:text-amber-200">
                  <p className="font-semibold">Vor dem Bestaetigen noch pruefen:</p>
                  <div className="mt-2 space-y-1">
                    {singlePreviewIssues.map((issue) => (
                      <p key={issue}>{issue}</p>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSinglePreviewItemId(null)}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-zinc-700 px-3 py-2 text-sm font-medium text-slate-700 dark:text-zinc-200"
                >
                  Schliessen
                </button>
                <button
                  type="button"
                  onClick={() => void runSingleConfirm(singlePreviewItem)}
                  disabled={confirming || singlePreviewIssues.length > 0}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#C5A059] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {singleConfirmingId === singlePreviewItem.exxasCustomer.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Bestaetigen
                </button>
              </div>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog
        open={bulkConfirmOpen}
        onOpenChange={(open) => {
          if (!open && !confirming) setBulkConfirmOpen(false);
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogClose onClose={() => !confirming && setBulkConfirmOpen(false)} />
          <DialogHeader>
            <DialogTitle>Speichern: Auswahl pruefen</DialogTitle>
            <p className="text-sm text-slate-500 dark:text-zinc-400">
              Hier siehst du pro ausgewaehltem EXXAS-Kunden, was gespeichert wird. Du kannst noch zwischen{" "}
              <strong className="text-slate-700 dark:text-zinc-200">Abgleich</strong> (bestehenden Kunden verknuepfen) und{" "}
              <strong className="text-slate-700 dark:text-zinc-200">neuem Kunden</strong> waehlen.
            </p>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto space-y-4 pr-1">
            {bulkSelectedItems.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-zinc-400">Keine Eintraege ausgewaehlt.</p>
            ) : (
              bulkSelectedItems.map((item) => {
                const state = states[item.exxasCustomer.id] || initialStateForItem(item);
                const issues = getItemIssues(item, state);
                return (
                  <div
                    key={item.exxasCustomer.id}
                    className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-900/50 p-4 space-y-3"
                  >
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-zinc-100">
                        {item.exxasCustomer.name || "—"}{" "}
                        <span className="text-xs font-mono font-normal text-slate-500 dark:text-zinc-400">
                          #{item.exxasCustomer.nummer}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                        {item.exxasCustomer.email || "keine E-Mail"} · {item.exxasCustomer.city || "—"}
                      </div>
                    </div>

                    <fieldset className="space-y-2 border-0 p-0 m-0">
                      <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400 mb-1">
                        Kunde
                      </legend>
                      <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800 dark:text-zinc-200">
                        <input
                          type="radio"
                          className="mt-1"
                          name={`bulk-customer-${item.exxasCustomer.id}`}
                          checked={state.customerAction === "link_existing"}
                          onChange={() => {
                            updateItemState(item.exxasCustomer.id, (cur) => ({
                              ...cur,
                              customerAction: "link_existing",
                              localCustomerId: pickDefaultLocalCustomerId(item, cur),
                            }));
                          }}
                        />
                        <span>
                          <span className="font-medium">Abgleich</span>
                          <span className="text-slate-600 dark:text-zinc-400">
                            {" "}
                            – EXXAS mit bestehendem lokalen Kunden verknuepfen
                          </span>
                          <div className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                            Ziel:{" "}
                            {preview
                              ? resolveLocalCustomerLabel(item, preview, state.localCustomerId)
                              : "—"}
                          </div>
                        </span>
                      </label>
                      <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800 dark:text-zinc-200">
                        <input
                          type="radio"
                          className="mt-1"
                          name={`bulk-customer-${item.exxasCustomer.id}`}
                          checked={state.customerAction === "create_customer"}
                          onChange={() => {
                            updateItemState(item.exxasCustomer.id, (cur) => ({
                              ...cur,
                              customerAction: "create_customer",
                              localCustomerId: null,
                            }));
                          }}
                        />
                        <span>
                          <span className="font-medium">Neuer Kunde</span>
                          <span className="text-slate-600 dark:text-zinc-400">
                            {" "}
                            – lokalen Kunden aus den EXXAS-Daten neu anlegen
                          </span>
                        </span>
                      </label>
                      <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800 dark:text-zinc-200">
                        <input
                          type="radio"
                          className="mt-1"
                          name={`bulk-customer-${item.exxasCustomer.id}`}
                          checked={state.customerAction === "skip"}
                          onChange={() => {
                            updateItemState(item.exxasCustomer.id, (cur) => ({
                              ...cur,
                              customerAction: "skip",
                              localCustomerId: null,
                            }));
                          }}
                        />
                        <span>
                          <span className="font-medium">Ueberspringen</span>
                          <span className="text-slate-600 dark:text-zinc-400"> – fuer diesen EXXAS-Kunden nichts speichern</span>
                        </span>
                      </label>
                    </fieldset>

                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400 mb-1">
                        Kontakte (wie in der Liste eingestellt)
                      </div>
                      <p className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed">{summarizeContactDecisions(item, state)}</p>
                    </div>

                    {issues.length > 0 ? (
                      <div className="rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                        {issues.map((issue) => (
                          <p key={issue}>{issue}</p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>

          <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 dark:border-zinc-800 pt-4">
            <button
              type="button"
              disabled={confirming}
              onClick={() => setBulkConfirmOpen(false)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-zinc-700 px-3 py-2 text-sm font-medium text-slate-700 dark:text-zinc-200 disabled:opacity-50"
            >
              Abbrechen
            </button>
            <button
              type="button"
              disabled={confirming || bulkConfirmBlocked || bulkSelectedItems.length === 0}
              onClick={() => void handleBulkConfirmExecute()}
              className="inline-flex items-center gap-2 rounded-lg bg-[#C5A059] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              title={
                bulkConfirmBlocked
                  ? "Bitte fehlende Zielkunden oder Kontakte in der Liste ergaenzen, oder auf Ueberspringen stellen."
                  : undefined
              }
            >
              {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Jetzt speichern ({bulkSelectedItems.length})
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {!preview?.items?.length && !loading ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-zinc-700 p-10 text-center text-slate-500 dark:text-zinc-400">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-slate-100 dark:bg-zinc-800 mb-3">
            <UserPlus2 className="h-5 w-5" />
          </div>
          <p className="font-medium">Noch keine Vorschlaege geladen.</p>
          <p className="text-sm mt-1">Klicke auf „Preview laden“, um passende Kunden und Kontakte vorzuschlagen.</p>
          <button
            type="button"
            onClick={runPreview}
            disabled={!hasCredentials || loading || confirming}
            className="mt-4 inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-medium disabled:opacity-50"
          >
            <SkipForward className="h-4 w-4" />
            Jetzt Preview starten
          </button>
        </div>
      ) : null}
    </div>
  );
}

