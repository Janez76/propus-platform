const SUPPORTED_LANGS = new Set(["de", "en", "fr", "it", "sr"]);

function normalizeLang(lang = "de") {
  const base = String(lang || "de").trim().toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_LANGS.has(base) ? base : "de";
}

const OBJECT_TYPE_I18N = {
  de: {
    apartment: "Wohnung",
    single_house: "Einfamilienhaus",
    multi_house: "Mehrfamilienhaus",
    commercial: "Gewerbe",
    land: "Grundstueck",
    house: "Haus",
    other: "Anderes"
  },
  en: {
    apartment: "Apartment",
    single_house: "Single-family house",
    multi_house: "Multi-family house",
    commercial: "Commercial",
    land: "Land",
    house: "House",
    other: "Other"
  },
  fr: {
    apartment: "Appartement",
    single_house: "Maison individuelle",
    multi_house: "Immeuble collectif",
    commercial: "Commercial",
    land: "Terrain",
    house: "Maison",
    other: "Autre"
  },
  it: {
    apartment: "Appartamento",
    single_house: "Casa unifamiliare",
    multi_house: "Casa plurifamiliare",
    commercial: "Commerciale",
    land: "Terreno",
    house: "Casa",
    other: "Altro"
  },
  sr: {
    apartment: "Stan",
    single_house: "Porodicna kuca",
    multi_house: "Viseporodicna kuca",
    commercial: "Poslovni objekat",
    land: "Plac",
    house: "Kuca",
    other: "Ostalo"
  }
};

function objType(type, lang = "de") {
  const l = normalizeLang(lang);
  return OBJECT_TYPE_I18N[l]?.[type] || OBJECT_TYPE_I18N.de[type] || type || "\u2014";
}

// ─── Mehrsprachigkeit (Fotograf-Mails) ───────────────────────────────────────

const PHOTOG_I18N = {
  de: {
    newOrder:          (no) => `Neuer Auftrag${no ? " #"+no : ""}`,
    newOrderIntro:     "Du hast einen neuen Auftrag erhalten. Alle Details sind unten zusammengefasst.",
    appointment:       "Termin",
    dateTime:          "Datum & Zeit",
    orderNo:           "Auftragsnr.",
    address:           "Objekt & Adresse",
    services:          "Dienstleistungen",
    client:            "Kunde",
    name:              "Name",
    email:             "E-Mail",
    phone:             "Telefon",
    notes:             "Hinweise",
    onsite:            "Kontakt vor Ort",
    keyPickupSec:      "Schl\u00fcsselabholung",
    cancelled:         (no) => `Auftrag #${no} \u2013 Abgesagt`,
    cancelledIntro:    "Der folgende Auftrag wurde storniert. Der Termin ist damit frei.",
    rescheduled:       (no) => `Auftrag #${no} \u2013 Termin verschoben`,
    rescheduledIntro:  "Der Termin f\u00fcr deinen Auftrag wurde ge\u00e4ndert.",
    change:            "Termin\u00e4nderung",
    oldDate:           "Alter Termin",
    newDate:           "Neuer Termin",
    reassignTaken:     (no, other) => `Neuer Auftrag #${no} \u00fcbernommen`,
    reassignTakenIntro:(no, other) => `Du hast diesen Auftrag \u00fcbernommen (vorheriger Fotograf: ${other || "\u2014"}).`,
    reassignGiven:     (no, other) => `Auftrag #${no} \u00fcbergeben`,
    reassignGivenIntro:(no, other) => `Dein Auftrag wurde an ${other || "\u2014"} \u00fcbergeben. Der Termin ist f\u00fcr dich frei.`,
    area:              "Fl\u00e4che",
    footer:            (no) => `Auftragsnummer #${no}`,
    openBooking:       "Buchung \u00f6ffnen",
  },
  en: {
    newOrder:          (no) => `New Assignment${no ? " #"+no : ""}`,
    newOrderIntro:     "You have received a new assignment. All details are summarized below.",
    appointment:       "Appointment",
    dateTime:          "Date & Time",
    orderNo:           "Order No.",
    address:           "Property & Address",
    services:          "Services",
    client:            "Client",
    name:              "Name",
    email:             "E-Mail",
    phone:             "Phone",
    notes:             "Notes",
    onsite:            "On-site Contact",
    keyPickupSec:      "Key Pickup",
    cancelled:         (no) => `Assignment #${no} \u2013 Cancelled`,
    cancelledIntro:    "The following assignment has been cancelled. The slot is now free.",
    rescheduled:       (no) => `Assignment #${no} \u2013 Rescheduled`,
    rescheduledIntro:  "The appointment for your assignment has been changed.",
    change:            "Schedule Change",
    oldDate:           "Previous Date",
    newDate:           "New Date",
    reassignTaken:     (no, other) => `New Assignment #${no} Taken Over`,
    reassignTakenIntro:(no, other) => `You have taken over this assignment (previous photographer: ${other || "\u2014"}).`,
    reassignGiven:     (no, other) => `Assignment #${no} Handed Over`,
    reassignGivenIntro:(no, other) => `Your assignment has been handed over to ${other || "\u2014"}. The slot is free for you.`,
    area:              "Area",
    footer:            (no) => `Order Number #${no}`,
    openBooking:       "Open Booking",
  },
  sr: {
    newOrder:          (no) => `Novi nalog${no ? " #"+no : ""}`,
    newOrderIntro:     "Dobili ste novi nalog. Sve pojedinosti su navedene ispod.",
    appointment:       "Termin",
    dateTime:          "Datum i vreme",
    orderNo:           "Br. naloga",
    address:           "Nekretnina i adresa",
    services:          "Usluge",
    client:            "Klijent",
    name:              "Ime",
    email:             "E-po\u0161ta",
    phone:             "Telefon",
    notes:             "Napomene",
    onsite:            "Kontakt na licu mesta",
    keyPickupSec:      "Preuzimanje klju\u010da",
    cancelled:         (no) => `Nalog #${no} \u2013 Otkazan`,
    cancelledIntro:    "Slede\u0107i nalog je otkazan. Termin je slobodan.",
    rescheduled:       (no) => `Nalog #${no} \u2013 Termin promenjen`,
    rescheduledIntro:  "Termin za va\u0161 nalog je promenjen.",
    change:            "Promena termina",
    oldDate:           "Stari termin",
    newDate:           "Novi termin",
    reassignTaken:     (no, other) => `Novi nalog #${no} preuzet`,
    reassignTakenIntro:(no, other) => `Preuzeli ste ovaj nalog (prethodni fotograf: ${other || "\u2014"}).`,
    reassignGiven:     (no, other) => `Nalog #${no} prenet`,
    reassignGivenIntro:(no, other) => `Va\u0161 nalog je prenet na ${other || "\u2014"}. Termin je slobodan.`,
    area:              "Povr\u0161ina",
    footer:            (no) => `Broj naloga #${no}`,
    openBooking:       "Otvori nalog",
    // Zugangsdaten
    credSubject:       "Va\u0161i pristupni podaci za Propus Admin-Panel",
    credGreeting:      (name) => `Zdravo ${name},`,
    credIntro:         "ovde su va\u0161i pristupni podaci za Propus Admin-Panel:",
    credKey:           "Klju\u010d zaposlenog",
    credEmail:         "E-po\u0161ta",
    credPassword:      "Lozinka",
    credLoginLink:     "Link za prijavu",
    credPwAlreadySet:  "(Lozinka je ve\u0107 pode\u0161ena \u2013 koristite postoje\u0107u lozinku)",
    credChangePw:      "Molimo promenite lozinku nakon prvog prijavljivanja.",
    // Passwort-Reset
    resetSubject:      "Resetovanje lozinke \u2013 Propus",
    resetGreeting:     (name) => `Zdravo ${name},`,
    resetIntro:        "Zatra\u017eili ste resetovanje lozinke. Kliknite na link da postavite novu lozinku:",
    resetButton:       "Resetuj lozinku",
    resetExpiry:       "Link va\u017ei 2 sata. Ako niste zatra\u017eili resetovanje, ignorišite ovu poruku.",
  },
};

// ─── Zugangsdaten-Übersetzungen (de/en/sr) ────────────────────────────────────

const CRED_I18N = {
  de: {
    subject:      "Deine Zugangsdaten f\u00fcr das Propus Admin-Panel",
    greeting:     (name) => `Hallo ${name},`,
    intro:        "hier sind deine Zugangsdaten f\u00fcr das Propus Admin-Panel:",
    key:          "Mitarbeiter-Key",
    email:        "E-Mail",
    password:     "Passwort",
    loginLink:    "Login-Link",
    pwAlreadySet: "(Passwort wurde bereits gesetzt \u2013 bitte das bestehende Passwort verwenden)",
    changePw:        "Bitte \u00e4ndere dein Passwort nach dem ersten Login.",
    setPasswordBtn:  "Passwort jetzt setzen",
    resetPasswordBtn:"Passwort \u00e4ndern",
    resetSubject: "Passwort zur\u00fccksetzen \u2013 Propus",
    resetGreeting:(name) => `Hallo ${name},`,
    resetIntro:   "Du hast einen Passwort-Reset angefordert. Klicke auf den Link, um ein neues Passwort zu setzen:",
    resetButton:  "Passwort zur\u00fccksetzen",
    resetExpiry:  "Der Link ist 2 Stunden g\u00fcltig. Falls du keinen Reset angefordert hast, ignoriere diese Mail.",
  },
  en: {
    subject:      "Your login credentials for the Propus Admin Panel",
    greeting:     (name) => `Hello ${name},`,
    intro:        "here are your login credentials for the Propus Admin Panel:",
    key:          "Employee Key",
    email:        "E-Mail",
    password:     "Password",
    loginLink:    "Login Link",
    pwAlreadySet: "(Password has already been set \u2013 please use your existing password)",
    changePw:        "Please change your password after the first login.",
    setPasswordBtn:  "Set password now",
    resetPasswordBtn:"Change password",
    resetSubject: "Reset your password \u2013 Propus",
    resetGreeting:(name) => `Hello ${name},`,
    resetIntro:   "You requested a password reset. Click the link to set a new password:",
    resetButton:  "Reset password",
    resetExpiry:  "The link is valid for 2 hours. If you did not request a reset, ignore this email.",
  },
  sr: {
    subject:      "Va\u0161i pristupni podaci za Propus Admin-Panel",
    greeting:     (name) => `Zdravo ${name},`,
    intro:        "ovde su va\u0161i pristupni podaci za Propus Admin-Panel:",
    key:          "Klju\u010d zaposlenog",
    email:        "E-po\u0161ta",
    password:     "Lozinka",
    loginLink:    "Link za prijavu",
    pwAlreadySet: "(Lozinka je ve\u0107 pode\u0161ena \u2013 koristite postoje\u0107u lozinku)",
    changePw:        "Molimo promenite lozinku nakon prvog prijavljivanja.",
    setPasswordBtn:  "Postavi lozinku sada",
    resetPasswordBtn:"Promeni lozinku",
    resetSubject: "Resetovanje lozinke \u2013 Propus",
    resetGreeting:(name) => `Zdravo ${name},`,
    resetIntro:   "Zatra\u017eili ste resetovanje lozinke. Kliknite na link da postavite novu lozinku:",
    resetButton:  "Resetuj lozinku",
    resetExpiry:  "Link va\u017ei 2 sata. Ako niste zatra\u017eili resetovanje, ignori\u0161ite ovu poruku.",
  },
};

