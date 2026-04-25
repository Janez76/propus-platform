"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Pencil, Lock, Loader2 } from "lucide-react";
import { useState, useTransition, useCallback } from "react";
import { useOrderEditShellOptional, type OrderDirtyKey } from "./order-edit-shell-context";
import { saveOrderAllSections } from "./order-bulk-actions";
import type { BulkStep } from "./order-bulk-types";
import { isOrderReadOnly } from "./_shared";

function tabPathSupportsEdit(pathname: string | null): boolean {
  if (!pathname) return true;
  if (pathname.includes("/verlauf")) return false;
  if (pathname.includes("/kommunikation")) return false;
  if (pathname.includes("/dateien")) return false;
  return true;
}

function basePath(pathname: string, orderNo: string | number): string {
  const n = String(orderNo);
  const p = `/orders/${n}`;
  if (!pathname || pathname === p) return p;
  if (pathname.startsWith(`${p}/`)) {
    return pathname.split("?")[0].replace(/\/$/, "") || p;
  }
  return p;
}

const SECTION_LABEL: Record<"uebersicht" | "objekt" | "leistungen" | "termin", string> = {
  uebersicht: "Übersicht",
  objekt: "Objekt",
  leistungen: "Leistungen",
  termin: "Termin & Status",
};

const STEP_TO_KEY: Record<BulkStep, OrderDirtyKey> = {
  overview: "uebersicht",
  objekt: "objekt",
  leistungen: "leistungen",
  termin: "termin",
};

const STEP_LABEL: Record<BulkStep | "exception", string> = {
  overview: "Übersicht",
  objekt: "Objekt",
  leistungen: "Leistungen",
  termin: "Termin & Status",
  exception: "Speichern",
};

export function OrderReadOnlyBadge() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const shell = useOrderEditShellOptional();
  const isEditing = searchParams.get("edit") === "1";
  if (isEditing) return null;
  if (shell?.clientSection) {
    return (
      <span className="bd-lock-chip">
        <Lock className="h-3 w-3" />
        Schreibgeschützt
      </span>
    );
  }
  if (!tabPathSupportsEdit(pathname)) return null;
  return (
    <span className="bd-lock-chip">
      <Lock className="h-3 w-3" />
      Schreibgeschützt
    </span>
  );
}

type ActionProps = {
  orderNo: number | string;
  /** Aktueller Bestell-Status — wird verwendet, um den Bearbeiten-Button bei
   *  schreibgeschützten Status (cancelled / archived / done) zu deaktivieren. */
  status?: string;
};

export function OrderEditActions({ orderNo, status }: ActionProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname() || "";
  const shell = useOrderEditShellOptional();
  const isEditing = searchParams.get("edit") === "1";
  const no = String(orderNo);
  const tabBase = basePath(pathname, orderNo);
  const supportsEdit = tabPathSupportsEdit(pathname) && !shell?.clientSection;
  const orderLocked = isOrderReadOnly(status);

  const [bulkError, setBulkError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const useFormSubmit =
    !shell || !shell.hasAnyDirty() || shell.canSubmitSingleForm(pathname);

  const onCancelEdit = useCallback(() => {
    if (shell?.hasAnyDirty() && !window.confirm("Ungespeicherte Änderungen verwerfen?")) {
      return;
    }
    shell?.clearAllDirty();
    shell?.allowNextPageUnload();
    const p = new URLSearchParams(searchParams.toString());
    p.delete("edit");
    p.delete("error");
    p.delete("saved");
    const q = p.toString();
    const pathOnly = tabBase.split("?")[0];
    window.location.assign(q ? `${pathOnly}?${q}` : pathOnly);
  }, [shell, searchParams, tabBase]);

  const onBulkSave = useCallback(() => {
    if (!shell) return;
    setBulkError(null);
    start(async () => {
      const { complete, missing } = shell.getBulkReadiness();
      if (!complete) {
        const labels = missing.map((k) => SECTION_LABEL[k] ?? k).join(", ");
        setBulkError(
          `Für Sammel-Speichern fehlen Eingaben. Bitte kurz jeden offenen Tab besuchen: ${labels}.`,
        );
        return;
      }
      const input = shell.buildBulkSaveInput();
      const hasWork =
        !!input.overviewFormData ||
        input.objekt !== undefined ||
        input.leistungen !== undefined ||
        input.termin !== undefined;
      if (!hasWork) {
        setBulkError("Keine Sektionen zum Speichern.");
        return;
      }
      const attemptedCount = shell.countDirty();
      const r = await saveOrderAllSections(input);
      r.successfulSteps.forEach((step) => shell.clearDirty(STEP_TO_KEY[step]));
      if (!r.ok) {
        const total = Math.max(attemptedCount, r.successfulSteps.length);
        setBulkError(
          `${r.successfulSteps.length} von ${total} Sektionen gespeichert. Fehler bei ${STEP_LABEL[r.step]}: ${r.error}`,
        );
        return;
      }
      shell.clearAllDirty();
      const p = new URLSearchParams(searchParams.toString());
      p.set("saved", "1");
      p.delete("edit");
      p.delete("error");
      const q = p.toString();
      shell.allowNextPageUnload();
      window.location.assign(q ? `${pathname.split("?")[0]}?${q}` : `${pathname.split("?")[0]}`);
    });
  }, [shell, pathname, searchParams]);

  if (!supportsEdit) {
    return null;
  }

  if (isEditing) {
    return (
      <div className="flex max-w-md flex-col items-end gap-1.5 sm:max-w-none sm:flex-row sm:items-center">
        {bulkError && (
          <p className="text-right text-xs text-[#B4311B] sm:mr-2" role="alert">
            {bulkError}
          </p>
        )}
        <div className="flex items-center gap-2">
          <button type="button" className="bd-btn-ghost" onClick={onCancelEdit}>
            Abbrechen
          </button>
          {useFormSubmit ? (
            <button type="submit" form="order-form" className="bd-btn-primary">
              Speichern
            </button>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={onBulkSave}
              className="bd-btn-primary"
            >
              {pending ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : null}
              Sammel-Speichern
            </button>
          )}
        </div>
      </div>
    );
  }

  if (orderLocked) {
    return (
      <button
        type="button"
        className="bd-btn-outline-gold"
        disabled
        title="Bestellung ist im aktuellen Status schreibgeschützt"
      >
        <Lock className="h-4 w-4" />
        Bearbeiten
      </button>
    );
  }

  return (
    <Link href={`${tabBase}?edit=1`} scroll={false} className="bd-btn-outline-gold">
      <Pencil className="h-4 w-4" />
      Bearbeiten
    </Link>
  );
}
