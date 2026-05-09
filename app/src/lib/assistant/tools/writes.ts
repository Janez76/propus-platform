import type { PoolClient } from "pg";
import { query as defaultQuery, queryOne as defaultQueryOne, withTransaction as defaultWithTransaction, type Querier } from "@/lib/db";
import { ensureBookingOrderSequence } from "@/lib/orderSequence";
import { normalizeTimestamptzParam } from "@/lib/pg-timestamptz";
import { getAllowedTransitions, normalizeStatusKey } from "@/lib/status";
import { enqueueOutbox as defaultEnqueueOutbox, type OutboxKind } from "@/lib/outbox";
import { renderWorkflowMails } from "@/lib/mail/workflowMail";
import type { ToolContext, ToolDefinition, ToolHandler } from "./index";

type QueryFn = <T = Record<string, unknown>>(sql: string, params?: unknown[], tx?: Querier) => Promise<T[]>;
type QueryOneFn = <T = Record<string, unknown>>(sql: string, params?: unknown[], tx?: Querier) => Promise<T | null>;
type WithTransactionFn = <T>(fn: (tx: PoolClient) => Promise<T>) => Promise<T>;
type EnqueueOutboxFn = (
  tx: PoolClient,
  orderNo: number,
  kind: OutboxKind,
  payload: Record<string, unknown>,
) => Promise<{ id: number }>;

