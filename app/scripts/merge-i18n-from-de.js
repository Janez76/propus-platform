/**
 * Merges missing keys from de.json into en/fr/it using embedded translations.
 * Run: node scripts/merge-i18n-from-de.js
 */
const fs = require("fs");
const path = require("path");

const i18nDir = path.join(__dirname, "../src/i18n");

const de = JSON.parse(fs.readFileSync(path.join(i18nDir, "de.json"), "utf8"));

/** @type {Record<string, { en: string; fr: string; it: string }>} */
const T = {
  "exxas.connection.endpoint": {
    en: "EXXAS endpoint",
    fr: "Point de terminaison EXXAS",
    it: "Endpoint EXXAS",
  },
  "exxas.connection.endpointPlaceholder": {
    en: "https://api.exxas.net/cloud/.../api/v2/customers?limit=1",
    fr: "https://api.exxas.net/cloud/.../api/v2/customers?limit=1",
    it: "https://api.exxas.net/cloud/.../api/v2/customers?limit=1",
  },
  "exxas.connection.endpointHint": {
    en: "Recommended: direct Cloud v2 endpoint from EXXAS. Only one request is sent per test.",
    fr: "Recommandé : point de terminaison Cloud v2 direct depuis EXXAS. Un seul envoi par test.",
    it: "Consigliato: endpoint Cloud v2 diretto da EXXAS. Viene inviata una sola richiesta per test.",
  },
  "exxas.connection.authMode": {
    en: "Authentication",
    fr: "Authentification",
    it: "Autenticazione",
  },
  "exxas.connection.authMode.apiKey": {
    en: "ApiKey header (recommended)",
    fr: "En-tête ApiKey (recommandé)",
    it: "Header ApiKey (consigliato)",
  },
  "exxas.connection.authMode.bearer": {
    en: "Bearer token",
    fr: "Jeton Bearer",
    it: "Token Bearer",
  },
  "exxas.connection.authModeHint": {
    en: "Only change if EXXAS does not accept ApiKey mode.",
    fr: "À modifier uniquement si EXXAS n'accepte pas le mode ApiKey.",
    it: "Modificare solo se EXXAS non accetta la modalità ApiKey.",
  },
  "userManagement.stats.activeFirmen": {
    en: "Active companies",
    fr: "Entreprises actives",
    it: "Aziende attive",
  },
  "userManagement.stats.hauptkontakte": {
    en: "Primary contacts",
    fr: "Contacts principaux",
    it: "Contatti principali",
  },
  "userManagement.stats.mitarbeiter": {
    en: "Employee logins",
    fr: "Accès employés",
    it: "Accessi dipendenti",
  },
  "userManagement.stats.pending": {
    en: "Pending invitations",
    fr: "Invitations en attente",
    it: "Inviti in sospeso",
  },
  "userManagement.search.placeholder": {
    en: "Search company or user…",
    fr: "Rechercher une entreprise ou un utilisateur…",
    it: "Cerca azienda o utente…",
  },
  "userManagement.filter.all": {
    en: "All",
    fr: "Tous",
    it: "Tutti",
  },
  "userManagement.filter.active": {
    en: "Active",
    fr: "Actif",
    it: "Attivo",
  },
  "userManagement.filter.pending": {
    en: "Pending",
    fr: "En attente",
    it: "In sospeso",
  },
  "userManagement.button.newFirma": {
    en: "New company",
    fr: "Nouvelle entreprise",
    it: "Nuova azienda",
  },
  "userManagement.modal.title": {
    en: "Create company",
    fr: "Créer une entreprise",
    it: "Crea azienda",
  },
  "userManagement.modal.subtitle": {
    en: "After creating, you can assign primary contacts and employees.",
    fr: "Après la création, vous pourrez attribuer des contacts principaux et des employés.",
    it: "Dopo la creazione potrai assegnare contatti principali e dipendenti.",
  },
  "userManagement.modal.firmaName": {
    en: "Company name",
    fr: "Nom de l'entreprise",
    it: "Ragione sociale",
  },
  "userManagement.modal.standort": {
    en: "Location",
    fr: "Site",
    it: "Sede",
  },
  "userManagement.modal.hauptkontaktEmail": {
    en: "Primary contact (email)",
    fr: "Contact principal (e-mail)",
    it: "Contatto principale (e-mail)",
  },
  "userManagement.modal.notiz": {
    en: "Note (internal, optional)",
    fr: "Note (interne, optionnelle)",
    it: "Nota (interna, facoltativa)",
  },
  "userManagement.modal.create": {
    en: "Create company & invite",
    fr: "Créer l'entreprise et inviter",
    it: "Crea azienda e invita",
  },
  "userManagement.empty.noFirmen": {
    en: "No companies yet.",
    fr: "Aucune entreprise pour le moment.",
    it: "Nessuna azienda ancora.",
  },
  "userManagement.empty.noResults": {
    en: "No companies found for this search or filter.",
    fr: "Aucune entreprise trouvée pour cette recherche ou ce filtre.",
    it: "Nessuna azienda trovata per questa ricerca o filtro.",
  },
  "roles.newGroup": {
    en: "Create new system group",
    fr: "Créer un nouveau groupe système",
    it: "Crea nuovo gruppo di sistema",
  },
  "roles.groupName": {
    en: "Group name",
    fr: "Nom du groupe",
    it: "Nome gruppo",
  },
  "roles.create": {
    en: "Create",
    fr: "Créer",
    it: "Crea",
  },
  "roles.noGroups": {
    en: "No groups yet.",
    fr: "Aucun groupe pour le moment.",
    it: "Nessun gruppo ancora.",
  },
  "roles.category.system": {
    en: "System",
    fr: "Système",
    it: "Sistema",
  },
  "roles.category.orders": {
    en: "Orders",
    fr: "Commandes",
    it: "Ordini",
  },
  "roles.category.customers": {
    en: "Customers",
    fr: "Clients",
    it: "Clienti",
  },
  "roles.category.photographers": {
    en: "Photographers",
    fr: "Photographes",
    it: "Fotografi",
  },
  "roles.category.products": {
    en: "Products & pricing",
    fr: "Produits et tarifs",
    it: "Prodotti e prezzi",
  },
  "roles.category.communication": {
    en: "Communication",
    fr: "Communication",
    it: "Comunicazione",
  },
  "access.title": {
    en: "Access & Roles",
    fr: "Accès et rôles",
    it: "Accessi e ruoli",
  },
  "access.description": {
    en: "Manage system-wide permission groups and role assignments.",
    fr: "Gérez les groupes d'autorisations et les attributions de rôles à l'échelle du système.",
    it: "Gestisci gruppi di permessi e assegnazioni ruoli a livello di sistema.",
  },
  "access.newSystemGroup": {
    en: "New system group",
    fr: "Nouveau groupe système",
    it: "Nuovo gruppo di sistema",
  },
  "access.groupName": {
    en: "Group name",
    fr: "Nom du groupe",
    it: "Nome gruppo",
  },
  "access.create": {
    en: "Create",
    fr: "Créer",
    it: "Crea",
  },
  "access.noGroups": {
    en: "No groups available.",
    fr: "Aucun groupe disponible.",
    it: "Nessun gruppo disponibile.",
  },
  "access.noPermission": {
    en: "No permission for this page.",
    fr: "Aucune autorisation pour cette page.",
    it: "Nessun permesso per questa pagina.",
  },
  "access.customerSection": {
    en: "Access & rights",
    fr: "Accès et droits",
    it: "Accessi e diritti",
  },
  "access.contactSubject": {
    en: "Activate",
    fr: "Activer",
    it: "Attiva",
  },
  "access.addToGroup": {
    en: "Add to group…",
    fr: "Ajouter au groupe…",
    it: "Aggiungi al gruppo…",
  },
  "nav.changelog": {
    en: "Changelog",
    fr: "Dernières modifications",
    it: "Ultime modifiche",
  },
  "nav.tours.portalPreview": {
    en: "Customer preview",
    fr: "Aperçu client",
    it: "Anteprima cliente",
  },
  "customerModal.section.nasStorage": {
    en: "NAS folders (booking tool)",
    fr: "Dossiers NAS (outil de réservation)",
    it: "Cartelle NAS (strumento prenotazioni)",
  },
  "customerModal.label.nasCustomerBase": {
    en: "Customer folder base (relative to customer root)",
    fr: "Base dossier client (relatif à la racine client)",
    it: "Base cartella cliente (relativa alla root clienti)",
  },
  "customerModal.label.nasRawBase": {
    en: "Raw material base (relative to raw root)",
    fr: "Base matière brute (relatif à la racine raw)",
    it: "Base materiale grezzo (relativa alla root raw)",
  },
  "customerModal.hint.nasBases": {
    en: "Empty = default (company from booking or object folder only). If set: base + subfolder per order (ZIP city, street #no). Customer examples: “CSL Immobilien AG” or “Legacy/Company XY”.",
    fr: "Vide = défaut (entreprise depuis la réservation ou seulement dossier objet). Si renseigné : base + sous-dossier par commande (NPA ville, rue n°). Ex. client : « CSL Immobilien AG » ou « Ancien stock/Société XY ».",
    it: "Vuoto = predefinito (azienda dalla prenotazione o solo cartella oggetto). Se impostato: base + sottocartella per ordine (CAP città, via n°). Esempi cliente: «CSL Immobilien AG» o «Vecchio stock/Azienda XY».",
  },
  "emailLog.label.recipient": {
    en: "Recipient",
    fr: "Destinataire",
    it: "Destinatario",
  },
  "emailLog.label.template": {
    en: "Type",
    fr: "Type",
    it: "Tipo",
  },
  "employeeList.inactive": {
    en: "Inactive",
    fr: "Inactif",
    it: "Inattivo",
  },
  "employeeModal.button.deactivate": {
    en: "Deactivate",
    fr: "Désactiver",
    it: "Disattiva",
  },
  "employeeModal.button.reactivate": {
    en: "Reactivate",
    fr: "Réactiver",
    it: "Riattiva",
  },
  "employeeModal.button.confirmDeactivate": {
    en: "Yes, deactivate",
    fr: "Oui, désactiver",
    it: "Sì, disattiva",
  },
  "employeeModal.confirm.deactivate": {
    en: "The employee will be deactivated and will no longer appear in assignment. Existing orders stay unchanged. This can be undone.",
    fr: "L'employé sera désactivé et n'apparaîtra plus dans l'attribution. Les commandes existantes restent inchangées. Réversible.",
    it: "Il dipendente verrà disattivato e non comparirà più nell'assegnazione. Gli ordini esistenti restano invariati. Si può annullare.",
  },
  "employeeModal.label.employeeActive": {
    en: "Employee login active",
    fr: "Accès employé actif",
    it: "Accesso dipendente attivo",
  },
  "employeeModal.hint.employeeActive": {
    en: "If no: employee cannot sign in and will not be assigned.",
    fr: "Si non : l'employé ne peut pas se connecter et n'est pas attribué.",
    it: "Se no: il dipendente non può accedere e non viene assegnato.",
  },
  "employeeModal.label.bookableWizard": {
    en: "Selectable in booking wizard",
    fr: "Sélectionnable dans l'assistant de réservation",
    it: "Selezionabile nel wizard di prenotazione",
  },
  "employeeModal.hint.bookableWizard": {
    en: "Only employees with this option appear in the photographer selection for customers.",
    fr: "Seuls les employés avec cette option apparaissent dans le choix du photographe pour les clients.",
    it: "Solo i dipendenti con questa opzione compaiono nella scelta fotografo per i clienti.",
  },
  "employeeModal.label.photoUrl": {
    en: "Profile image (URL or path)",
    fr: "Photo de profil (URL ou chemin)",
    it: "Immagine profilo (URL o percorso)",
  },
  "employeeModal.hint.photoUrl": {
    en: "Relative path, external URL, or upload / pick from library – shown in the booking wizard.",
    fr: "Chemin relatif, URL externe, ou envoi / choix dans la bibliothèque – affiché dans l'assistant de réservation.",
    it: "Percorso relativo, URL esterno o caricamento / scelta dalla libreria – mostrato nel wizard di prenotazione.",
  },
  "employeeModal.photo.upload": {
    en: "Upload file",
    fr: "Téléverser un fichier",
    it: "Carica file",
  },
  "employeeModal.photo.library": {
    en: "From library",
    fr: "Depuis la bibliothèque",
    it: "Dalla libreria",
  },
  "employeeModal.photo.libraryTitle": {
    en: "Choose portrait from library",
    fr: "Choisir un portrait dans la bibliothèque",
    it: "Scegli ritratto dalla libreria",
  },
  "employeeModal.photo.libraryLoading": {
    en: "Loading library…",
    fr: "Chargement de la bibliothèque…",
    it: "Caricamento libreria…",
  },
  "employeeModal.photo.libraryEmpty": {
    en: "No images yet. Upload a photo first.",
    fr: "Pas encore d'images. Téléversez d'abord une photo.",
    it: "Nessuna immagine. Carica prima una foto.",
  },
  "employeeModal.success.saved": {
    en: "Changes saved.",
    fr: "Modifications enregistrées.",
    it: "Modifiche salvate.",
  },
  "orderStatus.sendEmailsLabel": {
    en: "Send email(s)",
    fr: "Envoyer le(s) e-mail(s)",
    it: "Invia e-mail",
  },
  "orderStatus.sendEmailsHint": {
    en: "Sends the related status templates to customer / office / photographer.",
    fr: "Envoie les modèles de statut associés au client / bureau / photographe.",
    it: "Invia i template di stato correlati a cliente / ufficio / fotografo.",
  },
  "orderStatus.target.customer": {
    en: "Customer",
    fr: "Client",
    it: "Cliente",
  },
  "orderStatus.target.office": {
    en: "Office",
    fr: "Bureau",
    it: "Ufficio",
  },
  "orderStatus.target.photographer": {
    en: "Photographer",
    fr: "Photographe",
    it: "Fotografo",
  },
  "orderStatus.target.cc": {
    en: "CC",
    fr: "CC",
    it: "CC",
  },
  "wizard.section.billingAddress": {
    en: "Billing address",
    fr: "Adresse de facturation",
    it: "Indirizzo di fatturazione",
  },
  "wizard.section.onsiteContact": {
    en: "On-site contact",
    fr: "Contact sur place",
    it: "Contatto sul posto",
  },
  "wizard.label.billingStreet": {
    en: "Street",
    fr: "Rue",
    it: "Via",
  },
  "wizard.label.billingZip": {
    en: "ZIP",
    fr: "NPA",
    it: "CAP",
  },
  "wizard.label.billingCity": {
    en: "City",
    fr: "Localité",
    it: "Città",
  },
  "wizard.label.onsiteName": {
    en: "On-site name",
    fr: "Nom sur place",
    it: "Nome sul posto",
  },
  "wizard.label.onsitePhone": {
    en: "On-site phone",
    fr: "Téléphone sur place",
    it: "Telefono sul posto",
  },
  "wizard.label.photographer": {
    en: "Photographer",
    fr: "Photographe",
    it: "Fotografo",
  },
  "wizard.label.initialStatus": {
    en: "Initial status",
    fr: "Statut initial",
    it: "Stato iniziale",
  },
  "wizard.label.ccEmails": {
    en: "CC / additional people",
    fr: "CC / autres personnes",
    it: "CC / altre persone",
  },
  "wizard.label.attendeeEmails": {
    en: "Invite more people",
    fr: "Inviter d'autres personnes",
    it: "Invita altre persone",
  },
  "wizard.hint.ccEmails": {
    en: "Comma-separated email addresses",
    fr: "Adresses e-mail séparées par des virgules",
    it: "Indirizzi e-mail separati da virgola",
  },
  "wizard.hint.attendeeEmails": {
    en: "(Appointment info, no prices)",
    fr: "(Infos rendez-vous, sans prix)",
    it: "(Info appuntamento, senza prezzi)",
  },
  "wizard.hint.attendeeEmailsDetail": {
    en: "Comma-separated emails receive appointment details when status changes (without prices)",
    fr: "Les e-mails séparés par des virgules reçoivent les détails du rendez-vous lors des changements de statut (sans prix)",
    it: "Le e-mail separate da virgola ricevono i dettagli dell'appuntamento al cambio stato (senza prezzi)",
  },
  "wizard.hint.priceEditable": {
    en: "Prices can be adjusted manually.",
    fr: "Les prix peuvent être ajustés manuellement.",
    it: "I prezzi possono essere modificati manualmente.",
  },
  "wizard.hint.statusRequiresSlot": {
    en: "For “Confirmed” or “Provisional”, photographer, date and time must be selected.",
    fr: "Pour « Confirmé » ou « Provisoire », photographe, date et heure doivent être choisis.",
    it: "Per «Confermato» o «Provvisorio» servono fotografo, data e ora.",
  },
  "wizard.hint.addressNeedsHouseNumber": {
    en: "Please choose a full address including house number.",
    fr: "Veuillez choisir une adresse complète avec numéro.",
    it: "Scegli un indirizzo completo con numero civico.",
  },
  "wizard.slot.selectFirst": {
    en: "Please select photographer and date",
    fr: "Veuillez choisir photographe et date",
    it: "Seleziona fotografo e data",
  },
  "wizard.slot.selectDate": {
    en: "Please pick a date first",
    fr: "Veuillez d'abord choisir une date",
    it: "Scegli prima una data",
  },
  "wizard.slot.loading": {
    en: "Loading availability…",
    fr: "Chargement des disponibilités…",
    it: "Caricamento disponibilità…",
  },
  "wizard.slot.none": {
    en: "No free slot on this day",
    fr: "Aucun créneau libre ce jour-là",
    it: "Nessuno slot libero in questo giorno",
  },
  "wizard.slot.am": {
    en: "Morning",
    fr: "Matin",
    it: "Mattina",
  },
  "wizard.slot.pm": {
    en: "Afternoon",
    fr: "Après-midi",
    it: "Pomeriggio",
  },
  "wizard.slot.duration": {
    en: "Calculated duration",
    fr: "Durée calculée",
    it: "Durata calcolata",
  },
  "wizard.slot.durationMin": {
    en: "{{min}} min",
    fr: "{{min}} min",
    it: "{{min}} min",
  },
  "wizard.slot.suggestedPhotographer": {
    en: "Suggested photographer",
    fr: "Photographe suggéré",
    it: "Fotografo suggerito",
  },
};

