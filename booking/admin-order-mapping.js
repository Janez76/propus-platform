"use strict";

function text(value) {
  return String(value || "").trim();
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildBillingZipcity(data) {
  const explicit = text(data.billingZipcity);
  if (explicit) return explicit;
  return [text(data.billingZip), text(data.billingCity)].filter(Boolean).join(" ").trim();
}

function toNullableNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeAddon(addon) {
  return {
    id: text(addon?.id),
    label: text(addon?.label),
    price: num(addon?.price),
    group: text(addon?.group),
    qty: toNullableNumber(addon?.qty),
  };
}

function normalizeAddonList(addons) {
  return Array.isArray(addons)
    ? addons
        .map(normalizeAddon)
        .filter((entry) => entry.id || entry.label || entry.price || entry.group || entry.qty)
    : [];
}

function classifyAddonBucket(addon) {
  const id = text(addon?.id).toLowerCase();
  const group = text(addon?.group).toLowerCase();
  if (id.includes("express") || group === "express") return "option";
  if (id.includes("keypickup") || group === "keypickup") return "option";
  if (
    id.startsWith("camera:") ||
    id.startsWith("cam:") ||
    id.startsWith("dronephoto:") ||
    group === "camera" ||
    group === "dronephoto"
  ) {
    return "primary";
  }
  return "additional";
}

function buildCompany(data) {
  return {
    id: toNullableNumber(data.companyId),
    name: text(data.company),
  };
}

function buildInternalContact(data) {
  return {
    id: toNullableNumber(data.selectedInternalContactId ?? data.contactId),
    name: text(data.customerName),
    firstName: text(data.customerFirstName),
    lastName: text(data.customerLastName),
    email: text(data.customerEmail),
    phone: text(data.customerPhone),
    role: text(data.customerRole),
  };
}

function buildOnsiteContact(data) {
  return {
    id: toNullableNumber(data.selectedOnsiteContactId),
    name: text(data.onsiteName),
    phone: text(data.onsitePhone),
    email: text(data.onsiteEmail),
    role: text(data.onsiteRole),
  };
}

function buildBillingAddress(data) {
  return {
    company: text(data.company),
    salutation: text(data.billingSalutation ?? data.salutation),
    firstName: text(data.billingFirstName ?? data.first_name),
    lastName: text(data.customerName),
    street: text(data.billingStreet ?? data.street),
    zip: text(data.billingZip ?? data.zip),
    city: text(data.billingCity ?? data.city),
    zipcity: buildBillingZipcity(data),
    notes: text(data.notes),
  };
}

function buildObjectAddress(data) {
  return {
    text: text(data.address),
    street: text(data.street),
    houseNumber: text(data.houseNumber),
    zip: text(data.zip),
    city: text(data.city),
    zipcity: text(data.zipcity),
    coords:
      data.coords && typeof data.coords === "object"
        ? {
            lat: num(data.coords.lat),
            lon: num(data.coords.lon ?? data.coords.lng),
          }
        : null,
  };
}

function buildServiceBuckets(data, addons) {
  const primary = [];
  const additional = [];
  const options = {
    express24: false,
    keyPickup:
      data.keyPickup && text(data.keyPickup.address)
        ? { enabled: true, address: text(data.keyPickup.address), notes: text(data.keyPickup.notes) }
        : null,
  };
  for (const addon of addons) {
    const bucket = classifyAddonBucket(addon);
    if (bucket === "option") {
      if (addon.id.toLowerCase().includes("express")) options.express24 = true;
      if (addon.id.toLowerCase().includes("keypickup")) {
        options.keyPickup = options.keyPickup || { enabled: true, address: "", notes: "" };
      }
      continue;
    }
    const target = bucket === "primary" ? primary : additional;
    target.push({
      key: addon.id,
      label: addon.label,
      price: addon.price,
      category: addon.group || (bucket === "primary" ? "primary" : "additional"),
      quantity: addon.qty || undefined,
    });
  }
  return { primary, additional, options };
}

function buildTargetModel(data, servicesInput) {
  const addons = normalizeAddonList(servicesInput?.addons);
  const packageData =
    servicesInput?.package && (text(servicesInput.package.key) || text(servicesInput.package.label))
      ? {
          key: text(servicesInput.package.key),
          label: text(servicesInput.package.label),
          price: num(servicesInput.package.price),
        }
      : null;
  const serviceBuckets = buildServiceBuckets(data, addons);
  return {
    company: buildCompany(data),
    internalContact: buildInternalContact(data),
    onsiteContact: buildOnsiteContact(data),
    billingAddress: buildBillingAddress(data),
    objectAddress: buildObjectAddress(data),
    servicesModel: {
      package: packageData,
      primary: serviceBuckets.primary,
      additional: serviceBuckets.additional,
      options: serviceBuckets.options,
    },
    scheduleModel: {
      photographerKey: text(data.photographerKey),
      photographerName: text(data.photographerName),
      photographerEmail: text(data.photographerEmail),
    },
  };
}

function enrichOrderRecordModel(record) {
  const normalized = record && typeof record === "object" ? { ...record } : {};
  const billing = normalized.billing && typeof normalized.billing === "object" ? { ...normalized.billing } : {};
  const objectData = normalized.object && typeof normalized.object === "object" ? { ...normalized.object } : {};
  const services = normalized.services && typeof normalized.services === "object" ? { ...normalized.services } : {};
  const target = buildTargetModel(
    {
      company: normalized.company?.name ?? billing.company,
      companyId: normalized.company?.id,
      customerName: normalized.internalContact?.name ?? billing.name,
      customerFirstName: normalized.internalContact?.firstName,
      customerLastName: normalized.internalContact?.lastName,
      customerEmail: normalized.internalContact?.email ?? billing.email,
      customerPhone: normalized.internalContact?.phone ?? billing.phone,
      customerRole: normalized.internalContact?.role,
      selectedInternalContactId: normalized.internalContact?.id,
      onsiteName: normalized.onsiteContact?.name ?? billing.onsiteName,
      onsitePhone: normalized.onsiteContact?.phone ?? billing.onsitePhone,
      onsiteEmail: normalized.onsiteContact?.email ?? normalized.onsiteEmail ?? billing.onsiteEmail,
      onsiteRole: normalized.onsiteContact?.role,
      selectedOnsiteContactId: normalized.onsiteContact?.id,
      billingStreet: normalized.billingAddress?.street ?? billing.street,
      billingZip: normalized.billingAddress?.zip ?? billing.zip,
      billingCity: normalized.billingAddress?.city ?? billing.city,
      billingZipcity: normalized.billingAddress?.zipcity ?? billing.zipcity,
      billingSalutation: normalized.billingAddress?.salutation ?? billing.salutation,
      billingFirstName: normalized.billingAddress?.firstName ?? billing.first_name,
      notes: normalized.billingAddress?.notes ?? billing.notes,
      address: normalized.objectAddress?.text ?? normalized.address,
      street: normalized.objectAddress?.street ?? objectData.addressDetail?.street,
      houseNumber: normalized.objectAddress?.houseNumber ?? objectData.addressDetail?.houseNumber,
      zip: normalized.objectAddress?.zip ?? objectData.addressDetail?.zip,
      city: normalized.objectAddress?.city ?? objectData.addressDetail?.city,
      zipcity: normalized.objectAddress?.zipcity ?? objectData.addressDetail?.zipcity,
      coords: normalized.objectAddress?.coords ?? objectData.addressDetail?.coords ?? null,
      keyPickup: normalized.keyPickup,
      photographerKey: normalized.schedule?.photographerKey ?? normalized.photographer?.key,
      photographerName: normalized.schedule?.photographerName ?? normalized.photographer?.name,
      photographerEmail: normalized.schedule?.photographerEmail ?? normalized.photographer?.email,
    },
    services,
  );

  const enrichedServices = {
    ...services,
    package: target.servicesModel.package || services.package || {},
    addons: normalizeAddonList(services.addons || []),
    primary: target.servicesModel.primary,
    additional: target.servicesModel.additional,
    options: target.servicesModel.options,
  };

  const enrichedBilling = {
    ...billing,
    company: target.company.name || billing.company || "",
    name: target.internalContact.name || billing.name || "",
    email: target.internalContact.email || billing.email || "",
    phone: target.internalContact.phone || billing.phone || "",
    onsiteName: target.onsiteContact.name || billing.onsiteName || "",
    onsitePhone: target.onsiteContact.phone || billing.onsitePhone || "",
    street: target.billingAddress.street || billing.street || "",
    zip: target.billingAddress.zip || billing.zip || "",
    city: target.billingAddress.city || billing.city || "",
    zipcity: target.billingAddress.zipcity || billing.zipcity || "",
    notes: target.billingAddress.notes || billing.notes || "",
    companyProfile: target.company,
    internalContact: target.internalContact,
    onsiteContact: target.onsiteContact,
    billingAddress: target.billingAddress,
  };

  const enrichedObject = {
    ...objectData,
    addressDetail: target.objectAddress,
  };

  const enrichedSchedule = {
    ...(normalized.schedule && typeof normalized.schedule === "object" ? normalized.schedule : {}),
    photographerKey: target.scheduleModel.photographerKey || normalized.schedule?.photographerKey || normalized.photographer?.key || "",
    photographerName: target.scheduleModel.photographerName || normalized.schedule?.photographerName || normalized.photographer?.name || "",
    photographerEmail: target.scheduleModel.photographerEmail || normalized.schedule?.photographerEmail || normalized.photographer?.email || "",
  };

  const enrichedPricing = {
    ...(normalized.pricing && typeof normalized.pricing === "object" ? normalized.pricing : {}),
    discountCode:
      normalized.pricing?.discountCode ||
      normalized.discountCode ||
      "",
  };

  return {
    ...normalized,
    company: target.company,
    internalContact: target.internalContact,
    onsiteContact: target.onsiteContact,
    billingAddress: target.billingAddress,
    objectAddress: target.objectAddress,
    billing: enrichedBilling,
    object: enrichedObject,
    services: enrichedServices,
    schedule: enrichedSchedule,
    pricing: enrichedPricing,
  };
}

function validateAdminOrderPayload(data) {
  const errors = [];
  if (!text(data.customerName)) errors.push("customerName fehlt");
  if (!text(data.customerEmail)) errors.push("customerEmail fehlt");
  if (!text(data.billingStreet)) errors.push("billingStreet fehlt");
  if (text(data.street) && !text(data.billingStreet)) {
    errors.push("Verdacht: street statt billingStreet geliefert");
  }
  return errors;
}

function buildAdminOrderRecord(data, options = {}) {
  const orderNo = options.orderNo;
  const photographerKey = text(options.photographerKey).toLowerCase();
  const photographerName = text(options.photographerName);
  const photographerEmail = text(options.photographerEmail);
  const pricing = options.pricing || {};
  const createdAt = options.createdAt || new Date().toISOString();
  const servicesInput = {
    package: data.package,
    addons: normalizeAddonList(data.addons),
  };

  return enrichOrderRecordModel({
    orderNo,
    createdAt,
    status: "pending",
    source: "manual",
    address: text(data.address),
    object: {
      type: text(data.objectType),
      area: text(data.area),
      floors: num(data.floors, 1),
      rooms: text(data.rooms),
      desc: text(data.desc),
    },
    services: {
      package: servicesInput.package
        ? {
            key: text(servicesInput.package.key),
            label: text(servicesInput.package.label),
            price: num(servicesInput.package.price),
          }
        : {},
      addons: servicesInput.addons,
    },
    photographer: {
      key: photographerKey,
      name: photographerName,
      email: photographerEmail,
    },
    schedule: {
      date: text(data.date),
      time: text(data.time),
      durationMin: num(data.durationMin, 60) || 60,
    },
    billing: {
      company: text(data.company),
      salutation: text(data.billingSalutation ?? data.salutation),
      name: text(data.customerName),
      first_name: text(data.billingFirstName ?? data.customerFirstName),
      email: text(data.customerEmail),
      phone: text(data.customerPhone),
      phone_mobile: text(data.phoneMobile),
      onsiteName: text(data.onsiteName),
      onsitePhone: text(data.onsitePhone),
      street: text(data.billingStreet),
      zip: text(data.billingZip),
      city: text(data.billingCity),
      zipcity: buildBillingZipcity(data),
      notes: text(data.billingNotes ?? data.notes),
      ...(text(data.invoiceStreet) ? {
        invoiceCompany:    text(data.invoiceCompany),
        invoiceSalutation: text(data.invoiceSalutation),
        invoiceFirstName:  text(data.invoiceFirstName),
        invoiceName:       text(data.invoiceName),
        invoiceEmail:      text(data.invoiceEmail),
        invoicePhone:      text(data.invoicePhone),
        invoiceMobile:     text(data.invoiceMobile),
        invoiceStreet:     text(data.invoiceStreet),
        invoiceZip:        text(data.invoiceZip),
        invoiceCity:       text(data.invoiceCity),
      } : {}),
    },
    pricing: {
      subtotal: num(pricing.subtotal),
      discount: num(pricing.discount),
      vat: num(pricing.vat),
      total: num(pricing.total),
    },
    discountCode: text(data.discountCode),
    attendeeEmails: text(data.attendeeEmails),
    onsiteEmail: text(data.onsiteEmail),
    keyPickup: data.keyPickup && text(data.keyPickup.address) ? data.keyPickup : null,
    calendarCreated: false,
    officeCalendarCreated: false,
    photographerEventId: null,
    officeEventId: null,
    icsUid: null,
  });
}

module.exports = {
  buildAdminOrderRecord,
  enrichOrderRecordModel,
  validateAdminOrderPayload,
};
