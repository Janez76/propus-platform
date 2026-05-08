/**
 * Standalone eval: Anthropic Messages API + gemockte Tools (kein DB).
 * Run: npm run eval:assistant [--json] [--replay] [--replay-file=<path>] [--case=<id>] [--no-business]
 * Key: `ANTHROPIC_API_KEY` aus der Umgebung oder aus `app/.env.local` / `app/.env`.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlock,
  MessageParam,
  TextBlock,
  ToolResultBlockParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";
import { buildSystemPrompt } from "../src/lib/assistant/system-prompt";
import { selectFewShots } from "../src/lib/assistant/few-shot-examples";
import { allTools, toAnthropicTools } from "../src/lib/assistant/tools/index";
import { MODEL_IDS } from "../src/lib/assistant/model-router";
import { loadAppEnv } from "./load-local-env";
import { BUSINESS_COVERAGE_CASES } from "./eval-business-cases";

loadAppEnv(import.meta.url);

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPLAY_JSON_PATH = path.join(SCRIPT_DIR, "replay-cases.json");

function isCliEntry(): boolean {
  const script = path.normalize(fileURLToPath(import.meta.url));
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return path.normalize(argv1) === script;
}

export const EVAL_MODEL = MODEL_IDS.sonnet;
const MAX_TOKENS = 1024;
const TEMPERATURE = 0;
const DEFAULT_LOOP_MAX = 6;

export type EvalTestCase = {
  id: string;
  userMessage: string;
  /** Optional vorherige Turns (z. B. kein Begrüssen). */
  priorMessages?: MessageParam[];
  /** Erwartete Tool-Namen als Teilfolge der tatsächlichen Aufrufe (Reihenfolge). */
  expectTools?: string[];
  /** Mindestens eines dieser Tools muss vorkommen. */
  expectToolAnyOf?: string[];
  /** Diese Tool-Namen dürfen nicht aufgerufen werden (leer = keine Prüfung). */
  expectNoTools?: string[];
  mustContain?: RegExp[];
  mustNotContain?: RegExp[];
  maxTurns?: number;
  /** Aus Produktion (Replay): beobachtete Tools — Drift-Vergleich zur Eval-Lauf-Reihenfolge. */
  observedTools?: string[];
};

export type EvalCaseResult = {
  id: string;
  pass: boolean;
  reason: string;
  model: string;
  tools: string[];
  inputTokens: number;
  outputTokens: number;
  finalText: string;
  observedTools?: string[];
  /** observedTools als Teilfolge von tools (Eval-Lauf). */
  driftOk?: boolean;
  driftDetail?: string;
};

export type EvalSuiteSummary = {
  passed: number;
  total: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  results: EvalCaseResult[];
  failedCases: Array<{ case: EvalTestCase; result: EvalCaseResult }>;
};

const ALL_TOOL_NAMES = allTools.map((t) => t.name);

