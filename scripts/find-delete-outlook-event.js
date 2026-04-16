#!/usr/bin/env node
// Sucht alle Kalender-Events die #100076 im Betreff haben und loescht sie
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
  console.log(`Suche Events fuer ${EMAIL} mit "${KEYWORD}" ...`);

  // calendarView für die naechsten 30 Tage
  const start = new Date();
  start.setDate(start.getDate() - 7);
  const end = new Date();
  end.setDate(end.getDate() + 60);

  const res = await graph
    .api(`/users/${EMAIL}/calendarView`)
    .query({
      startDateTime: start.toISOString(),
      endDateTime: end.toISOString(),
      top: 100,
    })
    .get();

  const all = res.value || [];
  const matches = all.filter((e) => e.subject && e.subject.includes(KEYWORD));

  if (!matches.length) {
    console.log("Keine Events gefunden.");
    return;
  }

  console.log(`${matches.length} Event(s) gefunden:`);
  for (const ev of matches) {
    console.log(`  - ${ev.subject} | ${ev.start?.dateTime} | id: ${ev.id}`);
  }

  for (const ev of matches) {
    try {
      await graph.api(`/users/${EMAIL}/events/${ev.id}`).delete();
      console.log(`  GELOESCHT: ${ev.subject}`);
    } catch (err) {
      console.error(`  FEHLER beim Loeschen: ${err?.message || err}`);
    }
  }

  console.log("Fertig.");
}

run().catch((err) => {
  console.error("Fehler:", err.message || err);
  process.exit(1);
});
