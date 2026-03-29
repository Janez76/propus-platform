/**
 * Core-Datenbank-Helfer – delegiert an booking/db (System of Record: core.*)
 */
const db = require("../../../booking/db");

module.exports = {
  getPool: db.getPool,
  query: db.query,
  upsertCustomer: db.upsertCustomer,
  getCustomerByEmail: db.getCustomerByEmail,
  listCompanies: db.listCompanies,
  getCompanyById: db.getCompanyById,
  listCompanyMembers: db.listCompanyMembers,
  listCompanyCustomers: db.listCompanyCustomers,
};
