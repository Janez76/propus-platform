#!/usr/bin/env node
// Durchsucht ALLE Kalender-Ordner einer Mailbox nach einem Schluesselbegriff
const { ClientSecretCredential } = require("@azure/identity");
const { Client } = require("@microsoft/microsoft-graph-client");

const EMAIL = process.argv[2] || "janez.smirmaul@propus.ch";
const KEYWORD = process.argv[3] || "100076";

const cred = new ClientSecretCredential(
  process.env.MS_GRAPH_TENANT_ID,
  process.env.MS_GRAPH_CLIENT_ID,
  process.env.MS_GRAPH_CLIENT_SECRET
);
const graph = Client.initWithMiddleware({
  authProvider: {
    getAccessToken: async () => {
      const token = await cred.getToken("https://graph.microsoft.com/.default");
      return token.token;
    },
  },
});

async function run() {
  // 1) Alle Kalender-Ordner auflisten
  const calsRes = await graph.api(`/users/${EMAIL}/calendars`).top(50).get();
  const calendars = calsRes.value || [];
  console.log(`Kalender fuer ${EMAIL}: ${calendars.map((c) => c.name).join(", ")}`);

  // 2) Jeden Kalender nach Events mit KEYWORD durchsuchen
  const start = new Date("2026-04-01T00:00:00").toISOString();
  const end = new Date("2026-04-30T23:59:59").toISOString();

  let found = [];
  for (const cal of calendars) {
    const res = await graph
      .api(`/users/${EMAIL}/calendars/${cal.id}/calendarView`)
      .query({ startDateTime: start, endDateTime: end, top: 100 })
      .get();
    const hits = (res.value || []).filter((e) => e.subject && e.subject.includes(KEYWORD));
    for (const h of hits) found.push({ calName: cal.name, ...h });
  }

  if (!found.length) {
    console.log(`Keine Events mit "${KEYWORD}" im April 2026 gefunden – Event scheint wirklich geloescht.`);
    return;
  }

  console.log(`${found.length} Event(s) gefunden:`);
  for (const ev of found) {
    console.log(`  [${ev.calName}] ${ev.subject} | ${ev.start?.dateTime} | id: ${ev.id}`);
    try {
      await graph.api(`/users/${EMAIL}/events/${ev.id}`).delete();
      console.log(`    -> GELOESCHT`);
    } catch (err) {
      console.error(`    -> FEHLER: ${err?.message}`);
    }
  }
}

run().catch((err) => {
  console.error("Fehler:", err.message || err);
  process.exit(1);
});