const FIXTURES: Record<string, (input: Record<string, unknown>) => unknown> = {
  search_customers: () => [{ id: "cust-1", name: "Polletti AG", email: "info@polletti.ch" }],
  get_tour_status: () => ({ tour_id: 42, customer_name: "Polletti AG", status: "active" }),
  get_tour_detail: () => ({ tour_id: 42, customer_name: "Polletti AG", status: "active" }),
  search_invoices: () => [{ id: "inv-1", customer_id: "cust-1", amount: 1234, status: "open" }],
  get_order_detail: () => ({ error: "Auftrag nicht gefunden" }),
  get_order_by_id: () => ({ error: "Auftrag nicht gefunden" }),
  save_memory: () => ({ ok: true, id: "mem-1" }),
  send_email: () => ({
    confirmation_required: true,
    draft: { to: "info@firma.ch", subject: "Tour-Verlängerung", body_html: "<p>Entwurf</p>" },
  }),
  get_route: () => ({
    summary: "Kanton Zürich",
    warnings: [],
    totalDistanceMeters: 23000,
    totalDurationSeconds: 1680,
    legs: [
      {
        distanceText: "23 km",
        distanceMeters: 23000,
        durationText: "28 Minuten",
        durationSeconds: 1680,
        durationInTrafficText: null,
        durationInTrafficSeconds: null,
        startAddress: "Albisstrasse, Zürich, Schweiz",
        endAddress: "Oetwil am See, Schweiz",
        stepCount: 0,
      },
    ],
    steps: [],
    overviewPolyline: null,
    attribution: "Routing: Google Maps Directions",
  }),
  get_distance_matrix: () => ({
    originCount: 1,
    destinationCount: 1,
    matrix: [
      {
        origin: "Albisstrasse, Zürich, Schweiz",
        cells: [
          {
            destination: "Oetwil am See, Schweiz",
            status: "OK",
            distanceText: "23 km",
            distanceMeters: 23000,
            durationText: "28 Minuten",
            durationSeconds: 1680,
            durationInTrafficSeconds: null,
          },
        ],
      },
    ],
    attribution: "Routing: Google Maps Distance Matrix",
  }),
  get_weather_forecast: () => ({
    location: { lat: 47.3769, lng: 8.5417, area: "Zürich", zip: "8001" },
    attribution: "Open-Meteo · MeteoSwiss ICON-CH",
    warningsNote: "Für offizielle Unwetterwarnungen siehe https://www.meteoschweiz.admin.ch (MeteoSchweiz).",
    current: {
      time: "2026-05-02T12:00",
      kind: "partly_cloudy",
      label: "teilweise bewölkt",
      temperature: 18,
      humidity: 55,
      windSpeed: 12,
      precipitation: 0,
    },
    days: [
      {
        date: "2026-05-03",
        kind: "partly_cloudy",
        label: "teilweise bewölkt",
        tMax: 22,
        tMin: 12,
        precipProb: 10,
        windMax: 18,
        sunrise: "06:12",
        sunset: "20:45",
      },
    ],
  }),
  propus_report: (input) => ({
    report: typeof input.report === "string" ? input.report : "mock",
    count: 2,
    rows: [
      { order_no: 9001, status: "open", demo: true },
      { order_no: 9002, status: "scheduled", demo: true },
    ],
    note: "eval-fixture",
  }),
  get_open_orders: () => ({
    count: 2,
    orders: [
      {
        orderNo: 501,
        status: "in_progress",
        address: "Bahnhofstrasse 1, 8001 Zürich",
        customerId: 1,
        customerName: "Muster AG",
        scheduledDate: "2026-05-12",
        scheduledTime: "10:00",
        photographerName: "Ivan",
        services: ["Fotografie"],
        createdAt: "2026-05-01T08:00:00.000Z",
      },
      {
        orderNo: 502,
        status: "scheduled",
        address: "Seestrasse 2, 8700 Küsnacht",
        customerId: 2,
        customerName: "Beispiel GmbH",
        scheduledDate: null,
        scheduledTime: null,
        photographerName: null,
        services: [],
        createdAt: "2026-05-02T09:00:00.000Z",
      },
    ],
  }),
  search_orders: () => ({
    count: 1,
    orders: [
      {
        orderNo: 601,
        status: "open",
        address: "Zürich",
        customerId: 3,
        customerName: "Suche-Treffer AG",
        scheduledDate: "2026-05-15",
        scheduledTime: null,
        photographerName: null,
        services: ["Drohne"],
        createdAt: "2026-05-03T10:00:00.000Z",
      },
    ],
  }),
  get_today_schedule: () => ({
    count: 1,
    orders: [
      {
        orderNo: 701,
        status: "open",
        address: "Heute-Strasse 1",
        customerId: 4,
        customerName: "Termin Kunde",
        scheduledDate: "2026-05-08",
        scheduledTime: "14:00",
        photographerName: "Marijana",
        services: [],
        createdAt: null,
      },
    ],
  }),
  get_tours_expiring_soon: () => ({
    count: 1,
    tours: [
      {
        id: 101,
        label: "Objekt Alpha",
        customerName: "Polletti AG",
        customerEmail: "info@polletti.ch",
        customerId: 10,
        status: "ACTIVE",
        matterportSpaceId: "abc123",
        termEndDate: "2026-06-01",
        bookingOrderNo: 501,
      },
    ],
  }),
  count_active_tours: () => ({ count: 42 }),
  get_cleanup_selections: () => ({
    count: 1,
    cleanupSelections: [
      {
        tour: {
          id: 202,
          label: "Archivierte Demo-Tour",
          customerName: "Firma XY",
          customerEmail: "xy@example.com",
          customerId: 20,
          status: "ACTIVE",
          matterportSpaceId: "mp-99",
          termEndDate: "2026-12-31",
          bookingOrderNo: null,
        },
        confirmationRequired: false,
        cleanupAction: "archivieren",
        cleanupActionLabel: "Archivieren",
        cleanupCompleted: true,
        customerIntent: null,
        latestSession: null,
        latestCleanupLog: null,
      },
    ],
  }),
  get_overdue_invoices: () => ({
    count: 1,
    invoices: [
      {
        number: "R-900",
        status: "open",
        amount: 450,
        dueAt: "2026-04-01",
        customerName: "Firma XY",
        customerEmail: "xy@example.com",
        tourId: 101,
        tourLabel: "Tour A",
      },
    ],
  }),
  get_invoice_stats: () => ({
    renewal: {
      byStatus: [
        { status: "paid", count: 120 },
        { status: "open", count: 15 },
      ],
      overdue: 3,
    },
    exxas: { byStatus: [{ status: "bz", count: 8 }] },
  }),
  get_open_tasks: () => ({
    count: 2,
    tasks: [
      {
        id: 1,
        title: "Rückruf Kunde",
        description: null,
        status: "open",
        priority: "high",
        due_at: null,
        conversation_id: 10,
        customer_id: 1,
        order_id: null,
        tour_id: null,
        assigned_admin_user_id: null,
      },
      {
        id: 2,
        title: "Rechnung prüfen",
        description: null,
        status: "in_progress",
        priority: "normal",
        due_at: "2026-05-10",
        conversation_id: null,
        customer_id: null,
        order_id: 501,
        tour_id: null,
        assigned_admin_user_id: 1,
      },
    ],
  }),
  get_posteingang_stats: () => ({
    conversations: { open: 8, closed: 120, archived: 5 },
    openTasks: 5,
    avgResponseTimeHours: 4.2,
  }),
  get_recent_posteingang_messages: () => ({
    requested_limit: 20,
    returned_count: 2,
    conversation_count: 2,
    summary_note: "eval-fixture",
    count: 2,
    messages: [
      {
        id: 1001,
        conversationId: 50,
        direction: "inbound",
        fromName: "Kunde",
        fromEmail: "k@example.com",
        subject: "Termin",
        bodyPreview: "Kurzer Text…",
        sentAt: "2026-05-07T12:00:00.000Z",
        conversationStatus: "open",
      },
      {
        id: 1002,
        conversationId: 51,
        direction: "outbound",
        fromName: "Büro",
        fromEmail: "office@propus.local",
        subject: "Antwort",
        bodyPreview: "Bestätigung…",
        sentAt: "2026-05-07T13:00:00.000Z",
        conversationStatus: "open",
      },
    ],
  }),
  search_posteingang_conversations: () => ({
    count: 1,
    conversations: [{ id: 50, subject: "Follow-up", status: "open", customer_name: "Test AG" }],
  }),
  matterport_list_spaces: () => ({
    ok: true,
    total: 3,
    returned: 2,
    spaces: [
      {
        id: "space-1",
        name: "Showroom Zürich",
        state: "active",
        visibility: "public",
        address: "8001 Zürich",
        shareUrl: "https://my.matterport.com/show/?m=space-1",
        externalUrl: null,
        published: true,
        created: null,
        modified: null,
      },
      {
        id: "space-2",
        name: "Archiviert Alt",
        state: "inactive",
        visibility: "private",
        address: null,
        shareUrl: null,
        externalUrl: null,
        published: false,
        created: null,
        modified: null,
      },
    ],
  }),
  get_customer_detail: () => ({
    customer: {
      id: 99,
      name: "Historie Kunde AG",
      email: "hist@example.com",
      emailAliases: null,
      phone: "+41 44 111 22 33",
      company: null,
      address: "Testweg 1, 8001 Zürich, CH",
      note: null,
      exxasCustomerId: null,
      createdAt: "2024-01-01T00:00:00.000Z",
    },
    contacts: [{ id: 1, name: "Hauptkontakt", email: "haupt@firma.ch", phone: null, role: "primary", sortOrder: 0 }],
    companies: [],
    recentOrders: [{ orderNo: 801, status: "done", address: "Alt-Strasse 1", createdAt: "2025-01-10T10:00:00.000Z" }],
    activeTours: [{ tourId: 55, label: "Tour Alt", status: "ACTIVE", termEndDate: "2026-06-01" }],
  }),
  get_customer_contacts: () => ({
    customerId: 88,
    count: 1,
    contacts: [
      {
        id: 1,
        name: "Hauptkontakt",
        email: "haupt@firma.ch",
        phone: null,
        role: "primary",
        sortOrder: 0,
        createdAt: "2025-06-01T00:00:00.000Z",
      },
    ],
  }),
  search_contacts: () => ({
    count: 1,
    contacts: [
      {
        id: 2,
        name: "Suchtreffer",
        email: "s@firma.ch",
        phone: null,
        role: null,
        customer: { id: 88, name: "Firma XY", email: "firma@example.com" },
      },
    ],
  }),
  list_available_services: () => ({
    count: 2,
    services: [
      { id: 1, code: "photo", name: "Fotografie", kind: "service", categoryKey: "shooting", description: null },
      { id: 2, code: "drone", name: "Drohne", kind: "service", categoryKey: "shooting", description: null },
    ],
  }),
  list_photographers: () => ({
    count: 2,
    photographers: [
      { key: "ivan", displayName: "Ivan", homeAddress: null, skills: null },
      { key: "marijana", displayName: "Marijana", homeAddress: null, skills: null },
    ],
  }),
  get_travel_time_for_orders: () => ({
    startAddress: "Zürich HB",
    mode: "driving",
    count: 1,
    orders: [
      {
        orderNo: 501,
        address: "Artherstrasse 1, 6315 Oberägeri",
        status: "OK",
        distanceText: "35 km",
        durationText: "38 Minuten",
        durationSeconds: 2280,
      },
    ],
    attribution: "Routing: Google Maps Distance Matrix",
  }),
  get_weather_for_order: () => ({
    orderNo: 501,
    date: "2026-05-12",
    location: { area: "Zug", lat: 47.1662, lng: 8.5155 },
    weather: { kind: "partly_cloudy", tMax: 22, tMin: 12, precipProb: 15, source: "eval-fixture" },
  }),
  query_database: (input) => ({
    rowCount: 2,
    fields: ["email", "roles"],
    rows: [
      { email: "admin@propus.local", roles: "{admin,super_admin}" },
      { email: "user@propus.local", roles: "{employee}" },
    ],
    note: "eval-fixture — echtes Tool nur super_admin",
    sqlEcho: typeof input.sql === "string" ? input.sql.slice(0, 120) : null,
  }),
};

