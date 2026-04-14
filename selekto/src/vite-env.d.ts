/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Gesetzt = Backpanel nur mit `?key=…` im Magic-Link; leer = lokaler Zugang ohne Key */
  readonly VITE_BILDER_AUSWAHL_MAGIC_KEY?: string;
  /** Empfänger der Admin-mailto nach Picdrop-Absenden durch den Kunden */
  readonly VITE_PICDROP_NOTIFY_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Document {
  startViewTransition?: (callback: () => void | Promise<void>) => { finished: Promise<void> };
}