function getC(lang) {
  return CRED_I18N[lang] || CRED_I18N.de;
}

// ─── Welcome-Mail i18n ────────────────────────────────────────────────────────

const WELCOME_I18N = {
  de: {
    subject:    "Willkommen bei Propus – dein Zugang ist bereit",
    greeting:   (name) => `Willkommen, ${name}!`,
    intro:      "Dein Mitarbeiter-Zugang für das Propus Admin-Panel wurde eingerichtet. Du kannst dich ab sofort einloggen.",
    loginBtn:   "Jetzt einloggen",
    loginTitle: "Anmelden",
    teamNote:   "Wir freuen uns, dich im Propus-Team zu begrüssen. Bei Fragen steht dir das Team jederzeit zur Verfügung.",
    footer:     "&copy; 2026 Propus GmbH",
  },
  en: {
    subject:    "Welcome to Propus – your access is ready",
    greeting:   (name) => `Welcome, ${name}!`,
    intro:      "Your employee access for the Propus Admin Panel has been set up. You can now log in.",
    loginBtn:   "Log in now",
    loginTitle: "Sign in",
    teamNote:   "We are happy to have you on the Propus team. If you have any questions, the team is always available.",
    footer:     "&copy; 2026 Propus GmbH",
  },
  fr: {
    subject:    "Bienvenue chez Propus – votre accès est prêt",
    greeting:   (name) => `Bienvenue, ${name} !`,
    intro:      "Votre accès employé au panneau d'administration Propus a été configuré. Vous pouvez vous connecter dès maintenant.",
    loginBtn:   "Se connecter maintenant",
    loginTitle: "Connexion",
    teamNote:   "Nous sommes ravis de vous accueillir dans l'équipe Propus. Pour toute question, l'équipe est toujours disponible.",
    footer:     "&copy; 2026 Propus GmbH",
  },
  it: {
    subject:    "Benvenuto in Propus – il tuo accesso è pronto",
    greeting:   (name) => `Benvenuto, ${name}!`,
    intro:      "Il tuo accesso dipendente al pannello di amministrazione Propus è stato configurato. Puoi effettuare l'accesso ora.",
    loginBtn:   "Accedi ora",
    loginTitle: "Accedi",
    teamNote:   "Siamo lieti di averti nel team Propus. Per qualsiasi domanda, il team è sempre disponibile.",
    footer:     "&copy; 2026 Propus GmbH",
  },
};

function getW(lang) {
  return WELCOME_I18N[normalizeLang(lang)] || WELCOME_I18N.de;
}

function getT(lang) {
  return PHOTOG_I18N[lang] || PHOTOG_I18N.de;
}

