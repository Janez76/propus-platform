"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useOrderEditShellOptional } from "../order-edit-shell-context";
import { useForm, FormProvider, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarClock, Mail, User } from "lucide-react";
import { FieldError } from "@/components/forms/FieldError";
import { Section, STATUS_LABEL } from "../_shared";
import { saveOrderTermin, type SaveTerminResult } from "./actions";
import { terminFormSchema, type TerminFormValues } from "@/lib/validators/orders/termin";
import type { PhotographerOption } from "@/lib/repos/orders/termin";

const TIME_OPTIONS = (() => {
  const o: string[] = [];
  for (let h = 6; h < 22; h++) {
    for (const m of [0, 15, 30, 45] as const) {
      o.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return o;
})();

const STATUS_ORDER = [
  "pending",
  "provisional",
  "confirmed",
  "completed",
  "done",
  "paused",
  "cancelled",
  "archived",
] as const;

type Props = {
  order: {
    order_no: number;
    status: string;
    schedule_date: string | null;
    schedule_time: string | null;
    duration_min: number | null;
    photographer_key: string | null;
  };
  photographers: PhotographerOption[];
};

function buildDefaults(p: Props["order"]): TerminFormValues {
  const t = p.schedule_time ? String(p.schedule_time).slice(0, 5) : "10:00";
  const d = p.schedule_date || new Date().toISOString().slice(0, 10);
  return {
    orderNo: p.order_no,
    scheduleDate: d,
    scheduleTime: TIME_OPTIONS.includes(t) ? t : "10:00",
    durationMin: p.duration_min && p.duration_min >= 15 ? p.duration_min : 60,
    status: p.status in STATUS_LABEL ? (p.status as TerminFormValues["status"]) : "pending",
    photographerKey: p.photographer_key,
    overrideConflicts: false,
    sendEmails: false,
    sendEmailTargets: {
      customer: true,
      office: true,
      photographer: true,
      cc: true,
    },
  };
}

export function TerminForm({ order, photographers }: Props) {
  const defaults = buildDefaults(order);
  const form = useForm<TerminFormValues>({
    resolver: zodResolver(terminFormSchema) as import("react-hook-form").Resolver<TerminFormValues>,
    defaultValues: defaults,
  });
  const shell = useOrderEditShellOptional();
  const isDirty = form.formState.isDirty;
  useEffect(() => {
    shell?.markDirty("termin", isDirty);
  }, [isDirty, shell]);
  const [pending, start] = useTransition();
  const [formError, setFormError] = useState("");

  const onSubmit = useCallback(
    (v: TerminFormValues) => {
      if (v.status === "cancelled" && !window.confirm("Bestellung wirklich stornieren?")) {
        return;
      }
      setFormError("");
      start(async () => {
        const r: SaveTerminResult = await saveOrderTermin({
          ...v,
          sendEmailTargets: v.sendEmailTargets ?? {
            customer: true,
            office: true,
            photographer: true,
            cc: true,
          },
        });
        if (r && "ok" in r && r.ok === false) {
          setFormError(
            "conflicts" in r && r.conflicts?.length
              ? `${r.error} (Konflikt mit #${r.conflicts.map((c) => c.orderNo).join(", #")})`
              : r.error,
          );
        }
      });
    },
    [],
  );

  return (
    <FormProvider {...form}>
      <form id="order-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {formError && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-200" role="alert">
            {formError}
            {/Konflikt/.test(formError) && (
              <label className="mt-2 flex items-center gap-2 text-white/80">
                <input type="checkbox" {...form.register("overrideConflicts")} className="rounded" />
                Trotzdem speichern
              </label>
            )}
          </div>
        )}

        <Section title="Termin" icon={<CalendarClock className="h-4 w-4" />}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div>
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/50">Datum *</span>
              <input
                type="date"
                className="w-full rounded-md border border-white/10 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-100 scheme-dark"
                {...form.register("scheduleDate")}
              />
              <FieldError<TerminFormValues> name="scheduleDate" />
            </div>
            <div>
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/50">Uhrzeit (15 min) *</span>
              <select
                className="w-full rounded-md border border-white/10 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-100 scheme-dark"
                {...form.register("scheduleTime")}
              >
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <FieldError<TerminFormValues> name="scheduleTime" />
            </div>
            <div>
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/50">Dauer (min) *</span>
              <input
                type="number"
                min={15}
                step={15}
                className="w-full rounded-md border border-white/10 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-100 scheme-dark"
                {...form.register("durationMin", { valueAsNumber: true })}
              />
              <FieldError<TerminFormValues> name="durationMin" />
            </div>
            <div>
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/50">Status *</span>
              <select
                className="w-full rounded-md border border-white/10 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-100 scheme-dark"
                {...form.register("status")}
              >
                {STATUS_ORDER.map((k) => {
                  const st = STATUS_LABEL[k] || { label: k, className: "bg-white/10" };
                  return (
                    <option key={k} value={k}>
                      {st.label}
                    </option>
                  );
                })}
              </select>
              <FieldError<TerminFormValues> name="status" />
            </div>
          </div>
        </Section>

        <Section title="Mitarbeiter" icon={<User className="h-4 w-4" />}>
          <div className="max-w-xl">
            <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/50">Fotograf / Mitarbeiter</span>
            <select
              className="w-full rounded-md border border-white/10 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-100 scheme-dark"
              {...form.register("photographerKey", {
                setValueAs: (v: string) => (v === "" ? null : v),
              })}
            >
              <option value="">— Keiner —</option>
              {photographers.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name || p.key}
                  {p.email ? `  (${p.email})` : ""}
                </option>
              ))}
            </select>
            <FieldError<TerminFormValues> name="photographerKey" />
          </div>
        </Section>

        <EmailSection />
        <p className="text-xs text-white/40">
          {pending && "Wird gespeichert…"}
        </p>
      </form>
    </FormProvider>
  );
}

function EmailSection() {
  const { register, watch } = useFormContext<TerminFormValues>();
  const send = watch("sendEmails");
  return (
    <Section title="E-Mail bei Statuswechsel" icon={<Mail className="h-4 w-4" />}>
      <p className="mb-3 text-xs text-white/50">
        Optional: Nach Speichern Benachrichtigungs-Mails an ausgewählte Rollen (nur wenn der Status tatsächlich wechselt
        und passende Mails in der Verkettung hinterlegt sind).
      </p>
      <label className="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" className="rounded" {...register("sendEmails")} />
        Mails senden, wenn vorgesehen
      </label>
      {send && (
        <div className="grid grid-cols-2 gap-2 text-sm md:max-w-md">
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register("sendEmailTargets.customer")} /> Kunde
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register("sendEmailTargets.office")} /> Büro
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register("sendEmailTargets.photographer")} /> Mitarbeiter
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register("sendEmailTargets.cc")} /> CC-Teilnehmer
          </label>
        </div>
      )}
    </Section>
  );
}