function defaultFixture(_input: Record<string, unknown>) {
  return { ok: true, data: [], note: "mocked" };
}

function buildMockHandlers(): Record<string, (input: Record<string, unknown>) => unknown> {
  const map: Record<string, (input: Record<string, unknown>) => unknown> = {};
  for (const name of ALL_TOOL_NAMES) {
    map[name] = FIXTURES[name] ?? defaultFixture;
  }
  return map;
}

const mockHandlers = buildMockHandlers();

function serializeToolResult(output: unknown): string {
  if (typeof output === "string") return output;
  return JSON.stringify(output);
}

function extractText(content: ContentBlock[]): string {
  return content
    .filter((b): b is TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

export function isSubsequence(needle: string[], haystack: string[]): boolean {
  let i = 0;
  for (const h of haystack) {
    if (i < needle.length && h === needle[i]) i += 1;
  }
  return i === needle.length;
}

export function mergeEvalCases(base: EvalTestCase[], extra: EvalTestCase[]): EvalTestCase[] {
  const seen = new Set(base.map((c) => c.id));
  const out = [...base];
  for (const c of extra) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out;
}

const BUSINESS_EVAL_CASES: EvalTestCase[] = BUSINESS_COVERAGE_CASES.map((c) => ({
  id: c.id,
  userMessage: c.userMessage,
  expectToolAnyOf: c.expectToolAnyOf,
  maxTurns: 8,
}));

/** Kernregression ohne die 50 Business-Coverage-Fälle (schneller). CLI: `--no-business`. */
export const BASE_TEST_CASES: EvalTestCase[] = [
  {
    id: "smalltalk-greeting",
    userMessage: "Hallo!",
    expectNoTools: ALL_TOOL_NAMES,
    mustContain: [/./],
    mustNotContain: [/Tool/i],
  },
  {
    id: "kunde-suchen",
    userMessage: "Suche Kunde Polletti",
    expectTools: ["search_customers"],
  },
  {
    id: "tour-status",
    userMessage: "Wie ist der Status von Tour 42?",
    expectToolAnyOf: ["get_tour_status", "get_tour_detail"],
  },
  {
    id: "tippfehler-fuzzy",
    userMessage: "Hat poleti offene rechnungen?",
    expectTools: ["search_customers"],
    maxTurns: 4,
  },
  {
    id: "memory-save",
    userMessage: "Merk dir: Kunde X bevorzugt Termine am Vormittag",
    expectTools: ["save_memory"],
  },
  {
    id: "email-send",
    userMessage: "Schreib an info@firma.ch wegen Tour-Verlängerung",
    expectTools: ["send_email"],
    mustNotContain: [
      /\bkann\b[^\n]{0,80}\bnicht\b[^\n]{0,40}\bdirekt\b[^\n]{0,60}\b(senden|schreiben|mailen|kommunizieren)/i,
    ],
  },
  {
    id: "auftrag-anlegen-start",
    userMessage: "Ich möchte einen neuen Auftrag anlegen",
    expectNoTools: [],
    mustContain: [/Kunde/i],
  },
  {
    id: "no-hallu-id",
    userMessage: "Was ist mit Auftrag #99999999?",
    expectToolAnyOf: ["get_order_detail", "get_order_by_id"],
    mustNotContain: [/[Ee]rfunden|wahrscheinlich|vermutlich/],
  },
  {
    id: "german-only",
    userMessage: "Hello, how are you?",
    mustContain: [
      /([äöüÄÖÜß]|[Hh]allo|[Gg]uten|\b(ich|Sie|dir|Ihnen|helfen|können|gern|gerne|danke|schön|Propus|Mir|geht|wie)\b)/i,
    ],
  },
  {
    id: "no-greeting-midconvo",
    priorMessages: [
      { role: "user", content: "Wir hatten eben über Tour 42 gesprochen." },
      {
        role: "assistant",
        content: "Genau — Tour 42 ist bei Polletti AG und der Status ist aktiv.",
      },
    ],
    userMessage: "Und der nächste?",
    mustNotContain: [/^(Hallo|Guten Morgen|Wie kann)/i],
  },
  {
    id: "rechnungen-kombi",
    userMessage: "Hat Müller offene Rechnungen?",
    expectTools: ["search_customers", "search_invoices"],
  },
  {
    id: "weather-honest",
    userMessage: "Wie wird das Wetter morgen in Zürich?",
    expectTools: ["get_weather_forecast"],
    mustNotContain: [/Kein Live-Wetter/i, /keine Wetter-API/i, /basierend auf aktuellen Daten/i],
    mustContain: [/°|Grad|Höchst|Tiefst|Temperatur|wolk|Regen/i],
  },
  {
    id: "routing-honest",
    userMessage: "Wie lange brauche ich von der Albisstrasse Zürich nach Oetwil am See mit dem Auto?",
    expectToolAnyOf: ["get_route", "get_distance_matrix", "get_travel_time_for_orders"],
    mustContain: [/Minuten|Min\.|\bkm\b|\d+\s*Min/i],
    mustNotContain: [/Kein eingebundenes Routing/i],
  },
];

/** Basis-Suite plus 50 Business-Fragen aus `eval-business-cases.ts`. */
export const TEST_CASES = mergeEvalCases(BASE_TEST_CASES, BUSINESS_EVAL_CASES);

type ReplayFileV1 = {
  version?: number;
  cases?: EvalTestCase[];
};

export function loadReplayCaseFile(filePath: string): EvalTestCase[] {
  const raw = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(raw) as ReplayFileV1 | EvalTestCase[];
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.cases)) return data.cases;
  return [];
}

