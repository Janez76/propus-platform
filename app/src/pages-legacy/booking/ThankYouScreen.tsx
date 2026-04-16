import { CheckCircle, Printer, ArrowLeft } from "lucide-react";
import { useBookingWizardStore } from "../../store/bookingWizardStore";
import { t, type Lang } from "../../i18n";
import { bookingPhotographerLabel } from "../../lib/bookingLabels";
import { formatDateCH } from "../../lib/utils";

export function ThankYouScreen({ lang }: { lang: Lang }) {
  const { orderNo, provisional, date, time, photographer, reset } = useBookingWizardStore();

  return (
    <div id="print-root" data-testid="booking-thank-you" className="mx-auto max-w-lg py-16 text-center">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-900/20">
        <CheckCircle className="h-10 w-10 text-emerald-500" />
      </div>
      <h2 className="text-2xl font-bold text-[var(--text-main)]">
        {provisional ? t(lang, "booking.thankyou.provisionalTitle") : t(lang, "booking.thankyou.title")}
      </h2>
      <p className="mt-2 text-[var(--text-subtle)]">
        {t(lang, "booking.thankyou.subtitle")}
      </p>

      <div className="mx-auto mt-8 max-w-sm rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-6 text-left shadow-sm dark:shadow-none">
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-[var(--text-subtle)]">{t(lang, "booking.thankyou.orderNo")}</span>
            <span className="font-bold text-[var(--text-main)]">
              {orderNo != null ? `#${orderNo}` : "—"}
            </span>
          </div>
          {date && (
            <div className="flex justify-between">
              <span className="text-[var(--text-subtle)]">{t(lang, "booking.step3.date")}</span>
              <span className="text-[var(--text-main)]">{formatDateCH(date)}</span>
            </div>
          )}
          {time && (
            <div className="flex justify-between">
              <span className="text-[var(--text-subtle)]">{t(lang, "booking.step3.time")}</span>
              <span className="text-[var(--text-main)]">{time}</span>
            </div>
          )}
          {photographer && (
            <div className="flex justify-between">
              <span className="text-[var(--text-subtle)]">{t(lang, "booking.step3.photographer")}</span>
              <span className="text-[var(--text-main)]">{bookingPhotographerLabel(lang, photographer)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-[var(--text-subtle)]">Status</span>
            <span className={provisional ? "font-medium text-amber-500" : "font-medium text-emerald-500"}>
              {provisional ? t(lang, "booking.thankyou.provisional") : t(lang, "booking.thankyou.confirmed")}
            </span>
          </div>
        </div>
      </div>

      <div className="no-print mt-8 flex justify-center gap-3">
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-lg border border-[var(--border-soft)] px-4 py-2 text-sm font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-raised)]"
        >
          <Printer className="h-4 w-4" /> {t(lang, "booking.thankyou.print")}
        </button>
        <button
          type="button"
          onClick={reset}
          className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#b08f4a]"
        >
          <ArrowLeft className="h-4 w-4" /> {t(lang, "booking.thankyou.newBooking")}
        </button>
      </div>
    </div>
  );
}

