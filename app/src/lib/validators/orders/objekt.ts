import { z } from "zod";
import { nonEmptyTrim, swissZip } from "../common";

const objectTypeEnum = z.enum(["single_house", "apartment", "commercial", "land", "other"]);

const contactRow = z.object({
  name: nonEmptyTrim,
  email: z.string().max(200).optional().or(z.literal("")),
  phone: z.string().max(60).optional().or(z.literal("")),
  role: z.string().max(120).optional().or(z.literal("")),
});

export const objektFormSchema = z.object({
  orderNo: z.coerce.number().int().positive(),
  street: nonEmptyTrim,
  zip: swissZip,
  city: nonEmptyTrim,
  objectType: objectTypeEnum.nullable().optional(),
  objectAreaM2: z.coerce.number().int().positive().nullable().optional(),
  objectFloors: z.coerce.number().int().min(0).nullable().optional(),
  objectRooms: z.coerce.number().int().min(0).nullable().optional(),
  objectDesc: z.string().max(2000).nullable().optional(),
  onsiteContacts: z.array(contactRow).max(20),
});

export type ObjektFormValues = z.infer<typeof objektFormSchema>;
