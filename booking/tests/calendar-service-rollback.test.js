const test = require("node:test");
const assert = require("node:assert/strict");

const {
  CalendarServiceError,
  createProvisional,
  upgradeToFinal,
  repairCalendarEvents,
} = require("../calendar-service");

// ─── Graph-Client Mock ────────────────────────────────────────────────────────
// Gibt einen Mock-Client zurueck, der jeden API-Aufruf protokolliert. Per Konfig
// kann pro Pfad+Method bestimmt werden, was passiert: success | reject | searchResult.

function buildGraphMock(routes) {
  const calls = [];
  function api(path) {
    let _filter = null;
    let _select = null;
    let _top = null;
    const builder = {
      filter(f) { _filter = f; return builder; },
      select(s) { _select = s; return builder; },
      top(n) { _top = n; return builder; },
      async post(payload) {
        calls.push({ method: "POST", path, payload });
        const route = routes[`POST ${path}`];
        if (route && route.error) throw route.error;
        return route && route.response ? route.response : { id: "evt-" + (calls.length) };
      },
      async patch(payload) {
        calls.push({ method: "PATCH", path, payload });
        const route = routes[`PATCH ${path}`];
        if (route && route.error) throw route.error;
        return route && route.response ? route.response : {};
      },
      async delete() {
        calls.push({ method: "DELETE", path });
        const route = routes[`DELETE ${path}`];
        if (route && route.error) throw route.error;
        return {};
      },
      async get() {
        calls.push({ method: "GET", path, filter: _filter, select: _select, top: _top });
        const route = routes[`GET ${path}`];
        if (route && route.error) throw route.error;
        return route && route.response ? route.response : { value: [] };
      },
    };
    return builder;
  }
  return { client: { api }, calls };
}

function buildOrder(overrides = {}) {
  return {
    orderNo: 4711,
    address: "Wiesenstrasse 10, 9220 Bischofszell",
    object: { type: "single_house", area: 150 },
    services: { package: { label: "Standard" }, addons: [] },
    photographer: { key: "janez", name: "Janez Smirmaul", email: "janez.smirmaul@propus.ch" },
    schedule: { date: "2026-05-07", time: "10:00", durationMin: 90 },
    billing: { zipcity: "9220 Bischofszell" },
    ...overrides,
  };
}

const NO_DB = { getPool: () => null }; // erzwingt Sync-Fallback in buildOrderEventData
const DEPS = (graphClient) => ({
  graphClient,
  OFFICE_EMAIL: "office@propus.ch",
  PHOTOG_PHONES: { janez: "+41 76 340 70 75" },
  db: NO_DB,
});

// ─── createProvisional: symmetrischer Office-Rollback ─────────────────────────

test("createProvisional: Photographer-POST scheitert NACH Office-POST → Office-Event wird rolled back", async () => {
  const photographerErr = Object.assign(new Error("Mailbox not found"), { statusCode: 404 });
  const { client, calls } = buildGraphMock({
    "POST /users/janez.smirmaul@propus.ch/events": { error: photographerErr },
    "POST /users/office@propus.ch/events": { response: { id: "office-1" } },
    "DELETE /users/office@propus.ch/events/office-1": {},
  });

  await assert.rejects(
    () => createProvisional(buildOrder(), DEPS(client)),
    (err) => err instanceof CalendarServiceError && err.code === "PHOTOGRAPHER_EVENT_CREATE_FAILED"
  );

  // Reihenfolge: photographer POST (fail) → office POST (ok) → office DELETE (rollback)
  const methods = calls.map((c) => `${c.method} ${c.path}`);
  assert.deepEqual(methods, [
    "POST /users/janez.smirmaul@propus.ch/events",
    "POST /users/office@propus.ch/events",
    "DELETE /users/office@propus.ch/events/office-1",
  ]);
});

test("createProvisional: beide Calls erfolgreich → kein Delete", async () => {
  const { client, calls } = buildGraphMock({
    "POST /users/janez.smirmaul@propus.ch/events": { response: { id: "photog-1" } },
    "POST /users/office@propus.ch/events": { response: { id: "office-1" } },
  });
  const result = await createProvisional(buildOrder(), DEPS(client));
  assert.equal(result.photographer_event_id, "photog-1");
  assert.equal(result.office_event_id, "office-1");
  assert.equal(result.calendar_sync_status, "tentative");
  assert.equal(calls.filter((c) => c.method === "DELETE").length, 0);
});