const MAIL_I18N = {
  de: {
    sections: {
      appointment: "Termin",
      address: "Objekt & Adresse",
      services: "Dienstleistungen",
      price: "Preis",
      photographer: "Fotograf",
      customer: "Kunde",
      customerData: "Kundendaten",
      billingAddress: "Rechnungsadresse",
      onsite: "Kontakt vor Ort",
      keyPickup: "Schluesselabholung",
      notes: "Hinweise",
      oldPhotographer: "Alter Fotograf",
      newPhotographer: "Neuer Fotograf",
      change: "Terminaenderung"
    },
    labels: {
      dateTime: "Datum & Zeit",
      orderNo: "Auftragsnr.",
      name: "Name",
      firstName: "Vorname",
      reference: "Referenz",
      company: "Firma",
      email: "E-Mail",
      phone: "Telefon",
      mobile: "Mobile",
      whatsapp: "WhatsApp",
      street: "Strasse",
      zipCity: "PLZ / Ort",
      address: "Adresse",
      objectType: "Objektart",
      area: "Flaeche",
      rooms: "Zimmer",
      floors: "Etagen/Ebene",
      floor: "Etage",
      info: "Info"
    },
    pricing: { subtotal: "Zwischensumme", discount: "Rabatt", vat: "MwSt (8.1%)", total: "TOTAL" },
    customerBooking: {
      heading: (no) => `Buchungsbestaetigung${no ? " #" + no : ""}`,
      subject: (no) => `Propus \u2013 Buchungsbestaetigung${no ? " #" + no : ""}`,
      intro: "Vielen Dank fuer Ihre Buchung bei Propus. Wir freuen uns darauf, Ihre Immobilie professionell in Szene zu setzen. Nachfolgend finden Sie alle Details Ihres Auftrags.",
      confirmedBadge: "\u2713 Bestaetigt",
      routeBtn: "\ud83d\udccd Route oeffnen",
      calendarBtn: "\ud83d\udcc5 Kalender (.ics)",
      portalBtn: "Mein Konto oeffnen",
      servicesTitle: "\ud83d\udce6 Dienstleistungen",
      priceTitle: "\ud83d\udcb0 Preis",
      notesTitle: "\ud83d\udcdd Hinweise",
      infoTitle: "\ud83c\udfaf Wichtige Informationen",
      infoText: "Bitte stellen Sie sicher, dass die Raeumlichkeiten zum vereinbarten Termin zugaenglich und aufgeraeumt sind. Bei Fragen erreichen Sie uns jederzeit unter",
      footer: "Bei Fragen sind wir gerne fuer Sie da"
    },
    officeBooking: {
      heading: (no) => `Neue Bestellung${no ? " #" + no : ""}`,
      subject: (no) => `Neue Bestellung${no ? " #" + no : ""}`,
      intro: "Eine neue Buchung ist eingegangen.",
      footer: "Propus Buchungstool"
    },
    cancellationOffice: {
      heading: (no) => `Auftrag #${no} \u2013 Abgesagt`,
      subject: (no) => `Auftrag #${no} abgesagt`,
      intro: "Der folgende Auftrag wurde storniert.",
      footer: "Propus Buchungstool"
    },
    cancellationCustomer: {
      heading: (no) => `Ihre Buchung #${no} wurde storniert`,
      subject: (no) => `Propus \u2013 Buchung #${no} storniert`,
      intro: "Wir bedauern, Ihnen mitteilen zu muessen, dass Ihre Buchung storniert wurde. Bei Fragen stehen wir Ihnen gerne zur Verfuegung.",
      badge: "\u2717 Storniert",
      cancelledAppointment: "\ud83d\udcc5 Stornierter Termin",
      photographerTitle: "\ud83d\udcf8 Ihr Fotograf",
      rebookTitle: "\ud83d\udca1 Moechten Sie einen neuen Termin vereinbaren?",
      rebookText: "Kontaktieren Sie uns gerne fuer eine Neuterminierung unter",
      footer: "Wir bedauern die Unannehmlichkeiten"
    },
    rescheduleOffice: {
      heading: (no) => `Auftrag #${no} \u2013 Termin verschoben`,
      subject: (no) => `Auftrag #${no} \u2013 Termin verschoben`,
      intro: "Der Termin fuer den folgenden Auftrag wurde angepasst.",
      oldDate: "Alter Termin",
      newDate: "Neuer Termin",
      footer: "Propus Buchungstool"
    },
    rescheduleCustomer: {
      heading: (no) => `Ihre Buchung #${no} \u2013 Neuer Termin`,
      subject: (no) => `Propus \u2013 Buchung #${no} verschoben`,
      intro: "Ihr Termin wurde verschoben. Nachfolgend finden Sie die aktualisierten Details.",
      badge: "\u21bb Verschoben",
      changeTitle: "\ud83d\udd04 Terminaenderung",
      oldDate: "Alter Termin",
      newDate: "Neuer Termin",
      photographerTitle: "Ihr Fotograf",
      footer: "Fragen?"
    },
    reassignOffice: {
      heading: (no) => `Auftrag #${no} \u2013 Fotograf geaendert`,
      subject: (no) => `Auftrag #${no} \u2013 Neuer Fotograf`,
      intro: "Der Fotograf fuer den folgenden Auftrag wurde gewechselt.",
      footer: "Propus Buchungstool"
    },
    reassignCustomer: {
      heading: (no) => `Ihre Buchung #${no} \u2013 Neuer Fotograf`,
      subject: (no) => `Propus \u2013 Buchung #${no} neuer Fotograf`,
      intro: (name) => `Ihr Fotograf wurde geaendert. Ihr neuer Fotograf ist <strong>${name || "\u2014"}</strong>.`,
      newPhotographerTitle: "Neuer Fotograf",
      footer: "Fragen?"
    }
  },
  en: {
    sections: {
      appointment: "Appointment",
      address: "Property & Address",
      services: "Services",
      price: "Price",
      photographer: "Photographer",
      customer: "Customer",
      customerData: "Customer Details",
      billingAddress: "Billing Address",
      onsite: "On-site Contact",
      keyPickup: "Key Pickup",
      notes: "Notes",
      oldPhotographer: "Previous Photographer",
      newPhotographer: "New Photographer",
      change: "Schedule Change"
    },
    labels: {
      dateTime: "Date & Time",
      orderNo: "Order No.",
      name: "Name",
      firstName: "First name",
      reference: "Reference",
      company: "Company",
      email: "E-Mail",
      phone: "Phone",
      mobile: "Mobile",
      whatsapp: "WhatsApp",
      street: "Street",
      zipCity: "ZIP / City",
      address: "Address",
      objectType: "Property Type",
      area: "Area",
      rooms: "Rooms",
      floors: "Floors/Level",
      floor: "Floor",
      info: "Info"
    },
    pricing: { subtotal: "Subtotal", discount: "Discount", vat: "VAT (8.1%)", total: "TOTAL" },
    customerBooking: {
      heading: (no) => `Booking Confirmation${no ? " #" + no : ""}`,
      subject: (no) => `Propus \u2013 Booking Confirmation${no ? " #" + no : ""}`,
      intro: "Thank you for your booking with Propus. We look forward to presenting your property professionally. Below you will find all details of your order.",
      confirmedBadge: "\u2713 Confirmed",
      routeBtn: "\ud83d\udccd Open Route",
      calendarBtn: "\ud83d\udcc5 Calendar (.ics)",
      portalBtn: "Open my account",
      servicesTitle: "\ud83d\udce6 Services",
      priceTitle: "\ud83d\udcb0 Price",
      notesTitle: "\ud83d\udcdd Notes",
      infoTitle: "\ud83c\udfaf Important Information",
      infoText: "Please ensure the premises are accessible and tidy at the scheduled time. If you have any questions, you can always reach us at",
      footer: "We are happy to help with any questions"
    },
    officeBooking: {
      heading: (no) => `New Order${no ? " #" + no : ""}`,
      subject: (no) => `New Order${no ? " #" + no : ""}`,
      intro: "A new booking has been received.",
      footer: "Propus booking tool"
    },
    cancellationOffice: {
      heading: (no) => `Order #${no} \u2013 Cancelled`,
      subject: (no) => `Order #${no} cancelled`,
      intro: "The following order has been cancelled.",
      footer: "Propus booking tool"
    },
    cancellationCustomer: {
      heading: (no) => `Your booking #${no} has been cancelled`,
      subject: (no) => `Propus \u2013 Booking #${no} cancelled`,
      intro: "We regret to inform you that your booking has been cancelled. If you have questions, we are happy to help.",
      badge: "\u2717 Cancelled",
      cancelledAppointment: "\ud83d\udcc5 Cancelled Appointment",
      photographerTitle: "\ud83d\udcf8 Your Photographer",
      rebookTitle: "\ud83d\udca1 Would you like to schedule a new appointment?",
      rebookText: "Feel free to contact us to schedule a new appointment at",
      footer: "We apologize for the inconvenience"
    },
    rescheduleOffice: {
      heading: (no) => `Order #${no} \u2013 Rescheduled`,
      subject: (no) => `Order #${no} \u2013 Rescheduled`,
      intro: "The appointment for the following order has been adjusted.",
      oldDate: "Previous date",
      newDate: "New date",
      footer: "Propus booking tool"
    },
    rescheduleCustomer: {
      heading: (no) => `Your booking #${no} \u2013 New appointment`,
      subject: (no) => `Propus \u2013 Booking #${no} rescheduled`,
      intro: "Your appointment has been rescheduled. Below are the updated details.",
      badge: "\u21bb Rescheduled",
      changeTitle: "\ud83d\udd04 Schedule Change",
      oldDate: "Previous date",
      newDate: "New date",
      photographerTitle: "Your Photographer",
      footer: "Questions?"
    },
    reassignOffice: {
      heading: (no) => `Order #${no} \u2013 Photographer changed`,
      subject: (no) => `Order #${no} \u2013 New photographer`,
      intro: "The photographer for the following order has been changed.",
      footer: "Propus booking tool"
    },
    reassignCustomer: {
      heading: (no) => `Your booking #${no} \u2013 New photographer`,
      subject: (no) => `Propus \u2013 Booking #${no} new photographer`,
      intro: (name) => `Your photographer has been changed. Your new photographer is <strong>${name || "\u2014"}</strong>.`,
      newPhotographerTitle: "New Photographer",
      footer: "Questions?"
    }
  },
  fr: {
    sections: {
      appointment: "Rendez-vous",
      address: "Bien & Adresse",
      services: "Services",
      price: "Prix",
      photographer: "Photographe",
      customer: "Client",
      customerData: "Coordonnees client",
      billingAddress: "Adresse de facturation",
      onsite: "Contact sur place",
      keyPickup: "Remise des cles",
      notes: "Remarques",
      oldPhotographer: "Ancien photographe",
      newPhotographer: "Nouveau photographe",
      change: "Changement de rendez-vous"
    },
    labels: {
      dateTime: "Date & Heure",
      orderNo: "No. de commande",
      name: "Nom",
      firstName: "Prenom",
      reference: "Reference",
      company: "Societe",
      email: "E-Mail",
      phone: "Telephone",
      mobile: "Mobile",
      whatsapp: "WhatsApp",
      street: "Rue",
      zipCity: "NPA / Ville",
      address: "Adresse",
      objectType: "Type de bien",
      area: "Surface",
      rooms: "Pieces",
      floors: "Etages/Niveau",
      floor: "Etage",
      info: "Info"
    },
    pricing: { subtotal: "Sous-total", discount: "Remise", vat: "TVA (8.1%)", total: "TOTAL" },
    customerBooking: {
      heading: (no) => `Confirmation de reservation${no ? " #" + no : ""}`,
      subject: (no) => `Propus \u2013 Confirmation de reservation${no ? " #" + no : ""}`,
      intro: "Merci pour votre reservation chez Propus. Nous nous rejouissons de mettre votre bien en valeur de maniere professionnelle. Vous trouverez ci-dessous tous les details de votre commande.",
      confirmedBadge: "\u2713 Confirmee",
      routeBtn: "\ud83d\udccd Ouvrir l'itineraire",
      calendarBtn: "\ud83d\udcc5 Calendrier (.ics)",
      portalBtn: "Ouvrir mon compte",
      servicesTitle: "\ud83d\udce6 Services",
      priceTitle: "\ud83d\udcb0 Prix",
      notesTitle: "\ud83d\udcdd Remarques",
      infoTitle: "\ud83c\udfaf Informations importantes",
      infoText: "Veuillez vous assurer que les locaux sont accessibles et ranges a l'heure convenue. En cas de questions, vous pouvez nous contacter a tout moment a",
      footer: "Nous sommes a votre disposition en cas de questions"
    },
    officeBooking: {
      heading: (no) => `Nouvelle commande${no ? " #" + no : ""}`,
      subject: (no) => `Nouvelle commande${no ? " #" + no : ""}`,
      intro: "Une nouvelle reservation a ete recue.",
      footer: "Outil de reservation Propus"
    },
    cancellationOffice: {
      heading: (no) => `Commande #${no} \u2013 Annulee`,
      subject: (no) => `Commande #${no} annulee`,
      intro: "La commande suivante a ete annulee.",
      footer: "Outil de reservation Propus"
    },
    cancellationCustomer: {
      heading: (no) => `Votre reservation #${no} a ete annulee`,
      subject: (no) => `Propus \u2013 Reservation #${no} annulee`,
      intro: "Nous regrettons de vous informer que votre reservation a ete annulee. En cas de questions, nous sommes a votre disposition.",
      badge: "\u2717 Annulee",
      cancelledAppointment: "\ud83d\udcc5 Rendez-vous annule",
      photographerTitle: "\ud83d\udcf8 Votre photographe",
      rebookTitle: "\ud83d\udca1 Souhaitez-vous convenir d'un nouveau rendez-vous ?",
      rebookText: "N'hesitez pas a nous contacter pour une nouvelle planification a",
      footer: "Nous regrettons les inconvenients"
    },
    rescheduleOffice: {
      heading: (no) => `Commande #${no} \u2013 Rendez-vous deplace`,
      subject: (no) => `Commande #${no} \u2013 Rendez-vous deplace`,
      intro: "Le rendez-vous de la commande suivante a ete adapte.",
      oldDate: "Ancien rendez-vous",
      newDate: "Nouveau rendez-vous",
      footer: "Outil de reservation Propus"
    },
    rescheduleCustomer: {
      heading: (no) => `Votre reservation #${no} \u2013 Nouveau rendez-vous`,
      subject: (no) => `Propus \u2013 Reservation #${no} deplacee`,
      intro: "Votre rendez-vous a ete deplace. Vous trouverez ci-dessous les details mis a jour.",
      badge: "\u21bb Deplace",
      changeTitle: "\ud83d\udd04 Changement de rendez-vous",
      oldDate: "Ancien rendez-vous",
      newDate: "Nouveau rendez-vous",
      photographerTitle: "Votre photographe",
      footer: "Questions ?"
    },
    reassignOffice: {
      heading: (no) => `Commande #${no} \u2013 Photographe modifie`,
      subject: (no) => `Commande #${no} \u2013 Nouveau photographe`,
      intro: "Le photographe pour la commande suivante a ete change.",
      footer: "Outil de reservation Propus"
    },
    reassignCustomer: {
      heading: (no) => `Votre reservation #${no} \u2013 Nouveau photographe`,
      subject: (no) => `Propus \u2013 Reservation #${no} nouveau photographe`,
      intro: (name) => `Votre photographe a ete change. Votre nouveau photographe est <strong>${name || "\u2014"}</strong>.`,
      newPhotographerTitle: "Nouveau photographe",
      footer: "Questions ?"
    }
  },
  it: {
    sections: {
      appointment: "Appuntamento",
      address: "Immobile & Indirizzo",
      services: "Servizi",
      price: "Prezzo",
      photographer: "Fotografo",
      customer: "Cliente",
      customerData: "Dati cliente",
      billingAddress: "Indirizzo di fatturazione",
      onsite: "Contatto sul posto",
      keyPickup: "Consegna chiavi",
      notes: "Note",
      oldPhotographer: "Fotografo precedente",
      newPhotographer: "Nuovo fotografo",
      change: "Cambio appuntamento"
    },
    labels: {
      dateTime: "Data & Ora",
      orderNo: "N. ordine",
      name: "Nome",
      firstName: "Nome",
      reference: "Riferimento",
      company: "Azienda",
      email: "E-Mail",
      phone: "Telefono",
      mobile: "Mobile",
      whatsapp: "WhatsApp",
      street: "Via",
      zipCity: "CAP / Citta",
      address: "Indirizzo",
      objectType: "Tipo immobile",
      area: "Superficie",
      rooms: "Stanze",
      floors: "Piani/Livello",
      floor: "Piano",
      info: "Info"
    },
    pricing: { subtotal: "Subtotale", discount: "Sconto", vat: "IVA (8.1%)", total: "TOTALE" },
    customerBooking: {
      heading: (no) => `Conferma prenotazione${no ? " #" + no : ""}`,
      subject: (no) => `Propus \u2013 Conferma prenotazione${no ? " #" + no : ""}`,
      intro: "Grazie per la sua prenotazione con Propus. Saremo lieti di valorizzare il suo immobile in modo professionale. Di seguito trova tutti i dettagli dell'ordine.",
      confirmedBadge: "\u2713 Confermata",
      routeBtn: "\ud83d\udccd Apri percorso",
      calendarBtn: "\ud83d\udcc5 Calendario (.ics)",
      portalBtn: "Apri il mio account",
      servicesTitle: "\ud83d\udce6 Servizi",
      priceTitle: "\ud83d\udcb0 Prezzo",
      notesTitle: "\ud83d\udcdd Note",
      infoTitle: "\ud83c\udfaf Informazioni importanti",
      infoText: "La preghiamo di assicurarsi che i locali siano accessibili e in ordine all'orario concordato. In caso di domande, ci contatti in qualsiasi momento a",
      footer: "Siamo a disposizione per qualsiasi domanda"
    },
    officeBooking: {
      heading: (no) => `Nuovo ordine${no ? " #" + no : ""}`,
      subject: (no) => `Nuovo ordine${no ? " #" + no : ""}`,
      intro: "E stata ricevuta una nuova prenotazione.",
      footer: "Tool di prenotazione Propus"
    },
    cancellationOffice: {
      heading: (no) => `Ordine #${no} \u2013 Annullato`,
      subject: (no) => `Ordine #${no} annullato`,
      intro: "Il seguente ordine e stato annullato.",
      footer: "Tool di prenotazione Propus"
    },
    cancellationCustomer: {
      heading: (no) => `La sua prenotazione #${no} e stata annullata`,
      subject: (no) => `Propus \u2013 Prenotazione #${no} annullata`,
      intro: "Siamo spiacenti di comunicarle che la sua prenotazione e stata annullata. In caso di domande, siamo a sua disposizione.",
      badge: "\u2717 Annullata",
      cancelledAppointment: "\ud83d\udcc5 Appuntamento annullato",
      photographerTitle: "\ud83d\udcf8 Il suo fotografo",
      rebookTitle: "\ud83d\udca1 Vuole fissare un nuovo appuntamento?",
      rebookText: "Ci contatti volentieri per una nuova pianificazione a",
      footer: "Ci scusiamo per il disagio"
    },
    rescheduleOffice: {
      heading: (no) => `Ordine #${no} \u2013 Appuntamento spostato`,
      subject: (no) => `Ordine #${no} \u2013 Appuntamento spostato`,
      intro: "L'appuntamento per il seguente ordine e stato modificato.",
      oldDate: "Data precedente",
      newDate: "Nuova data",
      footer: "Tool di prenotazione Propus"
    },
    rescheduleCustomer: {
      heading: (no) => `La sua prenotazione #${no} \u2013 Nuovo appuntamento`,
      subject: (no) => `Propus \u2013 Prenotazione #${no} spostata`,
      intro: "Il suo appuntamento e stato spostato. Di seguito trova i dettagli aggiornati.",
      badge: "\u21bb Spostata",
      changeTitle: "\ud83d\udd04 Cambio appuntamento",
      oldDate: "Data precedente",
      newDate: "Nuova data",
      photographerTitle: "Il suo fotografo",
      footer: "Domande?"
    },
    reassignOffice: {
      heading: (no) => `Ordine #${no} \u2013 Fotografo modificato`,
      subject: (no) => `Ordine #${no} \u2013 Nuovo fotografo`,
      intro: "Il fotografo per il seguente ordine e stato cambiato.",
      footer: "Tool di prenotazione Propus"
    },
    reassignCustomer: {
      heading: (no) => `La sua prenotazione #${no} \u2013 Nuovo fotografo`,
      subject: (no) => `Propus \u2013 Prenotazione #${no} nuovo fotografo`,
      intro: (name) => `Il suo fotografo e stato cambiato. Il suo nuovo fotografo e <strong>${name || "\u2014"}</strong>.`,
      newPhotographerTitle: "Nuovo fotografo",
      footer: "Domande?"
    }
  },
  sr: {
    sections: {
      appointment: "Termin",
      address: "Nekretnina i adresa",
      services: "Usluge",
      price: "Cena",
      photographer: "Fotograf",
      customer: "Klijent",
      customerData: "Podaci klijenta",
      billingAddress: "Adresa za racun",
      onsite: "Kontakt na licu mesta",
      keyPickup: "Preuzimanje kljuca",
      notes: "Napomene",
      oldPhotographer: "Prethodni fotograf",
      newPhotographer: "Novi fotograf",
      change: "Promena termina"
    },
    labels: {
      dateTime: "Datum i vreme",
      orderNo: "Br. naloga",
      name: "Ime",
      firstName: "Ime",
      reference: "Referenca",
      company: "Firma",
      email: "E-posta",
      phone: "Telefon",
      mobile: "Mobile",
      whatsapp: "WhatsApp",
      street: "Ulica",
      zipCity: "Postanski broj / Grad",
      address: "Adresa",
      objectType: "Tip nekretnine",
      area: "Povrsina",
      rooms: "Sobe",
      floors: "Spratovi/Nivo",
      floor: "Sprat",
      info: "Info"
    },
    pricing: { subtotal: "Medjuzbir", discount: "Popust", vat: "PDV (8.1%)", total: "UKUPNO" },
    customerBooking: {
      heading: (no) => `Potvrda rezervacije${no ? " #" + no : ""}`,
      subject: (no) => `Propus \u2013 Potvrda rezervacije${no ? " #" + no : ""}`,
      intro: "Hvala vam na rezervaciji kod Propus-a. Radujemo se sto cemo profesionalno predstaviti vasu nekretninu. U nastavku su svi detalji vaseg naloga.",
      confirmedBadge: "\u2713 Potvrdjeno",
      routeBtn: "\ud83d\udccd Otvori rutu",
      calendarBtn: "\ud83d\udcc5 Kalendar (.ics)",
      portalBtn: "Otvori moj nalog",
      servicesTitle: "\ud83d\udce6 Usluge",
      priceTitle: "\ud83d\udcb0 Cena",
      notesTitle: "\ud83d\udcdd Napomene",
      infoTitle: "\ud83c\udfaf Vazne informacije",
      infoText: "Molimo vas da obezbedite da prostorije budu dostupne i sredjene u dogovoreno vreme. Ako imate pitanja, kontaktirajte nas na",
      footer: "Rado vam pomazemo ako imate pitanja"
    },
    officeBooking: {
      heading: (no) => `Nova porudzbina${no ? " #" + no : ""}`,
      subject: (no) => `Nova porudzbina${no ? " #" + no : ""}`,
      intro: "Primljena je nova rezervacija.",
      footer: "Propus alat za rezervacije"
    },
    cancellationOffice: {
      heading: (no) => `Nalog #${no} \u2013 Otkazan`,
      subject: (no) => `Nalog #${no} otkazan`,
      intro: "Sledeci nalog je otkazan.",
      footer: "Propus alat za rezervacije"
    },
    cancellationCustomer: {
      heading: (no) => `Vasa rezervacija #${no} je otkazana`,
      subject: (no) => `Propus \u2013 Rezervacija #${no} otkazana`,
      intro: "Zao nam je sto moramo da vas obavestimo da je vasa rezervacija otkazana. Ako imate pitanja, stojimo vam na raspolaganju.",
      badge: "\u2717 Otkazano",
      cancelledAppointment: "\ud83d\udcc5 Otkazani termin",
      photographerTitle: "\ud83d\udcf8 Vas fotograf",
      rebookTitle: "\ud83d\udca1 Zelite li novi termin?",
      rebookText: "Kontaktirajte nas za novo zakazivanje na",
      footer: "Zao nam je zbog neprijatnosti"
    },
    rescheduleOffice: {
      heading: (no) => `Nalog #${no} \u2013 Termin pomeren`,
      subject: (no) => `Nalog #${no} \u2013 Termin pomeren`,
      intro: "Termin za sledeci nalog je izmenjen.",
      oldDate: "Stari termin",
      newDate: "Novi termin",
      footer: "Propus alat za rezervacije"
    },
    rescheduleCustomer: {
      heading: (no) => `Vasa rezervacija #${no} \u2013 Novi termin`,
      subject: (no) => `Propus \u2013 Rezervacija #${no} pomerena`,
      intro: "Vas termin je pomeren. U nastavku su azurirani detalji.",
      badge: "\u21bb Pomerena",
      changeTitle: "\ud83d\udd04 Promena termina",
      oldDate: "Stari termin",
      newDate: "Novi termin",
      photographerTitle: "Vas fotograf",
      footer: "Pitanja?"
    },
    reassignOffice: {
      heading: (no) => `Nalog #${no} \u2013 Fotograf promenjen`,
      subject: (no) => `Nalog #${no} \u2013 Novi fotograf`,
      intro: "Fotograf za sledeci nalog je promenjen.",
      footer: "Propus alat za rezervacije"
    },
    reassignCustomer: {
      heading: (no) => `Vasa rezervacija #${no} \u2013 Novi fotograf`,
      subject: (no) => `Propus \u2013 Rezervacija #${no} novi fotograf`,
      intro: (name) => `Vas fotograf je promenjen. Vas novi fotograf je <strong>${name || "\u2014"}</strong>.`,
      newPhotographerTitle: "Novi fotograf",
      footer: "Pitanja?"
    }
  }
};

