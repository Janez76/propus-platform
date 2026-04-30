// Propus Mobile SW – minimaler Service Worker fuer PWA-Install + leichten Cache.
// Scope: '/' (Datei liegt im public-Root). Admin-/Next-Seiten duerfen nicht
// cache-first laufen, sonst bleiben neue Deploys bis Ctrl+Shift+R unsichtbar.
const CACHE = "propus-shell-v3";
const SHELL = [
  "/mobile", "/manifest.webmanifest",
  "/assistant", "/manifest-ki.webmanifest",
  "/assets/brand/favicon.svg", "/assets/brand/logopropus.png",
];
const SHELL_SET = new Set(SHELL);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL).catch(() => undefined))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // API: network-first, kein Cache (Auth-Tokens, frische Daten)
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(req).catch(
        () =>
          new Response(JSON.stringify({ ok: false, offline: true }), {
            headers: { "Content-Type": "application/json" },
            status: 503,
          })
      )
    );
    return;
  }

  // Next.js-Runtime/Chunks und normale Seiten immer aus dem Netzwerk laden.
  // Browser/Next regeln die Versionierung der hashed Assets selbst.
  if (url.pathname.startsWith("/_next/") || req.mode === "navigate" || !SHELL_SET.has(url.pathname)) {
    event.respondWith(fetch(req));
    return;
  }

  // Nur die kleine Mobile-PWA-Shell cache-first halten.
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match("/mobile")))
  );
});
