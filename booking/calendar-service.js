/**
 * calendar-service.js
 * Dedizierte Kalender-Service-Schicht fuer Microsoft Graph API Operationen.
 *
 * Wird ausschliesslich von order-status-workflow.js (ueber workflow-effects.js) aufgerufen.
 * Alle Methoden werfen bei Fehlern – keine stillen Swallows.
 *
 * Idempotenz-Garantien:
 *  - createProvisional: prueft photographerEventId vor Anlage
 *  - upgradeToFinal: PATCH auf bestehende ID; Fallback: neu anlegen
 *  - deleteBlock: ignoriert fehlende IDs und 404-Fehler; andere Fehler in Retry-Queue
 */

"use strict";

const {
  buildCalendarContent,
  buildCalendarSubject,
  renderStoredCalendarTemplate,
  orderOnsiteContactRows,
} = require("./templates/calendar");

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function buildMapLink(addressText) {
  const q = encodeURIComponent(addressText || "");
  return q ? "https://www.google.com/maps/search/?api=1&query=" + q : "";
}

function addMinutesLocal(date, time, durationMin) {
  const [h, m] = time.split(":").map(Number);
  const totalMin = h * 60 + m + durationMin;
  const endH = Math.floor(totalMin / 60) % 24;
  const endM = totalMin % 60;
  const overflowDays = Math.floor(totalMin / (24 * 60));
  let endDate = date;
  if (overflowDays > 0) {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() + overflowDays);
    endDate = d.toISOString().slice(0, 10);
  }
  return {
    date: endDate,
    time: String(endH).padStart(2, "0") + ":" + String(endM).padStart(2, "0"),
  };
}

function buildEventPayload({ subject, date, time, durationMin, addressText, descriptionHtml, showAs }) {
  const end = addMinutesLocal(date, time, durationMin);
  const mapLink = buildMapLink(addressText);
  return {
    subject,
    body: { contentType: "HTML", content: (descriptionHtml || "").replace(/\n/g, "<br/>") },
    start: { dateTime: date + "T" + time + ":00", timeZone: process.env.TIMEZONE || "Europe/Zurich" },
    end:   { dateTime: end.date + "T" + end.time + ":00", timeZone: process.env.TIMEZONE || "Europe/Zurich" },
    location: { displayName: addressText || "—", locationUri: mapLink || undefined },
    showAs: showAs || "busy",
    responseRequested: false,
  };
}

/**
 * @param {object} order
 * @param {string} photogPhone
 * @param {object} [opts]
 * @param {string} [opts.eventType] - "provisional" | "confirmed"
 * @param {string} [opts.expiresAt] - ISO-Datum fuer Ablaufdatum
 */
function buildOrderEventDataSync(order, photogPhone, opts) {
  const objectInfo = [
    "Adresse: " + (order.address || "—"),
    "Objektart: " + (order.object && order.object.type || "—"),
    "Flaeche: " + (order.object && order.object.area || "—") + " m2",
  ].join("\n");

  const servicesText = [
    (order.services && order.services.package && order.services.package.label) || "",
    ...((order.services && order.services.addons) || []).map(function(a) { return a.label || ""; }),
  ].filter(Boolean).join("\n");

  const zipCity = (order.billing && order.billing.zipcity) || "";
  const addressText = order.address || "";
  const placeForTitle = (function() {
    const raw = String(addressText).trim();
    if (!raw) return zipCity || "Ort";
    const parts = raw.split(",").map(function(p) { return p.trim(); }).filter(Boolean);
    const last = parts[parts.length - 1] || raw;
    return /\b\d{4,5}\b/.test(last) ? last : raw;
  })();

  const eventType = opts && opts.eventType;
  const expiresAt = opts && opts.expiresAt;
  const calSubject = buildCalendarSubject({ title: placeForTitle, orderNo: order.orderNo, eventType, expiresAt });
  const calDescription = buildCalendarContent({
    objectInfo,
    address: addressText,
    object: order.object || {},
    servicesText,
    billing: order.billing || {},
    keyPickup: order.keyPickup || null,
    photographer: {
      name: (order.photographer && order.photographer.name) || "",
      phone: photogPhone || "—",
      email: (order.photographer && order.photographer.email) || "",
    },
    orderNo: order.orderNo,
    onsiteContacts: orderOnsiteContactRows(order),
  });

  return { calSubject, calDescription, addressText };
}