function getMailT(lang = "de") {
  return MAIL_I18N[normalizeLang(lang)] || MAIL_I18N.de;
}

function fmtDate(date, time, lang = "de"){
  const [y, m, d] = String(date || "").split("-");
  const safeDate = (d && m && y) ? `${d}.${m}.${y}` : String(date || "");
  const suffix = normalizeLang(lang) === "de" ? " Uhr" : "";
  return `${safeDate}, ${time}${suffix}`;
}

function fmtSvcLines(text, withBullets){
  const lines = String(text || "")
    .split("\n").map(l => l.trim()).filter(Boolean);
  if (!lines.length) return "\u2014";
  return withBullets
    ? lines.map(l => `\u2022 ${l}`).join("<br>")
    : lines.join("<br>");
}

function buildPricingSummary(pricing, lang = "de"){
  if (!pricing) return null;
  const t = getMailT(lang);
  const n = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const sub  = n(pricing.subtotal);
  const disc = n(pricing.discountAmount);
  let vat    = n(pricing.vat);
  let total  = n(pricing.total);
  if (!vat)   vat   = Math.round((Math.max(0, sub - disc) * 0.081) * 20) / 20;
  if (!total) total = Math.round((Math.max(0, sub - disc) + vat)  * 20) / 20;
  const tdL = 'style="padding:5px 0;font-size:13px;color:#6b7280"';
  const tdR = 'style="padding:5px 0;font-size:13px;color:#1f2937;text-align:right;font-weight:600"';
  const rows = [
    `<tr><td ${tdL}>${t.pricing.subtotal}</td><td ${tdR}>CHF ${sub.toFixed(2)}</td></tr>`,
    disc > 0 ? `<tr><td ${tdL}>${t.pricing.discount}</td><td style="padding:5px 0;font-size:13px;color:#059669;text-align:right;font-weight:600">−CHF ${disc.toFixed(2)}</td></tr>` : null,
    `<tr><td ${tdL}>${t.pricing.vat}</td><td ${tdR}>CHF ${vat.toFixed(2)}</td></tr>`,
    `<tr><td colspan="2" style="padding:2px 0"><div style="border-top:2px solid #e5e7eb"></div></td></tr>`,
    `<tr><td style="padding:6px 0 4px;font-size:15px;font-weight:800;color:#1f2937">${t.pricing.total}</td><td style="padding:6px 0 4px;font-size:15px;font-weight:800;color:#7A5E10;text-align:right">CHF ${total.toFixed(2)}</td></tr>`,
  ].filter(Boolean);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join("")}</table>`;
}

// ─── HTML-Basis ──────────────────────────────────────────────────────────────

function tr(label, value){
  if (!value && value !== 0) return "";
  const v = String(value).trim();
  if (!v || v === "\u2014") return "";
  return `<tr>
    <td style="padding:8px 16px 8px 0;color:#6b7280;font-size:13px;vertical-align:top;width:140px;white-space:nowrap;font-weight:600">${label}</td>
    <td style="padding:8px 0;font-size:14px;color:#1f2937;vertical-align:top;line-height:1.5">${v}</td>
  </tr>`;
}

function sec(title, rows){
  const inner = rows.filter(Boolean).join("");
  if (!inner.trim()) return "";
  return `<div style="margin:0 0 28px">
    <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#7A5E10;margin-bottom:12px;padding-bottom:6px;border-bottom:2px solid #f0ead8;display:flex;align-items:center">
      <span style="display:inline-block;width:4px;height:16px;background:#c5a059;margin-right:10px;border-radius:2px"></span>
      ${title}
    </div>
    <table style="border-collapse:collapse;width:100%" role="presentation"><tbody>${inner}</tbody></table>
  </div>`;
}

function buildMailHtml({ heading, intro, sections, footer, lang = "de" }){
  const htmlLang = normalizeLang(lang);
  const body = (sections || []).filter(Boolean).map(s => {
    if (typeof s === "string") return s;
    return sec(s.title, s.rows || []);
  }).join("");

  return `<!DOCTYPE html>