type WriteDeps = {
  query: QueryFn;
  queryOne: QueryOneFn;
  withTransaction?: WithTransactionFn;
  enqueueOutbox?: EnqueueOutboxFn;
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

type ServiceItemNorm = { code: string; qty: number };

function parseServiceItems(input: unknown): ServiceItemNorm[] {
  if (!Array.isArray(input)) return [];
  const out: ServiceItemNorm[] = [];
  for (const raw of input) {
    if (typeof raw === "string") {
      const code = raw.trim();
      if (code) out.push({ code, qty: 1 });
      continue;
    }
    if (raw && typeof raw === "object") {
      const code = typeof (raw as Record<string, unknown>).code === "string"
        ? String((raw as Record<string, unknown>).code).trim()
        : "";
      if (!code) continue;
      const qtyRaw = Number((raw as Record<string, unknown>).qty);
      const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.trunc(qtyRaw) : 1;
      out.push({ code, qty });
    }
  }
  return out;
}

type ProductRow = {
  id: number;
  code: string;
  name: string;
  kind: string;
  group_key: string | null;
  rule_type: string | null;
  config_json: Record<string, unknown> | null;
};

type PriceContext = { area: string | null; floors: number; rooms: string | null; qty: number };

function priceFromRule(ruleType: string | null, config: Record<string, unknown> | null, ctx: PriceContext): number {
  if (!ruleType) return 0;
  const cfg = (config || {}) as Record<string, unknown>;
  if (ruleType === "fixed") {
    return Number(cfg.price || 0);
  }
  if (ruleType === "per_floor") {
    return Number(cfg.unitPrice || 0) * Math.max(1, ctx.floors);
  }
  if (ruleType === "per_room") {
    const r = parseInt(String(ctx.rooms || "0"), 10);
    const rooms = Number.isFinite(r) && r > 0 ? r : 0;
    return Number(cfg.unitPrice || 0) * rooms;
  }
  if (ruleType === "area_tier") {
    const n = Number(ctx.area);
    if (!Number.isFinite(n) || n <= 0) return 0;
    const tiers = Array.isArray(cfg.tiers) ? (cfg.tiers as Array<Record<string, unknown>>) : [];
    for (const tier of tiers) {
      const maxArea = Number(tier?.maxArea);
      const price = Number(tier?.price);
      if (Number.isFinite(maxArea) && Number.isFinite(price) && n <= maxArea) return price;
    }
    const basePrice = Number(cfg.basePrice || 0);
    const incrementArea = Math.max(1, Number(cfg.incrementArea || 100));
    const incrementPrice = Number(cfg.incrementPrice || 0);
    if (basePrice <= 0) return 0;
    const maxTierArea = tiers
      .map((t) => Number(t?.maxArea))
      .filter((x) => Number.isFinite(x))
      .sort((a, b) => a - b)
      .pop() || 0;
    if (n <= maxTierArea) return basePrice;
    if (incrementPrice <= 0) return basePrice;
    const extra = Math.ceil((n - maxTierArea) / incrementArea);
    return basePrice + extra * incrementPrice;
  }
  // 'conditional' und sonstige Regeltypen vom Assistant nicht aufgeloest —
  // Office finalisiert den Preis dann manuell.
  return 0;
}

function roundCHF(value: number, step = 0.05): number {
  if (!Number.isFinite(value) || step <= 0) return value;
  return parseFloat((Math.round(value / step) * step).toFixed(10));
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
      "Erstellt einen neuen Buchungsauftrag. Zwei Buchungsarten:\n" +
      "- booking_kind=\"fixed\" (Default): fester Termin. schedule_date PFLICHT (ISO YYYY-MM-DD).\n" +
      "- booking_kind=\"flexible\": Office disponiert den Termin innerhalb eines Zeitraums. deadline_at PFLICHT (spätestes Datum, ISO). flexible_earliest_at optional (frühestes Datum, muss < deadline_at sein). Es wird KEIN schedule_date gesetzt, der Auftrag startet im Status 'disposition_offen'.\n" +
      "DIENSTLEISTUNGEN: Bevorzuge `service_items` mit konkreten Produktcodes aus list_available_services (z. B. 'camera:foto20', 'tour:main', 'floorplans:tour'). Tool resolved Name + Preis aus booking.products / pricing_rules und schreibt sie als richtige Positionen + pricing-Totals (genau wie ein manueller Admin-Auftrag). Boolean-`services`-Flags sind nur ein Fallback, wenn keine Codes bekannt sind — dann muss Office im Admin Leistungen-Tab nachziehen.\n" +
      "Bei area-/floor-basierten Produkten (tour:main = area_tier; floorplans:* = per_floor) `area_sqm` bzw. `floors` mitgeben, sonst kann der Preis nicht berechnet werden.\n" +
      "Nutze dieses Tool am Ende des Auftragsanlage-Gesprächs, nachdem alle Pflichtfelder gesammelt und zur Bestätigung zusammengefasst wurden.",
    kind: "write",
    requiresConfirmation: true,
    input_schema: {
      type: "object",
      properties: {
        customer_id: { type: "number", description: "Kunden-ID (aus search_customers)" },
        address: { type: "string", description: "Objektadresse (wo fotografiert werden soll)" },
        service_items: {
          type: "array",
          description:
            "BEVORZUGT: Liste konkreter Produktcodes aus list_available_services. Tool zieht Name + Preis aus booking.products / pricing_rules und persistiert echte Positionen. Akzeptiert Strings (['camera:foto20','tour:main']) ODER Objekte ([{code:'camera:foto20'},{code:'floorplans:tour',qty:1}]).",
          items: {
            anyOf: [
              { type: "string" },
              {
                type: "object",
                properties: {
                  code: { type: "string", description: "Produktcode aus booking.products.code (z. B. 'camera:foto20')" },
                  qty: { type: "number", description: "Stückzahl, Default 1" },
                },
                required: ["code"],
              },
            ],
          },
        },
        services: {
          type: "object",
          description:
            "FALLBACK: Boolean-Flags wenn konkrete Produktcodes (noch) nicht bekannt sind. Nutze stattdessen `service_items`, sobald list_available_services gelaufen ist — sonst bleibt das Pricing leer und Office muss manuell nachziehen.",
          properties: {
            photography: { type: "boolean" },
            drone: { type: "boolean" },
            matterport: { type: "boolean" },
            floorplan: { type: "boolean" },
            video: { type: "boolean" },
            staging: { type: "boolean" },
          },
        },
        area_sqm: { type: "number", description: "Objektfläche in m² (für area_tier-Pricing wie tour:main)." },
        floors: { type: "number", description: "Anzahl Geschosse (für per_floor-Pricing wie floorplans:*). Default 1." },
        rooms: { type: "string", description: "Zimmerzahl/-beschreibung (z. B. '4.5')." },
        booking_kind: { type: "string", enum: ["fixed", "flexible"], description: "Buchungsart. Default 'fixed'." },
        schedule_date: { type: "string", description: "Wunschtermin Datum (ISO YYYY-MM-DD). Nur bei booking_kind='fixed'. Bei 'flexible' nicht setzen." },
        schedule_time: { type: "string", description: "Wunschtermin Uhrzeit (HH:mm). Nur bei 'fixed'." },
        deadline_at: { type: "string", description: "Spätestes Aufnahmedatum (ISO 8601, z. B. 2026-05-20 oder 2026-05-20T17:00:00Z). PFLICHT bei booking_kind='flexible'." },
        flexible_earliest_at: { type: "string", description: "Frühestmögliches Datum (ISO). Optional, nur bei 'flexible'. Muss vor deadline_at liegen." },
        photographer_key: { type: "string", description: "Fotografen-Schlüssel (optional, aus list_photographers)" },
        notes: { type: "string", description: "Zusätzliche Hinweise oder Notizen (optional)" },
      },
      required: ["customer_id", "address"],
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
  const runWithTransaction: WithTransactionFn = deps.withTransaction || defaultWithTransaction;
  const runEnqueueOutbox: EnqueueOutboxFn = deps.enqueueOutbox || defaultEnqueueOutbox;

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
      const ticketModule = requireString(input.module, "module").toLowerCase();
      if (!VALID_MODULES.has(ticketModule)) {
        return { error: `Ungültiges Modul: ${ticketModule}. Erlaubt: tours, booking` };
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
        [ticketModule, subject, description, category || "sonstiges", priority || "normal", referenceId, referenceType, ctx.userEmail],
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

      // Pre-Flight: ohne Kunden-E-Mail wird die provisional_created-Mail im
      // Workflow-Renderer leise verworfen (toAddr() returned null) und der
      // Kunde bekommt keine Bestaetigung — exakt das Symptom #100103, das die
      // ganze Outbox-Integration eigentlich verhindern soll (Bug-Hunt HIGH-5).
      // Lieber das Modell zwingen, beim User nach der E-Mail zu fragen, als
      // schweigend einen halben Workflow zu produzieren.
      const customerEmail = (customer.email || "").trim();
      if (!customerEmail) {
        return {
          error: `Kunde ${customerId} hat keine E-Mail-Adresse hinterlegt — bitte E-Mail beim Kunden ergaenzen, dann erneut versuchen.`,
        };
      }

      // Object-Infos fuer Pricing (area_tier, per_floor, per_room).
      // Werden auch in object{} persistiert, damit der Assistant-Auftrag dem
      // manuellen Admin-Flow gleich aussieht.
      const areaInput = input.area_sqm;
      const objectArea = (() => {
        if (typeof areaInput === "number" && Number.isFinite(areaInput) && areaInput > 0) return String(Math.trunc(areaInput));
        const s = optionalString(areaInput);
        if (!s) return null;
        const n = Number(s);
        return Number.isFinite(n) && n > 0 ? s : null;
      })();
      const objectFloorsRaw = Number(input.floors);
      const objectFloors = Number.isFinite(objectFloorsRaw) && objectFloorsRaw > 0
        ? Math.max(1, Math.trunc(objectFloorsRaw))
        : 1;
      const objectRooms = optionalString(input.rooms);

      // service_items > services-Booleans. Mit konkreten Codes resolved der
      // Assistant Name + Preis aus booking.products / pricing_rules — derselbe
      // Datenstand wie der manuelle Admin-Form. Boolean-Flags sind der alte
      // Fallback (Pricing leer, Office finalisiert).
      const serviceItems = parseServiceItems(input.service_items);
      type AddonOut = { id: string; label: string; price: number; qty?: number; group?: string };
      let servicesJson: Record<string, unknown>;
      let pricingJson: Record<string, unknown> = {};
      let resolvedItemSummary: string[] = [];

      if (serviceItems.length > 0) {
        const codes = Array.from(new Set(serviceItems.map((s) => s.code)));
        const products = await runQuery<ProductRow>(
          `SELECT p.id, p.code, p.name, p.kind, p.group_key,
                  pr.rule_type, pr.config_json
           FROM booking.products p
           LEFT JOIN LATERAL (
             SELECT rule_type, config_json
             FROM booking.pricing_rules
             WHERE product_id = p.id
               AND active = TRUE
               AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
               AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
             ORDER BY priority ASC, id ASC
             LIMIT 1
           ) pr ON TRUE
           WHERE p.code = ANY($1::text[]) AND p.active = TRUE`,
          [codes],
        );
        const byCode = new Map(products.map((p) => [p.code, p]));
        const missing = codes.filter((c) => !byCode.has(c));
        if (missing.length > 0) {
          return {
            error: `Unbekannter/inaktiver Produktcode: ${missing.join(", ")}. Mit list_available_services pruefen.`,
          };
        }

        let pkg: { key: string; label: string; price: number } | null = null;
        const addons: AddonOut[] = [];
        let subtotal = 0;
        const unpriced: string[] = [];

        for (const item of serviceItems) {
          const product = byCode.get(item.code)!;
          const qty = item.qty;
          const priceCtx: PriceContext = {
            area: objectArea,
            floors: objectFloors,
            rooms: objectRooms,
            qty,
          };
          const unitPrice = priceFromRule(product.rule_type, product.config_json, priceCtx);
          const lineTotal = roundCHF(unitPrice * qty, 0.05);
          if (unitPrice <= 0) unpriced.push(product.code);
          subtotal += lineTotal;

          if (product.kind === "package") {
            // Falls Modell mehrere "package"-Codes liefert, gewinnt das erste —
            // mehr als ein Hauptpaket ist im Booking-Datenmodell (services.package
            // ist Singular) nicht vorgesehen.
            if (!pkg) {
              pkg = { key: product.code, label: product.name, price: lineTotal };
            } else {
              addons.push({ id: product.code, label: product.name, price: lineTotal, ...(qty > 1 ? { qty } : {}), ...(product.group_key ? { group: product.group_key } : {}) });
            }
          } else {
            addons.push({ id: product.code, label: product.name, price: lineTotal, ...(qty > 1 ? { qty } : {}), ...(product.group_key ? { group: product.group_key } : {}) });
          }
          resolvedItemSummary.push(`${product.name}${qty > 1 ? ` x${qty}` : ""} - ${lineTotal} CHF`);
        }

        const VAT_RATE = 0.081;
        const subtotalRounded = roundCHF(subtotal, 0.05);
        const vat = roundCHF(subtotalRounded * VAT_RATE, 0.05);
        const total = roundCHF(subtotalRounded + vat, 0.05);

        servicesJson = { package: pkg || {}, addons };
        pricingJson = { subtotal: subtotalRounded, discount: 0, vat, total };

        if (unpriced.length > 0 && !pricingJson._note) {
          pricingJson._note = `Fuer ${unpriced.join(", ")} konnte der Assistant keinen Preis aus den pricing_rules ableiten — Office bitte im Leistungen-Tab nachziehen.`;
        }
      } else {
        const services = (input.services && typeof input.services === "object") ? input.services as Record<string, unknown> : {};
        const VALID_SERVICE_KEYS = new Set(["photography", "drone", "matterport", "floorplan", "video", "staging"]);
        const flagsJson: Record<string, boolean> = {};
        for (const [key, value] of Object.entries(services)) {
          if (VALID_SERVICE_KEYS.has(key) && value === true) {
            flagsJson[key] = true;
          }
        }
        if (Object.keys(flagsJson).length === 0) {
          return {
            error:
              "Mindestens eine Dienstleistung erforderlich — entweder service_items mit Produktcodes (bevorzugt, aus list_available_services) oder services mit Boolean-Flags (Fallback).",
          };
        }
        servicesJson = flagsJson;
      }

      const bookingKindRaw = optionalString(input.booking_kind);
      const bookingKind = bookingKindRaw === "flexible" ? "flexible" : "fixed";
      const scheduleDate = optionalString(input.schedule_date);
      const scheduleTime = optionalString(input.schedule_time);
      const photographerKey = optionalString(input.photographer_key);
      const notes = optionalString(input.notes);

      // Buchungsart-spezifische Validierung — entspricht orders_booking_kind_dates_chk
      // (Migration 092). Ohne diesen Check schlaegt der INSERT mit einem CHECK-
      // constraint-Fehler fehl ("Option/Status-Kombination ohne Datum"), den der
      // Assistant fuer den Endnutzer kaum sinnvoll erklaeren kann.
      let deadlineIso: string | null = null;
      let flexibleEarliestIso: string | null = null;
      if (bookingKind === "flexible") {
        const deadlineRaw = optionalString(input.deadline_at);
        if (!deadlineRaw) {
          return {
            error:
              "deadline_at ist Pflicht bei booking_kind='flexible'. Bitte das spaeteste Aufnahmedatum vom Nutzer erfragen (ISO 8601, z. B. 2026-05-20).",
          };
        }
        deadlineIso = normalizeTimestamptzParam(deadlineRaw);
        if (!deadlineIso) {
          return { error: `deadline_at: ungueltiges Datumsformat "${deadlineRaw}". Bitte ISO 8601 verwenden.` };
        }
        const earliestRaw = optionalString(input.flexible_earliest_at);
        if (earliestRaw) {
          flexibleEarliestIso = normalizeTimestamptzParam(earliestRaw);
          if (!flexibleEarliestIso) {
            return { error: `flexible_earliest_at: ungueltiges Datumsformat "${earliestRaw}".` };
          }
          if (new Date(flexibleEarliestIso).getTime() >= new Date(deadlineIso).getTime()) {
            return { error: "flexible_earliest_at muss vor deadline_at liegen." };
          }
        }
      } else if (!scheduleDate) {
        // bookingKind='fixed' braucht ein Datum (CHECK schedule->>'date' NOT NULL).
        return {
          error:
            "schedule_date ist Pflicht bei booking_kind='fixed'. Wenn der Termin noch offen ist, mit booking_kind='flexible' und deadline_at buchen.",
        };
      }

      if (photographerKey) {
        const photographer = await runQueryOne<{ key: string }>(
          `SELECT key FROM booking.photographers WHERE key = $1 AND active = TRUE`,
          [photographerKey],
        );
        if (!photographer) return { error: `Fotograf "${photographerKey}" nicht gefunden oder nicht aktiv` };
      }

      const status = bookingKind === "flexible" ? "disposition_offen" : "pending";

      const scheduleJson = scheduleDate ? { date: scheduleDate, ...(scheduleTime ? { time: scheduleTime } : {}) } : {};
      const photographerJson = photographerKey ? { key: photographerKey } : {};
      const billingJson = {
        name: customer.name || customer.company || "",
        email: customerEmail,
        ...(customer.company ? { company: customer.company } : {}),
      };
      // Object-Infos werden mitgespeichert, damit area_tier-/per_floor-Pricing
      // und Tour-Verknuepfungen spaeter dieselben Werte sehen wie der Assistant.
      const objectJson: Record<string, unknown> = { type: "Immobilie" };
      if (objectArea) objectJson.area = objectArea;
      if (objectFloors > 1) objectJson.floors = String(objectFloors);
      if (objectRooms) objectJson.rooms = objectRooms;
      const settingsJson = notes ? { assistant_notes: notes } : {};

      // INSERT + Mail-Outbox in einer Tx, damit Auftrag und Workflow-Mails
      // atomar landen (sonst kann ein Crash zwischen INSERT und Outbox-Insert
      // den Auftrag ohne Benachrichtigung hinterlassen — Symptom Bestellung
      // #100103: Order da, Mails fehlen).
      // order_no kommt aus der Postgres-Sequence (Migration 055).
      // ensureBookingOrderSequence muss VOR der Tx laufen (DDL).
      await ensureBookingOrderSequence(runQuery);
      // INSERT + Outbox-Enqueue ueber injizierte withTransaction/enqueueOutbox.
      // Defaults nutzen die echte db.ts-Implementierung; in Tests werden
      // mockable Varianten injiziert (sonst ECONNREFUSED gegen :5432 im CI).
      const orderNo = await runWithTransaction(async (tx) => {
        const inserted = await runQueryOne<{ order_no: number }>(
          `INSERT INTO booking.orders (
             customer_id, status, address, object, services, photographer, schedule,
             billing, pricing, settings_snapshot,
             booking_kind, deadline_at, flexible_earliest_at
           )
           VALUES (
             $1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb,
             $11, $12::timestamptz, $13::timestamptz
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
            JSON.stringify(pricingJson),
            JSON.stringify(settingsJson),
            bookingKind,
            deadlineIso,
            flexibleEarliestIso,
          ],
          tx,
        );
        const no = inserted?.order_no;
        if (!no) throw new Error("Auftrag konnte nicht erstellt werden");

        // Workflow-Mails: Kunde bekommt Provisorisch-Bestätigung, Office
        // bekommt einen Hinweis dass der KI-Assistent neu gebucht hat und
        // Pricing finalisiert werden muss.
        const rendered = renderWorkflowMails(
          ["email.provisional_created", "email.provisional_office"],
          {
            orderNo: no,
            customerEmail,
            officeEmail: process.env.OFFICE_EMAIL,
            scheduleDate,
            scheduleTime,
          },
          { customer: true, office: true, photographer: false, cc: false },
        );
        for (const mail of rendered) {
          await runEnqueueOutbox(tx, no, "workflow_status_mail", {
            to: mail.to,
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
            effect: mail.effect,
            role: mail.role,
            context: `order:${no}:assistant_create:${mail.effect}:${mail.role}`,
          });
        }
        return no;
      });

      const flexInfo = bookingKind === "flexible"
        ? `Flexibel: Office disponiert bis ${deadlineIso}${flexibleEarliestIso ? ` (frühestens ab ${flexibleEarliestIso})` : ""}.`
        : "";
      const usedExplicitItems = serviceItems.length > 0;
      const total = Number((pricingJson as { total?: unknown }).total) || 0;
      const pricingInfo = usedExplicitItems
        ? `Positionen ${total > 0 ? `mit Total CHF ${total.toFixed(2)} (inkl. MwSt) ` : ""}aus Produktkatalog uebernommen.`
        : "Pricing wird im Admin via Leistungen-Tab finalisiert.";
      return {
        ok: true,
        orderNo,
        customerId,
        customerName: customer.name || customer.company,
        address,
        services: usedExplicitItems
          ? resolvedItemSummary
          : Object.keys(servicesJson),
        pricing: usedExplicitItems ? pricingJson : null,
        bookingKind,
        schedule: scheduleDate ? { date: scheduleDate, time: scheduleTime } : null,
        deadlineAt: deadlineIso,
        flexibleEarliestAt: flexibleEarliestIso,
        photographer: photographerKey,
        status,
        message: `Auftrag #${orderNo} für "${customer.name || customer.company}" an "${address}" erstellt. ${flexInfo} Bestätigungs-Mails an Kunde und Office in Outbox eingereiht. ${pricingInfo}`.trim(),
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
