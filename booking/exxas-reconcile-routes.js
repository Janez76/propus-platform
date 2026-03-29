/**
 * EXXAS Reconciliation routes (preview + confirm).
 *
 * Ziel:
 * - Vorschlaege fuer Kunden/Kontakte erzeugen (ohne Schreibzugriff)
 * - Nach manueller Bestaetigung selektiv in lokale DB uebernehmen
 */
const logtoOrgSync = require("./logto-org-sync");
const rbac = require("./access-rbac");

function registerExxasReconcileRoutes(app, db, requireAdmin, ensureCustomerInRequestCompany) {
  function asString(value) {
    return value == null ? "" : String(value).trim();
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

    let customers = customersResult.rows || [];
    if (req.companyId) {
      const allowed = await p.query(
        `SELECT customer_id
         FROM company_members
         WHERE company_id = $1 AND customer_id IS NOT NULL`,
        [Number(req.companyId)]
      );
      const allowedSet = new Set((allowed.rows || []).map((row) => Number(row.customer_id)));
      customers = customers.filter((row) => allowedSet.has(Number(row.id)));
    }

    const customerIds = new Set(customers.map((row) => Number(row.id)));
    const contacts = (contactsResult.rows || []).filter((row) => customerIds.has(Number(row.customer_id)));
    return { customers, contacts };
  }

  function scoreCustomerCandidate(exxasCustomer, localCustomer) {
    let score = 0;
    const reasons = [];

    const exxasCustomerId = asString(exxasCustomer.exxasCustomerId);
    const exxasAddressId = asString(exxasCustomer.exxasAddressId);
    if (exxasCustomerId && exxasCustomerId === asString(localCustomer.exxas_customer_id)) {
      score += 100;
      reasons.push("exxas_customer_id");
    }
    if (exxasAddressId && exxasAddressId === asString(localCustomer.exxas_address_id)) {
      score += 100;
      reasons.push("exxas_address_id");
    }

    if (exxasCustomer.email && exxasCustomer.email === asString(localCustomer.email).toLowerCase()) {
      score += 60;
      reasons.push("email");
    }

    const exxasCompanyNorm = normalizeText(exxasCustomer.name);
    const localCompanyNorm = normalizeText(localCustomer.company || localCustomer.name);
    if (exxasCompanyNorm && localCompanyNorm) {
      if (exxasCompanyNorm === localCompanyNorm) {
        score += 25;
        reasons.push("company_or_name");
      } else if (
        exxasCompanyNorm.length >= 4 &&
        localCompanyNorm.length >= 4 &&
        (exxasCompanyNorm.includes(localCompanyNorm) || localCompanyNorm.includes(exxasCompanyNorm))
      ) {
        score += 15;
        reasons.push("company_partial");
      }
    }

    const exxasPhones = [exxasCustomer.phone, exxasCustomer.phone2, exxasCustomer.phoneMobile]
      .map(normalizePhone)
      .filter((p) => p.length >= 6);
    const localPhones = [localCustomer.phone, localCustomer.phone_2, localCustomer.phone_mobile]
      .map(normalizePhone)
      .filter((p) => p.length >= 6);
    if (exxasPhones.length && localPhones.length && exxasPhones.some((ep) => localPhones.includes(ep))) {
      score += 10;
      reasons.push("phone");
    }

    const localZip = asString(localCustomer.zip) || splitZipCity(localCustomer.zipcity).zip;
    const localCity = asString(localCustomer.city) || splitZipCity(localCustomer.zipcity).city;
    if (exxasCustomer.zip && localZip && exxasCustomer.zip === localZip) {
      score += 5;
      reasons.push("zip");
    }
    if (normalizeText(exxasCustomer.city) && normalizeText(exxasCustomer.city) === normalizeText(localCity)) {
      score += 5;
      reasons.push("city");
    }
    if (normalizeText(exxasCustomer.street) && normalizeText(exxasCustomer.street) === normalizeText(localCustomer.street)) {
      score += 5;
      reasons.push("street");
    }

    return { score, reasons };
  }

  function scoreContactCandidate(exxasContact, localContact) {
    let score = 0;
    const reasons = [];

    if (exxasContact.id && exxasContact.id === asString(localContact.exxas_contact_id)) {
      score += 100;
      reasons.push("exxas_contact_id");
    }
    if (exxasContact.email && exxasContact.email === asString(localContact.email).toLowerCase()) {
      score += 70;
      reasons.push("email");
    }
    const exxasName = normalizeText(exxasContact.name);
    const localName = normalizeText(localContact.name);
    if (exxasName && exxasName === localName) {
      score += 20;
      reasons.push("name");
    }
    const exxasPhone = normalizePhone(exxasContact.phone);
    const localPhone = normalizePhone(localContact.phone_mobile || localContact.phone);
    if (exxasPhone && localPhone && exxasPhone === localPhone) {
      score += 10;
      reasons.push("phone");
    }
    return { score, reasons };
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
      const customerSuggestions = localCustomers
        .map((localCustomer) => {
          const { score, reasons } = scoreCustomerCandidate(exxasCustomer, localCustomer);
          return {
            localCustomerId: Number(localCustomer.id),
            localCustomer,
            confidence: Math.min(1, score / 100),
            score,
            reasons,
          };
        })
        .filter((candidate) => candidate.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      const topCustomer = customerSuggestions[0] || null;
      const suggestedCustomerAction = topCustomer && topCustomer.score >= 60 ? "link_existing" : "create_customer";
      const targetLocalCustomerId = topCustomer ? Number(topCustomer.localCustomerId) : null;
      const relatedContacts = contactsByCustomerRef.get(exxasCustomer.id) || [];
      const localContactPool =
        targetLocalCustomerId != null ? localContactsByCustomer.get(Number(targetLocalCustomerId)) || [] : [];

      const contactSuggestions = relatedContacts.map((exxasContact) => {
        const localCandidates = localContactPool
          .map((localContact) => {
            const { score, reasons } = scoreContactCandidate(exxasContact, localContact);
            return {
              localContactId: Number(localContact.id),
              localContact,
              confidence: Math.min(1, score / 100),
              score,
              reasons,
            };
          })
          .filter((candidate) => candidate.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);
        const topContact = localCandidates[0] || null;
        return {
          exxasContact,
          localCandidates,
          suggestedAction: topContact && topContact.score >= 70 ? "link_existing" : "create_contact",
          suggestedLocalContactId: topContact ? Number(topContact.localContactId) : null,
        };
      });

      return {
        exxasCustomer,
        customerSuggestions,
        suggestedCustomerAction,
        suggestedLocalCustomerId: targetLocalCustomerId,
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
      asString(exxasCustomer.email).toLowerCase(),
      overwriteSet,
      "email"
    );
    const patch = {
      // Wenn EXXAS keine E-Mail hat, bestehende (ggf. synthetische) Adresse behalten
      // damit kein leerer String einen customers_email_key-Konflikt auslöst
      email: isBlank(resolvedEmail) ? (existing.email || "") : resolvedEmail,
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
    if (raw) return asString(raw.kt_email).toLowerCase();
    return asString(c.email || c.kt_email).toLowerCase();
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
   * customers.email ist NOT NULL UNIQUE: bei fehlender EXXAS-Kundenmail Kontakte nutzen,
   * sonst fuer Firmen synthetische Adresse (wie bestehende Firma-Platzhalter).
   */
  function resolveEmailForNewCustomerFromExxas(exxasCustomer, contactDecisions) {
    let email = asString(exxasCustomer.email).toLowerCase();
    if (!email) email = firstEmailFromContactDecisions(contactDecisions);
    if (!email && isExxasCompanyCustomer(exxasCustomer)) {
      const id = asString(exxasCustomer.exxasCustomerId || exxasCustomer.id);
      if (id) email = `exxas-${id}@company.local`;
    }
    return email;
  }

  async function createCustomerFromExxas(p, exxasCustomer, resolvedEmail) {
    const email = asString(resolvedEmail).toLowerCase();
    if (!email) throw new Error("EXXAS_KUNDE_EMAIL_FEHLT");

    const existingByEmail = await p.query("SELECT id FROM customers WHERE LOWER(email)=LOWER($1) LIMIT 1", [email]);
    if (existingByEmail.rows[0]) {
      const existingId = Number(existingByEmail.rows[0].id);
      await fillMissingCustomerFields(p, existingId, exxasCustomer);
      return existingId;
    }

    const zip = asString(exxasCustomer.zip);
    const city = asString(exxasCustomer.city);
    const zipcity = zip && city ? `${zip} ${city}` : "";

    const insert = await p.query(
      `INSERT INTO customers (
         email, name, company, phone, phone_2, phone_mobile, street, address_addon_1, zipcity,
         salutation, first_name, zip, city, country, website, notes, exxas_customer_id, exxas_address_id
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,
         $10,$11,$12,$13,$14,$15,$16,$17,$18
       )
       RETURNING id`,
      [
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
      ]
    );
    return Number(insert.rows[0].id);
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
    const displayName =
      [asString(exxasContact.firstName), asString(exxasContact.lastName)].filter(Boolean).join(" ") ||
      asString(exxasContact.name) ||
      asString(exxasContact.email);
    const email = asString(exxasContact.email).toLowerCase();
    const existingLinkedContact = await findContactByExxasId(p, exxasContact.id, null);
    if (existingLinkedContact) {
      if (Number(existingLinkedContact.customer_id) !== Number(customerId)) {
        throw new Error(buildExxasContactConflictMessage(existingLinkedContact, customerId));
      }
      await fillMissingContactFields(p, Number(existingLinkedContact.id), exxasContact);
      return Number(existingLinkedContact.id);
    }
    await ensureNoDuplicateContact(p, customerId, email, displayName, null);
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

  async function ensureCompanyForContactSync(customerId) {
    const cid = Number(customerId);
    if (!Number.isFinite(cid)) return null;
    const { rows } = await db.query(`SELECT id, company FROM customers WHERE id = $1 LIMIT 1`, [cid]);
    const customer = rows[0];
    if (!customer) return null;
    const companyName = asString(customer.company);
    if (!companyName) return null;
    let company = await db.ensureCompanyByName(companyName, { billingCustomerId: cid });
    if (!company) return null;
    if (company.billing_customer_id == null) {
      try {
        await db.query(
          `UPDATE companies
           SET billing_customer_id = $2, updated_at = NOW()
           WHERE id = $1 AND billing_customer_id IS NULL`,
          [Number(company.id), cid]
        );
        company = await db.getCompanyById(Number(company.id));
      } catch (_e) {}
    }
    return company;
  }

  async function loadContactRowForSync(contactId) {
    const cid = Number(contactId);
    if (!Number.isFinite(cid)) return null;
    const { rows } = await db.query(
      `SELECT id, customer_id, name, role, phone, email, sort_order, created_at,
              phone AS phone_direct, salutation, first_name, last_name, phone_mobile, department, exxas_contact_id
       FROM customer_contacts
       WHERE id = $1
       LIMIT 1`,
      [cid]
    );
    return rows[0] || null;
  }

  async function disableCustomerContactCompanyMember(customerId, email) {
    const cid = Number(customerId);
    const normalizedEmail = asString(email).toLowerCase();
    if (!Number.isFinite(cid) || !normalizedEmail || !normalizedEmail.includes("@")) return;
    const { rows } = await db.query(`SELECT company FROM customers WHERE id = $1 LIMIT 1`, [cid]);
    const companyName = asString(rows[0]?.company);
    if (!companyName) return;
    const company = await db.findCompanyByName(companyName);
    if (!company?.id) return;
    const member = await db.findCompanyMemberByCompanyAndEmail(Number(company.id), normalizedEmail);
    if (!member?.id) return;
    try {
      await logtoOrgSync.removeCompanyMemberFromLogtoOrg(Number(company.id), member);
    } catch (_e) {}
    try {
      await db.updateCompanyMemberStatus(Number(member.id), "disabled");
    } catch (_e) {}
  }

  async function syncCustomerContactToCompanyMember(customerId, contactRow) {
    const cid = Number(customerId);
    const email = asString(contactRow?.email).toLowerCase();
    if (!Number.isFinite(cid) || !email || !email.includes("@")) return null;
    const company = await ensureCompanyForContactSync(cid);
    if (!company?.id) return null;
    const member = await db.upsertCompanyMember({
      companyId: Number(company.id),
      customerId: cid,
      email,
      role: db.mapCustomerContactRoleToCompanyMemberRole(contactRow?.role),
      status: "active",
    });
    try {
      await logtoOrgSync.ensureOrganizationForCompany(company);
      await logtoOrgSync.addCompanyMemberToLogtoOrg(Number(company.id), member);
    } catch (_e) {}
    try {
      if (member?.id) await rbac.syncCompanyMemberRolesFromDb(Number(member.id));
    } catch (_e) {}
    return member;
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
        const postCommitContactSyncJobs = [];

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
          if (req.companyId && Number.isFinite(targetCustomerId)) {
            await db.upsertCompanyMember({
              companyId: req.companyId,
              customerId: targetCustomerId,
              email: asString(resolvedCustomerEmail),
              role: "company_employee",
              status: "active",
            });
          }
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
            const previousEmail = asString(contactRow.rows[0].email).toLowerCase();
            await fillMissingContactFields(p, localContactId, exxasContact, overwriteFields);
            postCommitContactSyncJobs.push({
              contactId: localContactId,
              customerId: Number(targetCustomerId),
              previousEmail,
            });
            contactOutcomes.push({ ok: true, exxasContactId: exxasContact.id, localContactId });
            continue;
          }

          if (contactAction === "create_contact") {
            const localContactId = await createContactFromExxas(p, Number(targetCustomerId), exxasContact);
            postCommitContactSyncJobs.push({
              contactId: localContactId,
              customerId: Number(targetCustomerId),
              previousEmail: "",
            });
            contactOutcomes.push({ ok: true, exxasContactId: exxasContact.id, localContactId });
            continue;
          }

          throw new Error(`Ungueltige contact action: ${contactAction}`);
        }

        await p.query("COMMIT");
        for (const job of postCommitContactSyncJobs) {
          try {
            const syncedRow = await loadContactRowForSync(job.contactId);
            if (!syncedRow) continue;
            const nextEmail = asString(syncedRow.email).toLowerCase();
            if (job.previousEmail && job.previousEmail.includes("@") && job.previousEmail !== nextEmail) {
              await disableCustomerContactCompanyMember(job.customerId, job.previousEmail);
            }
            await syncCustomerContactToCompanyMember(job.customerId, syncedRow);
          } catch (_syncErr) {}
        }
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

