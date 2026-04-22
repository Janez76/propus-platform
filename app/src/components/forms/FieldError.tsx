"use client";

import { useFormContext, type FieldPath, type FieldValues } from "react-hook-form";
import { cn } from "@/lib/utils";

export function FieldError<TFieldValues extends FieldValues>({
  name,
  className,
}: {
  name: FieldPath<TFieldValues>;
  className?: string;
}) {
  const { formState: { errors } } = useFormContext<TFieldValues>();
  const err = errors[name] as { message?: string } | undefined;
  if (!err?.message) return null;
  return <p className={cn("mt-1 text-xs text-rose-400", className)} role="alert">{err.message as string}</p>;
}
