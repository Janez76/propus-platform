/**
 * Matterport-Adresse (publication.address) für Touren auflösen.
 * Nutzt canonical_matterport_space_id oder matterport_space_id (Fallback).
 */

const matterport = require('./matterport');

/**
 * Liefert die Adresse aus Matterport publication.address, sonst leeren String.
 * @param {object} tour – Rohzeile oder normalisierte Tour (object_address, matterport_space_id, …)
 */
async function resolveTourAddress(tour) {
  if (!tour) return '';
  const existing = String(tour.object_address || '').trim();
  if (existing) return existing;
  const spaceId = tour.canonical_matterport_space_id || tour.matterport_space_id;
  if (!spaceId) return '';
  const { model } = await matterport.getModel(String(spaceId).trim()).catch(() => ({ model: null }));
  return String(model?.publication?.address || '').trim();
}

/**
 * Setzt tour_url und object_address aus Matterport, wenn Space-ID vorhanden.
 * @param {object} tour – mutiert die Tour
 */
async function enrichTourWithMatterportPublication(tour) {
  if (!tour) return tour;
  const spaceId = tour.canonical_matterport_space_id || tour.matterport_space_id;
  if (!spaceId) return tour;
  const { model } = await matterport.getModel(String(spaceId).trim()).catch(() => ({ model: null }));
  if (model?.publication?.url && !tour.tour_url) tour.tour_url = model.publication.url;
  if (model?.publication?.address) tour.object_address = model.publication.address;
  return tour;
}

module.exports = {
  resolveTourAddress,
  enrichTourWithMatterportPublication,
};
