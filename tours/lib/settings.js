/**
 * Einstellungen (Dashboard-Widgets) laden und speichern
 */
const { pool } = require('./db');

const DEFAULT_WIDGETS = {
  total: true,
  expiringSoon: true,
  awaitingPayment: true,
  active: true,
  declined: true,
  archived: true,
  unlinked: true,
  fremdeTouren: true,
  invoicesOffen: true,
  invoicesUeberfaellig: true,
  invoicesBezahlt: true,
};

const DEFAULT_AI_PROMPT_SETTINGS = {
  mailSystemPrompt: '',
};

const DEFAULT_AUTOMATION_SETTINGS = {
  expiringMailEnabled: false,
  expiringMailLeadDays: 30,
  expiringMailTemplateKey: 'renewal_request',
  expiringMailCooldownDays: 14,
  expiringMailBatchLimit: 50,
  expiringMailCreateActionLinks: true,
  expiryPolicyEnabled: true,
  expirySetPendingAfterDays: 0,
  expiryLockMatterportOnPending: false,
  expiryArchiveAfterDays: 0,
  paymentCheckEnabled: true,
  paymentCheckBatchLimit: 250,
  matterportAutoLinkEnabled: true,
  matterportAutoLinkBatchLimit: 500,
  matterportStatusSyncEnabled: true,
  matterportStatusSyncBatchLimit: 500,
};

const DEFAULT_EXXAS_RUNTIME_CONFIG = {
  enabled: false,
  apiKey: '',
  appPassword: '',
  endpoint: '',
  authMode: 'apiKey',
};