async function buildOrderEventData(order, photogPhone, opts, pool) {
  const eventType = opts && opts.eventType;
  const expiresAt = opts && opts.expiresAt;
  if (pool) {
    try {
      const rendered = await renderStoredCalendarTemplate(pool, "photographer_event", order, {
        photogPhone: photogPhone || "—",
        eventType,
        expiresAt,
      });
      return {
        calSubject: rendered.subject,
        calDescription: rendered.body,
        addressText: rendered.addressText || order.address || "",
      };
    } catch (err) {
      console.warn("[calendar-service] template render failed, fallback", err && err.message);
    }
  }
  return buildOrderEventDataSync(order, photogPhone, opts);
}

// ─── CalendarService ──────────────────────────────────────────────────────────

class CalendarServiceError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "CalendarServiceError";
    this.code = code || "CALENDAR_ERROR";
  }
}

/**
 * Erstellt provisorische (tentative) Kalender-Events fuer Fotograf + Buero.
 * Idempotent: ueberspringt wenn photographerEventId/officeEventId bereits gesetzt.
 *
 * Wirft CalendarServiceError wenn beide Events nicht erstellt werden konnten.
 *
 * @param {object} order
 * @param {object} deps - { graphClient, OFFICE_EMAIL, PHOTOG_PHONES, db }
 * @returns {object} updateFields - felder fuer DB-Update (photographer_event_id, office_event_id, calendar_sync_status)
 */
async function createProvisional(order, deps) {
  const { graphClient, OFFICE_EMAIL, PHOTOG_PHONES, db } = deps;
  const pool = db && db.getPool ? db.getPool() : null;

  if (!graphClient) {
    throw new CalendarServiceError("graphClient nicht verfuegbar", "NO_GRAPH_CLIENT");
  }

  const photographerEmail = (order.photographer && order.photographer.email) || "";
  if (!photographerEmail) {
    throw new CalendarServiceError("Kein Fotografen-Email fuer Provisorium", "NO_PHOTOGRAPHER_EMAIL");
  }

  const date = (order.schedule && order.schedule.date) || "";
  const time = (order.schedule && order.schedule.time) || "";
  const durationMin = (order.schedule && order.schedule.durationMin) || 60;

  if (!date || !time) {
    throw new CalendarServiceError("Kein Termin fuer Provisorium", "NO_SCHEDULE");
  }

  const photogPhone = PHOTOG_PHONES[(order.photographer && order.photographer.key) || ""] || "—";
  const { calSubject, calDescription, addressText } = await buildOrderEventData(order, photogPhone, { eventType: "provisional", expiresAt: order.provisional_expires_at || order.provisionalExpiresAt || null }, pool);

  const updateFields = {};
  let photographerOk = false;
  let officeOk = false;

  // Fotograf-Event (tentative)
  if (order.photographerEventId) {
    console.log("[calendar-service] photographerEventId bereits vorhanden, ueberspringe createProvisional", { orderNo: order.orderNo });
    photographerOk = true;
  } else {
    try {
      const payload = buildEventPayload({ subject: calSubject, date, time, durationMin, addressText, descriptionHtml: calDescription, showAs: "tentative" });
      const created = await graphClient.api("/users/" + photographerEmail + "/events").post(payload);
      updateFields.photographer_event_id = created.id || null;
      console.log("[calendar-service] provisional photographer event created", { orderNo: order.orderNo, eventId: created.id });
      photographerOk = true;
    } catch (err) {
      console.error("[calendar-service] provisional photographer event create failed", { orderNo: order.orderNo, error: err && err.message });
    }
  }

  // Buero-Event (tentative)
  if (order.officeEventId) {
    console.log("[calendar-service] officeEventId bereits vorhanden, ueberspringe createProvisional office", { orderNo: order.orderNo });
    officeOk = true;
  } else {
    try {
      const payload = buildEventPayload({ subject: calSubject, date, time, durationMin, addressText, descriptionHtml: calDescription, showAs: "tentative" });
      const created = await graphClient.api("/users/" + OFFICE_EMAIL + "/events").post(payload);
      updateFields.office_event_id = created.id || null;
      console.log("[calendar-service] provisional office event created", { orderNo: order.orderNo, eventId: created.id });
      officeOk = true;
    } catch (err) {
      console.error("[calendar-service] provisional office event create failed", { orderNo: order.orderNo, error: err && err.message });
      // Rollback: Fotograf-Event loeschen falls angelegt
      if (updateFields.photographer_event_id && photographerEmail) {
        try {
          await graphClient.api("/users/" + photographerEmail + "/events/" + updateFields.photographer_event_id).delete();
          console.log("[calendar-service] Rollback: photographer event deleted after office failure", { orderNo: order.orderNo });
        } catch (rollbackErr) {
          console.error("[calendar-service] Rollback fehlgeschlagen:", rollbackErr && rollbackErr.message);
        }
      }
      throw new CalendarServiceError(
        "Provisorisches Buero-Event konnte nicht erstellt werden: " + (err && err.message),
        "OFFICE_EVENT_CREATE_FAILED"
      );
    }
  }

  if (!photographerOk) {
    throw new CalendarServiceError(
      "Provisorisches Fotografen-Event konnte nicht erstellt werden",
      "PHOTOGRAPHER_EVENT_CREATE_FAILED"
    );
  }

  updateFields.calendar_sync_status = "tentative";

  // DB-Update
  if (db && db.updateOrderFields && Object.keys(updateFields).some(k => k !== "calendar_sync_status")) {
    try {
      await db.updateOrderFields(Number(order.orderNo), updateFields);
    } catch (err) {
      console.error("[calendar-service] DB update failed", err && err.message);
    }
  }

  return updateFields;
}

