import { query as defaultQuery, queryOne as defaultQueryOne } from "@/lib/db";
import type { ToolContext, ToolDefinition, ToolHandler } from "./index";

type QueryFn = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
type QueryOneFn = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T | null>;

type CustomersDeps = {
  query: QueryFn;
  queryOne: QueryOneFn;
};

function boundedNumber(value: unknown, fallback: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.trunc(n), max);
}

function text(value: unknown): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s || null;
}

function optionalPositiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Primäre Kunden-E-Mail normalisieren (wie Admin-Kundenanlage). */
function normalizeCustomerEmail(value: unknown): string | null {
  const s = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!s) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null;
  return s;
}

function emptyAsDefault(value: unknown): string {
  return text(value) ?? "";
}

function isoDateTime(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function truncate(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) + "…" : value;
}

export const customersTools: ToolDefinition[] = [
  {
    name: "search_customers",
    description:
      "Nutze dieses Tool wenn nach einem Kunden, einer Firma, einer E-Mail-Adresse oder einem Kontakt gefragt wird. Auch für Teilnamen oder Domains. Durchsucht Name, E-Mail, Firma, Telefon und email_aliases. Suchbegriffe können Tipp-/Sprachfehler haben — best-effort-Anfrage und bei Bedarf mehrere Varianten; Antwort listet passende Treffer (begrenzt).",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Suchbegriff (Name, E-Mail, Firma, Telefon, Domain)" },
        limit: { type: "number", description: "Maximale Anzahl (Default: 20, max. 20)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_customer_detail",
    description:
      "Nutze dieses Tool wenn du alle Details zu einem bereits identifizierten Kunden brauchst: Stammdaten, Kontakte, Firmen, Bestellungen und aktive Touren.",
    input_schema: {
      type: "object",
      properties: { customer_id: { type: "number", description: "Kunden-ID" } },
      required: ["customer_id"],
    },
  },
  {
    name: "get_customer_contacts",
    description:
      "Nutze dieses Tool wenn nach Ansprechpartnern, Kontaktpersonen oder Mitarbeitern eines bestimmten Kunden gefragt wird.",
    input_schema: {
      type: "object",
      properties: { customer_id: { type: "number", description: "Kunden-ID" } },
      required: ["customer_id"],
    },
  },
  {
    name: "search_contacts",
    description:
      "Nutze dieses Tool wenn nach einer bestimmten Kontaktperson über alle Kunden hinweg gesucht wird. Durchsucht Name und E-Mail in customer_contacts. Suchbegriffe können Tipp-/Sprachfehler haben — best-effort-Anfrage und bei Bedarf mehrere Varianten; Antwort listet passende Treffer (begrenzt).",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Suchbegriff (Name oder E-Mail)" },
        limit: { type: "number", description: "Maximale Anzahl (Default: 20, max. 20)" },
      },
      required: ["query"],
    },
  },
  {
    name: "create_customer_contact",
    description: "Erstellt eine neue Kontaktperson für einen Kunden.",
    kind: "write",
    requiresConfirmation: true,
    input_schema: {
      type: "object",
      properties: {
        customer_id: { type: "number", description: "Kunden-ID" },
        name: { type: "string", description: "Name der Kontaktperson" },
        email: { type: "string", description: "E-Mail" },
        phone: { type: "string", description: "Telefonnummer (optional)" },
        role: { type: "string", description: "Rolle/Funktion (optional)" },
      },
      required: ["customer_id", "name", "email"],
    },
  },
  {
    name: "update_customer_note",
    description: "Aktualisiert die Notiz (Feld 'notes') auf einem Kundendatensatz.",
    kind: "write",
    requiresConfirmation: true,
    input_schema: {
      type: "object",
      properties: {
        customer_id: { type: "number", description: "Kunden-ID" },
        note: { type: "string", description: "Neuer Notiztext" },
      },
      required: ["customer_id", "note"],
    },
  },
  {
    name: "create_customer",
    description:
      "Legt einen neuen Stammdaten-Kunden in der zentralen Kundenliste (core.customers) an. Nutze dieses Tool, wenn der Nutzer einen Kunden anlegen möchte, der noch nicht existiert — z. B. bevor create_order mit customer_id aufgerufen wird. Erfordert Bestätigung. Bei bereits vorhandener primärer E-Mail schlägt das Tool fehl (existingId).",
    kind: "write",
    requiresConfirmation: true,
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Anzeigename / Kontaktname (Pflicht)" },
        email: { type: "string", description: "Primäre E-Mail-Adresse (Pflicht, eindeutig)" },
        company: { type: "string", description: "Firmenname (optional)" },
        phone: { type: "string", description: "Telefon (optional)" },
        street: { type: "string", description: "Strasse (optional)" },
        zipcity: { type: "string", description: "PLZ und Ort in einem Feld, z. B. «8001 Zürich» (optional)" },
        notes: { type: "string", description: "Interne Notiz (optional)" },
        exxas_contact_id: { type: "string", description: "Exxas-Kontakt-ID falls bekannt (optional)" },
      },
      required: ["name", "email"],
    },
  },
];

