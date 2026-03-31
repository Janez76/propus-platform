import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { AlertCircle, ArrowLeft } from "lucide-react";
import {
  getToursAdminLinkCustomerAutocomplete,
  getToursAdminLinkExxasCustomer,
  postLinkExxasCustomerToTour,
} from "../../../api/toursAdmin";
import { useQuery } from "../../../hooks/useQuery";
import { toursAdminLinkExxasCustomerQueryKey } from "../../../lib/queryKeys";


type AcContact = { id?: unknown; name?: string; email?: string; role?: string };
type AcCustomer = {
  id?: unknown;
  display_name?: string;
  email?: string;
  ref?: string;
  contacts?: AcContact[];
};

function formatTourTitle(tour: Record<string, unknown>) {
  return (
    (tour.canonical_object_label as string) ||
    (tour.object_label as string) ||
    (tour.bezeichnung as string) ||
    `Tour #${tour.id}`
  );
}

export function ToursAdminLinkExxasCustomerPage() {
  const { id } = useParams<{ id: string }>();
  // Reine boolean-Bedingung: `id && regex.test(id)` wäre für TS `string | boolean | …` und vergiftet okId.
  const okId = id != null && id !== "" && /^\d+$/.test(id) ? id : null;

  const qk = okId ? toursAdminLinkExxasCustomerQueryKey(okId) : "toursAdmin:linkExxasCustomer:invalid";
  const queryFn = useCallback(() => {
    if (!okId) throw new Error("Ungültige Tour-ID");
    return getToursAdminLinkExxasCustomer(okId);
  }, [okId]);
  const { data, loading, error, refetch } = useQuery(qk, queryFn, { enabled: !!okId, staleTime: 15_000 });

  const tour = (data?.tour as Record<string, unknown> | undefined) ?? undefined;

  const [searchDraft, setSearchDraft] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [acCustomers, setAcCustomers] = useState<AcCustomer[]>([]);
  const [acLoading, setAcLoading] = useState(false);
  const [acOpen, setAcOpen] = useState(false);

  const [selectedCustomer, setSelectedCustomer] = useState<AcCustomer | null>(null);
  const [selectedContact, setSelectedContact] = useState<AcContact | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchDraft.trim()), 240);
    return () => clearTimeout(t);
  }, [searchDraft]);

  useEffect(() => {
    if (!okId || debouncedQ.length < 2) {
      setAcCustomers([]);
      return;
    }
    let cancelled = false;
    setAcLoading(true);
    void getToursAdminLinkCustomerAutocomplete(okId, debouncedQ)
      .then((res) => {
        if (cancelled) return;
        setAcCustomers((res.customers || []) as AcCustomer[]);
        setAcOpen(true);
      })
      .catch(() => {
        if (!cancelled) setAcCustomers([]);
      })
      .finally(() => {
        if (!cancelled) setAcLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [okId, debouncedQ]);

  function pickCustomer(c: AcCustomer) {
    setSelectedCustomer(c);
    setAcOpen(false);
    setSearchDraft(String(c.display_name || ""));
    const contacts = Array.isArray(c.contacts) ? c.contacts : [];
    if (contacts.length > 0) {
      setSelectedContact(contacts[0] ?? null);
    } else {
      setSelectedContact(null);
    }
  }

  function resetSelection() {
    setSelectedCustomer(null);
    setSelectedContact(null);
    setSearchDraft("");
    setAcCustomers([]);
    setAcOpen(false);
  }

  const previewName = selectedCustomer ? String(selectedCustomer.display_name || "") : "";
  const previewContact = selectedContact ? String(selectedContact.name || "") : "";
  const previewEmail = selectedContact?.email
    ? String(selectedContact.email)
    : selectedCustomer
      ? String(selectedCustomer.email || "")
      : "";

  async function save() {
    if (!okId || !selectedCustomer) return;
    const rawId = selectedCustomer.id;
    if (rawId == null) return;
    const customerId: string | number =
      typeof rawId === "string"
        ? rawId
        : typeof rawId === "number"
          ? rawId
          : String(rawId);
    setSaveBusy(true);
    setSaveErr(null);
    try {
      await postLinkExxasCustomerToTour(okId, {
        customer_id: customerId,
        customer_name: previewName,
        customer_email: previewEmail || undefined,
        customer_contact: previewContact || undefined,
      });
      setSavedOk(true);
      void refetch({ force: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Speichern fehlgeschlagen";
      setSaveErr(msg);
    } finally {
      setSaveBusy(false);
    }
  }

  if (!okId) {
    return <Navigate to="/admin/tours/list" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            to={`/admin/tours/${okId}`}
            className="inline-flex items-center gap-1 text-sm text-[var(--accent)] hover:underline mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück zur Tour
          </Link>
          <h1 className="text-2xl font-bold text-[var(--text-main)]">Kunde anpassen</h1>
          <p className="text-sm text-[var(--text-subtle)] mt-1">
            core.customers zuordnen.
          </p>
        </div>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      ) : null}

      {loading && !tour ? (
        <div className="flex justify-center py-16">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
        </div>
      ) : tour ? (
        <>
          {savedOk ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
              Kundendaten wurden gespeichert.
            </div>
          ) : null}

          <div className="surface-card-strong p-4 text-sm space-y-3">
            <h2 className="text-sm font-semibold text-[var(--text-main)]">Tour-Kontext</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs">
              <div className="rounded border border-[var(--border-soft)] p-2">
                <div className="text-[var(--text-subtle)] uppercase tracking-wide">Objekt</div>
                <div className="text-[var(--text-main)] font-medium mt-0.5">{formatTourTitle(tour)}</div>
              </div>
              <div className="rounded border border-[var(--border-soft)] p-2">
                <div className="text-[var(--text-subtle)] uppercase tracking-wide">Aktueller Kunde</div>
                <div className="text-[var(--text-main)] font-medium mt-0.5">
                  {String(tour.canonical_customer_name || tour.customer_name || tour.kunde_ref || "—")}
                </div>
              </div>
              <div className="rounded border border-[var(--border-soft)] p-2">
                <div className="text-[var(--text-subtle)] uppercase tracking-wide">Kontakt</div>
                <div className="text-[var(--text-main)] font-medium mt-0.5">{String(tour.customer_contact || "—")}</div>
              </div>
              <div className="rounded border border-[var(--border-soft)] p-2 sm:col-span-2 lg:col-span-1">
                <div className="text-[var(--text-subtle)] uppercase tracking-wide">Tour-Link</div>
                <div className="text-[var(--text-main)] font-mono text-[11px] break-all mt-0.5">
                  {tour.tour_url ? (
                    <a href={String(tour.tour_url)} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">
                      {String(tour.tour_url).length > 72 ? `${String(tour.tour_url).slice(0, 72)}…` : String(tour.tour_url)}
                    </a>
                  ) : (
                    "—"
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="surface-card-strong p-4 space-y-4 text-sm relative">
            <div>
              <label className="block text-xs font-medium text-[var(--text-subtle)] mb-1">Kundensuche</label>
              <div className="relative">
                <input
                  type="search"
                  className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm"
                  placeholder="Name, Firma oder E-Mail (min. 2 Zeichen)…"
                  value={searchDraft}
                  autoComplete="off"
                  onChange={(e) => {
                    setSearchDraft(e.target.value);
                    if (selectedCustomer && e.target.value.trim() !== String(selectedCustomer.display_name || "").trim()) {
                      setSelectedCustomer(null);
                      setSelectedContact(null);
                    }
                  }}
                  onFocus={() => {
                    if (acCustomers.length > 0) setAcOpen(true);
                  }}
                />
                {acOpen && (acLoading || acCustomers.length > 0) ? (
                  <div className="absolute z-30 left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] shadow-lg">
                    {acLoading ? (
                      <p className="p-2 text-xs text-[var(--text-subtle)]">Suche…</p>
                    ) : (
                      <ul className="py-1">
                        {acCustomers.map((c, i) => (
                          <li key={`${String(c.id ?? i)}`}>
                            <button
                              type="button"
                              className="w-full text-left px-3 py-2 hover:bg-[var(--surface-raised)] text-xs"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => pickCustomer(c)}
                            >
                              <span className="font-medium text-[var(--text-main)]">{String(c.display_name || "—")}</span>
                              <span className="block text-[var(--text-subtle)]">
                                {[c.email, c.ref ? `Nr. ${c.ref}` : ""].filter(Boolean).join(" · ")}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </div>
            </div>

            {selectedCustomer ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-2 border-t border-[var(--border-soft)] pt-4">
                  <div>
                    <div className="font-semibold text-[var(--text-main)]">{previewName}</div>
                    <div className="text-xs text-[var(--text-subtle)] mt-0.5">
                      {[selectedCustomer.email, selectedCustomer.ref ? `Nr. ${selectedCustomer.ref}` : ""]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <button type="button" className="text-xs text-[var(--text-subtle)] underline" onClick={() => resetSelection()}>
                    Auswahl zurücksetzen
                  </button>
                </div>

                {Array.isArray(selectedCustomer.contacts) && selectedCustomer.contacts.length > 0 ? (
                  <div>
                    <div className="text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wide mb-2">
                      Ansprechpartner
                    </div>
                    <ul className="space-y-1">
                      {selectedCustomer.contacts.map((ct, idx) => (
                        <li key={String(ct.id ?? idx)}>
                          <button
                            type="button"
                            onClick={() => setSelectedContact(ct)}
                            className={`w-full text-left rounded border px-2 py-1.5 text-xs transition-colors ${
                              selectedContact === ct
                                ? "border-[var(--accent)] bg-[var(--accent)]/10"
                                : "border-[var(--border-soft)] hover:bg-[var(--surface-raised)]"
                            }`}
                          >
                            <span className="font-medium text-[var(--text-main)]">{String(ct.name || "—")}</span>
                            {ct.role ? <span className="text-[var(--text-subtle)] italic ml-2">{ct.role}</span> : null}
                            {ct.email ? <div className="text-[var(--text-subtle)]">{ct.email}</div> : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-xs text-[var(--text-subtle)]">Keine Ansprechpartner – Kunden-E-Mail wird übernommen.</p>
                )}

                <div className="grid gap-2 sm:grid-cols-2 text-xs border-t border-[var(--border-soft)] pt-4">
                  <div>
                    <div className="text-[var(--text-subtle)] uppercase tracking-wide">Kundenname (speichern)</div>
                    <div className="mt-1 rounded border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1.5">{previewName || "—"}</div>
                  </div>
                  <div>
                    <div className="text-[var(--text-subtle)] uppercase tracking-wide">Ansprechpartner</div>
                    <div className="mt-1 rounded border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1.5">
                      {previewContact || "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--text-subtle)] uppercase tracking-wide">E-Mail</div>
                    <div className="mt-1 rounded border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1.5">
                      {previewEmail || "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--text-subtle)] uppercase tracking-wide">Kundennummer</div>
                    <div className="mt-1 rounded border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1.5">
                      {selectedCustomer.ref ? String(selectedCustomer.ref) : "wird beim Speichern vergeben"}
                    </div>
                  </div>
                </div>

                {saveErr ? <p className="text-sm text-red-600">{saveErr}</p> : null}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={saveBusy || !previewName}
                    onClick={() => void save()}
                    className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
                  >
                    {saveBusy ? "…" : "Speichern"}
                  </button>
                  <Link
                    to={`/admin/tours/${okId}`}
                    className="rounded-lg border border-[var(--border-soft)] px-4 py-2 text-xs font-medium text-[var(--text-main)]"
                  >
                    Abbrechen
                  </Link>
                </div>
              </>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
