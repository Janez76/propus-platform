import { t, type Lang } from "../i18n";

/** Anzeige- und Payload-Name für Fotograf; «any» immer lokalisiert. */
export function bookingPhotographerLabel(lang: Lang, photographer: { key: string; name: string } | null): string {
  if (!photographer || photographer.key === "any") return t(lang, "booking.step3.noPreference");
  return photographer.name;
}

export function bookingPhotographerForPayload(
  lang: Lang,
  photographer: { key: string; name: string } | null,
): { key: string; name: string } {
  if (!photographer) return { key: "any", name: t(lang, "booking.step3.noPreference") };
  if (photographer.key === "any") return { key: "any", name: t(lang, "booking.step3.noPreference") };
  return { key: photographer.key, name: photographer.name };
}
