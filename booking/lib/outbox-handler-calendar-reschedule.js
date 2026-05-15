/**
 * Outbox-Handler: calendar_reschedule
 *
 * Loest die gleiche Reschedule-Operation aus wie der Express-Endpoint
 * `PATCH /api/admin/orders/:orderNo/reschedule` — direkt per Funktions-
 * aufruf ohne HTTP-Indirection. Beide Pfade teilen sich
 * `performAdminReschedule` (booking/server.js).
 *
 * Payload-Schema:
 *   { date: "YYYY-MM-DD", time: "HH:MM", durationMin?: number, skipMails?: boolean }
 *
 * skipMails:true unterdrueckt die 3 Reschedule-Mails (Office/Fotograf/
 * Kunde) — Calendar + DB laufen unveraendert. Use Case: KI-Assistant-
 * triggered reschedule wo Kunde bereits telefonisch informiert ist.
 *
 * Idempotency:
 *   performAdminReschedule loescht zuerst die alten Calendar-Events
 *   (per stored event-IDs) und legt frische an. Bei Retry nach
 *   Lease-Reclaim sind die alten IDs durch das DB-Update bereits
 *   genullt — der Retry erzeugt also nur neue Events ohne Duplikate.
 *   Der erste Lauf hat aber bereits beide Events erstellt, daher kann
 *   das DB-Update vor dem Worker-Crash gewinnen → es bleibt EIN Event.
 *   Bei sehr ungluecklichem Timing (Crash zwischen Event-Create und
 *   DB-Update) bleibt ein Orphan-Calendar-Event ohne DB-Referenz —
 *   bewusster Trade-off (lieber Orphan-Event als verlorener Sync).
 */

"use strict";

/**
 * @param {{ performAdminReschedule: Function }} deps
 * @returns {(ctx: object) => Promise<void>}
 */
function makeCalendarRescheduleHandler(deps) {
  if (!deps || typeof deps.performAdminReschedule !== "function") {
    throw new TypeError(
      "calendar_reschedule handler braucht deps.performAdminReschedule",
    );
  }
  const { performAdminReschedule } = deps;

  return async function calendarRescheduleHandler(ctx) {
    const p = ctx?.payload || {};
    const date = String(p.date || "").trim();
    const time = String(p.time || "").trim();
    if (!date || !time) {
      // Unvollstaendiger Payload — als done werten (nichts zu tun); ein
      // throw wuerde unnoetige Retries ausloesen.
      ctx.log.warn?.(
        `[outbox/calendar_reschedule] id=${ctx.id} unvollstaendiger Payload, skip`,
      );
      return;
    }
    const body = {
      date,
      time,
      ...(p.durationMin != null ? { durationMin: Number(p.durationMin) } : {}),
      ...(p.skipMails === true ? { skipMails: true } : {}),
    };

    try {
      await performAdminReschedule({
        orderNo: ctx.orderNo,
        body,
        actor: { user: "outbox-worker", role: "system" },
      });
    } catch (err) {
      // Fachliche Fehler (BAD_REQUEST/NOT_FOUND) sind nicht retry-bar:
      // wenn die Order nicht existiert oder cancelled ist, gibt es nichts
      // zu reschedulen. Als done werten statt in retry-loop hangen
      // (CodeRabbit-style guard fuer permanente Fehler).
      if (err && (err.code === "BAD_REQUEST" || err.code === "NOT_FOUND")) {
        ctx.log.warn?.(
          `[outbox/calendar_reschedule] id=${ctx.id} permanenter Fehler, skip: ${err.message}`,
        );
        return;
      }
      throw err;
    }
  };
}

module.exports = { makeCalendarRescheduleHandler };
