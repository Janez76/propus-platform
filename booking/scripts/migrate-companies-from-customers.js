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
  const result = await db.bootstrapCompaniesFromCustomers({ dryRun: !apply });
  const mode = apply ? "APPLY" : "PREVIEW";
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
