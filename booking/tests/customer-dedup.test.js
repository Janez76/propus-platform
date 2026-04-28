const test = require("node:test");
const assert = require("node:assert/strict");

const { findMatchingCustomer } = require("../customer-dedup.js");

function makeQueryStub(customers = [], contacts = []) {
  return async function query(sql, params = []) {
    const normalizedSql = String(sql).replace(/\s+/g, " ").trim();
    const firstParam = params[0];

    if (normalizedSql.includes("FROM customer_contacts")) {
      const email = String(firstParam || "").toLowerCase().trim();
      const row = contacts.find((contact) => String(contact.email || "").toLowerCase().trim() === email);
      if (!row) return { rows: [] };
      const customer = customers.find((candidate) => Number(candidate.id) === Number(row.customer_id));
      return { rows: customer ? [customer] : [] };
    }

    if (normalizedSql.includes("lower(btrim(COALESCE(email")) {
      const email = String(firstParam || "").toLowerCase().trim();
      return {
        rows: customers.filter((customer) => String(customer.email || "").toLowerCase().trim() === email),
      };
    }

    if (normalizedSql.includes("btrim(COALESCE(company_key")) {
      const companyKey = String(firstParam || "").trim();
      return {
        rows: customers.filter((customer) => String(customer.company_key || "").trim() === companyKey),
      };
    }

    if (normalizedSql.includes("ORDER BY updated_at")) {
      return { rows: customers };
    }

    return { rows: [] };
  };
}

test("findMatchingCustomer matches an existing customer by contact email", async () => {
  const customers = [
    {
      id: 251,
      email: "",
      company: "ErfolgsMandate GmbH",
      company_key: "erfolgsmandate gmbh",
    },
  ];
  const contacts = [
    {
      id: 20,
      customer_id: 251,
      email: "devi.billeter@erfolgsmandate.ch",
    },
  ];

  const result = await findMatchingCustomer(
    { query: makeQueryStub(customers, contacts) },
    {
      email: "devi.billeter@erfolgsmandate.ch",
      company: "ErfolgsMandate GmbH",
      name: "Devi Billeter",
    }
  );

  assert.equal(result.match, "exact");
  assert.equal(result.reason, "contact_email");
  assert.equal(result.customer.id, 251);
});
