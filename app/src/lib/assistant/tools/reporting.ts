/**
 * Gezielte read-only Reporting-Tools für den Propus Assistant / Propi.
 * Kein freies SQL für Nutzer — nur vordefinierte Report-Typen mit Limits und Rollenmatrix.
 */
import { query as defaultQuery } from "@/lib/db";
import type { ToolContext, ToolDefinition, ToolHandler } from "./types";

type QueryFn = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;

type ReportingDeps = {
  query: QueryFn;
};

const DONE_STATUSES = "('done','completed','cancelled','archived')";

/** Operative Reports auch für Mobile-Rollen. */
const ROLE_OPS = new Set(["photographer", "tour_manager", "employee", "admin", "super_admin"]);
/** CRM / Finanz-Aggregate (ohne operative Mobile-Rolle). */
const ROLE_BUSINESS = new Set(["employee", "admin", "super_admin"]);
const ROLE_ADMIN = new Set(["admin", "super_admin"]);

type AccessTier = "ops" | "business" | "admin";

function normalizedRole(ctx: ToolContext): string {
  return String(ctx.role || "").toLowerCase().trim();
}

function tierAllowed(tier: AccessTier, role: string): boolean {
  if (tier === "admin") return ROLE_ADMIN.has(role);
  if (tier === "business") return ROLE_BUSINESS.has(role);
  return ROLE_OPS.has(role);
}

function boundedInt(value: unknown, fallback: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const t = Math.trunc(n);
  if (t <= 0) return fallback;
  return Math.min(t, max);
}

function optionalString(value: unknown): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s || null;
}

export const reportingTools: ToolDefinition[] = [
  {
    name: "propus_report",
    description:
      "Read-only Reporting über vordefinierte Propus-Auswertungen (Aufträge, Touren, Kunden, Rechnungen, Admin-Datenqualität). Nutze dieses Tool bei Business-, Übersichts- und Listenfragen, wenn andere Tools nicht ausreichen. Parameter `report` wählt den Report; optionale Filter wie `region`, `keyword`, `days`, `months`. Keine Roh-SQL-Eingabe durch den Nutzer.",
    kind: "read",
    input_schema: {
      type: "object",
      properties: {
        report: {
          type: "string",
          description:
            "Report-Schlüssel, z. B. orders_week_calendar, orders_region_search, orders_missing_schedule, tours_expiring_days, customers_top_volume, invoices_overdue_summary, admin_users_roles, platform_activity_24h (siehe Tool-Doku im Code).",
        },
        region: { type: "string", description: "Freitext für Kantons-/Regionsfilter (Adresse/Billing)" },
        keyword: { type: "string", description: "Stichwort für Services oder Suche" },
        photographer: { type: "string", description: "Teilstring Fotograf-Name" },
        status_substring: { type: "string", description: "Filter auf booking.orders.status (ILIKE)" },
        days: { type: "number", description: "Zeitfenster in Tagen (z. B. Ablauf Matterport)" },
        months: { type: "number", description: "Inaktivität Monate (Kunden)" },
        limit: { type: "number", description: "Max. Zeilen (Default je Report, Cap 80)" },
      },
      required: ["report"],
    },
  },
];