test("createProvisional: Office-POST scheitert nach erfolgreichem Photog-POST → Photog wird rolled back (bestehendes Verhalten)", async () => {
  const officeErr = new Error("graph throttled");
  const { client, calls } = buildGraphMock({
    "POST /users/janez.smirmaul@propus.ch/events": { response: { id: "photog-1" } },
    "POST /users/office@propus.ch/events": { error: officeErr },
    "DELETE /users/janez.smirmaul@propus.ch/events/photog-1": {},
  });
  await assert.rejects(
    () => createProvisional(buildOrder(), DEPS(client)),
    (err) => err instanceof CalendarServiceError && err.code === "OFFICE_EVENT_CREATE_FAILED"
  );
  const methods = calls.map((c) => `${c.method} ${c.path}`);
  assert.deepEqual(methods, [
    "POST /users/janez.smirmaul@propus.ch/events",
    "POST /users/office@propus.ch/events",
    "DELETE /users/janez.smirmaul@propus.ch/events/photog-1",
  ]);
});

// ─── upgradeToFinal: Rollback nur bei NEU angelegtem Event ────────────────────

test("upgradeToFinal: PATCH-Pfad → Photog wird bei Office-Fehler NICHT geloescht", async () => {
  // Order hat bereits einen photographerEventId (Provisorium war angelegt).
  // PATCH gelingt, Office-PATCH scheitert UND Office-POST-Fallback scheitert auch.
  // Der bereits existierende Photog-Event darf NICHT geloescht werden.
  const order = buildOrder({ photographerEventId: "existing-photog", officeEventId: "existing-office" });
  const { client, calls } = buildGraphMock({
    "PATCH /users/janez.smirmaul@propus.ch/events/existing-photog": {},
    "PATCH /users/office@propus.ch/events/existing-office": { error: new Error("patch failed") },
    "POST /users/office@propus.ch/events": { error: new Error("create failed") },
  });
  await assert.rejects(
    () => upgradeToFinal(order, DEPS(client)),
    (err) => err instanceof CalendarServiceError && err.code === "OFFICE_FINAL_EVENT_FAILED"
  );
  // KEIN DELETE auf den bestehenden Photog-Event
  const deletes = calls.filter((c) => c.method === "DELETE");
  assert.equal(deletes.length, 0, "Bestehendes Photographer-Event darf nicht geloescht werden");
});

test("upgradeToFinal: NEU angelegtes Photog-Event → wird bei Office-Fehler geloescht", async () => {
  // Kein photographerEventId → Photog wird per POST neu angelegt.
  // Office scheitert → das frisch angelegte Photog-Event muss rolled back werden.
  const order = buildOrder({ photographerEventId: null, officeEventId: null });
  const { client, calls } = buildGraphMock({
    "POST /users/janez.smirmaul@propus.ch/events": { response: { id: "new-photog" } },
    "POST /users/office@propus.ch/events": { error: new Error("create failed") },
    "DELETE /users/janez.smirmaul@propus.ch/events/new-photog": {},
  });
  await assert.rejects(
    () => upgradeToFinal(order, DEPS(client)),
    (err) => err instanceof CalendarServiceError && err.code === "OFFICE_FINAL_EVENT_FAILED"
  );
  const methods = calls.map((c) => `${c.method} ${c.path}`);
  assert.deepEqual(methods, [
    "POST /users/janez.smirmaul@propus.ch/events",
    "POST /users/office@propus.ch/events",
    "DELETE /users/janez.smirmaul@propus.ch/events/new-photog",
  ]);
});

