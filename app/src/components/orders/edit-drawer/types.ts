import type { Order } from "../../../api/orders";

export type BillingMode = "company" | "private";

export type ContactRow = {
  salutation: string;
  department: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  phoneMobile: string;
};

export type AddressRow = {
  street: string;
  houseNumber: string;
  zip: string;
  city: string;
  addressSuffix: string;
};

export type CompanyForm = {
  name: string;
  orderRef: string;
  address: AddressRow;
};

export type PrivateForm = {
  salutation: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  phoneMobile: string;
  address: AddressRow;
};

export type AltBillingForm = {
  enabled: boolean;
  company: CompanyForm;
  notes: string;
};

export type UebersichtForm = {
  mode: BillingMode;
  company: CompanyForm;
  contacts: ContactRow[];
  altBilling: AltBillingForm;
  privateData: PrivateForm;
  customerNotes: string;
  internalNotes: string;
};

export type ObjektForm = {
  address: AddressRow;
  type: string;
  area: string;
  floors: string;
  rooms: string;
  specials: string;
  desc: string;
  onsiteName: string;
  onsitePhone: string;
  onsiteEmail: string;
  onsiteCalendarInvite: boolean;
  additionalContacts: Array<{
    name: string;
    phone: string;
    email: string;
    calendarInvite: boolean;
  }>;
};

export type TerminForm = {
  status: string;
  photographerKey: string;
  scheduleLocal: string; // ISO datetime-local string
  durationMin: string;
};

export type LeistungenAddon = {
  id: string;
  group: string;
  label: string;
  price: number;
  qty?: number;
};

export type LeistungenForm = {
  packageKey: string;
  packageLabel: string;
  packagePrice: number;
  addons: LeistungenAddon[];
  keyPickup: { enabled: boolean; address: string; notes: string };
  discountPercent: number;
};

export type DrawerState = {
  uebersicht: UebersichtForm;
  objekt: ObjektForm;
  termin: TerminForm;
  leistungen: LeistungenForm;
};

export type EmailTargets = {
  customer: boolean;
  office: boolean;
  photographer: boolean;
};

export type DirtyMap = {
  uebersicht: boolean;
  objekt: boolean;
  termin: boolean;
  leistungen: boolean;
};

const emptyAddress = (): AddressRow => ({
  street: "",
  houseNumber: "",
  zip: "",
  city: "",
  addressSuffix: "",
});

const emptyContact = (): ContactRow => ({
  salutation: "",
  department: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  phoneMobile: "",
});

function splitAddress(street?: string, zipcity?: string): AddressRow {
  const addr = emptyAddress();
  const s = String(street || "").trim();
  if (s) {
    const m = s.match(/^(.+?)\s+(\S+)$/);
    if (m) {
      addr.street = m[1].trim();
      addr.houseNumber = m[2].trim();
    } else {
      addr.street = s;
    }
  }
  const zc = String(zipcity || "").trim();
  if (zc) {
    const m = zc.match(/^(\d{4,5})\s+(.+)$/);
    if (m) {
      addr.zip = m[1];
      addr.city = m[2].trim();
    } else {
      addr.city = zc;
    }
  }
  return addr;
}

