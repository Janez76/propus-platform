const test = require("node:test");
const assert = require("node:assert/strict");

const { buildInsertOrderParams } = require("../db");

/**
 * Param-Index-Kommentar (1-basiert wie in $1..$29):
 *  $1 order_no, $2 customer_id, $3 status, $4 address,
 *  $5 object, $6 services, $7 photographer, $8 schedule, $9 billing, $10 pricing,
 *  $11 settings_snapshot, $12 discount, $13 key_pickup, $14 ics_uid,
 *  $15 photographer_event_id, $16 office_event_id, $17 created_at,
 *  $18 confirmation_token, $19 confirmation_token_expires_at, $20 confirmation_pending_since,
 *  $21 attendee_emails, $22 onsite_email, $23 onsite_contacts,
 *  $24 address_lat, $25 address_lon, $26 assignment_trace,
 *  $27 booking_kind, $28 deadline_at, $29 flexible_earliest_at
 *
 * Im params-Array sind die Indizes 0-basiert (params[0] = $1).
 */
const IDX = {
  status: 2,
  address: 3,
  schedule: 7,
  bookingKind: 26,
  deadlineAt: 27,
  flexibleEarliestAt: 28,
};

function baseRecord(overrides = {}) {
  return {
    orderNo: 12345,
    status: "pending",
    address: "Bahnhofstrasse 1, 8001 Zürich",
    object: { type: "wohnung" },
    services: { package: { key: "basis" } },
    photographer: { key: "any", name: "Egal" },
    schedule: { date: "2026-12-01", time: "10:00" },
    billing: { email: "kunde@example.com" },
    pricing: { total: 500 },
    onsiteContacts: [],
    ...overrides,
  };
}

// ─── Fix-Buchung: Default-Werte ─────────────────────────────────────────────

test("buildInsertOrderParams: Fix-Buchung ohne booking_kind defaultet auf 'fixed'", () => {
  const { params } = buildInsertOrderParams(baseRecord(), 99);
  assert.equal(params[IDX.bookingKind], "fixed");
  assert.equal(params[IDX.deadlineAt], null);
  assert.equal(params[IDX.flexibleEarliestAt], null);
});

test("buildInsertOrderParams: explizit bookingKind='fixed' gewinnt", () => {
  const { params } = buildInsertOrderParams(baseRecord({ bookingKind: "fixed" }), 99);
  assert.equal(params[IDX.bookingKind], "fixed");
});

test("buildInsertOrderParams: snake_case booking_kind wird auch akzeptiert", () => {
  const { params } = buildInsertOrderParams(baseRecord({ booking_kind: "flexible" }), 99);
  assert.equal(params[IDX.bookingKind], "flexible");
});

test("buildInsertOrderParams: ungueltiger bookingKind faellt auf 'fixed' zurueck (Defensive)", () => {
  const { params } = buildInsertOrderParams(baseRecord({ bookingKind: "TURBO" }), 99);
  assert.equal(params[IDX.bookingKind], "fixed");
});

// ─── Flex-Buchung: Datums-Parsing ────────────────────────────────────────────

test("buildInsertOrderParams: Flex-Buchung mit deadline_at als ISO-String → Date", () => {
  const iso = "2026-06-15T22:00:00.000Z";
  const { params } = buildInsertOrderParams(
    baseRecord({
      bookingKind: "flexible",
      status: "disposition_offen",
      schedule: {},
      deadlineAt: iso,
    }),
    99,
  );
  assert.equal(params[IDX.bookingKind], "flexible");
  assert.ok(params[IDX.deadlineAt] instanceof Date, "deadlineAt muss Date-Objekt sein");
  assert.equal(params[IDX.deadlineAt].toISOString(), iso);
});

test("buildInsertOrderParams: flexibleEarliestAt mit ISO-String → Date", () => {
  const iso = "2026-06-01T00:00:00.000Z";
  const { params } = buildInsertOrderParams(
    baseRecord({
      bookingKind: "flexible",
      deadlineAt: "2026-06-15T22:00:00.000Z",
      flexibleEarliestAt: iso,
    }),
    99,
  );
  assert.ok(params[IDX.flexibleEarliestAt] instanceof Date);
  assert.equal(params[IDX.flexibleEarliestAt].toISOString(), iso);
});

test("buildInsertOrderParams: leere Flex-Felder bleiben null statt 'Invalid Date'", () => {
  const { params } = buildInsertOrderParams(
    baseRecord({
      bookingKind: "flexible",
      deadlineAt: null,
      flexibleEarliestAt: undefined,
    }),
    99,
  );
  assert.equal(params[IDX.deadlineAt], null);
  assert.equal(params[IDX.flexibleEarliestAt], null);
});

// ─── Status-Defaults & Adresse ───────────────────────────────────────────────

test("buildInsertOrderParams: status defaultet auf 'pending'", () => {
  const { params } = buildInsertOrderParams(baseRecord({ status: undefined }), 99);
  assert.equal(params[IDX.status], "pending");
});

test("buildInsertOrderParams: status disposition_offen wird durchgereicht", () => {
  const { params } = buildInsertOrderParams(
    baseRecord({ status: "disposition_offen" }),
    99,
  );
  assert.equal(params[IDX.status], "disposition_offen");
});

// ─── SQL-Spaltennamen ────────────────────────────────────────────────────────

test("buildInsertOrderParams: SQL enthaelt Flex-Spalten in korrekter Reihenfolge", () => {
  const { sql, params } = buildInsertOrderParams(baseRecord(), 99);
  // Die letzten drei Param-Stellen muessen booking_kind, deadline_at,
  // flexible_earliest_at sein — sonst stimmt das Mapping zur SQL-Liste nicht.
  assert.match(sql, /booking_kind, deadline_at, flexible_earliest_at/);
  assert.match(sql, /\$27,\$28,\$29/);
  assert.equal(params.length, 29);
});
