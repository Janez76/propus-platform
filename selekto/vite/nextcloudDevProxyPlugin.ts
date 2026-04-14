import { resolve4 } from "node:dns/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import https from "node:https";
import type { Plugin } from "vite";

const PREFIX = "/__propus-nextcloud";
/** Öffentliche DAV-Datei mit Basic-Auth (Token:) — für `<img>` im Browser (nur Dev / vite preview). */
const THUMB_PREFIX = "/__propus-nc-thumb";

/** Nicht an Upstream weiterreichen (Hop-by-Hop / falscher Kontext). */
const STRIP_REQUEST_HEADERS = new Set(
  [
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "sec-fetch-site",
    "sec-fetch-mode",
    "sec-fetch-dest",
    "sec-fetch-user",
    "referer",
    "origin",
    "host",
    "x-prop-nc-host",
  ].map((s) => s.toLowerCase()),
);

/** Antwort-Header, die beim Roh-Pipe Probleme machen können. */
const STRIP_RESPONSE_HEADERS = new Set(
  ["connection", "keep-alive", "transfer-encoding", "proxy-authenticate", "proxy-connection"].map((s) =>
    s.toLowerCase(),
  ),
);

function allowHosts(): Set<string> {
  const raw = process.env.VITE_NEXTCLOUD_PROXY_ALLOW_HOSTS;
  const list = raw
    ? raw.split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)
    : ["cloud.propus.ch"];
  return new Set(list);
}

function isLikelyHostname(host: string): boolean {
  if (host.length < 1 || host.length > 253) return false;
  if (!/^[a-z0-9.-]+$/i.test(host)) return false;
  if (host.includes("..") || host.startsWith(".") || host.endsWith(".")) return false;
  return true;
}