/**
 * Wandelt provisorische Events in finale (busy) Events um.
 * Fallback: neuen Event anlegen wenn PATCH fehlschlaegt.
 *
 * Wirft CalendarServiceError wenn das finale Event nicht erstellt werden konnte.
 *
 * @param {object} order
 * @param {object} deps - { graphClient, OFFICE_EMAIL, PHOTOG_PHONES, db }
 * @returns {object} updateFields
 */
async function upgradeToFinal(order, deps) {
  const { graphClient, OFFICE_EMAIL, PHOTOG_PHONES, db } = deps;
  const pool = db && db.getPool ? db.getPool() : null;

  if (!graphClient) {
    throw new CalendarServiceError("graphClient nicht verfuegbar", "NO_GRAPH_CLIENT");
  }

  const photographerEmail = (order.photographer && order.photographer.email) || "";
  const date = (order.schedule && order.schedule.date) || "";
  const time = (order.schedule && order.schedule.time) || "";
  const durationMin = (order.schedule && order.schedule.durationMin) || 60;

  const photogPhone = PHOTOG_PHONES[(order.photographer && order.photographer.key) || ""] || "—";
  const { calSubject, calDescription, addressText } = await buildOrderEventData(order, photogPhone, { eventType: "confirmed" }, pool);

  const updateFields = {};
  let photographerOk = false;
  let officeOk = false;

  // Fotograf-Event upgraden
  if (photographerEmail) {
    if (order.photographerEventId) {
      try {
        await graphClient.api("/users/" + photographerEmail + "/events/" + order.photographerEventId).patch({ showAs: "busy" });
        console.log("[calendar-service] photographer event upgraded to final", { orderNo: order.orderNo });
        updateFields.photographer_event_id = order.photographerEventId;
        photographerOk = true;
      } catch (err) {
        console.warn("[calendar-service] photographer event PATCH failed, creating new", err && err.message);
        if (date && time) {
          try {
            const payload = buildEventPayload({ subject: calSubject, date, time, durationMin, addressText, descriptionHtml: calDescription, showAs: "busy" });
            const created = await graphClient.api("/users/" + photographerEmail + "/events").post(payload);
            updateFields.photographer_event_id = created.id || null;
            photographerOk = true;
            console.log("[calendar-service] photographer final event created (fallback)", { orderNo: order.orderNo });
          } catch (err2) {
            console.error("[calendar-service] photographer final event create fallback failed", err2 && err2.message);
          }
        }
      }
    } else if (date && time) {
      try {
        const payload = buildEventPayload({ subject: calSubject, date, time, durationMin, addressText, descriptionHtml: calDescription, showAs: "busy" });
        const created = await graphClient.api("/users/" + photographerEmail + "/events").post(payload);
        updateFields.photographer_event_id = created.id || null;
        photographerOk = true;
        console.log("[calendar-service] photographer final event created (no tentative existed)", { orderNo: order.orderNo });
      } catch (err) {
        console.error("[calendar-service] photographer final event create failed", err && err.message);
      }
    }
  }

  if (!photographerOk) {
    throw new CalendarServiceError(
      "Finales Fotografen-Event konnte nicht erstellt werden",
      "PHOTOGRAPHER_FINAL_EVENT_FAILED"
    );
  }

  // Buero-Event upgraden
  if (order.officeEventId) {
    try {
      await graphClient.api("/users/" + OFFICE_EMAIL + "/events/" + order.officeEventId).patch({ showAs: "busy" });
      console.log("[calendar-service] office event upgraded to final", { orderNo: order.orderNo });
      updateFields.office_event_id = order.officeEventId;
      officeOk = true;
    } catch (err) {
      console.warn("[calendar-service] office event PATCH failed, creating new", err && err.message);
      if (date && time) {
        try {
          const payload = buildEventPayload({ subject: calSubject, date, time, durationMin, addressText, descriptionHtml: calDescription, showAs: "busy" });
          const created = await graphClient.api("/users/" + OFFICE_EMAIL + "/events").post(payload);
          updateFields.office_event_id = created.id || null;
          officeOk = true;
          console.log("[calendar-service] office final event created (fallback)", { orderNo: order.orderNo });
        } catch (err2) {
          console.error("[calendar-service] office event create fallback failed", err2 && err2.message);
        }
      }
    }
  } else if (date && time) {
    try {
      const payload = buildEventPayload({ subject: calSubject, date, time, durationMin, addressText, descriptionHtml: calDescription, showAs: "busy" });
      const created = await graphClient.api("/users/" + OFFICE_EMAIL + "/events").post(payload);
      updateFields.office_event_id = created.id || null;
      officeOk = true;
      console.log("[calendar-service] office final event created (no tentative existed)", { orderNo: order.orderNo });
    } catch (err) {
      console.error("[calendar-service] office final event create failed", err && err.message);
    }
  }

  if (!officeOk) {
    throw new CalendarServiceError(
      "Finales Buero-Event konnte nicht erstellt/upgraded werden",
      "OFFICE_FINAL_EVENT_FAILED"
    );
  }

  updateFields.calendar_sync_status = "final";

  if (db && db.updateOrderFields) {
    try {
      await db.updateOrderFields(Number(order.orderNo), updateFields);
    } catch (err) {
      console.error("[calendar-service] DB update failed", err && err.message);
    }
  }

  return updateFields;
}

