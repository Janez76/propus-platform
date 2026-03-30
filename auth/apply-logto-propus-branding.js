#!/usr/bin/env node
/**
 * Konsolidiert die Logto "Sign-in & account"-Einstellungen fuer Propus.
 *
 * Tenant-Default (`PATCH /api/sign-in-exp`):
 * - Branding / Farben / Logo / Favicon / Custom CSS
 * - Terms / Privacy
 * - Forgot Password
 * - Sign-in: Benutzername und E-Mail mit Passwort (Logto Smart Input); opt-out: PROPUS_LOGTO_SIGNIN_KEEP_AS_IS=true
 * - konservatives Weiterreichen vorhandener Sign-in-/Sign-up-Einstellungen (sonst)
 *
 * App-Level (`PUT /api/applications/{id}/sign-in-experience`):
 * - nur die von Logto erlaubten Felder (Branding, Farben, Display-Name, Terms/Privacy)
 *
 * Nutzung:
 *   node auth/apply-logto-propus-branding.js
 *   node auth/apply-logto-propus-branding.js --dry-run
 */

const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch (_) {
    /* Datei fehlt - ok */
  }
}

const root = path.join(__dirname, '..');
loadEnvFile(path.join(root, '.env.logto'));
loadEnvFile(path.join(root, '.env.vps'));
loadEnvFile(path.join(root, '.env'));

const logto = require('../booking/logto-client');

const dryRun = process.argv.includes('--dry-run');

const PRIMARY = process.env.PROPUS_LOGTO_BRAND_PRIMARY || '#B68E20';
const DARK_PRIMARY = process.env.PROPUS_LOGTO_BRAND_DARK || '#d4b860';
const LOGO_URL =
  process.env.PROPUS_LOGTO_BRAND_LOGO_URL ||
  'https://booking.propus.ch/assets/brand/logopropus.png';
const FAVICON_URL = process.env.PROPUS_LOGTO_BRAND_FAVICON_URL || LOGO_URL;
const DISPLAY_NAME = process.env.PROPUS_LOGTO_DISPLAY_NAME;
const TERMS_URL = getOptionalEnv(
  'PROPUS_LOGTO_TERMS_URL',
  'PROPUS_LOGTO_TERMS_OF_USE_URL'
);
const PRIVACY_URL = getOptionalEnv(
  'PROPUS_LOGTO_PRIVACY_URL',
  'PROPUS_LOGTO_PRIVACY_POLICY_URL'
);
const AGREE_TO_TERMS_POLICY = getOptionalEnv('PROPUS_LOGTO_AGREE_TO_TERMS_POLICY');
const LANGUAGE_FALLBACK = getOptionalEnv('PROPUS_LOGTO_FALLBACK_LANGUAGE');
const LANGUAGE_AUTO_DETECT = parseBooleanEnv('PROPUS_LOGTO_LANGUAGE_AUTO_DETECT');
const FORGOT_PASSWORD_METHODS = parseForgotPasswordEnv(
  getOptionalEnv('PROPUS_LOGTO_FORGOT_PASSWORD_METHODS')
);
const HIDE_LOGTO_BRANDING = parseBooleanEnv('PROPUS_LOGTO_HIDE_BRANDING');

const CSS_PATH = resolveConfigPath(
  process.env.PROPUS_LOGTO_BRAND_CSS_FILE,
  path.join(__dirname, 'logto-propus-branding.css')
);

const APP_TARGETS = [
  { envKey: 'PROPUS_BOOKING_LOGTO_APP_ID', label: 'Propus Booking' },
  { envKey: 'PROPUS_TOURS_ADMIN_LOGTO_APP_ID', label: 'Propus Tours Admin' },
  { envKey: 'PROPUS_TOURS_PORTAL_LOGTO_APP_ID', label: 'Propus Tours Portal' },
].filter(({ envKey }) => Boolean(process.env[envKey]));

function getOptionalEnv(...keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(process.env, key)) {
      return process.env[key];
    }
  }
  return undefined;
}

function parseBooleanEnv(key) {
  const raw = getOptionalEnv(key);
  if (raw === undefined) return undefined;
  const normalized = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new Error(`Ungueltiger Boolean fuer ${key}: ${raw}`);
}

function resolveConfigPath(maybePath, fallbackPath) {
  const candidate = maybePath && String(maybePath).trim();
  if (!candidate) return fallbackPath;
  if (path.isAbsolute(candidate)) return candidate;
  return path.join(root, candidate);
}

