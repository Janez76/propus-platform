import { query as defaultQuery, queryOne as defaultQueryOne } from "@/lib/db";
import type { ToolContext, ToolDefinition, ToolHandler } from "./index";

type QueryFn = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
type QueryOneFn = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T | null>;

type FetchFn = typeof globalThis.fetch;

type DesignsDeps = {
  query: QueryFn;
  queryOne: QueryOneFn;
  fetch?: FetchFn;
  platformUrl?: string;
};

function runtimeEnv(name: string): string | undefined {
  return (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name];
}

function text(value: unknown): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s || null;
}

function optionalPositiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function isoDateTime(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[äÄ]/g, "ae")
    .replace(/[öÖ]/g, "oe")
    .replace(/[üÜ]/g, "ue")
    .replace(/[ß]/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
  const suffix = Date.now().toString(36).slice(-6);
  return `${base || "gallery"}-${suffix}`;
}

function getPlatformUrl(deps: DesignsDeps): string {
  return deps.platformUrl || runtimeEnv("PLATFORM_INTERNAL_URL") || "http://127.0.0.1:3100";
}

export const designsTools: ToolDefinition[] = [
  {
    name: "create_listing_gallery",
    description:
      "Erstellt eine neue Listing-Galerie (Entwurf). Kann mit Kunde und/oder Bestellung verknüpft werden.",
    kind: "write",
    requiresConfirmation: true,
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Titel der Galerie" },
        description: { type: "string", description: "Beschreibung / Adresse (optional)" },
        customer_id: { type: "number", description: "Kunden-ID (optional)" },
        order_no: { type: "number", description: "Bestellnummer (optional)" },
      },
      required: ["title"],
    },
  },
  {
    name: "prepare_customer_delivery",
    description:
      "Markiert eine Galerie als zugestellt und löst bei method='email' den Versand der Listing-E-Mail aus.",
    kind: "write",
    requiresConfirmation: true,
    input_schema: {
      type: "object",
      properties: {
        tour_id: { type: "number", description: "Tour-ID (Galerie wird über booking_order_no der Tour gefunden)" },
        delivery_method: { type: "string", description: "email | link" },
      },
      required: ["tour_id", "delivery_method"],
    },
  },
];

export function createDesignsHandlers(deps: DesignsDeps): Record<string, ToolHandler> {
  const runQuery = deps.query;
  const runQueryOne = deps.queryOne;
  const doFetch = deps.fetch || globalThis.fetch;

  return {
    create_listing_gallery: async (input: Record<string, unknown>, _ctx: ToolContext) => {
      const title = text(input.title);
      if (!title) return { error: "title ist erforderlich" };
      const description = text(input.description);
      const customerId = optionalPositiveInt(input.customer_id);
      const orderNo = optionalPositiveInt(input.order_no);

      const slug = generateSlug(title);

      const row = await runQueryOne<{ id: string }>(
        `INSERT INTO tour_manager.galleries (slug, title, address, customer_id, booking_order_no, status)
         VALUES ($1, $2, $3, $4, $5, 'inactive')
         RETURNING id`,
        [slug, title, description, customerId, orderNo],
      );

      return {
        ok: true,
        galleryId: row?.id,
        slug,
        message: `Galerie "${title}" erstellt (Status: Entwurf, Slug: ${slug}).`,
      };
    },

    prepare_customer_delivery: async (input: Record<string, unknown>, ctx: ToolContext) => {
      const tourId = optionalPositiveInt(input.tour_id);
      if (!tourId) return { error: "tour_id ist erforderlich" };
      const method = text(input.delivery_method);
      if (!method || !["email", "link"].includes(method)) {
        return { error: "delivery_method muss 'email' oder 'link' sein" };
      }

      const tour = await runQueryOne<{ booking_order_no: number | null }>(
        `SELECT booking_order_no FROM tour_manager.tours WHERE id = $1`,
        [tourId],
      );
      if (!tour) return { error: `Tour ${tourId} nicht gefunden` };
      if (!tour.booking_order_no) return { error: `Tour ${tourId} hat keine verknüpfte Bestellung` };

      const gallery = await runQueryOne<{ id: string; slug: string; title: string }>(
        `SELECT id, slug, title
         FROM tour_manager.galleries
         WHERE booking_order_no = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [tour.booking_order_no],
      );
      if (!gallery) return { error: `Keine Galerie für Bestellung ${tour.booking_order_no} gefunden` };

      await runQuery(
        `UPDATE tour_manager.galleries
         SET client_delivery_status = 'sent', client_delivery_sent_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [gallery.id],
      );

      if (method === "email") {
        const baseUrl = getPlatformUrl(deps);
        try {
          await doFetch(`${baseUrl}/api/tours/admin/galleries/${gallery.slug}/send-listing-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-internal-call": "assistant" },
            body: JSON.stringify({ sent_by: ctx.userEmail }),
          });
        } catch {
          // Non-critical: delivery status already updated
        }
      }

      return {
        ok: true,
        galleryId: gallery.id,
        gallerySlug: gallery.slug,
        method,
        message: `Galerie "${gallery.title}" als zugestellt markiert${method === "email" ? " und Listing-E-Mail ausgelöst" : ""}.`,
      };
    },
  };
}

export const designsHandlers = createDesignsHandlers({
  query: defaultQuery,
  queryOne: defaultQueryOne,
});