<html lang="${htmlLang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light">
</head>
<body bgcolor="#f4f1e8" style="margin:0;padding:0;background:#f4f1e8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif,'Apple Color Emoji'">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" bgcolor="#f4f1e8" style="background:#f4f1e8">
<tr><td align="center" style="padding:40px 20px">
  <table width="600" cellpadding="0" cellspacing="0" role="presentation" bgcolor="#ffffff" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
    <!-- Header with Premium Gradient (Outlook faellt auf bgcolor zurueck).
         WCAG AA: weisser Text auf #7A5E10 = 5.90:1 (Body).
         Frueherer Gradient-Endpunkt #c5a059 hatte nur 2.46:1. -->
    <tr><td bgcolor="#7A5E10" style="background:#7A5E10;background:linear-gradient(135deg,#5e470d 0%,#7A5E10 50%,#9e8649 100%);padding:32px 40px">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td>
            <div style="font-size:28px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;text-shadow:0 2px 8px rgba(0,0,0,0.15)">PROPUS</div>
            <div style="font-size:11px;color:#ffffff;margin-top:4px;letter-spacing:1.2px;text-transform:uppercase;font-weight:600">Swiss Real Estate Photography</div>
          </td>
        </tr>
      </table>
    </td></tr>
    <!-- Main Content -->
    <tr><td bgcolor="#ffffff" style="padding:40px 40px 32px">
      <h1 style="margin:0 0 12px;font-size:24px;font-weight:800;color:#1f2937;line-height:1.3;letter-spacing:-0.3px">${heading}</h1>
      ${intro ? `<p style="margin:0 0 32px;font-size:15px;color:#6b7280;line-height:1.65">${intro}</p>` : ""}
      <div style="border-top:2px solid #f0ead8;padding-top:28px">${body}</div>
    </td></tr>
    <!-- Footer -->
    <tr><td bgcolor="#fafaf9" style="background:#fafaf9;border-top:1px solid #e7e5e4;padding:24px 40px">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr><td align="center">
          <p style="margin:0 0 8px;font-size:13px;color:#6b7280;line-height:1.6">
            ${footer ? footer + " <span style='color:#6b7280'>&middot;</span> " : ""}
            &copy; 2026 Propus GmbH
          </p>
          <p style="margin:0;font-size:12px;color:#6b7280">
            <a href="https://propus.ch" style="color:#7a6520;text-decoration:none;font-weight:600">propus.ch</a>
            <span style='color:#6b7280;margin:0 8px'>&middot;</span>
            <a href="mailto:office@propus.ch" style="color:#7a6520;text-decoration:none;font-weight:600">office@propus.ch</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;
}

// ─── Helfer ───────────────────────────────────────────────────────────────────

function secPhotog(data, lang = "de"){
  const t = getMailT(lang);
  return sec(t.sections.photographer, [
    tr(t.labels.name, data.photographerName  || data.photographerKey),
    tr(t.labels.email, data.photographerEmail),
    tr(t.labels.phone, data.photographerPhone),
    tr(t.labels.mobile || "Mobile", data.photographerMobile),
    tr(t.labels.whatsapp || "WhatsApp", data.photographerWhatsApp)
  ]);
}

function secOnsite(billing, lang = "de", onsiteContacts) {
  const contacts = Array.isArray(onsiteContacts) && onsiteContacts.length
    ? onsiteContacts
    : billing?.onsiteName || billing?.onsitePhone || billing?.onsiteEmail
      ? [
          {
            name: billing?.onsiteName,
            phone: billing?.onsitePhone,
            email: billing?.onsiteEmail,
          },
        ]
      : [];
  const filtered = contacts.filter((c) => c && (c.name || c.phone || c.email));
  if (!filtered.length) return null;
  const t = getMailT(lang);
  return sec(
    t.sections.onsite,
    filtered.flatMap((c) => [
      tr(t.labels.name, c.name),
      tr(t.labels.phone, c.phone),
      tr(t.labels.email, c.email),
    ])
  );
}

function secKeyPickup(keyPickup, lang = "de"){
  if (!keyPickup) return null;
  const hasContent = !!(keyPickup.address || keyPickup.info || keyPickup.notes);
  if (!keyPickup.enabled && !hasContent) return null;
  const t = getMailT(lang);
  return sec(t.sections.keyPickup, [
    tr(t.labels.address, keyPickup.address),
    tr(t.labels.info, keyPickup.info || keyPickup.notes)
  ]);
}

function secAddress(data, lang = "de"){
  const t = getMailT(lang);
  // objectInfo is a multi-line legacy string — extract fields when structured data absent
  const info  = String(data.objectInfo || "");
  const hasValue = (value) => value !== undefined && value !== null && String(value).trim() !== "";
  const addr  = hasValue(data.address) ? String(data.address) : (info.match(/Adresse:\s*(.+)/)?.[1] || info.split("\n")[0] || "\u2014");
  const typeRaw  = hasValue(data.objectType) ? String(data.objectType) : (info.match(/Objektart:\s*(.+)/)?.[1] || info.match(/Typ:\s*(.+)/)?.[1] || info.match(/Type:\s*(.+)/)?.[1] || "");
  const type  = objType(typeRaw, lang);
  const area  = hasValue(data.objectArea) ? `${data.objectArea} m\u00b2` : (info.match(/Wohn-\/Nutz(?:fl(?:a|ä)eche|flaeche):\s*(.+)/)?.[1] || info.match(/Fl\u00e4che:\s*(.+)/)?.[1] || info.match(/Area:\s*(.+)/)?.[1] || "");
  const rooms = hasValue(data.objectRooms) ? `${data.objectRooms}` : (info.match(/Zimmer:\s*(.+)/)?.[1] || info.match(/Rooms:\s*(.+)/)?.[1] || "");
  const floors= hasValue(data.objectFloors) ? `${data.objectFloors}` : (info.match(/Etagen\/Ebene:\s*(.+)/)?.[1] || info.match(/Etagen:\s*(.+)/)?.[1] || info.match(/Floors(?:\/Level)?:\s*(.+)/)?.[1] || "");
  return sec(t.sections.address, [
    tr(t.labels.address, addr),
    tr(t.labels.objectType, type),
    tr(t.labels.area, area),
    tr(t.labels.rooms, rooms),
    tr(t.labels.floors, floors)
  ]);
}

function pricingBlock(data, lang = "de"){
  const built = buildPricingSummary(data.pricing, lang);
  return built || data.pricingSummary || null;
}

function out(subject, html){
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&middot;/g, " \u00b7 ")
    .replace(/&copy;/g, "\u00a9")
    .replace(/&#[0-9]+;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { subject, html, text };
}

// ─── Buchungsbestätigung Kunde ────────────────────────────────────────────────

