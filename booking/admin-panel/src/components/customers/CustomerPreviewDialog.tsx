import { useCallback, useState } from "react";
import { ExternalLink, X, Monitor, BookOpen, Building2, Mail, Phone, User } from "lucide-react";
import { getCustomerImpersonateUrl, type Customer } from "../../api/customers";
import { CustomerAutocompleteInput } from "../ui/CustomerAutocompleteInput";

type Props = {
  open: boolean;
  token: string;
  customers: Customer[];
  onClose: () => void;
};

export function CustomerPreviewDialog({ open, token, customers, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setQuery("");
    setSelectedCustomer(null);
    setError(null);
    onClose();
  }

  function handleSelectCustomer(customer: Customer) {
    setSelectedCustomer(customer);
    setError(null);
    const label = String(customer.company || "").trim() || customer.name || "";
    setQuery(label);
  }

  const openAsCustomer = useCallback(async () => {
    if (!selectedCustomer) return;
    setLoading(true);
    setError(null);
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    try {
      const data = await getCustomerImpersonateUrl(token, selectedCustomer.id);
      if (data?.url) {
        if (popup) {
          popup.location.href = data.url;
        } else {
          const fb = window.open(data.url, "_blank");
          if (fb) fb.opener = null;
        }
      } else {
        setError("Kein Impersonation-Link erhalten.");
        if (popup) popup.close();
      }
    } catch (e) {
      if (popup) popup.close();
      setError(e instanceof Error ? e.message : "Fehler beim Öffnen des Portals.");
    } finally {
      setLoading(false);
    }
  }, [token, selectedCustomer]);

  function openBookingWizard() {
    const origin = window.location.origin;
    window.open(`${origin}/book`, "_blank", "noopener");
  }

  const isSynthetic = String(selectedCustomer?.email || "").toLowerCase().endsWith("@company.local");
  const canOpen = !!selectedCustomer && !selectedCustomer.blocked && !isSynthetic;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="surface-card w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border-soft)] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)" }}>
              <Monitor className="h-4 w-4 text-[var(--accent)]" />
            </span>
            <div>
              <h3 className="text-base font-bold p-text-main">Kundenvorschau</h3>
              <p className="text-xs p-text-subtle">Portal aus Kundensicht öffnen</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1.5 p-text-subtle hover:bg-[var(--surface-raised)] hover:p-text-main transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Search */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold p-text-muted">
              Kunde suchen
            </label>
            <CustomerAutocompleteInput
              value={query}
              onChange={(v) => {
                setQuery(v);
                if (!v.trim()) setSelectedCustomer(null);
              }}
              onSelectCustomer={handleSelectCustomer}
              token={token}
              customers={customers}
              minChars={2}
              maxSuggestions={8}
              selectValue={(c) => String(c.company || "").trim() || c.name || ""}
              className="ui-input w-full text-sm"
              placeholder="Firmenname, Name oder E-Mail eingeben …"
              autoFocus
            />
          </div>

          {/* Selected customer card */}
          {selectedCustomer && (
            <div
              className="rounded-xl border p-4 space-y-2"
              style={{ background: "var(--surface-raised)", borderColor: "var(--border-soft)" }}
            >
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)" }}>
                  {selectedCustomer.company ? (
                    <Building2 className="h-4.5 w-4.5 text-[var(--accent)]" />
                  ) : (
                    <User className="h-4.5 w-4.5 text-[var(--accent)]" />
                  )}
                </span>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="font-bold p-text-main text-sm truncate">
                    {String(selectedCustomer.company || "").trim() || selectedCustomer.name || "—"}
                  </p>
                  {selectedCustomer.company && selectedCustomer.name && (
                    <p className="text-xs p-text-subtle truncate">{selectedCustomer.name}</p>
                  )}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs p-text-muted pt-0.5">
                    <span className="font-mono p-text-subtle">ID {selectedCustomer.id}</span>
                    {!isSynthetic && selectedCustomer.email && (
                      <span className="inline-flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {selectedCustomer.email}
                      </span>
                    )}
                    {selectedCustomer.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {selectedCustomer.phone}
                      </span>
                    )}
                  </div>
                </div>
                {selectedCustomer.blocked && (
                  <span className="rounded px-2 py-0.5 text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 shrink-0">
                    Gesperrt
                  </span>
                )}
              </div>

              {selectedCustomer.blocked && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                  Dieser Kunde ist gesperrt und kann nicht impersoniert werden.
                </p>
              )}
              {isSynthetic && (
                <p className="text-xs p-text-subtle mt-1">
                  Firmen-Profil ohne Login — Portal kann nicht geöffnet werden.
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 border-t border-[var(--border-soft)] px-5 py-4">
          <button
            type="button"
            onClick={openBookingWizard}
            className="btn-secondary inline-flex items-center justify-center gap-2 px-3 py-2 text-sm"
          >
            <BookOpen className="h-4 w-4" />
            Buchungsformular öffnen
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="btn-secondary px-3 py-2 text-sm"
            >
              Schliessen
            </button>
            <button
              type="button"
              onClick={() => void openAsCustomer()}
              disabled={!canOpen || loading}
              className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ExternalLink className="h-4 w-4" />
              {loading ? "Öffne …" : "Als Kunde öffnen"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