function buildMerged(locale, existing) {
  const out = {};
  for (const key of Object.keys(de)) {
    if (key in existing) {
      out[key] = existing[key];
    } else if (T[key]) {
      out[key] = T[key][locale];
    } else {
      out[key] = de[key];
    }
  }
  for (const key of Object.keys(existing)) {
    if (!(key in out)) out[key] = existing[key];
  }
  return out;
}

function financeNavPatch(obj, locale) {
  const patches = {
    en: {
      "nav.finance.invoices": "Invoices",
      "nav.finance.openInvoices": "Open invoices",
      "nav.finance.paidInvoices": "Paid invoices",
      "nav.finance.bankImport": "Bank import",
      "nav.finance.reminders": "Dunning",
      "nav.finance.exxasSync": "Exxas invoices",
    },
    fr: {
      "nav.finance.invoices": "Factures",
      "nav.finance.openInvoices": "Factures ouvertes",
      "nav.finance.paidInvoices": "Factures payées",
      "nav.finance.bankImport": "Import bancaire",
      "nav.finance.reminders": "Relances",
      "nav.finance.exxasSync": "Factures Exxas",
    },
    it: {
      "nav.finance.invoices": "Fatture",
      "nav.finance.openInvoices": "Fatture aperte",
      "nav.finance.paidInvoices": "Fatture pagate",
      "nav.finance.bankImport": "Importazione bancaria",
      "nav.finance.reminders": "Solleciti",
      "nav.finance.exxasSync": "Fatture Exxas",
    },
  };
  const p = patches[locale];
  if (!p) return;
  for (const [k, v] of Object.entries(p)) {
    obj[k] = v;
  }
}

for (const locale of ["en", "fr", "it"]) {
  const file = path.join(i18nDir, `${locale}.json`);
  const existing = JSON.parse(fs.readFileSync(file, "utf8"));
  let merged = buildMerged(locale, existing);
  financeNavPatch(merged, locale);
  fs.writeFileSync(file, JSON.stringify(merged, null, 2) + "\n", "utf8");
}

const enAfter = JSON.parse(fs.readFileSync(path.join(i18nDir, "en.json"), "utf8"));
const stillMissing = Object.keys(de).filter((k) => !(k in enAfter));
if (stillMissing.length) {
  console.error("Keys still missing from en after merge:", stillMissing);
  process.exit(1);
}
console.log("OK: en/fr/it merged from de key set; finance nav updated.");
