import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { assignPhotographer, rescheduleOrder, updateOrderStatus } from "../api/orders";
import { OrderStatusSelect } from "../components/orders/OrderStatusSelect";
import { getPhotographers, type Photographer } from "../api/photographers";
import { getCalendarEvents, type CalendarEvent } from "../api/calendar";
import { type CalendarClickedEvent, normalizeMojibakeText } from "../components/calendar/CalendarView";
import { CalMiniMonth } from "../components/calendar/CalMiniMonth";
import {
  HandoffCalendarView,
  type CalendarView as CalendarViewKind,
} from "../components/calendar/HandoffCalendarView";
import {
  getWeatherForecast,
  indexForecastByDate,
  weatherEmoji,
  type WeatherForecastDay,
} from "../api/weather";
import { CreateOrderWizard } from "../components/orders/CreateOrderWizard";
import { useAuthStore } from "../store/authStore";
import { t } from "../i18n";
import { formatDateTime } from "../lib/utils";
import { getStatusLabel, STATUS_KEYS, statusMatches } from "../lib/status";
import { FilterBar, PageHeader } from "../components/handoff";

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
  const [searchParams] = useSearchParams();
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
  const [miniMonthAnchor, setMiniMonthAnchor] = useState(() => new Date());
  const [calendarAnchor, setCalendarAnchor] = useState(() => new Date());
  const [calendarView, setCalendarView] = useState<CalendarViewKind>("week");
  const [forecastByDate, setForecastByDate] = useState<ReadonlyMap<string, WeatherForecastDay>>(
    () => new Map(),
  );

  async function load() {
    const [evs, staff] = await Promise.all([getCalendarEvents(token), getPhotographers(token)]);
    setEvents(evs);
    setPhotographers(staff);
  }

  const dateParam = searchParams.get("date");
  useEffect(() => {
    if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return;
    const [yy, mo, da] = dateParam.split("-").map((x) => Number(x));
    if (!yy || !mo || !da) return;
    const parsed = new Date(yy, mo - 1, da);
    if (Number.isNaN(parsed.getTime())) return;
    setCalendarAnchor(parsed);
    setMiniMonthAnchor(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
    setCalendarView("day");
  }, [dateParam]);

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

  useEffect(() => {
    let alive = true;
    const y = miniMonthAnchor.getFullYear();
    const m = miniMonthAnchor.getMonth();
    const gridStart = new Date(y, m, 1);
    const dow = (gridStart.getDay() + 6) % 7;
    gridStart.setDate(gridStart.getDate() - dow - 7);
    const fromIso = `${gridStart.getFullYear()}-${String(gridStart.getMonth() + 1).padStart(2, "0")}-${String(gridStart.getDate()).padStart(2, "0")}`;
    getWeatherForecast(token, { from: fromIso, days: 56, region: "zurich" })
      .then((resp) => {
        if (!alive) return;
        setForecastByDate(indexForecastByDate(resp));
      })
      .catch(() => {
        /* Wetter ist optional */
      });
    return () => {
      alive = false;
    };
  }, [token, miniMonthAnchor]);

  const filtered = useMemo(
    () =>
      events.filter((e) => {
        const statusOk = statusMatches(e.status, filter);
        const employeeOk = photographerFilter === "all" || e.photographerKey === photographerFilter;
        return statusOk && employeeOk;
      }),
    [events, filter, photographerFilter],
  );

  const eventCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of filtered) {
      const d = String(e.start || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
      m.set(d, (m.get(d) ?? 0) + 1);
    }
    return m;
  }, [filtered]);

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
    <div className="padmin-shell">
      <PageHeader
        eyebrow={t(lang, "calendar.eyebrow") || "Planung"}
        title={t(lang, "nav.calendar") || "Kalender"}
        sub={t(lang, "calendar.label.filterDesc")}
        kpis={[{
          id: "events",
          label: t(lang, "calendar.label.eventCount").replace("{{n}}", String(filtered.length)),
          value: String(filtered.length),
          trend: t(lang, "calendar.label.filterDesc"),
        }]}
        actions={(
          <button
            type="button"
            onClick={() => openCreateBooking()}
            className="pad-btn-primary"
          >
            <Plus className="h-3.5 w-3.5" />
            {t(lang, "calendar.button.createBooking")}
          </button>
        )}
      />
      <div className="pad-content space-y-3">
      <div className="cal-layout">
        <aside className="cal-side">
          <CalMiniMonth
            anchor={miniMonthAnchor}
            onChangeAnchor={setMiniMonthAnchor}
            onPickDay={(dateKey) => {
              setCalendarAnchor(new Date(`${dateKey}T00:00:00`));
              setCalendarView("day");
            }}
            eventCounts={eventCounts}
            forecastByDate={forecastByDate}
            selectedDateIso={(() => {
              const y = calendarAnchor.getFullYear();
              const m = String(calendarAnchor.getMonth() + 1).padStart(2, "0");
              const d = String(calendarAnchor.getDate()).padStart(2, "0");
              return `${y}-${m}-${d}`;
            })()}
          />
          <div className="cal-side-card">
            <h4>Filter</h4>
            <FilterBar
              pills={[
                { id: "all", label: t(lang, "common.all") },
                ...STATUS_KEYS.map((s) => ({ id: s, label: getStatusLabel(s) })),
              ]}
              activePillId={filter}
              onPillClick={setFilter}
            />
            <div className="mt-2">
              <label htmlFor="calendarStatusSelect" className="mb-1.5 block text-xs font-medium text-[var(--fg-3)]">
                {t(lang, "calendar.label.status")}
              </label>
              <select
                id="calendarStatusSelect"
                className="ui-input w-full"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                aria-label={t(lang, "calendar.label.status")}
              >
                <option value="all">{t(lang, "common.all")}</option>
                {STATUS_KEYS.map((s) => <option key={s} value={s}>{getStatusLabel(s)}</option>)}
              </select>
            </div>
          </div>
          <div className="cal-side-card">
            <h4>{t(lang, "calendar.label.employee")}</h4>
            <select
              className="ui-input w-full"
              value={photographerFilter}
              onChange={(e) => setPhotographerFilter(e.target.value)}
              aria-label={t(lang, "calendar.label.employee")}
            >
              <option value="all">{t(lang, "common.all")}</option>
              {photographers.map((p) => <option key={p.key} value={p.key}>{p.name} ({p.key})</option>)}
            </select>
            <p className="mt-2 text-xs text-[var(--fg-3)]">
              Wochen- / Tages- / Monatsansicht: Toolbar des Kalenders rechts.
            </p>
          </div>
          <div className="cal-side-card">
            <h4>Wetter · 7 Tage</h4>
            <div className="flex flex-col gap-1">
              {(() => {
                const days: WeatherForecastDay[] = [];
                const start = new Date();
                start.setHours(0, 0, 0, 0);
                for (let i = 0; i < 7; i += 1) {
                  const d = new Date(start);
                  d.setDate(start.getDate() + i);
                  const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                  const fc = forecastByDate.get(k);
                  if (fc) days.push(fc);
                }
                if (days.length === 0) {
                  return (
                    <p className="text-xs text-[var(--fg-3)]">
                      Vorhersage wird geladen …
                    </p>
                  );
                }
                return days.map((fc) => {
                  const d = new Date(`${fc.date}T00:00:00`);
                  const dow = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][d.getDay()];
                  return (
                    <div
                      key={fc.date}
                      className="flex items-center justify-between rounded-md border border-[var(--border)] bg-white/60 px-2 py-1"
                    >
                      <span className="font-mono text-[11px] font-semibold text-[var(--ink)]" style={{ minWidth: 28 }}>
                        {dow}
                      </span>
                      <span className="text-base leading-none" aria-hidden>
                        {weatherEmoji(fc.kind)}
                      </span>
                      <span className="font-mono text-[11px] font-semibold text-[var(--ink)]">
                        {fc.t_max}°/{fc.t_min}°
                      </span>
                      <span className="font-mono text-[10px] text-[var(--fg-3)]">{fc.precip}%</span>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </aside>
        <div className="min-w-0 space-y-2">
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      {savedOk ? <p className="text-sm text-[var(--success)]">{t(lang, "common.saved")}</p> : null}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)]/80 p-10 text-center">
          <p className="text-sm font-medium text-[var(--text-main)]">{t(lang, "calendar.noEventsInRange")}</p>
          <button type="button" className="btn-secondary mt-3" onClick={() => openCreateBooking()}>{t(lang, "calendar.newBooking")}</button>
        </div>
      ) : null}
      <HandoffCalendarView
        events={filtered}
        view={calendarView}
        anchor={calendarAnchor}
        onChangeView={setCalendarView}
        onChangeAnchor={setCalendarAnchor}
        onEventClick={openEvent}
        onDateClick={prepareNewBooking}
        forecastByDate={forecastByDate}
      />
        </div>
      </div>
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
        <>
          <button
            type="button"
            className="sp-overlay open"
            aria-label="Schliessen"
            onClick={() => setSelected(null)}
          />
          <div className="sp-panel open" style={{ maxWidth: 520, width: "100%" }}>
            <div className="sp-head">
              <div className="flex items-center justify-between gap-2">
                <h3 className="m-0 text-base font-semibold text-[var(--text-main)]">{t(lang, "calendar.modal.title")}</h3>
                <button type="button" className="btn-ghost" onClick={() => setSelected(null)}>{t(lang, "common.close")}</button>
              </div>
            </div>
            <div className="sp-body space-y-3 text-sm text-[var(--text-main)]">
              <div className="flex gap-2"><span className="min-w-[100px] font-semibold text-[var(--accent)]">{t(lang, "calendar.label.title")}</span><span>{normalizeMojibakeText(selected.title) || "-"}</span></div>
              <div className="flex gap-2"><span className="min-w-[100px] font-semibold text-[var(--accent)]">{t(lang, "calendar.label.start")}</span><span>{formatDateTime(selected.start)}</span></div>
              <div className="flex gap-2"><span className="min-w-[100px] font-semibold text-[var(--accent)]">{t(lang, "calendar.label.end")}</span><span>{formatDateTime(selected.end)}</span></div>
              <div className="flex gap-2"><span className="min-w-[100px] font-semibold text-[var(--accent)]">{t(lang, "calendar.label.type")}</span><span>{selected.type || "-"}</span></div>
              <div className="flex gap-2"><span className="min-w-[100px] font-semibold text-[var(--accent)]">{t(lang, "calendar.label.address")}</span><span>{selected.address || "-"}</span></div>
              <div className="flex gap-2"><span className="min-w-[100px] font-semibold text-[var(--accent)]">{t(lang, "calendar.label.employeeColon")}</span><span>{selected.photographerName || selected.photographerKey || "-"}</span></div>
              {selected.grund ? <div className="flex gap-2"><span className="min-w-[100px] font-semibold text-[var(--accent)]">{t(lang, "calendar.label.reason")}</span><span>{selected.grund}</span></div> : null}
            </div>

            {selected.orderNo ? (
              <div className="space-y-3 border-t border-[var(--border-soft)] bg-[var(--surface-raised)]/50 p-4 text-sm">
                <div className="text-base font-bold text-[var(--text-main)]">{t(lang, "calendar.label.orderOptions")}</div>
                <div>
                  <label className="mb-1 block text-xs font-semibold p-text-muted">{t(lang, "calendar.label.status")}</label>
                  <OrderStatusSelect
                    orderNo={String(selected.orderNo)}
                    value={status}
                    token={token}
                    disabled={saving}
                    autoSave={false}
                    onChanged={(next) => setStatus(next)}
                    onError={(msg) => setError(msg)}
                  />
                  <label className="mt-3 flex items-start gap-2 text-xs p-text-muted">
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
                  <div className={`mt-2 grid grid-cols-2 gap-2 text-xs ${sendStatusEmails ? "p-text-muted" : "text-zinc-500 opacity-70"}`}>
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
                  <label className="mb-1 block text-xs font-semibold p-text-muted">{t(lang, "orderDetail.section.appointment")}</label>
                  <input type="datetime-local" className="ui-input" value={scheduleLocal} onChange={(e) => setScheduleLocal(e.target.value)} disabled={status.toLowerCase() === "cancelled" || status.toLowerCase() === "paused" || (selected.status || "").toLowerCase() === "cancelled"} />
                  {status.toLowerCase() === "paused" && status !== originalStatus ? (
                    <p className="mt-1 text-[11px] text-amber-400/80">Slot wird bei Pausierung freigegeben.</p>
                  ) : null}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold p-text-muted">{t(lang, "calendar.label.employee")}</label>
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

            <footer className="sp-foot">
              <div className="flex w-full flex-wrap gap-2">
                {selected.orderNo ? (
                  <button
                    type="button"
                    className="btn-primary flex-1"
                    onClick={() => {
                      navigate(`/orders/${encodeURIComponent(String(selected.orderNo))}`);
                      setSelected(null);
                    }}
                  >
                    {t(lang, "calendar.button.goToOrder").replace("{{orderNo}}", String(selected.orderNo))}
                  </button>
                ) : null}
                <button type="button" className="btn-secondary flex-1" onClick={() => setSelected(null)}>OK</button>
              </div>
            </footer>
          </div>
        </>
      ) : null}
      </div>
    </div>
  );
}