export function createReportingHandlers(deps: ReportingDeps): Record<string, ToolHandler> {
  const runQuery = deps.query;

  async function propusReport(input: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
    const role = normalizedRole(ctx);
    const report = optionalString(input.report);
    if (!report) return { error: "report ist erforderlich" };

    const tier = reportTier(report);
    if (!tierAllowed(tier, role)) {
      return {
        error:
          "Keine Berechtigung für diesen Report. Für sensible Auswertungen ist eine Admin-Rolle nötig; operative Mobile-Rollen haben nur Auftrags-/Tour-Reports.",
      };
    }

    const limit = boundedInt(input.limit, 30, 80);

    try {
      switch (report) {
        case "orders_week_calendar":
          return await reportOrdersWeekCalendar(runQuery, limit);
        case "orders_region_search": {
          const region = optionalString(input.region) || optionalString(input.keyword);
          if (!region) return { error: "region oder keyword angeben (z. B. Zürich)" };
          return await reportOrdersRegionSearch(runQuery, region, limit);
        }
        case "orders_missing_schedule":
          return await reportOrdersMissingSchedule(runQuery, limit);
        case "orders_missing_photographer":
          return await reportOrdersMissingPhotographer(runQuery, limit);
        case "orders_service_keyword_last": {
          const kw = optionalString(input.keyword);
          if (!kw) return { error: "keyword angeben (z. B. Drohne)" };
          return await reportOrdersServiceKeyword(runQuery, kw, limit);
        }
        case "photographer_orders_week": {
          const ph = optionalString(input.photographer);
          if (!ph) return { error: "photographer angeben (Name oder Schlüsselteilstring)" };
          return await reportPhotographerOrdersWeek(runQuery, ph, limit);
        }
        case "orders_completed_month_stats":
          return await reportOrdersCompletedMonth(runQuery);
        case "orders_status_search": {
          const st = optionalString(input.status_substring);
          if (!st) return { error: "status_substring angeben (z. B. Bearbeitung)" };
          return await reportOrdersStatusSearch(runQuery, st, limit);
        }
        case "orders_schedule_collisions_week":
          return await reportOrdersScheduleCollisions(runQuery, limit);
        case "orders_open_kanban_summary":
          return await reportOrdersOpenByStatus(runQuery, limit);
        case "orders_missing_object_label":
          return await reportOrdersMissingObject(runQuery, limit);
        case "tours_expiring_days": {
          const days = boundedInt(input.days, 30, 365);
          return await reportToursExpiring(runQuery, days, limit);
        }
        case "tours_archived":
          return await reportToursArchived(runQuery, limit);
        case "tours_without_booking_order":
          return await reportToursWithoutBooking(runQuery, limit);
        case "tours_top_customers":
          return await reportToursTopCustomers(runQuery, limit);
        case "tours_active_count":
          return await reportToursActiveCount(runQuery);
        case "matterport_costs_note":
          return {
            note:
              "Matterport-Lizenzkosten liegen nicht als aggregierte Buchungszeile in dieser Datenbank. Bitte Matterport-Admin/Rechnungsexport oder internes Accounting prüfen.",
          };
        case "customers_top_volume":
          return await reportCustomersTopVolume(runQuery, limit);
        case "customers_inactive_months": {
          const months = boundedInt(input.months, 3, 36);
          return await reportCustomersInactive(runQuery, months, limit);
        }
        case "customers_region_zipcity": {
          const reg = optionalString(input.region) || optionalString(input.keyword);
          if (!reg) return { error: "region angeben (z. B. Zug)" };
          return await reportCustomersRegion(runQuery, reg, limit);
        }
        case "customers_missing_primary_email":
          return await reportCustomersMissingEmail(runQuery, limit);
        case "customers_missing_address":
          return await reportCustomersMissingAddress(runQuery, limit);
        case "customers_with_open_invoices":
          return await reportCustomersOpenInvoices(runQuery, limit);
        case "invoices_overdue_summary":
          return await reportInvoicesOverdue(runQuery, limit);
        case "invoices_open_totals_month":
          return await reportInvoicesOpenMonth(runQuery);
        case "invoices_revenue_quarter":
          return await reportInvoicesRevenueQuarter(runQuery);
        case "invoices_created_recent":
          return await reportInvoicesCreatedRecent(runQuery, limit);
        case "products_booking_frequency":
          return await reportProductsBookingFrequency(runQuery, limit);
        case "customers_count_by_canton":
          return await reportCustomersByCantonHint(runQuery, limit);
        case "orders_cancellation_rate":
          return await reportCancellationRate(runQuery);
        case "orders_monthly_seasonality_approx":
          return await reportMonthlySeasonality(runQuery);
        case "orders_yoy_volume":
          return await reportOrdersYoY(runQuery);
        case "postproduction_queue_estimate":
          return {
            note:
              "Eine belastbare durchschnittliche Post-Production-Dauer ist ohne dediziertes Zeittracking nicht automatisch berechenbar. Für konkrete Aufträge bitte Ordner-/Chat-Status oder Tickets prüfen.",
          };
        case "reels_produced_month":
          return {
            note:
              "Reels-Produktion wird hier nicht als eigene aggregierte Kennzahl geführt. Falls Reels als Produkt gebucht sind, alternativ products_booking_frequency oder Einzelaufträge via search_orders nutzen.",
          };
        case "scheduling_capacity_note":
          return {
            note:
              "Freie Shooting-Termine erfordern Kalender-Sync und Regeln (Puffer, Fotografenauslastung). Bitte Kalender-Modul oder Dispatching nutzen; automatische Kapazitätsfreigabe liefert dieses Reporting nicht.",
          };
        case "travel_zone_orders_note":
          return {
            note:
              "Die normierte Reisezone ist nicht zentral hinterlegt. Bitte Fotografen-Homebase + Routentools (get_route) oder manuelle Dispatch-Regeln verwenden.",
          };
        case "admin_users_roles":
          return await reportAdminUsers(runQuery, limit);
        case "duplicate_customer_candidates":
          return await reportDuplicateCandidates(runQuery, limit);
        case "platform_activity_24h":
          return await reportPlatformActivity(runQuery, limit);
        default:
          return { error: `Unbekannter report-Schlüssel: ${report}` };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { error: `Report fehlgeschlagen: ${msg.slice(0, 400)}` };
    }
  }

  return {
    propus_report: propusReport,
  };
}

function reportTier(report: string): AccessTier {
  const adminReports = new Set([
    "admin_users_roles",
    "duplicate_customer_candidates",
    "platform_activity_24h",
  ]);
  if (adminReports.has(report)) return "admin";

  const businessReports = new Set([
    "orders_completed_month_stats",
    "orders_schedule_collisions_week",
    "orders_open_kanban_summary",
    "orders_missing_object_label",
    "tours_top_customers",
    "tours_active_count",
    "matterport_costs_note",
    "customers_top_volume",
    "customers_inactive_months",
    "customers_region_zipcity",
    "customers_missing_primary_email",
    "customers_missing_address",
    "customers_with_open_invoices",
    "invoices_overdue_summary",
    "invoices_open_totals_month",
    "invoices_revenue_quarter",
    "invoices_created_recent",
    "products_booking_frequency",
    "customers_count_by_canton",
    "orders_cancellation_rate",
    "orders_monthly_seasonality_approx",
    "orders_yoy_volume",
    "postproduction_queue_estimate",
    "reels_produced_month",
    "scheduling_capacity_note",
    "travel_zone_orders_note",
  ]);
  if (businessReports.has(report)) return "business";
  return "ops";
}

async function reportOrdersWeekCalendar(runQuery: QueryFn, limit: number) {
  const rows = await runQuery(
    `SELECT order_no, status, address,
            schedule->>'date' AS schedule_date,
            schedule->>'time' AS schedule_time,
            billing->>'name' AS customer_name
     FROM booking.orders
     WHERE status NOT IN ${DONE_STATUSES}
       AND NULLIF(schedule->>'date', '') IS NOT NULL
       AND (schedule->>'date')::date >= date_trunc('week', CURRENT_DATE)::date
       AND (schedule->>'date')::date < (date_trunc('week', CURRENT_DATE) + INTERVAL '7 day')::date
     ORDER BY (schedule->>'date')::date, schedule->>'time' NULLS LAST
     LIMIT $1`,
    [limit],
  );
  return { report: "orders_week_calendar", count: rows.length, rows };
}

async function reportOrdersRegionSearch(runQuery: QueryFn, region: string, limit: number) {
  const p = `%${region}%`;
  const rows = await runQuery(
    `SELECT order_no, status, address, schedule->>'date' AS schedule_date, billing->>'name' AS customer_name
     FROM booking.orders
     WHERE status NOT IN ${DONE_STATUSES}
       AND (address ILIKE $1 OR billing::text ILIKE $1 OR object::text ILIKE $1)
     ORDER BY created_at DESC
     LIMIT $2`,
    [p, limit],
  );
  return { report: "orders_region_search", region, count: rows.length, rows };
}

async function reportOrdersMissingSchedule(runQuery: QueryFn, limit: number) {
  const rows = await runQuery(
    `SELECT order_no, status, address, billing->>'name' AS customer_name, created_at
     FROM booking.orders
     WHERE status NOT IN ${DONE_STATUSES}
       AND NULLIF(schedule->>'date', '') IS NULL
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit],
  );
  return { report: "orders_missing_schedule", count: rows.length, rows };
}

async function reportOrdersMissingPhotographer(runQuery: QueryFn, limit: number) {
  const rows = await runQuery(
    `SELECT order_no, status, address, schedule->>'date' AS schedule_date, billing->>'name' AS customer_name
     FROM booking.orders
     WHERE status NOT IN ${DONE_STATUSES}
       AND (
         photographer IS NULL
         OR photographer::text IN ('{}','null')
         OR NULLIF(trim(COALESCE(photographer->>'name','')), '') IS NULL
       )
     ORDER BY schedule->>'date' NULLS LAST, created_at DESC
     LIMIT $1`,
    [limit],
  );
  return { report: "orders_missing_photographer", count: rows.length, rows };
}

async function reportOrdersServiceKeyword(runQuery: QueryFn, kw: string, limit: number) {
  const p = `%${kw}%`;
  const rows = await runQuery(
    `SELECT order_no, status, address, services, created_at
     FROM booking.orders
     WHERE services::text ILIKE $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [p, limit],
  );
  return { report: "orders_service_keyword_last", keyword: kw, count: rows.length, rows };
}

async function reportPhotographerOrdersWeek(runQuery: QueryFn, ph: string, limit: number) {
  const p = `%${ph}%`;
  const rows = await runQuery(
    `SELECT order_no, status, address, schedule->>'date' AS schedule_date, photographer
     FROM booking.orders
     WHERE status NOT IN ${DONE_STATUSES}
       AND photographer::text ILIKE $1
       AND NULLIF(schedule->>'date', '') IS NOT NULL
       AND (schedule->>'date')::date >= date_trunc('week', CURRENT_DATE)::date
       AND (schedule->>'date')::date < (date_trunc('week', CURRENT_DATE) + INTERVAL '7 day')::date
     ORDER BY (schedule->>'date')::date
     LIMIT $2`,
    [p, limit],
  );
  return { report: "photographer_orders_week", photographer: ph, count: rows.length, rows };
}

async function reportOrdersCompletedMonth(runQuery: QueryFn) {
  const rows = await runQuery<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt
     FROM booking.orders
     WHERE status IN ('done','completed')
       AND COALESCE(done_at, updated_at) >= date_trunc('month', CURRENT_DATE)
       AND COALESCE(done_at, updated_at) < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'`,
    [],
  );
  const cnt = rows[0]?.cnt ?? "0";
  return { report: "orders_completed_month_stats", completedThisMonth: Number(cnt) };
}

