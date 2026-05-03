"use strict";
/**
 * Selekto Proxy-Middleware für Express.
 * Adaptiert aus Y:\Selekto\vite\nextcloudDevProxyPlugin.ts.
 * Stellt drei Middleware-Funktionen bereit:
 *   - nextcloudProxyMiddleware: WebDAV-Proxy für /__propus-nextcloud
 *   - nextcloudThumbMiddleware: Thumbnail-Proxy für /__propus-nc-thumb
 *   - pdfInlineMiddleware:      PDF inline-Proxy für /__propus-pdf-inline
 */

const dns = require("node:dns/promises");
const https = require("node:https");

const PREFIX = "/__propus-nextcloud";
const THUMB_PREFIX = "/__propus-nc-thumb";

const STRIP_REQUEST_HEADERS = new Set(
  [
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailer", "transfer-encoding", "upgrade",
    "sec-fetch-site", "sec-fetch-mode", "sec-fetch-dest", "sec-fetch-user",
    "referer", "origin", "host", "x-prop-nc-host",
  ].map((s) => s.toLowerCase()),
);

const STRIP_RESPONSE_HEADERS = new Set(
  ["connection", "keep-alive", "transfer-encoding", "proxy-authenticate", "proxy-connection"].map((s) =>
    s.toLowerCase(),
  ),
);

function allowHosts() {
  const raw = process.env.NEXTCLOUD_PROXY_ALLOW_HOSTS || process.env.VITE_NEXTCLOUD_PROXY_ALLOW_HOSTS;
  const list = raw
    ? raw.split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)
    : ["cloud.propus.ch"];
  return new Set(list);
}

function isLikelyHostname(host) {
  if (host.length < 1 || host.length > 253) return false;
  if (!/^[a-z0-9.-]+$/i.test(host)) return false;
  if (host.includes("..") || host.startsWith(".") || host.endsWith(".")) return false;
  return true;
}

function isPrivateOrLoopbackIpv4(ip) {
  const p = ip.split(".").map((x) => parseInt(x, 10));
  if (p.length !== 4 || p.some((n) => !isFinite(n) || n < 0 || n > 255)) return false;
  const [a, b] = p;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  return false;
}

function isIpv4String(s) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(s);
}

/**
 * Wrappt eine Promise mit einem Timeout — rejected wenn das Original nicht
 * innerhalb von `ms` ms aufloest. Wird fuer dns.resolve4 verwendet, weil
 * Node's DNS-API selbst keinen Timeout-Parameter kennt; bei System-DNS-
 * Outage wuerde die Middleware sonst blockieren.
 */
function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label || "operation"} timeout after ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

