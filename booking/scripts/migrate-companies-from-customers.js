const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");

const envLocalPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}
dotenv.config();

const db = require("../db");

async function run() {
  const apply = process.argv.includes("--apply");
  const result = apply
    ? await db.syncCompaniesFromCustomersAndContacts()
    : await db.bootstrapCompaniesFromCustomers({ dryRun: true });
  const mode = apply ? "APPLY" : "PREVIEW";
  if (apply) {
    console.log(
      `[company-migration] mode=${mode} bootstrapCompanies=${result.bootstrapCompanies || 0} linkedContacts=${result.linkedContacts || 0}`
    );
    return;
  }
  console.log(`[company-migration] mode=${mode} companies=${result.companies.length}`);
  for (const row of result.companies) {
    console.log(
      `- ${row.companyName} | customers=${row.customerCount} | adminCandidate=${row.adminCandidateEmail || "-"}`
    );
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[company-migration] failed:", err?.message || err);
    process.exit(1);
  });
