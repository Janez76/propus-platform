import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Loader2, Archive, ArrowUpRight, Trash2, RefreshCw, CreditCard } from "lucide-react";

type CleanupRule = {
  statusLabel: string;
  weiterfuehrenHint: string;
  needsInvoice: boolean;
  invoiceAmount: number | null;
  needsManualReview: boolean;
};

type DashboardTour = {
  id: number;
  objectLabel: string;
  tourUrl: string | null;
  status: string;
  statusLabel: string;
  createdAt: string | null;
  termEndDate: string | null;
  archivedAt: string | null;
  cleanupAction: string | null;
  cleanupActionAt: string | null;
  rule: CleanupRule;
};

type ActionResult = {
  ok: boolean;
  action?: string;
  message?: string;
  needsPayment?: boolean;
  invoiceAmount?: number;
  checkoutUrl?: string;
  error?: string;
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  Aktiv: { bg: "bg-green-50 border-green-200", text: "text-green-700" },
  "Läuft bald ab": { bg: "bg-yellow-50 border-yellow-200", text: "text-yellow-700" },
  Abgelaufen: { bg: "bg-orange-50 border-orange-200", text: "text-orange-700" },
  Archiviert: { bg: "bg-gray-50 border-gray-300", text: "text-gray-600" },
  "Warten auf Zahlung": { bg: "bg-blue-50 border-blue-200", text: "text-blue-700" },
};

const CLEANUP_ACTION_LABELS: Record<string, string> = {
  weiterfuehren: "Weitergeführt",
  weiterfuehren_review: "Wird geprüft",
  weiterfuehren_pending_payment: "Zahlung ausstehend",
  weiterfuehren_online: "Online-Zahlung",
  weiterfuehren_qr: "QR-Rechnung versendet",
  archivieren: "Archiviert",
  uebertragen: "Übertragung beantragt",
  loeschen: "Gelöscht",
};

function formatDate(v: unknown) {
  if (v == null || v === "") return "—";
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function getTokenFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("token") || "";
}

async function fetchDashboard(token: string) {
  const res = await fetch(`/api/cleanup/dashboard?token=${encodeURIComponent(token)}`);
  return res.json();
}

async function postAction(token: string, tourId: number, action: string): Promise<ActionResult> {
  const res = await fetch("/api/cleanup/dashboard/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, tourId, action }),
  });
  return res.json();
}

async function postPayment(token: string, tourId: number, paymentMethod: string): Promise<ActionResult> {
  const res = await fetch("/api/cleanup/dashboard/payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, tourId, paymentMethod }),
  });
  return res.json();
}

