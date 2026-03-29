export type ValidationError = { field: string; message: string };

const EMAIL_RE_STEP1 = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type Step1State = {
  address: string;
  parsedAddress: { street: string; houseNumber: string; zip: string; city: string } | null;
  object: {
    type: string;
    area: string;
    floors: number;
    onsiteName: string;
    onsitePhone: string;
    onsiteEmail?: string;
    onsiteCalendarInvite?: boolean;
    additionalOnsiteContacts?: Array<{ name: string; phone: string; email: string; calendarInvite: boolean }>;
  };
};

export function validateStep1(s: Step1State): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!s.address.trim()) {
    errors.push({ field: "address", message: "booking.validation.addressRequired" });
  } else if (!s.parsedAddress?.houseNumber) {
    const hasNum = /\d+[a-zA-Z]?\b/.test(s.address);
    if (!hasNum) errors.push({ field: "address", message: "booking.validation.houseNumberRequired" });
  }
  if (s.parsedAddress && (!s.parsedAddress.zip || !s.parsedAddress.city)) {
    errors.push({ field: "address", message: "booking.validation.zipCityRequired" });
  }
  if (!s.object.type) {
    errors.push({ field: "objectType", message: "booking.validation.objectTypeRequired" });
  }
  const area = Number(s.object.area);
  if (!area || area < 1) {
    errors.push({ field: "area", message: "booking.validation.areaRequired" });
  }
  if (!s.object.floors || s.object.floors < 1) {
    errors.push({ field: "floors", message: "booking.validation.floorsRequired" });
  }
  if (!s.object.onsiteName.trim()) {
    errors.push({ field: "onsiteName", message: "booking.validation.onsiteNameRequired" });
  }
  if (!s.object.onsitePhone.trim()) {
    errors.push({ field: "onsitePhone", message: "booking.validation.onsitePhoneRequired" });
  }
  if (s.object.onsiteCalendarInvite) {
    const em = String(s.object.onsiteEmail || "").trim();
    if (!em || !EMAIL_RE_STEP1.test(em)) {
      errors.push({ field: "onsiteEmail", message: "booking.validation.onsiteEmailRequiredForInvite" });
    }
  }
  const extras = Array.isArray(s.object.additionalOnsiteContacts) ? s.object.additionalOnsiteContacts : [];
  extras.forEach((row, i) => {
    if (row.calendarInvite) {
      const em = String(row.email || "").trim();
      if (!em || !EMAIL_RE_STEP1.test(em)) {
        errors.push({ field: `onsiteExtra_${i}`, message: "booking.validation.onsiteEmailRequiredForInvite" });
      }
    }
  });
  return errors;
}

export type Step2State = {
  selectedPackage: { key: string } | null;
  addons: Array<{ id: string }>;
};

export function validateStep2(s: Step2State): ValidationError[] {
  if (!s.selectedPackage && s.addons.length === 0) {
    return [{ field: "services", message: "booking.validation.serviceRequired" }];
  }
  return [];
}

export type Step3State = {
  photographer: { key: string } | null;
  date: string;
  time: string;
};

export function validateStep3(s: Step3State): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!s.photographer) errors.push({ field: "photographer", message: "booking.validation.photographerRequired" });
  if (!s.date) errors.push({ field: "date", message: "booking.validation.dateRequired" });
  if (!s.time) errors.push({ field: "time", message: "booking.validation.timeRequired" });
  return errors;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type Step4State = {
  billing: {
    company: string;
    name: string;
    email: string;
    phone: string;
    phone_mobile: string;
    street: string;
    zip: string;
    city: string;
    alt_company?: string;
    alt_street?: string;
    alt_zip?: string;
    alt_city?: string;
    alt_first_name?: string;
    alt_name?: string;
    alt_email?: string;
    alt_order_ref?: string;
    alt_notes?: string;
  };
  altBilling: boolean;
  agbAccepted: boolean;
};

export function validateStep4(s: Step4State): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!s.billing.company.trim()) errors.push({ field: "company", message: "booking.validation.companyRequired" });
  if (!s.billing.name.trim()) errors.push({ field: "name", message: "booking.validation.nameRequired" });
  if (!EMAIL_RE.test(s.billing.email)) errors.push({ field: "email", message: "booking.validation.emailInvalid" });
  if (!s.billing.phone.trim() && !s.billing.phone_mobile.trim()) {
    errors.push({ field: "phone", message: "booking.validation.phoneRequired" });
  }
  if (!s.billing.street.trim()) errors.push({ field: "street", message: "booking.validation.streetRequired" });
  if (!s.billing.zip.trim() || !s.billing.city.trim()) {
    errors.push({ field: "zipCity", message: "booking.validation.zipCityRequired" });
  }
  if (s.altBilling) {
    if (!s.billing.alt_company?.trim()) errors.push({ field: "alt_company", message: "booking.validation.companyRequired" });
    if (!s.billing.alt_street?.trim()) errors.push({ field: "alt_street", message: "booking.validation.streetRequired" });
    if (!s.billing.alt_zip?.trim() || !s.billing.alt_city?.trim()) {
      errors.push({ field: "alt_zipCity", message: "booking.validation.zipCityRequired" });
    }
    if (!s.billing.alt_name?.trim()) errors.push({ field: "alt_name", message: "booking.validation.nameRequired" });
  }
  if (!s.agbAccepted) errors.push({ field: "agb", message: "booking.validation.agbRequired" });
  return errors;
}
