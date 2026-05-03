const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../docker/.env') });
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { requireAdminOrRedirect } = require('./middleware/auth');

const customerRoutes = require('./routes/customer');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');
const adminApiRoutes = require('./routes/admin-api');
const authRoutes = require('./routes/auth');
const portalRoutes = require('./routes/portal');
const portalApiRoutes = require('./routes/portal-api');
const portalApiMutationsRoutes = require('./routes/portal-api-mutations');
const userProfiles = require('./lib/user-profiles');
const { pool } = require('./lib/db');
const { createPostgresSessionStore } = require('../auth/postgres-session-store');

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

// Payrexx Webhook MUSS vor express.json() stehen damit express.raw() den Body lesen kann
app.use('/webhook', require('./routes/payrexx-webhook'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Hinter Cloudflare/Nginx/Tunnel läuft alles als HTTPS, intern als HTTP
// true = allen Proxies in der Chain vertrauen (Cloudflare → Tunnel → Nginx → App)
app.set('trust proxy', true);

// Session-Secret: in Production zwingend per Env, kein hartkodierter Fallback,
// damit ein vergessener Deploy-Setup-Schritt nicht zu trivialer Session-Forgery führt.
const toursSessionSecret = (() => {
  const envSecret = process.env.TOURS_SESSION_SECRET || process.env.SESSION_SECRET || '';
  if (envSecret && envSecret.length >= 32) return envSecret;
  if (process.env.NODE_ENV === 'production') {
    console.error(
      '✖ TOURS_SESSION_SECRET (oder SESSION_SECRET) muss in Production gesetzt sein und ≥ 32 Zeichen lang sein.',
    );
    process.exit(1);
  }
  console.warn(
    '[tours] WARN: TOURS_SESSION_SECRET nicht gesetzt – nutze Dev-Fallback. NICHT für Production geeignet.',
  );
  return envSecret || 'propus-tour-manager-secret-dev-only';
})();
/** Gemergte Platform (SPA auf /): Cookie-Path / damit /api/tours/admin dieselbe Session nutzt. */
const toursSessionPath =
  process.env.PROPUS_PLATFORM_MERGED === '1' ? '/' : (TOURS_MOUNT_PATH || '/');
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

// GET /: Tour-Manager ist unter /tour-manager gemountet; Root direkt (ohne Mount) praktisch unbenutzt.
app.get('/', (req, res) => {
  res.status(404).type('text/plain').send('Not found');
});

// Kunden-Routes (touren.propus.ch)
app.use('/r', customerRoutes);

// Bereinigungslauf-Aktionsseiten (öffentlich, kein Login)
app.use('/cleanup', require('./routes/cleanup'));

// Auth (Login – Legacy-Fallback)
app.use('/', authRoutes);

// Admin-Routes (admin.touren.propus.ch)
app.use('/admin', requireAdminOrRedirect, attachAdminSidebarLocals, adminRoutes);

// Admin JSON-API für React-Admin-Panel
app.use('/admin/api', requireAdminOrRedirect, adminApiRoutes);

// Kunden-Portal JSON-API (lesend – für React SPA)
app.use('/portal/api', portalApiRoutes);

// Kunden-Portal JSON-API (mutierend – für React SPA)
app.use('/portal/api', portalApiMutationsRoutes);

// Kunden-Portal (EJS/Redirect-Legacy) + /portal/*
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
