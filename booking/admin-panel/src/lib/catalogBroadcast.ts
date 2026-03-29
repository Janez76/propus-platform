/** Feste Kanal-ID für Tabs mit öffentlichem Buchungs-Frontend (muss serverseitig/admin konsistent bleiben). */
export const PUBLIC_CATALOG_BROADCAST_CHANNEL = "propus-public-catalog-v1";
/** Fallback fuer Browser/Tab-Kontexte ohne BroadcastChannel-Zustellung. */
export const PUBLIC_CATALOG_BROADCAST_STORAGE_KEY = "propus-public-catalog-v1:invalidate-at";

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Informiert andere Tabs (z. B. Buchungs-Frontend) auf derselben Origin,
 * dass der öffentliche Produktkatalog neu geladen werden soll.
 * Mehrere schnelle Admin-Mutationen werden gebündelt.
 */
export function notifyPublicCatalogChanged(): void {
  if (typeof window === "undefined") return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    const at = Date.now();
    try {
      if (typeof BroadcastChannel !== "undefined") {
        const ch = new BroadcastChannel(PUBLIC_CATALOG_BROADCAST_CHANNEL);
        ch.postMessage({ type: "invalidate", at });
        ch.close();
      }
    } catch {
      /* ignore */
    }
    try {
      window.localStorage.setItem(PUBLIC_CATALOG_BROADCAST_STORAGE_KEY, String(at));
    } catch {
      /* ignore */
    }
  }, 150);
}