export async function runEvalCase(client: Anthropic, tc: EvalTestCase): Promise<EvalCaseResult> {
  const fewShots = selectFewShots(tc.userMessage);
  const system = buildSystemPrompt({
    userName: "Eval-User",
    userEmail: "eval@propus.local",
    currentTime: new Date().toISOString(),
    timezone: "Europe/Zurich",
    memories: [],
    fewShots,
  });

  const tools = toAnthropicTools(allTools) as Anthropic.Messages.Tool[];
  const messages: MessageParam[] = [...(tc.priorMessages ?? []), { role: "user", content: tc.userMessage }];

  const orderedTools: string[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let lastModel = EVAL_MODEL;
  let finalText = "";
  const maxIters = tc.maxTurns ?? DEFAULT_LOOP_MAX;

  try {
    for (let iter = 0; iter < maxIters; iter += 1) {
      const response = await client.messages.create({
        model: EVAL_MODEL,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        system,
        tools,
        messages,
      });

      lastModel = response.model;
      inputTokens += response.usage?.input_tokens ?? 0;
      outputTokens += response.usage?.output_tokens ?? 0;

      const toolUses = response.content.filter((b): b is ToolUseBlock => b.type === "tool_use");

      if (toolUses.length === 0) {
        finalText = extractText(response.content);
        break;
      }

      for (const tu of toolUses) {
        orderedTools.push(tu.name);
      }

      const toolResultBlocks: ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const handler = mockHandlers[tu.name] ?? defaultFixture;
        const inputObj = (tu.input && typeof tu.input === "object" ? tu.input : {}) as Record<string, unknown>;
        const out = handler(inputObj);
        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: serializeToolResult(out),
        });
      }

      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResultBlocks });
    }

    if (finalText === "") {
      return {
        id: tc.id,
        pass: false,
        reason: "fail: Kein Antworttext (zu viele Tool-Runden oder maxTurns erreicht)",
        model: lastModel,
        tools: orderedTools,
        inputTokens,
        outputTokens,
        finalText: "",
        observedTools: tc.observedTools,
        driftOk: false,
        driftDetail: "kein finalText",
      };
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      id: tc.id,
      pass: false,
      reason: `fail (api_error): ${msg.slice(0, 200)}`,
      model: lastModel,
      tools: orderedTools,
      inputTokens,
      outputTokens,
      finalText: "",
      observedTools: tc.observedTools,
      driftOk: false,
      driftDetail: msg.slice(0, 200),
    };
  }

  let pass = true;
  const reasons: string[] = [];

  let driftOk = true;
  let driftDetail: string | undefined;
  if (tc.observedTools && tc.observedTools.length > 0) {
    driftOk = isSubsequence(tc.observedTools, orderedTools);
    driftDetail = driftOk
      ? `drift ok: ${JSON.stringify(tc.observedTools)} ⊆ Lauf`
      : `drift: observed ${JSON.stringify(tc.observedTools)} nicht als Teilfolge in ${JSON.stringify(orderedTools)}`;
    if (!driftOk) {
      pass = false;
      reasons.push(driftDetail);
    }
  }

  if (tc.expectTools?.length) {
    if (!isSubsequence(tc.expectTools, orderedTools)) {
      pass = false;
      reasons.push(`expectTools subsequence ${JSON.stringify(tc.expectTools)} not in ${JSON.stringify(orderedTools)}`);
    }
  }

  if (tc.expectToolAnyOf?.length) {
    const hit = tc.expectToolAnyOf.some((n) => orderedTools.includes(n));
    if (!hit) {
      pass = false;
      reasons.push(`expectToolAnyOf: none of ${JSON.stringify(tc.expectToolAnyOf)} in ${JSON.stringify(orderedTools)}`);
    }
  }

  if (tc.expectNoTools && tc.expectNoTools.length > 0) {
    const forbidden = new Set(tc.expectNoTools);
    const bad = orderedTools.filter((n) => forbidden.has(n));
    if (bad.length > 0) {
      pass = false;
      reasons.push(`unexpected tools: ${bad.join(", ")}`);
    }
  }

  for (const r of tc.mustContain ?? []) {
    if (!r.test(finalText)) {
      pass = false;
      reasons.push(`mustContain failed: ${r}`);
    }
  }

  for (const r of tc.mustNotContain ?? []) {
    if (r.test(finalText)) {
      pass = false;
      reasons.push(`mustNotContain matched: ${r}`);
    }
  }

  return {
    id: tc.id,
    pass,
    reason: reasons.length ? reasons.join("; ") : "ok",
    model: lastModel,
    tools: orderedTools,
    inputTokens,
    outputTokens,
    finalText,
    observedTools: tc.observedTools,
    driftOk,
    driftDetail,
  };
}