/**
 * Erstellt direkt finale (busy) Kalender-Events (kein Provisorium vorher).
 *
 * Wirft CalendarServiceError wenn das Event nicht erstellt werden konnte.
 *
 * @param {object} order
 * @param {object} deps - { graphClient, OFFICE_EMAIL, PHOTOG_PHONES, db }
 * @returns {object} updateFields
 */
async function createFinal(order, deps) {
  const { graphClient, OFFICE_EMAIL, PHOTOG_PHONES, db } = deps;
  const pool = db && db.getPool ? db.getPool() : null;

  if (!graphClient) {
    throw new CalendarServiceError("graphClient nicht verfuegbar", "NO_GRAPH_CLIENT");
  }

  const photographerEmail = (order.photographer && order.photographer.email) || "";
  const date = (order.schedule && order.schedule.date) || "";
  const time = (order.schedule && order.schedule.time) || "";
  const durationMin = (order.schedule && order.schedule.durationMin) || 60;

  if (!date || !time) {
    throw new CalendarServiceError("Kein Termin fuer finalen Block", "NO_SCHEDULE");
  }

  const photogPhone = PHOTOG_PHONES[(order.photographer && order.photographer.key) || ""] || "—";
  const { calSubject, calDescription, addressText } = await buildOrderEventData(order, photogPhone, { eventType: "confirmed" }, pool);

  const updateFields = {};
  let photographerOk = false;
  let officeOk = false;

  if (photographerEmail && !order.photographerEventId) {
    try {
      const payload = buildEventPayload({ subject: calSubject, date, time, durationMin, addressText, descriptionHtml: calDescription, showAs: "busy" });
      const created = await graphClient.api("/users/" + photographerEmail + "/events").post(payload);
      updateFields.photographer_event_id = created.id || null;
      photographerOk = true;
      console.log("[calendar-service] final photographer event created", { orderNo: order.orderNo });
    } catch (err) {
      console.error("[calendar-service] final photographer event create failed", err && err.message);
    }
  } else if (order.photographerEventId) {
    photographerOk = true; // bereits vorhanden
  }

  if (!photographerOk) {
    throw new CalendarServiceError(
      "Finales Fotografen-Event konnte nicht erstellt werden",
      "PHOTOGRAPHER_FINAL_EVENT_FAILED"
    );
  }

  if (!order.officeEventId) {
    try {
      const payload = buildEventPayload({ subject: calSubject, date, time, durationMin, addressText, descriptionHtml: calDescription, showAs: "busy" });
      const created = await graphClient.api("/users/" + OFFICE_EMAIL + "/events").post(payload);
      updateFields.office_event_id = created.id || null;
      officeOk = true;
      console.log("[calendar-service] final office event created", { orderNo: order.orderNo });
    } catch (err) {
      console.error("[calendar-service] final office event create failed", err && err.message);
    }
  } else {
    officeOk = true; // bereits vorhanden
  }

  if (!officeOk) {
    // Rollback Fotograf-Event
    if (updateFields.photographer_event_id && photographerEmail) {
      try {
        await graphClient.api("/users/" + photographerEmail + "/events/" + updateFields.photographer_event_id).delete();
        console.log("[calendar-service] Rollback: photographer final event deleted", { orderNo: order.orderNo });
      } catch (rollbackErr) {
        console.error("[calendar-service] Rollback fehlgeschlagen:", rollbackErr && rollbackErr.message);
      }
    }
    throw new CalendarServiceError(
      "Finales Buero-Event konnte nicht erstellt werden",
      "OFFICE_FINAL_EVENT_FAILED"
    );
  }

  updateFields.calendar_sync_status = "final";

  if (db && db.updateOrderFields) {
    try {
      await db.updateOrderFields(Number(order.orderNo), updateFields);
    } catch (err) {
      console.error("[calendar-service] DB update failed", err && err.message);
    }
  }

  return updateFields;
}

