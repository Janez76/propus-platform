"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrderEditor, sessionActorId } from "@/lib/auth.server";
import { logOrderEvent, logStatusAuditEntry } from "@/lib/audit";
import { findScheduleConflicts } from "@/lib/repos/orders/conflicts";
import { getOrderForTerminEdit, updateOrderTermin } from "@/lib/repos/orders/termin";
import { getTransitionError, getSideEffects, getEmailEffects } from "@/lib/orderWorkflow/stateMachine";
import { sendWorkflowMails } from "@/lib/mail/workflowMail";
import { queryOne } from "@/lib/db";
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

  const mailTask =
    v.status !== oldStatus && v.sendEmails
      ? async () => {
          const effects = getSideEffects(oldStatus, v.status);
          const emailEffects = getEmailEffects(effects);
          if (emailEffects.length === 0) return;
          const billing = await queryOne<{
            email: string | null;
          }>(`SELECT billing->>'email' AS email FROM booking.orders WHERE order_no = $1`, [v.orderNo]);
          const photo = v.photographerKey
            ? await queryOne<{ email: string | null }>(
                `SELECT email FROM booking.photographers WHERE key = $1`,
                [v.photographerKey],
              )
            : null;
          const targets = v.sendEmailTargets ?? {
            customer: true,
            office: true,
            photographer: true,
            cc: true,
          };
          const result = await sendWorkflowMails(
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
            {},
          );
          if (result.errors.length > 0) {
            await logOrderEvent(
              v.orderNo,
              "note_added",
              {
                old: {},
                new: { mailErrors: result.errors, mailSent: result.sent },
              },
              editor,
            );
          }
        }
      : null;

  if (postCommit) {
    if (reschedTask) postCommit.push(reschedTask);
    if (mailTask) postCommit.push(mailTask);
  } else {
    if (reschedTask) await reschedTask();
    if (mailTask) await mailTask();
  }

  if (tx) return { ok: true };

  revalidatePath(`/orders/${v.orderNo}`);
  revalidatePath(`/orders/${v.orderNo}/termin`);
  if (!skipRedirect) {
    redirect(`/orders/${v.orderNo}/termin?saved=1`);
  }
  return { ok: true };
}
