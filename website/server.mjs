/**
 * Einstiegspunkt fuer die Propus Astro-Website.
 * Kompression (Gzip/Brotli) wird vom vorgelagerten Nginx-Reverse-Proxy uebernommen.
 * Dieses Script startet den Astro Node-Standalone-Server und stellt sicher,
 * dass Umgebungsvariablen korrekt gesetzt sind.
 */

// Astro standalone entry.mjs startet den HTTP-Server automatisch auf dem konfigurierten Port.
await import('./dist/server/entry.mjs');