function deepCopy(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

/**
 * Logto Sign-in: neben Benutzername auch E-Mail mit Passwort erlauben (gleiches Formular, „Smart Input“).
 * Schema siehe logto-io/logto packages/schemas signInGuard (methods[].identifier, password, …).
 */
function enrichSignInUsernameEmailPassword(currentSignIn) {
  const signIn = deepCopy(currentSignIn) || { methods: [] };
  const methods = Array.isArray(signIn.methods) ? signIn.methods.slice() : [];

  function methodFor(identifier) {
    const existing = methods.find((m) => m.identifier === identifier);
    if (!existing) {
      return {
        identifier,
        password: true,
        verificationCode: false,
        isPasswordPrimary: true,
      };
    }
    const merged = {
      ...existing,
      password: true,
    };
    if (merged.verificationCode && merged.password) {
      /* Beide Faktoren: isPasswordPrimary unveraendert lassen */
    } else if (merged.password) {
      merged.isPasswordPrimary = true;
    }
    return merged;
  }

  const rest = methods.filter(
    (m) => m.identifier !== 'username' && m.identifier !== 'email'
  );
  signIn.methods = [methodFor('username'), methodFor('email'), ...rest];
  return signIn;
}

function setIfDefined(target, key, value) {
  if (value !== undefined) target[key] = value;
}

function parseForgotPasswordEnv(raw) {
  if (raw === undefined) return undefined;
  const trimmed = String(raw).trim();
  if (!trimmed) return [];
  const allowed = new Set(['EmailVerificationCode', 'PhoneVerificationCode']);
  const parsed = trimmed
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  for (const item of parsed) {
    if (!allowed.has(item)) {
      throw new Error(
        `Ungueltiger Wert in PROPUS_LOGTO_FORGOT_PASSWORD_METHODS: ${item}`
      );
    }
  }

  return [...new Set(parsed)];
}

function readCssFile() {
  if (!fs.existsSync(CSS_PATH)) {
    throw new Error(`CSS-Datei nicht gefunden: ${CSS_PATH}`);
  }
  return fs.readFileSync(CSS_PATH, 'utf8');
}

function resolveTermsValue(currentValue, overrideValue) {
  if (overrideValue !== undefined) return overrideValue;
  return currentValue;
}

function buildLanguageInfo(current) {
  if (LANGUAGE_AUTO_DETECT === undefined && LANGUAGE_FALLBACK === undefined) {
    return deepCopy(current?.languageInfo);
  }

  return {
    autoDetect:
      LANGUAGE_AUTO_DETECT !== undefined
        ? LANGUAGE_AUTO_DETECT
        : current?.languageInfo?.autoDetect ?? true,
    fallbackLanguage:
      LANGUAGE_FALLBACK || current?.languageInfo?.fallbackLanguage || 'de',
  };
}

function buildTenantPatch(current) {
  const patch = {
    color: {
      primaryColor: PRIMARY,
      isDarkModeEnabled:
        current?.color?.isDarkModeEnabled !== undefined
          ? current.color.isDarkModeEnabled
          : true,
      darkPrimaryColor: DARK_PRIMARY,
    },
    branding: {
      logoUrl: LOGO_URL,
      darkLogoUrl: LOGO_URL,
      favicon: FAVICON_URL,
      darkFavicon: FAVICON_URL,
    },
    customCss: readCssFile(),
  };

  if (current && 'hideLogtoBranding' in current) {
    patch.hideLogtoBranding =
      HIDE_LOGTO_BRANDING !== undefined ? HIDE_LOGTO_BRANDING : true;
  }

  setIfDefined(patch, 'languageInfo', buildLanguageInfo(current));
  const skipSignInEnrich =
    parseBooleanEnv('PROPUS_LOGTO_SIGNIN_KEEP_AS_IS') === true;
  setIfDefined(
    patch,
    'signIn',
    skipSignInEnrich
      ? deepCopy(current?.signIn)
      : enrichSignInUsernameEmailPassword(current?.signIn)
  );
  setIfDefined(patch, 'signUp', deepCopy(current?.signUp));
  setIfDefined(patch, 'signInMode', current?.signInMode);
  setIfDefined(patch, 'socialSignIn', deepCopy(current?.socialSignIn));
  setIfDefined(
    patch,
    'socialSignInConnectorTargets',
    deepCopy(current?.socialSignInConnectorTargets)
  );
  setIfDefined(patch, 'passkeySignIn', deepCopy(current?.passkeySignIn));
  setIfDefined(
    patch,
    'forgotPasswordMethods',
    FORGOT_PASSWORD_METHODS !== undefined
      ? FORGOT_PASSWORD_METHODS
      : deepCopy(current?.forgotPasswordMethods)
  );
  setIfDefined(
    patch,
    'termsOfUseUrl',
    resolveTermsValue(current?.termsOfUseUrl, TERMS_URL)
  );
  setIfDefined(
    patch,
    'privacyPolicyUrl',
    resolveTermsValue(current?.privacyPolicyUrl, PRIVACY_URL)
  );
  setIfDefined(
    patch,
    'agreeToTermsPolicy',
    AGREE_TO_TERMS_POLICY !== undefined
      ? AGREE_TO_TERMS_POLICY
      : current?.agreeToTermsPolicy
  );

  return patch;
}

function buildAppLevelPatch() {
  const patch = {
    color: {
      primaryColor: PRIMARY,
      isDarkModeEnabled: true,
      darkPrimaryColor: DARK_PRIMARY,
    },
    branding: {
      logoUrl: LOGO_URL,
      darkLogoUrl: LOGO_URL,
      favicon: FAVICON_URL,
      darkFavicon: FAVICON_URL,
    },
  };

  setIfDefined(patch, 'displayName', DISPLAY_NAME);
  setIfDefined(patch, 'termsOfUseUrl', TERMS_URL);
  setIfDefined(patch, 'privacyPolicyUrl', PRIVACY_URL);
  return patch;
}

function redactAppId(appId) {
  return `${String(appId).slice(0, 8)}…`;
}

async function loadCurrentTenantExperience() {
  if (!logto.isConfigured()) {
    if (dryRun) {
      console.warn(
        '[logto-branding] --dry-run ohne M2M-Credentials: aktueller Tenant-Zustand wird nicht geladen.'
      );
      return null;
    }

    throw new Error(
      'Fehlt: PROPUS_MANAGEMENT_LOGTO_APP_ID / PROPUS_MANAGEMENT_LOGTO_APP_SECRET (z. B. in .env.logto / .env.vps).'
    );
  }

  return logto.mgmtApi('GET', '/sign-in-exp');
}

function printDryRun(omniPatch, appPatch) {
  console.log('[logto-branding] --dry-run: PATCH /sign-in-exp');
  console.log(JSON.stringify(omniPatch, null, 2));

  if (!APP_TARGETS.length) {
    console.log('[logto-branding] --dry-run: keine App-IDs in der Env gefunden.');
    return;
  }

  for (const target of APP_TARGETS) {
    console.log(
      `[logto-branding] --dry-run: PUT /applications/${redactAppId(
        process.env[target.envKey]
      )}/sign-in-experience (${target.label})`
    );
    console.log(JSON.stringify(appPatch, null, 2));
  }
}

async function applyAppLevel(appPatch) {
  for (const target of APP_TARGETS) {
    const appId = process.env[target.envKey];
    try {
      await logto.mgmtApi(
        'PUT',
        `/applications/${encodeURIComponent(appId)}/sign-in-experience`,
        appPatch
      );
      console.log(
        '[logto-branding] App-Level Experience gesetzt:',
        target.label,
        `(${redactAppId(appId)})`
      );
    } catch (error) {
      console.warn(
        '[logto-branding] App-Level uebersprungen:',
        target.label,
        `(${redactAppId(appId)}):`,
        error.message || error
      );
    }
  }
}

async function applyTenantPatch(omniPatch) {
  try {
    await logto.mgmtApi('PATCH', '/sign-in-exp', omniPatch);
    return omniPatch;
  } catch (error) {
    const message = String(error?.message || error);
    if (
      Object.prototype.hasOwnProperty.call(omniPatch, 'hideLogtoBranding') &&
      /hide logto branding is not supported/i.test(message)
    ) {
      const fallbackPatch = { ...omniPatch };
      delete fallbackPatch.hideLogtoBranding;
      console.warn(
        '[logto-branding] hideLogtoBranding wird in dieser Umgebung nicht unterstuetzt - Retry ohne dieses Feld.'
      );
      await logto.mgmtApi('PATCH', '/sign-in-exp', fallbackPatch);
      return fallbackPatch;
    }
    throw error;
  }
}

async function main() {
  const current = await loadCurrentTenantExperience();
  const omniPatch = buildTenantPatch(current);
  const appPatch = buildAppLevelPatch();

  console.log(
    '[logto-branding] Endpoint:',
    process.env.LOGTO_INTERNAL_ENDPOINT || process.env.LOGTO_ENDPOINT || '(default)'
  );
  console.log('[logto-branding] CSS:', CSS_PATH);
  console.log('[logto-branding] Logo:', LOGO_URL);

  if (dryRun) {
    printDryRun(omniPatch, appPatch);
    return;
  }

  await applyTenantPatch(omniPatch);
  console.log(
    '[logto-branding] Tenant Sign-in Experience aktualisiert (PATCH /sign-in-exp).'
  );

  await applyAppLevel(appPatch);

  console.log('[logto-branding] Fertig. Login-Seite ggf. mit Strg+F5 neu laden.');
}

main().catch((err) => {
  console.error('[logto-branding]', err.message || err);
  process.exit(1);
});
