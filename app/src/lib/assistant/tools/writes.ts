import { query as defaultQuery, queryOne as defaultQueryOne } from "@/lib/db";
import { normalizeTimestamptzParam } from "@/lib/pg-timestamptz";
import { getAllowedTransitions, normalizeStatusKey } from "@/lib/status";
import type { ToolContext, ToolDefinition, ToolHandler } from "./index";

type QueryFn = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
type QueryOneFn = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T | null>;

type WriteDeps = {
  query: QueryFn;
  queryOne: QueryOneFn;
};

function requireString(value: unknown, label: string): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) throw new Error(`${label} ist erforderlich`);
  return s;
}

function optionalString(value: unknown): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s || null;
}

function optionalPositiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export const writeTools: ToolDefinition[] = [
  {
    name: "create_posteingang_task",
    description: "Erstellt eine neue Aufgabe im Posteingang-System.",
    kind: "write",
    requiresConfirmation: true,
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Titel der Aufgabe" },
        description: { type: "string", description: "Optionale Beschreibung" },
        priority: { type: "string", description: "normal | high | low (Default: normal)" },
        due_at: { type: "string", description: "Fälligkeitsdatum (ISO 8601, optional)" },
        conversation_id: { type: "number", description: "Verknüpfte Konversations-ID (optional)" },
        customer_id: { type: "number", description: "Verknüpfte Kunden-ID (optional)" },
      },
      required: ["title"],
    },
  },
  {
    name: "create_ticket",
    description: "Erstellt ein neues Ticket im Ticket-System.",
    kind: "write",
    requiresConfirmation: true,
    input_schema: {
      type: "object",
      properties: {
        module: { type: "string", description: "tours | booking" },
        subject: { type: "string", description: "Betreff des Tickets" },
        description: { type: "string", description: "Optionale Beschreibung" },
        category: { type: "string", description: "startpunkt | name_aendern | blur_request | sweep_verschieben | sonstiges" },
        priority: { type: "string", description: "normal | high | low (Default: normal)" },
        reference_id: { type: "string", description: "Referenz-ID (Tour-ID oder Auftrags-Nr.)" },
        reference_type: { type: "string", description: "tour | order" },
      },
      required: ["module", "subject"],
    },
  },
  {
    name: "create_posteingang_note",
    description: "Erstellt eine interne Notiz in einer Posteingang-Konversation.",
    kind: "write",
    requiresConfirmation: true,
    input_schema: {
      type: "object",
      properties: {
        conversation_id: { type: "number", description: "Konversations-ID" },
        body_text: { type: "string", description: "Notiztext" },
      },
      required: ["conversation_id", "body_text"],
    },
  },
  {
    name: "draft_email",
    description: "Bereitet einen E-Mail-Entwurf vor (wird NICHT gesendet). Der Admin kann ihn dann manuell über Posteingang oder Outlook versenden.",
    kind: "write",
    requiresConfirmation: true,
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Empfänger-E-Mail" },
        subject: { type: "string", description: "Betreff" },
        body_html: { type: "string", description: "E-Mail-Inhalt (HTML)" },
      },
      required: ["to", "subject", "body_html"],
    },
  },
  {
    name: "update_order_status",
    description: "Ändert den Status eines Buchungsauftrags. Nur erlaubte Übergänge werden akzeptiert.",
    kind: "write",
    requiresConfirmation: true,
    input_schema: {
      type: "object",
      properties: {
        order_no: { type: "number", description: "Auftragsnummer" },
        new_status: { type: "string", description: "Neuer Status (pending, provisional, confirmed, paused, completed, done, cancelled, archived)" },
        note: { type: "string", description: "Optionale Notiz zur Statusänderung" },
      },
      required: ["order_no", "new_status"],
    },
  },
  {
    name: "create_order",
    description:
      "Erstellt einen neuen Buchungsauftrag. Nutze dieses Tool am Ende des Auftragsanlage-Gesprächs, nachdem alle Pflichtfelder gesammelt und dem Benutzer zur Bestätigung zusammengefasst wurden.",
    kind: "write",
    requiresConfirmation: true,
    input_schema: {
      type: "object",
      properties: {
        customer_id: { type: "number", description: "Kunden-ID (aus search_customers)" },
        address: { type: "string", description: "Objektadresse (wo fotografiert werden soll)" },
        services: {
          type: "object",
          description: "Gewählte Dienstleistungen als Boolean-Flags",
          properties: {
            photography: { type: "boolean" },
            drone: { type: "boolean" },
            matterport: { type: "boolean" },
            floorplan: { type: "boolean" },
            video: { type: "boolean" },
            staging: { type: "boolean" },
          },
        },
        schedule_date: { type: "string", description: "Wunschtermin Datum (ISO, z.B. 2026-05-15)" },
        schedule_time: { type: "string", description: "Wunschtermin Uhrzeit (HH:mm, z.B. 10:00)" },
        photographer_key: { type: "string", description: "Fotografen-Schlüssel (optional, aus list_photographers)" },
        notes: { type: "string", description: "Zusätzliche Hinweise oder Notizen (optional)" },
      },
      required: ["customer_id", "address", "services"],
    },
  },
];

