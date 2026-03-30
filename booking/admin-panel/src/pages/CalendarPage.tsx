import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { assignPhotographer, rescheduleOrder, updateOrderStatus } from "../api/orders";
import { OrderStatusSelect } from "../components/orders/OrderStatusSelect";
import { getPhotographers, type Photographer } from "../api/photographers";
import { getCalendarEvents, type CalendarEvent } from "../api/calendar";
import { CalendarView, type CalendarClickedEvent, normalizeMojibakeText } from "../components/calendar/CalendarView";
import { CreateOrderWizard } from "../components/orders/CreateOrderWizard";
import { useAuthStore } from "../store/authStore";
import { t } from "../i18n";
import { formatDateTime } from "../lib/utils";
import { getStatusLabel, STATUS_KEYS, statusMatches } from "../lib/status";

const DEFAULT_STATUS_EMAIL_TARGETS = {
  customer: false,
  office: false,
  photographer: false,
  cc: false,
};

function toDateTimeLocal(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CalendarPage() {
  const token = useAuthStore((s) => s.token);
  const lang = useAuthStore((s) => s.language);
  const navigate = useNavigate();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [filter, setFilter] = useState("all");
  const [photographerFilter, setPhotographerFilter] = useState("all");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<CalendarClickedEvent | null>(null);
  const [status, setStatus] = useState("pending");
  const [originalStatus, setOriginalStatus] = useState("pending");
  const [sendStatusEmails, setSendStatusEmails] = useState(false);
  const [statusEmailTargets, setStatusEmailTargets] = useState(DEFAULT_STATUS_EMAIL_TARGETS);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [scheduleLocal, setScheduleLocal] = useState("");
  const [photographerKey, setPhotographerKey] = useState("");
  const [photographers, setPhotographers] = useState<Photographer[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [prefilledDate, setPrefilledDate] = useState<string | undefined>(undefined);

  async function load() {
    const [evs, staff] = await Promise.all([getCalendarEvents(token), getPhotographers(token)]);
    setEvents(evs);
    setPhotographers(staff);
  }

  useEffect(() => {
    let alive = true;
    Promise.all([getCalendarEvents(token), getPhotographers(token)])
      .then(([evs, staff]) => {
        if (!alive) return;
        setEvents(evs);
        setPhotographers(staff);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : t(lang, "common.error"));
      });
    return () => { alive = false; };
  }, [token]);

  const filtered = useMemo(
    () =>
      events.filter((e) => {
        const statusOk = statusMatches(e.status, filter);
        const employeeOk = photographerFilter === "all" || e.photographerKey === photographerFilter;
        return statusOk && employeeOk;
      }),
    [events, filter, photographerFilter],
  );

  function openEvent(ev: CalendarClickedEvent) {
    setSelected(ev);
    setStatus(ev.status || "pending");
    setOriginalStatus(ev.status || "pending");
    setSendStatusEmails(false);
    setStatusEmailTargets(DEFAULT_STATUS_EMAIL_TARGETS);
    setScheduleLocal(toDateTimeLocal(ev.start));
    setPhotographerKey(ev.photographerKey || "");
  }

  function toDateInputValue(dateIso: string): string | undefined {
    const date = String(dateIso || "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
  }

  function openCreateBooking(dateIso?: string) {
    setPrefilledDate(dateIso ? toDateInputValue(dateIso) : undefined);
    setShowCreate(true);
  }

  function prepareNewBooking(dateIso: string) {
    openCreateBooking(dateIso);
  }

  async function saveStatusWithOverride(orderNo: string, nextStatus: string) {
    try {
      await updateOrderStatus(token, orderNo, nextStatus, {
        sendEmails: sendStatusEmails,
        sendEmailTargets: statusEmailTargets,
      });
      return;
    } catch (error) {
      const conflict = error as Error & { code?: string; canOverride?: boolean };
      if (conflict?.code !== "SLOT_OCCUPIED_CAN_OVERRIDE" || !conflict?.canOverride) {
        throw error;
      }
      const shouldOverride = window.confirm("Der Slot ist durch eine andere Buchung belegt. Trotzdem speichern?");
      if (!shouldOverride) {
        const cancelled = new Error("Speichern abgebrochen.");
        (cancelled as Error & { cancelledByUser?: boolean }).cancelledByUser = true;
        throw cancelled;
      }
      await updateOrderStatus(token, orderNo, nextStatus, {
        sendEmails: sendStatusEmails,
        sendEmailTargets: statusEmailTargets,
        forceSlot: true,
        overrideReason: "Admin-Override nach Warnung: Slot belegt",
      });
    }
  }

  async function saveOrderChanges() {
    if (!selected?.orderNo) return;
    const orderNo = String(selected.orderNo);
    const scheduleChanged = scheduleLocal !== toDateTimeLocal(selected.start);
    const photographerChanged = photographerKey !== (selected.photographerKey || "");
    const statusChanged = status !== originalStatus;
    if (!statusChanged && !scheduleChanged && !photographerChanged) return;
    setError("");
    try {
      const cancelled = status.toLowerCase() === "cancelled" || originalStatus.toLowerCase() === "cancelled";
      const paused = status.toLowerCase() === "paused";
      if ((cancelled || paused) && scheduleLocal && scheduleLocal !== toDateTimeLocal(selected.start)) {
        setError(paused ? "Bei Pausierung kann kein neuer Termin gesetzt werden." : t(lang, "calendar.error.cancelledReschedule"));
        return;
      }
      setSaving(true);
      if (statusChanged) {
        await saveStatusWithOverride(orderNo, status);
      }
      if (scheduleLocal) {
        const [date, time] = scheduleLocal.split("T");
        if (!cancelled && !paused && date && time) await rescheduleOrder(token, orderNo, date, time);
        if (!date || !time) {
          setError(t(lang, "orderDetail.error.invalidDateTime"));
          return;
        }
      }
      if (photographerKey) {
        await assignPhotographer(token, orderNo, photographerKey);
      }
      await load();
      setOriginalStatus(status);
      setSendStatusEmails(false);
      setStatusEmailTargets(DEFAULT_STATUS_EMAIL_TARGETS);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
    } catch (e) {
      if ((e as Error & { cancelledByUser?: boolean })?.cancelledByUser) {
        setSaving(false);
        return;
      }
      if (status !== originalStatus) {
        setStatus(originalStatus);
      }
      setError(e instanceof Error ? e.message : t(lang, "calendar.error.changeFailed"));
    } finally {
      setSaving(false);
    }
  }

  const selectedHasChanges = selected
    ? status !== originalStatus ||
      scheduleLocal !== toDateTimeLocal(selected.start) ||
      photographerKey !== (selected.photographerKey || "")
    : false;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/60 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-zinc-200">{t(lang, "calendar.label.filter")}</h2>
            <p className="text-xs text-zinc-400">{t(lang, "calendar.label.filterDesc")}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/15 px-3 py-1 text-xs font-bold text-[var(--accent)]">
              {t(lang, "calendar.label.eventCount").replace("{{n}}", String(filtered.length))}
            </span>
            <button
              type="button"
              onClick={() => openCreateBooking()}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-[var(--accent-hover)]"
            >
              <Plus className="h-3.5 w-3.5" />
              {t(lang, "calendar.button.createBooking")}
            </button>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-zinc-800/70 bg-zinc-950/50 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
            <label htmlFor="calendarStatusFilter" className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">
              {t(lang, "calendar.label.status")}
            </label>
            <select id="calendarStatusFilter" name="calendarStatusFilter" aria-label={t(lang, "calendar.label.status")} className="ui-input w-full" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">{t(lang, "common.all")}</option>
              {STATUS_KEYS.map((s) => <option key={s} value={s}>{getStatusLabel(s)}</option>)}
            </select>
          </div>
          <div className="rounded-xl border border-zinc-800/70 bg-zinc-950/50 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
            <label htmlFor="calendarPhotographerFilter" className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">
              {t(lang, "calendar.label.employee")}
            </label>
            <select
              id="calendarPhotographerFilter"
              name="calendarPhotographerFilter"
              aria-label={t(lang, "calendar.label.employee")}
              className="ui-input w-full"
              value={photographerFilter}
              onChange={(e) => setPhotographerFilter(e.target.value)}
            >
              <option value="all">{t(lang, "common.all")}</option>
              {photographers.map((p) => <option key={p.key} value={p.key}>{p.name} ({p.key})</option>)}
            </select>
          </div>
        </div>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {savedOk ? <p className="text-sm text-emerald-600">{t(lang, "common.saved")}</p> : null}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-zinc-800/40 bg-zinc-900/30 p-10 text-center">
          <p className="text-sm font-medium text-zinc-300">{t(lang, "calendar.noEventsInRange")}</p>
          <button className="btn-secondary mt-3" onClick={() => openCreateBooking()}>{t(lang, "calendar.newBooking")}</button>
        </div>
      ) : null}
      <CalendarView
        events={filtered}
        onEventClick={openEvent}
        onDateClick={prepareNewBooking}
      />
      <CreateOrderWizard
        token={token}
        open={showCreate}
        onOpenChange={(open) => {
          setShowCreate(open);
          if (!open) setPrefilledDate(undefined);
        }}
        initialDate={prefilledDate}
        onSuccess={async () => {
          await load();
          setShowCreate(false);
          setPrefilledDate(undefined);
        }}
      />

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-2 sm:p-4">
          <div className="w-full max-w-full sm:max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-zinc-900 border border-zinc-800 p-4 sm:p-6 shadow-2xl my-auto">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-zinc-100">{t(lang, "calendar.modal.title")}</h3>
              <button className="btn-secondary" onClick={() => setSelected(null)}>{t(lang, "common.close")}</button>
            </div>
            <div className="space-y-3 text-sm text-zinc-300">
              <div className="flex gap-2"><span className="font-semibold text-[var(--accent)] min-w-[100px]">{t(lang, "calendar.label.title")}</span><span>{normalizeMojibakeText(selected.title) || "-"}</span></div>
              <div className="flex gap-2"><span className="font-semibold text-[var(--accent)] min-w-[100px]">{t(lang, "calendar.label.start")}</span><span>{formatDateTime(selected.start)}</span></div>
              <div className="flex gap-2"><span className="font-semibold text-[var(--accent)] min-w-[100px]">{t(lang, "calendar.label.end")}</span><span>{formatDateTime(selected.end)}</span></div>
              <div className="flex gap-2"><span className="font-semibold text-[var(--accent)] min-w-[100px]">{t(lang, "calendar.label.type")}</span><span>{selected.type || "-"}</span></div>
              <div className="flex gap-2"><span className="font-semibold text-[var(--accent)] min-w-[100px]">{t(lang, "calendar.label.address")}</span><span>{selected.address || "-"}</span></div>
              <div className="flex gap-2"><span className="font-semibold text-[var(--accent)] min-w-[100px]">{t(lang, "calendar.label.employeeColon")}</span><span>{selected.photographerName || selected.photographerKey || "-"}</span></div>
              {selected.grund ? <div className="flex gap-2"><span className="font-semibold text-[var(--accent)] min-w-[100px]">{t(lang, "calendar.label.reason")}</span><span>{selected.grund}</span></div> : null}
            </div>

            {selected.orderNo ? (
              <div className="mt-4 space-y-3 p-4 rounded-lg bg-zinc-800/50 border border-zinc-700 text-sm">
                <div className="font-bold text-zinc-100 text-base">{t(lang, "calendar.label.orderOptions")}</div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-400">{t(lang, "calendar.label.status")}</label>
                  <OrderStatusSelect
                    orderNo={String(selected.orderNo)}
                    value={status}
                    token={token}
                    disabled={saving}
                    autoSave={false}
                    onChanged={(next) => setStatus(next)}
                    onError={(msg) => setError(msg)}
                  />
                  <label className="mt-3 flex items-start gap-2 text-xs text-zinc-400">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={sendStatusEmails}
                      onChange={(e) => setSendStatusEmails(e.target.checked)}
                      disabled={saving}
                    />
                    <span>
                      {t(lang, "orderStatus.sendEmailsLabel")}
                      <span className="block text-[11px] text-zinc-500">
                        {t(lang, "orderStatus.sendEmailsHint")}
                      </span>
                    </span>
                  </label>
                  <div className={`mt-2 grid grid-cols-2 gap-2 text-xs ${sendStatusEmails ? "text-zinc-400" : "text-zinc-500 opacity-70"}`}>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={statusEmailTargets.customer}
                          onChange={(e) => setStatusEmailTargets((prev) => ({ ...prev, customer: e.target.checked }))}
                          disabled={saving || !sendStatusEmails}
                        />
                        <span>{t(lang, "orderStatus.target.customer")}</span>
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={statusEmailTargets.office}
                          onChange={(e) => setStatusEmailTargets((prev) => ({ ...prev, office: e.target.checked }))}
                          disabled={saving || !sendStatusEmails}
                        />
                        <span>{t(lang, "orderStatus.target.office")}</span>
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={statusEmailTargets.photographer}
                          onChange={(e) => setStatusEmailTargets((prev) => ({ ...prev, photographer: e.target.checked }))}
                          disabled={saving || !sendStatusEmails}
                        />
                        <span>{t(lang, "orderStatus.target.photographer")}</span>
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={statusEmailTargets.cc}
                          onChange={(e) => setStatusEmailTargets((prev) => ({ ...prev, cc: e.target.checked }))}
                          disabled={saving || !sendStatusEmails}
                        />
                        <span>{t(lang, "orderStatus.target.cc")}</span>
                      </label>
                    </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-400">{t(lang, "orderDetail.section.appointment")}</label>
                  <input type="datetime-local" className="ui-input" value={scheduleLocal} onChange={(e) => setScheduleLocal(e.target.value)} disabled={status.toLowerCase() === "cancelled" || status.toLowerCase() === "paused" || (selected.status || "").toLowerCase() === "cancelled"} />
                  {status.toLowerCase() === "paused" && status !== originalStatus ? (
                    <p className="mt-1 text-[11px] text-amber-400/80">Slot wird bei Pausierung freigegeben.</p>
                  ) : null}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-400">{t(lang, "calendar.label.employee")}</label>
                  <select className="ui-input" value={photographerKey} onChange={(e) => setPhotographerKey(e.target.value)}>
                    <option value="">{t(lang, "calendar.select.pleaseChoose")}</option>
                    {photographers.map((p) => <option key={p.key} value={p.key}>{p.name} ({p.key})</option>)}
                  </select>
                </div>
                <button className="btn-primary w-full" disabled={saving || !selectedHasChanges} onClick={saveOrderChanges}>
                  {saving ? t(lang, "common.saving") : t(lang, "common.save")}
                </button>
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              {selected.orderNo ? (
                <button className="btn-primary flex-1" onClick={() => { navigate(`/orders?open=${encodeURIComponent(selected.orderNo || "")}`); setSelected(null); }}>
                  {t(lang, "calendar.button.goToOrder").replace("{{orderNo}}", String(selected.orderNo))}
                </button>
              ) : null}
              <button className="btn-secondary flex-1" onClick={() => setSelected(null)}>OK</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}