test("upgradeToFinal: PATCH scheitert → Fallback-POST gelingt → bei Office-Fehler wird der Fallback-POST geloescht", async () => {
  const order = buildOrder({ photographerEventId: "stale-photog", officeEventId: null });
  const { client, calls } = buildGraphMock({
    "PATCH /users/janez.smirmaul@propus.ch/events/stale-photog": { error: new Error("event not found") },
    "POST /users/janez.smirmaul@propus.ch/events": { response: { id: "fallback-photog" } },
    "POST /users/office@propus.ch/events": { error: new Error("office failed") },
    "DELETE /users/janez.smirmaul@propus.ch/events/fallback-photog": {},
  });
  await assert.rejects(
    () => upgradeToFinal(order, DEPS(client)),
    (err) => err instanceof CalendarServiceError && err.code === "OFFICE_FINAL_EVENT_FAILED"
  );
  // Nur der NEUE (fallback) Event darf geloescht werden, nicht der alte stale-photog
  const deletePaths = calls.filter((c) => c.method === "DELETE").map((c) => c.path);
  assert.deepEqual(deletePaths, ["/users/janez.smirmaul@propus.ch/events/fallback-photog"]);
});

// ─── repairCalendarEvents ────────────────────────────────────────────────────

test("repairCalendarEvents: nur Photog fehlt, kein Orphan im Postfach → POST", async () => {
  const order = buildOrder({ photographerEventId: null, officeEventId: "office-existing" });
  const { client, calls } = buildGraphMock({
    "GET /users/janez.smirmaul@propus.ch/events": { response: { value: [] } },
    "POST /users/janez.smirmaul@propus.ch/events": { response: { id: "new-photog" } },
  });
  const result = await repairCalendarEvents(order, DEPS(client));
  assert.equal(result.updateFields.photographer_event_id, "new-photog");
  assert.ok(!("office_event_id" in result.updateFields), "Office bleibt unangetastet");
  assert.equal(result.orphans.photographer.length, 0);
  // Es darf KEIN Office-Call passieren
  assert.equal(calls.filter((c) => c.path.includes("office@propus.ch")).length, 0);
});

test("repairCalendarEvents: nur Photog fehlt, Orphan im Postfach → POST wird uebersprungen, Orphan gemeldet", async () => {
  const order = buildOrder({ photographerEventId: null, officeEventId: "office-existing" });
  const { client, calls } = buildGraphMock({
    "GET /users/janez.smirmaul@propus.ch/events": {
      response: { value: [{ id: "orphan-1", subject: "#4711 etc", start: { dateTime: "2026-05-07T10:00" } }] },
    },
  });
  const result = await repairCalendarEvents(order, DEPS(client));
  assert.equal(result.orphans.photographer.length, 1);
  assert.equal(result.orphans.photographer[0].id, "orphan-1");
  // KEIN POST wegen Orphan-Schutz
  assert.equal(calls.filter((c) => c.method === "POST").length, 0);
  // updateFields leer
  assert.equal(Object.keys(result.updateFields).length, 0);
});

test("repairCalendarEvents: beide vorhanden → no-op", async () => {
  const order = buildOrder({ photographerEventId: "p-1", officeEventId: "o-1" });
  const { client, calls } = buildGraphMock({});
  const result = await repairCalendarEvents(order, DEPS(client));
  assert.equal(calls.length, 0, "Kein Graph-Call wenn beide IDs gesetzt");
  assert.equal(Object.keys(result.updateFields).length, 0);
  assert.equal(result.actions.length, 2);
  assert.match(result.actions[0], /bereits vorhanden/);
});

test("repairCalendarEvents: beide fehlen, keine Orphans → beide POST", async () => {
  const order = buildOrder({ photographerEventId: null, officeEventId: null });
  const { client } = buildGraphMock({
    "GET /users/janez.smirmaul@propus.ch/events": { response: { value: [] } },
    "GET /users/office@propus.ch/events": { response: { value: [] } },
    "POST /users/janez.smirmaul@propus.ch/events": { response: { id: "new-photog" } },
    "POST /users/office@propus.ch/events": { response: { id: "new-office" } },
  });
  const result = await repairCalendarEvents(order, DEPS(client));
  assert.equal(result.updateFields.photographer_event_id, "new-photog");
  assert.equal(result.updateFields.office_event_id, "new-office");
  assert.equal(result.updateFields.calendar_sync_status, "final");
});

test("repairCalendarEvents: kein Termin → wirft NO_SCHEDULE", async () => {
  const order = buildOrder({ schedule: { date: "", time: "" }, photographerEventId: null, officeEventId: null });
  const { client } = buildGraphMock({});
  await assert.rejects(
    () => repairCalendarEvents(order, DEPS(client)),
    (err) => err instanceof CalendarServiceError && err.code === "NO_SCHEDULE"
  );
});
