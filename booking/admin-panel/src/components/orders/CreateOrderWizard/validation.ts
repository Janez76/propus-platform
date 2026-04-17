import type { WizardFormState } from "./hooks/useWizardForm";

export type StepErrors = Partial<Record<keyof WizardFormState, string>>;

export function isObjectAddressComplete(state: WizardFormState): boolean {
  if (state.address.trim() && state.houseNumber.trim() && state.zipcity.trim()) return true;
  const raw = state.address.trim();
  if (!raw) return false;
  // Street + house number: letters directly followed by digits (no comma in between),
  // e.g. "Bahnhofstrasse 12", "Rue du Lac 5a". This rejects pure zip/city like
  // "Bahnhofstrasse, 8001 Zürich" where only the zip carries digits.
  const hasStreet = /[A-Za-z\u00C0-\u00FF]+\s+\d+[a-zA-Z]?\b/u.test(raw);
  const hasZipCity = /\b\d{4,5}\s+[A-Za-z\u00C0-\u00FF]/u.test(raw);
  return hasStreet && hasZipCity;
}

export function validateStep(index: number, state: WizardFormState): StepErrors {
  const errors: StepErrors = {};
  if (index === 0) {
    if (!state.customerName.trim()) errors.customerName = "Pflichtfeld";
    if (!state.customerEmail.trim()) errors.customerEmail = "Pflichtfeld";
    if (!state.billingStreet.trim()) errors.billingStreet = "Pflichtfeld";
    if (!state.billingZip.trim()) errors.billingZip = "Pflichtfeld";
    if (!state.billingCity.trim()) errors.billingCity = "Pflichtfeld";
  }
  if (index === 1) {
    if (!isObjectAddressComplete(state)) errors.address = "Bitte vollständige Adresse eingeben";
  }
  if (index === 3) {
    const requires =
      state.initialStatus === "confirmed" || state.initialStatus === "provisional";
    if (requires) {
      if (!state.date) errors.date = "Datum erforderlich";
      if (!state.time) errors.photographerKey = "Zeit und Fotograf erforderlich";
    }
  }
  return errors;
}
