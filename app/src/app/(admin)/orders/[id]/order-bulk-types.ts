import type { SaveTerminResult } from "./termin/actions";

export type BulkSaveInput = {
  orderNo: number;
  /** FormData für Übersicht (optional), wie `updateOrderOverview` */
  overviewFormData?: FormData;
  /** JSON-Payloads wie die jeweiligen Client-Formulare (optional) */
  objekt?: unknown;
  leistungen?: unknown;
  termin?: unknown;
};

export type BulkStep = "overview" | "objekt" | "leistungen" | "termin";

export type BulkSaveResult =
  | { ok: true; successfulSteps: BulkStep[] }
  | {
      ok: false;
      step: "overview" | "objekt" | "leistungen" | "termin" | "exception";
      error: string;
      successfulSteps: BulkStep[];
      terminDetail?: SaveTerminResult;
    };
