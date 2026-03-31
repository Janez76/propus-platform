import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { getToursAdminExxasCustomerSearch, postToursAdminCustomerNew } from "../../../api/toursAdmin";

const LEGACY = "/tour-manager/admin/customers/new";

export function ToursAdminCustomerNewPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [zipcity, setZipcity] = useState("");
  const [notes, setNotes] = useState("");
  const [exxasContactId, setExxasContactId] = useState("");
  const [exxasQ, setExxasQ] = useState("");
  const [exxasResults, setExxasResults] = useState<Record<string, unknown>[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const q = exxasQ.trim();
    if (q.length < 2) {
      setExxasResults([]);
      return;
    }
    const t = window.setTimeout(() => {
      void getToursAdminExxasCustomerSearch(q)
        .then((r) => setExxasResults((r.results as Record<string, unknown>[]) ?? []))
        .catch(() => setExxasResults([]));
    }, 350);
    return () => window.clearTimeout(t);
  }, [exxasQ]);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setErr(null);
      setSaving(true);
      try {
        const r = await postToursAdminCustomerNew({
          name,
          email,
          company: company || undefined,
          phone: phone || undefined,
          street: street || undefined,
          zipcity: zipcity || undefined,
          notes: notes || undefined,
          exxas_contact_id: exxasContactId || undefined,
        });
        if (r.ok && typeof (r as { id?: unknown }).id !== "undefined") {
          navigate(`/admin/tours/customers/${(r as { id: number }).id}`);
        } else {
          setErr(String((r as { error?: string }).error || "Speichern fehlgeschlagen"));
        }
      } catch (e2) {
        setErr(e2 instanceof Error ? e2.message : "Fehler");
      } finally {
        setSaving(false);
      }
    },
    [name, email, company, phone, street, zipcity, notes, exxasContactId, navigate]
  );

  function pickExxas(row: Record<string, unknown>) {
    setExxasContactId(String(row.exxas_contact_id || row.id || ""));
    if (row.name) setName(String(row.name));
    if (row.email) setEmail(String(row.email));
    if (row.company) setCompany(String(row.company));
    if (row.phone) setPhone(String(row.phone));
    if (row.street) setStreet(String(row.street));
    if (row.zipcity) setZipcity(String(row.zipcity));
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link
          to="/admin/tours/customers"
          className="inline-flex items-center gap-1 text-sm text-[var(--accent)] hover:underline mb-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Zur Liste
        </Link>
        <h1 className="text-2xl font-semibold text-[var(--text-main)]">Neuer Kunde</h1>
        <p className="text-sm text-[var(--text-subtle)] mt-1">
          <a href={LEGACY} className="text-[var(--accent)] hover:underline">
            Klassische Ansicht
          </a>
        </p>
      </div>

      {err ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {err}
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="surface-card-strong p-6 space-y-4">
        <div>
          <label className="block text-sm text-[var(--text-subtle)] mb-1">Exxas suchen (optional)</label>
          <input
            className="w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm"
            value={exxasQ}
            onChange={(e) => setExxasQ(e.target.value)}
            placeholder="Mind. 2 Zeichen …"
          />
          {exxasResults.length > 0 ? (
            <ul className="mt-2 max-h-40 overflow-auto rounded border border-[var(--border-soft)] text-sm divide-y divide-[var(--border-soft)]/60">
              {exxasResults.map((row, i) => (
                <li key={i}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-[var(--surface)]"
                    onClick={() => pickExxas(row)}
                  >
                    <span className="font-medium">{String(row.name || row.company || row.id)}</span>
                    {row.email ? <span className="text-[var(--text-subtle)] ml-2">{String(row.email)}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-[var(--text-subtle)]">Name *</span>
            <input
              required
              className="mt-1 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--text-subtle)]">E-Mail *</span>
            <input
              required
              type="email"
              className="mt-1 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="text-[var(--text-subtle)]">Firma</span>
            <input
              className="mt-1 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--text-subtle)]">Telefon</span>
            <input
              className="mt-1 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--text-subtle)]">Exxas-Kontakt-ID</span>
            <input
              className="mt-1 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm"
              value={exxasContactId}
              onChange={(e) => setExxasContactId(e.target.value)}
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="text-[var(--text-subtle)]">Strasse</span>
            <input
              className="mt-1 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="text-[var(--text-subtle)]">PLZ Ort</span>
            <input
              className="mt-1 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm"
              value={zipcity}
              onChange={(e) => setZipcity(e.target.value)}
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="text-[var(--text-subtle)]">Notizen</span>
            <textarea
              className="mt-1 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] px-3 py-2 text-sm min-h-[80px]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Speichern …" : "Anlegen"}
          </button>
        </div>
      </form>
    </div>
  );
}
