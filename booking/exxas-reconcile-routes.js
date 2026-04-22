/**
 * EXXAS Reconciliation routes (preview + confirm).
 *
 * Ziel:
 * - Vorschlaege fuer Kunden/Kontakte erzeugen (ohne Schreibzugriff)
 * - Nach manueller Bestaetigung selektiv in lokale DB uebernehmen
 */
const { findMatchingCustomer } = require("./customer-dedup");
function registerExxasReconcileRoutes(app, db, requireAdmin, ensureCustomerInRequestCompany) {
  function asString(value) {
    return value == null ? "" : String(value).trim();
  }

  /** Gleiche Normalisierung wie bei INSERT/UPDATE, damit Lookup und Unique-Index zusammenpassen. */
  function normalizeCustomerEmail(value) {
    return asString(value)
      .toLowerCase()
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .trim();
  }

  function normalizeText(value) {
    return asString(value)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizePhone(value) {
    return asString(value).replace(/[^0-9+]/g, "");
  }

  function splitZipCity(value) {
    const raw = asString(value);
    if (!raw) return { zip: "", city: "" };
    const m = raw.match(/^([0-9]{4,6})\s+(.+)$/);
    if (!m) return { zip: "", city: raw };
    return { zip: asString(m[1]), city: asString(m[2]) };
  }

  function isBlank(value) {
    return asString(value) === "";
  }

  function isSyntheticCompanyEmail(value) {
    return asString(value).toLowerCase().endsWith("@company.local");
  }

  function isExxasCompanyCustomer(exxasCustomer) {
    const raw = exxasCustomer?.raw && typeof exxasCustomer.raw === "object" ? exxasCustomer.raw : {};
    return Boolean(
      asString(raw?.firmenname) ||
      asString(raw?.suchname) ||
      normalizeText(exxasCustomer?.salutation) === "firma"
    );
  }

  function getExxasCustomerNameValue(exxasCustomer) {
    return isExxasCompanyCustomer(exxasCustomer) ? "" : asString(exxasCustomer?.name);
  }

  function shouldTreatContactRoleAsPlaceholder(value) {
    const normalized = normalizeText(value);
    return normalized === "" || normalized === "kontakt" || normalized === "kunde";
  }

  function resolveIncomingValue(existingValue, incomingValue, overwriteFields, fieldKey) {
    const existing = asString(existingValue);
    const incoming = asString(incomingValue);
    if (overwriteFields && overwriteFields.has(fieldKey) && !isBlank(incoming)) {
      return incoming;
    }
    return !isBlank(existing) ? existing : incoming;
  }

  function parseExxasArray(payload) {
    if (Array.isArray(payload?.message)) return payload.message;
    if (Array.isArray(payload)) return payload;
    return [];
  }

  function findApiV2Base(endpoint) {
    const raw = asString(endpoint);
    if (!raw) return "";
    try {
      const url = new URL(raw);
      const path = url.pathname || "";
      const idx = path.toLowerCase().indexOf("/api/v2");
      if (idx >= 0) {
        return `${url.origin}${path.slice(0, idx + "/api/v2".length)}`;
      }
      // Falls nur Root angegeben ist.
      return `${url.origin}/api/v2`;
    } catch {
      return "";
    }
  }

  function buildExxasHeaders(credentials) {
    const apiKey = asString(credentials?.apiKey);
    const appPassword = asString(credentials?.appPassword);
    const authMode = credentials?.authMode === "bearer" ? "bearer" : "apiKey";
    const authorization = authMode === "bearer" ? `Bearer ${apiKey}` : `ApiKey ${apiKey}`;
    const headers = {
      Authorization: authorization,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (appPassword) headers["X-App-Password"] = appPassword;
    return headers;
  }

  async function fetchExxasJson(url, headers) {
    const res = await fetch(url, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`EXXAS HTTP ${res.status}: ${text.slice(0, 220)}`);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("EXXAS Antwort ist kein gueltiges JSON");
    }
  }

  async function loadExxasData(credentials) {
    const apiKey = asString(credentials?.apiKey);
    const endpoint = asString(credentials?.endpoint);
    if (!apiKey) throw new Error("EXXAS API Key fehlt");
    if (!endpoint) throw new Error("EXXAS Endpoint fehlt");
    const apiBase = findApiV2Base(endpoint);
    if (!apiBase) throw new Error("EXXAS Endpoint ungueltig");
    const headers = buildExxasHeaders(credentials);
    const [customersPayload, contactsPayload] = await Promise.all([
      fetchExxasJson(`${apiBase}/customers`, headers),
      fetchExxasJson(`${apiBase}/contacts`, headers),
    ]);
    return {
      apiBase,
      customers: parseExxasArray(customersPayload),
      contacts: parseExxasArray(contactsPayload),
    };
  }

  function mapExxasCustomer(raw) {
    const id = asString(raw?.id || raw?.nummer);
    const nummer = asString(raw?.nummer || raw?.id);
    const name =
      asString(raw?.firmenname) ||
      asString(raw?.suchname) ||
      [asString(raw?.vorname), asString(raw?.nachname)].filter(Boolean).join(" ");
    return {
      id,
      nummer,
      name,
      email: asString(raw?.email).toLowerCase(),
      phone: asString(raw?.telefon1 || raw?.mobile || raw?.telefon2),
      phone2: asString(raw?.telefon2),
      phoneMobile: asString(raw?.mobile),
      street: asString(raw?.strasse),
      addressAddon1: asString(raw?.firmenzusatz),
      zip: asString(raw?.plz),
      city: asString(raw?.ort),
      country: asString(raw?.land),
      website: asString(raw?.website),
      notes: asString(raw?.bemerkungen),
      billingCompany: asString(raw?.re_firmenname || raw?.billing_firmenname || raw?.rg_firmenname),
      billingStreet: asString(raw?.re_strasse || raw?.billing_strasse || raw?.rg_strasse),
      billingZip: asString(raw?.re_plz || raw?.billing_plz || raw?.rg_plz),
      billingCity: asString(raw?.re_ort || raw?.billing_ort || raw?.rg_ort),
      billingCountry: asString(raw?.re_land || raw?.billing_land || raw?.rg_land),
      firstName: asString(raw?.vorname),
      salutation: asString(raw?.anrede),
      exxasCustomerId: asString(raw?.id),
      exxasAddressId: asString(raw?.id),
      raw: raw || {},
    };
  }

  function mapExxasContact(raw) {
    const id = asString(raw?.id);
    return {
      id,
      customerRef: asString(raw?.ref_kunde),
      firstName: asString(raw?.kt_vorname),
      lastName: asString(raw?.kt_nachname),
      name: [asString(raw?.kt_vorname), asString(raw?.kt_nachname)].filter(Boolean).join(" "),
      email: asString(raw?.kt_email).toLowerCase(),
      phone: asString(raw?.kt_direkt || raw?.kt_mobile),
      phoneDirect: asString(raw?.kt_direkt),
      phoneMobile: asString(raw?.kt_mobile),
      role: asString(raw?.kt_funktion),
      salutation: asString(raw?.kt_anrede),
      briefAnrede: asString(raw?.kt_briefanrede),
      suchname: asString(raw?.kt_suchname),
      department: asString(raw?.kt_abteilung),
      details: asString(raw?.details),
      raw: raw || {},
    };
  }

  async function loadLocalCustomersAndContacts(req) {
    const p = db.getPool ? db.getPool() : null;
    if (!p) throw new Error("DB nicht verfuegbar");
    const customersResult = await p.query(
      `SELECT id, email, name, company, phone, street, zipcity, zip, city, country,
              salutation, first_name, address_addon_1, address_addon_2, address_addon_3, po_box,
              phone_2, phone_mobile, phone_fax, website, notes, exxas_customer_id, exxas_address_id
       FROM customers
       ORDER BY id ASC`
    );
    const contactsResult = await p.query(
      `SELECT id, customer_id, name, role, phone, phone AS phone_direct, email, salutation, first_name, last_name, phone_mobile, department, exxas_contact_id
       FROM customer_contacts
       ORDER BY id ASC`
    );

    const customers = customersResult.rows || [];
    const customerIds = new Set(customers.map((row) => Number(row.id)));
    const contacts = (contactsResult.rows || []).filter((row) => customerIds.has(Number(row.customer_id)));
    return { customers, contacts };
  }

  function uniqueNonBlank(values, normalizeFn = asString) {
    return [...new Set((Array.isArray(values) ? values : []).map((value) => normalizeFn(value)).filter(Boolean))];
  }

  function normalizeEmail(value) {
    return asString(value).toLowerCase();
  }

  function normalizeZip(value) {
    return asString(value).replace(/[^0-9]/g, "");
  }

  function getPhoneTokens(values) {
    const out = new Set();
    for (const value of Array.isArray(values) ? values : []) {
      const digits = normalizePhone(value).replace(/^\+/, "").replace(/^00/, "");
      if (digits.length >= 6) out.add(digits);
      if (digits.length >= 8) out.add(digits.slice(-8));
      if (digits.length >= 9) out.add(digits.slice(-9));
    }
    return [...out];
  }

  function havePhoneOverlap(aValues, bValues) {
    const a = getPhoneTokens(aValues);
    const b = new Set(getPhoneTokens(bValues));
    return a.some((value) => b.has(value));
  }

  function normalizeCustomerLabel(customer) {
    return normalizeText(customer?.company || customer?.name);
  }

  function normalizeContactLabel(contact) {
    const fullName =
      [asString(contact?.firstName || contact?.first_name), asString(contact?.lastName || contact?.last_name)]
        .filter(Boolean)
        .join(" ") || asString(contact?.name);
    return normalizeText(fullName);
  }

  function hasReason(candidate, reason) {
    return Array.isArray(candidate?.reasons) && candidate.reasons.includes(reason);
  }

  function candidateGap(candidates) {
    const top = candidates[0];
    const second = candidates[1];
    if (!top) return 0;
    if (!second) return top.score;
    return top.score - second.score;
  }

  function scoreCustomerCandidate(exxasCustomer, localCustomer, relatedExxasContacts = [], localCustomerContacts = []) {
    let score = 0;
    const reasons = [];

    const exxasCustomerId = asString(exxasCustomer.exxasCustomerId);
    const exxasAddressId = asString(exxasCustomer.exxasAddressId);
    if (exxasCustomerId && exxasCustomerId === asString(localCustomer.exxas_customer_id)) {
      score += 140;
      reasons.push("exxas_customer_id");
    }
    if (exxasAddressId && exxasAddressId === asString(localCustomer.exxas_address_id)) {
      score += 140;
      reasons.push("exxas_address_id");
    }

    const exxasEmails = uniqueNonBlank([
      exxasCustomer.email,
      ...relatedExxasContacts.map((contact) => contact.email),
    ], normalizeEmail);
    const localEmails = uniqueNonBlank([
      localCustomer.email,
      ...localCustomerContacts.map((contact) => contact.email),
    ], normalizeEmail);
    if (exxasEmails.length && localEmails.length && exxasEmails.some((email) => localEmails.includes(email))) {
      const directCustomerEmail = normalizeEmail(exxasCustomer.email);
      score += directCustomerEmail && localEmails.includes(directCustomerEmail) ? 70 : 45;
      reasons.push(directCustomerEmail && localEmails.includes(directCustomerEmail) ? "email" : "contact_email");
    }

    const exxasCompanyNorm = normalizeText(exxasCustomer.name);
    const localCompanyNorm = normalizeCustomerLabel(localCustomer);
    if (exxasCompanyNorm && localCompanyNorm) {
      if (exxasCompanyNorm === localCompanyNorm) {
        score += 30;
        reasons.push("company_or_name");
      } else if (
        exxasCompanyNorm.length >= 4 &&
        localCompanyNorm.length >= 4 &&
        (exxasCompanyNorm.includes(localCompanyNorm) || localCompanyNorm.includes(exxasCompanyNorm))
      ) {
        score += 18;
        reasons.push("company_partial");
      }
    }

    if (
      havePhoneOverlap(
        [exxasCustomer.phone, exxasCustomer.phone2, exxasCustomer.phoneMobile],
        [localCustomer.phone, localCustomer.phone_2, localCustomer.phone_mobile]
      )
    ) {
      score += 14;
      reasons.push("phone");
    }

    const localZip = normalizeZip(asString(localCustomer.zip) || splitZipCity(localCustomer.zipcity).zip);
    const localCity = asString(localCustomer.city) || splitZipCity(localCustomer.zipcity).city;
    if (normalizeZip(exxasCustomer.zip) && localZip && normalizeZip(exxasCustomer.zip) === localZip) {
      score += 8;
      reasons.push("zip");
    }
    if (normalizeText(exxasCustomer.city) && normalizeText(exxasCustomer.city) === normalizeText(localCity)) {
      score += 6;
      reasons.push("city");
    }
    if (normalizeText(exxasCustomer.street) && normalizeText(exxasCustomer.street) === normalizeText(localCustomer.street)) {
      score += 8;
      reasons.push("street");
    }

    return {
      score,
      reasons,
      exactMatch: reasons.includes("exxas_customer_id") || reasons.includes("exxas_address_id"),
    };
  }

  function scoreContactCandidate(exxasContact, localContact) {
    let score = 0;
    const reasons = [];

    if (exxasContact.id && exxasContact.id === asString(localContact.exxas_contact_id)) {
      score += 140;
      reasons.push("exxas_contact_id");
    }
    if (normalizeEmail(exxasContact.email) && normalizeEmail(exxasContact.email) === normalizeEmail(localContact.email)) {
      score += 80;
      reasons.push("email");
    }
    const exxasName = normalizeContactLabel(exxasContact);
    const localName = normalizeContactLabel(localContact);
    if (exxasName && exxasName === localName) {
      score += 24;
      reasons.push("name");
    }
    if (
      havePhoneOverlap(
        [exxasContact.phoneDirect, exxasContact.phone, exxasContact.phoneMobile],
        [localContact.phone_direct, localContact.phone, localContact.phone_mobile]
      )
    ) {
      score += 12;
      reasons.push("phone");
    }
    if (
      normalizeText(exxasContact.department) &&
      normalizeText(exxasContact.department) === normalizeText(localContact.department)
    ) {
      score += 6;
      reasons.push("department");
    }
    return {
      score,
      reasons,
      exactMatch: reasons.includes("exxas_contact_id"),
    };
  }

  function decideCustomerSuggestion(customerSuggestions) {
    const top = customerSuggestions[0] || null;
    const gap = candidateGap(customerSuggestions);
    if (!top) {
      return {
        suggestedCustomerAction: "create_customer",
        suggestedLocalCustomerId: null,
        customerMatchQuality: "none",
        customerReviewRequired: false,
      };
    }
    const corroborated =
      hasReason(top, "email") ||
      hasReason(top, "contact_email") ||
      ((hasReason(top, "company_or_name") || hasReason(top, "company_partial")) &&
        (hasReason(top, "phone") || hasReason(top, "street") || hasReason(top, "zip") || hasReason(top, "city")));

    if (top.exactMatch) {
      return {
        suggestedCustomerAction: "link_existing",
        suggestedLocalCustomerId: Number(top.localCustomerId),
        customerMatchQuality: "exact",
        customerReviewRequired: false,
      };
    }
    if (top.score >= 90 && gap >= 20 && corroborated) {
      return {
        suggestedCustomerAction: "link_existing",
        suggestedLocalCustomerId: Number(top.localCustomerId),
        customerMatchQuality: "strong",
        customerReviewRequired: false,
      };
    }
    if (top.score >= 55) {
      return {
        suggestedCustomerAction: "skip",
        suggestedLocalCustomerId: Number(top.localCustomerId),
        customerMatchQuality: "ambiguous",
        customerReviewRequired: true,
      };
    }
    return {
      suggestedCustomerAction: "create_customer",
      suggestedLocalCustomerId: null,
      customerMatchQuality: "none",
      customerReviewRequired: false,
    };
  }

  function decideContactSuggestion(localCandidates, fallbackAction, fallbackLocalContactId) {
    const top = localCandidates[0] || null;
    const gap = candidateGap(localCandidates);
    if (!top) {
      return {
        suggestedAction: fallbackAction,
        suggestedLocalContactId: fallbackLocalContactId,
        matchQuality: "none",
        reviewRequired: false,
      };
    }
    const corroborated =
      hasReason(top, "email") ||
      (hasReason(top, "name") && hasReason(top, "phone")) ||
      (hasReason(top, "name") && hasReason(top, "department"));
    if (top.exactMatch) {
      return {
        suggestedAction: "link_existing",
        suggestedLocalContactId: Number(top.localContactId),
        matchQuality: "exact",
        reviewRequired: false,
      };
    }
    if (top.score >= 95 && gap >= 20 && corroborated) {
      return {
        suggestedAction: "link_existing",
        suggestedLocalContactId: Number(top.localContactId),
        matchQuality: "strong",
        reviewRequired: false,
      };
    }
    if (top.score >= 60) {
      return {
        suggestedAction: "skip",
        suggestedLocalContactId: Number(top.localContactId),
        matchQuality: "ambiguous",
        reviewRequired: true,
      };
    }
    return {
      suggestedAction: fallbackAction,
      suggestedLocalContactId: fallbackLocalContactId,
      matchQuality: "none",
      reviewRequired: false,
    };
  }

  function buildPreview(exxasCustomersRaw, exxasContactsRaw, localCustomers, localContacts) {
    const exxasCustomers = exxasCustomersRaw.map(mapExxasCustomer).filter((row) => row.id);
    const exxasContacts = exxasContactsRaw.map(mapExxasContact).filter((row) => row.id);
    const contactsByCustomerRef = new Map();
    for (const contact of exxasContacts) {
      const key = contact.customerRef;
      if (!contactsByCustomerRef.has(key)) contactsByCustomerRef.set(key, []);
      contactsByCustomerRef.get(key).push(contact);
    }

    const localContactsByCustomer = new Map();
    for (const contact of localContacts) {
      const key = Number(contact.customer_id);
      if (!localContactsByCustomer.has(key)) localContactsByCustomer.set(key, []);
      localContactsByCustomer.get(key).push(contact);
    }

    const items = exxasCustomers.map((exxasCustomer) => {
      const relatedContacts = contactsByCustomerRef.get(exxasCustomer.id) || [];
      const customerSuggestions = localCustomers
        .map((localCustomer) => {
          const { score, reasons, exactMatch } = scoreCustomerCandidate(
            exxasCustomer,
            localCustomer,
            relatedContacts,
            localContactsByCustomer.get(Number(localCustomer.id)) || []
          );
          return {
            localCustomerId: Number(localCustomer.id),
            localCustomer,
            confidence: Math.min(1, score / 100),
            score,
            reasons,
            exactMatch,
          };
        })
        .filter((candidate) => candidate.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      const customerDecision = decideCustomerSuggestion(customerSuggestions);
      const targetLocalCustomerId = customerDecision.suggestedLocalCustomerId;
      const localContactPool =
        targetLocalCustomerId != null ? localContactsByCustomer.get(Number(targetLocalCustomerId)) || [] : [];

      const contactSuggestions = relatedContacts.map((exxasContact) => {
        const localCandidates = localContactPool
          .map((localContact) => {
            const { score, reasons, exactMatch } = scoreContactCandidate(exxasContact, localContact);
            return {
              localContactId: Number(localContact.id),
              localContact,
              confidence: Math.min(1, score / 100),
              score,
              reasons,
              exactMatch,
            };
          })
          .filter((candidate) => candidate.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);
        const contactDecision =
          customerDecision.customerReviewRequired
            ? {
                suggestedAction: "skip",
                suggestedLocalContactId: localCandidates[0] ? Number(localCandidates[0].localContactId) : null,
                matchQuality: localCandidates[0] ? "ambiguous" : "none",
                reviewRequired: localCandidates.length > 0,
              }
            : decideContactSuggestion(localCandidates, "create_contact", null);
        return {
          exxasContact,
          localCandidates,
          suggestedAction: contactDecision.suggestedAction,
          suggestedLocalContactId: contactDecision.suggestedLocalContactId,
          matchQuality: contactDecision.matchQuality,
          reviewRequired: contactDecision.reviewRequired,
        };
      });

      return {
        exxasCustomer,
        customerSuggestions,
        suggestedCustomerAction: customerDecision.suggestedCustomerAction,
        suggestedLocalCustomerId: customerDecision.suggestedLocalCustomerId,
        customerMatchQuality: customerDecision.customerMatchQuality,
        customerReviewRequired: customerDecision.customerReviewRequired,
        reviewRequired:
          customerDecision.customerReviewRequired || contactSuggestions.some((contact) => contact.reviewRequired),
        contactSuggestions,
      };
    });

    const localCustomerIndex = localCustomers.map((c) => ({
      id: Number(c.id),
      label: asString(c.company || c.name),
      email: asString(c.email),
    }));
    const localContactIndexByCustomer = {};
    for (const contact of localContacts) {
      const customerId = Number(contact.customer_id);
      if (!Number.isFinite(customerId)) continue;
      const key = String(customerId);
      if (!Array.isArray(localContactIndexByCustomer[key])) localContactIndexByCustomer[key] = [];
      localContactIndexByCustomer[key].push({
        id: Number(contact.id),
        label: asString(contact.name),
        email: asString(contact.email),
      });
    }

    return {
      stats: {
        exxasCustomers: exxasCustomers.length,
        exxasContacts: exxasContacts.length,
        localCustomers: localCustomers.length,
        localContacts: localContacts.length,
        previewItems: items.length,
      },
      items,
      localCustomerIndex,
      localContactIndexByCustomer,
    };
  }

  async function ensureNoDuplicateContact(p, customerId, email, displayName, excludeContactId) {
    const ex = Number.isFinite(excludeContactId) ? excludeContactId : null;
    if (email) {
      const { rows } = await p.query(
        `SELECT id
         FROM customer_contacts
         WHERE customer_id = $1
           AND email ILIKE $2
           AND ($3::int IS NULL OR id <> $3)
         LIMIT 1`,
        [customerId, email, ex]
      );
      if (rows.length > 0) throw new Error("DUPLICATE_CONTACT_EMAIL");
    }
    if (displayName) {
      const { rows } = await p.query(
        `SELECT id
         FROM customer_contacts
         WHERE customer_id = $1
           AND LOWER(TRIM(name)) = LOWER($2)
           AND ($3::int IS NULL OR id <> $3)
         LIMIT 1`,
        [customerId, displayName, ex]
      );
      if (rows.length > 0) throw new Error("DUPLICATE_CONTACT_NAME");
    }
  }

  async function findContactByExxasId(p, exxasContactId, excludeContactId) {
    const exxasId = asString(exxasContactId);
    const ex = Number.isFinite(excludeContactId) ? excludeContactId : null;
    if (!exxasId) return null;
    const { rows } = await p.query(
      `SELECT id, customer_id, name, email, exxas_contact_id
       FROM customer_contacts
       WHERE exxas_contact_id = $1
         AND ($2::int IS NULL OR id <> $2)
       LIMIT 1`,
      [exxasId, ex]
    );
    return rows[0] || null;
  }

  function buildExxasContactConflictMessage(existingContact, targetCustomerId) {
    const existingId = Number(existingContact?.id);
    const existingCustomerId = Number(existingContact?.customer_id);
    const targetId = Number(targetCustomerId);
    if (Number.isFinite(existingCustomerId) && Number.isFinite(targetId) && existingCustomerId === targetId) {
      return `EXXAS-Kontakt ist bereits mit lokalem Kontakt #${existingId} verknuepft. Bitte diesen bestehenden Kontakt auswaehlen.`;
    }
    return `EXXAS-Kontakt ist bereits mit lokalem Kontakt #${existingId} bei Kunde #${existingCustomerId} verknuepft. Bitte zuerst den richtigen Zielkunden waehlen oder die bestehende Verknuepfung pruefen.`;
  }

  async function fillMissingCustomerFields(p, customerId, exxasCustomer, overwriteFields = []) {
    const existingResult = await p.query("SELECT * FROM customers WHERE id = $1 LIMIT 1", [customerId]);
    const existing = existingResult.rows[0];
    if (!existing) throw new Error("Kunde nicht gefunden");
    const overwriteSet = new Set(
      (Array.isArray(overwriteFields) ? overwriteFields : []).map((value) => asString(value)).filter(Boolean)
    );

    const zip = asString(exxasCustomer.zip);
    const city = asString(exxasCustomer.city);
    const zipcity = zip && city ? `${zip} ${city}` : "";
    const customerNameValue = getExxasCustomerNameValue(exxasCustomer);
    const existingNameForMerge = isExxasCompanyCustomer(exxasCustomer) &&
      normalizeText(existing.name) === normalizeText(existing.company || exxasCustomer.name)
        ? ""
        : existing.name;

    const resolvedEmail = resolveIncomingValue(
      isSyntheticCompanyEmail(existing.email) ? "" : existing.email,
      normalizeCustomerEmail(exxasCustomer.email),
      overwriteSet,
      "email"
    );
    const patch = {
      // Synthetische Platzhalter-Mailadressen werden nicht konserviert.
      email: resolvedEmail,
      name: overwriteSet.has("company_or_name")
        ? resolveIncomingValue(existingNameForMerge, customerNameValue, overwriteSet, "company_or_name")
        : resolveIncomingValue(existingNameForMerge, customerNameValue, overwriteSet, "name"),
      company: resolveIncomingValue(existing.company, exxasCustomer.name, overwriteSet, "company_or_name"),
      phone: resolveIncomingValue(existing.phone, exxasCustomer.phone, overwriteSet, "phone"),
      phone_2: resolveIncomingValue(existing.phone_2, exxasCustomer.phone2, overwriteSet, "phone_2"),
      phone_mobile: resolveIncomingValue(existing.phone_mobile, exxasCustomer.phoneMobile, overwriteSet, "phone_mobile"),
      street: resolveIncomingValue(existing.street, exxasCustomer.street, overwriteSet, "street"),
      address_addon_1: resolveIncomingValue(existing.address_addon_1, exxasCustomer.addressAddon1, overwriteSet, "address_addon_1"),
      zipcity: resolveIncomingValue(existing.zipcity, zipcity, overwriteSet, "zipcity"),
      salutation: resolveIncomingValue(existing.salutation, exxasCustomer.salutation, overwriteSet, "salutation"),
      first_name: resolveIncomingValue(existing.first_name, exxasCustomer.firstName, overwriteSet, "first_name"),
      zip: resolveIncomingValue(existing.zip, zip, overwriteSet, "zip"),
      city: resolveIncomingValue(existing.city, city, overwriteSet, "city"),
      country: resolveIncomingValue(existing.country, exxasCustomer.country || "Schweiz", overwriteSet, "country"),
      website: resolveIncomingValue(existing.website, exxasCustomer.website, overwriteSet, "website"),
      notes: resolveIncomingValue(existing.notes, exxasCustomer.notes, overwriteSet, "notes"),
      exxas_customer_id: asString(existing.exxas_customer_id || exxasCustomer.exxasCustomerId),
      exxas_address_id: asString(existing.exxas_address_id || exxasCustomer.exxasAddressId),
    };

    if (!isBlank(patch.email) && normalizeText(patch.email) !== normalizeText(existing.email)) {
      const duplicateEmail = await p.query(
        `SELECT id
         FROM customers
         WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))
           AND id <> $2
         LIMIT 1`,
        [patch.email, customerId]
      );
      if (duplicateEmail.rows.length > 0) {
        throw new Error("DUPLICATE_CUSTOMER_EMAIL");
      }
    }

    await p.query(
      `UPDATE customers
       SET email=$1, name=$2, company=$3, phone=$4, phone_2=$5, phone_mobile=$6, street=$7, address_addon_1=$8, zipcity=$9,
           salutation=$10, first_name=$11, zip=$12, city=$13, country=$14, website=$15, notes=$16,
           exxas_customer_id=$17, exxas_address_id=$18, updated_at=NOW()
       WHERE id=$19`,
      [
        patch.email,
        patch.name,
        patch.company,
        patch.phone,
        patch.phone_2,
        patch.phone_mobile,
        patch.street,
        patch.address_addon_1,
        patch.zipcity,
        patch.salutation,
        patch.first_name,
        patch.zip,
        patch.city,
        patch.country,
        patch.website,
        patch.notes,
        patch.exxas_customer_id,
        patch.exxas_address_id,
        customerId,
      ]
    );
  }

  function emailFromExxasContactPayload(c) {
    if (!c || typeof c !== "object") return "";
    const raw = c.raw && typeof c.raw === "object" ? c.raw : null;
    if (raw) return normalizeCustomerEmail(raw.kt_email);
    return normalizeCustomerEmail(c.email || c.kt_email);
  }

  /** Erste gueltige E-Mail aus den Kontakt-Entscheidungen (auch bei skip), fuer Firmenkunden ohne Stammdaten-E-Mail. */
  function firstEmailFromContactDecisions(contactDecisions) {
    if (!Array.isArray(contactDecisions)) return "";
    for (const cd of contactDecisions) {
      const em = emailFromExxasContactPayload(cd?.exxasContact);
      if (em) return em;
    }
    return "";
  }

  /**
   * Bei fehlender EXXAS-Kundenmail zuerst Kontakt-E-Mails nutzen, sonst leer lassen.
   */
  function resolveEmailForNewCustomerFromExxas(exxasCustomer, contactDecisions) {
    let email = normalizeCustomerEmail(exxasCustomer?.email);
    if (!email) email = normalizeCustomerEmail(firstEmailFromContactDecisions(contactDecisions));
    return email;
  }

  async function findCustomerIdByEmailNorm(p, normEmail) {
    const em = normalizeCustomerEmail(normEmail);
    if (!em) return null;
    const { rows } = await p.query(
      `SELECT id FROM customers
       WHERE NULLIF(TRIM(COALESCE(email, '')), '') IS NOT NULL
         AND LOWER(TRIM(COALESCE(email, ''))) = $1
       LIMIT 1`,
      [em]
    );
    return rows[0] ? Number(rows[0].id) : null;
  }

  /** Exakte gespeicherte Adresse (nach Normalisierung), z. B. fuer Retry nach 23505. */
  async function findCustomerIdByEmailExact(p, email) {
    const em = normalizeCustomerEmail(email);
    if (!em) return null;
    const { rows } = await p.query(
      `SELECT id FROM customers WHERE NULLIF(TRIM(email), '') IS NOT NULL AND email = $1 LIMIT 1`,
      [em]
    );
    return rows[0] ? Number(rows[0].id) : null;
  }

  async function findCustomerIdByExxasIds(p, exxasCustomer) {
    const cid = asString(exxasCustomer.exxasCustomerId);
    const aid = asString(exxasCustomer.exxasAddressId);
    if (cid) {
      const { rows } = await p.query(
        `SELECT id FROM customers
         WHERE TRIM(COALESCE(exxas_customer_id, '')) = TRIM($1)
         LIMIT 1`,
        [cid]
      );
      if (rows[0]) return Number(rows[0].id);
    }
    if (aid && aid !== cid) {
      const { rows } = await p.query(
        `SELECT id FROM customers
         WHERE TRIM(COALESCE(exxas_address_id, '')) = TRIM($1)
         LIMIT 1`,
        [aid]
      );
      if (rows[0]) return Number(rows[0].id);
    }
    return null;
  }

  function isPgUniqueViolation(err) {
    return err && String(err.code) === "23505";
  }

  function isCustomersEmailUniqueViolation(err) {
    if (!isPgUniqueViolation(err)) return false;
    const c = asString(err.constraint);
    const msg = asString(err.message);
    const det = asString(err.detail);
    return (
      c === "idx_core_customers_email" ||
      c === "uq_customers_email_nonempty" ||
      c === "customers_email_key" ||
      msg.includes("idx_core_customers_email") ||
      msg.includes("uq_customers_email_nonempty") ||
      det.includes("(email)=")
    );
  }

  function isCustomersExxasIdUniqueViolation(err) {
    if (!isPgUniqueViolation(err)) return false;
    const c = asString(err.constraint);
    const msg = asString(err.message);
    return (
      c === "uq_customers_exxas_customer_id" ||
      c === "uq_customers_exxas_address_id" ||
      msg.includes("uq_customers_exxas_customer_id") ||
      msg.includes("uq_customers_exxas_address_id")
    );
  }

  async function createCustomerFromExxas(p, exxasCustomer, resolvedEmail) {
    const email = normalizeCustomerEmail(resolvedEmail);

    const existingByExxas = await findCustomerIdByExxasIds(p, exxasCustomer);
    if (existingByExxas != null) {
      await fillMissingCustomerFields(p, existingByExxas, exxasCustomer);
      return existingByExxas;
    }

    if (email) {
      const byEmail = await findCustomerIdByEmailNorm(p, email);
      if (byEmail != null) {
        await fillMissingCustomerFields(p, byEmail, exxasCustomer);
        return byEmail;
      }
    }

    const zip = asString(exxasCustomer.zip);
    const city = asString(exxasCustomer.city);
    const zipcity = zip && city ? `${zip} ${city}` : "";

    let preDedup = null;
    if (email) {
      preDedup = await findMatchingCustomer(
        { query: (q, a) => p.query(q, a) },
        {
          email,
          company: asString(exxasCustomer.name),
          name: getExxasCustomerNameValue(exxasCustomer),
          phone: asString(exxasCustomer.phone),
          street: asString(exxasCustomer.street),
          zipcity,
        }
      );
      if (preDedup && preDedup.match === "strong" && preDedup.customer) {
        const id = Number(preDedup.customer.id);
        if (Number.isFinite(id) && id > 0) {
          await fillMissingCustomerFields(p, id, exxasCustomer);
          return id;
        }
      }
    }

    const insertParams = [
      email,
      getExxasCustomerNameValue(exxasCustomer),
      asString(exxasCustomer.name),
      asString(exxasCustomer.phone),
      asString(exxasCustomer.phone2),
      asString(exxasCustomer.phoneMobile),
      asString(exxasCustomer.street),
      asString(exxasCustomer.addressAddon1),
      zipcity,
      asString(exxasCustomer.salutation),
      asString(exxasCustomer.firstName),
      zip,
      city,
      asString(exxasCustomer.country || "Schweiz"),
      asString(exxasCustomer.website),
      asString(exxasCustomer.notes),
      asString(exxasCustomer.exxasCustomerId),
      asString(exxasCustomer.exxasAddressId),
    ];

    try {
      const insert = await p.query(
        `INSERT INTO customers (
           email, name, company, phone, phone_2, phone_mobile, street, address_addon_1, zipcity,
           salutation, first_name, zip, city, country, website, notes, exxas_customer_id, exxas_address_id
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,
           $10,$11,$12,$13,$14,$15,$16,$17,$18
         )
         RETURNING id`,
        insertParams
      );
      const newId = Number(insert.rows[0].id);
      if (
        preDedup &&
        preDedup.match === "weak" &&
        preDedup.customer &&
        newId > 0 &&
        Number.isFinite(newId) &&
        Number.isFinite(Number(preDedup.customer.id)) &&
        newId !== Number(preDedup.customer.id)
      ) {
        try {
          const { insertCustomerDuplicateCandidate } = require("./db");
          await insertCustomerDuplicateCandidate({
            newCustomerId: newId,
            suspectedKeepId: preDedup.customer.id,
            score: preDedup.score,
            reason: String(preDedup.reason || "exxas_weak"),
          });
        } catch (_e) {
          /* Kandidat optional */
        }
      }
      return newId;
    } catch (err) {
      if (isCustomersEmailUniqueViolation(err) && email) {
        let fallbackId = await findCustomerIdByEmailExact(p, email);
        if (fallbackId == null) fallbackId = await findCustomerIdByEmailNorm(p, email);
        if (fallbackId != null) {
          await fillMissingCustomerFields(p, fallbackId, exxasCustomer);
          return fallbackId;
        }
      }
      if (isCustomersExxasIdUniqueViolation(err)) {
        const fallbackExxas = await findCustomerIdByExxasIds(p, exxasCustomer);
        if (fallbackExxas != null) {
          await fillMissingCustomerFields(p, fallbackExxas, exxasCustomer);
          return fallbackExxas;
        }
      }
      throw err;
    }
  }

  async function fillMissingContactFields(p, contactId, exxasContact, overwriteFields = []) {
    const existingResult = await p.query("SELECT * FROM customer_contacts WHERE id = $1 LIMIT 1", [contactId]);
    const existing = existingResult.rows[0];
    if (!existing) throw new Error("Kontakt nicht gefunden");
    const overwriteSet = new Set(
      (Array.isArray(overwriteFields) ? overwriteFields : []).map((value) => asString(value)).filter(Boolean)
    );

    const displayName =
      asString(existing.name) ||
      [asString(exxasContact.firstName), asString(exxasContact.lastName)].filter(Boolean).join(" ") ||
      asString(exxasContact.email);

    const patch = {
      name: resolveIncomingValue(existing.name, displayName, overwriteSet, "name"),
      role: resolveIncomingValue(
        shouldTreatContactRoleAsPlaceholder(existing.role) ? "" : existing.role,
        exxasContact.role,
        overwriteSet,
        "role"
      ),
      phone: resolveIncomingValue(existing.phone, exxasContact.phoneDirect || exxasContact.phone, overwriteSet, "phone"),
      email: resolveIncomingValue(existing.email, exxasContact.email, overwriteSet, "email"),
      salutation: resolveIncomingValue(existing.salutation, exxasContact.salutation, overwriteSet, "salutation"),
      first_name: resolveIncomingValue(existing.first_name, exxasContact.firstName, overwriteSet, "first_name"),
      last_name: resolveIncomingValue(existing.last_name, exxasContact.lastName, overwriteSet, "last_name"),
      phone_mobile: resolveIncomingValue(existing.phone_mobile, exxasContact.phoneMobile, overwriteSet, "phone_mobile"),
      department: resolveIncomingValue(existing.department, exxasContact.department, overwriteSet, "department"),
      exxas_contact_id: asString(existing.exxas_contact_id || exxasContact.id),
    };

    patch.email = normalizeCustomerEmail(patch.email);

    const existingLinkedContact = await findContactByExxasId(p, patch.exxas_contact_id, Number(existing.id));
    if (existingLinkedContact) {
      throw new Error(buildExxasContactConflictMessage(existingLinkedContact, existing.customer_id));
    }

    await ensureNoDuplicateContact(
      p,
      Number(existing.customer_id),
      patch.email,
      patch.name,
      Number(existing.id)
    );

    await p.query(
      `UPDATE customer_contacts
       SET name=$1, role=$2, phone=$3, email=$4, salutation=$5, first_name=$6, last_name=$7, phone_mobile=$8, department=$9, exxas_contact_id=$10
       WHERE id=$11`,
      [
        patch.name,
        patch.role,
        patch.phone,
        patch.email,
        patch.salutation,
        patch.first_name,
        patch.last_name,
        patch.phone_mobile,
        patch.department,
        patch.exxas_contact_id,
        contactId,
      ]
    );
  }

  async function createContactFromExxas(p, customerId, exxasContact) {
    const baseDisplayName =
      [asString(exxasContact.firstName), asString(exxasContact.lastName)].filter(Boolean).join(" ") ||
      asString(exxasContact.name) ||
      asString(exxasContact.email);
    const email = normalizeCustomerEmail(exxasContact.email);
    const existingLinkedContact = await findContactByExxasId(p, exxasContact.id, null);
    if (existingLinkedContact) {
      if (Number(existingLinkedContact.customer_id) !== Number(customerId)) {
        throw new Error(buildExxasContactConflictMessage(existingLinkedContact, customerId));
      }
      await fillMissingContactFields(p, Number(existingLinkedContact.id), exxasContact);
      return Number(existingLinkedContact.id);
    }
    let displayName = baseDisplayName;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await ensureNoDuplicateContact(p, customerId, email, displayName, null);
        break;
      } catch (e) {
        if (asString(e?.message) === "DUPLICATE_CONTACT_NAME" && attempt < 3) {
          displayName =
            attempt === 0
              ? `${baseDisplayName} (EXXAS ${asString(exxasContact.id)})`
              : `${baseDisplayName} (${attempt + 1})`;
          continue;
        }
        throw e;
      }
    }
    const insert = await p.query(
      `INSERT INTO customer_contacts (
         customer_id, name, role, phone, email, sort_order,
         salutation, first_name, last_name, phone_mobile, department, exxas_contact_id
       ) VALUES (
         $1,$2,$3,$4,$5,$6,
         $7,$8,$9,$10,$11,$12
       )
       RETURNING id`,
      [
        customerId,
        displayName,
        asString(exxasContact.role),
        asString(exxasContact.phoneDirect || exxasContact.phone),
        email,
        0,
        asString(exxasContact.salutation),
        asString(exxasContact.firstName),
        asString(exxasContact.lastName),
        asString(exxasContact.phoneMobile),
        asString(exxasContact.department),
        asString(exxasContact.id),
      ]
    );
    return Number(insert.rows[0].id);
  }

  app.post("/api/admin/integrations/exxas/reconcile/preview", requireAdmin, async (req, res) => {
    try {
      const credentials = req.body?.credentials || {};
      const exxasData = await loadExxasData(credentials);
      const local = await loadLocalCustomersAndContacts(req);
      const preview = buildPreview(exxasData.customers, exxasData.contacts, local.customers, local.contacts);
      res.json({
        ok: true,
        source: exxasData.apiBase,
        ...preview,
      });
    } catch (err) {
      res.status(400).json({ error: err.message || "Preview fehlgeschlagen" });
    }
  });

  function resolveCustomerForConfirm(obj) {
    if (!obj || typeof obj !== "object") return null;
    const rawSrc = obj.raw && typeof obj.raw === "object" && (obj.raw.firmenname || obj.raw.id || obj.raw.nummer) ? obj.raw : null;
    if (rawSrc) return mapExxasCustomer(rawSrc);
    return {
      id: asString(obj.id),
      nummer: asString(obj.nummer || obj.id),
      name: asString(obj.name),
      email: asString(obj.email).toLowerCase(),
      phone: asString(obj.phone),
      phone2: asString(obj.phone2),
      phoneMobile: asString(obj.phoneMobile),
      street: asString(obj.street),
      addressAddon1: asString(obj.addressAddon1),
      zip: asString(obj.zip),
      city: asString(obj.city),
      country: asString(obj.country || "Schweiz"),
      website: asString(obj.website),
      notes: asString(obj.notes),
      billingCompany: asString(obj.billingCompany),
      billingStreet: asString(obj.billingStreet),
      billingZip: asString(obj.billingZip),
      billingCity: asString(obj.billingCity),
      billingCountry: asString(obj.billingCountry),
      firstName: asString(obj.firstName),
      salutation: asString(obj.salutation),
      exxasCustomerId: asString(obj.exxasCustomerId || obj.id),
      exxasAddressId: asString(obj.exxasAddressId || obj.id),
      raw: obj.raw || {},
    };
  }

  function resolveContactForConfirm(obj) {
    if (!obj || typeof obj !== "object") return null;
    const rawSrc = obj.raw && typeof obj.raw === "object" && (obj.raw.kt_vorname || obj.raw.kt_email || obj.raw.id) ? obj.raw : null;
    if (rawSrc) return mapExxasContact(rawSrc);
    return {
      id: asString(obj.id),
      customerRef: asString(obj.customerRef),
      firstName: asString(obj.firstName),
      lastName: asString(obj.lastName),
      name: asString(obj.name) || [asString(obj.firstName), asString(obj.lastName)].filter(Boolean).join(" "),
      email: asString(obj.email).toLowerCase(),
      phone: asString(obj.phoneDirect || obj.phone),
      phoneDirect: asString(obj.phoneDirect),
      phoneMobile: asString(obj.phoneMobile),
      role: asString(obj.role),
      salutation: asString(obj.salutation),
      briefAnrede: asString(obj.briefAnrede),
      suchname: asString(obj.suchname),
      department: asString(obj.department),
      details: asString(obj.details),
      raw: obj.raw || {},
    };
  }

  app.post("/api/admin/integrations/exxas/reconcile/confirm", requireAdmin, async (req, res) => {
    const p = db.getPool ? db.getPool() : null;
    if (!p) return res.status(503).json({ error: "DB nicht verfuegbar" });
    const decisions = Array.isArray(req.body?.decisions) ? req.body.decisions : [];
    if (!decisions.length) return res.status(400).json({ error: "decisions erforderlich" });

    const outcomes = [];
    for (const decision of decisions) {
      const exxasCustomer = decision?.exxasCustomer && typeof decision.exxasCustomer === "object" ? decision.exxasCustomer : null;
      const customerAction = asString(decision?.customerAction || "skip");
      if (!exxasCustomer || !asString(exxasCustomer.id)) {
        outcomes.push({ ok: false, error: "ungueltiger exxasCustomer", exxasCustomerId: null });
        continue;
      }

      const exxasCustomerId = asString(exxasCustomer.id);
      const mappedCustomer = resolveCustomerForConfirm(exxasCustomer);
      try {
        await p.query("BEGIN");

        let targetCustomerId = null;
        if (customerAction === "skip") {
          await p.query("COMMIT");
          outcomes.push({ ok: true, exxasCustomerId, skipped: true });
          continue;
        }

        if (customerAction === "link_existing") {
          const localCustomerId = Number(decision?.localCustomerId);
          const overwriteCustomerFields = Array.isArray(decision?.overwriteCustomerFields)
            ? decision.overwriteCustomerFields
            : [];
          if (!Number.isFinite(localCustomerId)) throw new Error("localCustomerId fehlt");
          if (!(await ensureCustomerInRequestCompany(req, localCustomerId))) {
            throw new Error("Kunde ausserhalb des erlaubten Bereichs");
          }
          targetCustomerId = localCustomerId;
          await fillMissingCustomerFields(p, targetCustomerId, mappedCustomer, overwriteCustomerFields);
        } else if (customerAction === "create_customer") {
          const resolvedCustomerEmail = resolveEmailForNewCustomerFromExxas(mappedCustomer, decision.contactDecisions);
          targetCustomerId = await createCustomerFromExxas(p, mappedCustomer, resolvedCustomerEmail);
        } else {
          throw new Error(`Ungueltige customerAction: ${customerAction}`);
        }

        const contactDecisions = Array.isArray(decision?.contactDecisions) ? decision.contactDecisions : [];
        const contactOutcomes = [];
        for (const contactDecision of contactDecisions) {
          const contactAction = asString(contactDecision?.action || "skip");
          const exxasContact =
            contactDecision?.exxasContact && typeof contactDecision.exxasContact === "object"
              ? resolveContactForConfirm(contactDecision.exxasContact)
              : null;
          if (!exxasContact || !exxasContact.id) {
            contactOutcomes.push({ ok: false, error: "ungueltiger exxasContact", exxasContactId: null });
            continue;
          }

          if (contactAction === "skip") {
            contactOutcomes.push({ ok: true, exxasContactId: exxasContact.id, skipped: true });
            continue;
          }
          if (!Number.isFinite(targetCustomerId)) throw new Error("Zielkunde fehlt fuer Kontaktabgleich");

          if (contactAction === "link_existing") {
            const localContactId = Number(contactDecision?.localContactId);
            const overwriteFields = Array.isArray(contactDecision?.overwriteFields)
              ? contactDecision.overwriteFields
              : [];
            if (!Number.isFinite(localContactId)) throw new Error("localContactId fehlt");
            const contactRow = await p.query(
              "SELECT id, customer_id, email FROM customer_contacts WHERE id = $1 LIMIT 1",
              [localContactId]
            );
            if (!contactRow.rows[0]) throw new Error("Kontakt nicht gefunden");
            if (Number(contactRow.rows[0].customer_id) !== Number(targetCustomerId)) {
              throw new Error("Kontakt gehoert nicht zum Zielkunden");
            }
            await fillMissingContactFields(p, localContactId, exxasContact, overwriteFields);
            contactOutcomes.push({ ok: true, exxasContactId: exxasContact.id, localContactId });
            continue;
          }

          if (contactAction === "create_contact") {
            const localContactId = await createContactFromExxas(p, Number(targetCustomerId), exxasContact);
            contactOutcomes.push({ ok: true, exxasContactId: exxasContact.id, localContactId });
            continue;
          }

          throw new Error(`Ungueltige contact action: ${contactAction}`);
        }

        await p.query("COMMIT");
        outcomes.push({
          ok: true,
          exxasCustomerId,
          localCustomerId: Number(targetCustomerId),
          contactOutcomes,
        });
      } catch (err) {
        await p.query("ROLLBACK");
        const isExxasContactUniqueViolation =
          err?.code === "23505" &&
          (asString(err?.constraint) === "uq_customer_contacts_exxas_contact_id" ||
            asString(err?.message).includes("uq_customer_contacts_exxas_contact_id"));
        outcomes.push({
          ok: false,
          exxasCustomerId,
          error: isExxasContactUniqueViolation
            ? "EXXAS-Kontakt ist bereits mit einem anderen lokalen Kontakt verknuepft. Bitte die bestehende Verknuepfung pruefen."
            : (err.message || "confirm fehlgeschlagen"),
        });
      }
    }

    const successCount = outcomes.filter((row) => row.ok).length;
    res.json({
      ok: true,
      summary: {
        total: outcomes.length,
        success: successCount,
        failed: outcomes.length - successCount,
      },
      outcomes,
    });
  });
}

module.exports = { registerExxasReconcileRoutes };

