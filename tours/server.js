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
const userProfiles = require('./lib/user-profiles');

let logtoAuth = null;
try {
  const { createLogtoAuth } = require('../auth/logto-middleware');
  logtoAuth = createLogtoAuth({
    prefix: 'PROPUS_TOURS_ADMIN',
    callbackPath: '/auth/callback',
    logoutRedirect: '/',
    loginPath: '/auth/login',
    logoutPath: '/auth/logout',
  });
  if (logtoAuth.enabled) {
    console.log('[tours] Logto OIDC auth enabled');
  }
} catch {
  // auth module not available – legacy-only mode
}

const app = express();
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

app.use(session({
  secret: process.env.SESSION_SECRET || 'propus-tour-manager-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: 'auto',     // über Proxy automatisch HTTPS-Cookie setzen
    sameSite: 'lax',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
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

// Kunden-Routes (touren.propus.ch)
app.use('/r', customerRoutes);

// Auth (Login – Legacy-Fallback)
app.use('/', authRoutes);

// Admin-Routes (admin.touren.propus.ch)
app.use('/admin', requireAdminOrRedirect, attachAdminSidebarLocals, adminRoutes);

// Kunden-Portal (tour.propus.ch/portal)
app.use('/portal', portalRoutes);

// API (für n8n, Cron, Admin-Aktionen)
app.use('/api', apiRoutes);

// Health
app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Propus Tour Manager listening on port ${PORT}`);
});
