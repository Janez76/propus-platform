import { z } from "zod";

export const nonEmptyTrim = z.string().trim().min(1, "Pflichtfeld");

/** Schweizer PLZ: 4 Ziffern */
export const swissZip = z
  .string()
  .trim()
  .regex(/^\d{4}$/, "PLZ: 4 Ziffern");

/** YYYY-MM-DD */
export const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum");

/** 15-Min-Raster: HH:00, HH:15, HH:30, HH:45 */
export const timeHHmm = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):(00|15|30|45)$/, "Uhrzeit im 15-Min-Raster (HH:MM)");

export const positiveInt = z.coerce.number().int().positive();

export const nonNegativeInt = z.coerce.number().int().min(0);

/** Optionales CHF-Preis-Feld (Dezimaltrennzeichen . oder ,) */
export const priceCHF = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === "number" ? v : parseFloat(String(v).replace(",", "."))));

/** Telefon: +41, 0041, 0xx */
export const phoneCH = z
  .string()
  .trim()
  .refine(
    (s) => {
      if (s.length === 0) return true;
      return (
        /^(\+41|0041|0)\s*[\d\s().\-/]{6,20}$/u.test(s) ||
        /^0[1-9]\d{1,2}[\s.\-]?\d{3}[\s.\-]?\d{2}[\s.\-]?\d{2}$/u.test(s)
      );
    },
    { message: "Ungültige Telefonnummer (CH)" },
  );

export const orderStatusEnum = z.enum([
  "pending",
  "provisional",
  "confirmed",
  "completed",
  "done",
  "paused",
  "cancelled",
  "archived",
]);

export type OrderStatus = z.infer<typeof orderStatusEnum>;
