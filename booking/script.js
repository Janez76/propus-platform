// ==============================
// Propus Booking App – app.js
// Fixes: Pakete starten zu, Produktkarten-Rahmen 100% korrekt, Staging-Qty
// nur bei aktiver Option sichtbar, Textareas non-resize (in CSS).
// ==============================

const totalSteps = 4;
const DURATION_BONUS_BY_CODE = {};

const state = {
  step: 1,

  // Schritt 1
  address: "",
  coords: null,
  parsedAddress: null, // { street, houseNumber, zip, city } – wird beim Auswählen eines Vorschlags gesetzt
  flags: {
    address: false,
    package: false,
    addons: false,
    object: false,
    photographer: false,
    datetime: false,
  },

  // Schritt 2
  package: { key: "", price: 0, label: "", labelKey: "" },
  addons: [], // [{id, group, label, labelKey, price}]
  object: { type: "", area: "", floors: 1, rooms: "", specials: "", desc: "", onsiteName: "", onsitePhone: "" },

  // Schritt 3
  photographer: { key:"", name: "" },
  date: null,
  time: null,
  availableSlots: [],
  slotPeriod: null,
  provisionalBooking: false,

  // Schritt 4
  billing: {
    salutation:"", first_name:"",
    company:"", company_email:"", company_phone:"",
    name:"", email:"", phone:"", phone_mobile:"",
    street:"", zip:"", city:"", zipcity:"",
    order_ref:"", notes:"",
    alt_company:"", alt_company_email:"", alt_company_phone:"",
    alt_street:"", alt_zip:"", alt_city:"", alt_zipcity:"",
    alt_salutation:"", alt_first_name:"", alt_name:"",
    alt_email:"", alt_phone:"", alt_phone_mobile:""
  },
  discount: { code:"", percent:0, amount:0 }
};

const DB_HINTS_PREF_KEY = "front.dbFieldHints.enabled";
const FRONT_DB_FIELD_MAP = {
  address: "address.text",
  type: "object.type",
  area: "object.area",
  floors: "object.floors",
  rooms: "object.rooms",
  specials: "object.specials",
  objDesc: "object.desc",
  onsiteName: "object.onsiteName",
  onsitePhone: "object.onsitePhone",
  shootDate: "schedule.date",
  billCompany: "billing.company",
  billCompanyEmail: "billing.company_email",
  billCompanyPhone: "billing.company_phone",
  billSalutation: "billing.salutation",
  billFirstName: "billing.first_name",
  billName: "billing.name",
  billEmail: "billing.email",
  billPhone: "billing.phone",
  billPhoneMobile: "billing.phone_mobile",
  billStreet: "billing.street",
  billZip: "billing.zip",
  billCity: "billing.city",
  billZipCity: "billing.zipcity",
  billOrderRef: "billing.order_ref",
  billNotes: "billing.notes",
  altBillCompany: "billing.alt_company",
  altBillCompanyEmail: "billing.alt_company_email",
  altBillCompanyPhone: "billing.alt_company_phone",
  altBillStreet: "billing.alt_street",
  altBillZip: "billing.alt_zip",
  altBillCity: "billing.alt_city",
  altBillSalutation: "billing.alt_salutation",
  altBillFirstName: "billing.alt_first_name",
  altBillName: "billing.alt_name",
  altBillEmail: "billing.alt_email",
  altBillPhone: "billing.alt_phone",
  altBillPhoneMobile: "billing.alt_phone_mobile",
  keyInfo: "keyPickup.address",
  discountCode: "discount.code",
  custLoginEmail: "customer.login.email",
  custRegEmail: "customer.register.email",
  custRegName: "customer.register.name",
  custRegPhone: "customer.register.phone",
  custForgotEmail: "customer.forgot.email",
};
let _publicConfigPromise = null;

// ---------- Helpers ----------
const qs  = (s, el = document) => el.querySelector(s);
const qsa = (s, el = document) => [...el.querySelectorAll(s)];
// Schweizer Währung: Auf 5 Rappen runden
const CHF = (n) => {
  const rounded = Math.round(n * 20) / 20; // Auf 0.05 runden
  return new Intl.NumberFormat("de-CH", { style:"currency", currency:"CHF", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(rounded);
};
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const debounce = (fn, wait=250) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait); }; };
const DYNAMIC_PRICES = { express24: 99, keypickup: 50 };
const parseZipCity = (value) => {
  const raw = String(value || "").trim();
  const m = raw.match(/^(\d{4,6})\s+(.+)$/);
  if (!m) return { zip: "", city: raw };
  return { zip: m[1].trim(), city: m[2].trim() };
};

const BOOKING_DRAFT_KEY = "bookingDraft.resume.v1";
const BOOKING_DRAFT_PENDING_KEY = "bookingDraft.resume.pending.v1";
const BOOKING_DRAFT_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const BOOKING_DRAFT_FIELD_IDS = [
  "address",
  "type",
  "area",
  "floors",
  "rooms",
  "specials",
  "objDesc",
  "onsiteName",
  "onsitePhone",
  "qty-stLiving",
  "qty-stBusiness",
  "qty-stRenov",
  "keyInfo",
  "shootDate",
  "billSalutation",
  "billFirstName",
  "billName",
  "billCompany",
  "billCompanyEmail",
  "billCompanyPhone",
  "billEmail",
  "billPhone",
  "billPhoneMobile",
  "billStreet",
  "billZip",
  "billCity",
  "billOrderRef",
  "billNotes",
  "altBillCompany",
  "altBillCompanyEmail",
  "altBillCompanyPhone",
  "altBillStreet",
  "altBillZip",
  "altBillCity",
  "altBillSalutation",
  "altBillFirstName",
  "altBillName",
  "altBillEmail",
  "altBillPhone",
  "altBillPhoneMobile",
  "discountCode",
];
const BOOKING_DRAFT_CHECKBOX_IDS = [
  "tourToggle",
  "fpTour",
  "fpNoTour",
  "fpSketch",
  "stLiving",
  "stBusiness",
  "stRenov",
  "keyPickupToggle",
  "express24",
  "diffBillAddr",
  "prefWish",
  "prefNoPref",
  "bookingProvisional",
];
const BOOKING_DRAFT_CHOICE_GROUPS = [
  "impression",
  "package",
  "cam",
  "dronePhoto",
  "groundVideo",
  "droneVideo",
  "photogChk",
];
let scheduleBookingDraftSave = () => {};

function deepCloneJson(value){
  try {
    return JSON.parse(JSON.stringify(value));
  } catch(_) {
    return null;
  }
}

function getCheckedValueForGroup(name){
  const checked = qsa(`input[name="${name}"]`).find((el)=>el.checked || el.dataset.checked === "true");
  return checked ? String(checked.value || "") : "";
}

function setCheckedValueForGroup(name, value){
  qsa(`input[name="${name}"]`).forEach((el)=>{
    const isChecked = !!value && String(el.value || "") === String(value);
    el.checked = isChecked;
    el.dataset.checked = isChecked ? "true" : "false";
  });
}

function collectBookingDraft(){
  const fields = {};
  BOOKING_DRAFT_FIELD_IDS.forEach((id)=>{
    const el = qs(`#${id}`);
    if(!el) return;
    fields[id] = "value" in el ? String(el.value ?? "") : "";
  });

  const checks = {};
  BOOKING_DRAFT_CHECKBOX_IDS.forEach((id)=>{
    const el = qs(`#${id}`);
    if(!el) return;
    checks[id] = !!el.checked;
  });

  const choices = {};
  BOOKING_DRAFT_CHOICE_GROUPS.forEach((name)=>{
    choices[name] = getCheckedValueForGroup(name);
  });

  const welcome = qs("#welcomeScreen");
  const mainContent = qs("#mainContent");
  const bookingStarted = !!((welcome && welcome.hidden) || (mainContent && !mainContent.hidden));

  return {
    version: 1,
    savedAt: Date.now(),
    bookingStarted,
    state: {
      step: Number(state.step || 1),
      address: state.address || "",
      coords: deepCloneJson(state.coords),
      parsedAddress: deepCloneJson(state.parsedAddress),
      flags: deepCloneJson(state.flags) || {},
      package: deepCloneJson(state.package) || {},
      addons: deepCloneJson(state.addons) || [],
      object: deepCloneJson(state.object) || {},
      photographer: deepCloneJson(state.photographer) || {},
      date: state.date || null,
      time: state.time || null,
      slotPeriod: state.slotPeriod || null,
      billing: deepCloneJson(state.billing) || {},
      discount: deepCloneJson(state.discount) || {},
      _wasAny: !!state._wasAny,
    },
    ui: { fields, checks, choices },
  };
}

function saveBookingDraft(){
  try {
    sessionStorage.setItem(BOOKING_DRAFT_KEY, JSON.stringify(collectBookingDraft()));
  } catch(_) {}
}

function clearBookingDraft({ keepPending = false } = {}){
  try {
    sessionStorage.removeItem(BOOKING_DRAFT_KEY);
    if(!keepPending) sessionStorage.removeItem(BOOKING_DRAFT_PENDING_KEY);
  } catch(_) {}
}

function markBookingDraftPendingForAuth(){
  saveBookingDraft();
  try {
    sessionStorage.setItem(BOOKING_DRAFT_PENDING_KEY, "1");
  } catch(_) {}
}

function readBookingDraftIfPending(){
  try {
    if(sessionStorage.getItem(BOOKING_DRAFT_PENDING_KEY) !== "1") return null;
    const raw = sessionStorage.getItem(BOOKING_DRAFT_KEY);
    if(!raw) return null;
    const parsed = JSON.parse(raw);
    if(!parsed || typeof parsed !== "object") return null;
    if((Date.now() - Number(parsed.savedAt || 0)) > BOOKING_DRAFT_MAX_AGE_MS) return null;
    return parsed;
  } catch(_) {
    return null;
  }
}

function applyDiffBillingAddressVisibility(){
  const diffCb = qs("#diffBillAddr");
  const altSection = qs("#billAltSection");
  const toggleIcon = qs("#billAltToggleIcon");
  const toggleRow = diffCb ? diffCb.closest(".bill-toggle-row") : null;
  if(!diffCb || !altSection) return;
  const show = !!diffCb.checked;
  altSection.hidden = !show;
  if(toggleIcon) toggleIcon.classList.toggle("on", show);
  if(toggleRow) toggleRow.setAttribute("aria-expanded", String(show));
  setRequired("#altBillCompany", show);
  setRequired("#altBillStreet", show);
  setRequired("#altBillZip", show);
  setRequired("#altBillCity", show);
  setRequired("#altBillName", show);
}

function setRequired(selector, required){
  const input = qs(selector);
  if(!input) return;
  input.required = !!required;
  input.setAttribute("aria-required", String(!!required));
}

function syncBillPhoneHint(){
  const phone = String(qs("#billPhone")?.value || "").trim();
  const mobile = String(qs("#billPhoneMobile")?.value || "").trim();
  const hint = qs("#billTelMobilHint");
  const invalid = !phone && !mobile;
  if(hint) hint.hidden = !invalid;
}

function initBillPhoneHintOnce(){
  const phone = qs("#billPhone");
  const mobile = qs("#billPhoneMobile");
  if(phone && phone.dataset.phoneHintInit !== "1"){
    phone.dataset.phoneHintInit = "1";
    phone.addEventListener("input", syncBillPhoneHint);
    phone.addEventListener("change", syncBillPhoneHint);
  }
  if(mobile && mobile.dataset.phoneHintInit !== "1"){
    mobile.dataset.phoneHintInit = "1";
    mobile.addEventListener("input", syncBillPhoneHint);
    mobile.addEventListener("change", syncBillPhoneHint);
  }
  syncBillPhoneHint();
}

