import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, Trash2 } from "lucide-react";
import {
  deleteToursAdminCustomer,
  deleteToursAdminCustomerContact,
  getToursAdminCustomerDetail,
  postToursAdminContactPortalRole,
  postToursAdminCustomerContact,
  postToursAdminCustomerUpdate,
} from "../../../api/toursAdmin";
import { useQuery } from "../../../hooks/useQuery";
import { toursAdminCustomerDetailQueryKey } from "../../../lib/queryKeys";

export function ToursAdminCustomerDetailPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const okId = customerId && /^\d+$/.test(customerId) ? customerId : null;
  const qk = toursAdminCustomerDetailQueryKey(okId || "0");
  const queryFn = useCallback(() => getToursAdminCustomerDetail(okId!), [okId]);
  const { data, loading, error, refetch } = useQuery(qk, queryFn, {
    staleTime: 15_000,
    enabled: !!okId,
  });

  const customer = data?.customer as Record<string, unknown> | undefined;
  const contacts = (data?.contacts as Record<string, unknown>[]) ?? [];
  const tours = (data?.tours as Record<string, unknown>[]) ?? [];
  const contactPortalRoles = (data?.contactPortalRoles as Record<string, { role?: string; status?: string }>) ?? {};

  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [cName, setCName] = useState("");
  const [cCompany, setCCompany] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cStreet, setCStreet] = useState("");
  const [cZip, setCZip] = useState("");
  const [cCity, setCCity] = useState("");
  const [cNotes, setCNotes] = useState("");
  const [cBlocked, setCBlocked] = useState(false);
  const [cExxasContact, setCExxasContact] = useState("");
  const [cExxasCustomer, setCExxasCustomer] = useState("");
  const [cExxasAddress, setCExxasAddress] = useState("");

  useEffect(() => {
    if (!customer) return;
    setCName(String(customer.name || ""));
    setCCompany(String(customer.company || ""));
    setCEmail(String(customer.email || ""));
    setCPhone(String(customer.phone || ""));
    setCStreet(String(customer.street || ""));
    setCZip(String(customer.zip || ""));
    setCCity(String(customer.city || ""));
    setCNotes(String(customer.notes || ""));
    setCBlocked(customer.blocked === true);
    setCExxasContact(String(customer.exxas_contact_id || ""));
    setCExxasCustomer(String(customer.exxas_customer_id || ""));
    setCExxasAddress(String(customer.exxas_address_id || ""));
  }, [customer]);

  const [newContactName, setNewContactName] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactRole, setNewContactRole] = useState("");

  if (!okId) return <Navigate to="/admin/tours/customers" replace />;
  const cid = okId;

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveErr(null);
    setSaving(true);
    try {
      const r = await postToursAdminCustomerUpdate(cid, {
        name: cName,
        company: cCompany,
        email: cEmail,
        phone: cPhone || null,
        street: cStreet || null,
        zip: cZip || null,
        city: cCity || null,
        notes: cNotes || null,
        blocked: cBlocked,
        exxas_contact_id: cExxasContact || null,
        exxas_customer_id: cExxasCustomer || null,
        exxas_address_id: cExxasAddress || null,
      });
      if (!r.ok) setSaveErr(String((r as { error?: string }).error || "Fehler"));
      else void refetch();
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!window.confirm("Kunde wirklich löschen?")) return;
    try {
      await deleteToursAdminCustomer(cid);
      window.location.href = "/admin/tours/customers";
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : "Löschen fehlgeschlagen");
    }
  }

  async function addContact(e: React.FormEvent) {
    e.preventDefault();
    setSaveErr(null);
    try {
      await postToursAdminCustomerContact(cid, {
        name: newContactName,
        email: newContactEmail || null,
        role: newContactRole || null,
      });
      setNewContactName("");
      setNewContactEmail("");
      setNewContactRole("");
      void refetch();
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : "Kontakt speichern fehlgeschlagen");
    }
  }

  async function removeContact(contactId: number) {
    if (!window.confirm("Kontakt löschen?")) return;
    try {
      await deleteToursAdminCustomerContact(cid, contactId);
      void refetch();
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : "Fehler");
    }
  }

  async function setPortalRole(contactId: number, portalRole: string) {
    setSaveErr(null);
    try {
      await postToursAdminContactPortalRole(cid, contactId, { portal_role: portalRole });
      void refetch();
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : "Portal-Rolle fehlgeschlagen");
    }
  }

  if (loading && !data) {
    return <p className="text-sm text-[var(--text-subtle)]">Laden …</p>;
  }

  if (error || !customer) {
    return (
      <div className="space-y-4">
        <Link to="/admin/tours/customers" className="text-sm text-[var(--accent)] hover:underline">
          ← Zur Liste
        </Link>
        <p className="text-red-600">{error || "Kunde nicht gefunden."}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to="/admin/tours/customers"
            className="inline-flex items-center gap-1 text-sm text-[var(--accent)] hover:underline mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Zur Liste
          </Link>
          <h1 className="text-2xl font-semibold text-[var(--text-main)]">
            {String(customer.company || customer.name || `Kunde #${okId}`)}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => void onDelete()}
          className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
        >
          <Trash2 className="h-4 w-4" />
          Löschen
        </button>
      </div>

      {saveErr ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {saveErr}
        </div>
      ) : null}

      <form onSubmit={onSave} className="surface-card-strong p-6 space-y-4">
        <h2 className="text-lg font-semibold text-[var(--text-main)]">Stammdaten</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-[var(--text-subtle)]">Anzeigename</span>
            <input className="mt-1 w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm" value={cName} onChange={(e) => setCName(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="text-[var(--text-subtle)]">Firma / Kunde *</span>
            <input required className="mt-1 w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm" value={cCompany} onChange={(e) => setCCompany(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="text-[var(--text-subtle)]">E-Mail *</span>
            <input required type="email" className="mt-1 w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm" value={cEmail} onChange={(e) => setCEmail(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="text-[var(--text-subtle)]">Telefon</span>
            <input className="mt-1 w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm" value={cPhone} onChange={(e) => setCPhone(e.target.value)} />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-[var(--text-subtle)]">Strasse</span>
            <input className="mt-1 w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm" value={cStreet} onChange={(e) => setCStreet(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="text-[var(--text-subtle)]">PLZ</span>
            <input className="mt-1 w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm" value={cZip} onChange={(e) => setCZip(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="text-[var(--text-subtle)]">Ort</span>
            <input className="mt-1 w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm" value={cCity} onChange={(e) => setCCity(e.target.value)} />
          </label>
          <label className="text-sm sm:col-span-2 flex items-center gap-2 mt-2">
            <input type="checkbox" checked={cBlocked} onChange={(e) => setCBlocked(e.target.checked)} />
            <span>Kunde gesperrt</span>
          </label>
          <label className="text-sm">
            <span className="text-[var(--text-subtle)]">Exxas Kontakt-ID</span>
            <input className="mt-1 w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm" value={cExxasContact} onChange={(e) => setCExxasContact(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="text-[var(--text-subtle)]">Exxas Kunden-ID</span>
            <input className="mt-1 w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm" value={cExxasCustomer} onChange={(e) => setCExxasCustomer(e.target.value)} />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-[var(--text-subtle)]">Exxas Adress-ID</span>
            <input className="mt-1 w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm" value={cExxasAddress} onChange={(e) => setCExxasAddress(e.target.value)} />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-[var(--text-subtle)]">Notizen</span>
            <textarea className="mt-1 w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm min-h-[72px]" value={cNotes} onChange={(e) => setCNotes(e.target.value)} />
          </label>
        </div>
        <button type="submit" disabled={saving} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {saving ? "Speichern …" : "Speichern"}
        </button>
      </form>

      <section className="surface-card-strong p-6 space-y-4">
        <h2 className="text-lg font-semibold text-[var(--text-main)]">Ansprechpartner</h2>
        <form onSubmit={addContact} className="grid gap-3 sm:grid-cols-3 items-end">
          <label className="text-sm sm:col-span-1">
            <span className="text-[var(--text-subtle)]">Name *</span>
            <input required className="mt-1 w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm" value={newContactName} onChange={(e) => setNewContactName(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="text-[var(--text-subtle)]">E-Mail</span>
            <input type="email" className="mt-1 w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm" value={newContactEmail} onChange={(e) => setNewContactEmail(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="text-[var(--text-subtle)]">Rolle</span>
            <input className="mt-1 w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm" value={newContactRole} onChange={(e) => setNewContactRole(e.target.value)} />
          </label>
          <button type="submit" className="rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm font-medium">
            Hinzufügen
          </button>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-soft)] text-[var(--text-subtle)] text-left">
                <th className="p-2">Name</th>
                <th className="p-2">E-Mail</th>
                <th className="p-2">Portal</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {contacts.map((ct) => {
                const em = String(ct.email || "").toLowerCase();
                const pr = em ? contactPortalRoles[em] : undefined;
                const currentRole = pr?.role === "admin" ? "admin" : pr?.role === "mitarbeiter" ? "mitarbeiter" : "";
                return (
                  <tr key={String(ct.id)} className="border-b border-[var(--border-soft)]/60">
                    <td className="p-2">{String(ct.name || "—")}</td>
                    <td className="p-2">{String(ct.email || "—")}</td>
                    <td className="p-2">
                      <a
                        href={`/settings/roles`}
                        className="inline-flex items-center gap-1 rounded border border-[var(--border-soft)] bg-[var(--surface-raised)] px-2 py-0.5 text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
                        title="Portalrollen zentral verwalten"
                      >
                        {currentRole === "admin" ? "Kunden-Admin" : currentRole === "mitarbeiter" ? "Mitarbeiter" : "—"}
                        {" "}→
                      </a>
                    </td>
                    <td className="p-2 text-right">
                      <button type="button" className="text-red-600 text-xs hover:underline" onClick={() => void removeContact(Number(ct.id))}>
                        Entfernen
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="surface-card-strong p-6">
        <h2 className="text-lg font-semibold text-[var(--text-main)] mb-3">Touren (Auszug)</h2>
        {tours.length === 0 ? (
          <p className="text-sm text-[var(--text-subtle)]">Keine Touren mit dieser Kunden-E-Mail.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {tours.map((t) => (
              <li key={String(t.id)}>
                <Link to={`/admin/tours/${t.id}`} className="text-[var(--accent)] hover:underline">
                  {String(t.object_label || t.bezeichnung || `Tour #${t.id}`)}
                </Link>
                <span className="text-[var(--text-subtle)] ml-2">{String(t.status || "")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
