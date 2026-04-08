/**
 * Builds en.json / fr.json / it.json for booking admin-panel from app i18n
 * plus a few keys that exist only in booking admin-panel de.json.
 */
const fs = require("fs");
const path = require("path");

const adminI18n = path.join(__dirname, "../src/i18n");
const appI18n = path.join(__dirname, "../../../app/src/i18n");

const bookDe = JSON.parse(fs.readFileSync(path.join(adminI18n, "de.json"), "utf8"));
const appEn = JSON.parse(fs.readFileSync(path.join(appI18n, "en.json"), "utf8"));
const appFr = JSON.parse(fs.readFileSync(path.join(appI18n, "fr.json"), "utf8"));
const appIt = JSON.parse(fs.readFileSync(path.join(appI18n, "it.json"), "utf8"));

const extra = {
  en: {
    "nav.pinoTest": "Pino test",
    "employeeModal.label.accessManagement": "Access & permissions",
    "employeeModal.hint.accessManagement":
      "Password, login and roles are managed centrally in Internal administration.",
    "employeeModal.badge.isAdmin": "Admin",
    "employeeModal.badge.isStaff": "Staff",
  },
  fr: {
    "nav.pinoTest": "Test Pino",
    "employeeModal.label.accessManagement": "Accès et autorisations",
    "employeeModal.hint.accessManagement":
      "Mot de passe, connexion et rôles sont gérés centralement dans l'administration interne.",
    "employeeModal.badge.isAdmin": "Admin",
    "employeeModal.badge.isStaff": "Collaborateur",
  },
  it: {
    "nav.pinoTest": "Test Pino",
    "employeeModal.label.accessManagement": "Accesso e autorizzazioni",
    "employeeModal.hint.accessManagement":
      "Password, accesso e ruoli sono gestiti centralmente nell'amministrazione interna.",
    "employeeModal.badge.isAdmin": "Admin",
    "employeeModal.badge.isStaff": "Collaboratore",
  },
};

function build(appMap, extras) {
  const out = {};
  for (const k of Object.keys(bookDe).sort()) {
    if (Object.prototype.hasOwnProperty.call(extras, k)) {
      out[k] = extras[k];
    } else if (Object.prototype.hasOwnProperty.call(appMap, k)) {
      out[k] = appMap[k];
    } else {
      throw new Error(`Missing translation source for key: ${k}`);
    }
  }
  return out;
}

const en = build(appEn, extra.en);
const fr = build(appFr, extra.fr);
const it = build(appIt, extra.it);

fs.writeFileSync(path.join(adminI18n, "en.json"), JSON.stringify(en, null, 2) + "\n");
fs.writeFileSync(path.join(adminI18n, "fr.json"), JSON.stringify(fr, null, 2) + "\n");
fs.writeFileSync(path.join(adminI18n, "it.json"), JSON.stringify(it, null, 2) + "\n");

console.log("Wrote en.json, fr.json, it.json with", Object.keys(en).length, "keys each.");