/**
 * Loescht Fotograf + Buero Kalender-Events.
 * Idempotent: fehlende IDs und 404-Fehler werden ignoriert.
 * Bei anderen Fehlern: in Retry-Queue einreihen (non-fatal fuer Status-Transition).
 *
 * @param {object} order
 * @param {object} deps - { graphClient, OFFICE_EMAIL, db }
 * @returns {object} updateFields
 */
async function deleteBlock(order, deps) {
  const { graphClient, OFFICE_EMAIL, db } = deps;

  if (!graphClient) {
    console.warn("[calendar-service] graphClient nicht verfuegbar – deleteBlock uebersprungen");
    return {};
  }

  const photographerEmail = (order.photographer && order.photographer.email) || "";
  const orderNo = Number(order.orderNo);
  const updateFields = { calendar_sync_status: "deleted" };
  const pool = db && db.getPool ? db.getPool() : null;

  if (order.photographerEventId && photographerEmail) {
    try {
      await graphClient.api("/users/" + photographerEmail + "/events/" + order.photographerEventId).delete();
      updateFields.photographer_event_id = null;
      console.log("[calendar-service] photographer event deleted", { orderNo, eventId: order.photographerEventId });
    } catch (err) {
      if (err && err.statusCode === 404) {
        updateFields.photographer_event_id = null;
        console.log("[calendar-service] photographer event already gone (404)", { orderNo });
      } else {
        console.error("[calendar-service] photographer event delete failed, queueing retry", { orderNo, eventId: order.photographerEventId, error: err && err.message });
        if (pool) {
          try {
            await pool.query(
              `INSERT INTO calendar_delete_queue (order_no, event_type, event_id, user_email, last_error)
               VALUES ($1, $2, $3, $4, $5)`,
              [orderNo, "photographer", order.photographerEventId, photographerEmail, String(err && err.message || err).slice(0, 500)]
            );
            updateFields.calendar_sync_status = "error";
          } catch (qErr) {
            console.error("[calendar-service] failed to enqueue photographer event retry", { orderNo, error: qErr && qErr.message });
          }
        }
      }
    }
  }

  if (order.officeEventId && OFFICE_EMAIL) {
    try {
      await graphClient.api("/users/" + OFFICE_EMAIL + "/events/" + order.officeEventId).delete();
      updateFields.office_event_id = null;
      console.log("[calendar-service] office event deleted", { orderNo, eventId: order.officeEventId });
    } catch (err) {
      if (err && err.statusCode === 404) {
        updateFields.office_event_id = null;
        console.log("[calendar-service] office event already gone (404)", { orderNo });
      } else {
        console.error("[calendar-service] office event delete failed, queueing retry", { orderNo, eventId: order.officeEventId, error: err && err.message });
        if (pool) {
          try {
            await pool.query(
              `INSERT INTO calendar_delete_queue (order_no, event_type, event_id, user_email, last_error)
               VALUES ($1, $2, $3, $4, $5)`,
              [orderNo, "office", order.officeEventId, OFFICE_EMAIL, String(err && err.message || err).slice(0, 500)]
            );
            updateFields.calendar_sync_status = "error";
          } catch (qErr) {
            console.error("[calendar-service] failed to enqueue office event retry", { orderNo, error: qErr && qErr.message });
          }
        }
      }
    }
  }

  if (db && db.updateOrderFields) {
    try {
      await db.updateOrderFields(orderNo, updateFields);
    } catch (err) {
      console.error("[calendar-service] DB update failed", err && err.message);
    }
  }

  return updateFields;
}