async function resolveConnectIpv4(host) {
  const forceSystem =
    process.env.NEXTCLOUD_PROXY_USE_SYSTEM_DNS?.trim() === "1" ||
    process.env.NEXTCLOUD_PROXY_USE_SYSTEM_DNS?.trim()?.toLowerCase() === "true";
  if (forceSystem) return host;

  try {
    // Bug-Hunt T07: System-DNS hat keinen nativen Timeout. Bei DNS-Outage
    // wuerde resolve4 unbegrenzt haengen. 2s reicht fuer normales DNS;
    // bei Timeout faellt der Code auf den DoH-Pfad weiter unten.
    const sys = await withTimeout(dns.resolve4(host), 2_000, "dns.resolve4");
    const pub = sys.find((ip) => !isPrivateOrLoopbackIpv4(ip));
    if (pub) return pub;
  } catch {
    /* DNS-over-HTTPS versuchen */
  }

  try {
    const dohUrl = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=A`;
    // Bug-Hunt T07: ohne Timeout haengt der DNS-Resolve-Pfad bei DoH-Outage.
    const r = await fetch(dohUrl, {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!r.ok) return host;
    const data = await r.json();
    const answers = (data.Answer || []).filter((x) => x.type === 1 && isIpv4String(x.data.trim()));
    const first = answers[0]?.data?.trim();
    if (first && !isPrivateOrLoopbackIpv4(first)) return first;
  } catch {
    /* Fallback */
  }

  return host;
}

const DAV_FILES_MARKER = "/public.php/dav/files/";

function parseDavTokenFromPublicUrl(target) {
  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return { ok: false, reason: "ungültige URL" };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, reason: "nur https" };
  }
  const idx = parsed.pathname.indexOf(DAV_FILES_MARKER);
  if (idx < 0) {
    return { ok: false, reason: "kein public.php/dav/files" };
  }
  const after = parsed.pathname.slice(idx + DAV_FILES_MARKER.length);
  const slash = after.indexOf("/");
  if (slash <= 0) {
    return { ok: false, reason: "kein Dateipfad" };
  }
  const token = after.slice(0, slash);
  if (!/^[A-Za-z0-9]+$/.test(token)) {
    return { ok: false, reason: "Token ungültig" };
  }
  return { token, ok: true };
}

const allowed = allowHosts();

// ─── Nextcloud WebDAV Proxy ──────────────────────────────────────────────────
function nextcloudProxyMiddleware(req, res, next) {
  const url = req.url ?? "";
  if (!url.startsWith(PREFIX)) {
    return next();
  }

  const host = String(req.headers["x-prop-nc-host"] ?? "").trim().toLowerCase();
  if (!host || !isLikelyHostname(host)) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("x-prop-nc-host fehlt oder ist ungültig.");
    return;
  }
  if (!allowed.has(host)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`Nextcloud-Host «${host}» ist nicht freigegeben (NEXTCLOUD_PROXY_ALLOW_HOSTS).`);
    return;
  }

  void (async () => {
    const tail = url.slice(PREFIX.length) || "/";
    const urlPath = tail.startsWith("/") ? tail : `/${tail}`;

    const fwd = {};
    for (const [key, val] of Object.entries(req.headers)) {
      if (val === undefined) continue;
      if (STRIP_REQUEST_HEADERS.has(key.toLowerCase())) continue;
      fwd[key] = val;
    }
    fwd.host = host;

    let connectHost;
    try {
      connectHost = await resolveConnectIpv4(host);
    } catch {
      connectHost = host;
    }

    const upstream = https.request(
      {
        hostname: connectHost,
        port: 443,
        path: urlPath,
        method: req.method,
        headers: fwd,
        rejectUnauthorized: true,
        family: 4,
        servername: host,
      },
      (pres) => {
        const out = {};
        for (const [k, v] of Object.entries(pres.headers)) {
          if (v === undefined) continue;
          if (STRIP_RESPONSE_HEADERS.has(k.toLowerCase())) continue;
          out[k] = v;
        }
        res.writeHead(pres.statusCode ?? 502, out);
        pres.pipe(res);
      },
    );

    upstream.on("error", (err) => {
      if (!res.headersSent) {
        res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
      }
      res.end(`Nextcloud-Proxy: ${err.message || String(err)}`);
    });

    req.pipe(upstream);
  })();
}

// ─── Nextcloud Thumbnail Proxy ────────────────────────────────────────────────
async function nextcloudThumbMiddleware(req, res, next) {
  const rawUrl = req.url ?? "";
  if (!rawUrl.startsWith(THUMB_PREFIX)) {
    return next();
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Nur GET/HEAD.");
    return;
  }

  let target;
  try {
    const u = new URL(rawUrl, "http://local");
    target = (u.searchParams.get("u") ?? "").trim();
  } catch {
    return next();
  }

  if (!target || !/^https:\/\//i.test(target)) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Parameter u fehlt oder ist kein https-URL.");
    return;
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("URL nicht parsebar.");
    return;
  }

  const host = parsed.hostname.toLowerCase();
  if (!allowed.has(host)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`Host «${host}» nicht freigegeben (NEXTCLOUD_PROXY_ALLOW_HOSTS).`);
    return;
  }

  const tok = parseDavTokenFromPublicUrl(target);
  if (!tok.ok) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(tok.reason);
    return;
  }

  const auth = Buffer.from(`${tok.token}:`, "utf8").toString("base64");

  let connectHost;
  try {
    connectHost = await resolveConnectIpv4(host);
  } catch {
    connectHost = host;
  }

  const doRequest = (method) =>
    new Promise((resolve, reject) => {
      const urlPath = parsed.pathname + (parsed.search || "");
      const upstream = https.request(
        {
          hostname: connectHost,
          port: 443,
          path: urlPath,
          method,
          headers: {
            Authorization: `Basic ${auth}`,
            "User-Agent": "Propus-Selekto-Thumb/1",
            Host: host,
          },
          rejectUnauthorized: true,
          family: 4,
          servername: host,
        },
        (pres) => {
          const chunks = [];
          pres.on("data", (c) => chunks.push(c));
          pres.on("end", () => {
            const rawCt = pres.headers["content-type"];
            const ct =
              (Array.isArray(rawCt) ? rawCt[0] : rawCt)?.split(";")[0]?.trim() || "application/octet-stream";
            resolve({
              status: pres.statusCode ?? 502,
              contentType: ct,
              body: Buffer.concat(chunks),
            });
          });
        },
      );
      upstream.on("error", reject);
      upstream.end();
    });

  try {
    const { status, contentType, body } = await doRequest(req.method === "HEAD" ? "HEAD" : "GET");
    if (!res.headersSent) {
      const out = {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=120",
      };
      if (req.method === "GET") {
        out["Content-Length"] = String(body.length);
      }
      res.writeHead(status, out);
    }
    if (req.method === "GET") res.end(body);
    else res.end();
  } catch (e) {
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    }
    res.end(e instanceof Error ? e.message : "Upstream-Fehler");
  }
}

// ─── PDF Inline Proxy ────────────────────────────────────────────────────────
async function pdfInlineMiddleware(req, res, next) {
  const p = (req.url ?? "").split("?")[0];
  if (p !== "/__propus-pdf-inline" || req.method !== "GET") {
    return next();
  }
  try {
    const full = new URL(req.url || "", "http://local");
    const target = full.searchParams.get("url");
    if (!target || !/^https?:\/\//i.test(target)) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Parameter url fehlt oder ungültig.");
      return;
    }
    const upstream = await fetch(target, {
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
    if (!upstream.ok) {
      res.statusCode = upstream.status;
      res.end();
      return;
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    const rawCt = upstream.headers.get("content-type") || "application/pdf";
    const ct = rawCt.split(";")[0]?.trim() || "application/pdf";
    res.statusCode = 200;
    res.setHeader("Content-Type", ct);
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", "private, max-age=120");
    res.end(buf);
  } catch (e) {
    res.statusCode = 502;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(e instanceof Error ? e.message : "Proxy-Fehler");
  }
}

module.exports = { nextcloudProxyMiddleware, nextcloudThumbMiddleware, pdfInlineMiddleware };
