"use strict";

function resolveAdminSendEmails(body) {
  return !!(body && body.sendEmails === true);
}

function resolveAdminEmailTargets(body) {
  const defaults = {
    customer: true,
    office: true,
    photographer: true,
    cc: true,
  };
  if (!body || typeof body !== "object") return defaults;
  const raw = body.sendEmailTargets;
  if (!raw || typeof raw !== "object") return defaults;
  return {
    customer: raw.customer === undefined ? defaults.customer : raw.customer === true,
    office: raw.office === undefined ? defaults.office : raw.office === true,
    photographer: raw.photographer === undefined ? defaults.photographer : raw.photographer === true,
    cc: raw.cc === undefined ? defaults.cc : raw.cc === true,
  };
}

function getEmailEffectsForAdminStatus(sideEffects, body) {
  if (!resolveAdminSendEmails(body)) return [];
  return (sideEffects || []).filter(function(effect) {
    return typeof effect === "string" && effect.startsWith("email.");
  });
}

/** Mapping: email-Side-Effect -> { templateKey, role } fuer Template-Versand. "email.cancelled_all" wird im Handler separat behandelt. */
const EFFECT_TO_TEMPLATE_AND_ROLE = {
  "email.confirmed_customer": { templateKey: "confirmed_customer", role: "customer" },
  "email.confirmed_office": { templateKey: "confirmed_office", role: "office" },
  "email.confirmed_photographer": { templateKey: "confirmed_photographer", role: "photographer" },
  "email.provisional_created": { templateKey: "provisional_created", role: "customer" },
  "email.paused_customer": { templateKey: "paused_customer", role: "customer" },
  "email.paused_office": { templateKey: "paused_office", role: "office" },
  "email.paused_photographer": { templateKey: "paused_photographer", role: "photographer" },
  "email.cancelled_all": null,
};

/**
 * Liefert die Liste der zu sendenden Template-Mails fuer den Admin-Status-Wechsel:
 * nur Effekte, deren Rolle in sendEmailTargets angehakt ist.
 * @param {string[]} sideEffects
 * @param {object} body - req.body mit sendEmails, sendEmailTargets
 * @returns {{ templateKey: string, role: string }[]}
 */
function getEmailSendListForAdminStatus(sideEffects, body) {
  if (!resolveAdminSendEmails(body)) return [];
  const targets = resolveAdminEmailTargets(body);
  const effects = getEmailEffectsForAdminStatus(sideEffects, body);
  const list = [];
  for (const effect of effects) {
    const mapping = EFFECT_TO_TEMPLATE_AND_ROLE[effect];
    if (mapping && mapping.templateKey && mapping.role && targets[mapping.role]) {
      list.push({ templateKey: mapping.templateKey, role: mapping.role });
    }
  }
  return list;
}

/** Liefert die E-Mail-Effekte zum erneuten Versand bei unverändertem Status (ohne Kalender). */
function getResendEmailEffectsForStatus(status) {
  const s = String(status || "").toLowerCase();
  if (s === "confirmed") return ["email.confirmed_customer", "email.confirmed_office", "email.confirmed_photographer"];
  if (s === "paused") return ["email.paused_customer", "email.paused_office", "email.paused_photographer"];
  if (s === "provisional") return ["email.provisional_created"];
  return [];
}

/** True wenn bei diesem Wechsel CC (Attendees) gesendet werden soll und sendEmailTargets.cc gesetzt ist. */
function shouldSendAttendeeNotifications(sideEffects, body) {
  if (!resolveAdminSendEmails(body)) return false;
  const targets = resolveAdminEmailTargets(body);
  if (!targets.cc) return false;
  const effects = (sideEffects || []).filter(e => typeof e === "string" && e.startsWith("email."));
  return effects.some(e => e === "email.confirmed_customer" || e === "email.confirmed_office" || e === "email.confirmed_photographer");
}

module.exports = {
  resolveAdminSendEmails,
  resolveAdminEmailTargets,
  getEmailEffectsForAdminStatus,
  getEmailSendListForAdminStatus,
  getResendEmailEffectsForStatus,
  shouldSendAttendeeNotifications,
};

