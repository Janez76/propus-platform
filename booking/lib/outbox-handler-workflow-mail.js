/**
 * Outbox-Handler: workflow_status_mail
 *
 * Liefert eine vom App-Layer (saveOrderTermin) bereits gerenderte Mail.
 * Payload-Schema:
 *   { to, subject, html, text, effect, role, context }
 *
 * Idempotency:
 *   - Outbox-Row-ID wird als `Message-ID`-aehnlicher Header in den
 *     `context`-String eingewoben — bei Retry nach Lease-Reclaim
 *     (siehe outbox-dispatcher.js) wuerde dieselbe Mail-ID erzeugt;
 *     SMTP/Graph-Server deduplizieren das nicht zwingend, aber Ops
 *     kann ueber den Context-String Doppel-Sends im Mail-Diagnostics
 *     korrelieren.
 *   - Fuer harte at-most-once-Garantie braeuchten wir externe
 *     Dedup-Stores; bewusster Trade-off: bei seltenem Worker-Crash
 *     lieber doppelte als verlorene Mail (Bug-Hunt T08 HIGH).
 */

"use strict";

/**
 * Erzeugt einen Handler, der ueber `deps.sendMailWithFallback` zustellt.
 * Wird beim Job-Start mit den Server-Mail-Funktionen geclosed.
 *
 * @param {{ sendMailWithFallback: Function }} deps
 * @returns {(ctx: object) => Promise<void>}
 */
function makeWorkflowStatusMailHandler(deps) {
  if (!deps || typeof deps.sendMailWithFallback !== "function") {
    throw new TypeError(
      "workflow_status_mail handler braucht deps.sendMailWithFallback",
    );
  }
  const { sendMailWithFallback } = deps;

  return async function workflowStatusMailHandler(ctx) {
    const p = ctx?.payload || {};
    const to = String(p.to || "").trim();
    if (!to) {
      // Kein Empfaenger im Payload → fachlich nichts zu tun, nicht als
      // Fehler werten (Handler returnt ohne Throw -> done).
      ctx.log.warn?.(`[outbox/workflow_status_mail] id=${ctx.id} kein "to" im Payload, skip`);
      return;
    }
    const subject = String(p.subject || `Bestellung #${ctx.orderNo}`);
    const html = String(p.html || "");
    const text = String(p.text || "");
    const context = String(
      p.context || `outbox:${ctx.id}:order:${ctx.orderNo}`,
    );

    await sendMailWithFallback({
      to,
      subject,
      html,
      text,
      context,
    });
  };
}

module.exports = { makeWorkflowStatusMailHandler };