function isPrivateOrLoopbackIpv4(ip: string): boolean {
  const p = ip.split(".").map((x) => Number.parseInt(x, 10));
  if (p.length !== 4 || p.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return false;
  const [a, b] = p;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  return false;
}

function isIpv4String(s: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(s);
}

/**
 * Viele Router/DNS liefern für cloud.propus.ch eine private IP (Split-DNS) → TLS-Timeout.
 * Dann öffentliche A-Records per DNS-over-HTTPS (Cloudflare) holen und per IP verbinden (SNI bleibt Hostname).
 */
async function resolveConnectIpv4(host: string): Promise<string> {
  const forceSystem =
    process.env.VITE_NEXTCLOUD_PROXY_USE_SYSTEM_DNS?.trim() === "1" ||
    process.env.VITE_NEXTCLOUD_PROXY_USE_SYSTEM_DNS?.trim().toLowerCase() === "true";
  if (forceSystem) return host;

  try {
    const sys = await resolve4(host);
    const pub = sys.find((ip) => !isPrivateOrLoopbackIpv4(ip));
    if (pub) return pub;
  } catch {
    /* leer oder NXDOMAIN → DoH versuchen */
  }

  try {
    const dohUrl = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=A`;
    const r = await fetch(dohUrl, { headers: { accept: "application/dns-json" } });
    if (!r.ok) return host;
    const data = (await r.json()) as { Answer?: { type: number; data: string }[] };
    const answers = data.Answer?.filter((x) => x.type === 1 && isIpv4String(x.data.trim())) ?? [];
    const first = answers[0]?.data.trim();
    if (first && !isPrivateOrLoopbackIpv4(first)) return first;
  } catch {
    /* Fallback */
  }

  return host;
}

const DAV_FILES_MARKER = "/public.php/dav/files/";

function parseDavTokenFromPublicUrl(target: string): { token: string; ok: true } | { ok: false; reason: string } {
  let parsed: URL;
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

function thumbProxyMiddleware(allowed: Set<string>) {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const rawUrl = req.url ?? "";
    if (!rawUrl.startsWith(THUMB_PREFIX)) {
      next();
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Nur GET/HEAD.");
      return;
    }

    let target: string;
    try {
      const u = new URL(rawUrl, "http://local");
      target = (u.searchParams.get("u") ?? "").trim();
    } catch {
      next();
      return;
    }

    if (!target || !/^https:\/\//i.test(target)) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Parameter u fehlt oder ist kein https-URL.");
      return;
    }

    let parsed: URL;
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
      res.end(`Host «${host}» nicht freigegeben (VITE_NEXTCLOUD_PROXY_ALLOW_HOSTS).`);
      return;
    }

    const tok = parseDavTokenFromPublicUrl(target);
    if (!tok.ok) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(tok.reason);
      return;
    }

    const auth = Buffer.from(`${tok.token}:`, "utf8").toString("base64");

    let connectHost: string;
    try {
      connectHost = await resolveConnectIpv4(host);
    } catch {
      connectHost = host;
    }

    const doRequest = (method: string) =>
      new Promise<{ status: number; contentType: string; body: Buffer }>((resolve, reject) => {
        const urlPath = parsed.pathname + (parsed.search || "");
        const upstream = https.request(
          {
            hostname: connectHost,
            port: 443,
            path: urlPath,
            method,
            headers: {
              Authorization: `Basic ${auth}`,
              "User-Agent": "Propus-Picdrop-DevThumb/1",
              Host: host,
            },
            rejectUnauthorized: true,
            family: 4,
            servername: host,
          },
          (pres) => {
            const chunks: Buffer[] = [];
            pres.on("data", (c: Buffer) => chunks.push(c));
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
        const out: Record<string, number | string> = {
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
  };
}

function proxyMiddleware(allowed: Set<string>) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url ?? "";
    if (!url.startsWith(PREFIX)) {
      next();
      return;
    }

    const host = String(req.headers["x-prop-nc-host"] ?? "")
      .trim()
      .toLowerCase();
    if (!host || !isLikelyHostname(host)) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("x-prop-nc-host fehlt oder ist ungültig.");
      return;
    }
    if (!allowed.has(host)) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(
        `Nextcloud-Host «${host}» ist im Dev-Proxy nicht freigegeben. In .env z. B.: VITE_NEXTCLOUD_PROXY_ALLOW_HOSTS=${host}`,
      );
      return;
    }

    void (async () => {
      const tail = url.slice(PREFIX.length) || "/";
      const path = tail.startsWith("/") ? tail : `/${tail}`;

      const fwd: Record<string, string | string[] | undefined> = {};
      for (const [key, val] of Object.entries(req.headers)) {
        if (val === undefined) continue;
        const kl = key.toLowerCase();
        if (STRIP_REQUEST_HEADERS.has(kl)) continue;
        fwd[key] = val;
      }
      fwd.host = host;

      let connectHost: string;
      try {
        connectHost = await resolveConnectIpv4(host);
      } catch {
        connectHost = host;
      }

      const upstream = https.request(
        {
          hostname: connectHost,
          port: 443,
          path,
          method: req.method,
          headers: fwd,
          rejectUnauthorized: true,
          family: 4,
          servername: host,
        },
        (pres) => {
          const out: Record<string, number | string | string[] | undefined> = {};
          for (const [k, v] of Object.entries(pres.headers)) {
            if (v === undefined) continue;
            if (STRIP_RESPONSE_HEADERS.has(k.toLowerCase())) continue;
            out[k] = v;
          }
          res.writeHead(pres.statusCode ?? 502, out);
          pres.pipe(res);
        },
      );

      upstream.on("error", (err: Error) => {
        if (!res.headersSent) {
          res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
        }
        const msg =
          err.message ||
          (err instanceof AggregateError && err.errors[0] instanceof Error
            ? err.errors[0].message
            : String(err));
        res.end(`Nextcloud-Proxy: ${msg}`);
      });

      req.pipe(upstream);
    })();
  };
}

/** PROPFIND/WebDAV zur Propus-Cloud: Browser-CORS umgehen (nur Dev / vite preview). */
export function nextcloudDevProxyPlugin(): Plugin {
  const allowed = allowHosts();
  return {
    name: "propus-nextcloud-dev-proxy",
    configureServer(server) {
      server.middlewares.use(thumbProxyMiddleware(allowed));
      server.middlewares.use(proxyMiddleware(allowed));
    },
    configurePreviewServer(server) {
      server.middlewares.use(thumbProxyMiddleware(allowed));
      server.middlewares.use(proxyMiddleware(allowed));
    },
  };
}