async function ensureSettingsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tour_manager.settings (
      key VARCHAR(64) PRIMARY KEY,
      value JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function getDashboardWidgets() {
  try {
    await ensureSettingsTable();
    const r = await pool.query(
      `SELECT value FROM tour_manager.settings WHERE key = 'dashboard_widgets'`
    );
    if (r.rows[0]?.value) {
      return { ...DEFAULT_WIDGETS, ...r.rows[0].value };
    }
  } catch (e) {
    console.warn('getDashboardWidgets:', e.message);
  }
  return DEFAULT_WIDGETS;
}

async function saveDashboardWidgets(widgets) {
  try {
    await ensureSettingsTable();
    await pool.query(
      `INSERT INTO tour_manager.settings (key, value, updated_at)
       VALUES ('dashboard_widgets', $1::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = NOW()`,
      [JSON.stringify(widgets)]
    );
    return true;
  } catch (e) {
    console.warn('saveDashboardWidgets:', e.message);
    return false;
  }
}

async function getAiPromptSettings() {
  try {
    await ensureSettingsTable();
    const r = await pool.query(
      `SELECT value FROM tour_manager.settings WHERE key = 'ai_prompt_settings'`
    );
    if (r.rows[0]?.value) {
      return { ...DEFAULT_AI_PROMPT_SETTINGS, ...r.rows[0].value };
    }
  } catch (e) {
    console.warn('getAiPromptSettings:', e.message);
  }
  return DEFAULT_AI_PROMPT_SETTINGS;
}

async function saveAiPromptSettings(promptSettings) {
  try {
    await ensureSettingsTable();
    const value = {
      ...DEFAULT_AI_PROMPT_SETTINGS,
      ...promptSettings,
      mailSystemPrompt: String(promptSettings?.mailSystemPrompt || '').trim(),
    };
    await pool.query(
      `INSERT INTO tour_manager.settings (key, value, updated_at)
       VALUES ('ai_prompt_settings', $1::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = NOW()`,
      [JSON.stringify(value)]
    );
    return true;
  } catch (e) {
    console.warn('saveAiPromptSettings:', e.message);
    return false;
  }
}

/** Matterport Model API: Token-ID + Secret (my.matterport.com → API-Token, nicht SDK). */
async function getMatterportApiCredentials() {
  try {
    await ensureSettingsTable();
    const r = await pool.query(
      `SELECT value FROM tour_manager.settings WHERE key = 'matterport_api_credentials'`
    );
    const v = r.rows[0]?.value;
    if (v && typeof v === 'object') {
      return {
        tokenId: String(v.tokenId || '').trim(),
        tokenSecret: String(v.tokenSecret || '').trim(),
      };
    }
  } catch (e) {
    console.warn('getMatterportApiCredentials:', e.message);
  }
  return { tokenId: '', tokenSecret: '' };
}

/**
 * @param {{ tokenId?: string, tokenSecret?: string, clearStored?: boolean }} payload
 * Secret-Feld leer = bisheriges Secret behalten. clearStored = Eintrag in DB löschen (.env greift wieder).
 */
async function saveMatterportApiCredentials(payload) {
  try {
    await ensureSettingsTable();
    if (payload?.clearStored) {
      await pool.query(`DELETE FROM tour_manager.settings WHERE key = 'matterport_api_credentials'`);
      return true;
    }
    const current = await getMatterportApiCredentials();
    const newId = String(payload?.tokenId ?? '').trim();
    const newSecretRaw = String(payload?.tokenSecret ?? '').trim();
    const tokenSecret = newSecretRaw.length > 0 ? newSecretRaw : current.tokenSecret;
    const tokenId = newId;
    if (!tokenId && !tokenSecret) {
      await pool.query(`DELETE FROM tour_manager.settings WHERE key = 'matterport_api_credentials'`);
      return true;
    }
    await pool.query(
      `INSERT INTO tour_manager.settings (key, value, updated_at)
       VALUES ('matterport_api_credentials', $1::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = NOW()`,
      [JSON.stringify({ tokenId, tokenSecret })]
    );
    return true;
  } catch (e) {
    console.warn('saveMatterportApiCredentials:', e.message);
    return false;
  }
}

function normalizeExxasRuntimeConfig(value) {
  const raw = value && typeof value === 'object' ? value : {};
  return {
    enabled: raw.enabled !== false,
    apiKey: String(raw.apiKey || '').trim(),
    appPassword: String(raw.appPassword || '').trim(),
    endpoint: String(raw.endpoint || '').trim(),
    authMode: String(raw.authMode || '').trim().toLowerCase() === 'bearer' ? 'bearer' : 'apiKey',
  };
}

async function getExxasRuntimeConfig() {
  try {
    await ensureSettingsTable();
    const r = await pool.query(
      `SELECT value FROM tour_manager.settings WHERE key = 'exxas_runtime_config'`
    );
    if (r.rows[0]?.value && typeof r.rows[0].value === 'object') {
      return { ...DEFAULT_EXXAS_RUNTIME_CONFIG, ...normalizeExxasRuntimeConfig(r.rows[0].value) };
    }
  } catch (e) {
    console.warn('getExxasRuntimeConfig:', e.message);
  }
  return { ...DEFAULT_EXXAS_RUNTIME_CONFIG };
}

async function saveExxasRuntimeConfig(payload) {
  try {
    await ensureSettingsTable();
    const normalized = normalizeExxasRuntimeConfig(payload);
    if (!normalized.apiKey && !normalized.appPassword && !normalized.endpoint) {
      await pool.query(`DELETE FROM tour_manager.settings WHERE key = 'exxas_runtime_config'`);
      return true;
    }
    await pool.query(
      `INSERT INTO tour_manager.settings (key, value, updated_at)
       VALUES ('exxas_runtime_config', $1::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = NOW()`,
      [JSON.stringify(normalized)]
    );
    return true;
  } catch (e) {
    console.warn('saveExxasRuntimeConfig:', e.message);
    return false;
  }
}

async function getAutomationSettings() {
  try {
    await ensureSettingsTable();
    const r = await pool.query(
      `SELECT value FROM tour_manager.settings WHERE key = 'automation_settings'`
    );
    if (r.rows[0]?.value && typeof r.rows[0].value === 'object') {
      return { ...DEFAULT_AUTOMATION_SETTINGS, ...r.rows[0].value };
    }
  } catch (e) {
    console.warn('getAutomationSettings:', e.message);
  }
  return { ...DEFAULT_AUTOMATION_SETTINGS };
}

async function saveAutomationSettings(automationSettings) {
  try {
    await ensureSettingsTable();
    const current = await getAutomationSettings();
    const parsed = {
      ...DEFAULT_AUTOMATION_SETTINGS,
      ...current,
      ...automationSettings,
    };
    const toInt = (value, fallback) => {
      const num = parseInt(String(value), 10);
      return Number.isFinite(num) ? num : fallback;
    };
    const normalized = {
      expiringMailEnabled: !!parsed.expiringMailEnabled,
      expiringMailLeadDays: Math.max(0, toInt(parsed.expiringMailLeadDays, DEFAULT_AUTOMATION_SETTINGS.expiringMailLeadDays)),
      expiringMailTemplateKey: String(parsed.expiringMailTemplateKey || DEFAULT_AUTOMATION_SETTINGS.expiringMailTemplateKey).trim().toLowerCase(),
      expiringMailCooldownDays: Math.max(0, toInt(parsed.expiringMailCooldownDays, DEFAULT_AUTOMATION_SETTINGS.expiringMailCooldownDays)),
      expiringMailBatchLimit: Math.max(1, toInt(parsed.expiringMailBatchLimit, DEFAULT_AUTOMATION_SETTINGS.expiringMailBatchLimit)),
      expiringMailCreateActionLinks: !!parsed.expiringMailCreateActionLinks,
      expiryPolicyEnabled: !!parsed.expiryPolicyEnabled,
      expirySetPendingAfterDays: Math.max(0, toInt(parsed.expirySetPendingAfterDays, DEFAULT_AUTOMATION_SETTINGS.expirySetPendingAfterDays)),
      expiryLockMatterportOnPending: !!parsed.expiryLockMatterportOnPending,
      expiryArchiveAfterDays: Math.max(0, toInt(parsed.expiryArchiveAfterDays, DEFAULT_AUTOMATION_SETTINGS.expiryArchiveAfterDays)),
      paymentCheckEnabled: !!parsed.paymentCheckEnabled,
      paymentCheckBatchLimit: Math.max(1, toInt(parsed.paymentCheckBatchLimit, DEFAULT_AUTOMATION_SETTINGS.paymentCheckBatchLimit)),
      matterportAutoLinkEnabled: !!parsed.matterportAutoLinkEnabled,
      matterportAutoLinkBatchLimit: Math.max(1, toInt(parsed.matterportAutoLinkBatchLimit, DEFAULT_AUTOMATION_SETTINGS.matterportAutoLinkBatchLimit)),
      matterportStatusSyncEnabled: !!parsed.matterportStatusSyncEnabled,
      matterportStatusSyncBatchLimit: Math.max(1, toInt(parsed.matterportStatusSyncBatchLimit, DEFAULT_AUTOMATION_SETTINGS.matterportStatusSyncBatchLimit)),
    };

    await pool.query(
      `INSERT INTO tour_manager.settings (key, value, updated_at)
       VALUES ('automation_settings', $1::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = NOW()`,
      [JSON.stringify(normalized)]
    );
    return true;
  } catch (e) {
    console.warn('saveAutomationSettings:', e.message);
    return false;
  }
}

function buildEmailFrame({ preheader, title, introHtml, summaryHtml = '', bodyHtml = '', ctaHtml = '', noteHtml = '', footerHtml = '' }) {
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f6f4ef;color:#1f2937;font-family:Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader || title}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f4ef;border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:36px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:720px;border-collapse:collapse;">
          <tr>
            <td style="padding:0 0 16px 0;text-align:center;">
              <div style="display:inline-block;padding:7px 14px;border:1px solid #e4dac7;border-radius:999px;background:#ffffff;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#8e7440;font-weight:700;">
                Propus Tour Manager
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:0;">
              <div style="background:#ffffff;border:1px solid #e8e0d0;border-radius:34px;overflow:hidden;box-shadow:0 24px 56px rgba(20,19,17,0.08);">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                <tr>
                  <td style="padding:34px 38px 24px;background:linear-gradient(180deg,#fdfaf4 0%,#ffffff 100%);border-bottom:1px solid #eee6d8;">
                    <div style="display:inline-block;padding:7px 13px;border-radius:999px;background:#f5edde;color:#8e7440;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">Service-E-Mail</div>
                    <h1 style="margin:16px 0 0;font-size:31px;line-height:1.16;color:#171717;font-weight:700;letter-spacing:-0.03em;">${title}</h1>
                    <div style="margin-top:14px;width:64px;height:4px;border-radius:999px;background:linear-gradient(90deg,#b28f44 0%,#d4bd86 100%);"></div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px 38px 10px;font-size:16px;line-height:1.75;color:#374151;">
                    ${introHtml}
                  </td>
                </tr>
                ${summaryHtml ? `<tr><td style="padding:0 38px 14px;">${summaryHtml}</td></tr>` : ''}
                ${bodyHtml ? `<tr><td style="padding:0 38px 12px;font-size:15px;line-height:1.78;color:#4b5563;">${bodyHtml}</td></tr>` : ''}
                ${ctaHtml ? `<tr><td style="padding:10px 38px 10px;">${ctaHtml}</td></tr>` : ''}
                ${noteHtml ? `<tr><td style="padding:8px 38px 12px;">${noteHtml}</td></tr>` : ''}
                <tr>
                  <td style="padding:20px 38px 36px;">
                    <div style="height:1px;background:linear-gradient(90deg,rgba(236,229,215,0),#ece5d7 14%,#ece5d7 86%,rgba(236,229,215,0));margin-bottom:20px;"></div>
                    <div style="font-size:14px;line-height:1.7;color:#6b7280;">
                      ${footerHtml || `Freundliche Grüsse<br><strong style="color:#18181b;">Ihr Propus Team</strong>`}
                    </div>
                  </td>
                </tr>
              </table>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildSummaryCard(rows, extraHtml = '') {
  const rowHtml = rows
    .filter((row) => row && row.value)
    .map((row) => `
      <tr>
        <td style="padding:0 0 14px;color:#8a7550;font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;vertical-align:top;width:150px;">${row.label}</td>
        <td style="padding:0 0 14px;color:#111827;font-size:15px;line-height:1.6;">${row.value}</td>
      </tr>
    `)
    .join('');
  return `
    <div style="background:linear-gradient(180deg,#fffdf9 0%,#fffaf2 100%);border:1px solid #ece5d7;border-radius:24px;padding:22px 24px;box-shadow:inset 0 1px 0 rgba(255,255,255,0.72);">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
        ${rowHtml}
      </table>
      ${extraHtml || ''}
    </div>
  `;
}

function buildInfoCallout(icon, title, text) {
  return `
    <div style="margin-top:16px;background:#fbf8f2;border:1px solid #ece5d7;border-radius:22px;padding:16px 18px;">
      <div style="font-size:14px;font-weight:700;color:#18181b;margin-bottom:6px;">${icon} ${title}</div>
      <div style="font-size:14px;line-height:1.7;color:#4b5563;">${text}</div>
    </div>
  `;
}

function buildActionButtons(buttons) {
  const html = (buttons || [])
    .filter((btn) => btn && btn.href && btn.label)
    .map((btn) => `
      <a href="${btn.href}" style="display:inline-block;padding:14px 28px;border-radius:999px;background-color:${btn.primary ? '#B68E20' : '#ffffff'};background:${btn.primary ? 'linear-gradient(135deg,#B68E20 0%,#8a6c18 100%)' : '#ffffff'};color:${btn.primary ? '#ffffff' : '#1f2937'};text-decoration:none;font-size:15px;font-weight:700;border:2px solid ${btn.primary ? '#8a6c18' : '#d1c9bb'};margin:0 10px 10px 0;box-shadow:${btn.primary ? '0 4px 14px rgba(182,142,32,0.35)' : 'none'};letter-spacing:0.01em;mso-padding-alt:0;line-height:1.4;">
        ${btn.icon ? `<span style="margin-right:6px;">${btn.icon}</span>` : ''}${btn.label}
      </a>
    `)
    .join('');
  return `
    <div style="background:#fffdf8;border:1px solid #e0d5bf;border-radius:16px;padding:22px 24px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#8a6c18;margin-bottom:16px;">Nächste Schritte</div>
      ${html}
    </div>
  `;
}

const DEFAULT_EMAIL_TEMPLATES = {
  renewal_request: {
    name: 'Verlängerungs-Anfrage',
    description: 'Wird beim Cron oder manuell an Kunden geschickt, deren Tour bald abläuft.',
    category: 'aktiv',
    subject: 'Verlängerung Ihres virtuellen Rundgangs – {{objectLabel}}',
    html: buildEmailFrame({
      preheader: 'Verlängerung Ihres virtuellen Rundgangs',
      title: 'Verlängerung Ihres Rundgangs',
      introHtml: `<p style="margin:0 0 14px;">{{customerGreeting}}</p><p style="margin:0;">wir möchten Sie höflich darauf hinweisen, dass das Hosting Ihres virtuellen Rundgangs in Kürze zur Verlängerung ansteht.</p>`,
      summaryHtml: buildSummaryCard(
        [
          { label: 'Objekt', value: '{{objectLabel}}' },
          { label: 'Erstellt', value: '{{createdAt}}' },
          { label: 'Preis', value: 'CHF {{amount}} für weitere 6 Monate' },
        ],
        `<div style="padding-top:2px;color:#4b5563;font-size:14px;line-height:1.7;">{{tourLinkHtml}}</div>`
      ),
      bodyHtml: `
        <p style="margin:0 0 14px;">Wenn Sie den Rundgang weiterhin nutzen möchten, können Sie die Verlängerung direkt bestätigen. Ohne Verlängerung archivieren wir die Tour gemäss Ablaufdatum. Eine spätere Reaktivierung ist jederzeit wieder möglich.</p>
        <p style="margin:0;">Auf Wunsch können wir den Rundgang auch auf Ihr eigenes Matterport-Konto übertragen. Voraussetzung dafür ist mindestens ein passender Matterport-Plan.</p>
      `,
      ctaHtml: buildActionButtons([
        { href: '{{yesUrl}}', label: 'Verlängern', icon: '✓', primary: true },
        { href: '{{noUrl}}', label: 'Nicht mehr verlängern', icon: '–', primary: false },
      ]),
      noteHtml: buildInfoCallout('i', 'Hinweis', `Sie können uns auch einfach auf diese E-Mail antworten. Ihre Touren finden Sie jederzeit im Kundenportal: {{portalLinkHtml}}<br><span style="display:inline-block;margin-top:8px;"><a href="https://buy.matterport.com/de/plans" style="color:#8c6d2b;font-weight:700;">Matterport-Pläne ansehen</a></span>`),
    }),
    text: `{{customerGreeting}}

wir möchten Sie höflich darauf hinweisen, dass das Hosting Ihres virtuellen Rundgangs in Kürze zur Verlängerung ansteht.

Objekt: {{objectLabel}}
{{tourLinkText}}
Die Tour wurde erstellt am: {{createdAt}}

Sollten Sie den Rundgang weiterhin nutzen wollen, bitten wir Sie, den entsprechenden Betrag für die Verlängerung zu überweisen. Andernfalls werden wir den Rundgang archivieren. Sie haben jedoch jederzeit die Möglichkeit, den Rundgang gegen eine Gebühr von CHF {{amount}} für weitere 6 Monate erneut aktivieren zu lassen.

Alternativ bieten wir Ihnen auch die Option, den virtuellen Rundgang auf Ihr eigenes Matterport-Konto übertragen zu lassen. Voraussetzung dafür ist mindestens der Starter Plan von Matterport:
https://buy.matterport.com/de/plans

Wenn Sie verlängern oder nicht verlängern möchten, können Sie uns einfach auf diese E-Mail antworten. Alternativ können Sie direkt einen der folgenden Links verwenden:
Verlängern: {{yesUrl}}
Nicht mehr verlängern: {{noUrl}}

Falls Sie die Übertragung wünschen oder den Rundgang nicht mehr benötigen, genügt eine kurze Antwort auf diese E-Mail.

Sie können Ihre Touren jederzeit in unserem Kundenportal verwalten: {{portalLinkText}}

Vielen Dank für Ihre Zusammenarbeit.
Bei weiteren Fragen stehen wir Ihnen selbstverständlich jederzeit zur Verfügung.

Freundliche Grüsse
Ihr Propus Team`,
  },
  renewal_request_final: {
    name: 'Verlängerungs-Anfrage (letzte Erinnerung)',
    description: 'Dritte Reminder-Stufe (ca. 3 Tage vor Ablauf). Hinweis auf Reaktivierungsgebühr.',
    category: 'aktiv',
    subject: 'Letzte Erinnerung: Verlängerung – {{objectLabel}}',
    html: buildEmailFrame({
      preheader: 'Letzte Erinnerung vor Ablauf',
      title: 'Letzte Erinnerung',
      introHtml: `<p style="margin:0 0 14px;">{{customerGreeting}}</p><p style="margin:0;">Ihr virtuelles Rundgang-Hosting läuft in wenigen Tagen aus. Bitte entscheiden Sie sich für eine Verlängerung oder teilen Sie uns mit, wenn wir nicht mehr benötigt werden.</p>`,
      summaryHtml: buildSummaryCard(
        [
          { label: 'Objekt', value: '{{objectLabel}}' },
          { label: 'Ablauf', value: '{{termEndFormatted}}' },
          { label: 'Hinweis', value: 'Nach Ablauf kostet eine Reaktivierung CHF 15 zusätzlich zum regulären Hosting.' },
        ],
        `<div style="padding-top:2px;color:#4b5563;font-size:14px;line-height:1.7;">{{tourLinkHtml}}</div>`
      ),
      bodyHtml: `<p style="margin:0 0 14px;">Sie können verlängern, ablehnen oder eine Übertragung auf Ihr Matterport-Konto anfragen.</p>`,
      ctaHtml: buildActionButtons([
        { href: '{{yesUrl}}', label: 'Verlängern', icon: '✓', primary: true },
        { href: '{{noUrl}}', label: 'Nicht mehr verlängern', icon: '–', primary: false },
      ]),
      noteHtml: buildInfoCallout('i', 'Portal', `Ihre Touren: {{portalLinkHtml}}`),
    }),
    text: `{{customerGreeting}}

letzte Erinnerung: Ihr Rundgang läuft am {{termEndFormatted}} aus.
Nach Ablauf kostet eine Reaktivierung CHF 15 zusätzlich.

Objekt: {{objectLabel}}
{{tourLinkText}}

Verlängern: {{yesUrl}}
Nicht verlängern: {{noUrl}}

{{portalLinkText}}`,
  },
  tour_confirmation_request: {
    name: 'Tour-Bestätigung (Bereinigungslauf)',
    description: 'Manueller Bereinigungslauf: Kunde soll Tour und Verlängerungswunsch bestätigen. Versand folgt später.',
    category: 'vorbereitet',
    subject: 'Bitte bestätigen: Ihre Tour {{objectLabel}}',
    html: buildEmailFrame({
      preheader: 'Bitte bestätigen Sie Ihre Tour',
      title: 'Ist das Ihre Tour?',
      introHtml: `<p style="margin:0 0 14px;">{{customerGreeting}}</p><p style="margin:0;">Wir möchten sicherstellen, dass diese Tour noch zu Ihnen gehört und ob Sie eine Verlängerung wünschen.</p>`,
      summaryHtml: buildSummaryCard([{ label: 'Objekt', value: '{{objectLabel}}' }], `{{tourLinkHtml}}`),
      ctaHtml: buildActionButtons([
        { href: '{{yesUrl}}', label: 'Ja, verlängern', icon: '✓', primary: true },
        { href: '{{noUrl}}', label: 'Nein', icon: '–', primary: false },
      ]),
    }),
    text: `{{customerGreeting}}

Bitte bestätigen Sie, ob diese Tour Ihnen gehört und ob Sie verlängern möchten.

Objekt: {{objectLabel}}
{{tourLinkText}}

Ja: {{yesUrl}}
Nein: {{noUrl}}`,
  },
  payment_confirmed: {
    name: 'Zahlungsbestätigung',
    description: 'Wird nach erfolgreicher Payrexx-Zahlung an den Kunden geschickt.',
    category: 'aktiv',
    subject: 'Zahlung erhalten – Ihr virtueller Rundgang wurde verlängert',
    html: buildEmailFrame({
      preheader: 'Zahlung erhalten und Laufzeit verlängert',
      title: 'Zahlung erfolgreich erhalten',
      introHtml: `<p style="margin:0 0 14px;">{{customerGreeting}}</p><p style="margin:0;">vielen Dank für Ihre Zahlung. Wir bestätigen hiermit, dass Ihr virtueller Rundgang erfolgreich verlängert wurde.</p>`,
      summaryHtml: buildSummaryCard(
        [
          { label: 'Objekt', value: '{{objectLabel}}' },
          { label: 'Gültig bis', value: '{{termEndFormatted}}' },
        ],
        `<div style="padding-top:2px;color:#4b5563;font-size:14px;line-height:1.7;">{{tourLinkHtml}}</div>`
      ),
      noteHtml: buildInfoCallout('✓', 'Alles erledigt', 'Ihre Tour ist wieder vollständig aktiv. Sie können Ihre Touren jederzeit im Kundenportal einsehen: {{portalLinkHtml}}'),
    }),
    text: `{{customerGreeting}}

vielen Dank für Ihre Zahlung. Wir bestätigen hiermit, dass Ihr virtueller Rundgang erfolgreich verlängert wurde.

Objekt: {{objectLabel}}
Gültig bis: {{termEndFormatted}}
{{tourLinkText}}

Sie können Ihre Touren jederzeit in unserem Kundenportal verwalten: {{portalLinkText}}

Bei Fragen stehen wir Ihnen gerne zur Verfügung.

Freundliche Grüsse
Ihr Propus Team`,
  },
  expiry_reminder: {
    name: 'Ablauf-Erinnerung',
    description: 'Vorlage für Erinnerungen kurz vor Ablauf einer Tour.',
    category: 'vorbereitet',
    subject: 'Erinnerung: Ihr virtueller Rundgang läuft bald ab – {{objectLabel}}',
    html: buildEmailFrame({
      preheader: 'Erinnerung vor Ablauf Ihres Rundgangs',
      title: 'Erinnerung vor Ablauf',
      introHtml: `<p style="margin:0 0 14px;">{{customerGreeting}}</p><p style="margin:0;">dies ist eine kurze Erinnerung: Ihr virtueller Rundgang läuft am <strong>{{termEndFormatted}}</strong> ab.</p>`,
      summaryHtml: buildSummaryCard(
        [{ label: 'Objekt', value: '{{objectLabel}}' }],
        `<div style="padding-top:2px;color:#4b5563;font-size:14px;line-height:1.7;">{{tourLinkHtml}}</div>`
      ),
      noteHtml: buildInfoCallout('⏰', 'Empfehlung', 'Falls Sie verlängern möchten, antworten Sie einfach auf diese E-Mail oder nutzen Sie Ihre vorhandenen Verlängerungs-Links. Überblick im Portal: {{portalLinkHtml}}'),
    }),
    text: `{{customerGreeting}}

dies ist eine kurze Erinnerung: Ihr virtueller Rundgang läuft am {{termEndFormatted}} ab.

Objekt: {{objectLabel}}
{{tourLinkText}}

Falls Sie verlängern möchten, antworten Sie einfach auf diese E-Mail oder verwenden Sie Ihren Verlängerungs-Link.

Sie können Ihre Touren jederzeit in unserem Kundenportal verwalten: {{portalLinkText}}

Freundliche Grüsse
Ihr Propus Team`,
  },
  portal_invoice_sent: {
    name: 'Rechnung per QR-Einzahlungsschein',
    description: 'E-Mail an Kunden, wenn er die Zahlung per QR-Einzahlungsschein gewählt hat. Die PDF-Rechnung wird als Anhang mitgeschickt.',
    category: 'vorbereitet',
    subject: 'Rechnung – {{actionLabel}} Ihres Rundgangs – {{objectLabel}}',
    html: buildEmailFrame({
      preheader: 'Ihre Rechnung als PDF im Anhang',
      title: 'Rechnung erhalten',
      introHtml: `<p style="margin:0 0 14px;">{{customerGreeting}}</p><p style="margin:0;">Im Anhang finden Sie Ihre Rechnung für die {{actionLabel}} Ihres virtuellen Rundgangs. Bitte begleichen Sie den Betrag mit dem beiliegenden QR-Einzahlungsschein.</p>`,
      summaryHtml: buildSummaryCard(
        [
          { label: 'Objekt', value: '{{objectLabel}}' },
          { label: 'Betrag', value: 'CHF {{amountCHF}}' },
          { label: 'Fällig bis', value: '{{dueDateFormatted}}' },
        ],
        `<div style="padding-top:2px;color:#4b5563;font-size:14px;line-height:1.7;">{{tourLinkHtml}}</div>`
      ),
      noteHtml: buildInfoCallout('✓', 'Freischaltung', 'Ihre Tour ist bereits aktiv. Bitte begleichen Sie die Rechnung innerhalb der Zahlungsfrist. Rechnungen und Touren finden Sie jederzeit im Kundenportal: {{portalLinkHtml}}'),
    }),
    text: `{{customerGreeting}}

Im Anhang finden Sie Ihre Rechnung für die {{actionLabel}} Ihres virtuellen Rundgangs.
Bitte begleichen Sie den Betrag von CHF {{amountCHF}} bis {{dueDateFormatted}} mit dem beiliegenden QR-Einzahlungsschein.

Objekt: {{objectLabel}}
Betrag: CHF {{amountCHF}}
Fällig bis: {{dueDateFormatted}}
{{tourLinkText}}

Die Tour wird nach Eingang Ihrer Zahlung aktiviert.
Ihre Touren und Rechnungen finden Sie im Kundenportal: {{portalLinkText}}

Freundliche Grüsse
Ihr Propus Team`,
  },
  extension_confirmed: {
    name: 'Verlängerung bestätigt',
    description: 'Vorlage für eine Bestätigung nach einer normalen Verlängerung.',
    category: 'vorbereitet',
    subject: 'Ihre Tour wurde verlängert – {{objectLabel}}',
    html: buildEmailFrame({
      preheader: 'Ihre Tour wurde erfolgreich verlängert',
      title: 'Verlängerung bestätigt',
      introHtml: `<p style="margin:0 0 14px;">{{customerGreeting}}</p><p style="margin:0;">Ihre Tour wurde erfolgreich verlängert.</p>`,
      summaryHtml: buildSummaryCard(
        [
          { label: 'Objekt', value: '{{objectLabel}}' },
          { label: 'Neue Laufzeit bis', value: '{{termEndFormatted}}' },
        ],
        `<div style="padding-top:2px;color:#4b5563;font-size:14px;line-height:1.7;">{{tourLinkHtml}}</div>`
      ),
      noteHtml: buildInfoCallout('✓', 'Portal', 'Ihre Touren und Rechnungen finden Sie jederzeit im Kundenportal: {{portalLinkHtml}}'),
    }),
    text: `{{customerGreeting}}

Ihre Tour wurde erfolgreich verlängert.

Objekt: {{objectLabel}}
Neue Laufzeit bis: {{termEndFormatted}}
{{tourLinkText}}

Sie können Ihre Touren jederzeit in unserem Kundenportal verwalten: {{portalLinkText}}

Freundliche Grüsse
Ihr Propus Team`,
  },
  reactivation_confirmed: {
    name: 'Reaktivierung bestätigt',
    description: 'Vorlage für eine Bestätigung nach der Reaktivierung einer archivierten Tour.',
    category: 'vorbereitet',
    subject: 'Ihre Tour wurde reaktiviert – {{objectLabel}}',
    html: buildEmailFrame({
      preheader: 'Ihre archivierte Tour ist wieder aktiv',
      title: 'Reaktivierung bestätigt',
      introHtml: `<p style="margin:0 0 14px;">{{customerGreeting}}</p><p style="margin:0;">Ihre archivierte Tour wurde erfolgreich reaktiviert und ist wieder verfügbar.</p>`,
      summaryHtml: buildSummaryCard(
        [
          { label: 'Objekt', value: '{{objectLabel}}' },
          { label: 'Aktiv bis', value: '{{termEndFormatted}}' },
        ],
        `<div style="padding-top:2px;color:#4b5563;font-size:14px;line-height:1.7;">{{tourLinkHtml}}</div>`
      ),
      noteHtml: buildInfoCallout('↺', 'Status', 'Die Tour ist wieder aktiv. Weitere Einstellungen und Rechnungen finden Sie im Kundenportal: {{portalLinkHtml}}'),
    }),
    text: `{{customerGreeting}}

Ihre archivierte Tour wurde erfolgreich reaktiviert.

Objekt: {{objectLabel}}
Aktiv bis: {{termEndFormatted}}
{{tourLinkText}}

Sie können Ihre Touren jederzeit in unserem Kundenportal verwalten: {{portalLinkText}}

Freundliche Grüsse
Ihr Propus Team`,
  },
  archive_notice: {
    name: 'Archivierungs-Mitteilung',
    description: 'Vorlage für die Mitteilung, dass eine Tour archiviert wurde.',
    category: 'vorbereitet',
    subject: 'Ihre Tour wurde archiviert – {{objectLabel}}',
    html: buildEmailFrame({
      preheader: 'Ihre Tour wurde archiviert',
      title: 'Tour archiviert',
      introHtml: `<p style="margin:0 0 14px;">{{customerGreeting}}</p><p style="margin:0;">Ihre Tour wurde archiviert und ist aktuell nicht mehr öffentlich erreichbar.</p>`,
      summaryHtml: buildSummaryCard([{ label: 'Objekt', value: '{{objectLabel}}' }]),
      noteHtml: buildInfoCallout('i', 'Wieder aktivieren', 'Falls Sie die Tour wieder aktivieren möchten, melden Sie sich bitte bei uns. Im Kundenportal behalten Sie jederzeit den Überblick: {{portalLinkHtml}}'),
    }),
    text: `{{customerGreeting}}

Ihre Tour wurde archiviert und ist aktuell nicht mehr öffentlich erreichbar.

Objekt: {{objectLabel}}

Falls Sie die Tour wieder aktivieren möchten, melden Sie sich bitte bei uns.

Sie können Ihre Touren jederzeit in unserem Kundenportal verwalten: {{portalLinkText}}

Freundliche Grüsse
Ihr Propus Team`,
  },
  payment_failed: {
    name: 'Zahlung fehlgeschlagen',
    description: 'Vorlage für einen Hinweis bei abgebrochener oder fehlgeschlagener Zahlung.',
    category: 'vorbereitet',
    subject: 'Ihre Zahlung konnte nicht abgeschlossen werden – {{objectLabel}}',
    html: buildEmailFrame({
      preheader: 'Zahlung konnte nicht abgeschlossen werden',
      title: 'Zahlung fehlgeschlagen',
      introHtml: `<p style="margin:0 0 14px;">{{customerGreeting}}</p><p style="margin:0;">Ihre Zahlung konnte leider nicht erfolgreich abgeschlossen werden.</p>`,
      summaryHtml: buildSummaryCard([{ label: 'Objekt', value: '{{objectLabel}}' }]),
      noteHtml: buildInfoCallout('!', 'Nächster Schritt', 'Bitte versuchen Sie es erneut oder kontaktieren Sie uns, falls Sie Unterstützung benötigen. Überblick im Kundenportal: {{portalLinkHtml}}'),
    }),
    text: `{{customerGreeting}}

Ihre Zahlung konnte leider nicht erfolgreich abgeschlossen werden.

Objekt: {{objectLabel}}

Bitte versuchen Sie es erneut oder kontaktieren Sie uns, falls Sie Unterstützung benötigen.

Sie können Ihre Touren jederzeit in unserem Kundenportal verwalten: {{portalLinkText}}

Freundliche Grüsse
Ihr Propus Team`,
  },
  invoice_overdue_reminder: {
    name: 'Zahlungserinnerung (offene Rechnung)',
    description: 'Erinnerung bei überfälliger QR-Rechnung. Wird einmal automatisch versendet, wenn die Zahlungsfrist abgelaufen ist. Bei weiterhin offener Rechnung nach 30 Tagen wird die Tour archiviert. Eine spätere Reaktivierung kostet CHF {{reactivationPriceCHF}}.',
    category: 'vorbereitet',
    subject: 'Zahlungserinnerung – {{objectLabel}}',
    html: buildEmailFrame({
      preheader: 'Ihre Rechnung ist noch offen',
      title: 'Zahlungserinnerung',
      introHtml: `<p style="margin:0 0 14px;">{{customerGreeting}}</p><p style="margin:0;">wir möchten Sie freundlich daran erinnern, dass die Rechnung für Ihren virtuellen Rundgang noch offen ist. Bitte begleichen Sie den ausstehenden Betrag so bald wie möglich — Ihre Tour ist weiterhin aktiv.</p>`,
      summaryHtml: buildSummaryCard(
        [
          { label: 'Objekt', value: '{{objectLabel}}' },
          { label: 'Offener Betrag', value: 'CHF {{amountCHF}}' },
          { label: 'Fällig am', value: '{{dueDateFormatted}}' },
        ],
        `<div style="padding-top:2px;color:#4b5563;font-size:14px;line-height:1.7;">{{tourLinkHtml}}</div>`
      ),
      noteHtml: buildInfoCallout('⚠', 'Wichtiger Hinweis', 'Falls die Zahlung ausbleibt, wird Ihre Tour nach 30 Tagen automatisch archiviert. Eine erneute Reaktivierung ist jederzeit möglich, kostet jedoch CHF {{reactivationPriceCHF}} (inkl. Reaktivierungsgebühr). Ihre Rechnungen und Touren: {{portalLinkHtml}}'),
    }),
    text: `{{customerGreeting}}

wir möchten Sie freundlich daran erinnern, dass die Rechnung für Ihren virtuellen Rundgang noch offen ist. Ihre Tour ist weiterhin aktiv.

Objekt: {{objectLabel}}
Offener Betrag: CHF {{amountCHF}}
Fällig am: {{dueDateFormatted}}

{{tourLinkText}}

Bitte begleichen Sie den ausstehenden Betrag so bald wie möglich.

Wichtiger Hinweis: Falls die Zahlung ausbleibt, wird Ihre Tour nach 30 Tagen automatisch archiviert. Eine erneute Reaktivierung ist jederzeit möglich, kostet jedoch CHF {{reactivationPriceCHF}} (inkl. Reaktivierungsgebühr).

Ihre Rechnungen und Touren: {{portalLinkText}}

Freundliche Grüsse
Ihr Propus Team`,
  },
  cleanup_review_request: {
    name: 'Bereinigungslauf – Prüfanfrage',
    description: 'Einmaliger Bereinigungslauf: Kunde wählt zwischen Weiterführen, Archivieren, Übertragen oder Löschen. Jeder Button führt auf eine signierte Bestätigungsseite.',
    category: 'vorbereitet',
    subject: 'Handlungsbedarf: Bitte prüfen Sie Ihre Tour – {{objectLabel}}',
    html: buildEmailFrame({
      preheader: 'Bitte prüfen Sie Ihre Tour und wählen Sie eine Aktion',
      title: 'Bitte prüfen Sie Ihre Tour',
      introHtml: `<p style="margin:0 0 14px;">{{customerGreeting}}</p><p style="margin:0;">Im Zuge einer Neuorganisation unserer Touren bitten wir Sie, die folgende Tour zu prüfen und eine Aktion zu wählen.{{statusContextHtml}}</p>`,
      summaryHtml: buildSummaryCard(
        [
          { label: 'Objekt', value: '{{objectLabel}}' },
          { label: 'Erstellt am', value: '{{createdAt}}' },
          { label: 'Abo gültig bis', value: '{{termEndFormatted}}' },
          { label: 'Archiviert am', value: '{{archivedAt}}' },
          { label: 'Status', value: '{{statusLabel}}' },
        ],
        `<div style="padding-top:2px;color:#4b5563;font-size:14px;line-height:1.7;">{{tourLinkHtml}}</div>`
      ),
      bodyHtml: `
        <div style="background:#fff;border:1px solid #ece5d7;border-radius:24px;padding:20px 24px;">
          <div style="font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#9a7619;margin-bottom:14px;">Bitte wählen Sie eine Aktion</div>

          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:10px;">
            <tr style="background:#f9fafb;border-radius:14px;">
              <td style="padding:13px 16px;border-radius:14px;border:1px solid #e5e7eb;">
                <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:2px;">&#10003;&nbsp; Weiterführen</div>
                <div style="font-size:11px;color:#6b7280;line-height:1.5;">{{weiterfuehrenHint}}</div>
              </td>
              <td style="padding:13px 16px;vertical-align:middle;white-space:nowrap;">
                <a href="{{weiterfuehrenUrl}}" style="display:inline-block;padding:9px 18px;border-radius:999px;background:linear-gradient(135deg,#B68E20 0%,#7a6318 100%);color:#fff;text-decoration:none;font-size:12px;font-weight:700;">Weiterführen</a>
              </td>
            </tr>
          </table>

          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:10px;">
            <tr style="background:#fffbeb;border-radius:14px;">
              <td style="padding:13px 16px;border-radius:14px;border:1px solid #fcd34d;">
                <div style="font-size:13px;font-weight:700;color:#92400e;margin-bottom:2px;">&#128193;&nbsp; Archivieren</div>
                <div style="font-size:11px;color:#b45309;line-height:1.5;">Tour wird deaktiviert und archiviert<br>
                  <span style="display:inline-block;margin-top:6px;padding:6px 10px;background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;color:#92400e;">
                    &#9888;&#65039; <strong>Kostenhinweis:</strong> Eine Reaktivierung ist kostenpflichtig.<br>
                    Abo-Plan: <strong>CHF 59.– / 6 Monate</strong> + Reaktivierungsgebühr: <strong>CHF 15.–</strong>
                  </span>
                </div>
              </td>
              <td style="padding:13px 16px;vertical-align:top;white-space:nowrap;padding-top:13px;">
                <a href="{{archivierenUrl}}" style="display:inline-block;padding:9px 18px;border-radius:999px;background:#d97706;color:#fff;text-decoration:none;font-size:12px;font-weight:700;">Archivieren</a>
              </td>
            </tr>
          </table>

          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:10px;">
            <tr style="background:#f0f7ff;border-radius:14px;">
              <td style="padding:13px 16px;border-radius:14px;border:1px solid #bfdbfe;">
                <div style="font-size:13px;font-weight:700;color:#1e40af;margin-bottom:2px;">&#8599;&nbsp; Übertragen</div>
                <div style="font-size:11px;color:#3b82f6;line-height:1.5;">Tour auf anderes Matterport-Konto übertragen<br>
                  <span style="color:#6b7280;">Nur mit Matterport Pro Plan möglich</span>
                </div>
              </td>
              <td style="padding:13px 16px;vertical-align:top;white-space:nowrap;padding-top:13px;">
                <a href="{{uebertragungUrl}}" style="display:inline-block;padding:9px 18px;border-radius:999px;background:#1d4ed8;color:#fff;text-decoration:none;font-size:12px;font-weight:700;">Übertragen</a>
              </td>
            </tr>
          </table>

          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
            <tr style="background:#fff5f5;border-radius:14px;">
              <td style="padding:13px 16px;border-radius:14px;border:1px solid #fca5a5;">
                <div style="font-size:13px;font-weight:700;color:#b91c1c;margin-bottom:2px;">&#10005;&nbsp; Löschen</div>
                <div style="font-size:11px;color:#ef4444;line-height:1.5;">Permanent löschen – auch in Matterport<br>
                  <strong style="font-size:11px;color:#b91c1c;">Nicht wiederherstellbar</strong>
                </div>
              </td>
              <td style="padding:13px 16px;vertical-align:top;white-space:nowrap;padding-top:13px;">
                <a href="{{loeschenUrl}}" style="display:inline-block;padding:9px 18px;border-radius:999px;background:#dc2626;color:#fff;text-decoration:none;font-size:12px;font-weight:700;">Löschen</a>
              </td>
            </tr>
          </table>
        </div>
      `,
      noteHtml: buildInfoCallout('&#9993;', 'Direktnachricht ans Propus Team', 'Haben Sie Fragen oder Anmerkungen? Antworten Sie direkt auf diese E-Mail – wir melden uns so bald wie möglich.'),
    }),
    text: `{{customerGreeting}}

Im Zuge einer Neuorganisation unserer Touren bitten wir Sie, die folgende Tour zu prüfen und eine Aktion zu wählen.
{{statusContextText}}

Objekt: {{objectLabel}}
Erstellt am: {{createdAt}}
Abo gültig bis: {{termEndFormatted}}
{{archivedAtText}}{{tourLinkText}}

Bitte wählen Sie eine Aktion:

✓ Weiterführen – {{weiterfuehrenHint}}
{{weiterfuehrenUrl}}

📁 Archivieren (Tour wird deaktiviert und archiviert; Reaktivierung kostet CHF 74.–)
{{archivierenUrl}}

↗ Übertragen (Tour auf anderes Matterport-Konto; nur mit Pro Plan)
{{uebertragungUrl}}

✕ Löschen (permanent, nicht wiederherstellbar)
{{loeschenUrl}}

Bei Fragen antworten Sie direkt auf diese E-Mail.

Freundliche Grüsse
Ihr Propus Team`,
  },
  cleanup_thankyou: {
    name: 'Bereinigungslauf – Dankeschön & Gutschein',
    description: 'Wird automatisch gesendet, sobald ein Kunde alle seine Touren im Cleanup-Dashboard bearbeitet hat. Enthält einen einmaligen 10%-Gutscheincode für booking.propus.ch.',
    category: 'vorbereitet',
    subject: 'Vielen Dank – Ihr persönlicher Gutscheincode',
    html: buildEmailFrame({
      preheader: 'Herzlichen Dank für Ihre Rückmeldung – hier ist Ihr persönlicher 10%-Gutschein',
      title: 'Vielen Dank für Ihre Rückmeldung!',
      introHtml: `<p style="margin:0 0 14px;">{{customerGreeting}}</p><p style="margin:0;">herzlichen Dank, dass Sie sich die Zeit genommen haben, alle Ihre Touren zu prüfen und zu bearbeiten. Als kleines Dankeschön schenken wir Ihnen einen persönlichen Gutschein für Ihre nächste Buchung auf <a href="https://booking.propus.ch" style="color:#8a6c18;font-weight:700;">booking.propus.ch</a>.</p>`,
      summaryHtml: buildSummaryCard([
        { label: 'Ihr Code', value: '<span style="font-family:monospace;font-size:22px;font-weight:700;letter-spacing:0.12em;color:#1a1a1a;background:#f5edde;padding:4px 12px;border-radius:8px;display:inline-block;">{{voucherCode}}</span>' },
        { label: 'Rabatt', value: '<strong>10 % auf Ihre nächste Buchung</strong>' },
        { label: 'Gültig bis', value: '{{validTo}}' },
        { label: 'Einlösbar auf', value: '<a href="https://booking.propus.ch" style="color:#8a6c18;font-weight:700;">booking.propus.ch</a>' },
      ]),
      bodyHtml: `<p style="margin:0 0 10px;">Geben Sie den Code beim Buchungsabschluss einfach im Feld <em>«Gutschein / Rabattcode»</em> ein — der Rabatt wird sofort abgezogen.</p>`,
      noteHtml: buildInfoCallout('ℹ️', 'Hinweis', 'Der Code ist einmalig verwendbar und gilt für eine Buchung auf booking.propus.ch.'),
    }),
    text: `{{customerGreeting}}

herzlichen Dank, dass Sie sich die Zeit genommen haben, alle Ihre Touren zu prüfen. Als Dankeschön erhalten Sie einen persönlichen 10%-Gutschein:

Ihr Code: {{voucherCode}}
Rabatt: 10 % auf Ihre nächste Buchung
Gültig bis: {{validTo}}
Einlösbar auf: https://booking.propus.ch

Geben Sie den Code beim Buchungsabschluss im Feld «Gutschein / Rabattcode» ein.

Freundliche Grüsse
Ihr Propus Team`,
  },
  team_invite: {
    name: 'Team-Einladung Admin',
    description: 'Einladung für neue Team-Mitglieder mit Admin-Zugang.',
    category: 'intern',
    subject: 'Einladung zum Admin-Team – {{appName}}',
    html: buildEmailFrame({
      preheader: 'Einladung zum Admin-Team',
      title: 'Einladung zum Admin-Team',
      introHtml: `<p style="margin:0 0 14px;">Guten Tag,</p><p style="margin:0;">Sie wurden von <strong>{{invitedByEmail}}</strong> zum Admin-Team eingeladen.</p>`,
      summaryHtml: buildSummaryCard([
        { label: 'Anwendung', value: '{{appName}}' },
        { label: 'Einladung durch', value: '{{invitedByEmail}}' },
      ]),
      ctaHtml: buildActionButtons([
        { href: '{{inviteLink}}', label: 'Zugang einrichten', icon: '→', primary: true },
      ]),
      noteHtml: buildInfoCallout('i', 'Sicherheit', 'Falls Sie diese Einladung nicht erwarten, können Sie diese E-Mail ignorieren.'),
    }),
    text: `Guten Tag,

Sie wurden von {{invitedByEmail}} zum Admin-Team eingeladen.

Bitte richten Sie Ihren Zugang über folgenden Link ein:
{{inviteLink}}

Falls Sie diese Einladung nicht erwarten, können Sie diese E-Mail ignorieren.

Freundliche Grüsse
Ihr Propus Team`,
  },
};

// ─── Rechnungsvorlage / Creditor-Einstellungen ────────────────────────────────

const DEFAULT_INVOICE_CREDITOR = {
  name: 'Propus GmbH',
  street: 'Untere Roostmatt',
  buildingNumber: '8',
  zip: '6300',
  city: 'Zug',
  country: 'CH',
  iban: 'CH13 3000 5204 1906 0401 W',
  email: 'office@propus.ch',
  phone: '+41 44 589 63 63',
  website: 'propus.ch',
  vatId: 'CHE-424.310.597',
  footerNote: 'Vielen Dank für Ihr Vertrauen. Bei Fragen stehen wir gerne zur Verfügung.',
};

async function getInvoiceCreditor() {
  try {
    await ensureSettingsTable();
    const r = await pool.query(
      `SELECT value FROM tour_manager.settings WHERE key = 'invoice_creditor'`
    );
    if (r.rows[0]?.value && typeof r.rows[0].value === 'object') {
      return { ...DEFAULT_INVOICE_CREDITOR, ...r.rows[0].value };
    }
  } catch (e) {
    console.warn('getInvoiceCreditor:', e.message);
  }
  return { ...DEFAULT_INVOICE_CREDITOR };
}

async function saveInvoiceCreditor(data) {
  try {
    await ensureSettingsTable();
    const current = await getInvoiceCreditor();
    const value = { ...current };
    const allowed = ['name','street','buildingNumber','zip','city','country','iban','email','phone','website','vatId','footerNote'];
    for (const key of allowed) {
      if (data[key] !== undefined) value[key] = String(data[key] ?? '').trim();
    }
    await pool.query(
      `INSERT INTO tour_manager.settings (key, value, updated_at)
       VALUES ('invoice_creditor', $1::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = NOW()`,
      [JSON.stringify(value)]
    );
    return value;
  } catch (e) {
    console.warn('saveInvoiceCreditor:', e.message);
    throw e;
  }
}

async function getEmailTemplates() {
  try {
    await ensureSettingsTable();
    const r = await pool.query(
      `SELECT value FROM tour_manager.settings WHERE key = 'email_templates'`
    );
    if (r.rows[0]?.value && typeof r.rows[0].value === 'object') {
      const stored = r.rows[0].value;
      const result = {};
      for (const key of Object.keys(DEFAULT_EMAIL_TEMPLATES)) {
        result[key] = {
          ...DEFAULT_EMAIL_TEMPLATES[key],
          ...(stored[key] || {}),
        };
      }
      return result;
    }
  } catch (e) {
    console.warn('getEmailTemplates:', e.message);
  }
  return { ...DEFAULT_EMAIL_TEMPLATES };
}

async function saveEmailTemplates(templates) {
  try {
    await ensureSettingsTable();
    const current = await getEmailTemplates();
    const value = {};
    for (const key of Object.keys(DEFAULT_EMAIL_TEMPLATES)) {
      const t = templates[key] || current[key];
      value[key] = {
        ...DEFAULT_EMAIL_TEMPLATES[key],
        subject: t?.subject !== undefined ? String(t.subject) : (current[key]?.subject ?? DEFAULT_EMAIL_TEMPLATES[key].subject),
        html: t?.html !== undefined ? String(t.html) : (current[key]?.html ?? DEFAULT_EMAIL_TEMPLATES[key].html),
        text: t?.text !== undefined ? String(t.text) : (current[key]?.text ?? DEFAULT_EMAIL_TEMPLATES[key].text),
      };
    }
    await pool.query(
      `INSERT INTO tour_manager.settings (key, value, updated_at)
       VALUES ('email_templates', $1::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = NOW()`,
      [JSON.stringify(value)]
    );
    return true;
  } catch (e) {
    console.warn('saveEmailTemplates:', e.message);
    return false;
  }
}

module.exports = {
  getDashboardWidgets,
  saveDashboardWidgets,
  getAiPromptSettings,
  getInvoiceCreditor,
  saveInvoiceCreditor,
  DEFAULT_INVOICE_CREDITOR,
  saveAiPromptSettings,
  getMatterportApiCredentials,
  saveMatterportApiCredentials,
  getExxasRuntimeConfig,
  saveExxasRuntimeConfig,
  getAutomationSettings,
  saveAutomationSettings,
  getEmailTemplates,
  saveEmailTemplates,
  DEFAULT_AUTOMATION_SETTINGS,
  DEFAULT_EMAIL_TEMPLATES,
  buildEmailFrame,
  buildSummaryCard,
  buildInfoCallout,
  buildActionButtons,
};
