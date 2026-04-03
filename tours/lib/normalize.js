const { extractSpaceIdFromTourUrl } = require('./matterport-tour-url');

function extractMatterportId(url) {
  return extractSpaceIdFromTourUrl(url);
}

function getMatterportId(row) {
  const direct = row?.matterport_space_id && String(row.matterport_space_id).trim();
  return direct || extractMatterportId(row?.tour_url) || null;
}

function getTourObjectLabel(row) {
  return row?.object_label || row?.bezeichnung || null;
}

function getTourCustomerName(row) {
  return row?.customer_name || row?.kunde_ref || null;
}

function getTourEndDate(row) {
  return row?.term_end_date || row?.ablaufdatum || null;
}

function getExxasContractId(row) {
  return row?.exxas_abo_id || row?.exxas_subscription_id || null;
}

function normalizeTourRow(row) {
  if (!row) return row;
  return {
    ...row,
    canonical_object_label: getTourObjectLabel(row),
    canonical_customer_name: getTourCustomerName(row),
    canonical_term_end_date: getTourEndDate(row),
    canonical_matterport_space_id: getMatterportId(row),
    canonical_exxas_contract_id: getExxasContractId(row),
  };
}

module.exports = {
  extractMatterportId,
  getMatterportId,
  getTourObjectLabel,
  getTourCustomerName,
  getTourEndDate,
  getExxasContractId,
  normalizeTourRow,
};