function initDiffBillAddrToggleOnce(){
  const diffCb = qs("#diffBillAddr");
  const toggleRow = diffCb ? diffCb.closest(".bill-toggle-row") : null;
  if(!diffCb) return;
  if(diffCb.dataset.diffAddrInit === "1"){
    applyDiffBillingAddressVisibility();
    return;
  }
  diffCb.dataset.diffAddrInit = "1";
  diffCb.addEventListener("change", applyDiffBillingAddressVisibility);
  diffCb.addEventListener("input", applyDiffBillingAddressVisibility);
  if(toggleRow && toggleRow.dataset.toggleInit !== "1"){
    toggleRow.dataset.toggleInit = "1";
    toggleRow.addEventListener("click", (e) => {
      if(e.target === diffCb) return;
      e.preventDefault();
      diffCb.checked = !diffCb.checked;
      applyDiffBillingAddressVisibility();
      saveBookingDraft();
    });
    toggleRow.addEventListener("keydown", (e) => {
      if(e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      diffCb.checked = !diffCb.checked;
      applyDiffBillingAddressVisibility();
      saveBookingDraft();
    });
  }
  applyDiffBillingAddressVisibility();
  initBillPhoneHintOnce();
}

function applyKeyPickupVisibility(){
  const toggle = qs("#keyPickupToggle");
  const keyInfo = qs("#keyInfo");
  const keyForm = qs("#keyForm");
  if(!toggle) return;
  const enabled = !!toggle.checked;
  if(keyInfo) keyInfo.disabled = !enabled;
  if(keyForm) keyForm.setAttribute("aria-hidden", String(!enabled));
  syncOpenAccordionHeight(keyForm);
}

function applyPhotographerPreferenceVisibility(){
  const block = qs("#photogBlock");
  if(!block) return;
  block.hidden = !qs("#prefWish")?.checked;
}

function isProvisionalBookingChecked(){
  return !!qs("#bookingProvisional")?.checked;
}

function syncProvisionalBookingState(){
  state.provisionalBooking = isProvisionalBookingChecked();
}

async function restoreBookingDraftIfNeeded(onRestoreStarted){
  const draft = readBookingDraftIfPending();
  if(!draft) return false;

  try {
    onRestoreStarted?.(!!draft.bookingStarted);

    const draftState = draft.state || {};
    state.step = Math.max(1, Math.min(totalSteps, Number(draftState.step || 1)));
    state.address = String(draftState.address || "");
    state.coords = draftState.coords || null;
    state.parsedAddress = draftState.parsedAddress || null;
    state.flags = { ...state.flags, ...(draftState.flags || {}) };
    state.package = { ...state.package, ...(draftState.package || {}) };
    state.addons = Array.isArray(draftState.addons) ? draftState.addons : [];
    state.object = { ...state.object, ...(draftState.object || {}) };
    state.photographer = { ...state.photographer, ...(draftState.photographer || {}) };
    state.date = draftState.date || null;
    state.time = draftState.time || null;
    state.slotPeriod = draftState.slotPeriod || null;
    state.billing = { ...state.billing, ...(draftState.billing || {}) };
    state.discount = { ...state.discount, ...(draftState.discount || {}) };
    state._wasAny = !!draftState._wasAny;

    const fields = draft.ui?.fields || {};
    Object.entries(fields).forEach(([id, value])=>{
      const el = qs(`#${id}`);
      if(!el || !("value" in el)) return;
      el.value = String(value ?? "");
    });

    const checks = draft.ui?.checks || {};
    Object.entries(checks).forEach(([id, checked])=>{
      const el = qs(`#${id}`);
      if(!el) return;
      el.checked = !!checked;
    });

    const choices = draft.ui?.choices || {};
    Object.entries(choices).forEach(([name, value])=>{
      setCheckedValueForGroup(name, value);
    });

    syncProvisionalBookingState();
    applyDiffBillingAddressVisibility();
    applyKeyPickupVisibility();
    applyPhotographerPreferenceVisibility();

    updateTourUI();
    syncTour();
    updateFloorPlansUI();
    syncFloorPlans();
    syncStaging();
    updateExpressAvailability();
    syncExpress();
    onObjectChanged();

    const restoredDate = fields.shootDate || state.date || null;
    const restoredTime = draftState.time || null;
    const restoredPhotogChoice = choices.photogChk || "";
    const wantsAnyPhotog = !!checks.prefNoPref;

    if(restoredDate){
      const dateInput = qs("#shootDate");
      if(dateInput) dateInput.value = restoredDate;
      state.date = restoredDate;
      if(restoredPhotogChoice) {
        setCheckedValueForGroup("photogChk", restoredPhotogChoice);
      }
      await onDateOrPhotogChanged();
      if(restoredTime && Array.isArray(state.availableSlots) && state.availableSlots.includes(restoredTime)){
        state.slotPeriod = getSlotPeriod(restoredTime);
        renderSlots();
        state.time = restoredTime;
        state.flags.datetime = !!(state.date && state.time);
        if(wantsAnyPhotog) state._wasAny = true;
      }
    }

    refreshProductCardStyles();
    renderSummary();
    updateNextBtnStep2();
    updateNextBtnStep3();

    if(state.step >= 1){
      goToStep(state.step);
    }

    if(state.coords && Number.isFinite(Number(state.coords.lat))){
      const lng = Number(state.coords.lng ?? state.coords.lon);
      const lat = Number(state.coords.lat);
      if(Number.isFinite(lat) && Number.isFinite(lng)){
        setTimeout(()=>{
          try { placeMarkerStep1(lat, lng); } catch(_) {}
        }, 500);
      }
    }

    try {
      sessionStorage.removeItem(BOOKING_DRAFT_PENDING_KEY);
    } catch(_) {}
    saveBookingDraft();
    return true;
  } catch(_) {
    clearBookingDraft();
    return false;
  }
}

function applyDynamicCatalog(catalog){
  const categories = Array.isArray(catalog?.categories) ? catalog.categories : [];
  const packages = Array.isArray(catalog?.packages) ? catalog.packages : [];
  const addons = Array.isArray(catalog?.addons) ? catalog.addons : [];
  const products = Array.isArray(catalog?.products) ? catalog.products : [];
  const productByCode = new Map(products.map((p) => [String(p?.code || ""), p]));
  const packageByKey = new Map(packages.map((p) => [String(p?.key || ""), p]));
  const addonById = new Map(addons.map((a) => [String(a.id || ""), a]));
  const groupByInputName = {
    cam: "camera",
    dronePhoto: "dronePhoto",
    groundVideo: "groundVideo",
    droneVideo: "droneVideo",
  };
  const codeByInputId = {
    tourToggle: "tour:main",
    keyPickupToggle: "keypickup:main",
    fpTour: "floorplans:tour",
    fpNoTour: "floorplans:notour",
    fpSketch: "floorplans:sketch",
    stLiving: "staging:stLiving",
    stBusiness: "staging:stBusiness",
    stRenov: "staging:stRenov",
    express24: "express:24h",
  };
  const getCatalogCodeForInput = (inp) => {
    if (!inp) return "";
    if (inp.name === "impression") return String(inp.value || "").trim();
    if (groupByInputName[inp.name]) {
      return `${groupByInputName[inp.name]}:${String(inp.value || "").trim()}`;
    }
    return codeByInputId[inp.id] || "";
  };
  const setCardSortOrder = (inp, product) => {
    const sortOrder = Number(product?.sort_order || 0);
    inp.dataset.sortOrder = String(sortOrder);
    const card = inp.closest(".highlight-card, .product-card");
    if (card) card.dataset.sortOrder = String(sortOrder);
  };
  const setCardVisibleState = (inp, isVisible) => {
    const card = inp.closest(".highlight-card, .product-card");
    if (card) card.hidden = !isVisible;
    if (!isVisible) {
      if (inp.checked) inp.checked = false;
      inp.disabled = true;
      return;
    }
    inp.disabled = false;
  };
  const setCardNameAndPrice = (inp, product, packageMeta, addonMeta) => {
    const card = inp.closest(".highlight-card, .product-card");
    if (!card) return;
    const titleEl = qs(".highlight-title, .product-title", card);
    if (titleEl && product?.name) titleEl.textContent = String(product.name);
    if (packageMeta && Number.isFinite(Number(packageMeta.price))) {
      const priceEl = qs(".highlight-price, .product-price", card);
      if (priceEl) priceEl.textContent = `${Number(packageMeta.price || 0)} CHF`;
      return;
    }
    if (!addonMeta) return;
    const priceEl = qs(".product-price", card);
    if (!priceEl) return;
    if (addonMeta.pricingType === "per_floor" && Number.isFinite(Number(addonMeta.unitPrice))) {
      priceEl.textContent = `${Number(addonMeta.unitPrice || 0)} CHF / Etage`;
      return;
    }
    if (addonMeta.pricingType === "per_room" && Number.isFinite(Number(addonMeta.unitPrice))) {
      priceEl.textContent = `${Number(addonMeta.unitPrice || 0)} CHF / Einheit`;
      return;
    }
    if (Number.isFinite(Number(addonMeta.price))) {
      const prefix = inp.id === "express24" || inp.id === "keyPickupToggle" ? "+ " : "";
      priceEl.textContent = `${prefix}${Number(addonMeta.price || 0)} CHF`;
    }
  };
  const reorderItemsBySortOrder = (container, itemSelector) => {
    if (!container) return;
    const items = qsa(itemSelector, container);
    if (!items.length) return;
    const sorted = items
      .map((item, idx) => {
        const input = qs("input", item);
        const sortOrder = Number(input?.dataset.sortOrder || item.dataset.sortOrder || 999999);
        return { item, sortOrder, idx };
      })
      .sort((a, b) => (a.sortOrder - b.sortOrder) || (a.idx - b.idx));
    sorted.forEach(({ item }) => container.appendChild(item));
  };
  const legacyStaticCategoryKeys = new Set(["package", "camera", "dronePhoto", "tour", "keypickup", "floorplans", "groundVideo", "droneVideo", "staging", "express"]);
  const renderPriceText = (addonMeta) => {
    if (!addonMeta) return "";
    if (addonMeta.pricingType === "per_floor" && Number.isFinite(Number(addonMeta.unitPrice))) return `${Number(addonMeta.unitPrice || 0)} CHF / Etage`;
    if (addonMeta.pricingType === "per_room" && Number.isFinite(Number(addonMeta.unitPrice))) return `${Number(addonMeta.unitPrice || 0)} CHF / Einheit`;
    if (addonMeta.pricingType === "byArea") return String(addonMeta.pricingNote || `${Number(addonMeta.price || 0)} CHF`);
    return `${Number(addonMeta.price || 0)} CHF`;
  };
  const bindDynamicCatalogInputs = () => {
    qsa('#dynamicCatalogCategories input[data-dynamic-catalog="true"]').forEach((inp) => {
      if (inp.dataset.bound === "true") return;
      inp.dataset.bound = "true";
      inp.addEventListener("change", () => {
        const code = String(inp.dataset.code || inp.value || "").trim();
        const group = String(inp.dataset.group || inp.name || "").trim();
        const label = String(inp.dataset.label || code);
        const price = Number(inp.dataset.price || 0);
        if (!code || !group) return;
        if (inp.type === "radio") {
          if (!inp.checked) return;
          removeGroup(group);
          upsertAddon(code, group, label, price, inp.dataset.i18nLabel || "");
        } else if (inp.checked) {
          upsertAddon(code, group, label, price, inp.dataset.i18nLabel || "");
        } else {
          const existing = state.addons.find((a) => a.id === code);
          if (existing) upsertAddon(code, group, label, 0, inp.dataset.i18nLabel || "");
        }
        updateExpressAvailability();
        renderSummary();
        updateNextBtnStep2();
        refreshProductCardStyles();
      });
    });
  };
  const renderDynamicAddonCategories = () => {
    const wrap = qs("#dynamicCatalogCategories");
    if (!wrap) return;
    wrap.innerHTML = "";
    const categoryByKey = new Map(categories.map((c) => [String(c?.key || ""), c]));
    const dynamicCategories = categories
      .filter((c) => c?.active !== false)
      .filter((c) => {
        const scope = String(c?.kind_scope || "addon");
        return scope === "addon" || scope === "both";
      })
      .filter((c) => !legacyStaticCategoryKeys.has(String(c?.key || "")))
      .sort((a, b) => (Number(a?.sort_order || 0) - Number(b?.sort_order || 0)) || String(a?.name || "").localeCompare(String(b?.name || ""), "de"));

    dynamicCategories.forEach((cat) => {
      const catKey = String(cat?.key || "");
      const groupName = `dyn:${catKey}`;
      const addonsForCategory = products
        .filter((p) => p?.kind === "addon")
        .filter((p) => p?.active !== false)
        .filter((p) => String(p?.category_key || p?.group_key || "") === catKey)
        .sort((a, b) => (Number(a?.sort_order || 0) - Number(b?.sort_order || 0)) || String(a?.name || "").localeCompare(String(b?.name || ""), "de"));
      if (!addonsForCategory.length) return;

      const accItem = document.createElement("div");
      accItem.className = "acc-item";
      const accHeader = document.createElement("button");
      accHeader.className = "acc-header";
      accHeader.type = "button";
      accHeader.setAttribute("aria-expanded", "false");
      accHeader.innerHTML = `<span class="acc-sign" aria-hidden="true"></span><span class="acc-title">${String(cat?.name || catKey)}</span>`;
      const panelId = `dyn-cat-${catKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
      accHeader.setAttribute("aria-controls", panelId);

      const panel = document.createElement("div");
      panel.id = panelId;
      panel.className = "acc-panel";
      panel.setAttribute("role", "region");
      const body = document.createElement("div");
      body.className = "acc-body";
      const grid = document.createElement("div");
      grid.className = "product-grid";

      addonsForCategory.forEach((p) => {
        const code = String(p?.code || "");
        const addonMeta = addonById.get(code);
        const firstRule = (Array.isArray(p?.rules) ? p.rules : []).find((r) => r?.active !== false) || null;
        const meta = firstRule?.config_json && typeof firstRule.config_json === "object" && firstRule.config_json.meta && typeof firstRule.config_json.meta === "object"
          ? firstRule.config_json.meta
          : {};
        const selectionMode = String(meta.selectionMode || "").toLowerCase();
        const inputType = selectionMode === "radio" ? "radio" : "checkbox";
        const label = document.createElement("label");
        label.className = "product-card";
        const input = document.createElement("input");
        input.type = inputType;
        input.name = groupName;
        input.value = code;
        input.dataset.dynamicCatalog = "true";
        input.dataset.code = code;
        input.dataset.group = groupName;
        input.dataset.label = String(addonMeta?.label || p?.name || code);
        if (Number.isFinite(Number(addonMeta?.price))) input.dataset.price = String(Number(addonMeta.price || 0));
        const productBody = document.createElement("div");
        productBody.className = "product-body";
        const productTitle = document.createElement("div");
        productTitle.className = "product-title";
        productTitle.textContent = String(p?.name || code);
        const productPrice = document.createElement("div");
        productPrice.className = "product-price";
        productPrice.textContent = renderPriceText(addonMeta);
        productBody.appendChild(productTitle);
        productBody.appendChild(productPrice);
        label.appendChild(input);
        label.appendChild(productBody);
        grid.appendChild(label);
      });

      body.appendChild(grid);
      panel.appendChild(body);
      accItem.appendChild(accHeader);
      accItem.appendChild(panel);
      wrap.appendChild(accItem);
    });

    wrap.hidden = wrap.children.length === 0;
    if (!wrap.hidden) initAccordion(wrap);
    bindDynamicCatalogInputs();
  };
  const syncStaticAccordionVisibility = () => {
    qsa("#step-2 .accordion")
      .filter((acc) => acc.id !== "dynamicCatalogCategories")
      .forEach((acc) => {
        qsa(".acc-item", acc).forEach((item) => {
          const visibleCards = qsa(".product-card", item).filter((card) => !card.hidden);
          item.hidden = visibleCards.length === 0;
        });
      });
  };

  Object.keys(DURATION_BONUS_BY_CODE).forEach((k) => delete DURATION_BONUS_BY_CODE[k]);
  products.forEach((p) => {
    const code = String(p?.code || "");
    if (!code) return;
    if (p?.affects_duration) {
      DURATION_BONUS_BY_CODE[code] = Number(p?.duration_minutes || 0);
    }
  });

  qsa('input[name="impression"],input[name="cam"],input[name="dronePhoto"],input[name="groundVideo"],input[name="droneVideo"],#tourToggle,#keyPickupToggle,#fpTour,#fpNoTour,#fpSketch,#stLiving,#stBusiness,#stRenov,#express24')
    .forEach((inp) => {
      const code = getCatalogCodeForInput(inp);
      if (!code) return;
      const product = productByCode.get(code);
      if (!product) {
        setCardVisibleState(inp, false);
        return;
      }

      // Defensive Frontend-Filterung: auch ausblenden, falls ein inaktives Produkt
      // wider Erwarten im Katalog-Response enthalten ist.
      const isProductActive = product?.active !== false;
      setCardVisibleState(inp, isProductActive);
      if (!isProductActive) return;
      setCardSortOrder(inp, product);

      const packageMeta = packageByKey.get(code);
      const addonMeta = addonById.get(code);

      if (packageMeta && Number.isFinite(Number(packageMeta.price))) {
        inp.dataset.price = String(Number(packageMeta.price || 0));
      } else if (addonMeta && Number.isFinite(Number(addonMeta.price))) {
        inp.dataset.price = String(Number(addonMeta.price || 0));
      }

      const label = String(packageMeta?.label || addonMeta?.label || product?.name || inp.dataset.label || code);
      inp.dataset.label = label;
      setCardNameAndPrice(inp, product, packageMeta, addonMeta);
    });

  // Reihenfolge aus Admin-Panel (sort_order) in den Buchungskacheln anwenden.
  reorderItemsBySortOrder(qs(".highlight-packages"), ".highlight-card");
  qsa(".accordion .product-grid").forEach((grid) => reorderItemsBySortOrder(grid, ".product-card"));
  reorderItemsBySortOrder(qs(".staging-grid"), ".staging-item");
  renderDynamicAddonCategories();
  syncStaticAccordionVisibility();

  const fpTour = addonById.get("floorplans:tour");
  const fpNoTour = addonById.get("floorplans:notour");
  const fpSketch = addonById.get("floorplans:sketch");
  if (fpTour && Number.isFinite(Number(fpTour.unitPrice))) qs("#fpTour")?.setAttribute("data-unitprice", String(Number(fpTour.unitPrice || 0)));
  if (fpNoTour && Number.isFinite(Number(fpNoTour.unitPrice))) qs("#fpNoTour")?.setAttribute("data-unitprice", String(Number(fpNoTour.unitPrice || 0)));
  if (fpSketch && Number.isFinite(Number(fpSketch.unitPrice))) qs("#fpSketch")?.setAttribute("data-unitprice", String(Number(fpSketch.unitPrice || 0)));

  const stLiving = addonById.get("staging:stLiving");
  const stBusiness = addonById.get("staging:stBusiness");
  const stRenov = addonById.get("staging:stRenov");
  if (stLiving && Number.isFinite(Number(stLiving.unitPrice))) qs("#stLiving")?.setAttribute("data-price", String(Number(stLiving.unitPrice || 0)));
  if (stBusiness && Number.isFinite(Number(stBusiness.unitPrice))) qs("#stBusiness")?.setAttribute("data-price", String(Number(stBusiness.unitPrice || 0)));
  if (stRenov && Number.isFinite(Number(stRenov.unitPrice))) qs("#stRenov")?.setAttribute("data-price", String(Number(stRenov.unitPrice || 0)));

  const express = addonById.get("express:24h");
  if (express && Number.isFinite(Number(express.price))) {
    DYNAMIC_PRICES.express24 = Number(express.price || 0);
    qs("#express24")?.setAttribute("data-price", String(DYNAMIC_PRICES.express24));
  }
  const keypickup = addonById.get("keypickup:main");
  if (keypickup && Number.isFinite(Number(keypickup.price))) {
    DYNAMIC_PRICES.keypickup = Number(keypickup.price || 0);
    qs("#keyPickupToggle")?.setAttribute("data-price", String(DYNAMIC_PRICES.keypickup));
  }
  try { refreshProductCardStyles(); } catch (_) {}
  try { renderSummary(); } catch (_) {}
  try { updateNextBtnStep2(); } catch (_) {}
}

/** Muss mit admin-panel `PUBLIC_CATALOG_BROADCAST_CHANNEL` übereinstimmen. */
const PUBLIC_CATALOG_BROADCAST = "propus-public-catalog-v1";
/** Muss mit admin-panel `PUBLIC_CATALOG_BROADCAST_STORAGE_KEY` übereinstimmen. */
const PUBLIC_CATALOG_BROADCAST_STORAGE_KEY = "propus-public-catalog-v1:invalidate-at";

let _catalogReloadTimer = null;
function scheduleLoadDynamicCatalog() {
  if (_catalogReloadTimer) window.clearTimeout(_catalogReloadTimer);
  _catalogReloadTimer = window.setTimeout(() => {
    _catalogReloadTimer = null;
    loadDynamicCatalog();
  }, 400);
}

function initPublicCatalogAutoRefresh() {
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const ch = new BroadcastChannel(PUBLIC_CATALOG_BROADCAST);
      ch.onmessage = (ev) => {
        if (ev && ev.data && ev.data.type === "invalidate") scheduleLoadDynamicCatalog();
      };
    }
  } catch (_) {}

  window.addEventListener("storage", (ev) => {
    if (!ev || ev.key !== PUBLIC_CATALOG_BROADCAST_STORAGE_KEY) return;
    scheduleLoadDynamicCatalog();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") scheduleLoadDynamicCatalog();
  });
  window.addEventListener("focus", () => scheduleLoadDynamicCatalog());

  window.setInterval(() => {
    if (document.visibilityState === "visible") scheduleLoadDynamicCatalog();
  }, 20000);
}

async function loadDynamicCatalog(){
  try {
    const res = await fetch(`${API_BASE}/api/catalog/products`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return;
    const data = await res.json();
    applyDynamicCatalog(data);
  } catch (_) {}
}

function fetchPublicConfig(){
  if(_publicConfigPromise) return _publicConfigPromise;
  const base = API_BASE || location.origin;
  _publicConfigPromise = fetch(`${base}/api/config`, { headers: { Accept: "application/json" } })
    .then((r)=>r.json())
    .catch(()=>({ ok: false }));
  return _publicConfigPromise;
}

function applyFrontDbFieldMetadata(){
  Object.entries(FRONT_DB_FIELD_MAP).forEach(([id, dbField])=>{
    const el = qs(`#${id}`);
    if(!el) return;
    el.dataset.dbBound = "true";
    el.dataset.dbField = dbField;
  });

  qsa('input[name="impression"]').forEach((el)=>{ el.dataset.dbBound = "true"; el.dataset.dbField = "services.package"; });
  qsa('input[name="cam"],input[name="dronePhoto"],input[name="groundVideo"],input[name="droneVideo"]').forEach((el)=>{
    el.dataset.dbBound = "true";
    el.dataset.dbField = "services.addons";
  });
  qsa("#tourToggle,#fpTour,#fpNoTour,#fpSketch,#stLiving,#stBusiness,#stRenov,#express24,#keyPickupToggle").forEach((el)=>{
    el.dataset.dbBound = "true";
    el.dataset.dbField = "services.addons";
  });
}

function clearDbFieldHints(){
  qsa(".db-field-hint").forEach((el)=>el.remove());
}

function renderDbFieldHints(enabled){
  clearDbFieldHints();
  if(!enabled) return;
  qsa('[data-db-bound="true"]').forEach((el)=>{
    const dbField = (el.dataset.dbField || "").trim();
    if(!dbField) return;
    const text = `(${dbField})`;
    const field = el.closest(".field");
    if(field){
      const hint = document.createElement("div");
      hint.className = "db-field-hint";
      hint.textContent = text;
      field.appendChild(hint);
      return;
    }
    const card = el.closest(".product-card, .highlight-card, .pref, .checkbox-label");
    if(card){
      const hint = document.createElement("span");
      hint.className = "db-field-hint db-field-hint-inline";
      hint.textContent = text;
      card.appendChild(hint);
    }
  });
}

function initDbHintsToggle(){
  const toggle = qs("#dbHintsToggle");
  const wrap = qs("#dbHintsToggleWrap");
  if(!toggle || !wrap) return;
  const apply = (enabled)=>{
    document.documentElement.classList.toggle("db-field-hints-enabled", !!enabled);
    renderDbFieldHints(!!enabled);
  };
  fetchPublicConfig().then((cfg)=>{
    const serverDefault = !!cfg?.dbFieldHintsEnabled;
    wrap.style.display = serverDefault ? "" : "none";
    const saved = localStorage.getItem(DB_HINTS_PREF_KEY);
    const enabled = saved == null ? serverDefault : saved === "1";
    toggle.checked = enabled;
    apply(enabled);
  });
  toggle.addEventListener("change", ()=>{
    const enabled = !!toggle.checked;
    localStorage.setItem(DB_HINTS_PREF_KEY, enabled ? "1" : "0");
    apply(enabled);
  });
}

function initProvisionalBoxVisibility(){
  const box = qs("#provisionalBox");
  if(!box) return;
  box.hidden = true;
  fetchPublicConfig().then((cfg)=>{
    const enabled = !!cfg?.provisionalBookingEnabled;
    box.hidden = !enabled;
    if(!enabled){
      const cb = qs("#bookingProvisional");
      if(cb) cb.checked = false;
      state.provisionalBooking = false;
    }
  }).catch(()=>{ box.hidden = true; });
}

// ==============================
// i18n (DE / EN / FR / IT)
// - ALLES wird übersetzt (inkl. Produkte/Optionen)
// ==============================
const I18N = {
  de: {
    step_1_label: "Standort",
    step_2_label: "Dienstleistungen",
    step_3_label: "Fotograf & Termin",
    step_4_label: "Rechnungsdetails",
    step_1_title: "1. Standort",
    step_1_sub: "Bitte gib Adresse und Objektinfos an.",
    object_legend: "Objekt",
    label_address: "Adresse",
    ph_address: "Strasse Hausnummer, PLZ Ort",
    label_object_type: "Objektart",
    opt_choose: "– bitte wählen –",
    objtype_apartment: "Wohnung",
    objtype_single_house: "Einfamilienhaus",
    objtype_multi_house: "Mehrfamilienhaus",
    objtype_commercial: "Gewerbe",
    objtype_land: "Grundstück",
    label_area: "Wohn-/Nutzfläche (m²)",
    ph_area: "z. B. 120",
    label_floors: "Etagen/Ebene",
    unit_floors: "Etage(n)",
    label_rooms: "Zimmer",
    unit_rooms: "Zimmer",
    ph_rooms: "z. B. 4.5",
    label_specials: "Besonderheiten",
    ph_specials: "z. B. Garten, Dachterrasse …",
    label_desc: "Beschreibung",
    ph_desc: "Kurzbeschreibung des Objekts (Lage, Zustand, Highlights) …",
    btn_next: "Weiter",
    btn_back: "Zurück",
    step_2_title: "2. Dienstleistungen",
    step_2_sub: "Wähle ein Paket oder stelle dir dein Shooting modular zusammen.",
    badge_best: "AM BELIEBTESTEN",
    badge_best_l1: "AM",
    badge_best_l2: "BELIEBTESTEN",
    pkg_cinematic_title: "CINEMATIC DUO",
    pkg_cinematic_sub: "TWO ANGLES. ONE STORY",
    pkg_bestseller_title: "BESTSELLER",
    pkg_fullview_title: "THE FULL VIEW",
    pkg_fullview_sub: "EVERY ANGLE EVERY DETAIL",
    cat_camera: "Bodenfotos",
    cat_drone: "Luftaufnahmen",
    cat_tour: "360° Tour",
    cat_floorplans: "Grundriss",
    cat_ground_video: "Bodenvideo",
    cat_drone_video: "Drohnenvideo",
    cat_staging: "Staging",
    cat_key_pickup: "Schlüsselabholung",
    express_title: "Expresslieferung innerhalb von 24 h",
    express_sub: "Nur für Bodenfotos/Luftaufnahmen, 360° Tour & Grundriss",
    provisional_title: "Termin provisorisch buchen",
    provisional_sub: "Der Termin wird vorläufig reserviert. Wir kontaktieren dich zur Bestätigung.",
    notice_cam_delivery_36: "Lieferung der Medien innert 36h nach Bilderauswahl",
    notice_drone_delivery_36: "Lieferung der Medien innert 36h nach Bilderauswahl",
    notice_tour: "Preis wird automatisch nach m² berechnet / Lieferung der Medien innert 36h",
    notice_floorplans: "Preis wird automatisch nach Ebene berechnet / Lieferung der Medien innert 72h",
    notice_ground_video: "Innen- und Aussenaufnahmen im Preis inklusive / Lieferung der Medien innert 72h",
    notice_drone_video: "Lieferung der Medien innert 72h",
    notice_staging: "Lieferung der Medien innert 72h nach Bilderauswahl",
    prod_express_24h: "Express 24 h",
    feat_photo10: "10 Bodenfotos",
    feat_drone4: "4 Luftaufnahmen",
    feat_hdr: "HDR bearbeitet",
    feat_web_full: "Web-Fullsize Formaten",
    feat_delivery_48: "Medienlieferung in 48H",
    feat_orientation: "Hoch- oder Querformat",
    feat_4k: "4K Auflösung",
    feat_clip_1_2: "1–2 Minuten Clip",
    feat_ground_air_combo: "Kombination aus Boden / Luftaufnahme",
    feat_edit_music: "Dynamischer Schnitt & Musik",
    feat_delivery_72: "Medienlieferung in 72H",
    feat_tour_199: "360° Tour bis 199 m²",
    prod_cam_10: "Bodenfotos · 10 Fotos",
    prod_cam_20: "Bodenfotos · 20 Fotos",
    prod_cam_30: "Bodenfotos · 30 Fotos",
    prod_drone_photo_4: "Luftaufnahmen · 4 Fotos",
    prod_drone_photo_8: "Luftaufnahmen · 8 Fotos",
    prod_drone_photo_12: "Luftaufnahmen · 12 Fotos",
    prod_tour_360: "360° Tour",
    prod_fp_from_tour: "2D Plan von Tour",
    prod_fp_no_tour: "2D Plan ohne Tour",
    prod_fp_from_sketch: "2D Plan nach Skizze",
    prod_ground_reel_30: "Bodenvideo · Reel 30 Sek",
    prod_ground_clip_1_2: "Bodenvideo · Clip 1–2 Min",
    prod_drone_video_reel_30: "Drohnenvideo · Reel 30 Sek",
    prod_drone_video_clip_1_2: "Drohnenvideo · Clip 1–2 Min",
    prod_staging_living: "Staging – Wohnbereich",
    prod_staging_commercial: "Staging – Gewerbe",
    prod_staging_renov: "Staging – Renovation",
    prod_key_pickup: "Schlüsselabholung",
    label_qty: "Menge",
    unit_item: "Einheit",
    label_rooms_notes: "Räumlichkeiten & Hinweise",
    ph_rooms_notes: "z. B. Wohnzimmer, Küche, Eingangsbereich …",
    label_pickup_info: "Hinweis",
    ph_pickup_info: "Wo und wie kann der Schlüssel abgeholt werden? z.B. Adresse, beim Empfang, Hausmeister, Code …",
    step_3_title: "3. Fotograf & Termin",
    step_3_sub: "Wähle deine Präferenz, dann Datum & Uhrzeit.",
    pref_wish: "Ich möchte einen Wunschfotografin wählen",
    pref_no_pref: "Kein Wunsch – egal wer",
    label_date: "Datum",
    ph_date: "TT.MM.JJJJ",
    date_min_notice: "Buchung frühestens 24h im Voraus möglich.",
    slot_hint_default: "Bitte Präferenz und Datum wählen.",
    slot_period_am: "Vormittag",
    slot_period_pm: "Nachmittag",
    step_4_title: "4. Rechnungsdetails",
    step_4_sub: "Bitte füllen Sie die Rechnungs- und Kontaktangaben aus.",
    label_company: "Firma",
    ph_company: "Firmenname (optional)",
    ph_company_required: "Firmenname",
    msg_bill_company_required: "Bitte geben Sie den Firmennamen ein.",
    label_salutation: "Anrede",
    opt_salutation_company: "Firma",
    opt_salutation_mr: "Herr",
    opt_salutation_ms: "Frau",
    label_first_name: "Vorname",
    ph_first_name: "Max",
    label_name: "Name",
    ph_name: "Muster",
    label_email: "E-Mail",
    ph_email: "name@example.ch",
    label_phone: "Telefon",
    label_phone_mobile: "Mobil",
    ph_phone: "+41 ...",
    ph_phone_mobile: "+41 79 ...",
    label_diff_billing_address: "Abweichende Rechnungsadresse",
    label_onsite_name: "Vor-Ort-Name",
    ph_onsite_name: "Name (optional)",
    label_onsite_phone: "Vor-Ort-Telefon",
    onsite_contact_hint: "Wichtig: Bitte hinterlegen Sie eine Kontaktperson, die am Shooting-Tag telefonisch erreichbar ist, falls kurzfristige Rückfragen oder Notfälle auftreten.",
    label_billing_address: "Rechnungsadresse",
    ph_street: "Strasse, Nr.",
    label_zip_city: "PLZ & Ort",
    ph_zip_city: "8000 Zürich",
    label_zip: "PLZ",
    label_city: "Ort",
    label_notes: "Hinweise",
    ph_billing_notes: "Bemerkungen zur Rechnung oder Durchführung …",
    notice_label: "Hinweis:",
    notice_pauschale: "Anfahrtspauschale werden in Rechnung zusätzlich verechnet. Weitere Infos auf",
    notice_zones: "unten Kategorie Zonen.",
    btn_finish: "Buchung abschliessen",
    btn_sending: "Wird gesendet…",
    thank_you_title: "Danke für deine Buchung!",
    thank_you_sub: "Wir freuen uns, dass du dich für uns entschieden hast.",
    thank_you_title_provisional: "Dein Termin wurde provisorisch reserviert!",
    thank_you_sub_provisional: "Wir haben deinen Termin vorlaeufig reserviert. Du erhältst in Kürze die weiteren Details per E-Mail.",
    thank_you_status_provisional: "PROVISORISCH",
    thank_you_print_title_provisional: "Provisorische Buchungsbestätigung",
    thank_you_print_intro_provisional: "Vielen Dank für Ihre Buchung! Ihr Termin wurde provisorisch reserviert. Sie erhalten in Kürze die weiteren Details per E-Mail.",
    summary_title: "Ihre Auswahl",
    sum_address: "Adresse",
    sum_services: "Dienstleistungen",
    sum_object: "Objekt",
    sum_photographer: "Fotograf:in",
    sum_datetime: "Termin",
    sum_provisional_suffix: " (provisorisch)",
    sum_subtotal: "Zwischensumme",
    sum_discount: "Rabatt",
    sum_vat: "MwSt. (8.1%)",
    sum_total: "Total",
    label_discount_code: "Rabattcode",
    ph_discount_code: "Code eingeben",
    msg_discount_invalid: "Ungültiger Rabattcode.",
    msg_discount_expired: "Rabattcode ist abgelaufen.",
    btn_apply: "Anwenden",
    summary_auto_update: "Änderungen werden automatisch übernommen.",
    msg_tour_required: "Sie müssen dazu eine 360° Tour buchen, um den 2D Plan von Tour zu wählen.",
    msg_address_required: "Bitte Adresse eingeben oder aus Vorschlägen wählen.",
    msg_address_house_required: "Bitte Hausnummer in der Adresse angeben.",
    msg_no_address_with_housenumber: "Keine vollständige Adresse gefunden (Hausnummer erforderlich).",
    msg_address_city_required: "Bitte PLZ oder Ort in der Adresse angeben.",
    msg_type_required: "Bitte Objektart wählen.",
    msg_area_required: "Bitte eine gültige Fläche in m² angeben.",
    msg_floors_required: "Bitte Anzahl Etagen/Ebene angeben (mindestens 1).",
    msg_desc_required: "Bitte eine kurze Objekt-Beschreibung eingeben.",
    msg_service_required: "Bitte mindestens ein Paket oder eine Zusatzleistung wählen.",
    msg_datetime_required: "Bitte Präferenz, Datum und Uhrzeit wählen.",
    msg_bill_name_required: "Bitte Name angeben.",
    msg_bill_email_invalid: "Bitte gültige E-Mail angeben.",
    msg_bill_phone_required: "Bitte Telefonnummer angeben.",
    msg_bill_street_required: "Bitte Rechnungsadresse angeben.",
    msg_bill_zipcity_required: "Bitte PLZ & Ort angeben.",
    msg_step3_required: "Bitte in Schritt 3 Präferenz, Datum und Uhrzeit wählen.",
    msg_address_confirmed: "Adresse bestätigt.",
    msg_address_updated: "Adresse übernommen",
    msg_address_on_map: "Adresse auf Karte angezeigt",
    msg_address_loading: "Adresse wird geladen …",
    msg_map_blocked: "Kartenserver blockiert. Bitte Netzwerk/Adblocker prüfen.",
    msg_map_init_error: "Karte konnte nicht initialisiert werden:",
    msg_map_unavailable: "Karte nicht verfügbar.",
    status_pending: "Ausstehend",
    status_provisional: "Provisorisch",
    status_paused: "Pausiert",
    status_confirmed: "Übernommen",
    status_completed: "Erledigt",
    status_done: "Abgeschlossen",
    status_cancelled: "Abgesagt",
    status_archived: "Archiviert",
    msg_leaflet_error: "Karte konnte nicht geladen werden (Internet/Blocker prüfen).",
    msg_express_unavailable: "Express ist für diese Bestellung nicht verfügbar",
    msg_no_results: "Keine Treffer.",
    msg_search_unavailable: "Suche derzeit nicht verfügbar.",
    msg_address_search_unavailable: "Adresssuche nicht verfügbar. Bitte Adresse manuell eingeben.",
    slot_hint_photog_date: "Bitte Fotograf:in wählen und Datum setzen.",
    slot_hint_date: "Bitte Datum wählen.",
    aria_remove: "Entfernen",
    search_loading: "Suche",
    slot_no_available: "Kein Slot verfügbar. Anderes Datum wählen.",
    slot_select_time: "Wählen Sie eine Uhrzeit:",
    wish_skill_warning_title: "Hinweis zur Skill-Eignung",
    wish_skill_warning_missing: "Beim gewählten Wunschfotografen fehlen diese benötigten Skills (Level 0):",
    wish_skill_recommendation: "Unsere Empfehlung:",
    wish_skill_recommendation_none: "Aktuell wurde kein passender Alternativ-Fotograf gefunden.",
    wish_skill_use_recommended: "Empfehlung übernehmen",
    skill_label_foto: "Foto",
    skill_label_matterport: "Matterport",
    skill_label_drohne: "Drohne",
    skill_label_drohne_foto: "Drohne Foto",
    skill_label_drohne_video: "Drohne Video",
    skill_label_video: "Video",
    btn_sent: "Gesendet",
    msg_booking_success: "Buchung erfolgreich übermittelt.",
    msg_booking_thanks: "Vielen Dank! Wir haben Ihre Buchung erhalten.",
    btn_upload_material: "Daten hochladen",
    account_btn_login: "Anmelden",
    account_btn_portal: "Portal",
  },
  en: {
    step_1_label: "Location",
    step_2_label: "Services",
    step_3_label: "Photographer & Time",
    step_4_label: "Billing details",
    step_1_title: "1. Location",
    step_1_sub: "Please enter the address and property details.",
    object_legend: "Property",
    label_address: "Address",
    ph_address: "Street number, ZIP city",
    label_object_type: "Property type",
    opt_choose: "– please choose –",
    objtype_apartment: "Apartment",
    objtype_single_house: "Single-family house",
    objtype_multi_house: "Multi-family house",
    objtype_commercial: "Commercial",
    objtype_land: "Land plot",
    label_area: "Living/usable area (m²)",
    ph_area: "e.g. 120",
    label_floors: "Floors",
    unit_floors: "floor(s)",
    label_rooms: "Rooms",
    unit_rooms: "rooms",
    ph_rooms: "e.g. 4.5",
    label_specials: "Special features",
    ph_specials: "e.g. garden, roof terrace …",
    label_desc: "Description",
    ph_desc: "Short description of the property (location, condition, highlights) …",
    btn_next: "Next",
    btn_back: "Back",
    step_2_title: "2. Services",
    step_2_sub: "Choose a package or build your shoot modularly.",
    badge_best: "MOST POPULAR",
    badge_best_l1: "MOST",
    badge_best_l2: "POPULAR",
    pkg_cinematic_title: "CINEMATIC DUO",
    pkg_cinematic_sub: "TWO ANGLES. ONE STORY",
    pkg_bestseller_title: "BESTSELLER",
    pkg_fullview_title: "THE FULL VIEW",
    pkg_fullview_sub: "EVERY ANGLE EVERY DETAIL",
    cat_camera: "Ground Photos",
    cat_drone: "Aerial Photos",
    cat_tour: "360° Tour",
    cat_floorplans: "Floor Plans",
    cat_ground_video: "Ground Video",
    cat_drone_video: "Drone Video",
    cat_staging: "Staging",
    cat_key_pickup: "Key pickup",
    express_title: "Express delivery within 24h",
    express_sub: "Only for Ground/Aerial Photos, 360° Tour & Floor Plans",
    provisional_title: "Book appointment provisionally",
    provisional_sub: "The appointment will be reserved temporarily. We will contact you to confirm.",
    notice_cam_delivery_36: "Delivery within 36h after photo selection",
    notice_drone_delivery_36: "Delivery within 36h after photo selection",
    notice_tour: "Price is calculated automatically per m² / Delivery within 36h",
    notice_floorplans: "Price is calculated automatically per floor / Delivery within 72h",
    notice_ground_video: "Interior and exterior shots included / Delivery within 72h",
    notice_drone_video: "Delivery within 72h",
    notice_staging: "Delivery within 72h after photo selection",
    prod_express_24h: "Express 24h",
    feat_photo10: "10 ground photos",
    feat_drone4: "4 aerial photos",
    feat_hdr: "HDR edited",
    feat_web_full: "Web full-size formats",
    feat_delivery_48: "Delivery within 48h",
    feat_orientation: "Portrait or landscape format",
    feat_4k: "4K resolution",
    feat_clip_1_2: "1–2 minute clip",
    feat_ground_air_combo: "Combination of ground / aerial shots",
    feat_edit_music: "Dynamic edit & music",
    feat_delivery_72: "Delivery within 72h",
    feat_tour_199: "360° tour up to 199 m²",
    prod_cam_10: "Ground photos · 10 photos",
    prod_cam_20: "Ground photos · 20 photos",
    prod_cam_30: "Ground photos · 30 photos",
    prod_drone_photo_4: "Aerial photos · 4 photos",
    prod_drone_photo_8: "Aerial photos · 8 photos",
    prod_drone_photo_12: "Aerial photos · 12 photos",
    prod_tour_360: "360° tour",
    prod_fp_from_tour: "2D plan from tour",
    prod_fp_no_tour: "2D plan without tour",
    prod_fp_from_sketch: "2D plan from sketch",
    prod_ground_reel_30: "Ground video · Reel 30 sec",
    prod_ground_clip_1_2: "Ground video · Clip 1–2 min",
    prod_drone_video_reel_30: "Drone video · Reel 30 sec",
    prod_drone_video_clip_1_2: "Drone video · Clip 1–2 min",
    prod_staging_living: "Staging – Living area",
    prod_staging_commercial: "Staging – Commercial",
    prod_staging_renov: "Staging – Renovation",
    prod_key_pickup: "Key pickup",
    label_qty: "Quantity",
    unit_item: "unit",
    label_rooms_notes: "Rooms & notes",
    ph_rooms_notes: "e.g. living room, kitchen, entrance …",
    label_pickup_info: "Note",
    ph_pickup_info: "Where and how can the key be collected? e.g. address, reception, caretaker, code …",
    step_3_title: "3. Photographer & Time",
    step_3_sub: "Choose your preference, then date & time.",
    pref_wish: "I would like to choose a preferred photographer",
    pref_no_pref: "No preference – anyone is fine",
    label_date: "Date",
    ph_date: "DD.MM.YYYY",
    date_min_notice: "Bookings are available at least 24 hours in advance.",
    slot_hint_default: "Please choose preference and date.",
    slot_period_am: "Morning",
    slot_period_pm: "Afternoon",
    step_4_title: "4. Billing details",
    step_4_sub: "Please fill in the billing and contact information.",
    label_company: "Company",
    ph_company: "Company name (optional)",
    ph_company_required: "Company name",
    msg_bill_company_required: "Please enter the company name.",
    label_salutation: "Salutation",
    opt_salutation_company: "Company",
    opt_salutation_mr: "Mr.",
    opt_salutation_ms: "Ms.",
    label_first_name: "First name",
    ph_first_name: "Max",
    label_name: "Name",
    ph_name: "Muster",
    label_email: "Email",
    ph_email: "name@example.ch",
    label_phone: "Phone",
    label_phone_mobile: "Mobile",
    ph_phone: "+41 ...",
    ph_phone_mobile: "+41 79 ...",
    label_diff_billing_address: "Different billing address",
    label_onsite_name: "On-site name",
    ph_onsite_name: "Name (optional)",
    label_onsite_phone: "On-site phone",
    onsite_contact_hint: "Important: Please provide a contact person who can be reached by phone on the shooting day in case of short-notice questions or emergencies.",
    label_billing_address: "Billing address",
    ph_street: "Street, No.",
    label_zip_city: "ZIP & City",
    ph_zip_city: "8000 Zürich",
    label_zip: "ZIP",
    label_city: "City",
    label_notes: "Notes",
    ph_billing_notes: "Comments regarding billing or execution …",
    notice_label: "Note:",
    notice_pauschale: "Travel surcharges will be billed additionally. More info at",
    notice_zones: "below category Zones.",
    btn_finish: "Complete booking",
    btn_sending: "Sending…",
    thank_you_title: "Thank you for your booking!",
    thank_you_sub: "We’re happy you chose us.",
    thank_you_title_provisional: "Your appointment has been reserved provisionally!",
    thank_you_sub_provisional: "We have reserved your appointment temporarily. You will receive the next details by email shortly.",
    thank_you_status_provisional: "PROVISIONAL",
    thank_you_print_title_provisional: "Provisional booking confirmation",
    thank_you_print_intro_provisional: "Thank you for your booking! Your appointment has been reserved provisionally. You will receive the next details by email shortly.",
    summary_title: "Your selection",
    sum_address: "Address",
    sum_services: "Services",
    sum_object: "Property",
    sum_photographer: "Photographer",
    sum_datetime: "Appointment",
    sum_provisional_suffix: " (provisional)",
    sum_subtotal: "Subtotal",
    sum_discount: "Discount",
    sum_vat: "VAT (8.1%)",
    sum_total: "Total",
    label_discount_code: "Discount code",
    ph_discount_code: "Enter code",
    msg_discount_invalid: "Invalid discount code.",
    msg_discount_expired: "Discount code has expired.",
    btn_apply: "Apply",
    summary_auto_update: "Changes are automatically applied.",
    msg_tour_required: "You must book a 360° tour to select the 2D floor plan from tour.",
    msg_address_required: "Please enter an address or select from suggestions.",
    msg_address_house_required: "Please include a house number in the address.",
    msg_no_address_with_housenumber: "No complete address found (house number required).",
    msg_address_city_required: "Please include ZIP or city in the address.",
    msg_type_required: "Please select property type.",
    msg_area_required: "Please enter a valid area in m².",
    msg_floors_required: "Please enter number of floors (at least 1).",
    msg_desc_required: "Please enter a short property description.",
    msg_service_required: "Please select at least one package or additional service.",
    msg_datetime_required: "Please select preference, date and time.",
    msg_bill_name_required: "Please enter your name.",
    msg_bill_email_invalid: "Please enter a valid email.",
    msg_bill_phone_required: "Please enter your phone number.",
    msg_bill_street_required: "Please enter your billing address.",
    msg_bill_zipcity_required: "Please enter ZIP & city.",
    msg_step3_required: "Please select preference, date and time in step 3.",
    msg_address_confirmed: "Address confirmed.",
    msg_address_updated: "Address updated",
    msg_address_on_map: "Address shown on map",
    msg_address_loading: "Loading address …",
    msg_map_blocked: "Map server blocked. Please check network/adblocker.",
    msg_map_init_error: "Map could not be initialized:",
    msg_map_unavailable: "Map unavailable.",
    status_pending: "Pending",
    status_provisional: "Provisional",
    status_paused: "Paused",
    status_confirmed: "Confirmed",
    status_completed: "Completed",
    status_done: "Completed",
    status_cancelled: "Cancelled",
    status_archived: "Archived",
    msg_leaflet_error: "Leaflet could not be loaded (check internet/blocker).",
    msg_express_unavailable: "Express is not available for this order",
    msg_no_results: "No results.",
    msg_search_unavailable: "Search currently unavailable.",
    msg_address_search_unavailable: "Address search unavailable. Please enter address manually.",
    slot_hint_photog_date: "Please select photographer and date.",
    slot_hint_date: "Please select date.",
    aria_remove: "Remove",
    search_loading: "Searching",
    slot_no_available: "No slot available. Please choose another date.",
    slot_select_time: "Select a time:",
    wish_skill_warning_title: "Skill suitability notice",
    wish_skill_warning_missing: "The selected preferred photographer is missing required skills (level 0):",
    wish_skill_recommendation: "Our recommendation:",
    wish_skill_recommendation_none: "No suitable alternative photographer was found at the moment.",
    wish_skill_use_recommended: "Use recommendation",
    skill_label_foto: "Photo",
    skill_label_matterport: "Matterport",
    skill_label_drohne: "Drone",
    skill_label_drohne_foto: "Drone photo",
    skill_label_drohne_video: "Drone video",
    skill_label_video: "Video",
    btn_sent: "Sent",
    msg_booking_success: "Booking successfully submitted.",
    msg_booking_thanks: "Thank you! We have received your booking.",
    btn_upload_material: "Upload data",
    account_btn_login: "Login",
    account_btn_portal: "Portal",
  },
  fr: {
    step_1_label: "Lieu",
    step_2_label: "Services",
    step_3_label: "Photographe & horaire",
    step_4_label: "Facturation",
    step_1_title: "1. Lieu",
    step_1_sub: "Veuillez saisir l’adresse et les informations du bien.",
    object_legend: "Bien",
    label_address: "Adresse",
    ph_address: "Rue numéro, NPA ville",
    label_object_type: "Type de bien",
    opt_choose: "– veuillez choisir –",
    objtype_apartment: "Appartement",
    objtype_single_house: "Maison individuelle",
    objtype_multi_house: "Immeuble (plusieurs logements)",
    objtype_commercial: "Commercial",
    objtype_land: "Terrain",
    label_area: "Surface habitable/utile (m²)",
    ph_area: "p. ex. 120",
    label_floors: "Étages",
    unit_floors: "étage(s)",
    label_rooms: "Pièces",
    unit_rooms: "pièces",
    ph_rooms: "p. ex. 4.5",
    label_specials: "Particularités",
    ph_specials: "p. ex. jardin, terrasse …",
    label_desc: "Description",
    ph_desc: "Brève description du bien (situation, état, points forts) …",
    btn_next: "Suivant",
    btn_back: "Retour",
    step_2_title: "2. Services",
    step_2_sub: "Choisissez un pack ou composez votre shooting.",
    badge_best: "LE PLUS POPULAIRE",
    badge_best_l1: "LE PLUS",
    badge_best_l2: "POPULAIRE",
    pkg_cinematic_title: "CINEMATIC DUO",
    pkg_cinematic_sub: "TWO ANGLES. ONE STORY",
    pkg_bestseller_title: "BESTSELLER",
    pkg_fullview_title: "THE FULL VIEW",
    pkg_fullview_sub: "EVERY ANGLE EVERY DETAIL",
    cat_camera: "Photos au sol",
    cat_drone: "Photos aériennes",
    cat_tour: "Visite 360°",
    cat_floorplans: "Plans",
    cat_ground_video: "Vidéo au sol",
    cat_drone_video: "Vidéo drone",
    cat_staging: "Staging",
    cat_key_pickup: "Collecte des clés",
    express_title: "Livraison express en 24 h",
    express_sub: "Uniquement pour photos au sol/aériennes, visite 360° & plans",
    provisional_title: "Réserver le rendez-vous provisoirement",
    provisional_sub: "Le rendez-vous sera réservé à titre provisoire. Nous vous contacterons pour confirmation.",
    notice_cam_delivery_36: "Livraison des médias sous 36 h après la sélection des photos",
    notice_drone_delivery_36: "Livraison des médias sous 36 h après la sélection des photos",
    notice_tour: "Prix calculé automatiquement au m² / Livraison des médias sous 36 h",
    notice_floorplans: "Prix calculé automatiquement par niveau / Livraison des médias sous 72 h",
    notice_ground_video: "Prises de vue intérieures et extérieures incluses / Livraison des médias sous 72 h",
    notice_drone_video: "Livraison des médias sous 72 h",
    notice_staging: "Livraison des médias sous 72 h après la sélection des photos",
    prod_express_24h: "Express 24 h",
    feat_photo10: "10 photos au sol",
    feat_drone4: "4 photos aériennes",
    feat_hdr: "Retouchées HDR",
    feat_web_full: "Formats web full-size",
    feat_delivery_48: "Livraison en 48 h",
    feat_orientation: "Format portrait ou paysage",
    feat_4k: "Résolution 4K",
    feat_clip_1_2: "Clip de 1–2 minutes",
    feat_ground_air_combo: "Combinaison sol / aérien",
    feat_edit_music: "Montage dynamique & musique",
    feat_delivery_72: "Livraison en 72 h",
    feat_tour_199: "Visite 360° jusqu’à 199 m²",
    prod_cam_10: "Photos au sol · 10 photos",
    prod_cam_20: "Photos au sol · 20 photos",
    prod_cam_30: "Photos au sol · 30 photos",
    prod_drone_photo_4: "Photos aériennes · 4 photos",
    prod_drone_photo_8: "Photos aériennes · 8 photos",
    prod_drone_photo_12: "Photos aériennes · 12 photos",
    prod_tour_360: "Visite 360°",
    prod_fp_from_tour: "Plan 2D depuis la visite",
    prod_fp_no_tour: "Plan 2D sans visite",
    prod_fp_from_sketch: "Plan 2D à partir d’un croquis",
    prod_ground_reel_30: "Vidéo au sol · Reel 30 s",
    prod_ground_clip_1_2: "Vidéo au sol · Clip 1–2 min",
    prod_drone_video_reel_30: "Vidéo drone · Reel 30 s",
    prod_drone_video_clip_1_2: "Vidéo drone · Clip 1–2 min",
    prod_staging_living: "Staging – Salon",
    prod_staging_commercial: "Staging – Commercial",
    prod_staging_renov: "Staging – Rénovation",
    prod_key_pickup: "Collecte des clés",
    label_qty: "Quantité",
    unit_item: "unité",
    label_rooms_notes: "Pièces & remarques",
    ph_rooms_notes: "p. ex. salon, cuisine, entrée …",
    label_pickup_info: "Note",
    ph_pickup_info: "Où et comment la clé peut-elle être récupérée? p. ex. adresse, réception, concierge, code …",
    step_3_title: "3. Photographe & horaire",
    step_3_sub: "Choisissez votre préférence, puis date & heure.",
    pref_wish: "Je souhaite choisir un photographe préféré",
    pref_no_pref: "Aucune préférence – n'importe qui",
    label_date: "Date",
    ph_date: "JJ.MM.AAAA",
    date_min_notice: "Les réservations sont possibles au minimum 24 h à l’avance.",
    slot_hint_default: "Veuillez choisir la préférence et la date.",
    slot_period_am: "Matin",
    slot_period_pm: "Après-midi",
    step_4_title: "4. Facturation",
    step_4_sub: "Veuillez remplir les informations de facturation et de contact.",
    label_company: "Entreprise",
    ph_company: "Nom de l'entreprise (optionnel)",
    ph_company_required: "Nom de l'entreprise",
    msg_bill_company_required: "Veuillez saisir le nom de l'entreprise.",
    label_salutation: "Civilité",
    opt_salutation_company: "Entreprise",
    opt_salutation_mr: "Monsieur",
    opt_salutation_ms: "Madame",
    label_first_name: "Prénom",
    ph_first_name: "Max",
    label_name: "Nom",
    ph_name: "Muster",
    label_email: "E‘mail",
    ph_email: "nom@example.ch",
    label_phone: "Téléphone",
    label_phone_mobile: "Mobile",
    ph_phone: "+41 ...",
    ph_phone_mobile: "+41 79 ...",
    label_diff_billing_address: "Adresse de facturation différente",
    label_onsite_name: "Nom sur place",
    ph_onsite_name: "Nom (optionnel)",
    label_onsite_phone: "Téléphone sur place",
    onsite_contact_hint: "Important : veuillez indiquer une personne de contact joignable par téléphone le jour du shooting en cas de questions de dernière minute ou d’urgence.",
    label_billing_address: "Adresse de facturation",
    ph_street: "Rue, N°",
    label_zip_city: "NPA & Ville",
    ph_zip_city: "8000 Zürich",
    label_zip: "NPA",
    label_city: "Ville",
    label_notes: "Remarques",
    ph_billing_notes: "Commentaires concernant la facturation ou l'exécution …",
    notice_label: "Remarque :",
    notice_pauschale: "Les frais de déplacement seront facturés en supplément. Plus d'infos sur",
    notice_zones: "ci-dessous catégorie Zones.",
    btn_finish: "Finaliser la réservation",
    btn_sending: "Envoi en cours…",
    thank_you_title: "Merci pour votre réservation !",
    thank_you_sub: "Nous sommes ravis que vous nous ayez choisis.",
    thank_you_title_provisional: "Votre rendez-vous a été réservé provisoirement !",
    thank_you_sub_provisional: "Nous avons réservé votre rendez-vous à titre provisoire. Vous recevrez prochainement les détails par e-mail.",
    thank_you_status_provisional: "PROVISOIRE",
    thank_you_print_title_provisional: "Confirmation de réservation provisoire",
    thank_you_print_intro_provisional: "Merci pour votre réservation ! Votre rendez-vous a été réservé à titre provisoire. Vous recevrez prochainement les détails par e-mail.",
    summary_title: "Votre sélection",
    sum_address: "Adresse",
    sum_services: "Services",
    sum_object: "Bien",
    sum_photographer: "Photographe",
    sum_datetime: "Rendez-vous",
    sum_provisional_suffix: " (provisoire)",
    sum_subtotal: "Sous-total",
    sum_discount: "Remise",
    sum_vat: "TVA (8.1%)",
    sum_total: "Total",
    label_discount_code: "Code de réduction",
    ph_discount_code: "Entrer le code",
    msg_discount_invalid: "Code promo invalide.",
    msg_discount_expired: "Le code promo est expiré.",
    btn_apply: "Appliquer",
    summary_auto_update: "Les modifications sont appliquées automatiquement.",
    msg_tour_required: "Vous devez réserver une visite 360° pour sélectionner le plan 2D de la visite.",
    msg_address_required: "Veuillez saisir une adresse ou sélectionner parmi les suggestions.",
    msg_address_house_required: "Veuillez indiquer un numéro de maison dans l’adresse.",
    msg_no_address_with_housenumber: "Aucune adresse suisse complète trouvée (numéro de maison requis).",
    msg_address_city_required: "Veuillez indiquer le NPA ou la ville dans l’adresse.",
    msg_type_required: "Veuillez sélectionner le type de bien.",
    msg_area_required: "Veuillez saisir une surface valide en m².",
    msg_floors_required: "Veuillez saisir le nombre d'étages (au moins 1).",
    msg_desc_required: "Veuillez saisir une brève description du bien.",
    msg_service_required: "Veuillez sélectionner au moins un pack ou un service supplémentaire.",
    msg_datetime_required: "Veuillez sélectionner la préférence, la date et l'heure.",
    msg_bill_name_required: "Veuillez saisir votre nom.",
    msg_bill_email_invalid: "Veuillez saisir un e-mail valide.",
    msg_bill_phone_required: "Veuillez saisir votre numéro de téléphone.",
    msg_bill_street_required: "Veuillez saisir l’adresse de facturation.",
    msg_bill_zipcity_required: "Veuillez saisir le NPA et la ville.",
    msg_step3_required: "Veuillez sélectionner la préférence, la date et l'heure à l’étape 3.",
    msg_address_confirmed: "Adresse confirmée.",
    msg_address_updated: "Adresse mise à jour",
    msg_address_on_map: "Adresse affichée sur la carte",
    msg_address_loading: "Chargement de l’adresse …",
    msg_map_blocked: "Serveur de carte bloqué. Veuillez vérifier le réseau/le bloqueur de publicités.",
    msg_map_init_error: "La carte n'a pas pu être initialisée :",
    msg_map_unavailable: "Carte indisponible.",
    status_pending: "En attente",
    status_provisional: "Provisoire",
    status_paused: "En pause",
    status_confirmed: "Confirmé",
    status_completed: "Terminé",
    status_done: "Terminé",
    status_cancelled: "Annulé",
    status_archived: "Archivé",
    msg_leaflet_error: "Leaflet n'a pas pu être chargé (vérifiez l'internet/le bloqueur).",
    msg_express_unavailable: "L'express n'est pas disponible pour cette commande",
    msg_no_results: "Aucun résultat.",
    msg_search_unavailable: "Recherche actuellement indisponible.",
    msg_address_search_unavailable: "Recherche d'adresse indisponible. Veuillez saisir l'adresse manuellement.",
    slot_hint_photog_date: "Veuillez sélectionner le photographe et la date.",
    slot_hint_date: "Veuillez sélectionner la date.",
    aria_remove: "Retirer",
    search_loading: "Recherche",
    slot_no_available: "Aucun créneau disponible. Veuillez choisir une autre date.",
    slot_select_time: "Sélectionnez une heure :",
    btn_sent: "Envoyé",
    msg_booking_success: "Réservation soumise avec succès.",
    msg_booking_thanks: "Merci beaucoup ! Nous avons reçu votre réservation.",
    btn_upload_material: "Télécharger des données",
    account_btn_login: "Connexion",
    account_btn_portal: "Portail",
  },
  it: {
    step_1_label: "Posizione",
    step_2_label: "Servizi",
    step_3_label: "Fotografo & orario",
    step_4_label: "Fatturazione",
    step_1_title: "1. Posizione",
    step_1_sub: "Inserisci l’indirizzo e le informazioni sull’immobile.",
    object_legend: "Immobile",
    label_address: "Indirizzo",
    ph_address: "Via numero, CAP città",
    label_object_type: "Tipo immobile",
    opt_choose: "– seleziona –",
    objtype_apartment: "Appartamento",
    objtype_single_house: "Casa unifamiliare",
    objtype_multi_house: "Casa plurifamiliare",
    objtype_commercial: "Commerciale",
    objtype_land: "Terreno",
    label_area: "Superficie (m²)",
    ph_area: "es. 120",
    label_floors: "Piani",
    unit_floors: "piano/i",
    label_rooms: "Locali",
    unit_rooms: "locali",
    ph_rooms: "es. 4.5",
    label_specials: "Caratteristiche",
    ph_specials: "es. giardino, terrazza …",
    label_desc: "Descrizione",
    ph_desc: "Breve descrizione dell’immobile (posizione, stato, punti forti) …",
    btn_next: "Avanti",
    btn_back: "Indietro",
    step_2_title: "2. Servizi",
    step_2_sub: "Scegli un pacchetto o componi lo shooting in modo modulare.",
    badge_best: "PIÙ POPOLARE",
    badge_best_l1: "PIÙ",
    badge_best_l2: "POPOLARE",
    pkg_cinematic_title: "CINEMATIC DUO",
    pkg_cinematic_sub: "TWO ANGLES. ONE STORY",
    pkg_bestseller_title: "BESTSELLER",
    pkg_fullview_title: "THE FULL VIEW",
    pkg_fullview_sub: "EVERY ANGLE EVERY DETAIL",
    cat_camera: "Foto a terra",
    cat_drone: "Foto aeree",
    cat_tour: "Tour 360°",
    cat_floorplans: "Planimetrie",
    cat_ground_video: "Video a terra",
    cat_drone_video: "Video drone",
    cat_staging: "Staging",
    cat_key_pickup: "Ritiro chiavi",
    express_title: "Consegna express entro 24 h",
    express_sub: "Solo per foto a terra/aeree, tour 360° e planimetrie",
    provisional_title: "Prenotare l'appuntamento provvisoriamente",
    provisional_sub: "L'appuntamento verrà riservato provvisoriamente. La contatteremo per la conferma.",
    notice_cam_delivery_36: "Consegna dei media entro 36 h dalla selezione delle foto",
    notice_drone_delivery_36: "Consegna dei media entro 36 h dalla selezione delle foto",
    notice_tour: "Prezzo calcolato automaticamente per m² / Consegna dei media entro 36 h",
    notice_floorplans: "Prezzo calcolato automaticamente per piano / Consegna dei media entro 72 h",
    notice_ground_video: "Riprese interne ed esterne incluse / Consegna dei media entro 72 h",
    notice_drone_video: "Consegna dei media entro 72 h",
    notice_staging: "Consegna dei media entro 72 h dalla selezione delle foto",
    prod_express_24h: "Consegna express 24 h",
    feat_photo10: "10 foto a terra",
    feat_drone4: "4 foto aeree",
    feat_hdr: "HDR elaborato",
    feat_web_full: "Formati web full-size",
    feat_delivery_48: "Consegna entro 48 h",
    feat_orientation: "Formato verticale o orizzontale",
    feat_4k: "Risoluzione 4K",
    feat_clip_1_2: "Clip di 1–2 minuti",
    feat_ground_air_combo: "Combinazione riprese da terra / aeree",
    feat_edit_music: "Montaggio dinamico e musica",
    feat_delivery_72: "Consegna entro 72 h",
    feat_tour_199: "Tour 360° fino a 199 m²",
    prod_cam_10: "Foto a terra · 10 foto",
    prod_cam_20: "Foto a terra · 20 foto",
    prod_cam_30: "Foto a terra · 30 foto",
    prod_drone_photo_4: "Foto aeree · 4 foto",
    prod_drone_photo_8: "Foto aeree · 8 foto",
    prod_drone_photo_12: "Foto aeree · 12 foto",
    prod_tour_360: "Tour 360°",
    prod_fp_from_tour: "Planimetria 2D dal tour",
    prod_fp_no_tour: "Planimetria 2D senza tour",
    prod_fp_from_sketch: "Planimetria 2D da schizzo",
    prod_ground_reel_30: "Video a terra · Reel 30 s",
    prod_ground_clip_1_2: "Video a terra · Clip 1–2 min",
    prod_drone_video_reel_30: "Video drone · Reel 30 s",
    prod_drone_video_clip_1_2: "Video drone · Clip 1–2 min",
    prod_staging_living: "Staging – Zona giorno",
    prod_staging_commercial: "Staging – Commerciale",
    prod_staging_renov: "Staging – Ristrutturazione",
    prod_key_pickup: "Ritiro chiavi",
    label_qty: "Quantità",
    unit_item: "unità",
    label_rooms_notes: "Locali e note",
    ph_rooms_notes: "es. soggiorno, cucina, ingresso …",
    label_pickup_info: "Nota",
    ph_pickup_info: "Dove e come si può ritirare la chiave? es. indirizzo, reception, custode, codice …",
    step_3_title: "3. Fotografo & orario",
    step_3_sub: "Scegli la tua preferenza, poi data e ora.",
    pref_wish: "Vorrei scegliere un fotografo preferito",
    pref_no_pref: "Nessuna preferenza – va bene chiunque",
    label_date: "Data",
    ph_date: "GG.MM.AAAA",
    date_min_notice: "Le prenotazioni sono possibili almeno 24 ore in anticipo.",
    slot_hint_default: "Si prega di scegliere preferenza e data.",
    slot_period_am: "Mattina",
    slot_period_pm: "Pomeriggio",
    step_4_title: "4. Fatturazione",
    step_4_sub: "Si prega di compilare le informazioni di fatturazione e contatto.",
    label_company: "Azienda",
    ph_company: "Nome azienda (opzionale)",
    ph_company_required: "Nome azienda",
    msg_bill_company_required: "Inserire il nome dell'azienda.",
    label_salutation: "Titolo",
    opt_salutation_company: "Azienda",
    opt_salutation_mr: "Signor",
    opt_salutation_ms: "Signora",
    label_first_name: "Nome",
    ph_first_name: "Max",
    label_name: "Cognome",
    ph_name: "Muster",
    label_email: "E‘mail",
    ph_email: "nome@example.ch",
    label_phone: "Telefono",
    label_phone_mobile: "Cellulare",
    ph_phone: "+41 ...",
    ph_phone_mobile: "+41 79 ...",
    label_diff_billing_address: "Indirizzo di fatturazione diverso",
    label_onsite_name: "Nome in loco",
    ph_onsite_name: "Nome (opzionale)",
    label_onsite_phone: "Telefono in loco",
    onsite_contact_hint: "Importante: indichi un referente raggiungibile telefonicamente il giorno dello shooting, in caso di domande urgenti o emergenze.",
    label_billing_address: "Indirizzo di fatturazione",
    ph_street: "Via, N°",
    label_zip_city: "CAP & Città",
    ph_zip_city: "8000 Zürich",
    label_zip: "CAP",
    label_city: "Città",
    label_notes: "Note",
    ph_billing_notes: "Osservazioni riguardo alla fatturazione o all'esecuzione …",
    notice_label: "Nota:",
    notice_pauschale: "I supplementi per il viaggio verranno fatturati in aggiunta. Ulteriori informazioni su",
    notice_zones: "sotto categoria Zone.",
    btn_finish: "Completa prenotazione",
    btn_sending: "Invio in corso…",
    thank_you_title: "Grazie per la tua prenotazione!",
    thank_you_sub: "Siamo felici che tu ci abbia scelto.",
    thank_you_title_provisional: "Il tuo appuntamento è stato riservato provvisoriamente!",
    thank_you_sub_provisional: "Abbiamo riservato il tuo appuntamento in modo provvisorio. Riceverai a breve i prossimi dettagli via e-mail.",
    thank_you_status_provisional: "PROVVISORIO",
    thank_you_print_title_provisional: "Conferma di prenotazione provvisoria",
    thank_you_print_intro_provisional: "Grazie per la tua prenotazione! Il tuo appuntamento è stato riservato in modo provvisorio. Riceverai a breve i prossimi dettagli via e-mail.",
    summary_title: "La tua selezione",
    sum_address: "Indirizzo",
    sum_services: "Servizi",
    sum_object: "Immobile",
    sum_photographer: "Fotografo",
    sum_datetime: "Appuntamento",
    sum_provisional_suffix: " (provvisorio)",
    sum_subtotal: "Subtotale",
    sum_discount: "Sconto",
    sum_vat: "IVA (8.1%)",
    sum_total: "Totale",
    label_discount_code: "Codice sconto",
    ph_discount_code: "Inserisci codice",
    msg_discount_invalid: "Codice sconto non valido.",
    msg_discount_expired: "Il codice sconto è scaduto.",
    btn_apply: "Applica",
    summary_auto_update: "Le modifiche vengono applicate automaticamente.",
    msg_tour_required: "Devi prenotare un tour 360° per selezionare la planimetria 2D del tour.",
    msg_address_required: "Si prega di inserire un indirizzo o selezionare dai suggerimenti.",
    msg_address_house_required: "Inserire un numero civico nell’indirizzo.",
    msg_address_city_required: "Inserire CAP o città nell’indirizzo.",
    msg_no_address_with_housenumber: "Nessun indirizzo svizzero completo trovato (numero civico richiesto).",
    msg_type_required: "Si prega di selezionare il tipo di immobile.",
    msg_area_required: "Si prega di inserire una superficie valida in m².",
    msg_floors_required: "Si prega di inserire il numero di piani (almeno 1).",
    msg_desc_required: "Si prega di inserire una breve descrizione dell'immobile.",
    msg_service_required: "Si prega di selezionare almeno un pacchetto o un servizio aggiuntivo.",
    msg_datetime_required: "Si prega di selezionare preferenza, data e ora.",
    msg_bill_name_required: "Inserisci il tuo nome.",
    msg_bill_email_invalid: "Inserisci un’e-mail valida.",
    msg_bill_phone_required: "Inserisci il tuo numero di telefono.",
    msg_bill_street_required: "Inserisci l’indirizzo di fatturazione.",
    msg_bill_zipcity_required: "Inserisci CAP e città.",
    msg_step3_required: "Seleziona preferenza, data e ora al passo 3.",
    msg_address_confirmed: "Indirizzo confermato.",
    msg_address_updated: "Indirizzo aggiornato",
    msg_address_on_map: "Indirizzo mostrato sulla mappa",
    msg_address_loading: "Caricamento indirizzo …",
    msg_map_blocked: "Server mappa bloccato. Si prega di controllare la rete/blocco pubblicità.",
    msg_map_init_error: "La mappa non è stata inizializzata:",
    msg_map_unavailable: "Mappa non disponibile.",
    status_pending: "In attesa",
    status_provisional: "Provvisorio",
    status_paused: "In pausa",
    status_confirmed: "Confermato",
    status_completed: "Completato",
    status_done: "Completato",
    status_cancelled: "Annullato",
    status_archived: "Archiviato",
    msg_leaflet_error: "Leaflet non è stato caricato (controllare internet/blocco pubblicità).",
    msg_express_unavailable: "L'express non è disponibile per questo ordine",
    msg_no_results: "Nessun risultato.",
    msg_search_unavailable: "Ricerca attualmente non disponibile.",
    msg_address_search_unavailable: "Ricerca indirizzo non disponibile. Si prega di inserire l'indirizzo manualmente.",
    slot_hint_photog_date: "Si prega di selezionare fotografo e data.",
    slot_hint_date: "Si prega di selezionare la data.",
    aria_remove: "Rimuovi",
    search_loading: "Ricerca",
    slot_no_available: "Nessuno slot disponibile. Si prega di scegliere un'altra data.",
    slot_select_time: "Seleziona un orario:",
    btn_sent: "Inviato",
    msg_booking_success: "Prenotazione inviata con successo.",
    msg_booking_thanks: "Grazie mille! Abbiamo ricevuto la tua prenotazione.",
    btn_upload_material: "Carica dati",
    account_btn_login: "Accedi",
    account_btn_portal: "Portale",
  }
};

let currentLang = "de";
function t(key){
  const cur = I18N[currentLang] || {};
  if(cur && cur[key] != null) return cur[key];
  // Nie auf Deutsch zurückfallen, wenn eine andere Sprache aktiv ist
  if(currentLang !== "de" && I18N.en && I18N.en[key] != null) return I18N.en[key];
  if(I18N.de && I18N.de[key] != null) return I18N.de[key];
  return key;
}

const OBJECT_TYPE_KEY = {
  apartment: "objtype_apartment",
  single_house: "objtype_single_house",
  multi_house: "objtype_multi_house",
  commercial: "objtype_commercial",
  land: "objtype_land",
};
function objectTypeLabel(v){
  const k = OBJECT_TYPE_KEY[v];
  return k ? t(k) : (v || "");
}

const STATUS_I18N_KEY = { pending:"status_pending", provisional:"status_provisional", paused:"status_paused", confirmed:"status_confirmed", completed:"status_completed", done:"status_done", cancelled:"status_cancelled", archived:"status_archived" };
function statusLabel(v){
  const k = STATUS_I18N_KEY[String(v||"").toLowerCase()];
  return k ? t(k) : (v || "");
}

function applyTranslations(){
  document.documentElement.lang = currentLang;
  qsa("[data-i18n]").forEach(el=>{
    const key = el.getAttribute("data-i18n");
    if(!key) return;
    el.textContent = t(key);
  });
  qsa("[data-i18n-placeholder]").forEach(el=>{
    const key = el.getAttribute("data-i18n-placeholder");
    if(!key) return;
    el.setAttribute("placeholder", t(key));
  });

  // Flatpickr locale + placeholder (sichtbares Feld)
  const fp = window.__datePicker;
  if (fp && window.flatpickr?.l10ns) {
    const loc = currentLang==="de" ? flatpickr.l10ns.de
      : currentLang==="fr" ? flatpickr.l10ns.fr
      : currentLang==="it" ? flatpickr.l10ns.it
      : null;
    if (loc) fp.set("locale", loc);
    fp.set("altFormat", "d.m.Y");
    if (fp.altInput) fp.altInput.setAttribute("placeholder", t("ph_date"));
  }

  // Dynamische Produktlabels: data-i18n-label â†’ data-label + sichtbarer Titel
  qsa("input[data-i18n-label]").forEach(inp=>{
    const k = inp.dataset.i18nLabel;
    if(!k) return;
    const lbl = t(k);
    inp.dataset.label = lbl;
    const wrap = inp.closest("label");
    const titleEl = wrap?.querySelector(".product-title") || wrap?.querySelector(".highlight-title");
    if(titleEl) titleEl.textContent = lbl;
  });

  // Summary/abhängige UI neu rendern, damit Labels in aktueller Sprache erscheinen
  try { renderSummary(); } catch(_) {}
  try { syncBillCompanyRequired(); } catch(_) {}
}

function initLanguage(){
  const sel = qs("#langSelect");
  const saved = (localStorage.getItem("lang") || "").toLowerCase();
  const browserLang = (navigator.language || navigator.userLanguage || "de").slice(0,2).toLowerCase();
  const supported = ["de","en","fr","it"];
  currentLang = supported.includes(saved) ? saved
              : supported.includes(browserLang) ? browserLang
              : "de";
  if(sel){
    sel.value = currentLang;
    sel.addEventListener("change", ()=>{
      currentLang = sel.value;
      localStorage.setItem("lang", currentLang);
      applyTranslations();
    });
  }
  applyTranslations();
}

// ---------- Toast + Notice ----------
function showToast(msg, ms=2500){
  const el = qs("#uiToast"); if(!el) return;
  el.textContent = msg; el.classList.add("show");
  clearTimeout(showToast._t); showToast._t=setTimeout(()=>el.classList.remove("show"), ms);
}
function showNotice(message, type="error", ms=3000){
  ms = Math.min(ms, 3000);
  // Zeige sowohl im Banner oben als auch als Toast unten
  const noticeEl = qs("#notice");
  const toastEl = qs("#uiToast");

  // Banner oben (nicht für Fehler, sonst doppelte Meldung)
  if(noticeEl && type !== "error"){
    noticeEl.textContent = message;
    noticeEl.className = `notice ${type}`;
    noticeEl.hidden = false;
    clearTimeout(showNotice._t);
    showNotice._t = setTimeout(()=>{
      noticeEl.hidden = true;
    }, ms);
  }
  
  // Toast unten
  if(toastEl){
    toastEl.textContent = message;
    toastEl.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(()=>{
      toastEl.classList.remove("show");
    }, ms);
  }
}
function clearNotice(){ const el=qs("#notice"); if(el) el.hidden=true; }

// ==============================
// Kundenkonto (minimal)
// ==============================
const CUSTOMER_TOKEN_KEY = "customer_token";
const CUSTOMER_SESSION_TOKEN_KEY = "customer_token_session";

function getCustomerToken(){
  try {
    return sessionStorage.getItem(CUSTOMER_SESSION_TOKEN_KEY) || localStorage.getItem(CUSTOMER_TOKEN_KEY) || "";
  } catch(_) {
    try { return localStorage.getItem(CUSTOMER_TOKEN_KEY) || ""; } catch(__) { return ""; }
  }
}
function hasSessionCustomerToken(){
  try { return !!sessionStorage.getItem(CUSTOMER_SESSION_TOKEN_KEY); } catch(_) { return false; }
}
function setCustomerToken(token, { persist = true } = {}){
  try {
    if(token){
      if(persist){
        localStorage.setItem(CUSTOMER_TOKEN_KEY, token);
        sessionStorage.removeItem(CUSTOMER_SESSION_TOKEN_KEY);
      } else {
        sessionStorage.setItem(CUSTOMER_SESSION_TOKEN_KEY, token);
      }
    } else {
      localStorage.removeItem(CUSTOMER_TOKEN_KEY);
      sessionStorage.removeItem(CUSTOMER_SESSION_TOKEN_KEY);
    }
  } catch(_) {}
}

function normalizeFrontendUrl(rawUrl){
  try {
    const raw = String(rawUrl || "").trim() || window.location.href;
    const firstQuestionMark = raw.indexOf("?");
    const normalized = firstQuestionMark === -1
      ? raw
      : `${raw.slice(0, firstQuestionMark + 1)}${raw.slice(firstQuestionMark + 1).replace(/\?/g, "&")}`;
    return new URL(normalized, window.location.origin);
  } catch(_) {
    return new URL(window.location.origin + "/");
  }
}

// Magic-Link: Auth-Token aus der URL uebernehmen und danach zur sauberen URL wechseln
(function(){
  try {
    const url = normalizeFrontendUrl(window.location.href);
    const params = url.searchParams;
    const impersonateToken = params.get("impersonate");
    const magicToken = params.get("magic");
    if (impersonateToken && typeof impersonateToken === "string" && impersonateToken.length > 10) {
      setCustomerToken(impersonateToken, { persist: false });
    }
    if (magicToken && typeof magicToken === "string" && magicToken.length > 10) {
      setCustomerToken(magicToken, { persist: true });
    }
    const hadKnownAuthParams = rawContainsAuthParams(window.location.href);
    if (impersonateToken || magicToken || hadKnownAuthParams) {
      const cleanUrl = new URL(url.toString());
      cleanUrl.searchParams.delete("impersonate");
      cleanUrl.searchParams.delete("magic");
      const nextUrl = cleanUrl.pathname + (cleanUrl.search || "") + (cleanUrl.hash || "");
      window.history.replaceState({}, "", nextUrl || "/");
    }
  } catch(_) {}
})();

function rawContainsAuthParams(rawUrl){
  const raw = String(rawUrl || "");
  return /[\?&](?:impersonate|magic)=/i.test(raw);
}

async function customerApi(path, { method="GET", body=null, auth=true } = {}){
  const headers = { "Accept": "application/json" };
  if(body != null) headers["Content-Type"] = "application/json";
  if(auth){
    const t = getCustomerToken();
    if(t) headers["Authorization"] = `Bearer ${t}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    // Bearer token is used for auth; avoid credentialed CORS requests.
    credentials: "omit",
    body: body != null ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(()=> ({}));
  if(!res.ok){
    const msg = data?.error || `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data || {};
    throw err;
  }
  return data;
}

function openAccountModal(){
  const overlay = qs("#accountOverlay");
  const modal = qs("#accountModal");
  if(overlay) overlay.hidden = false;
  if(modal) modal.hidden = false;
  document.body.classList.add("modal-open");
  
  // Restore remember me state
  const rememberMe = qs("#custRememberMe");
  const emailInput = qs("#custLoginEmail");
  if (rememberMe && emailInput) {
    const isRemembered = localStorage.getItem("customerRememberMe") === "true";
    const savedEmail = localStorage.getItem("customerEmail");
    rememberMe.checked = isRemembered || !localStorage.getItem("customerRememberMe");
    if (isRemembered && savedEmail) {
      emailInput.value = savedEmail;
    }
  }
}
function closeAccountModal(){
  const overlay = qs("#accountOverlay");
  const modal = qs("#accountModal");
  if(overlay) overlay.hidden = true;
  if(modal) modal.hidden = true;
  document.body.classList.remove("modal-open");
}

const CUSTOMER_AUTOFILL_FIELD_IDS = [
  "#billEmail",
  "#billSalutation",
  "#billFirstName",
  "#billName",
  "#billCompany",
  "#billPhone",
  "#billPhoneMobile",
  "#billStreet",
  "#billZip",
  "#billCity",
  "#onsiteName",
  "#onsitePhone",
];

function initCustomerAutofillFieldGuards(){
  CUSTOMER_AUTOFILL_FIELD_IDS.forEach((selector) => {
    const el = qs(selector);
    if(!el || el.dataset.autofillGuardInit === "1") return;
    const markUserEdited = () => {
      el.dataset.userEdited = "1";
    };
    el.addEventListener("input", markUserEdited);
    el.addEventListener("change", markUserEdited);
    el.dataset.autofillGuardInit = "1";
  });
}

function fillBillingFromCustomerMe(me){
  const c = me?.customer || {};
  const parsedZipCity = parseZipCity(c.zipcity);
  const fullName = [c.first_name, c.name].filter(Boolean).join(" ").trim();
  const setIfEmpty = (id, val) => {
    const el = qs(id);
    if(!el) return;
    const cur = String(el.value || "").trim();
    const next = String(val || "").trim();
    if(el.dataset.userEdited === "1") return;
    if(!cur && next) {
      el.value = next;
      el.dataset.autofilled = "1";
    }
  };
  setIfEmpty("#billEmail", c.email);
  setIfEmpty("#billSalutation", c.salutation);
  setIfEmpty("#billFirstName", c.first_name);
  setIfEmpty("#billName", c.name);
  setIfEmpty("#billCompany", c.company);
  setIfEmpty("#billPhone", c.phone);
  setIfEmpty("#billPhoneMobile", c.phone_mobile);
  setIfEmpty("#billStreet", c.street);
  setIfEmpty("#billZip", c.zip || parsedZipCity.zip);
  setIfEmpty("#billCity", c.city || parsedZipCity.city);
  setIfEmpty("#onsiteName", c.onsite_name || fullName);
  setIfEmpty("#onsitePhone", c.onsite_phone || c.phone_mobile || c.phone);
  try { syncBillCompanyRequired(); } catch(_) {}
}

let _custMsgOrderNo = null;

function renderCustomerMessageHistory(messages){
  const box = qs("#custMsgHistory");
  if(!box) return;
  if(!Array.isArray(messages) || messages.length === 0){
    box.innerHTML = `<div class="order-meta">Noch keine Nachrichten.</div>`;
    return;
  }
  box.innerHTML = messages.map((m)=>{
    const at = m.createdAt ? new Date(m.createdAt) : null;
    const when = at && !Number.isNaN(at.getTime())
      ? `${at.toLocaleDateString("de-CH")} ${at.toLocaleTimeString("de-CH",{hour:"2-digit",minute:"2-digit"})}`
      : "";
    const sender = escapeHtml(m.senderName || m.senderRole || "–");
    const role = escapeHtml(String(m.senderRole || "").toUpperCase());
    const text = escapeHtml(m.message || "");
    return `<div class="cust-msg-item">
      <div class="cust-msg-item-meta"><strong>${sender}</strong> (${role}) · ${escapeHtml(when)}</div>
      <div class="cust-msg-item-text">${text}</div>
    </div>`;
  }).join("");
}

async function loadCustomerMessageHistory(orderNo){
  try{
    const data = await customerApi(`/api/customer/orders/${orderNo}/messages`);
    renderCustomerMessageHistory(data.messages || []);
  }catch(err){
    // Backward-compat: ältere Backend-Instanz ohne Verlauf-GET-Route (404)
    if(Number(err?.status) === 404){
      renderCustomerMessageHistory([]);
      return;
    }
    throw err;
  }
}

async function openCustomerMessageModal(orderNo){
  _custMsgOrderNo = Number(orderNo);
  const info = qs("#custMsgInfo");
  const txt = qs("#custMsgText");
  const overlay = qs("#custMsgOverlay");
  const modal = qs("#custMsgModal");
  if(info) info.textContent = `Bestellung #${orderNo}`;
  if(txt) txt.value = "";
  if(overlay) overlay.hidden = false;
  if(modal) modal.hidden = false;
  try{
    await loadCustomerMessageHistory(orderNo);
  }catch(e){
    renderCustomerMessageHistory([]);
    showToast(e.message || "Nachrichten konnten nicht geladen werden", 3500);
  }
}

function closeCustomerMessageModal(){
  const overlay = qs("#custMsgOverlay");
  const modal = qs("#custMsgModal");
  if(overlay) overlay.hidden = true;
  if(modal) modal.hidden = true;
  _custMsgOrderNo = null;
}

function renderOrders(orders){
  const wrap = qs("#custOrdersWrap");
  const list = qs("#custOrdersList");
  if(!wrap || !list) return;
  list.innerHTML = "";

  if(!Array.isArray(orders) || orders.length === 0){
    wrap.hidden = false;
    list.innerHTML = `<div class="order-item"><div class="order-meta">Keine Buchungen gefunden.</div></div>`;
    return;
  }

  for(const o of orders){
    const orderNo = o.orderNo ?? "";
    const status = String(o.status || "");
    const normalizedStatus = status.toLowerCase();
    const date = o.schedule?.date || "";
    const time = o.schedule?.time || "";
    const addr = (typeof o.address === "string" ? o.address : (o.address?.text || "")) || "";
    const isCancelled = normalizedStatus === "cancelled";
    const isArchived = normalizedStatus === "archived";
    const isFinal = isCancelled || isArchived;

    // Detail-Felder
    const objType = o.object?.type || "";
    const objArea = o.object?.area ? `${o.object.area} m²` : "";
    const objFloors = o.object?.floors ? `${o.object.floors} Stockwerk(e)` : "";
    const photogName = o.photographer?.name || o.photographer?.key || "–";
    const services = o.services || {};
    const pkgName = services.package
      ? (typeof services.package === "object" ? (services.package.name || services.package.id || "Paket") : services.package)
      : null;
    const servicesList = [
      pkgName ? `Paket: ${pkgName}` : null,
      ...(Array.isArray(services.addons)
        ? services.addons.map(a => typeof a === "object" ? (a.name || a.id || "") : String(a || ""))
        : [])
    ].filter(Boolean).join(", ") || "–";
    const pricing = o.pricing || {};
    const subtotal = pricing.subtotal != null ? `CHF ${Number(pricing.subtotal).toFixed(2)}` : "";
    const vat = pricing.vat != null ? `MwSt: CHF ${Number(pricing.vat).toFixed(2)}` : "";
    const total = pricing.total != null ? `CHF ${Number(pricing.total).toFixed(2)}` : "";
    const billing = o.billing || {};
    const billAddr = [billing.firstName, billing.lastName, billing.street, `${billing.zip || ""} ${billing.city || ""}`.trim()].filter(Boolean).join(", ");

    const statusClass = isFinal ? "order-status-cancelled" : normalizedStatus === "confirmed" ? "order-status-confirmed" : normalizedStatus === "paused" ? "order-status-paused" : "order-status-pending";

    const item = document.createElement("div");
    item.className = "order-item";
    item.innerHTML = `
      <div class="order-header" role="button" tabindex="0" aria-expanded="false">
        <div class="order-header-main">
          <span class="order-no">#${orderNo}</span>
          <span class="order-status-badge ${statusClass}">${escapeHtml(statusLabel(status) || status)}</span>
        </div>
        <div class="order-header-sub">
          <span class="order-date-time">${fmtYMD(date)} ${time}</span>
          <span class="order-addr">${escapeHtml(addr)}</span>
        </div>
        <span class="order-expand-icon">v</span>
      </div>
      <div class="order-detail-panel" hidden>
        <div class="order-detail-grid">
          <div class="order-detail-section">
            <div class="order-detail-label">Objekt</div>
            <div class="order-detail-value">${escapeHtml([objType, objArea, objFloors].filter(Boolean).join(" · "))}</div>
          </div>
          <div class="order-detail-section">
            <div class="order-detail-label">Dienstleistungen</div>
            <div class="order-detail-value">${escapeHtml(servicesList)}</div>
          </div>
          <div class="order-detail-section">
            <div class="order-detail-label">Fotograf</div>
            <div class="order-detail-value">${escapeHtml(photogName)}</div>
          </div>
          ${total ? `<div class="order-detail-section">
            <div class="order-detail-label">Preis</div>
            <div class="order-detail-value">${subtotal ? escapeHtml(subtotal) + " " : ""}${vat ? `(${escapeHtml(vat)}) ` : ""}<strong>${escapeHtml(total)}</strong></div>
          </div>` : ""}
          ${billAddr ? `<div class="order-detail-section">
            <div class="order-detail-label">Rechnungsadresse</div>
            <div class="order-detail-value">${escapeHtml(billAddr)}</div>
          </div>` : ""}
        </div>
        ${!isFinal ? `<div class="order-actions">
          <button class="btn btn-ghost" type="button" data-action="msg-photo">Nachricht an Fotograf</button>
          <button class="btn btn-danger-outline" type="button" data-action="cancel">Stornieren</button>
        </div>
        <div class="order-reschedule-section">
          <div class="order-reschedule-header">Termin verschieben – neues Datum wählen:</div>
          <div class="order-reschedule-date-row">
            <input type="date" class="reschedule-date-input" min="${new Date().toISOString().slice(0,10)}">
          </div>
          <div class="reschedule-slot-hint">Bitte ein neues Datum wählen</div>
          <div class="reschedule-period-toolbar" hidden>
            <button class="slot-period-btn" type="button" data-rs-period="am">Vormittag</button>
            <button class="slot-period-btn" type="button" data-rs-period="pm">Nachmittag</button>
          </div>
          <div class="reschedule-slot-grid slot-grid"></div>
          <div class="reschedule-confirm-row" hidden>
            <button class="btn btn-primary" type="button" data-action="reschedule">Verschieben</button>
          </div>
        </div>
        <div class="order-suggestions" hidden></div>` : ""}
      </div>
    `;

    // Aufklappen/Zuklappen
    const header = item.querySelector(".order-header");
    const panel = item.querySelector(".order-detail-panel");
    const icon = item.querySelector(".order-expand-icon");
    const toggleDetail = () => {
      const isOpen = !panel.hidden;
      panel.hidden = isOpen;
      icon.textContent = isOpen ? "v" : "^";
      header.setAttribute("aria-expanded", String(!isOpen));
    };
    header.addEventListener("click", toggleDetail);
    header.addEventListener("keydown", (e) => { if(e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleDetail(); } });

    if(!isFinal){
      item.querySelector('[data-action="msg-photo"]').addEventListener("click", async (e)=>{
        e.stopPropagation();
        await openCustomerMessageModal(orderNo);
      });

      item.querySelector('[data-action="cancel"]').addEventListener("click", async (e)=>{
        e.stopPropagation();
        if(!confirm("Buchung wirklich stornieren?")) return;
        try{
          await customerApi(`/api/customer/orders/${orderNo}/cancel`, { method:"POST" });
          showToast("Buchung storniert", 2500);
          // Status in UI aktualisieren
          item.querySelector(".order-status-badge").textContent = t("status_cancelled");
          item.querySelector(".order-status-badge").className = "order-status-badge order-status-cancelled";
          item.querySelector(".order-actions")?.remove();
          item.querySelector(".order-suggestions")?.remove();
        }catch(e){
          showToast(e.message || "Storno fehlgeschlagen", 3500);
        }
      });

      // ── Reschedule Slot-Picker ────────────────────────────────────────────
      {
        // Lokaler State pro Bestellung
        let rsDate = "";
        let rsTime = "";
        let rsSlots = [];
        let rsPeriod = null;
        let rsPhotographerKey = null; // wird ggf. beim Slot-Klick gesetzt (bei "any")
        let rsPerPhotogSlots = {};    // { photographerKey: ["08:00", ...] }

        const orderPhotogKey = o.photographer?.key || null;
        const orderArea = Number(o.object?.area) || 0;
        const orderPkgKey = (
          typeof o.services?.package === "object"
            ? (o.services.package.key || o.services.package.id || o.services.package.code || "")
            : String(o.services?.package || "")
        );
        const orderAddonIds = (Array.isArray(o.services?.addons)
          ? o.services.addons.map(a => typeof a === "object" ? (a.id || a.code || "") : String(a || ""))
          : []
        ).filter(Boolean);

        const rsDateInput   = item.querySelector(".reschedule-date-input");
        const rsSlotHint    = item.querySelector(".reschedule-slot-hint");
        const rsPeriodWrap  = item.querySelector(".reschedule-period-toolbar");
        const rsSlotGrid    = item.querySelector(".reschedule-slot-grid");
        const rsConfirmRow  = item.querySelector(".reschedule-confirm-row");
        const rsConfirmBtn  = item.querySelector('[data-action="reschedule"]');

        function rsWorkingSlots(){
          const out=[];
          for(let h=8;h<=18;h++){
            for(const m of [0,15,30,45]){
              if(h===18&&m>0) continue;
              out.push(String(h).padStart(2,"0")+":"+String(m).padStart(2,"0"));
            }
          }
          return out;
        }

        async function rsFetchSlots(photogKey, date){
          // Dauer grob berechnen (Flächenbasis reicht für den API-Filter)
          let dur = 60;
          if(orderArea>0){ if(orderArea<=99) dur=60; else if(orderArea<=299) dur=90; else dur=120; }
          const url = new URL(AVAILABILITY_API);
          url.searchParams.set("photographer", photogKey);
          url.searchParams.set("date", date);
          if(orderArea>0) url.searchParams.set("sqm", String(orderArea));
          url.searchParams.set("duration", String(dur));
          if(orderPkgKey) url.searchParams.set("package", orderPkgKey);
          if(orderAddonIds.length) url.searchParams.set("addons", orderAddonIds.join(","));
          const res = await fetch(url.toString());
          if(!res.ok) return [];
          const data = await res.json();
          return Array.isArray(data.free) ? data.free : [];
        }

        function rsGetPeriod(slot){ return Number(slot.split(":")[0]) < 12 ? "am" : "pm"; }

        function rsUpdatePeriodBtns(){
          const amBtn = rsPeriodWrap?.querySelector('[data-rs-period="am"]');
          const pmBtn = rsPeriodWrap?.querySelector('[data-rs-period="pm"]');
          if(!rsPeriodWrap||!amBtn||!pmBtn) return;
          const amCount = rsSlots.filter(s=>rsGetPeriod(s)==="am").length;
          const pmCount = rsSlots.filter(s=>rsGetPeriod(s)==="pm").length;
          rsPeriodWrap.hidden = (amCount+pmCount)===0;
          amBtn.disabled = amCount===0;
          pmBtn.disabled = pmCount===0;
          amBtn.classList.toggle("is-active", rsPeriod==="am");
          pmBtn.classList.toggle("is-active", rsPeriod==="pm");
        }

        function rsRenderSlots(){
          if(!rsSlotGrid) return;
          rsSlotGrid.innerHTML = "";
          const period = rsPeriod || "am";
          const filtered = rsSlots.filter(s=>rsGetPeriod(s)===period);
          filtered.forEach(slotTime=>{
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "slot-btn";
            btn.textContent = slotTime;
            if(rsTime===slotTime) btn.classList.add("is-selected");
            btn.addEventListener("click", ()=>{
              rsSlotGrid.querySelectorAll(".slot-btn").forEach(b=>b.classList.remove("is-selected"));
              btn.classList.add("is-selected");
              rsTime = slotTime;
              // Bei mehreren Fotografen: passenden zuweisen
              if(Object.keys(rsPerPhotogSlots).length>0){
                for(const k of ANY_PREF){
                  if(rsPerPhotogSlots[k]?.includes(slotTime)){
                    rsPhotographerKey = k;
                    break;
                  }
                }
              }
              if(rsConfirmRow) rsConfirmRow.hidden = false;
              if(rsConfirmBtn) rsConfirmBtn.disabled = false;
            });
            rsSlotGrid.appendChild(btn);
          });
        }

        function rsAutoPickPeriod(){
          const amCount = rsSlots.filter(s=>rsGetPeriod(s)==="am").length;
          const pmCount = rsSlots.filter(s=>rsGetPeriod(s)==="pm").length;
          if(rsPeriod && (rsPeriod==="am"?amCount:pmCount)>0) return;
          rsPeriod = amCount>0 ? "am" : (pmCount>0 ? "pm" : null);
        }

        // Datum-Änderung → Slots laden (change + input für Browser-Kompatibilität)
        async function rsOnDateChange(){
          rsDate = rsDateInput.value;
          rsTime = "";
          rsSlots = [];
          rsPerPhotogSlots = {};
          rsPhotographerKey = null;
          if(rsConfirmRow) rsConfirmRow.hidden = true;
          if(rsConfirmBtn) rsConfirmBtn.disabled = true;
          if(rsSlotGrid) rsSlotGrid.innerHTML = "";
          if(rsPeriodWrap) rsPeriodWrap.hidden = true;
          if(!rsDate){ if(rsSlotHint) rsSlotHint.textContent = "Bitte neues Datum wählen"; return; }
          if(rsSlotHint) rsSlotHint.textContent = "Verfügbare Termine werden geladen…";
          try{
            const keysToFetch = orderPhotogKey ? [orderPhotogKey] : ANY_PREF;
            if(keysToFetch.length>1){
              const allFree = await Promise.all(keysToFetch.map(k=>rsFetchSlots(k,rsDate)));
              keysToFetch.forEach((k,i)=>{ rsPerPhotogSlots[k]=allFree[i]||[]; });
              const freeSet = new Set(allFree.flat());
              rsSlots = rsWorkingSlots().filter(s=>freeSet.has(s));
            } else {
              const free = await rsFetchSlots(keysToFetch[0]||"any", rsDate);
              rsSlots = rsWorkingSlots().filter(s=>new Set(free).has(s));
            }
            if(!rsSlots.length){
              if(rsSlotHint) rsSlotHint.textContent = "Für diesen Tag sind keine Termine verfügbar.";
              rsUpdatePeriodBtns();
              return;
            }
            if(rsSlotHint) rsSlotHint.textContent = "Uhrzeit wählen:";
            rsAutoPickPeriod();
            rsUpdatePeriodBtns();
            rsRenderSlots();
          }catch(err){
            if(rsSlotHint) rsSlotHint.textContent = "Verfügbarkeit konnte nicht geladen werden.";
          }
        }
        rsDateInput?.addEventListener("change", rsOnDateChange);
        rsDateInput?.addEventListener("input",  rsOnDateChange);

        // AM/PM Toggle
        rsPeriodWrap?.querySelectorAll("[data-rs-period]").forEach(btn=>{
          btn.addEventListener("click", ()=>{
            rsPeriod = btn.dataset.rsPeriod;
            rsUpdatePeriodBtns();
            rsRenderSlots();
          });
        });

        // Verschieben-Button
        rsConfirmBtn?.addEventListener("click", async (e)=>{
          e.stopPropagation();
          if(!rsDate||!rsTime) return showToast("Bitte Datum und Uhrzeit wählen", 3000);
          rsConfirmBtn.disabled = true;
          rsConfirmBtn.textContent = "Prüfe…";
          const suggestionsEl = item.querySelector(".order-suggestions");
          try{
            const checkResult = await customerApi(`/api/customer/orders/${orderNo}/reschedule-check`, {
              method:"POST", body:{ date:rsDate, time:rsTime }
            });
            if(checkResult.available){
              const body = { date:rsDate, time:rsTime };
              if(rsPhotographerKey) { body.photographerKey=rsPhotographerKey; body.photographerName=PHOTOG_MAP[rsPhotographerKey]||rsPhotographerKey; }
              await customerApi(`/api/customer/orders/${orderNo}/reschedule`, { method:"PATCH", body });
              showToast("Buchung erfolgreich verschoben", 2500);
              item.querySelector(".order-date-time").textContent = `${fmtYMD(rsDate)} ${rsTime}`;
              if(suggestionsEl) suggestionsEl.hidden = true;
            } else {
              const suggestions = checkResult.suggestions || [];
              if(suggestionsEl){
                const fmtDate = fmtYMD;
                if(!suggestions.length){
                  suggestionsEl.innerHTML = `<div class="order-suggestions-msg">Leider sind keine alternativen Termine verfügbar.</div>`;
                } else {
                  suggestionsEl.innerHTML = `
                    <div class="order-suggestions-msg">Der gewählte Termin ist nicht mehr frei. Mögliche Alternativen:</div>
                    <div class="order-suggestions-list">
                      ${suggestions.map((s,i)=>`
                        <button class="btn order-suggestion-btn" type="button" data-idx="${i}">
                          <span class="suggestion-date">${fmtDate(s.date)}</span>
                          <span class="suggestion-time">${s.time}</span>
                          <span class="suggestion-photog">${escapeHtml(s.photographer?.name||s.photographer?.key||"")}</span>
                        </button>`).join("")}
                    </div>`;
                  suggestions.forEach((s,i)=>{
                    suggestionsEl.querySelector(`[data-idx="${i}"]`).addEventListener("click", async ()=>{
                      try{
                        await customerApi(`/api/customer/orders/${orderNo}/reschedule`, {
                          method:"PATCH",
                          body:{ date:s.date, time:s.time, photographerKey:s.photographer?.key, photographerName:s.photographer?.name }
                        });
                        showToast(`Buchung verschoben auf ${fmtDate(s.date)} ${s.time}`, 3000);
                        item.querySelector(".order-date-time").textContent = `${fmtYMD(s.date)} ${s.time}`;
                        suggestionsEl.hidden = true;
                      }catch(err2){ showToast(err2.message||"Verschieben fehlgeschlagen", 3500); }
                    });
                  });
                }
                suggestionsEl.hidden = false;
              }
            }
          }catch(err){
            showToast(err.message||"Verschieben fehlgeschlagen", 3500);
          }finally{
            rsConfirmBtn.disabled = false;
            rsConfirmBtn.textContent = "Verschieben";
          }
        });
      }
    }

    list.appendChild(item);
  }
  wrap.hidden = false;
}

let syncCustomerUiAfterLogin = async () => {};

function initCustomerAccount(){
  const btn = qs("#accountBtn");
  const closeBtn = qs("#accountClose");
  const overlay = qs("#accountOverlay");

  if(closeBtn) closeBtn.addEventListener("click", ()=> closeAccountModal());
  if(overlay) overlay.addEventListener("click", ()=> closeAccountModal());

  const loginBtn = qs("#custLoginBtn");
  const regBtn = qs("#custRegisterBtn");
  const logoutBtn = qs("#custLogoutBtn");
  const fillBtn = qs("#custFillBillingBtn");
  const loadOrdersBtn = qs("#custLoadOrdersBtn");
  const verifyPanel = qs("#custVerifyPanel");
  const resendVerifyBtn = qs("#custResendVerifyBtn");
  const regEmailEl = qs("#custRegEmail");
  const regEmailStatusEl = qs("#custRegEmailStatus");
  const regVerifyPanel = qs("#custRegVerifyPanel");
  const regResendVerifyBtn = qs("#custRegResendVerifyBtn");
  const msgOverlay = qs("#custMsgOverlay");
  const msgClose = qs("#custMsgClose");
  const msgSendBtn = qs("#custMsgSendBtn");

  if(msgOverlay) msgOverlay.addEventListener("click", ()=> closeCustomerMessageModal());
  if(msgClose) msgClose.addEventListener("click", ()=> closeCustomerMessageModal());
  if(msgSendBtn) msgSendBtn.addEventListener("click", async ()=>{
    if(!_custMsgOrderNo) return;
    const txt = qs("#custMsgText");
    const message = String(txt?.value || "").trim();
    if(!message) return showToast("Bitte Nachricht eingeben", 3000);
    try{
      msgSendBtn.disabled = true;
      msgSendBtn.textContent = "Sende…";
      await customerApi(`/api/customer/orders/${_custMsgOrderNo}/message`, { method:"POST", body:{ message } });
      if(txt) txt.value = "";
      await loadCustomerMessageHistory(_custMsgOrderNo);
      showToast("Nachricht gesendet", 2500);
    }catch(e){
      showToast(e.message || "Nachricht konnte nicht gesendet werden", 3500);
    }finally{
      msgSendBtn.disabled = false;
      msgSendBtn.textContent = "Senden";
    }
  });

  const setRegEmailStatus = (text, { color=null } = {}) => {
    if(!regEmailStatusEl) return;
    if(!text){
      regEmailStatusEl.style.display = "none";
      regEmailStatusEl.textContent = "";
      regEmailStatusEl.style.color = "";
      return;
    }
    regEmailStatusEl.textContent = text;
    regEmailStatusEl.style.display = "";
    regEmailStatusEl.style.color = color || "";
  };

  const loadOrdersForCurrentCustomer = async () => {
    const data = await customerApi("/api/customer/orders");
    renderOrders(data.orders || []);
  };
  const saveRememberState = (email, rememberMe) => {
    try {
      localStorage.setItem("customerRememberMe", rememberMe ? "true" : "false");
      if (rememberMe) localStorage.setItem("customerEmail", String(email || "").trim());
      else localStorage.removeItem("customerEmail");
    } catch(_) {}
  };

  const openCustomerPanel = async () => {
    const token = getCustomerToken();
    if(!token){
      // Kein Token: Modal mit Login-Ansicht öffnen (nicht direkt weiterleiten)
      openAccountModal();
      await setUiLoggedIn(false);
      return;
    }
    openAccountModal();
    try{
      await setUiLoggedIn(true);
      await loadOrdersForCurrentCustomer();
    }catch(e){
      setCustomerToken("");
      await setUiLoggedIn(false);
      // Token abgelaufen: Modal bleibt offen → User kann auf Anmelden klicken
    }
  };

  if(btn) btn.addEventListener("click", ()=> {
    void openCustomerPanel();
  });

  const setUiLoggedIn = async (isLoggedIn)=>{
    const out = qs("#accountLoggedOut");
    const inn = qs("#accountLoggedIn");
    if(out) out.hidden = !!isLoggedIn;
    if(inn) inn.hidden = !isLoggedIn;
    if(btn){
      const accountButtonKey = isLoggedIn ? "account_btn_portal" : "account_btn_login";
      btn.dataset.i18n = accountButtonKey;
      btn.textContent = t(accountButtonKey);
    }
    if(!isLoggedIn){
      const ow = qs("#custOrdersWrap");
      if(ow) ow.hidden = true;
      const emailEl = qs("#accountEmail");
      if(emailEl) emailEl.textContent = "–";
    }else{
      try{
        const me = await customerApi("/api/customer/me");
        const emailEl = qs("#accountEmail");
        if(emailEl) emailEl.textContent = me?.customer?.email || "–";
        const autofillEmailEl = qs("#billAutofillEmail");
        const autofillBanner = qs("#billAutofillBanner");
        if(autofillEmailEl) autofillEmailEl.textContent = me?.customer?.email || "";
        if(autofillBanner) autofillBanner.hidden = false;
        fillBillingFromCustomerMe(me);
      }catch(_){}
    }
  };
  syncCustomerUiAfterLogin = setUiLoggedIn;

  // Initial state (token present?)
  void (async () => {
    const initialToken = getCustomerToken();
    const fromImpersonationLink = hasSessionCustomerToken();
    await setUiLoggedIn(!!initialToken);
    if (!initialToken || !fromImpersonationLink) return;
    openAccountModal();
    try{
      await loadOrdersForCurrentCustomer();
    }catch(e){
      showToast(e.message || "Kundenansicht konnte nicht geladen werden", 3500);
    }
  })();

  if(loginBtn) loginBtn.addEventListener("click", ()=>{
    void (async () => {
      const email = String(qs("#custLoginEmail")?.value || "").trim();
      const password = String(qs("#custLoginPassword")?.value || "");
      const rememberMe = !!qs("#custRememberMe")?.checked;
      if(!email || !password){
        showToast("Bitte E-Mail und Passwort eingeben", 3000);
        return;
      }
      const oldLabel = loginBtn.textContent;
      loginBtn.disabled = true;
      loginBtn.textContent = "Anmelden...";
      try{
        markBookingDraftPendingForAuth();
        const loginRes = await customerApi("/api/customer/login", {
          method: "POST",
          auth: false,
          body: { email, password }
        });
        if(loginRes?.token){
          // Stabil: nach Login immer persistent speichern, damit Header/Portal
          // auch nach Reload konsistent auf "Portal" bleibt.
          setCustomerToken(loginRes.token, { persist: true });
          saveRememberState(email, rememberMe);
          await setUiLoggedIn(true);
          await loadOrdersForCurrentCustomer();
          showToast("Erfolgreich angemeldet", 2200);
        } else {
          throw new Error("Login-Token fehlt");
        }
      }catch(e){
        showToast(e.message || "Anmeldung fehlgeschlagen", 3500);
      }finally{
        loginBtn.disabled = false;
        loginBtn.textContent = oldLabel || "Anmelden";
      }
    })();
  });

  if(regBtn) regBtn.addEventListener("click", ()=>{
    void (async () => {
      const email = String(qs("#custLoginEmail")?.value || "").trim();
      const password = String(qs("#custLoginPassword")?.value || "");
      if(!email || !password){
        showToast("Für die Registrierung bitte E-Mail und Passwort eingeben", 3200);
        return;
      }
      if(password.length < 8){
        showToast("Das Passwort muss mindestens 8 Zeichen lang sein", 3200);
        return;
      }
      const oldLabel = regBtn.textContent;
      regBtn.disabled = true;
      regBtn.textContent = "Erstelle...";
      try{
        const fallbackName = email.includes("@") ? email.split("@")[0] : email;
        await customerApi("/api/customer/register", {
          method: "POST",
          auth: false,
          body: { email, password, name: fallbackName }
        });
        const loginRes = await customerApi("/api/customer/login", {
          method: "POST",
          auth: false,
          body: { email, password }
        });
        if(loginRes?.token){
          const rememberMe = !!qs("#custRememberMe")?.checked;
          setCustomerToken(loginRes.token, { persist: true });
          saveRememberState(email, rememberMe);
          await setUiLoggedIn(true);
          await loadOrdersForCurrentCustomer();
          showToast("Konto erstellt und angemeldet", 2600);
        } else {
          throw new Error("Login-Token fehlt");
        }
      }catch(e){
        showToast(e.message || "Registrierung fehlgeschlagen", 3500);
      }finally{
        regBtn.disabled = false;
        regBtn.textContent = oldLabel || "Konto erstellen";
      }
    })();
  });

  if(logoutBtn) logoutBtn.addEventListener("click", async ()=>{
    try{
      await customerApi("/api/customer/logout", { method:"POST" });
      setCustomerToken("");
      await setUiLoggedIn(false);
      showToast("Ausgeloggt", 2000);
    }catch(_){
      setCustomerToken("");
      await setUiLoggedIn(false);
    }
  });

  if(loadOrdersBtn) loadOrdersBtn.addEventListener("click", async ()=>{
    try{
      await loadOrdersForCurrentCustomer();
    }catch(e){
      showToast(e.message || "Konnte Buchungen nicht laden", 3500);
    }
  });

  const uploadBtn = qs("#custUploadBtn");
  if(uploadBtn) uploadBtn.addEventListener("click", ()=>{
    window.open("https://upload.propus.ch", "_blank");
  });

  // Passwort vergessen
  const forgotBtn = qs("#custForgotBtn");
  const forgotPanel = qs("#forgotPasswordPanel");
  const forgotSendBtn = qs("#custForgotSendBtn");
  const forgotCancelBtn = qs("#custForgotCancelBtn");

  if(forgotBtn){
    forgotBtn.addEventListener("click", async ()=>{
      showToast("Passwort-Reset ist aktuell noch nicht aktiviert.", 3500);
    });
  }
}

/** Konvertiert YYYY-MM-DD → DD.MM.YYYY (gibt unverändert zurück wenn Format nicht passt) */
function fmtYMD(ds){ const p=String(ds||"").split("-"); return p.length===3?`${p[2]}.${p[1]}.${p[0]}`:ds; }

function escapeHtml(s){
  return String(s || "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/\"/g,"&quot;")
    .replace(/'/g,"&#039;");
}
function escapeAttr(s){ return escapeHtml(s).replace(/\n/g," "); }

const BOOKING_CONFIRMATION_MONTHS_DE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember"
];

function joinTextParts(parts){
  return parts.map((part) => String(part || "").trim()).filter(Boolean).join(" ");
}

function formatBookingConfirmationNo(orderNo){
  const raw = String(orderNo ?? "").trim();
  if(!raw) return "–";
  if(/^\d+$/.test(raw)){
    return `#${new Date().getFullYear()}-${raw.padStart(5, "0")}`;
  }
  return raw.startsWith("#") ? raw : `#${raw}`;
}

function formatBookingConfirmationDate(dateValue){
  const fallback = new Date();
  const source = String(dateValue || "").trim();
  const parsed = source ? new Date(`${source}T12:00:00`) : fallback;
  const finalDate = Number.isNaN(parsed.getTime()) ? fallback : parsed;
  return `${finalDate.getDate()}. ${BOOKING_CONFIRMATION_MONTHS_DE[finalDate.getMonth()]} ${finalDate.getFullYear()}`;
}

function setTextContent(selector, value){
  const el = qs(selector);
  if(el) el.textContent = String(value || "–");
}

function setHiddenState(selector, hidden){
  const el = qs(selector);
  if(el) el.hidden = !!hidden;
}

function resolveThankYouInvoiceData(billing){
  const hasAltInvoice = !!(
    qs("#diffBillAddr")?.checked ||
    billing?.alt_company ||
    billing?.alt_street ||
    billing?.alt_zip ||
    billing?.alt_city ||
    billing?.alt_zipcity
  );
  const zipCity = hasAltInvoice
    ? joinTextParts([billing?.alt_zip, billing?.alt_city]) || String(billing?.alt_zipcity || "").trim()
    : joinTextParts([billing?.zip, billing?.city]) || String(billing?.zipcity || "").trim();
  return {
    company: hasAltInvoice ? (billing?.alt_company || billing?.company || "") : (billing?.company || ""),
    companyEmail: hasAltInvoice ? (billing?.alt_company_email || billing?.company_email || "") : (billing?.company_email || ""),
    companyPhone: hasAltInvoice ? (billing?.alt_company_phone || billing?.company_phone || "") : (billing?.company_phone || ""),
    street: hasAltInvoice ? (billing?.alt_street || billing?.street || "") : (billing?.street || ""),
    zipCity
  };
}

function initThankYouScreenOnce(){
  const printBtn = qs("#tyPrintBtn");
  if(printBtn && printBtn.dataset.init !== "1"){
    printBtn.dataset.init = "1";
    printBtn.addEventListener("click", () => window.print());
  }
  const pdfBtn = qs("#tyPdfBtn");
  if(pdfBtn && pdfBtn.dataset.init !== "1"){
    pdfBtn.dataset.init = "1";
    pdfBtn.addEventListener("click", () => window.print());
  }
}

function populateThankYouScreen(bookingData = {}){
  initThankYouScreenOnce();
  const billing = state.billing || {};
  const isProvisional = String(bookingData.status || "").toLowerCase() === "provisional";
  const orderNo = formatBookingConfirmationNo(bookingData.orderNo);
  const bookingDate = formatBookingConfirmationDate();
  const contactName = joinTextParts([billing.salutation, billing.first_name, billing.name]) || billing.company || "–";
  const contactPhone = billing.phone || billing.phone_mobile || "–";
  const invoice = resolveThankYouInvoiceData(billing);
  const orderRef = String(billing.order_ref || "").trim();
  const notes = String(billing.notes || "").trim();
  const titleText = isProvisional ? t("thank_you_title_provisional") : t("thank_you_title");
  const subtitleText = isProvisional ? t("thank_you_sub_provisional") : t("thank_you_sub");
  const statusBadgeText = isProvisional ? t("thank_you_status_provisional") : "BESTÄTIGT";
  const printTitleText = isProvisional ? t("thank_you_print_title_provisional") : "Buchungsbestätigung";
  const printIntroText = isProvisional ? t("thank_you_print_intro_provisional") : "Vielen Dank für Ihre Buchung! Ihre Buchung wurde erfolgreich abgeschlossen. Sie erhalten in Kürze eine Bestätigung per E-Mail.";
  const printStatusText = isProvisional ? statusLabel("provisional") : "Bestätigt";

  setTextContent("#thankyou-title", titleText);
  setTextContent("#tySubtitle", subtitleText);
  setTextContent("#tyOrderNo", orderNo);
  setTextContent("#tyDateVal", bookingDate);
  setTextContent("#tyContactName", contactName);
  setTextContent("#tyStatusBadge", statusBadgeText);

  setTextContent("#tyPrintOrderNo", orderNo);
  setTextContent("#tyPrintDate", bookingDate);
  setTextContent("#tyPrintTitle", printTitleText);
  setTextContent("#tyPrintStatusBadge", statusBadgeText);
  setTextContent("#tyPrintIntro", printIntroText);
  setTextContent("#tyPrintStatusText", printStatusText);
  setTextContent("#tyPrintCompany", invoice.company || "–");
  setTextContent("#tyPrintCompanyEmail", invoice.companyEmail || "–");
  setTextContent("#tyPrintCompanyPhone", invoice.companyPhone || "–");
  setTextContent("#tyPrintStreet", invoice.street || "–");
  setTextContent("#tyPrintZipCity", invoice.zipCity || "–");
  setTextContent("#tyPrintContactName", contactName);
  setTextContent("#tyPrintContactEmail", billing.email || "–");
  setTextContent("#tyPrintContactPhone", contactPhone);
  setTextContent("#tyPrintOrderRef", orderRef || "–");
  setTextContent("#tyPrintNotes", notes || "–");

  setHiddenState("#tyPrintCompanyEmailRow", !invoice.companyEmail);
  setHiddenState("#tyPrintCompanyPhoneRow", !invoice.companyPhone);
  setHiddenState("#tyPrintOrderRefRow", !orderRef);
  setHiddenState("#tyPrintNotesRow", !notes);
  setHiddenState("#tyPrintExtraSection", !orderRef && !notes);

}

// ==============================
// Billing Autofill (Schritt 4)
// ==============================

function syncBillCompanyRequired(){
  const sal = qs("#billSalutation");
  const company = qs("#billCompany");
  const reqSpan = qs("#billCompanyReq");
  if(!sal || !company) return;
  const isFirma = sal.value === "Firma";
  company.required = isFirma;
  company.setAttribute("aria-required", String(isFirma));
  if(reqSpan) reqSpan.hidden = !isFirma;
  company.setAttribute("placeholder", t(isFirma ? "ph_company_required" : "ph_company"));
}

function initBillCompanySalutationRule(){
  const sal = qs("#billSalutation");
  if(!sal || sal.dataset.companyRuleInit === "1") return;
  sal.dataset.companyRuleInit = "1";
  sal.addEventListener("change", syncBillCompanyRequired);
  syncBillCompanyRequired();
}

function initBillingAutofill(){
  initCustomerAutofillFieldGuards();
  try { syncBillCompanyRequired(); } catch(_) {}
  const token = getCustomerToken();
  const banner = qs("#billAutofillBanner");
  const emailEl = qs("#billAutofillEmail");

  initDiffBillAddrToggleOnce();

  if(!token || !banner) return;

  // Eingeloggt: Banner anzeigen und Daten laden
  customerApi("/api/customer/me").then(me => {
    if(!me?.customer) return;
    const c = me.customer;
    if(emailEl) emailEl.textContent = c.email;
    banner.hidden = false;
    fillBillingFromCustomerMe(me);
  }).catch(() => {
    // Token ungültig â†’ Banner nicht zeigen
    setCustomerToken("");
  });
}

// ---------- Boot ----------
document.addEventListener("DOMContentLoaded", () => {
  let bookingStarted = false;
  let bookingDraftSaveTimer = null;
  scheduleBookingDraftSave = () => {
    if(bookingDraftSaveTimer) window.clearTimeout(bookingDraftSaveTimer);
    bookingDraftSaveTimer = window.setTimeout(()=>{
      bookingDraftSaveTimer = null;
      saveBookingDraft();
    }, 200);
  };
  // Mobile block screen is deprecated; keep it hidden even if cached JS tries to show it.
  try {
    const mb = qs("#mobileBlockScreen");
    if (mb) {
      mb.hidden = true;
      mb.style.display = "none";
    }
  } catch (_) {}

  initBillCompanySalutationRule();
  initDiffBillAddrToggleOnce();
  applyFrontDbFieldMetadata();
  initDbHintsToggle();
  initProvisionalBoxVisibility();
  initPublicCatalogAutoRefresh();
  loadDynamicCatalog();
  // Logo click -> Propus website
  qsa(".logo, .welcome-logo").forEach(el=>{
    el.addEventListener("click", ()=>{
      window.open("https://propus.ch/", "_blank", "noopener");
    });
  });

  // Welcome screen handling
  const welcome = qs("#welcomeScreen");
  const startBtn = qs("#startBookingBtn");
  const mainContent = qs("#mainContent");
  const summaryEl = qs(".summary");
  const headerEl = qs(".site-header");
  const mobileBar = qs("#mobileSummaryBar");
  const mobileToggle = qs("#mobileSummaryToggle");
  const mobileOverlay = qs("#mobileSummaryOverlay");
  const isPhone = window.matchMedia ? window.matchMedia("(max-width: 700px)") : { matches: false };

  function revealBookingFlow({ initStep = null } = {}){
    const thankYou = qs("#thankYouScreen");
    if(welcome){
      welcome.classList.remove("is-leaving");
      welcome.classList.add("is-hidden");
      welcome.hidden = true;
    }
    if(thankYou){
      thankYou.hidden = true;
      thankYou.classList.remove("is-visible");
    }
    if(mainContent) mainContent.hidden = false;
    bookingStarted = true;
    applyMobileMode();
    requestAnimationFrame(()=>{
      initMapStep1();
      try { mapStep1?.invalidateSize?.(); } catch(_) {}
      if(initStep){
        qs(`#h1-${initStep}`)?.focus();
      }
    });
  }

  // Kundenkonto UI
  initCustomerAccount();

  function closeMobileSummary(){
    if(summaryEl) summaryEl.classList.remove("is-open");
    if(mobileOverlay) mobileOverlay.hidden = true;
    if(mobileToggle) mobileToggle.setAttribute("aria-expanded", "false");
    document.body.classList.remove("mobile-summary-open");
  }
  function openMobileSummary(){
    if(!summaryEl) return;
    summaryEl.classList.add("is-open");
    if(mobileOverlay) mobileOverlay.hidden = false;
    if(mobileToggle) mobileToggle.setAttribute("aria-expanded", "true");
    document.body.classList.add("mobile-summary-open");
  }
  function applyMobileSummaryTop(){
    if(!mobileBar) return;
    const headerHeight = headerEl?.getBoundingClientRect().height || 0;
    document.documentElement.style.setProperty("--mobile-summary-top", `${Math.round(headerHeight)}px`);
  }
  function applyMobileMode(){
    if(!mobileBar) return;
    if(isPhone.matches){
      mobileBar.hidden = false;
      if(mobileOverlay) mobileOverlay.hidden = true;
      closeMobileSummary();
      requestAnimationFrame(applyMobileSummaryTop);

      // Add a visible close button into the bottom sheet (mobile only)
      if(summaryEl && !qs(".mobile-summary-close", summaryEl)){
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "mobile-summary-close";
        btn.textContent = "Ihre Auswahl";
        btn.addEventListener("click", closeMobileSummary);
        summaryEl.insertBefore(btn, summaryEl.firstChild);
      }
    } else {
      mobileBar.hidden = true;
      closeMobileSummary();
    }
  }
  applyMobileMode();
  if(isPhone.addEventListener){
    isPhone.addEventListener("change", applyMobileMode);
  }
  window.addEventListener("resize", () => requestAnimationFrame(applyMobileSummaryTop));
  if(mobileToggle){
    mobileToggle.addEventListener("click", ()=>{
      if(!summaryEl) return;
      if(summaryEl.classList.contains("is-open")) closeMobileSummary();
      else openMobileSummary();
    });
  }
  if(mobileOverlay){
    mobileOverlay.addEventListener("click", closeMobileSummary);
  }
  document.addEventListener("keydown", (e)=>{
    if(e.key === "Escape") closeMobileSummary();
  });
  if (summaryEl) {
    const applySummaryStickyTop = () => {
      const summaryTop = summaryEl.getBoundingClientRect().top;
      const headerHeight = headerEl?.getBoundingClientRect().height || 0;
      const stickyTop = Math.max(Math.round(summaryTop), Math.round(headerHeight + 24));
      document.documentElement.style.setProperty("--summary-sticky-top", `${stickyTop}px`);
    };
    requestAnimationFrame(applySummaryStickyTop);
    window.addEventListener("resize", () => requestAnimationFrame(applySummaryStickyTop));
  }
  if (welcome && startBtn && mainContent) {
    startBtn.addEventListener("click", (e)=>{
      e.preventDefault();
      e.stopPropagation();
      startBtn.disabled = true;
      welcome.classList.add("is-leaving");
      setTimeout(()=>{
        revealBookingFlow({ initStep: 1 });
        startBtn.disabled = false;
        goToStep(1);
      }, 350);
    });
  }

  // Welcome text animation (4 languages)
  const welcomeTitle = qs("#welcome-title");
  const welcomeSub = qs("#welcome-sub");
  if (welcomeTitle && welcomeSub) {
    const messages = [
      {
        title: "Willkommen zu unserem neuen Buchungssystem",
        sub: "Es freut uns, euch zu ermöglichen, einfach und bequem online bei uns zu buchen.",
        btn: "Buchung starten"
      },
      {
        title: "Welcome to our new booking system",
        sub: "We are happy to make it easy and convenient to book online with us.",
        btn: "Start booking"
      },
      {
        title: "Bienvenue sur notre nouveau système de réservation",
        sub: "Nous sommes heureux de vous permettre de réserver facilement et confortablement en ligne.",
        btn: "Commencer la réservation"
      },
      {
        title: "Benvenuti nel nostro nuovo sistema di prenotazione",
        sub: "Siamo lieti di permettervi di prenotare facilmente e comodamente online.",
        btn: "Avvia prenotazione"
      }
    ];
    let idx = 0;
    setInterval(()=>{
      welcomeTitle.classList.add("is-fading");
      welcomeSub.classList.add("is-fading");
      startBtn?.classList.add("is-fading");
      setTimeout(()=>{
        idx = (idx + 1) % messages.length;
        welcomeTitle.textContent = messages[idx].title;
        welcomeSub.textContent = messages[idx].sub;
        if(startBtn) startBtn.textContent = messages[idx].btn;
        welcomeTitle.classList.remove("is-fading");
        welcomeSub.classList.remove("is-fading");
        startBtn?.classList.remove("is-fading");
      }, 300);
    }, 3500);
  }
  initLanguage();

  // Navigation
  qsa(".next").forEach(b => b.addEventListener("click", nextStep));
  qsa(".prev").forEach(b => b.addEventListener("click", prevStep));
  updateStepper();

  // STEP 1 - Autocomplete IMMER initialisieren (funktioniert auch ohne Karte)
  initAddressAutocomplete();

  // PLZ â†’ Ort automatisch befüllen (Schritt 4 Rechnungsadresse)
  initZipCityAutocomplete();
  // Rechnungsstrasse Autocomplete + PLZ/Ort-Autofill
  initBillStreetAutocomplete();
  // Schlüsselabholung: einziges Textfeld, kein Adress-Autocomplete
  
  // Karte erst initialisieren, wenn Buchung sichtbar ist
  if (!welcome || !mainContent || !mainContent.hasAttribute("hidden")) {
    initMapStep1();
    setTimeout(() => {
      if(!bookingStarted){
        const mapEl = qs("#map");
        if(mapEl && (!mapStep1 || !mapStep1._container || !mapStep1.getContainer || !mapStep1.getContainer())){
          initMapStep1();
        } else if(mapStep1){
          try { mapStep1.invalidateSize(); } catch(e) {}
        }
      }
    }, 1000);
  }
  ["type","area","floors","objDesc","onsiteName","onsitePhone"].forEach(id => qs("#"+id)?.addEventListener("input", clearNotice));

  // STEP 2 – Objektfelder & Leistungen
  ["type","area","floors","rooms","specials","objDesc","onsiteName","onsitePhone"].forEach((id)=>{
    qs("#"+id)?.addEventListener("input", onObjectChanged);
    qs("#"+id)?.addEventListener("change", onObjectChanged);
  });

  // Impression & Motion Set und Package schließen sich gegenseitig aus
  const handlePackageUncheck = () => {
    // Highlight-Card Glow-Effekt entfernen
    qsa(".highlight-card").forEach(c => c.classList.remove("is-selected"));
    state.package = { key:"", price:0, label:"", labelKey:"" };
    state.flags.package = false;
    updateFloorPlansUI();
    syncFloorPlans();
    refreshProductCardStyles();
    updateExpressAvailability(); // Express-Verfügbarkeit prüfen wenn Paket entfernt
    renderSummary(); updateNextBtnStep2();
    // Slots zurücksetzen wenn bereits Datum gewählt
    if (state.date) {
      clearSlots();
      state.time = null;
      state.availableSlots = [];
      state.slotPeriod = null;
      const hint = qs("#slotHint");
      if (hint) hint.textContent = t("slot_hint_default");
      // Neue Slots laden falls Fotograf ausgewählt
      if (state.flags.photographer) {
        onDateOrPhotogChanged();
      }
    }
  };
  const handlePackageCheck = (inp) => {
    // Andere Gruppe zurücksetzen (nicht die aktuelle)
    const groupName = inp?.name || "";
    if (groupName === "impression") {
      qsa('input[name="package"]').forEach(x=>{ x.checked=false; x.dataset.checked="false"; updateProductCardStyle(x); });
    } else if (groupName === "package") {
      qsa('input[name="impression"]').forEach(x=>{ x.checked=false; x.dataset.checked="false"; updateProductCardStyle(x); });
    }
    // Aktuelle Auswahl sicher setzen
    inp.checked = true;
    inp.dataset.checked = "true";
    updateProductCardStyle(inp);
    
    // Highlight-Card Glow-Effekt setzen
    const card = inp.closest(".highlight-card");
    if(card){
      qsa(".highlight-card").forEach(c => c.classList.remove("is-selected"));
      card.classList.add("is-selected");
    }
    
    state.package = { key:inp.value, price:+inp.dataset.price||0, label:inp.dataset.label||inp.value, labelKey:inp.dataset.i18nLabel||"" };
    state.flags.package = true;
    updateFloorPlansUI();
    syncFloorPlans();
    refreshProductCardStyles();
    updateExpressAvailability(); // Express-Verfügbarkeit prüfen wenn Paket gewählt
    renderSummary(); updateNextBtnStep2();
    // Slots zurücksetzen wenn bereits Datum gewählt (Dauer hat sich geändert)
    if (state.date) {
      clearSlots();
      state.time = null;
      state.availableSlots = [];
      state.slotPeriod = null;
      const hint = qs("#slotHint");
      if (hint) hint.textContent = t("slot_hint_default");
      // Neue Slots laden falls Fotograf ausgewählt
      if (state.flags.photographer) {
        onDateOrPhotogChanged();
      }
    }
  };

  makeRadiosUncheckable("impression", handlePackageUncheck, handlePackageCheck);
  makeRadiosUncheckable("package", handlePackageUncheck, handlePackageCheck);

  attachSingleGroup("cam",         "camera");
  attachSingleGroup("dronePhoto",  "dronePhoto");
  attachSingleGroup("groundVideo", "groundVideo");
  attachSingleGroup("droneVideo",  "droneVideo");

  qs("#tourToggle")?.addEventListener("change", ()=>{ syncTour(); updateNextBtnStep2(); refreshProductCardStyles(); });
  // Floor Plans mit Notify für fpTour
  const fpTourEl = qs("#fpTour");
  if(fpTourEl){
    // Click Event für bessere Kontrolle
    fpTourEl.closest("label")?.addEventListener("click", (e)=>{
      const tourActive = !!state.addons.find(a=>a.id==="tour:main") || state.package.key === "fullview";
      if(!tourActive){
        e.preventDefault();
        e.stopPropagation();
        fpTourEl.checked = false;
        updateProductCardStyle(fpTourEl);
        showNotice(t("msg_tour_required"),"warn");
        return false;
      }
    });
    // Change Event als Fallback
    fpTourEl.addEventListener("change", ()=>{
      const tourActive = !!state.addons.find(a=>a.id==="tour:main") || state.package.key === "fullview";
      if(fpTourEl.checked && !tourActive){
        fpTourEl.checked = false;
        updateProductCardStyle(fpTourEl);
        showNotice(t("msg_tour_required"),"warn");
        return;
      }
      syncFloorPlans(); 
      updateNextBtnStep2(); 
      refreshProductCardStyles();
    });
  }
  ["fpNoTour","fpSketch"].forEach(id => qs("#"+id)?.addEventListener("change", ()=>{ syncFloorPlans(); updateNextBtnStep2(); refreshProductCardStyles(); }));

  // STAGING: Mengenfelder sauber steuern
  ["stLiving","stBusiness","stRenov"].forEach(id=>{
    const inp=qs("#"+id), qty=qs("#qty-"+id), wrap=qs(`.qty-wrap[data-for="${id}"]`);
    inp?.addEventListener("change", ()=>{
      wrap.hidden=!inp.checked; if(!inp.checked && qty) qty.value=1;
      syncStaging(); updateNextBtnStep2(); refreshProductCardStyles();
    });
    qty?.addEventListener("input", ()=>{ syncStaging(); updateNextBtnStep2(); });
    qty?.addEventListener("change", ()=>{ syncStaging(); updateNextBtnStep2(); });
  });

  // initial sicher: alle qty-wraps verstecken
  hideStagingQty();

  qs("#keyPickupToggle")?.addEventListener("change", ()=>{
    const enable = qs("#keyPickupToggle").checked;
    const keyInfo = qs("#keyInfo");
    if(keyInfo) keyInfo.disabled = !enable;
    const keyForm = qs("#keyForm");
    if(keyForm) keyForm.setAttribute("aria-hidden", String(!enable));
    syncOpenAccordionHeight(keyForm);
    // Konsistenter ID-Präfix für Gruppe "keypickup", damit Entfernen in der Summary sauber funktioniert
    const keypickupPrice = Number(qs("#keyPickupToggle")?.dataset.price || DYNAMIC_PRICES.keypickup || 50);
    upsertAddon("keypickup:main","keypickup", t("prod_key_pickup"), enable ? keypickupPrice : 0, "prod_key_pickup");
    renderSummary(); updateNextBtnStep2(); refreshProductCardStyles();
  });

  qs("#express24")?.addEventListener("change", ()=>{ syncExpress(); updateNextBtnStep2(); });

  // Globale Fallback-Listener – halten Styles in Sync, auch bei Sonderfällen
  document.addEventListener("change", (e)=>{
    if (e.target && e.target.matches(".product-card input")) updateProductCardStyle(e.target);
  });
  document.addEventListener("input", (e)=>{
    if (e.target && e.target.matches(".product-card input")) updateProductCardStyle(e.target);
  });
  // Nach jedem Pointer-Up einmal alles refreshen (falls native Radio-Umschaltung greift)
  window.addEventListener("pointerup", ()=>requestAnimationFrame(refreshProductCardStyles), true);
  // Keyboard-Fälle (Space/Enter auf Label)
  window.addEventListener("keyup", (e)=>{ if(e.key===" "||e.key==="Enter") refreshProductCardStyles(); }, true);

  initAccordion();
  initStepAccordion();
  initStepperNav();
  initInfoBoxes();
  updateTourUI(); updateFloorPlansUI();
  refreshProductCardStyles();
  renderSummary(); updateNextBtnStep2();
  
  // Highlight Cards initialisieren
  qsa(".highlight-card input").forEach(inp=>{
    inp.dataset.checked = inp.checked ? "true" : "false";
  });

  // STEP 3
  initStep3();

  // STEP 4
  qs("#finishBtn")?.addEventListener("click", finishBooking);
  qs("#applyDiscount")?.addEventListener("click", applyDiscount);
  qs("#discountCode")?.addEventListener("keypress", (e)=>{ if(e.key==="Enter") applyDiscount(); });
  document.addEventListener("input", ()=> scheduleBookingDraftSave(), true);
  document.addEventListener("change", ()=> scheduleBookingDraftSave(), true);
  window.addEventListener("pagehide", ()=> saveBookingDraft());
  void restoreBookingDraftIfNeeded((hadStarted)=>{
    if(hadStarted){
      revealBookingFlow({ initStep: state.step || 1 });
    }
  }).then((restored)=>{
    if(restored && state.step === 4){
      initBillingAutofill();
    }
  });
  // Rabattcode automatisch aktualisieren bei Eingabe oder Löschen
  // Rabattcode nur über "Anwenden"-Button prüfen
});

// Debug: Kalender-Icon Klick (global)
document.addEventListener("click", (e)=>{
  const btn = e.target.closest("#shootDateBtn");
  if(!btn) return;
  if (window.__datePicker) {
    window.__datePicker.open();
  } else {
    const di = qs("#shootDate");
    di?.showPicker?.();
    di?.focus();
  }
});

// Passwort Auge-Toggle (gilt für alle .pw-eye Buttons auf der Seite)
document.addEventListener("click", (e)=>{
  const btn = e.target.closest(".pw-eye");
  if (!btn) return;
  const targetId = btn.dataset.target;
  if (!targetId) return;
  const input = document.getElementById(targetId);
  if (!input) return;
  const isHidden = input.type === "password";
  input.type = isHidden ? "text" : "password";
  const icon = btn.querySelector("i");
  if (icon) {
    icon.className = isHidden ? "fa-regular fa-eye-slash" : "fa-regular fa-eye";
  }
  btn.setAttribute("aria-label", isHidden ? "Passwort verbergen" : "Passwort anzeigen");
});


// ---------- Product Card Style Sync ----------
function updateProductCardStyle(inp){
  const body = inp?.nextElementSibling;
  if (body) body.classList.toggle("is-checked", !!inp.checked);
  
  // Highlight Cards - Glow-Effekt setzen
  const highlightCard = inp.closest(".highlight-card");
  if(highlightCard){
    const highlightBody = highlightCard.querySelector(".highlight-body");
    if (highlightBody) {
      highlightBody.classList.toggle("is-checked", !!inp.checked);
      if (inp.checked) {
        const gold = getComputedStyle(document.documentElement).getPropertyValue("--gold").trim() || "#9e8649";
        highlightBody.style.borderColor = gold;
        highlightBody.style.borderWidth = "2px";
        highlightBody.style.boxShadow = "0 6px 14px rgba(158,134,73,.15)";
        highlightBody.style.background = "#fff";
      } else {
        highlightBody.style.borderColor = "";
        highlightBody.style.borderWidth = "";
        highlightBody.style.boxShadow = "";
        highlightBody.style.background = "";
      }
    }

    if(inp.checked){
      // Entferne is-selected von allen anderen Highlight-Cards
      qsa(".highlight-card").forEach(c => {
        if(c !== highlightCard) c.classList.remove("is-selected");
      });
      highlightCard.classList.add("is-selected");
    } else {
      highlightCard.classList.remove("is-selected");
    }
  }
}
function refreshProductCardStyles(){
  qsa(".product-card input, .highlight-card input").forEach(updateProductCardStyle);
}

// ---------- Utility: Staging qty initial verstecken ----------
function hideStagingQty(){
  ["stLiving","stBusiness","stRenov"].forEach(id=>{
    const inp=qs("#"+id), wrap=qs(`.qty-wrap[data-for="${id}"]`);
    if (wrap) wrap.hidden = !(inp && inp.checked);
  });
}

// ---------- Stepper + Step-Accordion ----------
function goToStep(n){
  state.step=n;
  qsa(".step-section").forEach((s,i)=> s.hidden=(i!==(n-1)));
  updateStepper();
  updateStepAccordion(n);

  // Scroll zum aktiven Accordion-Item (Sticky-Header berücksichtigen)
  const accItem = qs(`#step-acc-${n}`);
  if(accItem){
    setTimeout(()=>{
      const headerH = qs(".site-header")?.offsetHeight || 80;
      const top = accItem.getBoundingClientRect().top + window.scrollY - headerH - 12;
      window.scrollTo({ top: Math.max(0, top), behavior:'smooth' });
    }, 50);
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Wenn Schritt 1 aktiv wird, Karte initialisieren/aktualisieren
  if(n === 1){
    setTimeout(()=>{
      if(!mapStep1 || !mapStep1._container){
        initMapStep1();
      } else if(mapStep1){
        setTimeout(()=>{
          mapStep1.invalidateSize();
        }, 100);
      }
    }, 100);
  }

  if(n === 3){
    const date = qs("#shootDate")?.value || null;
    const anySelected = !!qs("#prefNoPref")?.checked;
    const selectedKey = anySelected ? "any" : (qs('input[name="photogChk"][data-checked="true"]')?.value || null);

    if(date && (anySelected || selectedKey)){
      onDateOrPhotogChanged();
    }
  }

  if(n === 4){
    // Sicherstellen, dass die Zusatz-Rechnungsadresse sofort korrekt sichtbar ist.
    initDiffBillAddrToggleOnce();
    applyDiffBillingAddressVisibility();
  }
}

function updateStepAccordion(n){
  for(let i = 1; i <= totalSteps; i++){
    const item = qs(`#step-acc-${i}`);
    if(!item) continue;
    item.classList.toggle("is-open",   i === n);
    item.classList.toggle("is-done",   i <  n);
    item.classList.remove("is-locked");
    const header = item.querySelector(".step-acc-header");
    if(header) header.setAttribute("aria-expanded", String(i === n));
  }
  updateStepSummaries();
}

function updateStepSummaries(){
  // Schritt 1 – Adresse + Typ + Fläche
  const s1 = qs("#step-summary-1");
  if(s1){
    if(state.step > 1 && state.address){
      const typeMap = {
        apartment:"Wohnung", single_house:"EFH", multi_house:"MFH",
        commercial:"Gewerbe", land:"Grundstück"
      };
      const type = typeMap[state.object?.type] || state.object?.type || "";
      const area = state.object?.area ? ` · ${state.object.area} m²` : "";
      s1.textContent = [state.address, type + area].filter(Boolean).join("  ·  ");
    } else { s1.textContent = ""; }
  }
  // Schritt 2 – Dienstleistungen
  const s2 = qs("#step-summary-2");
  if(s2){
    if(state.step > 2){
      const parts = [];
      if(state.package?.label) parts.push(state.package.label);
      if(state.addons?.length) parts.push(state.addons.map(a=> a.label).join(", "));
      s2.textContent = parts.join("  +  ") || "";
    } else { s2.textContent = ""; }
  }
  // Schritt 3 – Fotograf & Termin
  const s3 = qs("#step-summary-3");
  if(s3){
    if(state.step > 3 && state.date && state.time){
      const photog = state.photographer?.name ? `${state.photographer.name}  ·  ` : "";
      const dateStr = state.date ? new Date(state.date).toLocaleDateString("de-CH",{day:"2-digit",month:"2-digit",year:"numeric"}) : "";
      const provisionalSuffix = state.provisionalBooking ? t("sum_provisional_suffix") : "";
      s3.textContent = `${photog}${dateStr}  ·  ${state.time || ""}${provisionalSuffix}`;
    } else { s3.textContent = ""; }
  }
}

function initStepAccordion(){
  qsa(".step-acc-header").forEach((header, i) => {
    header.addEventListener("click", ()=>{
      goToStep(i + 1);
    });
  });
}


function nextStep(){
  if(state.step===1){
    clearNotice();
    const type = qs("#type").value.trim();
    const area = parseInt(qs("#area").value,10);
    const floors = parseInt(qs("#floors").value,10);
    const desc = (qs("#objDesc")?.value||"").trim();
    const addressInput = qs("#address")?.value.trim() || "";

    // Adresse prüfen - entweder über state.flags.address ODER direkt aus Input
    if(!state.flags.address && !addressInput){
      showNotice(t("msg_address_required"),"error");
      qs("#address")?.focus();
      return;
    }
    
    // Falls Adresse im Input steht aber nicht in state, übernehme sie
    if(addressInput && !state.flags.address){
      state.address = stripCountrySuffix(addressInput);
      state.flags.address = true;
      renderSummary();
    }

    // Hausnummer prüfen: entweder über parsedAddress (Vorschlag gewählt) oder Regex als Fallback
    const hasHouseNumberFromParsed = !!(state.parsedAddress && state.parsedAddress.houseNumber);
    if(!hasHouseNumberFromParsed){
      // Regex-Fallback: Hausnummer nur im Strassenteil akzeptieren (nicht z.B. nur PLZ wie "8038 Zürich")
      const addressBeforeZip = addressInput.replace(/\b\d{4}\b.*$/, "").trim();
      const streetPart = (addressBeforeZip || addressInput).split(",")[0].trim();
      const hasHouseNumber = /\d+[a-zA-Z]?\b/.test(streetPart);
      if(!hasHouseNumber){
        showNotice(t("msg_address_house_required"),"error");
        qs("#address")?.focus();
        return;
      }
    }
    const hasZipOrCity = !!(state.parsedAddress && state.parsedAddress.zip)
      || /\b\d{4}\b/.test(addressInput) || /,\s*\S+/.test(addressInput);
    if(!hasZipOrCity){
      showNotice(t("msg_address_city_required"),"error");
      qs("#address")?.focus();
      return;
    }
    
    if(!type){ showNotice(t("msg_type_required"),"error"); qs("#type").focus(); return; }
    if(!area || area<1){ showNotice(t("msg_area_required"),"error"); qs("#area").focus(); return; }
    if(!floors || floors<1){ showNotice(t("msg_floors_required"),"error"); qs("#floors").focus(); return; }
    // Beschreibung ist optional

    goToStep(2);
  } else if(state.step===2){
    if(!(state.package.key || state.addons.length)){ showNotice(t("msg_service_required"),"error"); return; }
    goToStep(3);
  } else if(state.step===3){
    if(!(hasPhotogSelection() && state.date && state.time)){ showNotice(t("msg_datetime_required"),"error"); return; }
    goToStep(4);
    initBillingAutofill();
  }
}
function prevStep(){ if(state.step>1) goToStep(state.step-1); }
function updateStepper(){
  qsa(".stepper .step").forEach((li,i)=>{
    li.classList.toggle("is-active", i===state.step-1);
    li.classList.toggle("is-done",   i< state.step-1);
  });
  const bar=qs("#progressBar"); if(bar) bar.style.width=((state.step-1)/(totalSteps-1)*100)+"%";
}

function initStepperNav(){
  qsa(".stepper .step").forEach((li,i)=>{
    li.style.cursor = "pointer";
    li.addEventListener("click", ()=> goToStep(i + 1));
  });
}

// ==============================
// Schritt 1 – Standort
// ==============================
const CH_CENTER = { lat:46.8182, lon:8.2275 };
let mapStep1, markerStep1, previewMarker = null;
let mapInitInProgress = false;
let reverseGeocodeReqId = 0;
let reverseGeocodeAbort = null;

let _mapsConfig = null;
function ensureGoogleMapsAssets(){
  return new Promise((resolve,reject)=>{
    if(window.google && window.google.maps && window.google.maps.Map){
      if(_mapsConfig) return resolve(_mapsConfig);
      fetchPublicConfig()
        .then(j=>{ _mapsConfig = j || {}; resolve(_mapsConfig); })
        .catch(()=>resolve({}));
      return;
    }
    const existing = document.querySelector('script[src*="maps.googleapis.com"]');
    if(existing){
      const wait = (attempt=0)=>{
        if(window.google && window.google.maps && window.google.maps.Map){
          if(!_mapsConfig){
            fetchPublicConfig()
              .then(j=>{ _mapsConfig = j || {}; resolve(_mapsConfig); })
              .catch(()=>resolve({}));
          } else resolve(_mapsConfig);
          return;
        }
        if(attempt > 50) return reject(new Error("Google Maps konnte nicht geladen werden."));
        setTimeout(()=>wait(attempt+1), 100);
      };
      return wait();
    }
    fetchPublicConfig()
      .then(j=>{
        _mapsConfig = j || {};
        const key = (_mapsConfig.googleMapsKey) || "";
        if(!key) return resolve(_mapsConfig); // Kein Key: graceful degradation, keine Karte
        const script = document.createElement("script");
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&language=de&libraries=marker&loading=async`;
        script.async = true;
        script.defer = true;
        script.onload = ()=>resolve(_mapsConfig);
        script.onerror = ()=>reject(new Error("Google Maps Script konnte nicht geladen werden."));
        document.head.appendChild(script);
      })
      .catch(reject);
  });
}

function initMapStep1(){
  const mapEl=qs("#map"), status=qs("#addressStatus"); 
  if(!mapEl) {
    console.warn("Karten-Element #map nicht gefunden");
    return;
  }
  if(mapInitInProgress) return;
  mapInitInProgress = true;

  // Stelle sicher, dass Karte sichtbar ist
  mapEl.style.height = "400px";
  mapEl.style.width = "100%";
  mapEl.style.display = "block";
  mapEl.style.visibility = "visible";
  mapEl.style.opacity = "1";
  
  // Prüfe ob Google-Karte bereits existiert
  if(mapStep1 && window.google?.maps?.Map && document.body.contains(mapEl)){
    try {
      if(mapStep1 instanceof google.maps.Map){
        mapInitInProgress = false;
        return;
      }
    } catch(e) {
      mapStep1 = null;
      markerStep1 = null;
    }
  }
  
  ensureGoogleMapsAssets().then((config)=>{
    if(!config?.googleMapsKey){
      mapInitInProgress = false;
      if(status){ status.textContent=t("msg_map_unavailable"); status.className="status"; }
      mapEl.innerHTML='<div style="padding:16px;text-align:center;color:#555">'+t("msg_map_unavailable")+'</div>';
      return;
    }
    const tryInit=(attempt=0)=>{
      if(!window.google?.maps?.Map){
        if(attempt < 20) return setTimeout(()=>tryInit(attempt+1), 100);
        throw new Error("Google Maps konnte nicht geladen werden");
      }
      try{
        mapStep1 = null;
        markerStep1 = null;
        mapEl.innerHTML = "";
        const center = { lat: CH_CENTER.lat, lng: CH_CENTER.lon };
        const mapId = (config && config.googleMapId) || "DEMO_MAP_ID";
        const mapOpts = {
          center,
          zoom: 7,
          mapTypeId: "satellite",
          scrollwheel: true,
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: true,
          zoomControl: true,
        };
        if(mapId) mapOpts.mapId = mapId;
        try {
          mapStep1 = new google.maps.Map(mapEl, mapOpts);
        } catch(e) {
          delete mapOpts.mapId;
          mapStep1 = new google.maps.Map(mapEl, mapOpts);
        }
        mapInitInProgress = false;
        
        setTimeout(()=>{ if(mapStep1) mapStep1.panTo(center); }, 100);
        
        // Klick-Event
        mapStep1.addListener("click", async (e)=>{
          const lat = e.latLng.lat();
          const lng = e.latLng.lng();
          placeMarkerStep1(lat,lng);
          // sofortiger UI-Status
          state.coords = {lat,lng};
          state.flags.address = true;
          qs("#nextStep1").disabled = false;
          if(status){
            status.textContent = t("msg_address_loading");
            status.className = "status";
          }
          renderSummary();
          const {addr, parsed, requestId, ms} = await reverseGeocodeCH(lat,lng);
          if(addr && requestId === reverseGeocodeReqId){
            const cleanAddr = stripCountrySuffix(addr);
            qs("#address").value=cleanAddr; 
            state.address=cleanAddr; 
            state.coords={lat,lng}; 
            state.flags.address=true;
            state.parsedAddress = parsed?.complete ? {
              street: parsed.street || "",
              houseNumber: parsed.houseNumber || "",
              zip: parsed.zip || "",
              city: parsed.city || "",
            } : null;
            if(status){ 
              status.textContent=t("msg_address_confirmed"); 
              status.className="status ok"; 
            }
            renderSummary(); 
            showToast(t("msg_address_updated"));
          }
        });
        
        console.log("Karte erfolgreich initialisiert");
      }catch(err){
        mapInitInProgress = false;
        console.error("Karten-Fehler:", err);
        if(status){ 
          status.textContent=t("msg_map_init_error") + " " + err.message; 
          status.className="status"; 
        }
        mapEl.innerHTML='<div style="padding:16px;text-align:center;color:#555">' + t("msg_map_unavailable") + '</div>';
      }
    };
    tryInit();
  }).catch(err=>{
    mapInitInProgress = false;
    console.error("Google-Maps-Lade-Fehler:", err);
    if(status){ 
      status.textContent=t("msg_leaflet_error"); 
      status.className="status"; 
    }
    mapEl.innerHTML='<div style="padding:16px;text-align:center;color:#555">' + t("msg_map_unavailable") + '</div>';
  });
}

function createMarker(pos, opts){
  const Adv = window.google?.maps?.marker?.AdvancedMarkerElement;
  if(Adv){
    return new Adv({
      position: pos,
      map: mapStep1,
      gmpDraggable: opts?.draggable !== false,
    });
  }
  return new google.maps.Marker({
    position: pos,
    map: mapStep1,
    draggable: opts?.draggable !== false,
  });
}

function placeMarkerStep1(lat,lng){
  if(!window.google?.maps || !mapStep1) {
    console.warn("Karte nicht verfügbar für Marker");
    return;
  }
  const pos = { lat, lng };
  if(!markerStep1){
    markerStep1 = createMarker(pos, { draggable: true });
    markerStep1.addListener("dragend", async ()=>{
      const p = markerStep1.position ?? markerStep1.getPosition?.();
      const plat = (typeof p?.lat === "function" ? p.lat() : p?.lat) ?? 0;
      const plng = (typeof p?.lng === "function" ? p.lng() : p?.lng) ?? 0;
      state.coords = {lat:plat,lng:plng};
      state.flags.address = true;
      qs("#nextStep1").disabled = false;
      const s=qs("#addressStatus"); if(s){ s.textContent=t("msg_address_loading"); s.className="status"; }
      renderSummary();
      const {addr, parsed, requestId} = await reverseGeocodeCH(plat,plng);
      if(addr && requestId === reverseGeocodeReqId){
        const cleanAddr = stripCountrySuffix(addr);
        qs("#address").value=cleanAddr;
        state.address=cleanAddr;
        state.coords={lat:plat,lng:plng};
        state.flags.address=true;
        state.parsedAddress = parsed?.complete ? {
          street: parsed.street || "",
          houseNumber: parsed.houseNumber || "",
          zip: parsed.zip || "",
          city: parsed.city || "",
        } : null;
        qs("#nextStep1").disabled=false; const s=qs("#addressStatus"); if(s){ s.textContent=t("msg_address_confirmed"); s.className="status ok"; }
        renderSummary();
        showToast(t("msg_address_updated"));
      }
    });
  } else { 
    markerStep1.setPosition(pos); 
  }
  mapStep1.panTo(pos);
  mapStep1.setZoom(17);
}

async function reverseGeocodeCH(lat,lng){
  reverseGeocodeReqId += 1;
  const requestId = reverseGeocodeReqId;
  if(reverseGeocodeAbort){
    try{ reverseGeocodeAbort.abort(); }catch(e){}
  }
  reverseGeocodeAbort = new AbortController();
  const base = API_BASE || location.origin;
  const u = new URL("/api/reverse-geocode", base);
  u.searchParams.set("lat", lat);
  u.searchParams.set("lng", lng);
  try{
    const r = await fetch(u.toString(), { headers: { Accept: "application/json" }, signal: reverseGeocodeAbort.signal });
    if(!r.ok) return { addr: "", requestId };
    const j = await r.json();
    const addr = j.addr || "";
    const parsed = j.parsed || null;
    return { addr, parsed, requestId };
  }catch{
    return { addr: "", requestId };
  }
}


// ---------- Adress-Suggest via Backend-Proxy ----------
async function fetchAddressSuggest(q, signal) {
  const url = new URL(ADDRESS_AUTOCOMPLETE_ENDPOINT, API_BASE || location.origin);
  url.searchParams.set("q", q);
  url.searchParams.set("lang", currentLang === "de" ? "de-CH" : currentLang);
  try {
    const r = await fetch(url.toString(), { signal, headers: { Accept: "application/json" } });
    if (!r.ok) return [];
    const json = await r.json();
    return Array.isArray(json.results) ? json.results.map(normalizeAddressSuggestResult).filter(Boolean) : [];
  } catch(_) { return []; }
}

function stripCountrySuffix(text){
  return String(text || "")
    .replace(/,\s*Schweiz$/i, "")
    .replace(/\s*Schweiz$/i, "")
    .trim();
}

function parseSwissStreetLine(text){
  const cleaned = stripCountrySuffix(text).trim();
  if(!cleaned) return { street: "", houseNumber: "" };
  const match = cleaned.match(/^(.*?)(?:\s+(\d+[A-Za-z]?[\w/-]*))$/);
  if(!match) return { street: cleaned, houseNumber: "" };
  return {
    street: String(match[1] || "").trim(),
    houseNumber: String(match[2] || "").trim(),
  };
}

function parseSwissZipCity(text){
  const cleaned = stripCountrySuffix(text).trim();
  if(!cleaned) return { zip: "", city: "" };
  const match = cleaned.match(/^(\d{4})\s+(.+)$/);
  if(!match) return { zip: "", city: cleaned };
  return {
    zip: String(match[1] || "").trim(),
    city: String(match[2] || "").trim(),
  };
}

function normalizeAddressSuggestResult(raw){
  if(!raw || typeof raw !== "object") return null;
  const main = stripCountrySuffix(raw.main || raw.display || "");
  const sub = stripCountrySuffix(raw.sub || "");
  const parsedStreet = parseSwissStreetLine(main);
  const parsedZipCity = parseSwissZipCity(sub);
  const countryCode = String(raw.countryCode || raw.country_code || "CH").toUpperCase();
  const street = String(raw.street || parsedStreet.street || "").trim();
  const houseNumber = String(raw.houseNumber || raw.house_number || parsedStreet.houseNumber || "").trim();
  const zip = String(raw.zip || raw.postcode || parsedZipCity.zip || "").trim();
  const city = String(raw.city || raw.town || raw.village || raw.municipality || parsedZipCity.city || "").trim();
  const hasExplicitComplete = typeof raw.complete === "boolean";
  const complete = hasExplicitComplete
    ? raw.complete
    : Boolean(street && houseNumber && zip && city && countryCode === "CH");

  return {
    ...raw,
    type: raw.type || (street ? "address" : "place"),
    main,
    sub,
    street,
    houseNumber,
    zip,
    city,
    countryCode,
    complete,
  };
}

// ---------- PLZ → Ort Autocomplete (Schritt 4 Rechnungsdetails) ----------
function initZipCityAutocompleteFor(zipSelector, citySelector){
  const zipInput = qs(zipSelector);
  const cityInput = qs(citySelector);
  if(!zipInput || !cityInput || zipInput.dataset.zipCityInit === "1") return;
  zipInput.dataset.zipCityInit = "1";

  const fetchCity = debounce(async (val) => {
    const zip = String(val || "").replace(/\D/g, "").slice(0, 4);
    if(zip.length < 4) return;
    if(String(val || "").trim().length > 4 && /\s/.test(String(val || "").trim())) return;
    try {
      const results = await fetchAddressSuggest(zip, undefined);
      const place = results.find(r => r.type === "place" || r.type === "address");
      if(place) {
        const cityPart = place.city || (place.type === "place" ? place.main : place.sub);
        if(cityPart && String(cityPart).trim()) {
          cityInput.value = String(cityPart).trim().replace(/^\d{4,6}\s*/, "");
        }
      }
    } catch(_) {}
  }, 400);

  zipInput.addEventListener("input", (e) => {
    fetchCity(e.target.value);
  });
}

function initZipCityAutocomplete(){
  initZipCityAutocompleteFor("#billZip", "#billCity");
  initZipCityAutocompleteFor("#altBillZip", "#altBillCity");
}

// ---------- Rechnungsadresse Autocomplete (Strasse + PLZ/Ort) ----------
function initStreetAutocomplete(inputSelector, listSelector, zipSelector, citySelector, suggestionPrefix){
  const input = qs(inputSelector);
  const list = qs(listSelector);
  const zipInput = qs(zipSelector);
  const cityInput = qs(citySelector);
  if(!input || !list || input.dataset.streetAutocompleteInit === "1") return;
  input.dataset.streetAutocompleteInit = "1";

  let activeIndex = -1;
  let currentItems = [];
  let suggestAbort = null;
  let suggestReqSeq = 0;

  function resetList(){
    list.innerHTML = "";
    list.hidden = true;
    activeIndex = -1;
    currentItems = [];
    input.setAttribute("aria-expanded", "false");
  }

  function updateActive(){
    Array.from(list.children).forEach((li, i) => {
      li.classList.toggle("is-active", i === activeIndex);
      if(i === activeIndex) li.scrollIntoView({ block:"nearest" });
    });
  }

  function choose(idx){
    const it = currentItems[idx];
    if(!it) return;
    input.value = it.street;
    if (it.zipcity) {
      const parsed = parseZipCity(it.zipcity);
      if (zipInput && parsed.zip) zipInput.value = parsed.zip;
      if (cityInput && parsed.city) cityInput.value = parsed.city;
    }
    const incomplete = !it.complete;
    if(incomplete){
      showNotice("Bitte Strasse und Hausnummer ergänzen.", "error");
    }
    resetList();
    if(incomplete){
      input.focus();
    } else {
      cityInput ? cityInput.focus() : input.blur();
    }
  }

  function render(items){
    list.innerHTML = "";
    if(!items.length){ list.hidden = true; return; }
    items.forEach((it, i) => {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.setAttribute("id", `${suggestionPrefix}-${i}`);
      li.className = "sugg-item-wrap";
      li.innerHTML = `<div class="sugg-item"><div class="sugg-ico" aria-hidden="true"><i class="fa-solid fa-location-dot"></i></div><div class="sugg-text"><p class="main">${escapeHTML(it.street)}</p><p class="sub">${escapeHTML(it.zipcity)}</p></div></div>`;
      li.addEventListener("mousedown", e => { e.preventDefault(); choose(i); });
      list.appendChild(li);
    });
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    activeIndex = -1;
  }

  const fetchSuggest = debounce(async q => {
    if(!q || q.trim().length < 3){ resetList(); return; }
    suggestReqSeq += 1;
    const reqSeq = suggestReqSeq;
    if(suggestAbort){
      try { suggestAbort.abort(); } catch(_) {}
    }
    suggestAbort = new AbortController();
    try {
      const results = await fetchAddressSuggest(q, suggestAbort.signal);
      if(reqSeq !== suggestReqSeq) return;
      const items = results
        .filter(r => r.type === "address" && String(r.countryCode || "").toUpperCase() === "CH")
        .map(r => ({
          street: stripCountrySuffix(r.main || "").trim(),
          zipcity: r.zip && r.city ? `${r.zip} ${r.city}` : stripCountrySuffix(r.sub || ""),
          complete: Boolean(r.complete && r.street && r.houseNumber && r.zip && r.city),
        }))
        .filter((it, i, arr) => arr.findIndex(x => x.street === it.street && x.zipcity === it.zipcity) === i)
        .slice(0, 5);
      currentItems = items;
      render(items);
    } catch(err) {
      if(err?.name === "AbortError") return;
      resetList();
    }
  }, 300);

  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", list.id);

  input.addEventListener("input", e => fetchSuggest(e.target.value.trim()));
  input.addEventListener("blur", () => setTimeout(resetList, 150));
  input.addEventListener("keydown", e => {
    if(list.hidden || !currentItems.length) return;
    if(e.key === "ArrowDown"){ e.preventDefault(); activeIndex = (activeIndex + 1) % currentItems.length; updateActive(); }
    else if(e.key === "ArrowUp"){ e.preventDefault(); activeIndex = (activeIndex - 1 + currentItems.length) % currentItems.length; updateActive(); }
    else if(e.key === "Enter"){ if(activeIndex >= 0){ e.preventDefault(); choose(activeIndex); } }
    else if(e.key === "Escape"){ resetList(); }
  });
}

function initBillStreetAutocomplete(){
  initStreetAutocomplete("#billStreet", "#billStreetSuggestions", "#billZip", "#billCity", "bill-sug");
  initStreetAutocomplete("#altBillStreet", "#altBillStreetSuggestions", "#altBillZip", "#altBillCity", "alt-bill-sug");
}

// ---------- Schlüsselabholung Autocomplete ----------
function initKeyAddressAutocomplete(){
  const input = qs("#keyAddress");
  const list = qs("#keyAddressSuggestions");
  if(!input) return;

  // Dropdown-Liste dynamisch erstellen falls nicht im HTML
  let suggList = list;
  if(!suggList){
    suggList = document.createElement("ul");
    suggList.id = "keyAddressSuggestions";
    suggList.className = "suggestions";
    suggList.hidden = true;
    suggList.setAttribute("role", "listbox");
    input.parentNode.appendChild(suggList);
  }

  let activeIndex = -1;
  let currentItems = [];
  let suggestAbort = null;
  let suggestReqSeq = 0;

  const resetList = () => {
    suggList.innerHTML = "";
    suggList.hidden = true;
    activeIndex = -1;
    currentItems = [];
    input.setAttribute("aria-expanded", "false");
  };

  const choose = (idx) => {
    const it = currentItems[idx];
    if(!it) return;
    const display = `${it.main}${it.sub ? ', ' + it.sub : ''}`;
    input.value = stripCountrySuffix(display);
    if(!it.complete){
      showNotice("Bitte eine vollständige Adresse mit Hausnummer wählen.", "error");
      input.focus();
      resetList();
      return;
    }
    resetList();
    input.blur();
  };

  const render = (items) => {
    suggList.innerHTML = "";
    if(!items.length){ suggList.hidden = true; return; }
    items.forEach((it, i) => {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.setAttribute("id", `key-sug-${i}`);
      li.className = "sugg-item-wrap";
      li.innerHTML = `<div class="sugg-item"><div class="sugg-ico" aria-hidden="true"><i class="fa-solid fa-location-dot"></i></div><div class="sugg-text"><p class="main">${escapeHTML(it.main)}</p><p class="sub">${escapeHTML(it.sub||"")}</p></div></div>`;
      li.addEventListener("mousedown", e => { e.preventDefault(); choose(i); });
      suggList.appendChild(li);
    });
    suggList.hidden = false;
    input.setAttribute("aria-expanded", "true");
    activeIndex = -1;
  };

  const fetchSuggest = debounce(async q => {
    if(!q || q.trim().length < 3){ resetList(); return; }
    suggestReqSeq += 1;
    const reqSeq = suggestReqSeq;
    if(suggestAbort){
      try { suggestAbort.abort(); } catch(_) {}
    }
    suggestAbort = new AbortController();
    try {
      const results = await fetchAddressSuggest(q, suggestAbort.signal);
      if(reqSeq !== suggestReqSeq) return;
      const filtered = results
        .filter(r => r.type === "address" && String(r.countryCode || "").toUpperCase() === "CH")
        .map(r => ({ ...r, complete: Boolean(r.complete && r.street && r.houseNumber && r.zip && r.city) }))
        .slice(0, 5);
      currentItems = filtered;
      render(filtered);
    } catch(err) {
      if(err?.name === "AbortError") return;
      resetList();
    }
  }, 300);

  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", "keyAddressSuggestions");

  input.addEventListener("input", e => fetchSuggest(e.target.value.trim()));
  input.addEventListener("blur", () => setTimeout(resetList, 150));
  input.addEventListener("keydown", e => {
    if(suggList.hidden || !currentItems.length) return;
    if(e.key === "ArrowDown"){ e.preventDefault(); activeIndex = (activeIndex + 1) % currentItems.length; updateActive(); }
    else if(e.key === "ArrowUp"){ e.preventDefault(); activeIndex = (activeIndex - 1 + currentItems.length) % currentItems.length; updateActive(); }
    else if(e.key === "Enter"){ if(activeIndex >= 0){ e.preventDefault(); choose(activeIndex); } }
    else if(e.key === "Escape"){ resetList(); }
  });
  function updateActive(){ [...suggList.children].forEach((li,i) => li.setAttribute("aria-selected", String(i===activeIndex))); if(activeIndex>=0) suggList.children[activeIndex]?.scrollIntoView?.({block:"nearest"}); }
}

// ---------- Autocomplete ----------
function initAddressAutocomplete(){
  const input=qs("#address"), list=qs("#addressSuggestions"), status=qs("#addressStatus");
  if(!input||!list) return;
  let activeIndex=-1, currentItems=[];
  let suggestAbort = null;
  let suggestReqSeq = 0;

  const resetList=()=>{ 
    list.innerHTML=""; 
    list.hidden=true; 
    list.setAttribute("aria-expanded","false"); 
    activeIndex=-1; 
    currentItems=[];
    // Entferne Preview-Marker wenn Liste geschlossen wird
    if(previewMarker){
      try{ if(typeof previewMarker.setMap === "function") previewMarker.setMap(null); else if("map" in previewMarker) previewMarker.map = null; }catch(e){}
      previewMarker = null;
    }
  };

  const render=(items,query)=>{
    list.innerHTML=""; currentItems=items;
    if(!items.length){ 
      // Empty-State: keine vollständige Adresse gefunden
      const li=document.createElement("li");
      li.className="sugg-empty";
      li.textContent=t("msg_no_address_with_housenumber") || "Keine vollständige Adresse gefunden (Hausnummer erforderlich).";
      list.appendChild(li);
      list.hidden=false;
      return;
    }
    items.forEach((it,idx)=>{
      const li=document.createElement("li");
      li.setAttribute("role","option"); li.setAttribute("id","addr-opt-"+idx); li.className="sugg-item-wrap";
      li.innerHTML=`<div class="sugg-item"><div class="sugg-ico" aria-hidden="true"><i class="fa-solid fa-location-dot"></i></div>
        <div class="sugg-text"><div class="main">${highlight(it.labelMain,query)}</div>
        <div class="sub">${it.labelSub||""}</div></div></div>`;
      li.addEventListener("mousedown", e=>{ e.preventDefault(); choose(idx); });
      list.appendChild(li);
    });
    list.hidden=false; list.setAttribute("aria-expanded","true");
  };

  const choose=(idx)=>{
    const it=currentItems[idx]; if(!it) return;
    const full=stripCountrySuffix(`${it.labelMain}${it.labelSub?', '+it.labelSub:''}`);
    input.value=full; resetList();

    if(!it.complete){
      showNotice("Bitte eine vollständige Adresse mit Hausnummer wählen.","error");
      input.focus();
      return;
    }
    
    // Strukturierte Adressdaten speichern
    state.parsedAddress = it.houseNumber ? {
      street: it.street || "",
      houseNumber: it.houseNumber || "",
      zip: it.zip || "",
      city: it.city || "",
    } : null;

    // Adresse setzen - auch ohne Karte!
    state.address=full;
    state.coords={lat:it.lat,lng:it.lng ?? it.lon};
    state.flags.address=true;
    qs("#nextStep1").disabled=false;
    if(status){
      status.textContent=t("msg_address_confirmed");
      status.className="status ok";
    }
    renderSummary();
    
    // Karte aktualisieren und Marker setzen (falls Karte verfügbar)
    if(mapStep1 && window.google?.maps){
      if(previewMarker){
        try{ if(typeof previewMarker.setMap === "function") previewMarker.setMap(null); else if("map" in previewMarker) previewMarker.map = null; }catch(e){}
        previewMarker = null;
      }
      placeMarkerStep1(it.lat,it.lon ?? it.lng);
      showToast(t("msg_address_on_map"));
    } else {
      setTimeout(()=>{
        if(mapStep1 && window.google?.maps){
          placeMarkerStep1(it.lat,it.lon ?? it.lng);
        } else {
          setTimeout(()=>{
            if(mapStep1 && window.google?.maps) placeMarkerStep1(it.lat,it.lon ?? it.lng);
          }, 1000);
        }
      }, 300);
      showToast(t("msg_address_updated"));
    }
  };

  const fetchSuggest=debounce(async q=>{
    if(!q || q.trim().length<3){ 
      resetList(); 
      if(status){ status.textContent=""; status.className="status"; } 
      if(mapStep1 && window.google?.maps && previewMarker){
        try{ if(typeof previewMarker.setMap === "function") previewMarker.setMap(null); else if("map" in previewMarker) previewMarker.map = null; }catch(e){}
        previewMarker = null;
      }
      return; 
    }
    try{
      suggestReqSeq += 1;
      const reqSeq = suggestReqSeq;
      if(suggestAbort){
        try { suggestAbort.abort(); } catch(_) {}
      }
      suggestAbort = new AbortController();
      list.innerHTML=`<li class="loading">${t("search_loading")} „${escapeHTML(q)}"…</li>`; list.hidden=false;
      const results = await fetchAddressSuggest(q, suggestAbort.signal);
      if(reqSeq !== suggestReqSeq) return;
      // Phase 1: CH-only, aber nicht auf Hausnummer blockieren
      const filtered = results
        .filter(r => r.type === "address" && String(r.countryCode || "").toUpperCase() === "CH")
        .slice(0, 5);
      const items = filtered.map(r => ({
        lat: r.lat, lon: r.lon, lng: r.lng,
        labelMain: stripCountrySuffix(r.main || ""),
        labelSub: stripCountrySuffix(r.sub || ""),
        street: r.street,
        houseNumber: r.houseNumber,
        zip: r.zip,
        city: r.city,
        complete: Boolean(r.complete && r.street && r.houseNumber && r.zip && r.city),
      }));
      render(items,q);
      
      if(items.length > 0 && mapStep1 && window.google?.maps){
        const firstItem = items[0];
        const pos = { lat: firstItem.lat, lng: firstItem.lon || firstItem.lng };
        if(previewMarker){
          try{ if(typeof previewMarker.setMap === "function") previewMarker.setMap(null); else if("map" in previewMarker) previewMarker.map = null; }catch(e){}
          previewMarker = null;
        }
        previewMarker = createMarker(pos, { draggable: false });
        mapStep1.panTo(pos);
        mapStep1.setZoom(17);
      }
      
      if(status){ status.textContent=""; status.className="status"; }
    }catch(err){
      if(err?.name === "AbortError") return;
      resetList();
      if(status){ status.textContent=t("msg_search_unavailable"); status.className="status warn"; }
      showToast(t("msg_address_search_unavailable"));
    }
  },300);

  input.setAttribute("role","combobox");
  input.setAttribute("aria-autocomplete","list");
  input.setAttribute("aria-expanded","false");
  input.setAttribute("aria-controls","addressSuggestions");

  input.addEventListener("input", e=>{
    const value = e.target.value.trim();
    if(!value){
      state.address = "";
      state.flags.address = false;
      state.parsedAddress = null;
      qs("#nextStep1").disabled = true;
      renderSummary();
    } else {
      // User tippt manuell → parsedAddress zurücksetzen bis ein Vorschlag gewählt wird
      state.parsedAddress = null;
    }
    fetchSuggest(value);
  });
  input.addEventListener("focus", ()=>{ if(currentItems.length){ list.hidden=false; input.setAttribute("aria-expanded","true"); }});
  input.addEventListener("blur", ()=>{
    const value = input.value.trim();
    if(value){
      state.address = stripCountrySuffix(value);
      state.flags.address = true;
      qs("#nextStep1").disabled = false;
      renderSummary();
    }
    setTimeout(()=>resetList(),120);
  });
  input.addEventListener("keydown", e=>{
    if(list.hidden || !currentItems.length) return;
    if(e.key==="ArrowDown"){ e.preventDefault(); activeIndex=(activeIndex+1)%currentItems.length; updateActive(); }
    else if(e.key==="ArrowUp"){ e.preventDefault(); activeIndex=(activeIndex-1+currentItems.length)%currentItems.length; updateActive(); }
    else if(e.key==="Enter"){ if(activeIndex>=0){ e.preventDefault(); choose(activeIndex); } }
    else if(e.key==="Escape"){ resetList(); }
  });
  function updateActive(){ [...list.children].forEach((li,i)=>li.setAttribute("aria-selected", String(i===activeIndex))); if(activeIndex>=0) list.children[activeIndex]?.scrollIntoView?.({block:"nearest"}); }
}
function highlight(text,q){ if(!text) return ""; try{ const re=new RegExp(q.trim().split(/\s+/).map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|"),"gi"); return text.replace(re,m=>`<mark>${m}</mark>`);}catch{return text;} }
function escapeHTML(s){ return s.replace(/[&<>"']/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m])); }

// ==============================
// Schritt 2 – Leistungen
// ==============================
function onObjectChanged(){
  state.object.type = qs("#type")?.value || "";
  state.object.area = qs("#area")?.value || "";
  state.object.floors = Math.max(1, parseInt(qs("#floors")?.value||"1",10));
  state.object.rooms = qs("#rooms")?.value || "";
  state.object.specials = qs("#specials")?.value || "";
  state.object.desc = qs("#objDesc")?.value || "";
  state.object.onsiteName = qs("#onsiteName")?.value || "";
  state.object.onsitePhone = qs("#onsitePhone")?.value || "";
  state.flags.object = !!(state.object.type || state.object.area || state.object.floors>1 || state.object.rooms || state.object.specials || state.object.desc);
  updateTourUI(); syncTour(); updateFloorPlansUI(); syncFloorPlans(); updateExpressAvailability();
  renderSummary(); updateNextBtnStep2();
}

function upsertAddon(id, group, label, price, labelKey=""){
  const i=state.addons.findIndex(a=>a.id===id);
  if(price<=0){ if(i>-1) state.addons.splice(i,1); }
  else if(i>-1){ state.addons[i] = {id, group, label, labelKey, price}; }
  else { state.addons.push({id, group, label, labelKey, price}); }
  state.flags.addons = state.addons.length>0;
}
function removeGroup(group){
  state.addons = state.addons.filter(a=>a.group!==group);
  state.flags.addons = state.addons.length>0;
}
function attachSingleGroup(name, group){
  makeRadiosUncheckable(
    name,
    ()=>{ removeGroup(group); updateExpressAvailability(); renderSummary(); updateNextBtnStep2(); refreshProductCardStyles(); },
    (inp)=>{ removeGroup(group); upsertAddon(`${group}:${inp.value}`, group, inp.dataset.label, +inp.dataset.price||0, inp.dataset.i18nLabel||""); updateExpressAvailability(); renderSummary(); updateNextBtnStep2(); refreshProductCardStyles(); }
  );
}
function makeRadiosUncheckable(name, onUncheck, onCheck){
  const radios=qsa(`input[name="${name}"]`);
  radios.forEach(r=>{
    r.dataset.checked = r.checked ? "true" : "false";
    
    // Label-Click für bessere UX
    const label = r.closest("label");
    if(label){
      label.addEventListener("click", e=>{
        // Ignoriere Info-Button Klicks
        if(e.target.classList.contains("info-btn") || e.target.closest(".info-btn")){
          e.stopPropagation();
          return;
        }
        // Verhindert doppeltes Toggle durch native Label-Click
        e.preventDefault();
        
        const was=r.dataset.checked==="true";
        radios.forEach(x=>{
          x.dataset.checked="false";
          if(x!==r) x.checked=false;
          updateProductCardStyle(x);
        });
        
        if(was){
          e.preventDefault();
          r.checked=false;
          r.dataset.checked="false";
          onUncheck?.();
        } else {
          r.checked=true;
          r.dataset.checked="true";
          onCheck?.(r);
        }
        
        updateProductCardStyle(r);
        
        // Highlight-Card Glow-Effekt explizit setzen
        if(r.closest(".highlight-card")){
          const card = r.closest(".highlight-card");
          if(card){
            qsa(".highlight-card").forEach(c => c.classList.remove("is-selected"));
            if(r.checked){
              card.classList.add("is-selected");
            }
          }
        }
        
        refreshProductCardStyles();
        // Verhindere doppeltes Toggeln durch Input-Click
        r.dataset.skipClick = "true";
      });
    }
    
    r.addEventListener("click", e=>{
      if(r.dataset.skipClick === "true"){
        r.dataset.skipClick = "false";
        return;
      }
      // Ignoriere Info-Button Klicks
      if(e.target.classList.contains("info-btn") || e.target.closest(".info-btn")){
        e.stopPropagation();
        return;
      }
      const was=r.dataset.checked==="true";
      radios.forEach(x=>{
        x.dataset.checked="false";
        if(x!==r) x.checked=false;
        updateProductCardStyle(x);
      });
      if(was){ e.preventDefault(); r.checked=false; r.dataset.checked="false"; onUncheck?.(); }
      else   { r.checked=true; r.dataset.checked="true"; onCheck?.(r); }
      updateProductCardStyle(r);
      
      // Highlight-Card Glow-Effekt explizit setzen
      if(r.closest(".highlight-card")){
        const card = r.closest(".highlight-card");
        if(card){
          qsa(".highlight-card").forEach(c => c.classList.remove("is-selected"));
          if(r.checked){
            card.classList.add("is-selected");
          }
        }
      }
      
      refreshProductCardStyles();
    });
    r.addEventListener("change", ()=>{
      radios.forEach(x=>{
        if(x!==r){
          x.dataset.checked="false";
          x.checked=false;
        }
        updateProductCardStyle(x);
      });
      r.dataset.checked = r.checked ? "true":"false";
      updateProductCardStyle(r);
      
      // Highlight-Card Glow-Effekt explizit setzen
      if(r.closest(".highlight-card")){
        const card = r.closest(".highlight-card");
        if(card){
          qsa(".highlight-card").forEach(c => c.classList.remove("is-selected"));
          if(r.checked){
            card.classList.add("is-selected");
          }
        }
      }
      
      refreshProductCardStyles();
    });
  });
}

// Tour Preise
function computeTourPrice(area){
  const n=parseFloat(area); if(isNaN(n)||n<=0) return null;
  if(n<=99) return 199; if(n<=199) return 299; if(n<=299) return 399;
  const extra=Math.ceil((n-299)/100); return 399 + extra*79;
}
function updateTourUI(){
  const span=qs("#tourPrice"); if(!span) return;
  const p=computeTourPrice(qs("#area")?.value); span.textContent = p ? `${p} CHF` : "199–399 CHF (+79/100 m²)";
}
function syncTour(){
  const toggle=qs("#tourToggle"); if(!toggle) return;
  const p= toggle.checked ? (computeTourPrice(qs("#area")?.value)||199) : 0;
  if(toggle.checked) upsertAddon("tour:main","tour", t("prod_tour_360"), p, "prod_tour_360");
  else upsertAddon("tour:main","tour", t("prod_tour_360"), 0, "prod_tour_360");
  updateFloorPlansUI(); syncFloorPlans(); updateExpressAvailability(); renderSummary();
}

// Floor Plans
function updateFloorPlansUI(){
  const floors=Math.max(1, parseInt(qs("#floors")?.value||"1",10));
  const map={ tour:{sel:qs('[data-fp="tour"]'), price:+(qs("#fpTour")?.dataset.unitprice||49)},
              notour:{sel:qs('[data-fp="notour"]'), price:+(qs("#fpNoTour")?.dataset.unitprice||79)},
              sketch:{sel:qs('[data-fp="sketch"]'), price:+(qs("#fpSketch")?.dataset.unitprice||149)} };
  Object.values(map).forEach(v=>{ if(v.sel) v.sel.textContent=`${v.price*floors} CHF`; });
  const tourActive = !!state.addons.find(a=>a.id==="tour:main") || state.package.key === "fullview";
  const fpTour=qs("#fpTour");
  if(fpTour){
    fpTour.disabled=!tourActive;
    if(!tourActive){ fpTour.checked=false; updateProductCardStyle(fpTour); }
  }
}
function syncFloorPlans(){
  const floors=Math.max(1, parseInt(qs("#floors")?.value||"1",10));
  const items=[
    // IDs so wählen, dass der Präfix der logischen Gruppe "floorplans" entspricht
    {id:"floorplans:tour",   el:qs("#fpTour"),   unit:+(qs("#fpTour")?.dataset.unitprice||49)},
    {id:"floorplans:notour", el:qs("#fpNoTour"), unit:+(qs("#fpNoTour")?.dataset.unitprice||79)},
    {id:"floorplans:sketch", el:qs("#fpSketch"), unit:+(qs("#fpSketch")?.dataset.unitprice||149)},
  ];
  items.forEach(it=>{
    const price = it.el?.checked ? it.unit*floors : 0;
    const labelKey = it.el?.dataset.i18nLabel || "";
    const baseLabel = it.el?.dataset.label || "";
    const fullLabel = `${baseLabel} × ${floors} ${t("unit_floors")}`;
    upsertAddon(it.id,"floorplans", fullLabel, price, labelKey);
  });
  updateExpressAvailability(); renderSummary();
}

// Staging
function syncStaging(){
  removeGroup("staging");
  [
    {id:"stLiving",   el:qs("#stLiving"),   price:+(qs("#stLiving")?.dataset.price||99),    qty:+(qs("#qty-stLiving")?.value||0)},
    {id:"stBusiness", el:qs("#stBusiness"), price:+(qs("#stBusiness")?.dataset.price||149), qty:+(qs("#qty-stBusiness")?.value||0)},
    {id:"stRenov",    el:qs("#stRenov"),    price:+(qs("#stRenov")?.dataset.price||199),    qty:+(qs("#qty-stRenov")?.value||0)},
  ].forEach(d=>{
    const on = d.el?.checked;
    const labelKey = d.el?.dataset.i18nLabel || "";
    const baseLabel = d.el?.dataset.label || "";
    if(on && d.qty>0) upsertAddon(`staging:${d.id}`,"staging",`${baseLabel} × ${d.qty}`, d.price*d.qty, labelKey);
  });
  renderSummary();
}

// Express
function updateExpressAvailability(){
  const el=qs("#express24"); if(!el) return;
  
  // Prüfe ob Paket (Bestseller oder Full View) aktiv ist
  const hasPackage = state.package.key === "bestseller" || state.package.key === "fullview";
  
  // Prüfe ob erlaubte Addons vorhanden sind
  const hasAllowedAddons = state.addons.some(a=>["camera","dronePhoto","tour","floorplans"].includes(a.group));
  
  // Express ist verfügbar wenn: Paket (Bestseller/Full View) ODER erlaubte Addons vorhanden
  const allowed = hasPackage || hasAllowedAddons;
  
  el.disabled=!allowed;
  if(!allowed && el.checked){ 
    el.checked=false; 
    upsertAddon("express:24h","express", t("prod_express_24h"), 0, "prod_express_24h");
    showNotice(t("msg_express_unavailable"),"warn");
  }
}
function syncExpress(){
  const el=qs("#express24");
  if(el?.checked) {
    // Prüfe nochmal ob verfügbar
    const hasPackage = state.package.key === "bestseller" || state.package.key === "fullview";
    const hasAllowedAddons = state.addons.some(a=>["camera","dronePhoto","tour","floorplans"].includes(a.group));
    const allowed = hasPackage || hasAllowedAddons;
    
    if(!allowed){
      el.checked = false;
      showNotice(t("msg_express_unavailable"),"warn");
      upsertAddon("express:24h","express", t("prod_express_24h"), 0, "prod_express_24h");
    } else {
      const expressPrice = Number(qs("#express24")?.dataset.price || DYNAMIC_PRICES.express24 || 99);
      upsertAddon("express:24h","express", t("prod_express_24h"), expressPrice, "prod_express_24h");
    }
  } else {
    upsertAddon("express:24h","express", t("prod_express_24h"), 0, "prod_express_24h");
  }
  renderSummary();
}

function syncOpenAccordionHeight(target){
  const item = target?.closest?.(".acc-item");
  const panel = item?.querySelector?.(".acc-panel");
  if(!item || !panel || !item.classList.contains("open")) return;
  // Für bereits geöffnete Panels: max-height freigeben damit Inhalt nie abgeschnitten wird
  panel.style.maxHeight = "none";
}

// Accordion
function initAccordion(){
  qsa(".acc-item").forEach(item=>{
    const header=item.querySelector(".acc-header"), panel=item.querySelector(".acc-panel");
    // Initial: offene Accordions (z.B. Schlüsselabholung) – kein max-height-Clip
    if(item.classList.contains("open") && panel){
      panel.style.maxHeight = "none";
      if(header) header.setAttribute("aria-expanded", "true");
    }
    header.addEventListener("click", (e)=>{
      // Klicks aus interaktiven Elementen im Panel (input, label, button) nicht als Toggle werten
      if(e.target !== header && !header.contains(e.target)) return;
      if(e.target.closest("input,label,.product-card,textarea,select,button:not(.acc-header)")) return;
      const willOpen=!item.classList.contains("open");
      item.classList.toggle("open", willOpen);
      header.setAttribute("aria-expanded", String(willOpen));
      if(panel){
        if(willOpen){
          panel.style.maxHeight = "none";
        } else {
          // Beim Schliessen: erst auf scrollHeight setzen (falls max-height:none war), dann 0
          panel.style.maxHeight = panel.scrollHeight + "px";
          requestAnimationFrame(() => { panel.style.maxHeight = "0"; });
        }
      }
    });
  });
  window.addEventListener("resize", () => {
    qsa(".acc-item.open .acc-panel").forEach(panel => {
      panel.style.maxHeight = "none";
    });
  });
}

// ---------- Info Boxes ----------
function initInfoBoxes(){
  // Event-Listener für alle Info-Buttons (nur bei den 3 neuen Produkten)
  qsa(".info-btn").forEach(btn=>{
    btn.addEventListener("click", (e)=>{
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const info = btn.dataset.info || "";
      if(info){
        showInfoBox(info.replace(/&#10;/g, "\n"), btn);
      }
    });
  });
}

function showInfoBox(content, trigger){
  // Entferne existierende Info-Box
  const existing = qs(".info-box");
  if(existing) existing.remove();
  
  if(!content) return;
  
  const box = document.createElement("div");
  box.className = "info-box";
  const contentDiv = document.createElement("div");
  contentDiv.className = "info-box-content";
  contentDiv.textContent = content;
  box.appendChild(contentDiv);
  
  // Schließen-Button
  const closeBtn = document.createElement("button");
  closeBtn.className = "info-box-close";
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", (e)=>{
    e.stopPropagation();
    box.remove();
  });
  contentDiv.appendChild(closeBtn);
  
  document.body.appendChild(box);
  
  // Position berechnen
  requestAnimationFrame(()=>{
    const rect = trigger.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    
    let top = rect.bottom + 8;
    let left = rect.left;
    
    // Anpassen falls außerhalb des Viewports
    if(top + boxRect.height > window.innerHeight){
      top = rect.top - boxRect.height - 8;
    }
    if(left + boxRect.width > window.innerWidth){
      left = window.innerWidth - boxRect.width - 16;
    }
    if(left < 16) left = 16;
    
    box.style.top = `${top}px`;
    box.style.left = `${left}px`;
  });
  
  // Schließen bei Klick außerhalb
  setTimeout(()=>{
    const closeHandler = (e)=>{
      if(!box.contains(e.target) && e.target !== trigger && !trigger.contains(e.target)){
        box.remove();
        document.removeEventListener("click", closeHandler);
      }
    };
    setTimeout(()=>document.addEventListener("click", closeHandler, true), 100);
  }, 10);
}

// ---------- NEXT-Button Step 2 ----------
function updateNextBtnStep2(){
  const btn=qs("#nextStep2"); if(!btn) return;
  const ok = !!(state.package.key || state.addons.length>0);
  btn.disabled = !ok;
}

// ==============================
// Schritt 3 – Präferenz & Termin
// ==============================
const PHOTOGRAPHERS_CONFIG = Array.isArray(window.PHOTOGRAPHERS_CONFIG) ? window.PHOTOGRAPHERS_CONFIG : [];
const PHOTOG_MAP = PHOTOGRAPHERS_CONFIG.reduce((acc, p) => {
  if (p && p.key) acc[p.key] = p.name || p.key;
  return acc;
}, { any: "Egal wer" });
const ANY_PREF = PHOTOGRAPHERS_CONFIG.map(p => p.key).filter(Boolean);
let perPhotogSlots = {}; // { "ivan": ["08:00","08:15",...], "janez": [...], ... }
const APP_BUILD = "2026-03-26-2";
/** Adress-Autocomplete: EINZIGE Stelle – nur Google (Backend /api/address-suggest) */
const ADDRESS_AUTOCOMPLETE_ENDPOINT = "/api/address-suggest";

const API_BASE = window.location.hostname === "booking.propus.ch"
  ? "https://api-booking.propus.ch"
  : (window.location.protocol === "file:"
      ? "http://localhost:3005"
      // Port 8090/8091 = hinter nginx-Proxy → /api/ wird proxied, same-origin reicht
      : (["8090", "8091", "80", "443", ""].includes(window.location.port)
          ? ""
          : `${window.location.protocol}//${window.location.hostname}:${window.location.port === "8092" ? "3006" : "3005"}`));
const AVAILABILITY_API = `${API_BASE}/api/availability`;
let availabilityRequestId = 0;
let wishSkillWarningState = null;

function debugLogClient(hypothesisId, location, message, data){
  return;
}

async function fetchFreeSlots(photographerKey, date, options = {}){
  const areaRaw = state.object?.area ?? "";
  const area = Number(String(areaRaw).replace(",", "."));
  const packageKey = state.package?.key || "";
  const addonIds = Array.isArray(state.addons) ? state.addons.map((a) => a?.id).filter(Boolean) : [];
  const durationMin = getShootDurationMinutes(area, packageKey);
  const url = new URL(AVAILABILITY_API);
  url.searchParams.set("photographer", photographerKey);
  url.searchParams.set("date", date);
  url.searchParams.set("sqm", Number.isFinite(area) ? String(area) : "");
  url.searchParams.set("duration", String(durationMin));
  url.searchParams.set("package", packageKey);
  url.searchParams.set("addons", addonIds.join(","));
  if (options.includeSkillWarning) {
    url.searchParams.set("includeSkillWarning", "true");
  }
  // Fahrzeit-Filter (Backend) nur aktiv, wenn Koordinaten vorhanden sind
  if (state.coords && Number.isFinite(state.coords.lat)) {
    const lonVal = state.coords.lng ?? state.coords.lon;
    if (Number.isFinite(lonVal)) {
      url.searchParams.set("lat", String(state.coords.lat));
      url.searchParams.set("lon", String(lonVal));
    }
  }
  debugLogClient(
    "H1",
    "script.js:2006",
    "availability fetch start",
    { photographerKey, date, url: url.toString() }
  );
  const res = await fetch(url.toString());
  debugLogClient(
    "H1",
    "script.js:2012",
    "availability fetch response",
    { photographerKey, date, status: res.status }
  );
  if(!res.ok){
    let apiError = "";
    try {
      const payload = await res.json();
      apiError = String(payload?.error || "").trim();
    } catch (_) {}
    const err = new Error(apiError || `Availability request failed (${res.status})`);
    err.status = res.status;
    err.apiError = apiError;
    throw err;
  }
  const data = await res.json();
  debugLogClient(
    "H2",
    "script.js:2020",
    "availability fetch data",
    { photographerKey, date, freeCount: Array.isArray(data.free) ? data.free.length : 0 }
  );
  return {
    free: Array.isArray(data.free) ? data.free : [],
    wishPhotographerSkillWarning: Boolean(data.wishPhotographerSkillWarning),
    missingSkills: Array.isArray(data.missingSkills) ? data.missingSkills.map((x) => String(x || "")) : [],
    recommendedPhotographer: data.recommendedPhotographer && typeof data.recommendedPhotographer === "object"
      ? {
          key: String(data.recommendedPhotographer.key || ""),
          name: String(data.recommendedPhotographer.name || ""),
        }
      : null,
  };
}

function skillLabelFromKey(key){
  const map = {
    foto: t("skill_label_foto"),
    matterport: t("skill_label_matterport"),
    drohne: t("skill_label_drohne"),
    drohne_foto: t("skill_label_drohne_foto"),
    drohne_video: t("skill_label_drohne_video"),
    video: t("skill_label_video"),
  };
  return map[String(key || "").toLowerCase()] || String(key || "");
}

function clearWishSkillWarningUi(){
  wishSkillWarningState = null;
  const box = qs("#wishSkillWarning");
  if (box) box.hidden = true;
  const missing = qs("#wishSkillMissing");
  if (missing) missing.textContent = "";
  const recommendation = qs("#wishSkillRecommendation");
  if (recommendation) recommendation.textContent = "";
  const btn = qs("#wishSkillUseRecommended");
  if (btn) btn.hidden = true;
}

function renderWishSkillWarningUi(payload){
  const box = qs("#wishSkillWarning");
  const missing = qs("#wishSkillMissing");
  const recommendation = qs("#wishSkillRecommendation");
  const btn = qs("#wishSkillUseRecommended");
  if (!box || !missing || !recommendation || !btn) return;
  if (!payload?.wishPhotographerSkillWarning) {
    clearWishSkillWarningUi();
    return;
  }

  const missingLabels = (payload.missingSkills || []).map(skillLabelFromKey).filter(Boolean);
  const recommendedName = payload.recommendedPhotographer?.name
    || PHOTOG_MAP[payload.recommendedPhotographer?.key]
    || payload.recommendedPhotographer?.key
    || "";

  wishSkillWarningState = {
    recommendedPhotographer: payload.recommendedPhotographer || null,
  };

  missing.textContent = `${t("wish_skill_warning_missing")} ${missingLabels.join(", ") || "—"}.`;
  recommendation.textContent = recommendedName
    ? `${t("wish_skill_recommendation")} ${recommendedName}.`
    : t("wish_skill_recommendation_none");

  box.hidden = false;
  btn.hidden = !payload.recommendedPhotographer?.key;
}

function getShootDurationMinutes(area, packageKey){
  // Basis-Dauer nach Fläche
  let baseDuration = 60;
  if (Number.isFinite(area) && area > 0) {
    if (area <= 99) baseDuration = 60;
    else if (area <= 299) baseDuration = 90;
    else baseDuration = 120;
  }
  
  // Produkt-basierte Zuschläge aus Katalog (Fallback: alte Paket-Logik)
  let bonus = 0;
  const packageCode = String(packageKey || "");
  if (packageCode && Number.isFinite(DURATION_BONUS_BY_CODE[packageCode])) {
    bonus += Number(DURATION_BONUS_BY_CODE[packageCode] || 0);
  } else {
    const packageBonus = {
      cinematic: 30,
      bestseller: 0,
      fullview: 30,
    };
    bonus += Number(packageBonus[packageCode] || 0);
  }
  (state.addons || []).forEach((a) => {
    const code = String(a?.id || "");
    if (!code) return;
    const perProduct = Number(DURATION_BONUS_BY_CODE[code] || 0);
    if (Number.isFinite(perProduct) && perProduct > 0) {
      const qty = Math.max(1, Number(a?.qty || 1));
      bonus += perProduct * qty;
    }
  });
  return baseDuration + Math.max(0, bonus);
}

function initStep3(){
  renderPhotographers();
  const photogGrid = qs("#photogGrid");
  if (photogGrid && !photogGrid.dataset.logBound) {
    photogGrid.dataset.logBound = "true";
  }
  // Präferenz-Checkboxen
  initPhotogPreferenceToggles();
  initSlotPeriodToggle();
  const provisionalCb = qs("#bookingProvisional");
  if (provisionalCb && provisionalCb.dataset.bound !== "1") {
    provisionalCb.dataset.bound = "1";
    provisionalCb.addEventListener("change", () => {
      syncProvisionalBookingState();
      renderSummary();
      updateStepSummaries();
    });
  }
  syncProvisionalBookingState();
  const useRecommendedBtn = qs("#wishSkillUseRecommended");
  if (useRecommendedBtn && !useRecommendedBtn.dataset.bound) {
    useRecommendedBtn.dataset.bound = "true";
    useRecommendedBtn.addEventListener("click", () => {
      const key = wishSkillWarningState?.recommendedPhotographer?.key;
      if (!key) return;
      const wish = qs("#prefWish");
      if (wish && !wish.checked) {
        wish.checked = true;
        wish.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const targetInput = qs(`input[name="photogChk"][value="${key}"]`);
      const targetLabel = targetInput?.closest("label");
      if (targetLabel) {
        targetLabel.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      } else if (targetInput) {
        targetInput.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }
    });
  }

  // Date min = heute
  const dateInput=qs("#shootDate");
  if(dateInput){
    try{
      const now=new Date();
      const minT = new Date(now.getTime() + 24*60*60*1000);
      const yyyy=minT.getFullYear(), mm=String(minT.getMonth()+1).padStart(2,"0"), dd=String(minT.getDate()).padStart(2,"0");
      const minDate=`${yyyy}-${mm}-${dd}`;
      if(window.flatpickr){
        const loc = window.flatpickr?.l10ns ? (currentLang==="de" ? flatpickr.l10ns.de
          : currentLang==="fr" ? flatpickr.l10ns.fr
          : currentLang==="it" ? flatpickr.l10ns.it
          : null) : null;
        const fp = window.flatpickr(dateInput, {
          dateFormat:"Y-m-d",
          altInput:true,
          altFormat:"d.m.Y",
          minDate:minT,
          disableMobile:true,
          locale: loc || undefined,
          onChange: ()=>onDateOrPhotogChanged()
        });
        window.__datePicker = fp;
        if (fp.altInput) {
          fp.altInput.setAttribute("placeholder", t("ph_date"));
          // altInput flex:1 damit Pfeil-Buttons sichtbar bleiben
          fp.altInput.style.flex = "1";
          fp.altInput.style.minWidth = "0";
        }
        qs("#shootDateBtn")?.addEventListener("click", (e)=>{
          e.preventDefault();
          fp.open();
        });

        // Pfeil-Buttons: ±1 Tag, nicht vor minDate
        const shiftDate = (delta) => {
          const cur = fp.selectedDates[0];
          const base = cur ? new Date(cur) : new Date(minT);
          base.setDate(base.getDate() + delta);
          if (base < minT) return;
          fp.setDate(base, true);
        };
        qs("#shootDatePrev")?.addEventListener("click", (e) => { e.preventDefault(); shiftDate(-1); });
        qs("#shootDateNext")?.addEventListener("click", (e) => { e.preventDefault(); shiftDate(1); });

      } else {
        dateInput.type="date";
        dateInput.min=minDate;
        dateInput.addEventListener("change", onDateOrPhotogChanged);
        qs("#shootDateBtn")?.addEventListener("click", (e)=>{
          e.preventDefault();
          dateInput.showPicker?.();
          dateInput.focus();
        });

        // Pfeil-Buttons Fallback (nativer date input)
        const shiftDateNative = (delta) => {
          if (!dateInput.value) { dateInput.value = minDate; return; }
          const d = new Date(dateInput.value);
          d.setDate(d.getDate() + delta);
          const newVal = d.toISOString().slice(0, 10);
          if (newVal < minDate) return;
          dateInput.value = newVal;
          dateInput.dispatchEvent(new Event("change"));
        };
        qs("#shootDatePrev")?.addEventListener("click", (e) => { e.preventDefault(); shiftDateNative(-1); });
        qs("#shootDateNext")?.addEventListener("click", (e) => { e.preventDefault(); shiftDateNative(1); });
      }
    } catch(err){
    }
  }

  // Fotograf:innen (wenn Wunsch aktiv) – Single-Select Checkbox-Feeling
  makeSingleSelectCheckboxes(
    'input[name="photogChk"]',
    ()=>{
      state.photographer={key:"",name:""};
      state.flags.photographer=false;
      clearWishSkillWarningUi();
      clearSlots();
      renderSummary();
      updateNextBtnStep3();
      qs("#slotHint").textContent=t("slot_hint_default");
    },
    (inp)=>{
      state.photographer={key:inp.value, name:PHOTOG_MAP[inp.value]||""};
      state.flags.photographer=!!state.photographer.name;
      onDateOrPhotogChanged();
      renderSummary();
    }
  );

  updateNextBtnStep3();
}

function renderPhotographers(){
  const grid = qs("#photogGrid");
  if (!grid) return;
  grid.innerHTML = "";
  PHOTOGRAPHERS_CONFIG.forEach((p) => {
    const label = document.createElement("label");
    label.className = "photog";
    label.innerHTML = `
      <input type="checkbox" name="photogChk" value="${p.key}">
      <div class="photog-card">
        <div class="photog-img" data-initials="${p.initials || ""}" aria-hidden="true"></div>
        <div class="photog-name">${p.name || p.key}</div>
      </div>
    `;
    const img = label.querySelector(".photog-img");
    if (img && p.image) {
      img.style.backgroundImage = `url("${p.image}")`;
    }
    grid.appendChild(label);
  });
}

function initSlotPeriodToggle(){
  const wrap = qs("#slotPeriod");
  if(!wrap) return;
  wrap.addEventListener("click", (e)=>{
    const btn = e.target.closest(".slot-period-btn");
    if(!btn) return;
    if(btn.disabled){
      return;
    }
    setSlotPeriod(btn.dataset.period, "user");
  });
}

function initPhotogPreferenceToggles(){
  const wish = qs("#prefWish");
  const none = qs("#prefNoPref");
  const block = qs("#photogBlock");

  const apply = ()=>{
    if (wish && wish.checked) {
      block.hidden = false;
      state.photographer = { key:"", name:"" };
      state.flags.photographer = false;
      state._wasAny = false;
      perPhotogSlots = {};
      clearWishSkillWarningUi();
      qsa('input[name="photogChk"]').forEach(x=>{ x.checked=false; x.dataset.checked="false"; });
      clearSlots();
      qs("#slotHint").textContent = t("slot_hint_photog_date");
    } else if (none && none.checked) {
      block.hidden = true;
      state.photographer = { key:"any", name: PHOTOG_MAP.any };
      state.flags.photographer = true;
      clearWishSkillWarningUi();
      qsa('input[name="photogChk"]').forEach(x=>{ x.checked=false; x.dataset.checked="false"; });
      clearSlots();
      if (state.date) onDateOrPhotogChanged();
      else qs("#slotHint").textContent = t("slot_hint_date");
    } else {
      block.hidden = true;
      state.photographer = { key:"", name:"" };
      state.flags.photographer = false;
      clearWishSkillWarningUi();
      clearSlots();
      qs("#slotHint").textContent = t("slot_hint_default");
    }
    updateNextBtnStep3();
    renderSummary();
  };

  wish?.addEventListener("change", apply);
  none?.addEventListener("change", apply);
  apply(); // initial
}

function makeSingleSelectCheckboxes(selector, onUncheck, onCheck){
  const boxes=qsa(selector);
  
  // Initialisiere alle Checkboxes
  boxes.forEach(b=>{
    b.dataset.checked = b.checked ? "true" : "false";
  });
  
  boxes.forEach(b=>{
    const label = b.closest("label");
    
    // Label-Click-Handler
    if(label){
      label.addEventListener("click", e=>{
        if(e.target === label || e.target.closest(".photog-card")){
          e.preventDefault();
          e.stopPropagation();
          
          const was=b.dataset.checked==="true";
          boxes.forEach(x=>{ 
            x.dataset.checked="false"; 
            x.checked=false;
          });
          
          if(was){
            b.checked=false;
            b.dataset.checked="false";
            onUncheck?.(b);
          } else {
            b.checked=true;
            b.dataset.checked="true";
            onCheck?.(b);
          }
        }
      });
    }
    
    // Direkter Click auf Checkbox
    b.addEventListener("click", e=>{
      e.preventDefault();
      e.stopPropagation();
      const was=b.dataset.checked==="true";
      boxes.forEach(x=>{ 
        x.dataset.checked="false"; 
        x.checked=false;
      });
      
      if(was){
        b.checked=false;
        b.dataset.checked="false";
        onUncheck?.(b);
      } else {
        b.checked=true;
        b.dataset.checked="true";
        onCheck?.(b);
      }
    });
    
    // Change-Event als Fallback
    b.addEventListener("change", ()=>{
      const isChecked = b.checked;
      boxes.forEach(x=>{ 
        if(x!==b){
          x.dataset.checked="false"; 
          x.checked=false;
        }
      });
      b.dataset.checked = isChecked ? "true" : "false";
      
      if(isChecked){
        onCheck?.(b);
      } else {
        onUncheck?.(b);
      }
    });
  });
}

function hasPhotogSelection(){
  return !!(qs("#prefNoPref")?.checked || state.flags.photographer);
}

function normalizeApiDate(rawValue){
  const raw = String(rawValue || "").trim();
  if(!raw) return "";
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dmY = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if(dmY){
    const dd = String(dmY[1]).padStart(2, "0");
    const mm = String(dmY[2]).padStart(2, "0");
    const yyyy = String(dmY[3]);
    return `${yyyy}-${mm}-${dd}`;
  }
  return "";
}

async function onDateOrPhotogChanged(){
  const dateInput = qs("#shootDate");
  const normalizedDate = normalizeApiDate(dateInput?.value || "");
  if(dateInput && normalizedDate && dateInput.value !== normalizedDate){
    dateInput.value = normalizedDate;
  }
  const date = normalizedDate || null;
  let anySelected = !!qs("#prefNoPref")?.checked;
  let selectedKey = anySelected ? "any" : (qs('input[name="photogChk"][data-checked="true"]')?.value || null);

  // Wenn Datum gewählt ist, aber keine Präferenz gesetzt wurde: automatisch "Kein Wunsch"
  if (date && !anySelected && !selectedKey) {
    const noPref = qs("#prefNoPref");
    if (noPref && !noPref.checked) {
      noPref.checked = true;
    }
    // Fallback unabhängig vom Checkbox-Event
    anySelected = true;
    selectedKey = "any";
    state.photographer = { key:"any", name: PHOTOG_MAP.any };
    state.flags.photographer = true;
  }

  state.date=date; state.time=null; updateNextBtnStep3();
  state.availableSlots = [];
  state.slotPeriod = null;
  clearWishSkillWarningUi();
  const hint=qs("#slotHint"); clearSlots();


  if (!date || (!anySelected && !selectedKey)) {
    if (hint) hint.textContent = t("slot_hint_default");
    state.flags.datetime = false;
    renderSummary();
    return;
  }

  if(hint) hint.textContent = `${t("search_loading")}...`;

  const all=workingSlots();
  const requestId = ++availabilityRequestId;
  let avail = [];
  let apiFailed = false;
  try{
    if(selectedKey==="any"){
      const allResponses = await Promise.all(ANY_PREF.map((k)=>fetchFreeSlots(k, date, { includeSkillWarning: false })));
      const allFree = allResponses.map((entry) => entry.free || []);
      perPhotogSlots = {};
      ANY_PREF.forEach((k, i) => { perPhotogSlots[k] = allFree[i] || []; });
      const freeSet = new Set(allFree.flat());
      avail = all.filter(t=>freeSet.has(t));
    } else {
      const response = await fetchFreeSlots(selectedKey, date, { includeSkillWarning: true });
      if(requestId !== availabilityRequestId) return;
      renderWishSkillWarningUi(response);
      const freeSet = new Set(response.free || []);
      avail = all.filter(t=>freeSet.has(t));
    }
  }catch(err){
    // Kein Fallback auf lokale Logik – bei API-Fehler keine Slots zeigen,
    // damit keine Buchungen ohne Kalender-Check möglich sind.
    apiFailed = true;
    clearWishSkillWarningUi();
    avail = [];
    const errText = String(err?.apiError || err?.message || "");
    const isLookaheadError = /lookahead/i.test(errText) || /zu weit in der zukunft/i.test(errText);
    if(hint){
      hint.textContent = isLookaheadError
        ? "Dieses Datum liegt zu weit in der Zukunft. Buchungen sind maximal 365 Tage im Voraus möglich."
        : "Verfügbarkeit konnte nicht geladen werden. Bitte Seite neu laden.";
    }
    console.warn("[availability] API error, showing no slots:", err?.message || err);
  }

  if(requestId !== availabilityRequestId) return;
  state.availableSlots = avail;
  if (apiFailed) {
    updateSlotPeriodButtons({am:0, pm:0});
    return;
  }
  const lastSlots = avail.slice(-5);
  const has1800 = avail.includes("18:00");

  if(!avail.length){
    if(hint) hint.textContent=t("slot_no_available");
    updateSlotPeriodButtons({am:0, pm:0});
    return;
  }
  if(hint) hint.textContent=t("slot_select_time");
  ensureSlotPeriodAndRender();
}

function getSlotPeriod(t){
  const [h] = String(t).split(":");
  return Number(h) < 12 ? "am" : "pm";
}

function getPeriodCounts(avail){
  const counts = { am:0, pm:0 };
  (avail || []).forEach(t=>{
    const p = getSlotPeriod(t);
    counts[p] = (counts[p] || 0) + 1;
  });
  return counts;
}

function decideSlotPeriod(counts){
  if(state.slotPeriod && counts[state.slotPeriod] > 0) return state.slotPeriod;
  if(counts.am > 0) return "am";
  if(counts.pm > 0) return "pm";
  return null;
}

function updateSlotPeriodButtons(counts){
  const wrap = qs("#slotPeriod");
  const amBtn = qs("#slotPeriodAm");
  const pmBtn = qs("#slotPeriodPm");
  if(!wrap || !amBtn || !pmBtn) return;
  const total = (counts?.am || 0) + (counts?.pm || 0);
  wrap.hidden = total === 0;
  amBtn.disabled = (counts?.am || 0) === 0;
  pmBtn.disabled = (counts?.pm || 0) === 0;
  amBtn.classList.toggle("is-active", state.slotPeriod === "am");
  pmBtn.classList.toggle("is-active", state.slotPeriod === "pm");
}

function ensureSlotPeriodAndRender(){
  const counts = getPeriodCounts(state.availableSlots);
  updateSlotPeriodButtons(counts);
  const desired = decideSlotPeriod(counts);
  if(desired) setSlotPeriod(desired, "auto");
  else renderSlots();
}

function setSlotPeriod(period, source){
  if(!period) return;
  state.slotPeriod = period;
  updateSlotPeriodButtons(getPeriodCounts(state.availableSlots));
  const visible = renderSlots();
  const clearedTime = !!(state.time && !visible.includes(state.time));
  if(clearedTime){
    state.time = null;
    state.flags.datetime = false;
    renderSummary();
    updateNextBtnStep3();
  }
}

function renderSlots(){
  const wrap=qs("#timeSlots");
  if(!wrap) return [];
  wrap.innerHTML = "";
  const avail = Array.isArray(state.availableSlots) ? state.availableSlots : [];
  const period = state.slotPeriod || "am";
  const filtered = avail.filter(t=>getSlotPeriod(t) === period);

  filtered.forEach(t=>{
    const btn=document.createElement("button");
    btn.type="button";
    btn.className="slot-btn";
    btn.textContent=t;
    if(state.time === t) btn.classList.add("is-selected");
    btn.addEventListener("click", ()=>{
      qsa(".slot-btn").forEach(b=>b.classList.remove("is-selected"));
      btn.classList.add("is-selected");
      state.time=t;

      if(state.photographer?.key === "any" || state._wasAny){
        // Bei "egal wer": ersten verfügbaren Fotografen für diesen Slot zuweisen
        state._wasAny = true;
        let resolved = false;
        for(const k of ANY_PREF){
          if(perPhotogSlots[k] && perPhotogSlots[k].includes(t)){
            state.photographer = { key: k, name: PHOTOG_MAP[k] || k };
            resolved = true;
            break;
          }
        }
        if(!resolved){
          // Fallback: ersten Fotografen nehmen
          const fk = ANY_PREF[0] || "";
          state.photographer = { key: fk, name: PHOTOG_MAP[fk] || fk };
        }
      }

      state.flags.datetime=!!(state.date && state.time);
      renderSummary(); updateNextBtnStep3();
    });
    wrap.appendChild(btn);
  });
  return filtered;
}
function clearSlots(){
  const wrap=qs("#timeSlots"); 
  if(wrap) wrap.innerHTML="";
  const toolbar = qs("#slotPeriod");
  if(toolbar) toolbar.hidden = true;
}
function workingSlots(){
  const out=[];
  for(let h=8; h<=18; h++){
    for(const m of [0,15,30,45]){
      if(h===18 && m>0) continue;
      out.push(
        String(h).padStart(2,"0") + ":" + String(m).padStart(2,"0")
      );
    }
  }
  return out;
}
function busySlotsFor(key,date){ const s=(date||"").replaceAll("-","")+key; let hash=0; for(let i=0;i<s.length;i++){ hash=((hash<<5)-hash)+s.charCodeAt(i); hash|=0; } const all=workingSlots(), busy=[]; for(let i=0;i<all.length;i++){ if(((hash+i*7)%4)===0) busy.push(all[i]); } return busy; }
function availableFor(key,date,all){ const busy=busySlotsFor(key,date); return all.filter(t=>!busy.includes(t)); }
function availableAny(date,all){ return all.filter(t=>ANY_PREF.some(k=>availableFor(k,date,all).includes(t))); }
function pickFirstFree(date,time){ for(const k of ANY_PREF){ if(availableFor(k,date,workingSlots()).includes(time)) return k; } return "maher"; }
function updateNextBtnStep3(){ qs("#nextStep3")?.toggleAttribute("disabled", !(hasPhotogSelection() && state.date && state.time)); }

// ==============================
// Schritt 4 – Rechnungsdetails
// ==============================
async function finishBooking(e){
  e?.preventDefault?.(); clearNotice();
  const finishBtn = qs("#finishBtn");
  const finishBtnText = finishBtn?.textContent || "";
  if (finishBtn) {
    finishBtn.disabled = true;
    finishBtn.textContent = t("btn_sending");
  }
  state.billing.company = qs("#billCompany")?.value.trim() || "";
  state.billing.company_email = qs("#billCompanyEmail")?.value.trim() || "";
  state.billing.company_phone = qs("#billCompanyPhone")?.value.trim() || "";
  state.billing.salutation = qs("#billSalutation")?.value || "";
  state.billing.first_name = qs("#billFirstName")?.value.trim() || "";
  state.billing.name = qs("#billName")?.value.trim() || "";
  state.billing.email = qs("#billEmail")?.value.trim() || "";
  state.billing.phone = qs("#billPhone")?.value.trim() || "";
  state.billing.phone_mobile = qs("#billPhoneMobile")?.value.trim() || "";
  state.billing.street = qs("#billStreet")?.value.trim() || "";
  state.billing.zip = qs("#billZip")?.value.trim() || "";
  state.billing.city = qs("#billCity")?.value.trim() || "";
  state.billing.zipcity = [state.billing.zip, state.billing.city].filter(Boolean).join(" ");
  state.billing.order_ref = qs("#billOrderRef")?.value.trim() || "";
  state.billing.notes = qs("#billNotes")?.value.trim() || "";
  state.billing.alt_company = qs("#altBillCompany")?.value.trim() || "";
  state.billing.alt_company_email = qs("#altBillCompanyEmail")?.value.trim() || "";
  state.billing.alt_company_phone = qs("#altBillCompanyPhone")?.value.trim() || "";
  state.billing.alt_street = qs("#altBillStreet")?.value.trim() || "";
  state.billing.alt_zip = qs("#altBillZip")?.value.trim() || "";
  state.billing.alt_city = qs("#altBillCity")?.value.trim() || "";
  state.billing.alt_zipcity = [state.billing.alt_zip, state.billing.alt_city].filter(Boolean).join(" ");
  state.billing.alt_salutation = qs("#altBillSalutation")?.value || "";
  state.billing.alt_first_name = qs("#altBillFirstName")?.value.trim() || "";
  state.billing.alt_name = qs("#altBillName")?.value.trim() || "";
  state.billing.alt_email = qs("#altBillEmail")?.value.trim() || "";
  state.billing.alt_phone = qs("#altBillPhone")?.value.trim() || "";
  state.billing.alt_phone_mobile = qs("#altBillPhoneMobile")?.value.trim() || "";

  if(!state.billing.company){
    showNotice("Bitte Firma angeben.","error");
    qs("#billCompany")?.focus();
    if(finishBtn){ finishBtn.disabled=false; finishBtn.textContent=finishBtnText; }
    return;
  }
  if(!state.billing.name){ showNotice(t("msg_bill_name_required"),"error"); qs("#billName")?.focus(); if(finishBtn){ finishBtn.disabled=false; finishBtn.textContent=finishBtnText; } return; }
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.billing.email)){ showNotice(t("msg_bill_email_invalid"),"error"); qs("#billEmail")?.focus(); if(finishBtn){ finishBtn.disabled=false; finishBtn.textContent=finishBtnText; } return; }
  if(!state.billing.phone && !state.billing.phone_mobile){
    syncBillPhoneHint();
    showNotice("Bitte Telefon oder Mobil angeben.","error");
    (qs("#billPhone") || qs("#billPhoneMobile"))?.focus();
    if(finishBtn){ finishBtn.disabled=false; finishBtn.textContent=finishBtnText; }
    return;
  }
  if(!state.billing.street){
    showNotice("Bitte Strasse und Hausnummer der Rechnungsadresse angeben.","error");
    qs("#billStreet")?.focus();
    if(finishBtn){ finishBtn.disabled=false; finishBtn.textContent=finishBtnText; }
    return;
  }
  if(!state.billing.zip || !state.billing.city){
    showNotice("Bitte PLZ und Ort der Rechnungsadresse angeben.","error");
    (qs("#billZip") || qs("#billCity"))?.focus();
    if(finishBtn){ finishBtn.disabled=false; finishBtn.textContent=finishBtnText; }
    return;
  }
  const diffAddrActive = qs("#diffBillAddr")?.checked;
  if(diffAddrActive){
    if(!state.billing.alt_company){ showNotice("Bitte die abweichende Firma angeben.","error"); qs("#altBillCompany")?.focus(); if(finishBtn){ finishBtn.disabled=false; finishBtn.textContent=finishBtnText; } return; }
    if(!state.billing.alt_street){ showNotice("Bitte die abweichende Strasse angeben.","error"); qs("#altBillStreet")?.focus(); if(finishBtn){ finishBtn.disabled=false; finishBtn.textContent=finishBtnText; } return; }
    if(!state.billing.alt_zip || !state.billing.alt_city){ showNotice("Bitte PLZ und Ort der abweichenden Rechnungsadresse angeben.","error"); (qs("#altBillZip") || qs("#altBillCity"))?.focus(); if(finishBtn){ finishBtn.disabled=false; finishBtn.textContent=finishBtnText; } return; }
    if(!state.billing.alt_name){ showNotice("Bitte den Namen der abweichenden Kontaktperson angeben.","error"); qs("#altBillName")?.focus(); if(finishBtn){ finishBtn.disabled=false; finishBtn.textContent=finishBtnText; } return; }
  }
  if(!(hasPhotogSelection() && state.date && state.time)){ showNotice(t("msg_step3_required"),"error"); if(finishBtn){ finishBtn.disabled=false; finishBtn.textContent=finishBtnText; } return; }

  const subtotal = state.package.price + state.addons.reduce((s,a)=>s+(a.price||0),0);
  const discountAmount = state.discount.amount || 0;
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const vatRate = 0.081;
  const vat = Math.round((afterDiscount * vatRate) * 20) / 20;
  const total = Math.round((afterDiscount + vat) * 20) / 20;

  const keyPickupEnabled = !!qs("#keyPickupToggle")?.checked;
  syncProvisionalBookingState();
  const keyPickup = {
    enabled: keyPickupEnabled,
    address: keyPickupEnabled ? (qs("#keyInfo")?.value.trim() || "") : "",
    floor: "",
    info: ""
  };

  const payload={
    address:{text:state.address, coords:state.coords},
    object:state.object,
    services:{ package:state.package, addons:state.addons },
    schedule:{photographer:state.photographer, date:state.date, time:state.time, provisional: !!state.provisionalBooking},
    billing:state.billing,
    pricing:{
      subtotal,
      discountAmount: Math.round(discountAmount * 20) / 20,
      vat,
      total
    },
    discountCode: state.discount.code || "",
    keyPickup
  };

  try{
    const res = await fetch(`${API_BASE}/api/booking`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(payload)
    });
    if(!res.ok){
      let detail = "";
      let errText = "";
      let requestId = "";
      try{
        const errData = await res.json();
        if (errData && typeof errData === "object") {
          requestId = String(errData.requestId || "").trim();
          detail = [errData.stage, errData.code, errData.message].filter(Boolean).join(" · ");
          if (!detail && errData.error) detail = String(errData.error);
        }
      }catch(_){
        try{
          errText = await res.text();
        }catch(_){}
      }
      const snippet = errText ? errText.slice(0, 200) : "";
      const requestHint = requestId ? ` Ref: ${requestId}` : "";
      const msg = detail
        ? `Senden fehlgeschlagen (${detail}).${requestHint}`
        : (snippet ? `Senden fehlgeschlagen (HTTP ${res.status}): ${snippet}.${requestHint}` : `Senden fehlgeschlagen (HTTP ${res.status}).${requestHint}`);
      showNotice(msg,"error");
      if(finishBtn){ finishBtn.disabled=false; finishBtn.textContent=finishBtnText; }
      return;
    }
    const data = await res.json().catch(() => ({}));
    // keine Abschluss-Notifies, nur Schluss-Overlay
    if(finishBtn){ finishBtn.disabled=true; finishBtn.textContent=t("btn_sent"); }
    clearBookingDraft();
    populateThankYouScreen(data);

    const thankYou = qs("#thankYouScreen");
    const mainContent = qs("#mainContent");
    if (thankYou) {
      thankYou.hidden = false;
      thankYou.classList.add("is-visible");
    }
    if (mainContent) {
      mainContent.hidden = true;
    }
  }catch(err){
    showNotice("Senden fehlgeschlagen. Bitte später erneut versuchen.","error");
    if(finishBtn){ finishBtn.disabled=false; finishBtn.textContent=finishBtnText; }
  }
}

// ==============================
// Summary (rechte Spalte)
// ==============================
function renderSummary(){
  qsa("#sum-address").forEach(el=>el.textContent=state.address||"–");
  qsa("#ms-address").forEach(el=>el.textContent=state.address||"–");

  const servicesList = qs("#sum-services-list");
  if (servicesList) {
    servicesList.innerHTML = "";
    const allServices = [];
    if(state.package.label || state.package.labelKey) allServices.push({id: `package:${state.package.key}`, label: state.package.label, labelKey: state.package.labelKey, price: state.package.price});
    state.addons.forEach(a => allServices.push({id: a.id, label: a.label, labelKey: a.labelKey, price: a.price}));

    if (allServices.length) {
      let currentGroup = "";
      allServices.forEach((service, idx) => {
        // Kategorien trennen
        const serviceGroup = service.id ? service.id.split(":")[0] : "package";
        if (serviceGroup !== currentGroup && idx > 0) {
          const separator = document.createElement("li");
          separator.className = "service-separator";
          servicesList.appendChild(separator);
        }
        currentGroup = serviceGroup;
        
        const li = document.createElement("li");
        li.className = "service-item";
        li.dataset.serviceId = service.id || `package:${service.label}`;
        const displayLabel = service.labelKey ? t(service.labelKey) : service.label;
        li.innerHTML = `
          <span class="service-label">${displayLabel}</span>
          <div class="service-actions">
            <span class="service-price">${CHF(service.price)}</span>
            <button type="button" class="service-remove" aria-label="${t("aria_remove")}" data-service-id="${service.id || `package:${service.label}`}">×</button>
          </div>
        `;
        servicesList.appendChild(li);
      });
      
      // Remove-Buttons Event-Listener
      qsa(".service-remove").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const serviceId = btn.dataset.serviceId;

          const [group, value] = (serviceId || "").split(":");
          // Name-Attribut im Formular kann vom Gruppen-Namen abweichen (z.B. camera â†’ cam)
          let inputName = group;
          if (group === "camera") inputName = "cam";
          const candidateSelector = serviceId && !serviceId.startsWith("package:")
            ? `input[value="${value}"][name="${inputName}"]`
            : null;
          const candidateInput = candidateSelector ? qs(candidateSelector) : null;

          if (serviceId.startsWith("package:")) {
            // Package entfernen
            state.package = { key: "", price: 0, label: "", labelKey:"" };
            state.flags.package = false;
            qsa('input[name="impression"]').forEach(x => { 
              x.checked = false; 
              x.dataset.checked = "false";
              updateProductCardStyle(x);
            });
            qsa('input[name="package"]').forEach(x => { 
              x.checked = false; 
              x.dataset.checked = "false";
              updateProductCardStyle(x);
            });
            // Highlight-Card Glow-Effekt entfernen
            qsa(".highlight-card").forEach(c => c.classList.remove("is-selected"));
            refreshProductCardStyles();
          } else {
            // Addon entfernen
            if (group === "express") {
              const expressInp = qs("#express24");
              if(expressInp) {
                expressInp.checked = false;
                updateProductCardStyle(expressInp);
              }
              syncExpress();
            } else if (group === "tour") {
              const tourInp = qs("#tourToggle");
              if(tourInp) {
                tourInp.checked = false;
                updateProductCardStyle(tourInp);
              }
              syncTour();
            } else if (group === "keypickup") {
              const keyInp = qs("#keyPickupToggle");
              if(keyInp) {
                keyInp.checked = false;
                updateProductCardStyle(keyInp);
              }
              const keyInfo = qs("#keyInfo");
              if(keyInfo) { keyInfo.disabled = true; keyInfo.value = ""; }
              const keyForm = qs("#keyForm");
              if(keyForm) keyForm.setAttribute("aria-hidden", "true");
              syncOpenAccordionHeight(keyForm);
              upsertAddon("keypickup:main","keypickup", t("prod_key_pickup"), 0, "prod_key_pickup");
            } else if (group === "staging") {
              // Finde das entsprechende Staging-Element
              const stagingId = value.replace("staging:", "");
              const inp = qs(`#${stagingId}`);
              if (inp) {
                inp.checked = false;
                updateProductCardStyle(inp);
                const wrap = qs(`.qty-wrap[data-for="${stagingId}"]`);
                if (wrap) wrap.hidden = true;
                const qty = qs(`#qty-${stagingId}`);
                if (qty) qty.value = 1;
              }
              syncStaging();
            } else if (group === "floorplans") {
              // Finde das entsprechende Floor Plan Element
              if (value === "tour") {
                const fpTour = qs("#fpTour");
                if(fpTour) {
                  fpTour.checked = false;
                  updateProductCardStyle(fpTour);
                }
              } else if (value === "notour") {
                const fpNoTour = qs("#fpNoTour");
                if(fpNoTour) {
                  fpNoTour.checked = false;
                  updateProductCardStyle(fpNoTour);
                }
              } else if (value === "sketch") {
                const fpSketch = qs("#fpSketch");
                if(fpSketch) {
                  fpSketch.checked = false;
                  updateProductCardStyle(fpSketch);
                }
              }
              syncFloorPlans();
            } else {
              // Andere Gruppen (camera, dronePhoto, groundVideo, droneVideo)
              const inp = qs(`input[value="${value}"][name="${inputName}"]`);
              if (inp) {
                inp.checked = false;
                inp.dataset.checked = "false";
                updateProductCardStyle(inp);
              }
              removeGroup(group);
            }
            updateExpressAvailability();
          }
          // WICHTIG: Styles aktualisieren damit goldene Umrandungen verschwinden
          refreshProductCardStyles();
          renderSummary();
          updateNextBtnStep2();
        });
      });
    } else {
      servicesList.innerHTML = `<li class="service-item"><span class="service-label">–</span></li>`;
    }
  }

  const o=state.object, parts=[];
  if(o.type) parts.push(objectTypeLabel(o.type));
  if(o.area) parts.push(`${o.area} m²`);
  if(o.floors) parts.push(`${o.floors} ${t("unit_floors")}`);
  if(o.rooms) parts.push(`${o.rooms} ${t("unit_rooms")}`);
  if(o.specials) parts.push(o.specials);
  if(o.desc) parts.push(`"${o.desc.slice(0,60)}${o.desc.length>60?'…':''}"`);
  qsa("#sum-object").forEach(el=>el.textContent = parts.length?parts.join(" · ") : "–");

  qsa("#sum-photographer").forEach(el=>el.textContent=state.photographer.name||"–");
  qsa("#ms-photographer").forEach(el=>el.textContent=state.photographer.name||"–");
  const provisionalSuffix = state.provisionalBooking ? t("sum_provisional_suffix") : "";
  qsa("#sum-datetime").forEach(el=>{
    el.textContent = (state.date && state.time) ? `${fmtYMD(state.date)} · ${state.time}${provisionalSuffix}` : "–";
  });
  qsa("#ms-datetime").forEach(el=>el.textContent=(state.date&&state.time)?`${fmtYMD(state.date)} · ${state.time}${provisionalSuffix}`:"–");

  // Preisberechnung mit MwSt (Schweizer Rundung auf 5 Rappen)
  const subtotal = state.package.price + state.addons.reduce((s,a)=>s+(a.price||0),0);
  // Rabatt automatisch neu berechnen wenn Produkte sich ändern
  if(state.discount.code && state.discount.percent > 0){
    state.discount.amount = subtotal * (state.discount.percent / 100);
  }
  const discountAmount = state.discount.amount || 0;
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const vatRate = 0.081; // 8.1% MwSt Schweiz
  const vat = Math.round((afterDiscount * vatRate) * 20) / 20; // Auf 5 Rappen runden
  const total = Math.round((afterDiscount + vat) * 20) / 20; // Auf 5 Rappen runden

  qsa("#sum-subtotal").forEach(el=>el.textContent=CHF(subtotal));
  qsa("#sum-vat").forEach(el=>el.textContent=CHF(vat));
  qsa("#sum-total").forEach(el=>el.textContent=CHF(total));
  qsa("#ms-total").forEach(el=>el.textContent=CHF(total));

  // Mobile compact summary (3-line bar): show package + addons count
  try {
    const pkgLabel = state.package.labelKey ? t(state.package.labelKey) : (state.package.label || "");
    const addonCount = Array.isArray(state.addons) ? state.addons.length : 0;
    let compact = pkgLabel || "–";
    if (addonCount > 0) {
      const suffix = addonCount === 1 ? "Zusatzleistung" : "Zusatzleistungen";
      compact = pkgLabel ? `${pkgLabel} + ${addonCount} ${suffix}` : `${addonCount} ${suffix}`;
    }
    qsa("#ms-services-compact").forEach(el => el.textContent = compact);
  } catch (_) {}

  // Rabatt anzeigen/verstecken und neu berechnen wenn Code vorhanden
  const discountRow = qs("#discountRow");
  if(discountRow){
    if(discountAmount > 0){
      discountRow.style.display = "flex";
      qs("#sum-discount").textContent = `- ${CHF(discountAmount)}`;
    } else {
      discountRow.style.display = "none";
    }
  }
  
}

function applyDiscount(){
  const code = qs("#discountCode")?.value.trim().toUpperCase() || "";
  if(!code){
    // Wenn Code entfernt wurde, Rabatt zurücksetzen
    state.discount = { code:"", percent:0, amount:0 };
    renderSummary();
    return;
  }
  
  const DISCOUNT_CONFIG = {
    code: "PROPUS10",
    percent: 10,
    validUntil: "2026-02-28",
    active: true
  };
  const today = new Date();
  const expiry = new Date(`${DISCOUNT_CONFIG.validUntil}T23:59:59`);
  const isExpired = Number.isFinite(expiry.getTime()) ? today > expiry : false;
  const isValid = DISCOUNT_CONFIG.active && code === DISCOUNT_CONFIG.code && !isExpired;
  
  if(isValid){
    const subtotal = state.package.price + state.addons.reduce((s,a)=>s+(a.price||0),0);
    const amount = subtotal * (DISCOUNT_CONFIG.percent/100);
    state.discount = { code, percent: DISCOUNT_CONFIG.percent, amount };
    showToast(`Rabatt ${DISCOUNT_CONFIG.percent}% angewendet! Code: ${code}`);
    renderSummary();
  } else {
    state.discount = { code:"", percent:0, amount:0 };
    showNotice(isExpired ? t("msg_discount_expired") : t("msg_discount_invalid"),"error");
    renderSummary();
  }
}

// Rabattcode automatisch aktualisieren bei Änderungen
function updateDiscountOnChange(){
  const code = qs("#discountCode")?.value.trim().toUpperCase() || "";
  if(code){
    applyDiscount();
  } else {
    state.discount = { code:"", percent:0, amount:0 };
    renderSummary();
  }
}

// ===== Bug Report =====
window.openBugReport = function() {
  document.getElementById("bugReportOverlay").style.display = "";
  document.getElementById("bugReportModal").style.display = "";
  document.getElementById("bugName").value = "";
  document.getElementById("bugText").value = "";
  document.getElementById("bugFile").value = "";
  document.getElementById("bugUploadLabel").textContent = "Datei auswählen oder hierher ziehen";
  document.getElementById("bugUploadArea").classList.remove("has-file");
};

window.closeBugReport = function() {
  document.getElementById("bugReportOverlay").style.display = "none";
  document.getElementById("bugReportModal").style.display = "none";
};

window.handleBugFile = function(input) {
  const file = input.files[0];
  const area = document.getElementById("bugUploadArea");
  const label = document.getElementById("bugUploadLabel");
  if (file) {
    if (file.size > 5 * 1024 * 1024) {
      showToast("Datei zu gross (max. 5 MB)");
      input.value = "";
      return;
    }
    label.textContent = file.name;
    area.classList.add("has-file");
  } else {
    label.textContent = "Datei auswählen oder hierher ziehen";
    area.classList.remove("has-file");
  }
};

window.submitBugReport = function() {
  const name = document.getElementById("bugName").value.trim();
  const text = document.getElementById("bugText").value.trim();
  const fileInput = document.getElementById("bugFile");
  if (!name) { showToast("Bitte Name angeben"); return; }
  if (!text) { showToast("Bitte Fehlerbeschreibung angeben"); return; }

  const btn = document.querySelector("#bugReportModal .btn-primary");
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sende...'; }

  const fd = new FormData();
  fd.append("name", name);
  fd.append("text", text);
  fd.append("page", window.location.href);
  if (fileInput.files[0]) fd.append("file", fileInput.files[0]);

  fetch(`${API_BASE}/api/bug-report`, { method: "POST", body: fd })
    .then(r => r.json())
    .then(d => {
      if (d.ok) {
        closeBugReport();
        showToast("Danke! Fehler wurde gemeldet.");
      } else {
        showToast("Fehler beim Senden: " + (d.error || "unbekannt"));
      }
    })
    .catch(() => showToast("Netzwerkfehler – bitte nochmals versuchen"))
    .finally(() => {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Absenden'; }
    });
};