async function reportOrdersStatusSearch(runQuery: QueryFn, st: string, limit: number) {
  const p = `%${st}%`;
  const rows = await runQuery(
    `SELECT order_no, status, address, schedule->>'date' AS schedule_date
     FROM booking.orders
     WHERE status ILIKE $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [p, limit],
  );
  return { report: "orders_status_search", status_substring: st, count: rows.length, rows };
}

async function reportOrdersScheduleCollisions(runQuery: QueryFn, limit: number) {
  const rows = await runQuery(
    `SELECT schedule->>'date' AS d, address, COUNT(*)::int AS cnt
     FROM booking.orders
     WHERE status NOT IN ${DONE_STATUSES}
       AND NULLIF(schedule->>'date', '') IS NOT NULL
       AND (schedule->>'date')::date >= CURRENT_DATE
       AND (schedule->>'date')::date < CURRENT_DATE + INTERVAL '8 day'
     GROUP BY schedule->>'date', address
     HAVING COUNT(*) > 1
     ORDER BY d, cnt DESC
     LIMIT $1`,
    [limit],
  );
  return { report: "orders_schedule_collisions_week", count: rows.length, rows };
}

async function reportOrdersOpenByStatus(runQuery: QueryFn, limit: number) {
  const rows = await runQuery(
    `SELECT status, COUNT(*)::int AS cnt
     FROM booking.orders
     WHERE status NOT IN ${DONE_STATUSES}
     GROUP BY status
     ORDER BY cnt DESC
     LIMIT $1`,
    [limit],
  );
  return { report: "orders_open_kanban_summary", count: rows.length, rows };
}

async function reportOrdersMissingObject(runQuery: QueryFn, limit: number) {
  const rows = await runQuery(
    `SELECT order_no, status, address
     FROM booking.orders
     WHERE status NOT IN ${DONE_STATUSES}
       AND (
         object IS NULL
         OR object::text IN ('{}','null')
         OR NULLIF(trim(COALESCE(object->>'label','')), '') IS NULL
           AND NULLIF(trim(COALESCE(object->>'type','')), '') IS NULL
       )
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit],
  );
  return { report: "orders_missing_object_label", count: rows.length, rows };
}

