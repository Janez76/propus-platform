const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveExxasCustomerIdForOrder,
  buildExxasServiceOrderBody,
} = require("../exxas-service-order");

test("resolveExxasCustomerIdForOrder uses only exxas customer id, not contact id", async () => {
  const db = {
    getCustomerByEmail: async () => {
      throw new Error("fallback should not be used when order has customer id");
    },
  };

  const resolved = await resolveExxasCustomerIdForOrder(
    {
      exxasContactId: "contact-123",
      exxasCustomerId: "customer-456",
      billing: { email: "kunde@example.com" },
    },
    db,
  );

  assert.equal(resolved.value, "customer-456");
});

test("resolveExxasCustomerIdForOrder falls back to linked customer by billing email", async () => {
  const seenEmails = [];
  const db = {
    getCustomerByEmail: async (email) => {
      seenEmails.push(email);
      return { id: 42, exxas_customer_id: "customer-789" };
    },
  };

  const resolved = await resolveExxasCustomerIdForOrder(
    {
      exxasContactId: "contact-123",
      billing: { email: "kontakt@nextkey.ch" },
    },
    db,
  );

  assert.equal(resolved.value, "customer-789");
  assert.deepEqual(seenEmails, ["kontakt@nextkey.ch"]);
});

test("resolveExxasCustomerIdForOrder reports missing mapping instead of using contact id", async () => {
  const resolved = await resolveExxasCustomerIdForOrder(
    {
      exxasContactId: "contact-123",
      billing: { email: "kunde@example.com" },
    },
    {
      getCustomerByEmail: async () => null,
    },
  );

  assert.equal(resolved.value, "");
  assert.match(resolved.error, /Exxas-Kunden-ID/);
});

test("buildExxasServiceOrderBody includes required ref_kunde", () => {
  const body = buildExxasServiceOrderBody({
    bezeichnung: "Bahnhofstrasse 1 #100",
    exxasCustomerId: "customer-456",
    refKontakt: "contact-123",
    termin: "2026-04-30",
  });

  assert.deepEqual(body, {
    bezeichnung: "Bahnhofstrasse 1 #100",
    typ: "s",
    ref_kunde: "customer-456",
    ref_kontakt: "contact-123",
    termin: "2026-04-30",
  });
});
