/**
 * Ad-hoc Eval: Testfragen rund um Tagesplan / Aufträge / M365-Kalender / BKBN.
 * Nutzt System-Prompt + Tool-Definitionen wie eval-assistant.ts, mit gemockten Tools.
 * Einige Fälle setzen per fixtureOverrides eigene Tool-Antworten, um den realen
 * Konfliktfall (Tagesplan 0 vs. überfälliger Auftrag vs. Outlook-Fehler) und den
 * "kein Postfach"-Fall zu erzwingen — der Standard-Mock allein deckt das nicht ab.
 *
 * Run:  npx tsx app/scripts/eval-calendar-questions.ts
 * Key:  ANTHROPIC_API_KEY aus app/.env.local / app/.env (via eval-assistant.ts geladen).
 */
import Anthropic from "@anthropic-ai/sdk";
import { runEvalCase, type EvalTestCase, type FixtureOverrides } from "./eval-assistant";

const CALENDAR_TOOLS = ["get_today_schedule", "get_open_orders", "get_m365_calendar_overlay", "get_bkbn_orders"];

type Case = EvalTestCase & {
  /** Tool-Antworten, die für diesen Fall die Standard-Mocks überschreiben. */
  overrides?: FixtureOverrides;
  /** Soft-Hinweis im Report: wurden Outlook/BKBN-Quellen mitgenutzt? */
  showCalendarSources?: boolean;
};

