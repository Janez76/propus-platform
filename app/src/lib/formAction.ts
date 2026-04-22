import type { z, ZodSchema } from "zod";

export type FieldErrorMap = Record<string, string[] | undefined>;

export function zodToFieldErrors(err: z.ZodError): FieldErrorMap {
  const out: FieldErrorMap = {};
  for (const issue of err.issues) {
    const path = issue.path.join(".") || "_root";
    if (!out[path]) out[path] = [];
    out[path]!.push(issue.message);
  }
  return out;
}

export async function withValidation<T extends ZodSchema, R>(
  schema: T,
  data: unknown,
  handler: (val: z.infer<T>) => Promise<R>,
): Promise<{ ok: true; data: R } | { ok: false; fieldErrors: FieldErrorMap; message?: string }> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, fieldErrors: zodToFieldErrors(parsed.error) };
  }
  try {
    const result = await handler(parsed.data);
    return { ok: true, data: result };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, fieldErrors: { _root: [message] }, message };
  }
}
