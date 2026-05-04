"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrderEditor, sessionActorId } from "@/lib/auth.server";
import { logOrderEvent, logStatusAuditEntry } from "@/lib/audit";
import { findScheduleConflicts } from "@/lib/repos/orders/conflicts";
import { getOrderForTerminEdit, updateOrderTermin } from "@/lib/repos/orders/termin";
import { getTransitionError, getSideEffects, getEmailEffects } from "@/lib/orderWorkflow/stateMachine";
import { renderWorkflowMails } from "@/lib/mail/workflowMail";
import { queryOne, withTransaction } from "@/lib/db";
import { enqueueOutbox } from "@/lib/outbox";
import { terminFormSchema, type TerminFormValues } from "@/lib/validators/orders/termin";
import { requestAdminReschedule } from "@/lib/booking-calendar-sync.server";
import type { BulkTxOptions } from "../_bulk-tx";

export type SaveTerminResult =
  | { ok: true }
  | { ok: false; error: string; conflicts?: { orderNo: number }[]; fieldErrors?: Record<string, string[] | undefined> };

export type SaveOrderTerminOptions = { skipRedirect?: boolean } & BulkTxOptions;

export async function saveOrderTermin(
  input: unknown,
  options: SaveOrderTerminOptions = {},
): Promise<SaveTerminResult> {
  const { skipRedirect = false, tx, postCommit } = options;
  const editor = await requireOrderEditor();
  const parsed = terminFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Validierung fehlgeschlagen",
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((i) => [i.path.join(".") || "root", [i.message]]),
      ) as Record<string, string[]>,
    };
  }
  const v = parsed.data;
  const order = await getOrderForTerminEdit(v.orderNo, tx);
  if (!order) {
    return { ok: false, error: "Bestellung nicht gefunden" };
  }

  const oldStatus = String(order.status || "pending");
  const mergedForCheck = {
    photographerKey: v.photographerKey,
    schedule: { date: v.scheduleDate, time: v.scheduleTime },
    photographer: { key: v.photographerKey || undefined },
  };
  if (v.status !== oldStatus) {
    const transErr = getTransitionError(
      oldStatus,
      v.status,
      mergedForCheck,
      { source: "api" },
    );
    if (transErr) {
      return { ok: false, error: transErr };
    }
  }

  if (v.photographerKey) {
    const conflicts = await findScheduleConflicts(
      {
        orderNo: v.orderNo,
        photographerKey: v.photographerKey,
        scheduleDate: v.scheduleDate,
        scheduleTime: v.scheduleTime,
        durationMin: v.durationMin,
      },
      tx,
    );
    if (conflicts.length > 0 && !v.overrideConflicts) {
      return {
        ok: false,
        error: "Termin überschneidet sich mit einer anderen Bestellung",
        conflicts: conflicts.map((c) => ({ orderNo: c.orderNo })),
      };
    }
  }

  const scheduleBefore = {
    date: (order.schedule as { date?: string } | null)?.date ?? null,
    time: (order.schedule as { time?: string } | null)?.time ?? null,
    durationMin: (order.schedule as { durationMin?: number } | null)?.durationMin ?? null,
  };
  const photoBefore = order.photographer_key;

  const scheduleChanged =
    v.scheduleDate !== String(scheduleBefore.date || "") ||
    v.scheduleTime !== String(scheduleBefore.time || "") ||
    v.durationMin !== Number(scheduleBefore.durationMin || 0);

  // DB-Mutationen + Audit-Logs zusammen in der (eingehaengten oder
  // selbst geoeffneten) Transaktion.
  await updateOrderTermin(
    {
      orderNo: v.orderNo,
      scheduleDate: v.scheduleDate,
      scheduleTime: v.scheduleTime,
      durationMin: v.durationMin,
      status: v.status,
      photographerKey: v.photographerKey,
    },
    tx,
  );

  const actorId = sessionActorId(editor);

  if (v.status !== oldStatus) {
    await logStatusAuditEntry(
      {
        orderNo: v.orderNo,
        fromStatus: oldStatus,
        toStatus: v.status,
        source: "admin_manual",
        actorId,
      },
      tx,
    );
    await logOrderEvent(
      v.orderNo,
      "status_changed",
      { old: { status: oldStatus }, new: { status: v.status } },
      editor,
      tx,
    );
  }

  if (scheduleChanged) {
    await logOrderEvent(
      v.orderNo,
      "schedule_updated",
      { old: scheduleBefore, new: { date: v.scheduleDate, time: v.scheduleTime, durationMin: v.durationMin } },
      editor,
      tx,
    );
  }

  if (String(photoBefore || "") !== String(v.photographerKey || "")) {
    await logOrderEvent(
      v.orderNo,
      "photographer_assigned",
      { old: { photographer_key: photoBefore }, new: { photographer_key: v.photographerKey } },
      editor,
      tx,
    );
  }

  // Side-Effects (HTTP-Reschedule + Workflow-Mails) post-commit.
  // Im Bulk-Save (postCommit gesetzt) sammeln; sonst direkt ausfuehren.
  const reschedTask =
    scheduleChanged && v.status !== "cancelled"
      ? async () => {
          await requestAdminReschedule(v.orderNo, {
            date: v.scheduleDate,
            time: v.scheduleTime,
            durationMin: v.durationMin,
          });
        }
      : null;

  // Workflow-Mails wandern jetzt in die booking.order_outbox: rendern
  // hier inkl. Empfaenger-Snapshot (billing/photographer-Email zum
  // Zeitpunkt des Status-Wechsels), enqueuen in derselben Tx wie das
  // Order-UPDATE, der Outbox-Worker stellt zu. Damit ueberleben Mails
  // einen Server-Crash zwischen DB-Commit und Mail-Versand
  // (Bug-Hunt T08 HIGH, PR Phase 2a).
  if (v.status !== oldStatus && v.sendEmails) {
    const emailEffects = getEmailEffects(getSideEffects(oldStatus, v.status));
    if (emailEffects.length > 0) {
      const billing = await queryOne<{ email: string | null }>(
        `SELECT billing->>'email' AS email FROM booking.orders WHERE order_no = $1`,
        [v.orderNo],
        tx,
      );
      const photo = v.photographerKey
        ? await queryOne<{ email: string | null }>(
            `SELECT email FROM booking.photographers WHERE key = $1`,
            [v.photographerKey],
            tx,
          )
        : null;
      const targets = v.sendEmailTargets ?? {
        customer: true,
        office: true,
        photographer: true,
        cc: true,
      };
      const rendered = renderWorkflowMails(
        emailEffects,
        {
          orderNo: v.orderNo,
          customerEmail: billing?.email,
          officeEmail: process.env.OFFICE_EMAIL,
          photographerEmail: photo?.email,
          scheduleDate: v.scheduleDate,
          scheduleTime: v.scheduleTime,
        },
        targets,
      );
      // withTransaction(fn, tx) reused tx wenn vorhanden; sonst eigene
      // kurze Tx fuer die Outbox-INSERTs (standalone-Modus).
      await withTransaction(async (insertTx) => {
        for (const mail of rendered) {
          await enqueueOutbox(insertTx, v.orderNo, "workflow_status_mail", {
            to: mail.to,
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
            effect: mail.effect,
            role: mail.role,
            context: `order:${v.orderNo}:status:${oldStatus}->${v.status}:${mail.effect}:${mail.role}`,
          });
        }
      }, tx);
    }
  }

  // Wenn `tx` gesetzt ist, MUSS auch `postCommit` gesetzt sein — sonst
  // wuerde der HTTP-Reschedule mitten in der noch offenen Transaktion
  // abgefeuert und koennte beim Rollback nicht mehr zurueckgenommen
  // werden (CodeRabbit Major #259).
  if (tx && !postCommit) {
    return { ok: false, error: "Interner Fehler: tx ohne postCommit ist nicht erlaubt" };
  }

  if (postCommit) {
    if (reschedTask) postCommit.push(reschedTask);
  } else {
    if (reschedTask) await reschedTask();
  }

  if (tx) return { ok: true };

  revalidatePath(`/orders/${v.orderNo}`);
  revalidatePath(`/orders/${v.orderNo}/termin`);
  if (!skipRedirect) {
    redirect(`/orders/${v.orderNo}/termin?saved=1`);
  }
  return { ok: true };
}