export async function runEvalSuite(
  client: Anthropic,
  options?: {
    cases?: EvalTestCase[];
    onCase?: (result: EvalCaseResult) => void;
  },
): Promise<EvalSuiteSummary> {
  const cases = options?.cases ?? TEST_CASES;
  const results: EvalCaseResult[] = [];
  let totalIn = 0;
  let totalOut = 0;

  for (const tc of cases) {
    const r = await runEvalCase(client, tc);
    results.push(r);
    totalIn += r.inputTokens;
    totalOut += r.outputTokens;
    options?.onCase?.(r);
  }

  const passed = results.filter((r) => r.pass).length;
  const failedCases = results
    .filter((r) => !r.pass)
    .map((r) => {
      const c = cases.find((x) => x.id === r.id);
      return { case: c!, result: r };
    })
    .filter((x) => x.case);

  return {
    passed,
    total: results.length,
    totalInputTokens: totalIn,
    totalOutputTokens: totalOut,
    results,
    failedCases,
  };
}

function parseArgCase(): string | null {
  const a = process.argv.find((x) => x.startsWith("--case="));
  if (!a) return null;
  return a.slice("--case=".length).trim() || null;
}

function argvHasReplay(): boolean {
  return process.argv.includes("--replay");
}

function parseReplayFilePath(): string | null {
  const a = process.argv.find((x) => x.startsWith("--replay-file="));
  if (!a) return null;
  const p = a.slice("--replay-file=".length).trim();
  return p ? path.resolve(p) : null;
}