function buildCustomerEmail(data, lang = "de"){
  const t = getMailT(lang);
  const langKey = normalizeLang(lang);
  const isProvisional = !!data.isProvisional;
  const isConfirmationPending = !!data.confirmationPending;
  const confirmationPendingCopy = {
    de: {
      heading: (no) => `Buchungseingang${no ? " #" + no : ""}`,
      subject: (no) => `Propus \u2013 Buchungseingang${no ? " #" + no : ""}`,
      intro: "Vielen Dank fuer Ihre Buchung bei Propus. Bitte bestaetigen Sie den Termin ueber den Link in der separaten Mail.",
      badge: "Bestätigung ausstehend",
      badgeColor: "linear-gradient(135deg,#f59e0b,#d97706)",
    },
    en: {
      heading: (no) => `Booking Received${no ? " #" + no : ""}`,
      subject: (no) => `Propus \u2013 Booking Received${no ? " #" + no : ""}`,
      intro: "Thank you for your booking with Propus. Please confirm your appointment via the link in the separate email.",
      badge: "Confirmation pending",
      badgeColor: "linear-gradient(135deg,#f59e0b,#d97706)",
    },
    fr: {
      heading: (no) => `Demande de reservation${no ? " #" + no : ""}`,
      subject: (no) => `Propus \u2013 Demande de reservation${no ? " #" + no : ""}`,
      intro: "Merci pour votre reservation chez Propus. Veuillez confirmer votre rendez-vous via le lien dans l'e-mail separe.",
      badge: "Confirmation en attente",
      badgeColor: "linear-gradient(135deg,#f59e0b,#d97706)",
    },
    it: {
      heading: (no) => `Prenotazione ricevuta${no ? " #" + no : ""}`,
      subject: (no) => `Propus \u2013 Prenotazione ricevuta${no ? " #" + no : ""}`,
      intro: "Grazie per la sua prenotazione con Propus. Confermi l'appuntamento tramite il link nell'e-mail separata.",
      badge: "Conferma in attesa",
      badgeColor: "linear-gradient(135deg,#f59e0b,#d97706)",
    },
  }[langKey] || {
    heading: (no) => `Buchungseingang${no ? " #" + no : ""}`,
    subject: (no) => `Propus \u2013 Buchungseingang${no ? " #" + no : ""}`,
    intro: "Vielen Dank fuer Ihre Buchung bei Propus. Bitte bestaetigen Sie den Termin ueber den Link in der separaten Mail.",
    badge: "Bestätigung ausstehend",
    badgeColor: "linear-gradient(135deg,#f59e0b,#d97706)",
  };
  const provisionalCustomerCopy = {
    de: {
      heading: (no) => `Provisorische Buchung${no ? " #" + no : ""}`,
      subject: (no) => `Propus - Provisorische Buchung${no ? " #" + no : ""}`,
      intro: "Vielen Dank fuer Ihre Buchung bei Propus. Ihr Termin wurde provisorisch reserviert. Nachfolgend finden Sie die Details der vorlaeufigen Reservierung.",
      badge: "Provisorisch reserviert",
    },
    en: {
      heading: (no) => `Provisional Booking${no ? " #" + no : ""}`,
      subject: (no) => `Propus - Provisional Booking${no ? " #" + no : ""}`,
      intro: "Thank you for your booking with Propus. Your appointment has been reserved provisionally. Below you will find the details of the temporary reservation.",
      badge: "Provisionally reserved",
    },
    fr: {
      heading: (no) => `Reservation provisoire${no ? " #" + no : ""}`,
      subject: (no) => `Propus - Reservation provisoire${no ? " #" + no : ""}`,
      intro: "Merci pour votre reservation chez Propus. Votre rendez-vous a ete reserve a titre provisoire. Vous trouverez ci-dessous les details de cette reservation temporaire.",
      badge: "Reserve provisoirement",
    },
    it: {
      heading: (no) => `Prenotazione provvisoria${no ? " #" + no : ""}`,
      subject: (no) => `Propus - Prenotazione provvisoria${no ? " #" + no : ""}`,
      intro: "Grazie per la sua prenotazione con Propus. Il suo appuntamento e stato riservato in modo provvisorio. Di seguito trova i dettagli della prenotazione temporanea.",
      badge: "Riservato provvisoriamente",
    },
  }[langKey] || {
    heading: (no) => `Provisorische Buchung${no ? " #" + no : ""}`,
    subject: (no) => `Propus - Provisorische Buchung${no ? " #" + no : ""}`,
    intro: "Vielen Dank fuer Ihre Buchung bei Propus. Ihr Termin wurde provisorisch reserviert. Nachfolgend finden Sie die Details der vorlaeufigen Reservierung.",
    badge: "Provisorisch reserviert",
  };
  const price = pricingBlock(data, lang);
  const activeCopy = isConfirmationPending ? confirmationPendingCopy : (isProvisional ? provisionalCustomerCopy : null);
  const confirmationBadgeLabel = activeCopy ? activeCopy.badge : t.customerBooking.confirmedBadge;
  const badgeBg = activeCopy?.badgeColor || "linear-gradient(135deg,#10b981,#059669)";
  const confirmationBadge = `<div style="display:inline-block;background:${badgeBg};color:#fff;padding:6px 14px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:0.5px;margin-bottom:24px;text-transform:uppercase">${confirmationBadgeLabel}</div>`;

  const addressStr = data.billing?.street
    ? [data.billing.street, data.billing.zipcity].filter(Boolean).join(", ")
    : (data.address || "");
  const mapsUrl = addressStr ? `https://maps.google.com/?q=${encodeURIComponent(addressStr)}` : null;
  const icsUrl  = data.icsUrl || null;
  const portalMagicLink = data.portalMagicLink || null;

  const ctaButtons = [
    mapsUrl ? `<a href="${mapsUrl}" style="display:inline-block;background:#7A5E10;color:#fff;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;margin-right:8px">${t.customerBooking.routeBtn}</a>` : null,
    icsUrl  ? `<a href="${icsUrl}"  style="display:inline-block;background:#f3f4f6;color:#374151;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;border:1px solid #d1d5db;margin-right:8px">${t.customerBooking.calendarBtn}</a>` : null,
    portalMagicLink ? `<a href="${portalMagicLink}" style="display:inline-block;background:#111827;color:#ffffff;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px">${t.customerBooking.portalBtn}</a>` : null,
  ].filter(Boolean);

  const keyBlock = `<div style="background:#f9f7f2;border-left:4px solid #c5a059;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:8px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="padding:4px 12px 4px 0;width:110px;font-size:11px;font-weight:700;color:#7A5E10;text-transform:uppercase;letter-spacing:0.5px;vertical-align:top">${t.sections.appointment}</td>
      <td style="padding:4px 0;font-size:14px;font-weight:700;color:#1f2937">${fmtDate(data.date, data.time, lang)}</td>
    </tr>
    ${addressStr ? `<tr><td style="padding:4px 12px 4px 0;font-size:11px;font-weight:700;color:#7A5E10;text-transform:uppercase;letter-spacing:0.5px;vertical-align:top">${t.labels.address}</td><td style="padding:4px 0;font-size:13px;color:#374151">${addressStr}</td></tr>` : ""}
    ${data.orderNo ? `<tr><td style="padding:4px 12px 4px 0;font-size:11px;font-weight:700;color:#7A5E10;text-transform:uppercase;letter-spacing:0.5px">${t.labels.orderNo}</td><td style="padding:4px 0;font-size:13px;font-family:monospace;font-weight:700;color:#374151">#${data.orderNo}</td></tr>` : ""}
    ${data.billing?.order_ref ? `<tr><td style="padding:4px 12px 4px 0;font-size:11px;font-weight:700;color:#7A5E10;text-transform:uppercase;letter-spacing:0.5px">Bestellreferenz</td><td style="padding:4px 0;font-size:13px;color:#374151">${data.billing.order_ref}</td></tr>` : ""}
  </table>
</div>`;

  const emailHeading = activeCopy ? activeCopy.heading(data.orderNo) : t.customerBooking.heading(data.orderNo);
  const emailIntro = activeCopy ? activeCopy.intro : t.customerBooking.intro;
  const html = buildMailHtml({
    lang,
    heading: emailHeading,
    intro:   confirmationBadge + `<p style="margin:16px 0 0;font-size:15px;color:#6b7280;line-height:1.65">${emailIntro}</p>`,
    sections: [
      keyBlock,
      ctaButtons.length ? `<div style="margin:20px 0">${ctaButtons.join("")}</div>` : null,
      secAddress(data, lang),
      sec(t.customerBooking.servicesTitle, [
        tr("", fmtSvcLines(data.serviceListWithPrice, true))
      ]),
      price ? sec(t.customerBooking.priceTitle, [ tr("", `<div style="background:#fefce8;border:1px solid #fef08a;border-radius:8px;padding:12px 16px">${price}</div>`) ]) : null,
      secPhotog(data, lang),
      secOnsite(data.billing, lang, data.onsiteContacts),
      data.billing?.notes ? sec(t.customerBooking.notesTitle, [ tr("", `<div style="background:#f3f4f6;border-left:4px solid #9e8649;padding:12px 16px;border-radius:4px;font-style:italic;color:#4b5563">${data.billing.notes}</div>`) ]) : null,
      secKeyPickup(data.keyPickup, lang),
      `<div style="margin-top:32px;padding:20px;background:linear-gradient(135deg,#fef3c7,#fde68a);border-radius:12px;border:1px solid #fbbf24">
        <p style="margin:0 0 12px;font-size:14px;color:#92400e;font-weight:700">${t.customerBooking.infoTitle}</p>
        <p style="margin:0;font-size:13px;color:#78350f;line-height:1.6">${t.customerBooking.infoText} <a href="mailto:office@propus.ch" style="color:#7A5E10;font-weight:700">office@propus.ch</a>.</p>
      </div>`
    ],
    footer: t.customerBooking.footer
  });
  const emailSubject = activeCopy ? activeCopy.subject(data.orderNo) : t.customerBooking.subject(data.orderNo);
  return out(emailSubject, html);
}

// ─── Buchungsbestätigung Fotograf ─────────────────────────────────────────────

function buildPhotographerEmail(data, lang){
  const t = getT(lang);
  const heading = t.newOrder(data.orderNo);
  let html = buildMailHtml({
    heading,
    intro: t.newOrderIntro,
    sections: [
      sec(t.appointment, [
        tr(t.dateTime, fmtDate(data.date, data.time)),
        data.orderNo ? tr(t.orderNo, `#${data.orderNo}`) : ""
      ]),
      secAddress(data),
      sec(t.services, [
        tr("", fmtSvcLines(data.serviceListNoPrice || data.serviceListWithPrice, true))
      ]),
      sec(t.client, [
        tr(t.name,    data.billing?.name),
        tr(t.email,   data.billing?.email),
        tr(t.phone,   data.billing?.phone),
        tr("Bestellreferenz", data.billing?.order_ref)
      ]),
      secOnsite(data.billing, lang, data.onsiteContacts),
      data.billing?.notes ? sec(t.notes, [ tr("", data.billing.notes) ]) : null,
      secKeyPickup(data.keyPickup)
    ],
    footer: data.orderNo ? t.footer(data.orderNo) : ""
  });

  if (data.orderNo) {
    const baseUrl = process.env.FRONTEND_URL || "https://admin-booking.propus.ch";
    const link = `${baseUrl}/admin.html?order=${data.orderNo}`;
    const btnLabel = t.openBooking || "Buchung öffnen";
    // Fügen wir den Link vor dem Footer ein
    html = html.replace('<!-- FOOTER_PLACEHOLDER -->', `
      <div style="margin-top:20px;margin-bottom:10px;">
        <a href="${link}" style="display:inline-block;background:#7A5E10;color:#fff;padding:12px 26px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">
          ${btnLabel}
        </a>
      </div>
      <!-- FOOTER_PLACEHOLDER -->
    `);
  }

  return out(`Propus \u2013 ${heading}`, html);
}

// ─── Buchungsbestätigung Büro ─────────────────────────────────────────────────

