"use client";

import { useMemo, useState } from "react";
import { X, Search, Package, ListPlus } from "lucide-react";
import { PACKAGE_CATALOG, getAddonCatalog, type CatalogAddon } from "@/lib/pricingCatalog";
import { formatCHF } from "@/app/(admin)/orders/[id]/_shared";

type Tab = "packages" | "addons";

export type ProductCatalogModalProps = {
  open: boolean;
  onClose: () => void;
  onPickPackage: (key: string) => void;
  onPickAddon: (item: CatalogAddon) => void;
};

export function ProductCatalogModal({ open, onClose, onPickPackage, onPickAddon }: ProductCatalogModalProps) {
  const [tab, setTab] = useState<Tab>("packages");
  const [q, setQ] = useState("");

  const addons = getAddonCatalog();

  const packagesFiltered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return PACKAGE_CATALOG;
    return PACKAGE_CATALOG.filter((p) => p.label.toLowerCase().includes(s) || p.key.toLowerCase().includes(s));
  }, [q]);

  const addonsFiltered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return addons;
    return addons.filter((a) => a.label.toLowerCase().includes(s) || a.id.toLowerCase().includes(s));
  }, [addons, q]);

  if (!open) return null;

  return (
    <div
      className="pcm-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Produktkatalog"
      onClick={onClose}
    >
      <div className="pcm" onClick={(e) => e.stopPropagation()}>
        <div className="pcm-head">
          <div>
            <div className="pcm-eyebrow">Produktkatalog</div>
            <h2>Leistungen auswählen</h2>
          </div>
          <div className="pcm-tabs">
            <button
              type="button"
              className={tab === "packages" ? "on" : ""}
              onClick={() => setTab("packages")}
            >
              <Package className="h-3.5 w-3.5" />
              Pakete
            </button>
            <button
              type="button"
              className={tab === "addons" ? "on" : ""}
              onClick={() => setTab("addons")}
            >
              <ListPlus className="h-3.5 w-3.5" />
              Zusätze
            </button>
          </div>
          <button type="button" className="pcm-close" onClick={onClose} aria-label="Schliessen">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="pcm-body">
          <div className="pcm-side">
            <div className="pcm-search">
              <Search className="h-4 w-4 shrink-0" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Suchen…"
              />
            </div>
            <p className="m-0 text-xs text-[var(--fg-3)]">
              Auswahl wird ins Formular übernommen. Speichern mit «Speichern» in der Leistungs-Ansicht.
            </p>
          </div>
          <div className="pcm-main" style={{ background: "var(--card)" }}>
            {tab === "packages" && (
              <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
                {packagesFiltered.map((p) => (
                  <li key={p.key}>
                    <button
                      type="button"
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--paper-strip)] px-3 py-2.5 text-left text-sm transition hover:border-[var(--gold-500)]"
                      onClick={() => { onPickPackage(p.key); onClose(); }}
                    >
                      <span className="font-semibold text-[var(--ink)]">{p.label}</span>
                      <span className="ml-2 text-[var(--ink-3)]">· {formatCHF(p.price)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {tab === "addons" && (
              <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
                {addonsFiltered.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--paper-strip)] px-3 py-2.5 text-left text-sm transition hover:border-[var(--gold-500)]"
                      onClick={() => { onPickAddon(a); onClose(); }}
                    >
                      <span className="font-medium text-[var(--ink)]">{a.label}</span>
                      <span className="ml-2 text-[var(--ink-3)]">· {formatCHF(a.price)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="pcm-foot text-xs text-[var(--fg-3)]">
          Auswahl setzen, dann in der Leistungs-Ansicht speichern.
        </div>
      </div>
    </div>
  );
}

export type { CatalogAddon };
