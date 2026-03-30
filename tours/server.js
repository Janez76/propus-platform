const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../docker/.env') });
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { requireAdminOrRedirect } = require('./middleware/auth');

const customerRoutes = require('./routes/customer');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');
const portalRoutes = require('./routes/portal');
const portalApiRoutes = require('./routes/portal-api');
const userProfiles = require('./lib/user-profiles');
const { pool } = require('./lib/db');
const { createPostgresSessionStore } = require('../auth/postgres-session-store');

let logtoAuth = null;
let logtoPortalAuth = null;
try {
  const { createLogtoAuth } = require('../auth/logto-middleware');
  logtoAuth = createLogtoAuth({
    prefix: 'PROPUS_TOURS_ADMIN',
    callbackPath: '/auth/callback',
    logoutRedirect: '/',
    loginPath: '/auth/login',
    logoutPath: '/auth/logout',
    sessionKind: 'admin',
  });
  logtoPortalAuth = createLogtoAuth({
    prefix: 'PROPUS_TOURS_PORTAL',
    callbackPath: '/portal/auth/callback',
    logoutRedirect: '/portal/login',
    loginPath: '/portal/auth/login',
    logoutPath: '/portal/auth/logout',
    sessionKind: 'portal',
  });
  if (logtoAuth.enabled) {
    console.log('[tours] Logto OIDC auth enabled (admin)');
  }
  if (logtoPortalAuth.enabled) {
    console.log('[tours] Logto OIDC auth enabled (portal)');
  }
} catch {
  // auth module not available – legacy-only mode
}

const app = express();
/** Wenn unter /tour-manager gemountet: Prefix für Links in EJS (res.locals.basePath) */
const TOURS_MOUNT_PATH = String(process.env.TOURS_MOUNT_PATH || '').replace(/\/$/, '');
app.use((req, res, next) => {
  res.locals.basePath = TOURS_MOUNT_PATH;
  /** Link „Zurück zum Admin-Panel“ (React Buchungs-Admin). Absolut = kein basePath-Rewrite im Client. */
  res.locals.adminSpaHomeHref = String(process.env.BOOKING_ADMIN_SPA_URL || "").trim() || "/dashboard";
  next();
});

/** Bei Mount unter /tour-manager: res.redirect('/admin') -> /tour-manager/admin */
if (TOURS_MOUNT_PATH) {
  app.use((req, res, next) => {
    const mount = TOURS_MOUNT_PATH;
    const _redirect = res.redirect.bind(res);
    res.redirect = function redirectWithMount(...args) {
      if (args.length === 1 && typeof args[0] === 'string' && args[0].startsWith('/') && !args[0].startsWith('//')) {
        return _redirect(mount + args[0]);
      }
      if (
        args.length === 2 &&
        typeof args[0] === 'number' &&
        typeof args[1] === 'string' &&
        args[1].startsWith('/') &&
        !args[1].startsWith('//')
      ) {
        return _redirect(args[0], mount + args[1]);
      }
      return _redirect(...args);
    };
    next();
  });
}
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

/** Anzeigename + Organisation + Profilfoto-Flag in der Admin-Sidebar */
function attachAdminSidebarLocals(req, res, next) {
  const rawEmail = String(req.session?.admin?.email || '').trim().toLowerCase();
  const fallback = () => {
    const emailLocal = rawEmail.includes('@') ? rawEmail.split('@')[0] : rawEmail;
    res.locals.adminSidebarDisplayName = emailLocal
      ? emailLocal
          .split(/[._-]+/)
          .filter(Boolean)
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(' ')
      : 'Admin';
    res.locals.adminSidebarHasProfilePhoto = false;
    res.locals.adminSidebarPhotoVersion = 0;
    res.locals.adminSidebarOrganization = 'Propus GmbH';
    next();
  };
  userProfiles
    .getAdminSidebarBundle(rawEmail)
    .then((bundle) => {
      res.locals.adminSidebarDisplayName = bundle.displayName;
      res.locals.adminSidebarHasProfilePhoto = bundle.hasPhoto;
      res.locals.adminSidebarPhotoVersion = bundle.photoVersion;
      res.locals.adminSidebarOrganization = 'Propus GmbH';
      next();
    })
    .catch(() => fallback());
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Hinter Cloudflare/Nginx/Tunnel läuft alles als HTTPS, intern als HTTP
// true = allen Proxies in der Chain vertrauen (Cloudflare → Tunnel → Nginx → App)
app.set('trust proxy', true);

const toursSessionSecret =
  process.env.TOURS_SESSION_SECRET ||
  process.env.SESSION_SECRET ||
  'propus-tour-manager-secret';
const toursSessionPath = TOURS_MOUNT_PATH || '/';
const toursSessionStore = createPostgresSessionStore(session.Store, {
  pool,
  tableName: 'core.tours_sessions',
  ttlSeconds: 24 * 60 * 60,
  logger: console,
});

app.use(session({
  name: 'propus_tours.sid',
  secret: toursSessionSecret,
  resave: false,
  saveUninitialized: false,
  store: toursSessionStore,
  cookie: {
    secure: 'auto',     // über Proxy automatisch HTTPS-Cookie setzen
    sameSite: 'lax',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    path: toursSessionPath,
  },
}));

// Host-Routing: admin.touren.propus.ch → Admin, tour.propus.ch → Portal, rest → Info
app.use((req, res, next) => {
  const host = req.get('host') || '';
  req.isAdminHost = host.startsWith('admin.');
  req.isPortalHost = host === 'tour.propus.ch' || host.startsWith('tour.');
  next();
});

// Root: Admin-Host → /admin, Portal-Host → /portal, Kunden-Host → kurze Info
app.get('/', (req, res) => {
  if (req.isAdminHost) return res.redirect('/admin');
  if (req.isPortalHost) return res.redirect('/portal');
  res.send(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Propus Touren</title></head>' +
    '<body style="font-family:sans-serif;max-width:600px;margin:2rem auto;padding:0 1rem;">' +
    '<h1>Propus VR Touren</h1><p>Verwende den Link aus der E-Mail zur Verlängerung.</p></body></html>'
  );
});

// Logto OIDC Routes (wenn aktiviert)
if (logtoAuth?.enabled) {
  app.use(logtoAuth.routes());
}
if (logtoPortalAuth?.enabled) {
  app.use(logtoPortalAuth.routes());
}

// Kunden-Routes (touren.propus.ch)
app.use('/r', customerRoutes);

// Auth (Login – Legacy-Fallback)
app.use('/', authRoutes);

// Admin-Routes (admin.touren.propus.ch)
app.use('/admin', requireAdminOrRedirect, attachAdminSidebarLocals, adminRoutes);

// Kunden-Portal JSON-API (für React SPA)
app.use('/portal/api', portalApiRoutes);

// Kunden-Portal (tour.propus.ch/portal)
app.use('/portal', portalRoutes);

// API (für n8n, Cron, Admin-Aktionen)
app.use('/api', apiRoutes);

// Health
app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Propus Tour Manager listening on port ${PORT}`);
  });
}

module.exports = { app };
