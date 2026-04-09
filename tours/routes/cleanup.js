/**
 * Kundenseitige Cleanup-Routes (öffentlich, kein Login erforderlich)
 *
 *  GET  /cleanup/:action?token=...
 *    Aktionen: weiterfuehren | archivieren | uebertragen | loeschen
 *    → Token validieren, Aktion ausführen, Bestätigungsseite rendern
 *    → Bei "weiterfuehren": Matterport-Sichtbarkeit automatisch auf LINK_ONLY setzen
 *
 *  POST /cleanup/reply
 *    → Erstellt ein Ticket aus der freien Kundenantwort (kein Login nötig)
 */

'use strict';

const express = require('express');
const router = express.Router();
const { pool } = require('../lib/db');
const { redeemCleanupToken, createCleanupTicketFromIncomingMail } = require('../lib/cleanup-mailer');
const { logAction } = require('../lib/actions');
const matterport = require('../lib/matterport');
const { normalizeTourRow } = require('../lib/normalize');

const VALID_ACTIONS = ['weiterfuehren', 'archivieren', 'uebertragen', 'loeschen'];

const ACTION_LABELS = {
  weiterfuehren: 'Weiterführen',
  archivieren: 'Archivieren',
  uebertragen: 'Übertragen',
  loeschen: 'Löschen',
};

const ACTION_MESSAGES = {
  weiterfuehren: 'Ihre Tour wird weitergeführt. Wir bereiten alles für Sie vor.',
  archivieren: 'Ihre Tour wird archiviert. Sie können sie jederzeit über das Kundenportal reaktivieren.',
  uebertragen: 'Wir haben Ihren Wunsch zur Übertragung registriert. Unser Team meldet sich bei Ihnen.',
  loeschen: 'Ihre Tour und der dazugehörige Matterport-Space werden dauerhaft gelöscht. Dieser Vorgang ist nicht rückgängig zu machen.',
};

// ─── GET /cleanup/:action?token=... ──────────────────────────────────────────

router.get('/:action', async (req, res) => {
  try {
    const { token } = req.query;
    const action = String(req.params.action || '').toLowerCase();

    if (!VALID_ACTIONS.includes(action)) {
      return res.status(400).render('customer/cleanup-error', {
        error: 'Ungültige Aktion.',
        basePath: res.locals.basePath || '',
      });
    }

    if (!token) {
      return res.status(400).render('customer/cleanup-error', {
        error: 'Token fehlt. Bitte verwenden Sie den Link aus der E-Mail.',
        basePath: res.locals.basePath || '',
      });
    }

    const result = await redeemCleanupToken(token, action);

    if (!result.ok) {
      return res.status(400).render('customer/cleanup-error', {
        error: result.alreadyDone
          ? `Für diese Tour wurde bereits die Aktion „${ACTION_LABELS[result.action] || result.action}" gewählt.`
          : (result.error || 'Token ungültig oder abgelaufen.'),
        basePath: res.locals.basePath || '',
      });
    }

    const tour = result.tour;
    const tourId = tour.id;
    const objectLabel = tour.object_label || tour.bezeichnung || tour.canonical_object_label || `Tour ${tourId}`;
    const spaceId = tour.canonical_matterport_space_id || tour.matterport_space_id || null;

    let visibilitySet = false;

    if (action === 'weiterfuehren' && spaceId) {
      // Matterport-Sichtbarkeit automatisch auf "Nur Link" (Standard) setzen
      const visResult = await matterport.setVisibility(spaceId, 'LINK_ONLY').catch((err) => {
        console.error('[cleanup] setVisibility failed:', tourId, err?.message);
        return { success: false };
      });
      visibilitySet = visResult.success === true;

      await pool.query(
        `UPDATE tour_manager.tours
         SET matterport_state = 'link_only',
             cleanup_action = 'weiterfuehren',
             cleanup_action_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [tourId]
      );
      await logAction(tourId, 'customer', 'token', 'CLEANUP_ACTION_WEITERFUEHREN', {
        visibilitySet,
        spaceId,
      });
    } else {
      await pool.query(
        `UPDATE tour_manager.tours
         SET cleanup_action = $1,
             cleanup_action_at = NOW(),
             updated_at = NOW()
         WHERE id = $2`,
        [action, tourId]
      );
      await logAction(tourId, 'customer', 'token', `CLEANUP_ACTION_${action.toUpperCase()}`, {});
    }

    const customerEmail = String(tour.customer_email || '').trim();
    const subjectPrefill = `Rückmeldung zu meiner Tour – ${objectLabel}`;

    res.render('customer/cleanup-action', {
      action,
      actionLabel: ACTION_LABELS[action] || action,
      actionMessage: ACTION_MESSAGES[action] || '',
      tourId,
      objectLabel,
      customerEmail,
      subjectPrefill,
      visibilitySet,
      basePath: res.locals.basePath || '',
    });
  } catch (err) {
    console.error('[cleanup] GET /:action error:', err);
    res.status(500).render('customer/cleanup-error', {
      error: 'Ein unerwarteter Fehler ist aufgetreten. Bitte kontaktieren Sie uns direkt.',
      basePath: res.locals.basePath || '',
    });
  }
});

// ─── POST /cleanup/reply — öffentlich, erstellt Ticket ────────────────────────

router.post('/reply', async (req, res) => {
  try {
    const { tourId, subject, bodyText, senderEmail } = req.body || {};

    if (!tourId) {
      return res.status(400).json({ ok: false, error: 'tourId fehlt' });
    }
    if (!bodyText || !String(bodyText).trim()) {
      return res.status(400).json({ ok: false, error: 'Nachrichtentext fehlt' });
    }

    const ticket = await createCleanupTicketFromIncomingMail({
      tourId: String(tourId),
      senderEmail: String(senderEmail || '').trim(),
      subject: String(subject || '').trim(),
      bodyText: String(bodyText || '').trim(),
    });

    res.json({ ok: true, ticketId: ticket?.id || null });
  } catch (err) {
    console.error('[cleanup] POST /reply error:', err);
    res.status(500).json({ ok: false, error: 'Ticket konnte nicht erstellt werden.' });
  }
});

module.exports = router;
