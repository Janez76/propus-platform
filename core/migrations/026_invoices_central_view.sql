-- Migration 026: Zentrales Rechnungsmodul — View + Performance-Indexes
-- Erstellt: 2026-04-04

-- Combined view für AdminInvoicesPage (/admin/invoices)
CREATE OR REPLACE VIEW tour_manager.invoices_central_v AS
  SELECT
    'renewal'                                              AS invoice_source,
    ri.id,
    ri.invoice_number,
    ri.invoice_status,
    ri.invoice_kind,
    ri.amount_chf,
    ri.due_at,
    ri.paid_at,
    ri.tour_id,
    COALESCE(t.object_label, t.bezeichnung)               AS tour_object_label,
    COALESCE(t.customer_name, t.kunde_ref)                AS tour_customer_name,
    ri.created_at
  FROM tour_manager.renewal_invoices ri
  LEFT JOIN tour_manager.tours t ON t.id = ri.tour_id
UNION ALL
  SELECT
    'exxas'                                               AS invoice_source,
    ei.id,
    ei.nummer                                             AS invoice_number,
    CASE WHEN ei.exxas_status = 'bz' THEN 'paid' ELSE ei.exxas_status END AS invoice_status,
    NULL                                                  AS invoice_kind,
    ei.preis_brutto                                       AS amount_chf,
    ei.zahlungstermin::TIMESTAMPTZ                        AS due_at,
    CASE WHEN ei.exxas_status = 'bz' THEN ei.zahlungstermin::TIMESTAMPTZ ELSE NULL END AS paid_at,
    ei.tour_id,
    COALESCE(t.object_label, t.bezeichnung)               AS tour_object_label,
    COALESCE(t.customer_name, t.kunde_ref)                AS tour_customer_name,
    ei.created_at
  FROM tour_manager.exxas_invoices ei
  LEFT JOIN tour_manager.tours t ON t.id = ei.tour_id;

-- Performance-Indexes für zentrale Rechnungsabfragen
CREATE INDEX IF NOT EXISTS idx_renewal_invoices_status
  ON tour_manager.renewal_invoices (invoice_status);

CREATE INDEX IF NOT EXISTS idx_renewal_invoices_created_at
  ON tour_manager.renewal_invoices (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_exxas_invoices_exxas_status
  ON tour_manager.exxas_invoices (exxas_status);

CREATE INDEX IF NOT EXISTS idx_exxas_invoices_zahlungstermin
  ON tour_manager.exxas_invoices (zahlungstermin DESC NULLS LAST);