const CASES: Case[] = [
  {
    id: "q1-heute-anstehend",
    userMessage: "Was steht heute an?",
    expectToolAnyOf: ["get_today_schedule", "get_open_orders"],
    showCalendarSources: true,
    maxTurns: 6,
  },
  {
    id: "q2-bin-ich-heute-frei",
    userMessage: "Bin ich heute frei?",
    expectToolAnyOf: ["get_today_schedule", "get_open_orders"],
    showCalendarSources: true,
    maxTurns: 6,
  },
  {
    id: "q3-naechster-auftrag",
    userMessage: "Was ist mein nächster Auftrag?",
    expectToolAnyOf: ["get_open_orders"],
    mustNotContain: [/überfällig.{0,30}nächster|nächster.{0,30}überfällig/i],
    maxTurns: 6,
  },
  {
    id: "q4-morgen-11-12-bkbn",
    userMessage: "Habe ich morgen um 11 und 12 Uhr Aufträge? Es geht um Backbone Art / bkbn.",
    expectToolAnyOf: ["get_bkbn_orders", "get_m365_calendar_overlay", "get_open_orders"],
    maxTurns: 6,
  },
  {
    id: "q5-kray-100100",
    userMessage: "Zeig mir den Auftrag #100100 (Kray).",
    expectToolAnyOf: ["get_order_detail", "get_order_by_id", "search_orders", "get_open_orders"],
    mustNotContain: [/erfunden|vermutlich|wahrscheinlich/i],
    maxTurns: 6,
  },
  {
    id: "q6-ueberfaellig",
    userMessage: "Welche Aufträge sind überfällig?",
    expectToolAnyOf: ["get_open_orders"],
    maxTurns: 6,
  },
  {
    id: "q7-bkbn-anstehend",
    userMessage: "Welche Backbone-/BKBN-Aufträge stehen an?",
    expectToolAnyOf: ["get_bkbn_orders"],
    mustNotContain: [/Auftragsnummer|Rechnung gestellt/i],
    maxTurns: 6,
  },
  {
    id: "q8-outlook-only-termine",
    userMessage: "Was habe ich diese Woche für Outlook-Termine, die nicht im Buchungssystem stehen?",
    expectToolAnyOf: ["get_m365_calendar_overlay"],
    maxTurns: 6,
  },
  {
    id: "q9-widerspruch-aufloesen",
    userMessage:
      "Der Tagesplan zeigt 0 Aufträge für heute — stimmt das wirklich? Bitte auch Outlook und BKBN gegenchecken.",
    expectToolAnyOf: ["get_m365_calendar_overlay", "get_bkbn_orders"],
    showCalendarSources: true,
    maxTurns: 6,
  },
  {
    id: "q10-welches-postfach",
    userMessage: "Mit welchem Postfach / als wer arbeitest du gerade für mich?",
    mustNotContain: [/\bich bin (admin|der administrator)\b/i],
    maxTurns: 4,
  },
  // --- erzwungener Konfliktfall: Tagesplan 0, aber 1 überfälliger Auftrag + Outlook-Fehler ---
  {
    id: "q11-konflikt-erzwungen",
    userMessage: "Bin ich heute frei? Tagesplan zeigt nichts an.",
    showCalendarSources: true,
    overrides: {
      get_today_schedule: () => ({ count: 0, orders: [] }),
      get_open_orders: () => ({
        count: 1,
        orders: [
          {
            orderNo: 100100,
            status: "in_progress",
            address: "Krayweg 3, 8000 Zürich",
            customerName: "Kray AG",
            scheduledDate: "2026-05-08",
            scheduledTime: "10:00",
            photographerName: "Ivan",
            services: ["Fotografie"],
            isOverdue: true,
            isToday: false,
            hasNoDate: false,
          },
        ],
      }),
      get_m365_calendar_overlay: () => ({
        mailbox: "eval@propus.ch",
        outlookEnabled: false,
        outlookError: "graph token expired",
        count: 0,
        events: [],
        warning: "Outlook-/Graph-Anbindung ist NICHT aktiv — Liste evtl. unvollständig.",
      }),
      get_bkbn_orders: () => ({ source: "backbonephoto.co", graphEnabled: true, count: 0, orders: [] }),
    },
    // darf NICHT behaupten, der User sei frei; muss die Diskrepanz/Unsicherheit nennen
    mustNotContain: [/\b(du bist|bist heute|komplett) frei\b/i, /heute (nichts|keine termine|keine aufträge)\b/i],
    mustContain: [/100100|Kray|überfällig|Outlook|nicht abfragen|unvollständig/i],
    maxTurns: 6,
  },
  // --- "kein echtes Postfach": Overlay liefert no_user_mailbox ---
  {
    id: "q12-kein-postfach",
    userMessage: "Zeig mir meine Outlook-Termine diese Woche.",
    overrides: {
      get_m365_calendar_overlay: () => ({
        error: "no_user_mailbox",
        message:
          "Für deinen aktuellen Login ist keine echte E-Mail-Adresse hinterlegt — daher kann ich deinen Microsoft-365-Kalender nicht lesen.",
      }),
    },
    mustNotContain: [/keine (outlook-)?termine\b/i, /\bdu hast nichts\b/i],
    mustContain: [/E-?Mail|Postfach|anmelden|Login/i],
    maxTurns: 4,
  },
];

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY fehlt (app/.env.local / app/.env).");
    process.exit(1);
  }
  const client = new Anthropic({ apiKey });

  let passed = 0;
  const rows: string[] = [];
  for (const tc of CASES) {
    const r = await runEvalCase(client, tc, tc.overrides);
    if (r.pass) passed += 1;
    const calCalled = r.tools.filter((t) => CALENDAR_TOOLS.includes(t));
    const calNote = tc.showCalendarSources
      ? `  [Kalenderquellen: ${calCalled.length ? calCalled.join("+") : "KEINE"}]`
      : "";
    const mark = r.pass ? "✓" : "✗";
    console.log(`${mark} ${tc.id}`);
    console.log(`    Frage : ${tc.userMessage}`);
    console.log(`    Tools : [${r.tools.join(", ")}]${calNote}`);
    console.log(`    Antw. : ${r.finalText.replace(/\s+/g, " ").slice(0, 300)}`);
    console.log(`    Status: ${r.reason}  (tokens ${r.inputTokens}+${r.outputTokens})`);
    console.log("");
    rows.push(`${mark} ${tc.id} — ${r.reason}`);
  }
  console.log("──────────────────────────────────────────────");
  console.log(rows.join("\n"));
  console.log(`\nSummary: ${passed}/${CASES.length} bestanden`);
  if (passed < CASES.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
