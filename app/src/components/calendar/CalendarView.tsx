import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { motion, useAnimationControls } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import type { CalendarEvent } from "../../api/calendar";
import { useAuthStore } from "../../store/authStore";
import { t } from "../../i18n";
import { cn } from "../../lib/utils";
import { getStatusEventColor, getStatusEntry } from "../../lib/status";

const EMPLOYEE_COLOR_PALETTE = [
  "#3b82f6",
  "#a855f7",
  "#14b8a6",
  "#f59e0b",
  "#ef4444",
  "#22c55e",
  "#06b6d4",
  "#ec4899",
  "#8b5cf6",
  "#84cc16",
  "#f97316",
  "#10b981",
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getEmployeeEventColor(photographerKey?: string, photographerName?: string): string {
  const source = String(photographerKey || photographerName || "").trim().toLowerCase();
  if (!source) return "#64748b";
  const idx = hashString(source) % EMPLOYEE_COLOR_PALETTE.length;
  return EMPLOYEE_COLOR_PALETTE[idx];
}

function getEmployeeShortLabel(photographerKey?: string, photographerName?: string): string {
  const name = String(photographerName || "").trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  const key = String(photographerKey || "").trim();
  if (!key) return "NA";
  return key.slice(0, 2).toUpperCase();
}

export function normalizeMojibakeText(input: unknown): string {
  return String(input || "")
    .replace(/Ã‚Â·/g, " · ")
    .replace(/Ãƒâ€šÃ‚Â·/g, " · ")
    .replace(/ÃƒÆ'Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ'Ã¢â‚¬Å¡Ãƒâ€š·/g, " · ")
    .replace(/ÃƒÆ'Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ'Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â·/g, " · ")
    .replace(/\s*Ã[\u00a0-\u00ff\u2018-\u201e]{20,180}\s*/g, " - ")
    .trim();
}

function formatOrderLabel(ext: Record<string, unknown>): string {
  const zipcity = normalizeMojibakeText(ext.zipcity);
  const customerName = normalizeMojibakeText(ext.customerName);
  const parts = [zipcity, customerName].filter(Boolean);
  if (parts.length) return parts.join(" • ");
  const displayLabel = normalizeMojibakeText(ext.displayLabel);
  if (displayLabel) return displayLabel;
  return "";
}

export type CalendarClickedEvent = {
  id: string;
  title: string;
  start?: string;
  end?: string;
  allDay?: boolean;
  type?: string;
  source?: string;
  orderNo?: string;
  address?: string;
  photographerKey?: string;
  photographerName?: string;
  grund?: string;
  status?: string;
  category?: string;
  bodyPreview?: string;
  webLink?: string;
  showAs?: string;
};

type Props = {
  events: CalendarEvent[];
  onEventClick?: (event: CalendarClickedEvent) => void;
  onDateClick?: (dateIso: string) => void;
};

export function CalendarView({
  events,
  onEventClick,
  onDateClick,
}: Props) {
  const uiMode = useAuthStore((s) => s.uiMode);
  const lang = useAuthStore((s) => s.language);
  const [viewportWidth, setViewportWidth] = useState<number>(() => (typeof window !== "undefined" ? window.innerWidth : 1024));
  const transitionControls = useAnimationControls();
  const [transitionTick, setTransitionTick] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const isMobile = viewportWidth < 768;

  useEffect(() => {
    if (transitionTick === 0) return;
    transitionControls.start({
      opacity: [0.96, 1],
      y: [8, 0],
      transition: { duration: 0.22, ease: "easeOut" },
    }).catch(() => {});
  }, [transitionTick, transitionControls]);

  const calendarEvents = useMemo(
    () =>
      events.map((event) => {
        const statusStyle = getStatusEntry(event.status);
        return {
          ...event,
          classNames: [statusStyle.barColor, "border-0", "text-zinc-50"],
        };
      }),
    [events],
  );

  return (
    <div
      className={cn(
        uiMode === "modern" ? "surface-card p-3" : "rounded-xl border border-zinc-200 bg-white p-3 shadow-sm",
        "relative",
        "[&_.fc-event]:cursor-pointer [&_.fc-event]:rounded-md [&_.fc-event]:shadow-sm [&_.fc-event]:transition-opacity [&_.fc-event:hover]:opacity-90",
        "[&_.fc-daygrid-event]:mx-1 [&_.fc-daygrid-event]:my-0.5 [&_.fc-daygrid-event]:px-0.5 [&_.fc-daygrid-event]:py-0.5",
      )}
    >
      <motion.div
        initial={{ opacity: 0.96, y: 10 }}
        animate={transitionControls}
        transition={{ duration: 0.22, ease: "easeOut" }}
      >
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={isMobile ? { left: "today prev,next", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay" } : { left: "today prev,next", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay" }}
          buttonText={{ today: t(lang, "calendar.button.today"), month: t(lang, "calendar.button.month"), week: t(lang, "calendar.button.week"), day: t(lang, "calendar.button.day") }}
          dayMaxEvents={isMobile ? 2 : 4}
          eventDisplay={isMobile ? "list-item" : "auto"}
          eventDidMount={(info) => {
            const ext = info.event.extendedProps as Record<string, unknown>;
            const status = ext.status ? String(ext.status) : undefined;
            const eventType = ext.type ? String(ext.type) : "";
            const employeeColor =
              eventType === "order"
                ? (String(ext.photographerColor || "").trim() || getEmployeeEventColor(
                    ext.photographerKey ? String(ext.photographerKey) : undefined,
                    ext.photographerName ? String(ext.photographerName) : undefined,
                  ))
                : "";
            const payloadColor = ext.color ? String(ext.color) : "";
            const eventColor = employeeColor || payloadColor || getStatusEventColor(status);
            info.el.style.backgroundColor = eventColor;
            info.el.style.borderColor = eventColor;
          }}
          eventContent={(arg) => {
            const ext = arg.event.extendedProps as Record<string, unknown>;
            const status = ext.status ? String(ext.status) : undefined;
            const eventType = ext.type ? String(ext.type) : "";
            const photographerKey = ext.photographerKey ? String(ext.photographerKey) : undefined;
            const photographerName = ext.photographerName ? String(ext.photographerName) : undefined;
            const orderNo = ext.orderNo != null ? String(ext.orderNo) : undefined;
            const displayLabelFromPayload = ext.displayLabel != null ? normalizeMojibakeText(ext.displayLabel) : "";
            const employeeColor =
              eventType === "order"
                ? (String(ext.photographerColor || "").trim() || getEmployeeEventColor(
                    photographerKey,
                    photographerName,
                  ))
                : "";
            const payloadColor = ext.color ? String(ext.color) : "";
            const eventColor = employeeColor || payloadColor || getStatusEventColor(status);
            const statusLabel = getStatusEntry(status).label;
            const statusColor = getStatusEventColor(status);
            const employeeShortLabel = getEmployeeShortLabel(photographerKey, photographerName);
            const orderLabel = formatOrderLabel(ext);
            const normalizedEventTitle = normalizeMojibakeText(arg.event.title);
            const displayTitle = orderNo
              ? (orderLabel || displayLabelFromPayload.trim() || normalizedEventTitle || `#${orderNo}`)
              : normalizedEventTitle;
            return (
              <div className="flex w-full items-center gap-1 overflow-hidden px-1 py-0.5 text-xs leading-tight" title={arg.event.title}>
                {eventType === "order" ? (
                  <span
                    className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded px-1 text-[9px] font-bold uppercase tracking-wide text-white"
                    style={{ backgroundColor: "rgba(0,0,0,0.28)" }}
                    title={photographerName || photographerKey || t(lang, "calendar.label.unknown")}
                  >
                    {employeeShortLabel}
                  </span>
                ) : null}
                <span className="truncate font-medium">{displayTitle}</span>
                {eventType === "order" && orderNo ? (
                  <span
                    className="ml-auto inline-flex shrink-0 items-center rounded px-1.5 py-0 text-[10px] font-semibold text-white"
                    style={{ backgroundColor: "rgba(0,0,0,0.28)" }}
                    title={t(lang, "calendar.tooltip.orderNo").replace("{{orderNo}}", String(orderNo))}
                  >
                    #{orderNo}
                  </span>
                ) : (
                  <span
                    className="ml-auto inline-block h-2.5 w-2.5 shrink-0 rounded-full md:h-2 md:w-2"
                    style={{ backgroundColor: eventType === "order" ? statusColor : eventColor }}
                    title={eventType === "order" ? t(lang, "calendar.tooltip.status").replace("{{label}}", statusLabel) : statusLabel}
                  />
                )}
              </div>
            );
          }}
          moreLinkContent={(arg) => (
            <span className="text-xs font-semibold text-[var(--accent)]">{t(lang, "calendar.label.moreEvents").replace("{{n}}", String(arg.num))}</span>
          )}
          height="auto"
          events={calendarEvents}
          locale="de"
          dateClick={(arg) => {
            if (!onDateClick) return;
            onDateClick(arg.dateStr || arg.date.toISOString());
          }}
          datesSet={() => {
            setTransitionTick((prev) => prev + 1);
          }}
          eventClick={(info) => {
            if (!onEventClick) return;
            const e = info.event;
            const ext = e.extendedProps as Record<string, unknown>;
            onEventClick({
              id: e.id,
              title: normalizeMojibakeText(e.title),
              start: e.start?.toISOString(),
              end: e.end?.toISOString(),
              allDay: e.allDay,
              type: String(ext.type || ""),
              orderNo: ext.orderNo != null ? String(ext.orderNo) : undefined,
              address: ext.address ? String(ext.address) : undefined,
              photographerKey: ext.photographerKey ? String(ext.photographerKey) : undefined,
              photographerName: ext.photographerName ? String(ext.photographerName) : undefined,
              grund: ext.grund ? String(ext.grund) : undefined,
              status: ext.status ? String(ext.status) : undefined,
            });
          }}
        />
      </motion.div>
    </div>
  );
}