export function createCustomersHandlers(deps: CustomersDeps): Record<string, ToolHandler> {
  const runQuery = deps.query;
  const runQueryOne = deps.queryOne;

  return {
    search_customers: async (input: Record<string, unknown>) => {
      const q = text(input.query);
      if (!q) return { count: 0, customers: [] };
      const limit = boundedNumber(input.limit, 20, 20);

      const rows = await runQuery<{
        id: number;
        name: string | null;
        email: string | null;
        email_aliases: string[] | null;
        phone: string | null;
        company: string | null;
        notes: string | null;
        created_at: string | Date | null;
        contact_names: string | null;
      }>(
        `SELECT c.id, c.name, c.email, c.email_aliases, c.phone, c.company,
                LEFT(c.notes, 200) AS notes, c.created_at,
                (
                  SELECT STRING_AGG(cc.name, ', ' ORDER BY cc.sort_order ASC, cc.id)
                  FROM core.customer_contacts cc
                  WHERE cc.customer_id = c.id
                  LIMIT 5
                ) AS contact_names
         FROM core.customers c
         WHERE c.name ILIKE $1
            OR c.email ILIKE $1
            OR c.company ILIKE $1
            OR c.phone ILIKE $1
            OR EXISTS (SELECT 1 FROM unnest(c.email_aliases) alias WHERE alias ILIKE $1)
            OR EXISTS (
              SELECT 1 FROM core.customer_contacts cc
              WHERE cc.customer_id = c.id AND (cc.name ILIKE $1 OR cc.email ILIKE $1)
            )
         ORDER BY c.name ASC NULLS LAST, c.id DESC
         LIMIT $2`,
        [`%${q}%`, limit],
      );

      return {
        count: rows.length,
        customers: rows.map((r) => ({
          id: r.id,
          name: r.name,
          email: r.email,
          emailAliases: r.email_aliases?.length ? r.email_aliases : null,
          phone: r.phone,
          company: r.company,
          note: truncate(r.notes, 200),
          contactNames: r.contact_names,
          createdAt: isoDateTime(r.created_at),
        })),
      };
    },

    get_customer_detail: async (input: Record<string, unknown>) => {
      const customerId = optionalPositiveInt(input.customer_id);
      if (!customerId) return { error: "Ungültige Kunden-ID" };

      const customer = await runQueryOne<{
        id: number;
        name: string | null;
        email: string | null;
        email_aliases: string[] | null;
        phone: string | null;
        company: string | null;
        street: string | null;
        city: string | null;
        zip: string | null;
        country: string | null;
        notes: string | null;
        exxas_customer_id: string | null;
        created_at: string | Date | null;
      }>(
        `SELECT id, name, email, email_aliases, phone, company, street, city, zip, country,
                LEFT(notes, 500) AS notes, exxas_customer_id, created_at
         FROM core.customers
         WHERE id = $1`,
        [customerId],
      );
      if (!customer) return { error: "Kunde nicht gefunden" };

      const contacts = await runQuery<{
        id: number;
        name: string | null;
        email: string | null;
        phone: string | null;
        role: string | null;
        sort_order: number;
      }>(
        `SELECT id, name, email, phone, role, sort_order
         FROM core.customer_contacts
         WHERE customer_id = $1
         ORDER BY sort_order ASC, id ASC
         LIMIT 20`,
        [customerId],
      );

      const companies = await runQuery<{
        company_id: number;
        company_name: string | null;
        role: string | null;
      }>(
        `SELECT cm.company_id, co.name AS company_name, cm.role
         FROM core.company_members cm
         JOIN core.companies co ON co.id = cm.company_id
         WHERE cm.customer_id = $1
         LIMIT 10`,
        [customerId],
      );

      const recentOrders = await runQuery<{
        order_no: number;
        status: string;
        address: string | null;
        created_at: string | Date | null;
      }>(
        `SELECT order_no, status, address, created_at
         FROM booking.orders
         WHERE customer_id = $1
         ORDER BY created_at DESC
         LIMIT 5`,
        [customerId],
      );

      const activeTours = await runQuery<{
        id: number;
        label: string | null;
        status: string;
        term_end_date: string | Date | null;
      }>(
        `SELECT id,
                COALESCE(canonical_object_label, object_label, bezeichnung) AS label,
                status,
                COALESCE(canonical_term_end_date, term_end_date, ablaufdatum) AS term_end_date
         FROM tour_manager.tours
         WHERE customer_id = $1 AND UPPER(COALESCE(status, '')) IN ('ACTIVE', 'AKTIV')
         ORDER BY COALESCE(canonical_term_end_date, term_end_date, ablaufdatum) ASC NULLS LAST
         LIMIT 10`,
        [customerId],
      );

      return {
        customer: {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          emailAliases: customer.email_aliases?.length ? customer.email_aliases : null,
          phone: customer.phone,
          company: customer.company,
          address: [customer.street, customer.zip, customer.city, customer.country].filter(Boolean).join(", ") || null,
          note: truncate(customer.notes, 500),
          exxasCustomerId: customer.exxas_customer_id,
          createdAt: isoDateTime(customer.created_at),
        },
        contacts: contacts.map((c) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
          role: c.role,
          sortOrder: c.sort_order,
        })),
        companies: companies.map((c) => ({
          companyId: c.company_id,
          companyName: c.company_name,
          role: c.role,
        })),
        recentOrders: recentOrders.map((o) => ({
          orderNo: o.order_no,
          status: o.status,
          address: o.address,
          createdAt: isoDateTime(o.created_at),
        })),
        activeTours: activeTours.map((t) => ({
          tourId: t.id,
          label: t.label,
          status: t.status,
          termEndDate: t.term_end_date instanceof Date ? t.term_end_date.toISOString().slice(0, 10) : t.term_end_date ? String(t.term_end_date).slice(0, 10) : null,
        })),
      };
    },

    get_customer_contacts: async (input: Record<string, unknown>) => {
      const customerId = optionalPositiveInt(input.customer_id);
      if (!customerId) return { error: "Ungültige Kunden-ID" };

      const rows = await runQuery<{
        id: number;
        name: string | null;
        email: string | null;
        phone: string | null;
        role: string | null;
        sort_order: number;
        created_at: string | Date | null;
      }>(
        `SELECT id, name, email, phone, role, sort_order, created_at
         FROM core.customer_contacts
         WHERE customer_id = $1
         ORDER BY sort_order ASC, id ASC
         LIMIT 30`,
        [customerId],
      );

      return {
        customerId,
        count: rows.length,
        contacts: rows.map((c) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
          role: c.role,
          sortOrder: c.sort_order,
          createdAt: isoDateTime(c.created_at),
        })),
      };
    },

    search_contacts: async (input: Record<string, unknown>) => {
      const q = text(input.query);
      if (!q) return { count: 0, contacts: [] };
      const limit = boundedNumber(input.limit, 20, 20);

      const rows = await runQuery<{
        id: number;
        name: string | null;
        email: string | null;
        phone: string | null;
        role: string | null;
        customer_id: number;
        customer_name: string | null;
        customer_email: string | null;
      }>(
        `SELECT cc.id, cc.name, cc.email, cc.phone, cc.role,
                cc.customer_id, c.name AS customer_name, c.email AS customer_email
         FROM core.customer_contacts cc
         JOIN core.customers c ON c.id = cc.customer_id
         WHERE cc.name ILIKE $1 OR cc.email ILIKE $1
         ORDER BY cc.name ASC NULLS LAST, cc.id DESC
         LIMIT $2`,
        [`%${q}%`, limit],
      );

      return {
        count: rows.length,
        contacts: rows.map((r) => ({
          id: r.id,
          name: r.name,
          email: r.email,
          phone: r.phone,
          role: r.role,
          customer: { id: r.customer_id, name: r.customer_name, email: r.customer_email },
        })),
      };
    },

    create_customer_contact: async (input: Record<string, unknown>, ctx: ToolContext) => {
      const customerId = optionalPositiveInt(input.customer_id);
      if (!customerId) return { error: "customer_id ist erforderlich" };
      const name = text(input.name);
      if (!name) return { error: "name ist erforderlich" };
      const email = text(input.email);
      if (!email) return { error: "email ist erforderlich" };
      const phone = text(input.phone);
      const role = text(input.role);

      const customer = await runQueryOne<{ id: number }>(
        `SELECT id FROM core.customers WHERE id = $1`,
        [customerId],
      );
      if (!customer) return { error: `Kunde ${customerId} nicht gefunden` };

      const row = await runQueryOne<{ id: number }>(
        `INSERT INTO core.customer_contacts (customer_id, name, email, phone, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [customerId, name, email, phone, role],
      );

      return { ok: true, contactId: row?.id, message: `Kontakt "${name}" für Kunde ${customerId} erstellt.` };
    },

    update_customer_note: async (input: Record<string, unknown>, _ctx: ToolContext) => {
      const customerId = optionalPositiveInt(input.customer_id);
      if (!customerId) return { error: "customer_id ist erforderlich" };
      const note = typeof input.note === "string" ? input.note.trim() : "";

      const customer = await runQueryOne<{ id: number }>(
        `SELECT id FROM core.customers WHERE id = $1`,
        [customerId],
      );
      if (!customer) return { error: `Kunde ${customerId} nicht gefunden` };

      await runQuery(
        `UPDATE core.customers SET notes = $2 WHERE id = $1`,
        [customerId, note || null],
      );

      return { ok: true, customerId, message: `Notiz für Kunde ${customerId} aktualisiert.` };
    },

    create_customer: async (input: Record<string, unknown>, _ctx: ToolContext) => {
      const name = text(input.name);
      if (!name) return { error: "name ist erforderlich" };
      const email = normalizeCustomerEmail(input.email);
      if (!email) return { error: "email ist erforderlich und muss eine gültige E-Mail-Adresse sein" };

      const existing = await runQueryOne<{ id: number }>(
        `SELECT id FROM core.customers WHERE LOWER(TRIM(email)) = $1`,
        [email],
      );
      if (existing) {
        return {
          error: "Ein Kunde mit dieser primären E-Mail existiert bereits.",
          existingId: existing.id,
        };
      }

      const company = emptyAsDefault(input.company);
      const phone = emptyAsDefault(input.phone);
      const street = emptyAsDefault(input.street);
      const zipcity = emptyAsDefault(input.zipcity);
      const notes = emptyAsDefault(input.notes);
      const exxasContactId = text(input.exxas_contact_id);

      const row = await runQueryOne<{ id: number }>(
        `INSERT INTO core.customers
           (name, email, company, phone, street, zipcity, notes, exxas_contact_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
         RETURNING id`,
        [name, email, company, phone, street, zipcity, notes, exxasContactId],
      );

      if (!row?.id) return { error: "Kunde konnte nicht angelegt werden." };

      return {
        ok: true,
        customerId: row.id,
        message: `Kunde «${name}» (${email}) angelegt. Kunden-ID: ${row.id}.`,
      };
    },
  };
}

export const customersHandlers = createCustomersHandlers({ query: defaultQuery, queryOne: defaultQueryOne });
