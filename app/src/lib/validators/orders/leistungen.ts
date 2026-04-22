import { z } from "zod";

export const leistungenFormSchema = z.object({
  orderNo: z.coerce.number().int().positive(),
  packageKey: z.string().nullable().optional().transform((v) => (v == null || v === "" ? null : v)),
  addons: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      group: z.string().optional(),
      qty: z.coerce.number().int().min(1).default(1),
      price: z.coerce.number().min(0),
      priceOverride: z.coerce.number().min(0).nullable().optional(),
    }),
  ),
  durationMinOverride: z.coerce.number().int().min(15).nullable().optional(),
});

export type LeistungenFormValues = z.infer<typeof leistungenFormSchema>;