export function buildInitialState(order: Order): DrawerState {
  const b = order.billing || {};
  const hasCompany = Boolean((b.company || "").trim());
  const mode: BillingMode = hasCompany ? "company" : "private";

  const companyAddr = splitAddress(b.street, b.zipcity);
  if (b.zip) companyAddr.zip = b.zip;
  if (b.city) companyAddr.city = b.city;

  const altAddr = splitAddress(b.alt_street, b.alt_zipcity);
  if (b.alt_zip) altAddr.zip = b.alt_zip;
  if (b.alt_city) altAddr.city = b.alt_city;

  const mainContact: ContactRow = {
    salutation: b.salutation || "",
    department: "",
    firstName: b.first_name || "",
    lastName: b.name || order.customerName || "",
    email: b.email || order.customerEmail || "",
    phone: b.phone || "",
    phoneMobile: b.phone_mobile || "",
  };

  const objAddr = splitAddress(order.address || "", "");

  const objSched = order.schedule || {};
  const scheduleLocal = (() => {
    if (objSched.date && objSched.time) return `${objSched.date}T${String(objSched.time).slice(0, 5)}`;
    if (order.appointmentDate) {
      const d = new Date(order.appointmentDate);
      if (!Number.isNaN(d.getTime())) {
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }
    }
    return "";
  })();

  return {
    uebersicht: {
      mode,
      company: {
        name: b.company || "",
        orderRef: b.order_ref || "",
        address: companyAddr,
      },
      contacts: [mainContact],
      altBilling: {
        enabled: Boolean((b.alt_company || b.alt_street || b.alt_city || "").trim()),
        company: {
          name: b.alt_company || "",
          orderRef: "",
          address: altAddr,
        },
        notes: "",
      },
      privateData: {
        salutation: b.salutation || "",
        firstName: b.first_name || "",
        lastName: b.name || order.customerName || "",
        email: b.email || order.customerEmail || "",
        phone: b.phone || "",
        phoneMobile: b.phone_mobile || "",
        address: companyAddr,
      },
      customerNotes: b.notes || order.notes || "",
      internalNotes: order.internalNotes || "",
    },
    objekt: {
      address: objAddr,
      type: String(order.object?.type || ""),
      area: String(order.object?.area || ""),
      floors: String(order.object?.floors || ""),
      rooms: String(order.object?.rooms || ""),
      specials: String((order.object as Record<string, unknown>)?.specials || ""),
      desc: String(order.object?.desc || ""),
      onsiteName: String((order.object as Record<string, unknown>)?.onsiteName || b.onsiteName || ""),
      onsitePhone: String((order.object as Record<string, unknown>)?.onsitePhone || b.onsitePhone || ""),
      onsiteEmail: String((order.object as Record<string, unknown>)?.onsiteEmail || ""),
      onsiteCalendarInvite: Boolean((order.object as Record<string, unknown>)?.onsiteCalendarInvite),
      additionalContacts: (order.onsiteContacts || []).map((c) => ({
        name: c.name || "",
        phone: c.phone || "",
        email: c.email || "",
        calendarInvite: Boolean(c.calendarInvite),
      })),
    },
    termin: {
      status: order.status || "pending",
      photographerKey: order.photographer?.key || "",
      scheduleLocal,
      durationMin: String(Math.max(1, Number(order.schedule?.durationMin || 60))),
    },
    leistungen: buildLeistungenForm(order),
  };
}

function buildLeistungenForm(order: Order): LeistungenForm {
  const services = order.services || {};
  const pkg = services.package || {};
  const addonsRaw = Array.isArray(services.addons) ? services.addons : [];
  const addons: LeistungenAddon[] = addonsRaw.map((a) => ({
    id: String((a as { id?: string }).id || ""),
    group: String((a as { group?: string }).group || ""),
    label: String((a as { label?: string }).label || ""),
    price: Number((a as { price?: number }).price) || 0,
    qty: (a as { qty?: number }).qty != null ? Number((a as { qty?: number }).qty) : undefined,
  }));
  const keyPickupAddon = addons.find((a) => a.group === "keypickup" || a.id.startsWith("keypickup"));
  const orderKeyPickup = order.keyPickup || null;
  const pricing = order.pricing || {};
  const persistedSubtotal = Number(pricing.subtotal) || 0;
  const persistedDiscount = Number(pricing.discount) || 0;
  const discountPercent =
    persistedSubtotal > 0 && persistedDiscount > 0
      ? Math.round((persistedDiscount / persistedSubtotal) * 10000) / 100
      : 0;
  return {
    packageKey: String(pkg.key || ""),
    packageLabel: String(pkg.label || ""),
    packagePrice: Number(pkg.price) || 0,
    addons,
    keyPickup: {
      enabled: Boolean(keyPickupAddon || (orderKeyPickup && (orderKeyPickup.address || orderKeyPickup.notes))),
      address: String(orderKeyPickup?.address || ""),
      notes: String(orderKeyPickup?.notes || ""),
    },
    discountPercent,
  };
}

export const NEW_CONTACT = emptyContact;
export const NEW_ADDRESS = emptyAddress;