function buildOfficeEmail(data, lang = "de"){
  const t = getMailT(lang);
  const isProvisional = !!data.isProvisional;
  const price = pricingBlock(data, lang);
  const officeHeading = isProvisional ? `Neue provisorische Bestellung${data.orderNo ? " #" + data.orderNo : ""}` : t.officeBooking.heading(data.orderNo);
  const officeSubject = isProvisional ? `Neue provisorische Bestellung${data.orderNo ? " #" + data.orderNo : ""}` : t.officeBooking.subject(data.orderNo);
  const officeIntro = isProvisional ? "Eine neue Buchung ist eingegangen und der Termin wurde provisorisch reserviert." : t.officeBooking.intro;
  const html = buildMailHtml({
    lang,
    heading: officeHeading,
    intro: officeIntro,
    sections: [
      sec(t.sections.appointment, [
        tr(t.labels.dateTime, fmtDate(data.date, data.time, lang)),
        data.orderNo ? tr(t.labels.orderNo, `#${data.orderNo}`) : ""
      ]),
      secAddress(data, lang),
      sec(t.sections.services, [
        tr("", fmtSvcLines(data.serviceListWithPrice || data.serviceListNoPrice, true))
      ]),
      price ? sec(t.sections.price, [ tr("", price) ]) : null,
      secPhotog(data, lang),
      sec(t.sections.customerData, [
        tr(t.labels.name, data.billing?.name),
        tr(t.labels.company, data.billing?.company),
        tr(t.labels.email, data.billing?.email),
        tr(t.labels.phone, data.billing?.phone),
        tr("Firma E-Mail", data.billing?.company_email),
        tr("Firma Telefon", data.billing?.company_phone),
        tr("Bestellreferenz", data.billing?.order_ref)
      ]),
      sec(t.sections.billingAddress, [
        tr(t.labels.street, data.billing?.street),
        tr(t.labels.zipCity, data.billing?.zipcity || [data.billing?.zip, data.billing?.city].filter(Boolean).join(" "))
      ]),
      (data.billing?.alt_company || data.billing?.alt_first_name || data.billing?.alt_name || data.billing?.alt_street || data.billing?.alt_zipcity || data.billing?.alt_email || data.billing?.alt_order_ref || data.billing?.alt_notes)
        ? sec("Abweichende Rechnungsadresse", [
            tr(t.labels.company, data.billing?.alt_company),
            tr(t.labels.firstName, data.billing?.alt_first_name),
            tr(t.labels.name, data.billing?.alt_name),
            tr("Firma E-Mail", data.billing?.alt_company_email),
            tr("Firma Telefon", data.billing?.alt_company_phone),
            tr(t.labels.email, data.billing?.alt_email),
            tr(t.labels.phone, data.billing?.alt_phone || data.billing?.alt_phone_mobile),
            tr(t.labels.street, data.billing?.alt_street),
            tr(t.labels.zipCity, data.billing?.alt_zipcity || [data.billing?.alt_zip, data.billing?.alt_city].filter(Boolean).join(" ")),
            tr(t.labels.reference, data.billing?.alt_order_ref),
            tr(t.labels.notes, data.billing?.alt_notes),
          ])
        : null,
      secOnsite(data.billing, lang, data.onsiteContacts),
      data.billing?.notes ? sec(t.sections.notes, [ tr("", data.billing.notes) ]) : null,
      secKeyPickup(data.keyPickup, lang)
    ],
    footer: t.officeBooking.footer
  });
  return out(officeSubject, html);
}

// ─── Absage – Büro ────────────────────────────────────────────────────────────

function buildCancellationOfficeEmail(order, photogPhone, lang = "de"){
  const t = getMailT(lang);
  const html = buildMailHtml({
    lang,
    heading: t.cancellationOffice.heading(order.orderNo),
    intro: t.cancellationOffice.intro,
    sections: [
      sec(t.sections.appointment, [
        tr(t.labels.dateTime, fmtDate(order.schedule?.date, order.schedule?.time, lang)),
        tr(t.labels.orderNo, `#${order.orderNo}`)
      ]),
      sec(t.sections.address, [
        tr(t.labels.address, order.address),
        tr(t.labels.objectType, objType(order.object?.type, lang)),
        tr(t.labels.area, order.object?.area ? `${order.object.area} m\u00b2` : "")
      ]),
      sec(t.sections.photographer, [
        tr(t.labels.name, order.photographer?.name),
        tr(t.labels.email, order.photographer?.email),
        tr(t.labels.phone, photogPhone || order.photographer?.phone)
      ]),
      sec(t.sections.customer, [
        tr(t.labels.name, order.billing?.name),
        tr(t.labels.email, order.billing?.email),
        tr(t.labels.phone, order.billing?.phone)
      ])
    ],
    footer: t.cancellationOffice.footer
  });
  return out(t.cancellationOffice.subject(order.orderNo), html);
}

// ─── Absage – Fotograf ────────────────────────────────────────────────────────

function buildCancellationPhotographerEmail(order, lang){
  const t = getT(lang);
  const heading = t.cancelled(order.orderNo);
  const html = buildMailHtml({
    heading,
    intro: t.cancelledIntro,
    sections: [
      sec(t.appointment, [
        tr(t.dateTime,  fmtDate(order.schedule?.date, order.schedule?.time)),
        tr(t.orderNo,   `#${order.orderNo}`)
      ]),
      sec(t.address, [
        tr("Adresse",    order.address),
        tr("Objektart",  objType(order.object?.type)),
        tr(t.area,       order.object?.area ? `${order.object.area} m\u00b2` : "")
      ]),
      sec(t.client, [
        tr(t.name,   order.billing?.name),
        tr(t.phone,  order.billing?.phone)
      ])
    ],
    footer: t.footer(order.orderNo)
  });
  return out(`Propus \u2013 ${heading}`, html);
}

// ─── Absage – Kunde ───────────────────────────────────────────────────────────

function buildCancellationCustomerEmail(order, photogPhone, lang = "de"){
  const t = getMailT(lang);
  const cancellationBadge = `<div style="display:inline-block;background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;padding:6px 14px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:0.5px;margin-bottom:24px;text-transform:uppercase">${t.cancellationCustomer.badge}</div>`;
  
  const html = buildMailHtml({
    lang,
    heading: t.cancellationCustomer.heading(order.orderNo),
    intro:   cancellationBadge + `<p style="margin:16px 0 0;font-size:15px;color:#6b7280;line-height:1.65">${t.cancellationCustomer.intro}</p>`,
    sections: [
      sec(t.cancellationCustomer.cancelledAppointment, [
        tr(t.labels.dateTime, `<span style="text-decoration:line-through;color:#6b7280">${fmtDate(order.schedule?.date, order.schedule?.time, lang)}</span>`),
        tr(t.labels.orderNo,  `<span style="font-family:monospace;color:#6b7280;background:#f3f4f6;padding:2px 8px;border-radius:4px;font-size:13px">#${order.orderNo}</span>`)
      ]),
      sec(`🏢 ${t.sections.address}`, [
        tr(t.labels.address, order.address),
        tr(t.labels.objectType, objType(order.object?.type, lang))
      ]),
      sec(t.cancellationCustomer.photographerTitle, [
        tr(t.labels.name, order.photographer?.name),
        tr(t.labels.email, order.photographer?.email ? `<a href="mailto:${order.photographer.email}" style="color:#7A5E10;text-decoration:none">${order.photographer.email}</a>` : ""),
        tr(t.labels.phone, photogPhone || order.photographer?.phone)
      ]),
      `<div style="margin-top:32px;padding:20px;background:#f0f9ff;border-radius:12px;border:1px solid #bfdbfe">
        <p style="margin:0 0 12px;font-size:14px;color:#1e40af;font-weight:700">${t.cancellationCustomer.rebookTitle}</p>
        <p style="margin:0;font-size:13px;color:#1e3a8a;line-height:1.6">${t.cancellationCustomer.rebookText} <a href="mailto:office@propus.ch" style="color:#7A5E10;font-weight:700">office@propus.ch</a>. <a href="https://propus.ch" style="color:#7A5E10;font-weight:700">propus.ch</a>.</p>
      </div>`
    ],
    footer: t.cancellationCustomer.footer
  });
  return out(t.cancellationCustomer.subject(order.orderNo), html);
}

// ─── Verschiebung – Büro ──────────────────────────────────────────────────────

function buildRescheduleOfficeEmail(order, oldDate, oldTime, newDate, newTime, photogPhone, lang = "de"){
  const t = getMailT(lang);
  const html = buildMailHtml({
    lang,
    heading: t.rescheduleOffice.heading(order.orderNo),
    intro: t.rescheduleOffice.intro,
    sections: [
      sec(t.sections.change, [
        tr(t.rescheduleOffice.oldDate, fmtDate(oldDate, oldTime, lang)),
        tr(t.rescheduleOffice.newDate, `<strong style="color:#7A5E10">${fmtDate(newDate, newTime, lang)}</strong>`),
        tr(t.labels.orderNo,  `#${order.orderNo}`)
      ]),
      sec(t.sections.address, [
        tr(t.labels.address, order.address),
        tr(t.labels.objectType, objType(order.object?.type, lang)),
        tr(t.labels.area, order.object?.area ? `${order.object.area} m\u00b2` : "")
      ]),
      sec(t.sections.photographer, [
        tr(t.labels.name, order.photographer?.name),
        tr(t.labels.email, order.photographer?.email),
        tr(t.labels.phone, photogPhone || order.photographer?.phone)
      ]),
      sec(t.sections.customer, [
        tr(t.labels.name, order.billing?.name),
        tr(t.labels.email, order.billing?.email),
        tr(t.labels.phone, order.billing?.phone)
      ])
    ],
    footer: t.rescheduleOffice.footer
  });
  return out(t.rescheduleOffice.subject(order.orderNo), html);
}

// ─── Verschiebung – Fotograf ──────────────────────────────────────────────────

function buildReschedulePhotographerEmail(order, oldDate, oldTime, newDate, newTime, lang){
  const t = getT(lang);
  const heading = t.rescheduled(order.orderNo);
  const html = buildMailHtml({
    heading,
    intro: t.rescheduledIntro,
    sections: [
      sec(t.change, [
        tr(t.oldDate, fmtDate(oldDate, oldTime)),
        tr(t.newDate, `<strong style="color:#7A5E10">${fmtDate(newDate, newTime)}</strong>`)
      ]),
      sec(t.address, [
        tr("Adresse",    order.address),
        tr("Objektart",  objType(order.object?.type)),
        tr(t.area,       order.object?.area ? `${order.object.area} m\u00b2` : "")
      ]),
      sec(t.client, [
        tr(t.name,   order.billing?.name),
        tr(t.phone,  order.billing?.phone)
      ])
    ],
    footer: t.footer(order.orderNo)
  });
  return out(`Propus \u2013 ${heading}`, html);
}

// ─── Verschiebung – Kunde ─────────────────────────────────────────────────────

function buildRescheduleCustomerEmail(order, oldDate, oldTime, newDate, newTime, photogPhone, lang = "de"){
  const t = getMailT(lang);
  const rescheduleBadge = `<div style="display:inline-block;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;padding:6px 14px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:0.5px;margin-bottom:24px;text-transform:uppercase">${t.rescheduleCustomer.badge}</div>`;
  
  const html = buildMailHtml({
    lang,
    heading: t.rescheduleCustomer.heading(order.orderNo),
    intro:   rescheduleBadge + `<p style="margin:16px 0 0;font-size:15px;color:#6b7280;line-height:1.65">${t.rescheduleCustomer.intro}</p>`,
    sections: [
      sec(t.rescheduleCustomer.changeTitle, [
        tr(t.rescheduleCustomer.oldDate, `<span style="text-decoration:line-through;color:#6b7280">${fmtDate(oldDate, oldTime, lang)}</span>`),
        tr(t.rescheduleCustomer.newDate, `<strong style="color:#7A5E10;font-size:15px;background:#fef3c7;padding:4px 10px;border-radius:6px;display:inline-block">${fmtDate(newDate, newTime, lang)}</strong>`),
        tr(t.labels.orderNo,  `<span style="font-family:monospace;color:#6b7280;background:#f3f4f6;padding:2px 8px;border-radius:4px;font-size:13px">#${order.orderNo}</span>`)
      ]),
      sec(t.rescheduleCustomer.photographerTitle, [
        tr(t.labels.name, order.photographer?.name),
        tr(t.labels.email, order.photographer?.email),
        tr(t.labels.phone, photogPhone || order.photographer?.phone)
      ]),
      sec(t.sections.address, [
        tr(t.labels.address, order.address),
        tr(t.labels.objectType, objType(order.object?.type, lang))
      ])
    ],
    footer: `${t.rescheduleCustomer.footer} <a href='mailto:office@propus.ch' style='color:#7A5E10'>office@propus.ch</a>`
  });
  return out(t.rescheduleCustomer.subject(order.orderNo), html);
}