async function reportToursExpiring(runQuery: QueryFn, days: number, limit: number) {
  const rows = await runQuery(
    `SELECT id,
            COALESCE(canonical_object_label, object_label, bezeichnung) AS label,
            customer_name,
            COALESCE(canonical_term_end_date, term_end_date, ablaufdatum)::date AS term_end
     FROM tour_manager.tours
     WHERE UPPER(COALESCE(status, '')) IN ('ACTIVE', 'AKTIV')
       AND COALESCE(canonical_term_end_date, term_end_date, ablaufdatum) IS NOT NULL
       AND COALESCE(canonical_term_end_date, term_end_date, ablaufdatum)::date <= CURRENT_DATE + ($1::int * INTERVAL '1 day')
     ORDER BY term_end ASC
     LIMIT $2`,
    [days, limit],
  );
  return { report: "tours_expiring_days", days, count: rows.length, rows };
}

async function reportToursArchived(runQuery: QueryFn, limit: number) {
  const rows = await runQuery(
    `SELECT id,
            COALESCE(canonical_object_label, object_label, bezeichnung) AS label,
            status,
            COALESCE(canonical_term_end_date, term_end_date, ablaufdatum)::date AS term_end
     FROM tour_manager.tours
     WHERE UPPER(COALESCE(status, '')) NOT IN ('ACTIVE', 'AKTIV')
     ORDER BY id DESC
     LIMIT $1`,
    [limit],
  );
  return { report: "tours_archived", count: rows.length, rows };
}

