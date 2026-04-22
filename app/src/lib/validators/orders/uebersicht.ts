import { z } from "zod";
import { nonEmptyTrim, swissZip } from "../common";

export const uebersichtFormSchema = z
  .object({
    order_no: z.coerce.string().or(z.string()),
    booking_type: z.enum(["firma", "privat"]),
    company_name: z.string().nullable().optional(),
    order_reference: z.string().max(64).nullable().optional().or(z.literal("")),
    billing_street: nonEmptyTrim,
    billing_zip: swissZip,
    billing_city: nonEmptyTrim,
    contact_salutation: z.string().min(1),
    contact_first_name: z.string().default(""),
    contact_last_name: z.string().min(1, "Hauptkontakt-Name erforderlich"),
    contact_email: z.string().min(1).email(),
    contact_phone: z.string().max(40).optional().default(""),
  })
  .refine(
    (d) => d.booking_type === "privat" || (d.company_name && String(d.company_name).trim().length > 0),
    { message: "Firmenname fehlt", path: ["company_name"] },
  );

export function parseFormDataToUebersicht(fd: FormData) {
  return uebersichtFormSchema.safeParse({
    order_no: fd.get("order_no"),
    booking_type: fd.get("booking_type"),
    company_name: (fd.get("company_name") as string) || null,
    order_reference: (fd.get("order_reference") as string) || "",
    billing_street: fd.get("billing_street"),
    billing_zip: fd.get("billing_zip"),
    billing_city: fd.get("billing_city"),
    contact_salutation: fd.get("contact_salutation"),
    contact_first_name: fd.get("contact_first_name"),
    contact_last_name: fd.get("contact_last_name"),
    contact_email: fd.get("contact_email"),
    contact_phone: (fd.get("contact_phone") as string) || "",
  });
}
