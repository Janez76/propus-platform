export type NummernkreisTyp =
  | "offerte"
  | "auftrag"
  | "rechnung"
  | "teilrechnung"
  | "schlussrechnung"
  | "gutschrift";

export type DokumentTyp = NummernkreisTyp | "mahnungen";

export type RolleTyp = "admin" | "fotograf";

export type BerechtigungKey =
  | "offerte_erstellen"
  | "auftrag_erstellen"
  | "rechnung_erstellen"
  | "dokument_versenden"
  | "rabatt_vergeben"
  | "gutschrift_erstellen"
  | "einstellungen_aendern";

export interface Nummernkreis {
  prefix: string;
  naechste: number;
}

export interface FinanzEinstellungenData {
  id: string;
  firmenname: string;
  uid: string | null;
  strasse: string | null;
  plzOrt: string | null;
  iban: string | null;
  bankname: string | null;
  emailAbsender: string | null;
  telefon: string | null;
  mwstSatz: number;
  zahlungsfristTage: number;
  waehrung: "CHF" | "EUR";
  sprache: "de_CH" | "en";
  standardNotiz: string | null;
  standardFussnote: string | null;
  nummernkreise: Record<NummernkreisTyp, Nummernkreis>;
  aktiveTypen: Record<DokumentTyp, boolean>;
  berechtigungen: Record<BerechtigungKey, Record<RolleTyp, boolean>>;
  logoUrl: string | null;
  akzentfarbe: string;
  qrCodeAktiv: boolean;
  unterschriftsfeld: boolean;
  fotografAufDokument: boolean;
  payrexxAktiv: boolean;
  payrexxTwint: boolean;
  payrexxKarte: boolean;
  payrexxPostfinance: boolean;
  payrexxPaypal: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export const FINANZ_DEFAULTS: FinanzEinstellungenData = {
  id: "",
  firmenname: "Propus GmbH",
  uid: null,
  strasse: null,
  plzOrt: null,
  iban: null,
  bankname: null,
  emailAbsender: null,
  telefon: null,
  mwstSatz: 8.1,
  zahlungsfristTage: 30,
  waehrung: "CHF",
  sprache: "de_CH",
  standardNotiz: null,
  standardFussnote: null,
  nummernkreise: {
    offerte: { prefix: "OF", naechste: 1 },
    auftrag: { prefix: "AU", naechste: 1 },
    rechnung: { prefix: "RE", naechste: 1 },
    teilrechnung: { prefix: "TR", naechste: 1 },
    schlussrechnung: { prefix: "SR", naechste: 1 },
    gutschrift: { prefix: "GU", naechste: 1 },
  },
  aktiveTypen: {
    offerte: true,
    auftrag: true,
    rechnung: true,
    teilrechnung: false,
    gutschrift: true,
    mahnungen: false,
  },
  berechtigungen: {
    offerte_erstellen: { admin: true, fotograf: false },
    auftrag_erstellen: { admin: true, fotograf: false },
    rechnung_erstellen: { admin: true, fotograf: false },
    dokument_versenden: { admin: true, fotograf: false },
    rabatt_vergeben: { admin: true, fotograf: false },
    gutschrift_erstellen: { admin: true, fotograf: false },
    einstellungen_aendern: { admin: false, fotograf: false },
  },
  logoUrl: null,
  akzentfarbe: "#B68E20",
  qrCodeAktiv: true,
  unterschriftsfeld: true,
  fotografAufDokument: false,
  payrexxAktiv: false,
  payrexxTwint: true,
  payrexxKarte: true,
  payrexxPostfinance: true,
  payrexxPaypal: false,
  updatedAt: null,
  updatedBy: null,
};
