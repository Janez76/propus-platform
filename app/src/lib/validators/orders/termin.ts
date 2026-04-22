import { z } from "zod";
import { isoDate, timeHHmm, orderStatusEnum } from "../common";

export const terminFormSchema = z.object({
  orderNo: z.coerce.number().int().positive(),
  scheduleDate: isoDate,
  scheduleTime: timeHHmm,
  durationMin: z.coerce.number().int().min(15, "Mindestens 15 Minuten"),
  status: orderStatusEnum,
  photographerKey: z.string().nullable().optional().transform((v) => (v === "" || v == null ? null : v)),
  overrideConflicts: z.boolean().optional().default(false),
  sendEmails: z.boolean().optional().default(false),
  sendEmailTargets: z
    .object({
      customer: z.boolean(),
      office: z.boolean(),
      photographer: z.boolean(),
      cc: z.boolean(),
    })
    .optional(),
});

export type TerminFormValues = z.infer<typeof terminFormSchema>;

/** Für JSON-Body aus Client (handleSubmit) */
export function parseTerminFormJson(data: unknown) {
  return terminFormSchema.safeParse(data);
}