function TourCard({ tour, token, onActionComplete }: { tour: DashboardTour; token: string; onActionComplete: () => void }) {
  const [busy, setBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [paymentChoice, setPaymentChoice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isDone = !!tour.cleanupAction;
  const statusCfg = STATUS_COLORS[tour.rule.statusLabel] || { bg: "bg-gray-50 border-gray-200", text: "text-gray-600" };

  async function handleAction(action: string) {
    if (action === "loeschen" && confirmAction !== "loeschen") {
      setConfirmAction("loeschen");
      return;
    }
    if (action === "archivieren" && confirmAction !== "archivieren") {
      setConfirmAction("archivieren");
      return;
    }
    setBusy(true);
    setError(null);
    setConfirmAction(null);
    try {
      const r = await postAction(token, tour.id, action);
      if (!r.ok) {
        setError(r.error || "Fehler bei der Aktion");
        return;
      }
      if (r.needsPayment) {
        setPaymentChoice(true);
        return;
      }
      setSuccessMsg(r.message || "Aktion ausgeführt");
      setTimeout(() => onActionComplete(), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Netzwerkfehler");
    } finally {
      setBusy(false);
    }
  }

  async function handlePayment(method: "online" | "qr") {
    setBusy(true);
    setError(null);
    try {
      const r = await postPayment(token, tour.id, method);
      if (!r.ok) {
        setError(r.error || "Fehler bei der Zahlungsart");
        return;
      }
      if (r.checkoutUrl) {
        window.location.href = r.checkoutUrl;
        return;
      }
      setSuccessMsg(r.message || "Erledigt");
      setPaymentChoice(false);
      setTimeout(() => onActionComplete(), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Netzwerkfehler");
    } finally {
      setBusy(false);
    }
  }

  if (isDone) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-gray-50/50 p-5 opacity-60">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-500">{tour.objectLabel}</h3>
            <div className="mt-1 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-sm text-green-700 font-medium">
                {CLEANUP_ACTION_LABELS[tour.cleanupAction || ""] || tour.cleanupAction}
              </span>
              <span className="text-xs text-gray-400">am {formatDate(tour.cleanupActionAt)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#d8cdb8] bg-white p-5 shadow-md">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-gray-900 truncate">{tour.objectLabel}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusCfg.bg} ${statusCfg.text}`}>
              {tour.rule.statusLabel}
            </span>
            {tour.tourUrl && (
              <a
                href={tour.tourUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full border-2 border-[#8a6c18] bg-[#f0d98a] px-2.5 py-0.5 text-xs font-bold text-[#3b2a00] hover:bg-[#e8cc6a] transition-colors"
              >
                Tour ansehen <ArrowUpRight className="h-3 w-3" />
              </a>
            )}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-4 text-xs text-gray-500">
            <div>Erstellt: {formatDate(tour.createdAt)}</div>
            <div>Ablauf: {formatDate(tour.termEndDate)}</div>
            {tour.archivedAt && <div className="col-span-2">Archiviert: {formatDate(tour.archivedAt)}</div>}
          </div>
        </div>
      </div>

      {successMsg && (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          {successMsg}
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <XCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {confirmAction && !busy && (
        <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-orange-800">
                {confirmAction === "loeschen" ? "Tour wirklich löschen?" : "Tour wirklich archivieren?"}
              </p>
              <p className="text-xs text-orange-700 mt-1">
                {confirmAction === "loeschen"
                  ? "Der Matterport-Space und alle Tour-Daten werden dauerhaft entfernt. Dieser Vorgang ist nicht rückgängig zu machen."
                  : "Der Matterport-Space wird deaktiviert. Eine Reaktivierung ist kostenpflichtig (CHF 74.–)."}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleAction(confirmAction)}
                  className={`rounded-full px-4 py-1.5 text-xs font-bold text-white ${confirmAction === "loeschen" ? "bg-red-600 hover:bg-red-700" : "bg-orange-600 hover:bg-orange-700"}`}
                >
                  Ja, {confirmAction === "loeschen" ? "dauerhaft löschen" : "archivieren"}
                </button>
                <button type="button" onClick={() => setConfirmAction(null)} className="rounded-full border border-gray-300 px-4 py-1.5 text-xs text-gray-600">
                  Abbrechen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {paymentChoice && !busy && (
        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-4">
          <p className="text-sm font-semibold text-blue-900 mb-1">Zahlungsart wählen</p>
          <p className="text-xs text-blue-700 mb-3">
            Um Ihre Tour zu reaktivieren, wird eine Rechnung über CHF {tour.rule.invoiceAmount}.– erstellt.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handlePayment("online")}
              className="flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-white"
              style={{ background: "linear-gradient(135deg, #B68E20, #7a6318)" }}
            >
              <CreditCard className="h-3.5 w-3.5" />
              Online bezahlen
            </button>
            <button
              type="button"
              onClick={() => void handlePayment("qr")}
              className="flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-4 py-2 text-xs font-bold text-gray-800"
            >
              QR-Rechnung
            </button>
            <button type="button" onClick={() => setPaymentChoice(false)} className="text-xs text-gray-500 underline ml-2">
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {!successMsg && !paymentChoice && !confirmAction && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleAction("weiterfuehren")}
            className="flex items-center justify-center gap-1.5 rounded-xl border-2 border-green-600 bg-green-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-green-700 hover:border-green-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            {tour.status === "ARCHIVED" ? "Reaktivieren" : "Weiterführen"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleAction("archivieren")}
            className="flex items-center justify-center gap-1.5 rounded-xl border-2 border-orange-500 bg-orange-500 px-3 py-2.5 text-xs font-bold text-white hover:bg-orange-600 hover:border-orange-600 disabled:opacity-50 transition-colors shadow-sm"
          >
            <Archive className="h-3.5 w-3.5" />
            Archivieren
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleAction("uebertragen")}
            className="flex items-center justify-center gap-1.5 rounded-xl border-2 border-blue-600 bg-blue-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-blue-700 hover:border-blue-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
            Übertragen
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleAction("loeschen")}
            className="flex items-center justify-center gap-1.5 rounded-xl border-2 border-red-600 bg-red-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-red-700 hover:border-red-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Löschen
          </button>
        </div>
      )}

      {tour.rule.needsInvoice && !successMsg && !paymentChoice && !confirmAction && (
        <p className="mt-2 text-xs text-gray-500 italic">{tour.rule.weiterfuehrenHint}</p>
      )}
    </div>
  );
}

export function CleanupDashboardPage() {
  const [token] = useState(getTokenFromUrl);
  const [tours, setTours] = useState<DashboardTour[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTours = useCallback(async () => {
    if (!token) {
      setError("Kein Zugangs-Token vorhanden. Bitte verwenden Sie den Link aus der E-Mail.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await fetchDashboard(token);
      if (!r.ok) {
        setError(r.error || "Zugang fehlgeschlagen");
        return;
      }
      setTours(r.tours || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Netzwerkfehler");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void loadTours(); }, [loadTours]);

  const pendingTours = tours.filter((t) => !t.cleanupAction);
  const doneTours = tours.filter((t) => !!t.cleanupAction);
  const allDone = tours.length > 0 && pendingTours.length === 0;

  return (
    <div className="min-h-screen" style={{ background: "#f6f4ef" }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(180deg, #fffdf9 0%, #f6f4ef 100%)", borderBottom: "1px solid #ece5d7" }}>
        <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
          <div className="flex items-center justify-center mb-4">
            <span className="inline-block rounded-full border border-[#c9a84c] bg-[#fdf6e3] px-3 py-1 text-[11px] font-bold uppercase tracking-widest" style={{ color: "#6b4e10" }}>
              Propus Tour Manager
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-center text-gray-950" style={{ letterSpacing: "-0.02em" }}>
            Ihre Touren prüfen
          </h1>
          <p className="text-center text-gray-800 text-sm mt-3 max-w-lg mx-auto font-semibold">
            Bitte wählen Sie für jede Tour, was damit passieren soll. Erledigte Touren werden automatisch ausgeblendet.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-6 sm:py-10 space-y-5">
        {loading && (
          <div className="flex flex-col items-center py-16">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#B68E20" }} />
            <p className="text-sm text-gray-500 mt-3">Touren werden geladen…</p>
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-5 text-center">
            <XCircle className="h-8 w-8 text-red-400 mx-auto mb-3" />
            <p className="text-sm text-red-700 font-medium">{error}</p>
            <p className="text-xs text-red-500 mt-2">
              Falls das Problem bestehen bleibt, kontaktieren Sie uns unter{" "}
              <a href="mailto:office@propus.ch" className="underline">office@propus.ch</a>
            </p>
          </div>
        )}

        {allDone && (
          <div className="rounded-2xl border border-green-200 bg-green-50 px-6 py-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-green-900 mb-2">Alles erledigt!</h2>
            <p className="text-sm text-green-700">
              Sie haben für alle Touren eine Aktion gewählt. Vielen Dank für Ihre Rückmeldung.
            </p>
          </div>
        )}

        {!loading && !error && !allDone && pendingTours.length > 0 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {pendingTours.length} Tour{pendingTours.length > 1 ? "en" : ""} offen
              {doneTours.length > 0 && `, ${doneTours.length} erledigt`}
            </p>
            <button
              type="button"
              onClick={() => void loadTours()}
              className="flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Aktualisieren
            </button>
          </div>
        )}

        {pendingTours.map((tour) => (
          <TourCard key={tour.id} tour={tour} token={token} onActionComplete={() => void loadTours()} />
        ))}

        {doneTours.length > 0 && pendingTours.length > 0 && (
          <div className="pt-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-3">Bereits erledigt</p>
            <div className="space-y-3">
              {doneTours.map((tour) => (
                <TourCard key={tour.id} tour={tour} token={token} onActionComplete={() => void loadTours()} />
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        {!loading && !error && (
          <div className="pt-8 pb-4 text-center">
            <div className="h-px bg-gradient-to-r from-transparent via-[#ece5d7] to-transparent mb-6" />
            <p className="text-xs text-gray-400">
              Bei Fragen kontaktieren Sie uns unter{" "}
              <a href="mailto:office@propus.ch" className="text-[#8e7440] hover:underline">office@propus.ch</a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