// ─── Fotograf-Wechsel – Büro ──────────────────────────────────────────────────

function buildReassignOfficeEmail(order, oldPhotog, newPhotog, lang = "de"){
  const t = getMailT(lang);
  const html = buildMailHtml({
    lang,
    heading: t.reassignOffice.heading(order.orderNo),
    intro: t.reassignOffice.intro,
    sections: [
      sec(t.sections.appointment, [
        tr(t.labels.dateTime, fmtDate(order.schedule?.date, order.schedule?.time, lang)),
        tr(t.labels.orderNo,  `#${order.orderNo}`)
      ]),
      sec(t.sections.oldPhotographer, [
        tr(t.labels.name, oldPhotog.name),
        tr(t.labels.email, oldPhotog.email),
        tr(t.labels.phone, oldPhotog.phone)
      ]),
      sec(t.sections.newPhotographer, [
        tr(t.labels.name, newPhotog.name),
        tr(t.labels.email, newPhotog.email),
        tr(t.labels.phone, newPhotog.phone)
      ]),
      sec(t.sections.address, [
        tr(t.labels.address, order.address),
        tr(t.labels.objectType, objType(order.object?.type, lang))
      ]),
      sec(t.sections.customer, [
        tr(t.labels.name, order.billing?.name),
        tr(t.labels.email, order.billing?.email),
        tr(t.labels.phone, order.billing?.phone)
      ])
    ],
    footer: t.reassignOffice.footer
  });
  return out(t.reassignOffice.subject(order.orderNo), html);
}

// ─── Fotograf-Wechsel – Fotograf ──────────────────────────────────────────────

function buildReassignPhotographerEmail(order, role, otherPhotog, lang){
  const t = getT(lang);
  const isNew = role === "new";
  const otherName = otherPhotog?.name || "\u2014";
  const heading = isNew ? t.reassignTaken(order.orderNo, otherName) : t.reassignGiven(order.orderNo, otherName);
  const intro   = isNew ? t.reassignTakenIntro(order.orderNo, otherName) : t.reassignGivenIntro(order.orderNo, otherName);
  const html = buildMailHtml({
    heading,
    intro,
    sections: [
      sec(t.appointment, [
        tr(t.dateTime, fmtDate(order.schedule?.date, order.schedule?.time)),
        tr(t.orderNo,  `#${order.orderNo}`)
      ]),
      sec(t.address, [
        tr("Adresse",    order.address),
        tr("Objektart",  objType(order.object?.type)),
        tr(t.area,       order.object?.area ? `${order.object.area} m\u00b2` : "")
      ]),
      sec(t.client, [
        tr(t.name,   order.billing?.name),
        tr(t.phone,  order.billing?.phone)
      ])
    ],
    footer: t.footer(order.orderNo)
  });
  return out(heading, html);
}

// ─── Fotograf-Wechsel – Kunde ─────────────────────────────────────────────────

function buildReassignCustomerEmail(order, newPhotog, lang = "de"){
  const t = getMailT(lang);
  const html = buildMailHtml({
    lang,
    heading: t.reassignCustomer.heading(order.orderNo),
    intro: t.reassignCustomer.intro(newPhotog?.name),
    sections: [
      sec(t.reassignCustomer.newPhotographerTitle, [
        tr(t.labels.name, newPhotog?.name),
        tr(t.labels.email, newPhotog?.email),
        tr(t.labels.phone, newPhotog?.phone)
      ]),
      sec(t.sections.appointment, [
        tr(t.labels.dateTime, fmtDate(order.schedule?.date, order.schedule?.time, lang)),
        tr(t.labels.orderNo,  `#${order.orderNo}`)
      ]),
      sec(t.sections.address, [
        tr(t.labels.address, order.address),
        tr(t.labels.objectType, objType(order.object?.type, lang))
      ])
    ],
    footer: `${t.reassignCustomer.footer} <a href='mailto:office@propus.ch' style='color:#7A5E10'>office@propus.ch</a>`
  });
  return out(t.reassignCustomer.subject(order.orderNo), html);
}

// ─── Willkommens-Mail (Mitarbeiter) ──────────────────────────────────────────

function buildWelcomeEmail({ name, adminUrl }, lang) {
  const t = getW(lang);
  const html = buildMailHtml({
    heading: t.greeting(name || ""),
    intro: t.intro,
    sections: [
      `<div style="text-align:center;margin:32px 0">
        <a href="${adminUrl}" style="display:inline-block;background:#7A5E10;color:#fff;padding:16px 32px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px;box-shadow:0 4px 16px rgba(158,134,73,0.3);letter-spacing:0.3px">
          ${t.loginBtn}
        </a>
      </div>`,
      `<div style="background:#f9f7f2;border:1px solid #e8e3d6;border-radius:10px;padding:20px;margin:24px 0;text-align:center">
        <p style="font-size:14px;color:#555;margin:0;line-height:1.6">${t.teamNote}</p>
      </div>`,
    ],
    footer: t.footer,
  });
  return out(t.subject, html);
}

// ─── Zugangsdaten-Mail (Mitarbeiter) ─────────────────────────────────────────

function buildCredentialsEmail({ name, key, email, tempPw, adminUrl, resetUrl }, lang) {
  const t = getC(lang);
  const pwInfo = tempPw
    ? `<div style="background:#f0f9ff;border:1px solid #bfdbfe;border-radius:6px;padding:8px 12px;font-family:monospace;font-size:15px;font-weight:700;letter-spacing:1px;color:#1e40af">${tempPw}</div>`
    : `<em style="color:#888;font-size:13px">${t.pwAlreadySet}</em>`;
  const btnLabel = tempPw ? t.setPasswordBtn : t.resetPasswordBtn;
  const pwBtn = resetUrl
    ? `<div style="text-align:center;margin:28px 0">
        <a href="${resetUrl}" style="display:inline-block;background:#7A5E10;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;box-shadow:0 3px 12px rgba(158,134,73,0.25);letter-spacing:0.3px">
          ${btnLabel}
        </a>
      </div>`
    : null;
    
  const loginSection = `<div style="background:#f9f7f2;border:1px solid #e8e3d6;border-radius:12px;padding:20px;margin:24px 0">
    <h3 style="margin:0 0 16px 0;color:#7A5E10;font-size:16px;font-weight:700">Schnellzugriff</h3>
    <a href="${adminUrl}" style="display:inline-block;background:#fff;border:2px solid #9e8649;color:#7A5E10;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;transition:all 0.3s ease;width:100%;text-align:center;box-sizing:border-box">
      🚀 Zum Admin-Panel
    </a>
  </div>`;

  const securityNote = tempPw 
    ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:20px 0">
        <div style="display:flex;align-items:center;margin-bottom:8px">
          <div style="width:20px;height:20px;background:#ef4444;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-right:10px">
            <span style="color:#fff;font-size:12px;font-weight:bold">!</span>
          </div>
          <strong style="color:#ef4444;font-size:13px">Sicherheitshinweis</strong>
        </div>
        <p style="font-size:13px;color:#666;margin:0;line-height:1.5">${t.changePw}</p>
      </div>`
    : null;

  const html = buildMailHtml({
    heading: t.subject,
    intro: `${t.greeting(name)} ${t.intro}`,
    sections: [
      sec("Ihre Zugangsdaten", [
        tr(t.key,       `<strong style="color:#7A5E10;font-size:15px">${key}</strong>`),
        tr(t.email,     `<span style="font-family:monospace;color:#374151">${email}</span>`),
        tr(t.password,  pwInfo),
      ]),
      loginSection,
      securityNote,
      pwBtn,
    ],
    footer: "&copy; 2026 Propus GmbH"
  });
  return out(t.subject, html);
}

// ─── Passwort-Reset-Mail (Mitarbeiter) ────────────────────────────────────────

function buildResetPasswordEmail({ name, resetUrl }, lang) {
  const t = getC(lang);
  const html = buildMailHtml({
    heading: t.resetSubject,
    intro: `${t.resetGreeting(name)} ${t.resetIntro}`,
    sections: [
      `<div style="text-align:center;margin:32px 0">
        <a href="${resetUrl}" style="display:inline-block;background:#7A5E10;color:#fff;padding:16px 32px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px;box-shadow:0 4px 16px rgba(158,134,73,0.3);transition:all 0.3s ease;letter-spacing:0.3px">
          ${t.resetButton}
        </a>
      </div>`,
      `<div style="background:#f9f7f2;border:1px solid #e8e3d6;border-radius:8px;padding:16px;margin:24px 0">
        <div style="display:flex;align-items:center;margin-bottom:8px">
          <div style="width:20px;height:20px;background:#9e8649;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-right:10px">
            <span style="color:#fff;font-size:12px;font-weight:bold">!</span>
          </div>
          <strong style="color:#7A5E10;font-size:13px">Wichtiger Sicherheitshinweis</strong>
        </div>
        <p style="font-size:13px;color:#666;margin:0;line-height:1.5">${t.resetExpiry}</p>
      </div>`,
      `<div style="border-top:1px solid #ede9e0;padding-top:20px;margin-top:30px">
        <p style="font-size:12px;color:#999;margin:0;text-align:center">
          Sollten Sie Probleme mit dem Button haben, kopieren Sie diesen Link:<br>
          <a href="${resetUrl}" style="color:#7A5E10;font-size:11px;word-break:break-all">${resetUrl}</a>
        </p>
      </div>`,
    ],
    footer: "&copy; 2026 Propus GmbH"
  });
  return out(t.resetSubject, html);
}

module.exports = {
  buildPricingSummary,
  buildOfficeEmail,
  buildPhotographerEmail,
  buildCustomerEmail,
  buildCancellationOfficeEmail,
  buildCancellationPhotographerEmail,
  buildCancellationCustomerEmail,
  buildRescheduleOfficeEmail,
  buildReschedulePhotographerEmail,
  buildRescheduleCustomerEmail,
  buildReassignOfficeEmail,
  buildReassignPhotographerEmail,
  buildReassignCustomerEmail,
  buildWelcomeEmail,
  buildCredentialsEmail,
  buildResetPasswordEmail,
  fmtDate
};