/**
 * deleteCalendarEvents – Zentrale, idempotente Cleanup-Routine.
 *
 * Loescht Fotograf + Buero Kalender-Events robust bei Partial Failures.
 * Wird fuer ALLE Delete-Pfade verwendet:
 *   - Zielstatus pending (Cleanup)
 *   - Zielstatus paused
 *   - Zielstatus cancelled
 *   - expiry_job: provisional -> pending
 *
 * Idempotenz-Garantien:
 *   - Fehlende Event-IDs (null/undefined): jeweiligen Teil ueberspringen
 *   - Graph-404: als "bereits geloescht" werten (kein Fehler)
 *   - Graph-Fehler != 404: Retry-Queue-Eintrag, Teilresultat
 *   - Wirft NIEMALS – non-fatal
 *
 * @param {object} order
 * @param {object} deps - { graphClient, OFFICE_EMAIL, db }
 * @returns {Promise<{result: "ok"|"partial"|"skipped"|"error", photographerDeleted: boolean, officeDeleted: boolean, details: object}>}
 */
async function deleteCalendarEvents(order, deps) {
  const orderNo = Number(order.orderNo);
  const hasPhotographerEvent = !!(order.photographerEventId);
  const hasOfficeEvent = !!(order.officeEventId);

  if (!hasPhotographerEvent && !hasOfficeEvent) {
    console.log("[calendar-service] deleteCalendarEvents: keine Event-IDs vorhanden, uebersprungen", { orderNo });
    return { result: "skipped", photographerDeleted: false, officeDeleted: false, details: { reason: "no_event_ids" } };
  }

  const updateFields = await deleteBlock(order, deps);

  // Ergebnis aus updateFields ableiten
  const photographerDeleted = updateFields.photographer_event_id === null || !order.photographerEventId;
  const officeDeleted = updateFields.office_event_id === null || !order.officeEventId;
  const syncStatus = updateFields.calendar_sync_status || "deleted";

  let result;
  if (syncStatus === "error") {
    result = (hasPhotographerEvent && hasOfficeEvent)
      ? (photographerDeleted || officeDeleted ? "partial" : "error")
      : "error";
  } else if (photographerDeleted && officeDeleted) {
    result = "ok";
  } else if (photographerDeleted || officeDeleted) {
    result = "partial";
  } else {
    result = "error";
  }

  console.log("[calendar-service] deleteCalendarEvents abgeschlossen", {
    orderNo,
    result,
    photographerDeleted,
    officeDeleted,
  });

  return {
    result,
    photographerDeleted,
    officeDeleted,
    details: { syncStatus, updateFields },
  };
}

module.exports = {
  CalendarServiceError,
  createProvisional,
  upgradeToFinal,
  createFinal,
  deleteBlock,
  deleteCalendarEvents,
};
