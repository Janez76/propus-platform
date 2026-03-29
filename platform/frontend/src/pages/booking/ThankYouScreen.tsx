import { useState } from "react";
import { CheckCircle, Printer, ArrowLeft, UserPlus, Check, Eye, EyeOff } from "lucide-react";
import { useBookingWizardStore } from "../../store/bookingWizardStore";
import { apiRequest } from "../../api/client";
import { t, type Lang } from "../../i18n";
import { bookingPhotographerLabel } from "../../lib/bookingLabels";
import { formatDateCH } from "../../lib/utils";

function AccountCard({ lang, email, name }: { lang: Lang; email: string; name: string }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || created) {
    if (created) {
      return (
        <div className="mx-auto mt-6 max-w-sm rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-left dark:border-emerald-800 dark:bg-emerald-950/30">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
            <Check className="h-5 w-5" />
            <span className="text-sm font-medium">{t(lang, "booking.account.created")}</span>
          </div>
        </div>
      );
    }
    return null;
  }

  async function handleCreate() {
    setError("");
    if (password.length < 8) {
      setError(t(lang, "booking.account.errorMinLength"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t(lang, "booking.account.errorMismatch"));
      return;
    }
    setBusy(true);
    try {
      await apiRequest("/api/customer/register", "POST", undefined, { email, password, name });
      try {
        const res = await apiRequest<{ token?: string }>("/api/customer/login", "POST", undefined, { email, password });
        if (res?.token) {
          try { localStorage.setItem("customer_token", res.token); } catch {}
        }
      } catch {}
      setCreated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, "booking.account.errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-6 max-w-sm rounded-xl border border-zinc-200 bg-white p-5 text-left dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mb-3 flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
        <UserPlus className="h-5 w-5 text-[#C5A059]" />
        <h3 className="text-sm font-semibold">{t(lang, "booking.account.title")}</h3>
      </div>
      <p className="mb-4 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
        {t(lang, "booking.account.description")}
      </p>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
            {t(lang, "booking.account.password")} <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t(lang, "booking.account.passwordPlaceholder")}
              autoComplete="new-password"
              disabled={busy}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 pr-10 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[#C5A059] focus:outline-none focus:ring-1 focus:ring-[#C5A059] disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              tabIndex={-1}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
            {t(lang, "booking.account.confirmPassword")} <span className="text-red-500">*</span>
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={t(lang, "booking.account.confirmPlaceholder")}
            autoComplete="new-password"
            disabled={busy}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[#C5A059] focus:outline-none focus:ring-1 focus:ring-[#C5A059] disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => setDismissed(true)}
          disabled={busy}
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          {t(lang, "booking.account.skip")}
        </button>
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={busy}
          className="flex-1 rounded-lg bg-[#C5A059] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#b08f4a] disabled:opacity-50"
        >
          {busy ? t(lang, "booking.account.creating") : t(lang, "booking.account.create")}
        </button>
      </div>
    </div>
  );
}

export function ThankYouScreen({ lang }: { lang: Lang }) {
  const { orderNo, provisional, date, time, photographer, billing, reset } = useBookingWizardStore();

  const email = billing.email?.trim() || "";
  const hasValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const displayName = [billing.first_name, billing.name].filter(Boolean).join(" ") || billing.company || email;

  return (
    <div data-testid="booking-thank-you" className="mx-auto max-w-lg py-16 text-center">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-900/20">
        <CheckCircle className="h-10 w-10 text-emerald-500" />
      </div>
      <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        {provisional ? t(lang, "booking.thankyou.provisionalTitle") : t(lang, "booking.thankyou.title")}
      </h2>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        {t(lang, "booking.thankyou.subtitle")}
      </p>

      <div className="mx-auto mt-8 max-w-sm rounded-xl border border-zinc-200 bg-white p-6 text-left dark:border-zinc-700 dark:bg-zinc-900">
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-500">{t(lang, "booking.thankyou.orderNo")}</span>
            <span className="font-bold text-zinc-900 dark:text-zinc-100">
              {orderNo != null ? `#${orderNo}` : "—"}
            </span>
          </div>
          {date && (
            <div className="flex justify-between">
              <span className="text-zinc-500">{t(lang, "booking.step3.date")}</span>
              <span className="text-zinc-900 dark:text-zinc-100">{formatDateCH(date)}</span>
            </div>
          )}
          {time && (
            <div className="flex justify-between">
              <span className="text-zinc-500">{t(lang, "booking.step3.time")}</span>
              <span className="text-zinc-900 dark:text-zinc-100">{time}</span>
            </div>
          )}
          {photographer && (
            <div className="flex justify-between">
              <span className="text-zinc-500">{t(lang, "booking.step3.photographer")}</span>
              <span className="text-zinc-900 dark:text-zinc-100">{bookingPhotographerLabel(lang, photographer)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-zinc-500">Status</span>
            <span className={provisional ? "font-medium text-amber-500" : "font-medium text-emerald-500"}>
              {provisional ? t(lang, "booking.thankyou.provisional") : t(lang, "booking.thankyou.confirmed")}
            </span>
          </div>
        </div>
      </div>

      {hasValidEmail && <AccountCard lang={lang} email={email} name={displayName} />}

      <div className="mt-8 flex justify-center gap-3">
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
        >
          <Printer className="h-4 w-4" /> {t(lang, "booking.thankyou.print")}
        </button>
        <button
          type="button"
          onClick={reset}
          className="flex items-center gap-2 rounded-lg bg-[#C5A059] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#b08f4a]"
        >
          <ArrowLeft className="h-4 w-4" /> {t(lang, "booking.thankyou.newBooking")}
        </button>
      </div>
    </div>
  );
}
