"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  Printer, Copy, MoreHorizontal,
  FileDown, Ban, Archive, Loader2,
} from "lucide-react";
import { duplicateOrder } from "./duplicate-actions";
import { changeOrderStatus } from "./status-change-actions";
import { isOrderReadOnly } from "./_shared";

type Props = {
  orderNo: number;
  status: string;
};

export function OrderTopActions({ orderNo, status }: Props) {
  const [pending, start] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const readOnly = isOrderReadOnly(status);

  // Klick außerhalb schließt das Mehr-Menü
  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  function onPrint() {
    window.open(`/print/orders/${orderNo}`, "_blank", "noopener,noreferrer");
  }

  function onDuplicate() {
    if (!window.confirm(
      `Bestellung #${orderNo} duplizieren? Eine neue Bestellung mit denselben Kunden- und Leistungsdaten wird im Status „Offen" angelegt (ohne Termin).`,
    )) return;
    start(async () => {
      const r = await duplicateOrder(orderNo);
      // Bei Erfolg redirected die Server-Action — kein lokaler Code nötig.
      if (r && "ok" in r && r.ok === false) {
        alert(`Duplizieren fehlgeschlagen: ${r.error}`);
      }
    });
  }

  function onCancel() {
    if (!window.confirm(`Bestellung #${orderNo} wirklich stornieren?`)) return;
    setMenuOpen(false);
    start(async () => {
      const r = await changeOrderStatus(orderNo, "cancelled");
      if (r.ok) {
        window.location.reload();
      } else {
        alert(`Stornieren fehlgeschlagen: ${r.error}`);
      }
    });
  }

  function onArchive() {
    if (!window.confirm(`Bestellung #${orderNo} archivieren?`)) return;
    setMenuOpen(false);
    start(async () => {
      const r = await changeOrderStatus(orderNo, "archived");
      if (r.ok) {
        window.location.reload();
      } else {
        alert(`Archivieren fehlgeschlagen: ${r.error}`);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        className="bd-icon-btn"
        title="Drucken"
        aria-label="Drucken"
        onClick={onPrint}
        disabled={pending}
      >
        <Printer />
      </button>
      <button
        type="button"
        className="bd-icon-btn"
        title="Duplizieren"
        aria-label="Duplizieren"
        onClick={onDuplicate}
        disabled={pending}
      >
        {pending ? <Loader2 className="animate-spin" /> : <Copy />}
      </button>
      <div ref={menuRef} className="relative">
        <button
          type="button"
          className="bd-icon-btn"
          title="Mehr Aktionen"
          aria-label="Mehr Aktionen"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          disabled={pending}
        >
          <MoreHorizontal />
        </button>
        {menuOpen && (
          <div role="menu" className="bd-popover" aria-label="Weitere Aktionen">
            <a
              role="menuitem"
              href={`/print/orders/${orderNo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bd-popover-item"
              onClick={() => setMenuOpen(false)}
            >
              <FileDown />
              <span>PDF / Druckansicht öffnen</span>
            </a>
            <button
              type="button"
              role="menuitem"
              className="bd-popover-item"
              onClick={onCancel}
              disabled={pending || readOnly}
              title={readOnly ? "Status ist bereits schreibgeschützt" : undefined}
            >
              <Ban />
              <span>Stornieren</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="bd-popover-item"
              onClick={onArchive}
              disabled={pending || status === "archived"}
              title={status === "archived" ? "Bereits archiviert" : undefined}
            >
              <Archive />
              <span>Archivieren</span>
            </button>
          </div>
        )}
      </div>
    </>
  );
}
