import { getMailFrom, getMailTransport } from "./transport";

type MailTargets = {
  customer: boolean;
  office: boolean;
  photographer: boolean;
  cc: boolean;
};

export type OrderMailContext = {
  orderNo: number;
  customerEmail?: string | null;
  officeEmail?: string | null;
  photographerEmail?: string | null;
  scheduleDate?: string | null;
  scheduleTime?: string | null;
  /** Kurzinfo für erzwungenen Fließtext */
  extraLine?: string;
};

/**
 * Minimaler Mails-Adapter für admin Manual-Status: mappt alte email.*-Effect-Keys auf Sammelversand.
 * (Vollständige HTML-Templates: später aus booking/templates/emails.js portierbar)
 */
const EFFECT_ROLES: Record<string, (keyof MailTargets)[] | "cancel_special"> = {
  "email.confirmed_customer": ["customer"],
  "email.confirmed_office": ["office"],
  "email.confirmed_photographer": ["photographer"],
  "email.provisional_created": ["customer"],
  "email.paused_customer": ["customer"],
  "email.paused_office": ["office"],
  "email.paused_photographer": ["photographer"],
  "email.cancelled_all": "cancel_special",
};

export async function sendWorkflowMails(
  effectKeys: string[],
  ctx: OrderMailContext,
  targets: MailTargets,
  opts?: { dryRun?: boolean },
): Promise<{ sent: string[]; skipped: string[]; errors: string[] }> {
  const sent: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];
  if (opts?.dryRun) {
    for (const e of effectKeys) {
      skipped.push(e);
    }
    return { sent, skipped, errors };
  }
  for (const effect of effectKeys) {
    if (!effect.startsWith("email.")) continue;
    const mapping = EFFECT_ROLES[effect];
    if (!mapping) {
      skipped.push(effect);
      continue;
    }
    if (mapping === "cancel_special") {
      for (const role of ["customer", "office", "photographer"] as const) {
        if (targets[role] && toAddr(role, ctx)) {
          try {
            await sendOne(effect, role, ctx);
            sent.push(`${effect}:${role}`);
          } catch (e) {
            errors.push(String(e instanceof Error ? e.message : e));
          }
        } else {
          skipped.push(`${effect}:${role}`);
        }
      }
      continue;
    }
    for (const role of mapping) {
      if (!targets[role] || !toAddr(role, ctx)) {
        skipped.push(`${effect}:${role}`);
        continue;
      }
      try {
        await sendOne(effect, role, ctx);
        sent.push(`${effect}:${role}`);
      } catch (e) {
        errors.push(String(e instanceof Error ? e.message : e));
      }
    }
  }
  return { sent, skipped, errors };
}

function toAddr(role: keyof MailTargets, ctx: OrderMailContext): string | null {
  if (role === "customer") return ctx.customerEmail || null;
  if (role === "office") return ctx.officeEmail || process.env.OFFICE_EMAIL || null;
  if (role === "photographer") return ctx.photographerEmail || null;
  return null;
}

async function sendOne(effect: string, role: string, ctx: OrderMailContext) {
  const to = toAddr(
    role as keyof MailTargets,
    ctx,
  ) as string;
  if (!to) return;
  const { subject, html } = buildBody(effect, role, ctx);
  const t = getMailTransport();
  await t.sendMail({
    from: getMailFrom(),
    to,
    subject,
    text: html.replace(/<[^>]+>/g, " "),
    html,
  });
}

function buildBody(
  effect: string,
  role: string,
  ctx: OrderMailContext,
): { subject: string; html: string } {
  const wh = [ctx.scheduleDate, ctx.scheduleTime].filter(Boolean).join(" · ");
  const no = String(ctx.orderNo);
  if (effect.includes("confirmed")) {
    return {
      subject: `Bestellung #${no} – Bestätigung`,
      html: `<p>Bestellung <strong>#${no}</strong> bestätigt.</p><p>Termin: ${wh || "—"}</p>${ctx.extraLine ? `<p>${ctx.extraLine}</p>` : ""}`,
    };
  }
  if (effect.includes("provisional")) {
    return {
      subject: `Bestellung #${no} – provisorische Buchung`,
      html: `<p>Bestellung <strong>#${no}</strong>: provisorische Terminbuchung.</p><p>Termin: ${wh || "—"}</p>`,
    };
  }
  if (effect.includes("paused")) {
    return {
      subject: `Bestellung #${no} – pausiert`,
      html: `<p>Bestellung <strong>#${no}</strong> wurde pausiert.</p>`,
    };
  }
  if (effect.includes("cancelled")) {
    return {
      subject: `Bestellung #${no} – storniert`,
      html: `<p>Bestellung <strong>#${no}</strong> wurde storniert.</p>`,
    };
  }
  return {
    subject: `Bestellung #${no} – ${effect}`,
    html: `<p>${effect} (${role})</p><p>Bestellung <strong>#${no}</strong></p>`,
  };
}