const VALID_PRIORITIES = new Set(["normal", "high", "low"]);
const VALID_MODULES = new Set(["tours", "booking"]);
const VALID_CATEGORIES = new Set(["startpunkt", "name_aendern", "blur_request", "sweep_verschieben", "sonstiges"]);
const VALID_REF_TYPES = new Set(["tour", "order"]);

export function createWriteHandlers(deps: WriteDeps): Record<string, ToolHandler> {
  const runQuery = deps.query;
  const runQueryOne = deps.queryOne;

  return {
    create_posteingang_task: async (input: Record<string, unknown>, ctx: ToolContext) => {
      const title = requireString(input.title, "title");
      const description = optionalString(input.description);
      const priority = optionalString(input.priority);
      if (priority && !VALID_PRIORITIES.has(priority)) {
        return { error: `Ungültige Priorität: ${priority}. Erlaubt: normal, high, low` };
      }
      const dueAtRaw = optionalString(input.due_at);
      let dueAtIso: string | null = null;
      if (dueAtRaw) {
        dueAtIso = normalizeTimestamptzParam(dueAtRaw);
        if (!dueAtIso) {
          return {
            error:
              "due_at: ungültiges Datumsformat. Bitte ISO 8601 verwenden (z. B. 2026-05-15 oder 2026-05-15T10:00:00Z).",
          };
        }
      }
      const conversationId = optionalPositiveInt(input.conversation_id);
      const customerId = optionalPositiveInt(input.customer_id);

      const row = await runQueryOne<{ id: number }>(
        `INSERT INTO tour_manager.posteingang_tasks (title, description, status, priority, due_at, conversation_id, customer_id)
         VALUES ($1, $2, 'open', $3, $4::timestamptz, $5, $6)
         RETURNING id`,
        [title, description, priority || "normal", dueAtIso, conversationId, customerId],
      );

      return { ok: true, taskId: row?.id, message: `Aufgabe "${title}" erstellt.` };
    },

    create_ticket: async (input: Record<string, unknown>, ctx: ToolContext) => {
      const module = requireString(input.module, "module").toLowerCase();
      if (!VALID_MODULES.has(module)) {
        return { error: `Ungültiges Modul: ${module}. Erlaubt: tours, booking` };
      }
      const subject = requireString(input.subject, "subject");
      const description = optionalString(input.description);
      const category = optionalString(input.category);
      if (category && !VALID_CATEGORIES.has(category)) {
        return { error: `Ungültige Kategorie: ${category}. Erlaubt: startpunkt, name_aendern, blur_request, sweep_verschieben, sonstiges` };
      }
      const priority = optionalString(input.priority);
      if (priority && !VALID_PRIORITIES.has(priority)) {
        return { error: `Ungültige Priorität: ${priority}. Erlaubt: normal, high, low` };
      }
      const referenceId = optionalString(input.reference_id);
      const referenceType = optionalString(input.reference_type);
      if (referenceType && !VALID_REF_TYPES.has(referenceType)) {
        return { error: `Ungültiger reference_type: ${referenceType}. Erlaubt: tour, order` };
      }

      const row = await runQueryOne<{ id: number }>(
        `INSERT INTO tour_manager.tickets (module, subject, description, category, priority, reference_id, reference_type, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', $8)
         RETURNING id`,
        [module, subject, description, category || "sonstiges", priority || "normal", referenceId, referenceType, ctx.userEmail],
      );

      return { ok: true, ticketId: row?.id, message: `Ticket "${subject}" erstellt.` };
    },

    create_posteingang_note: async (input: Record<string, unknown>, ctx: ToolContext) => {
      const conversationId = optionalPositiveInt(input.conversation_id);
      if (!conversationId) return { error: "conversation_id ist erforderlich" };
      const bodyText = requireString(input.body_text, "body_text");

      const conv = await runQueryOne<{ id: number }>(
        `SELECT id FROM tour_manager.posteingang_conversations WHERE id = $1`,
        [conversationId],
      );
      if (!conv) return { error: `Konversation ${conversationId} nicht gefunden` };

      const row = await runQueryOne<{ id: number }>(
        `INSERT INTO tour_manager.posteingang_messages (
           conversation_id, direction, from_name, from_email,
           to_emails, cc_emails, bcc_emails, subject, body_html, body_text, sent_at
         )
         VALUES ($1, 'internal_note', $2, $3, '{}', '{}', '{}', NULL, NULL, $4, NOW())
         RETURNING id`,
        [conversationId, ctx.userEmail.split("@")[0], ctx.userEmail, bodyText],
      );

      await runQuery(
        `UPDATE tour_manager.posteingang_conversations SET updated_at = NOW() WHERE id = $1`,
        [conversationId],
      );

      return { ok: true, messageId: row?.id, message: "Interne Notiz erstellt." };
    },

    draft_email: async (input: Record<string, unknown>, ctx: ToolContext) => {
      const to = requireString(input.to, "to");
      const subject = requireString(input.subject, "subject");
      const bodyHtml = requireString(input.body_html, "body_html");

      return {
        ok: true,
        draft: { to, subject, bodyHtml },
        message: `E-Mail-Entwurf an ${to} vorbereitet. Bitte manuell über Posteingang oder Outlook versenden.`,
      };
    },

    create_order: async (input: Record<string, unknown>, ctx: ToolContext) => {
      const customerId = optionalPositiveInt(input.customer_id);
      if (!customerId) return { error: "customer_id ist erforderlich" };
      const address = requireString(input.address, "address");

      const customer = await runQueryOne<{ id: number; name: string | null; email: string | null; company: string | null }>(
        `SELECT id, name, email, company FROM core.customers WHERE id = $1`,
        [customerId],
      );
      if (!customer) return { error: `Kunde ${customerId} nicht gefunden` };

      const services = (input.services && typeof input.services === "object") ? input.services as Record<string, unknown> : {};
      const VALID_SERVICE_KEYS = new Set(["photography", "drone", "matterport", "floorplan", "video", "staging"]);
      const servicesJson: Record<string, boolean> = {};
      for (const [key, value] of Object.entries(services)) {
        if (VALID_SERVICE_KEYS.has(key) && value === true) {
          servicesJson[key] = true;
        }
      }
      if (Object.keys(servicesJson).length === 0) {
        return { error: "Mindestens eine Dienstleistung muss ausgewählt sein" };
      }

      const scheduleDate = optionalString(input.schedule_date);
      const scheduleTime = optionalString(input.schedule_time);
      const photographerKey = optionalString(input.photographer_key);
      const notes = optionalString(input.notes);

      if (photographerKey) {
        const photographer = await runQueryOne<{ key: string }>(
          `SELECT key FROM booking.photographers WHERE key = $1 AND active = TRUE`,
          [photographerKey],
        );
        if (!photographer) return { error: `Fotograf "${photographerKey}" nicht gefunden oder nicht aktiv` };
      }

      const status = scheduleDate ? "pending" : "pending";

      const scheduleJson = scheduleDate ? { date: scheduleDate, ...(scheduleTime ? { time: scheduleTime } : {}) } : {};
      const photographerJson = photographerKey ? { key: photographerKey } : {};
      const billingJson = {
        name: customer.name || customer.company || "",
        email: customer.email || "",
        ...(customer.company ? { company: customer.company } : {}),
      };
      const objectJson = { type: "Immobilie" };
      const settingsJson = notes ? { assistant_notes: notes } : {};

      // order_no nicht mehr per MAX(order_no)+1 (TOCTOU-Race), sondern über
      // die Postgres-Sequence aus Migration 055. order_no weglassen → DEFAULT
      // greift, RETURNING liefert die allokierte Nummer.
      const row = await runQueryOne<{ order_no: number }>(
        `INSERT INTO booking.orders (customer_id, status, address, object, services, photographer, schedule, billing, pricing, settings_snapshot)
         VALUES (
           $1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, '{}'::jsonb, $9::jsonb
         )
         RETURNING order_no`,
        [
          customerId,
          status,
          address,
          JSON.stringify(objectJson),
          JSON.stringify(servicesJson),
          JSON.stringify(photographerJson),
          JSON.stringify(scheduleJson),
          JSON.stringify(billingJson),
          JSON.stringify(settingsJson),
        ],
      );

      if (!row?.order_no) return { error: "Auftrag konnte nicht erstellt werden" };

      return {
        ok: true,
        orderNo: row.order_no,
        customerId,
        customerName: customer.name || customer.company,
        address,
        services: Object.keys(servicesJson),
        schedule: scheduleDate ? { date: scheduleDate, time: scheduleTime } : null,
        photographer: photographerKey,
        status,
        message: `Auftrag #${row.order_no} für "${customer.name || customer.company}" an "${address}" erstellt.`,
      };
    },

    update_order_status: async (input: Record<string, unknown>, ctx: ToolContext) => {
      const orderNo = optionalPositiveInt(input.order_no);
      if (!orderNo) return { error: "order_no ist erforderlich" };

      const newStatus = requireString(input.new_status, "new_status").toLowerCase();
      const normalizedNew = normalizeStatusKey(newStatus);
      if (!normalizedNew) return { error: `Ungültiger Status: ${newStatus}` };

      const note = optionalString(input.note);

      const order = await runQueryOne<{ status: string }>(
        `SELECT status FROM booking.orders WHERE order_no = $1`,
        [orderNo],
      );
      if (!order) return { error: `Auftrag ${orderNo} nicht gefunden` };

      const allowed = getAllowedTransitions(order.status);
      if (!allowed.includes(normalizedNew)) {
        return {
          error: `Statusübergang von "${order.status}" nach "${normalizedNew}" ist nicht erlaubt. Erlaubt: ${allowed.join(", ") || "keine"}`,
        };
      }

      await runQuery(
        `UPDATE booking.orders SET status = $1 WHERE order_no = $2`,
        [normalizedNew, orderNo],
      );

      await runQuery(
        `INSERT INTO booking.order_status_audit (order_no, from_status, to_status, source, actor_id, calendar_result, error_message)
         VALUES ($1, $2, $3, 'api', $4, 'not_required', $5)`,
        [orderNo, order.status, normalizedNew, ctx.userEmail, note],
      );

      return {
        ok: true,
        orderNo,
        oldStatus: order.status,
        newStatus: normalizedNew,
        message: `Auftrag ${orderNo}: Status von "${order.status}" auf "${normalizedNew}" geändert.`,
      };
    },
  };
}

export const writeHandlers = createWriteHandlers({ query: defaultQuery, queryOne: defaultQueryOne });
