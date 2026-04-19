import { describe, it, expect, beforeEach } from "vitest";
import {
  useBookingWizardStore,
  makeEmptyStructuredAddress,
  makeEmptyBillingContact,
  makeEmptyBillingStructured,
  formatStructuredAddress,
} from "../store/bookingWizardStore";

describe("formatStructuredAddress", () => {
  it("concatenates with comma when complete", () => {
    expect(formatStructuredAddress({
      street: "Albisstrasse",
      houseNumber: "158",
      zip: "8038",
      city: "Zürich",
      canton: "",
      countryCode: "CH",
      lat: null,
      lng: null,
      formatted: "",
    })).toBe("Albisstrasse 158, 8038 Zürich");
  });
  it("omits house number when missing", () => {
    expect(formatStructuredAddress({
      ...makeEmptyStructuredAddress(),
      street: "Alte Mühle",
      zip: "8852",
      city: "Hinwil",
    })).toBe("Alte Mühle, 8852 Hinwil");
  });
  it("omits zip/city when missing", () => {
    expect(formatStructuredAddress({
      ...makeEmptyStructuredAddress(),
      street: "Albisstrasse",
      houseNumber: "158",
    })).toBe("Albisstrasse 158");
  });
  it("returns empty string for empty address", () => {
    expect(formatStructuredAddress(makeEmptyStructuredAddress())).toBe("");
  });
});

describe("factory functions produce independent instances", () => {
  it("makeEmptyStructuredAddress is not shared", () => {
    const a = makeEmptyStructuredAddress();
    const b = makeEmptyStructuredAddress();
    a.street = "X";
    expect(b.street).toBe("");
  });
  it("makeEmptyBillingStructured creates deep-cloned contacts", () => {
    const a = makeEmptyBillingStructured();
    const b = makeEmptyBillingStructured();
    a.contacts[0].email = "x@y.z";
    expect(b.contacts[0].email).toBe("");
    expect(a.contacts).toHaveLength(1);
  });
});

describe("useBookingWizardStore — structured setters", () => {
  beforeEach(() => {
    useBookingWizardStore.setState({
      object: {
        type: "",
        area: "",
        floors: 1,
        rooms: "",
        specials: "",
        desc: "",
        onsiteName: "",
        onsitePhone: "",
        onsiteEmail: "",
        onsiteCalendarInvite: false,
        additionalOnsiteContacts: [],
        address: makeEmptyStructuredAddress(),
      },
      billing: {
        salutation: "", first_name: "", company: "", company_email: "", company_phone: "",
        name: "", email: "", phone: "", phone_mobile: "",
        street: "", zip: "", city: "", zipcity: "",
        order_ref: "", notes: "",
        alt_company: "", alt_company_email: "", alt_company_phone: "",
        alt_street: "", alt_zip: "", alt_city: "", alt_zipcity: "",
        alt_salutation: "", alt_first_name: "", alt_name: "",
        alt_email: "", alt_phone: "", alt_phone_mobile: "",
        alt_order_ref: "", alt_notes: "",
        structured: makeEmptyBillingStructured(),
      },
    });
  });

  it("setObjectAddress patches and recomputes formatted", () => {
    useBookingWizardStore.getState().setObjectAddress({
      street: "Albisstrasse",
      houseNumber: "158",
      zip: "8038",
      city: "Zürich",
    });
    const addr = useBookingWizardStore.getState().object.address;
    expect(addr.street).toBe("Albisstrasse");
    expect(addr.houseNumber).toBe("158");
    expect(addr.formatted).toBe("Albisstrasse 158, 8038 Zürich");
  });

  it("setBillingCompany updates company without touching contacts", () => {
    useBookingWizardStore.getState().setBillingCompany({ name: "CSL Immobilien AG", uid: "CHE-123.456.789" });
    const s = useBookingWizardStore.getState().billing.structured;
    expect(s.company.name).toBe("CSL Immobilien AG");
    expect(s.company.uid).toBe("CHE-123.456.789");
    expect(s.contacts).toHaveLength(1);
    expect(s.contacts[0].email).toBe("");
  });

  it("setBillingCompanyAddress recomputes formatted", () => {
    useBookingWizardStore.getState().setBillingCompanyAddress({
      street: "Hardturmstrasse",
      houseNumber: "11",
      zip: "8005",
      city: "Zürich",
    });
    const addr = useBookingWizardStore.getState().billing.structured.company.address;
    expect(addr.formatted).toBe("Hardturmstrasse 11, 8005 Zürich");
  });

  it("setBillingMode switches without clearing slots", () => {
    useBookingWizardStore.getState().setBillingCompany({ name: "Firma AG" });
    useBookingWizardStore.getState().setBillingPrivate({ firstName: "Max", lastName: "Muster" });
    useBookingWizardStore.getState().setBillingMode("private");
    const s = useBookingWizardStore.getState().billing.structured;
    expect(s.mode).toBe("private");
    expect(s.company.name).toBe("Firma AG"); // noch da
    expect(s.private.firstName).toBe("Max");
  });

  it("setBillingContact only updates at given index", () => {
    const { addBillingContact, setBillingContact } = useBookingWizardStore.getState();
    addBillingContact();
    setBillingContact(0, { lastName: "Smirmaul", email: "js@propus.ch" });
    setBillingContact(1, { lastName: "Mueller", email: "mm@propus.ch" });
    const c = useBookingWizardStore.getState().billing.structured.contacts;
    expect(c).toHaveLength(2);
    expect(c[0].lastName).toBe("Smirmaul");
    expect(c[1].lastName).toBe("Mueller");
  });

  it("removeBillingContact keeps at least one", () => {
    const { removeBillingContact, addBillingContact } = useBookingWizardStore.getState();
    addBillingContact(); // now 2
    removeBillingContact(1);
    expect(useBookingWizardStore.getState().billing.structured.contacts).toHaveLength(1);
    removeBillingContact(0);
    // darf nicht unter 1 fallen
    expect(useBookingWizardStore.getState().billing.structured.contacts).toHaveLength(1);
  });

  it("addBillingContact pushes empty contact", () => {
    const { addBillingContact } = useBookingWizardStore.getState();
    addBillingContact();
    addBillingContact();
    const c = useBookingWizardStore.getState().billing.structured.contacts;
    expect(c).toHaveLength(3);
    expect(c[1]).toEqual(makeEmptyBillingContact());
    expect(c[2]).toEqual(makeEmptyBillingContact());
  });

  it("setBillingAlt toggles enabled flag", () => {
    const { setBillingAlt } = useBookingWizardStore.getState();
    setBillingAlt({ enabled: true });
    expect(useBookingWizardStore.getState().billing.structured.altBilling.enabled).toBe(true);
    setBillingAlt({ mode: "private" });
    expect(useBookingWizardStore.getState().billing.structured.altBilling.mode).toBe("private");
    expect(useBookingWizardStore.getState().billing.structured.altBilling.enabled).toBe(true);
  });

  it("setBillingAltCompanyAddress recomputes formatted", () => {
    useBookingWizardStore.getState().setBillingAltCompanyAddress({
      street: "Seestrasse",
      houseNumber: "1",
      zip: "8002",
      city: "Zürich",
    });
    const addr = useBookingWizardStore.getState().billing.structured.altBilling.company.address;
    expect(addr.formatted).toBe("Seestrasse 1, 8002 Zürich");
  });
});