async function main() {
  const jsonOut = process.argv.includes("--json");
  const replayFileArg = parseReplayFilePath();
  const replay = argvHasReplay() || !!replayFileArg;
  const replayPath = replayFileArg ?? REPLAY_JSON_PATH;
  const caseId = parseArgCase();
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is required");
    process.exit(1);
  }

  let cases = [...TEST_CASES];
  if (process.argv.includes("--no-business")) {
    cases = [...BASE_TEST_CASES];
  }
  if (replay) {
    if (!fs.existsSync(replayPath)) {
      if (replayFileArg) {
        console.error(`Replay file not found: ${replayPath}`);
        process.exit(1);
      }
      /* --replay ohne Datei: keine Zusatzfälle (wie zuvor) */
    } else {
      const extra = loadReplayCaseFile(replayPath);
      cases = mergeEvalCases(cases, extra);
    }
  }

  if (caseId) {
    cases = cases.filter((c) => c.id === caseId);
    if (cases.length === 0) {
      console.error(`No case with id=${caseId}`);
      process.exit(1);
    }
  }

  const client = new Anthropic({ apiKey });
  const summary = await runEvalSuite(client, {
    cases,
    onCase: jsonOut
      ? undefined
      : (r) => {
          const mark = r.pass ? "✓" : "✗";
          const drift = r.driftDetail ? `  ${r.driftDetail}` : "";
          console.log(
            `${mark} ${r.id}  tools=[${r.tools.join(", ")}]  tokens=${r.inputTokens}+${r.outputTokens}  ${r.reason}${drift}`,
          );
        },
  });

  if (jsonOut) {
    console.log(
      JSON.stringify(
        {
          passed: summary.passed,
          total: summary.total,
          totalInputTokens: summary.totalInputTokens,
          totalOutputTokens: summary.totalOutputTokens,
          cases: summary.results,
          failedCases: summary.failedCases.map((f) => ({
            case: f.case,
            result: f.result,
          })),
        },
        null,
        2,
      ),
    );
  } else {
    console.log("");
    console.log(
      `Summary: ${summary.passed}/${summary.total} passed, total tokens=${summary.totalInputTokens}+${summary.totalOutputTokens}`,
    );
  }

  if (summary.passed < summary.total) {
    process.exit(1);
  }
}

if (isCliEntry()) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