async function reportToursWithoutBooking(runQuery: QueryFn, limit: number) {
  const rows = await runQuery(
    `SELECT id,
            COALESCE(canonical_object_label, object_label, bezeichnung) AS label,
            customer_name,
            status
     FROM tour_manager.tours
     WHERE booking_order_no IS NULL
     ORDER BY id DESC
     LIMIT $1`,
    [limit],
  );
  return { report: "tours_without_booking_order", count: rows.length, rows };
}

async function reportToursTopCustomers(runQuery: QueryFn, limit: number) {
  const rows = await runQuery(
    `SELECT customer_id,
            MAX(customer_name) AS customer_name,
            COUNT(*)::int AS active_tours
     FROM tour_manager.tours
     WHERE UPPER(COALESCE(status, '')) IN ('ACTIVE', 'AKTIV')
       AND customer_id IS NOT NULL
     GROUP BY customer_id
     ORDER BY active_tours DESC
     LIMIT $1`,
    [limit],
  );
  return { report: "tours_top_customers", count: rows.length, rows };
}

async function reportToursActiveCount(runQuery: QueryFn) {
  const rows = await runQuery<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt
     FROM tour_manager.tours
     WHERE UPPER(COALESCE(status, '')) IN ('ACTIVE', 'AKTIV')`,
    [],
  );
  return { report: "tours_active_count", activeTours: Number(rows[0]?.cnt ?? 0) };
}

async function reportCustomersTopVolume(runQuery: QueryFn, limit: number) {
  const rows = await runQuery(
    `SELECT c.id, c.name, c.company,
            COUNT(o.order_no)::int AS order_count,
            MAX(o.created_at) AS last_order_at
     FROM core.customers c
     JOIN booking.orders o ON o.customer_id = c.id
     WHERE o.created_at >= NOW() - INTERVAL '24 months'
     GROUP BY c.id, c.name, c.company
     ORDER BY order_count DESC
     LIMIT $1`,
    [limit],
  );
  return { report: "customers_top_volume", count: rows.length, rows };
}

async function reportCustomersInactive(runQuery: QueryFn, months: number, limit: number) {
  const rows = await runQuery(
    `SELECT c.id, c.name, c.company, MAX(o.created_at) AS last_order_at
     FROM core.customers c
     LEFT JOIN booking.orders o ON o.customer_id = c.id
     GROUP BY c.id, c.name, c.company
     HAVING MAX(o.created_at) IS NULL
        OR MAX(o.created_at) < NOW() - ($1::int * INTERVAL '1 month')
     ORDER BY last_order_at ASC NULLS FIRST
     LIMIT $2`,
    [months, limit],
  );
  return { report: "customers_inactive_months", months, count: rows.length, rows };
}

async function reportCustomersRegion(runQuery: QueryFn, reg: string, limit: number) {
  const p = `%${reg}%`;
  const rows = await runQuery(
    `SELECT id, name, company, email, zipcity, street
     FROM core.customers
     WHERE zipcity ILIKE $1
        OR street ILIKE $1
        OR company ILIKE $1
     ORDER BY name ASC
     LIMIT $2`,
    [p, limit],
  );
  return { report: "customers_region_zipcity", region: reg, count: rows.length, rows };
}

async function reportCustomersMissingEmail(runQuery: QueryFn, limit: number) {
  const rows = await runQuery(
    `SELECT id, name, company, phone, zipcity
     FROM core.customers
     WHERE email IS NULL OR trim(email) = ''
     ORDER BY id DESC
     LIMIT $1`,
    [limit],
  );
  return { report: "customers_missing_primary_email", count: rows.length, rows };
}

async function reportCustomersMissingAddress(runQuery: QueryFn, limit: number) {
  const rows = await runQuery(
    `SELECT id, name, company, email
     FROM core.customers
     WHERE (street IS NULL OR trim(street) = '')
        OR (zipcity IS NULL OR trim(zipcity) = '')
     ORDER BY id DESC
     LIMIT $1`,
    [limit],
  );
  return { report: "customers_missing_address", count: rows.length, rows };
}

async function reportCustomersOpenInvoices(runQuery: QueryFn, limit: number) {
  const rows = await runQuery(
    `SELECT DISTINCT v.tour_customer_name AS customer_name,
            v.invoice_number,
            v.invoice_status,
            v.amount_chf
     FROM tour_manager.invoices_central_v v
     WHERE v.invoice_status IS NOT NULL
       AND LOWER(v.invoice_status) NOT IN ('paid','bezahlt','bz','cancelled','archived')
     ORDER BY v.tour_customer_name
     LIMIT $1`,
    [limit],
  );
  return { report: "customers_with_open_invoices", count: rows.length, rows };
}

async function reportInvoicesOverdue(runQuery: QueryFn, limit: number) {
  const rows = await runQuery(
    `SELECT invoice_number, invoice_status, amount_chf, due_at,
            COALESCE(ri.customer_name, t.customer_name, '') AS customer_name
     FROM tour_manager.renewal_invoices ri
     LEFT JOIN tour_manager.tours t ON t.id = ri.tour_id
     WHERE ri.invoice_status NOT IN ('paid', 'cancelled', 'archived')
       AND ri.due_at IS NOT NULL
       AND ri.due_at < CURRENT_DATE
     ORDER BY ri.due_at ASC
     LIMIT $1`,
    [limit],
  );
  return { report: "invoices_overdue_summary", count: rows.length, rows };
}

async function reportInvoicesOpenMonth(runQuery: QueryFn) {
  const renewal = await runQuery<{ s: string }>(
    `SELECT COALESCE(SUM(amount_chf),0)::text AS s
     FROM tour_manager.renewal_invoices
     WHERE invoice_status NOT IN ('paid','cancelled','archived')`,
    [],
  );
  return {
    report: "invoices_open_totals_month",
    note: "Summe offener Verlängerungsrechnungen (renewal_invoices, alle offenen Status). Exxas separat.",
    openRenewalAmountChfApprox: Number(renewal[0]?.s ?? 0),
  };
}

async function reportInvoicesRevenueQuarter(runQuery: QueryFn) {
  const rows = await runQuery(
    `SELECT COALESCE(SUM(amount_chf),0)::numeric AS s
     FROM tour_manager.renewal_invoices
     WHERE invoice_status IN ('paid')
       AND paid_at IS NOT NULL
       AND paid_at >= NOW() - INTERVAL '90 days'`,
    [],
  );
  const amt = Number(rows[0]?.s ?? 0);
  return {
    report: "invoices_revenue_quarter",
    note: "Grobe Paid-Summe Verlängerungsrechnungen der letzten 90 Tage (renewal_invoices mit paid_at) — nicht bilanzrechtlich.",
    paidRenewalSumApproxChf: amt,
  };
}

async function reportInvoicesCreatedRecent(runQuery: QueryFn, limit: number) {
  const rows = await runQuery(
    `SELECT invoice_number, invoice_status, amount_chf, created_at
     FROM tour_manager.renewal_invoices
     ORDER BY created_at DESC NULLS LAST
     LIMIT $1`,
    [limit],
  );
  return { report: "invoices_created_recent", count: rows.length, rows };
}

async function reportProductsBookingFrequency(runQuery: QueryFn, limit: number) {
  const rows = await runQuery(
    `SELECT p.code, p.name, COUNT(*)::int AS picks
     FROM booking.orders o
     CROSS JOIN LATERAL jsonb_each(COALESCE(o.services::jsonb, '{}'::jsonb)) AS svc(key, val)
     JOIN booking.products p ON p.code = svc.key AND p.active = TRUE
     WHERE o.created_at >= NOW() - INTERVAL '24 months'
       AND (svc.val = 'true'::jsonb OR (jsonb_typeof(svc.val) = 'number' AND (svc.val::text)::numeric > 0))
     GROUP BY p.code, p.name
     ORDER BY picks DESC
     LIMIT $1`,
    [limit],
  );
  return { report: "products_booking_frequency", count: rows.length, rows };
}

async function reportCustomersByCantonHint(runQuery: QueryFn, limit: number) {
  const rows = await runQuery(
    `SELECT substring(zipcity from '[0-9]{4}') AS plz_prefix,
            COUNT(*)::int AS cnt
     FROM core.customers
     WHERE zipcity ~ '[0-9]{4}'
     GROUP BY substring(zipcity from '[0-9]{4}')
     ORDER BY cnt DESC
     LIMIT $1`,
    [limit],
  );
  return {
    report: "customers_count_by_canton",
    note: "Gruppierung nur über PLZ-Präfix aus zipcity — Kantonszuordnung ist approximativ.",
    count: rows.length,
    rows,
  };
}

async function reportCancellationRate(runQuery: QueryFn) {
  const rows = await runQuery<{ total: string; cancelled: string }>(
    `SELECT
       COUNT(*)::text AS total,
       SUM(CASE WHEN status IN ('cancelled','storno','canceled') THEN 1 ELSE 0 END)::text AS cancelled
     FROM booking.orders
     WHERE created_at >= NOW() - INTERVAL '6 months'`,
    [],
  );
  const total = Number(rows[0]?.total ?? 0);
  const cancelled = Number(rows[0]?.cancelled ?? 0);
  const rate = total > 0 ? Math.round((cancelled / total) * 1000) / 10 : 0;
  return {
    report: "orders_cancellation_rate",
    note: "Heuristik über booking.orders Status-Werte — Statusnamen können variieren.",
    windowMonths: 6,
    totalOrders: total,
    cancelledOrders: cancelled,
    cancellationPercentApprox: rate,
  };
}

async function reportMonthlySeasonality(runQuery: QueryFn) {
  const rows = await runQuery(
    `SELECT EXTRACT(MONTH FROM created_at)::int AS month,
            COUNT(*)::int AS cnt
     FROM booking.orders
     WHERE created_at >= NOW() - INTERVAL '36 months'
     GROUP BY month
     ORDER BY cnt DESC`,
    [],
  );
  return { report: "orders_monthly_seasonality_approx", count: rows.length, rows };
}

async function reportOrdersYoY(runQuery: QueryFn) {
  const rows = await runQuery<{ y: string; cnt: string }>(
    `SELECT EXTRACT(YEAR FROM created_at)::text AS y, COUNT(*)::text AS cnt
     FROM booking.orders
     WHERE created_at >= NOW() - INTERVAL '25 months'
     GROUP BY y
     ORDER BY y`,
    [],
  );
  return { report: "orders_yoy_volume", count: rows.length, rows };
}

async function reportAdminUsers(runQuery: QueryFn, limit: number) {
  const rows = await runQuery(
    `SELECT id, email, full_name, role, active
     FROM core.admin_users
     ORDER BY email ASC
     LIMIT $1`,
    [limit],
  );
  return { report: "admin_users_roles", count: rows.length, rows };
}

async function reportDuplicateCandidates(runQuery: QueryFn, limit: number) {
  const rows = await runQuery(
    `SELECT id, new_customer_id, suspected_keep_id, score, reason, status
     FROM booking.customer_duplicate_candidates
     WHERE status = 'open'
     ORDER BY score DESC NULLS LAST, id DESC
     LIMIT $1`,
    [limit],
  );
  return { report: "duplicate_customer_candidates", count: rows.length, rows };
}

async function reportPlatformActivity(runQuery: QueryFn, limit: number) {
  const assistant = await runQuery(
    `SELECT 'assistant_audit' AS source, action AS summary, executed_at AS at
     FROM tour_manager.assistant_audit_log
     WHERE executed_at >= NOW() - INTERVAL '24 hours'
     ORDER BY executed_at DESC
     LIMIT $1`,
    [limit],
  );
  const employee = await runQuery(
    `SELECT 'employee_activity' AS source, action AS summary, created_at AS at
     FROM booking.employee_activity_log
     WHERE created_at >= NOW() - INTERVAL '24 hours'
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit],
  );
  let auth: Record<string, unknown>[] = [];
  try {
    auth = await runQuery(
      `SELECT 'auth_audit' AS source, action AS summary, created_at AS at
       FROM booking.auth_audit_log
       WHERE created_at >= NOW() - INTERVAL '24 hours'
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit],
    );
  } catch {
    auth = [];
  }
  const merged = [...assistant, ...employee, ...auth].sort((a, b) => {
    const ta = new Date(String((a as { at?: unknown }).at)).getTime();
    const tb = new Date(String((b as { at?: unknown }).at)).getTime();
    return tb - ta;
  });
  return {
    report: "platform_activity_24h",
    note: "Auszug aus Assistant-, Mitarbeiter- und Auth-Audit — keine vollständige Plattform-Historie.",
    count: merged.length,
    rows: merged.slice(0, limit),
  };
}

export const reportingHandlers = createReportingHandlers({ query: defaultQuery });
