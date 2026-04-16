/**
 * Zentrales RBAC: Subjects, Systemrollen, Gruppen, effektive Permissions.
 */
const db = require("./db");

const ALL_PERMISSION_KEYS = [
  "tours.read",
  "tours.manage",
  "tours.assign",
  "tours.cross_company",
  "tours.archive",
  "tours.link_matterport",
  "dashboard.view",
  "orders.read",
  "orders.create",
  "orders.update",
  "orders.delete",
  "orders.assign",
  "orders.export",
  "customers.read",
  "customers.manage",
  "contacts.read",
  "contacts.manage",
  "photographers.read",
  "photographers.manage",
  "products.manage",
  "discount_codes.manage",
  "listing.manage",
  "picdrop.manage",
  "calendar.view",
  "calendar.manage",
  "finance.read",
  "finance.manage",
  "tickets.read",
  "tickets.manage",
  "settings.manage",
  "emails.manage",
  "billing.read",
  "backups.manage",
  "bugs.read",
  "bugs.manage",
  "reviews.manage",
  "roles.manage",
  "users.manage",
];

const TOURS_INTERNAL_PERMS = [
  "tours.read",
  "tours.manage",
  "tours.assign",
  "tours.cross_company",
  "tours.archive",
  "tours.link_matterport",
];

const ROLE_PRESETS = {
  super_admin: ALL_PERMISSION_KEYS,
  internal_admin: ALL_PERMISSION_KEYS,
  tour_manager: [
    ...TOURS_INTERNAL_PERMS,
    "dashboard.view",
    "finance.read",
    "finance.manage",
    "tickets.read",
    "tickets.manage",
    "listing.manage",
  ],
  photographer: [
    "dashboard.view",
    "orders.read",
    "orders.update",
    "orders.assign",
    "calendar.view",
    "photographers.read",
    "picdrop.manage",
  ],
};

function mapAdminDbRoleToSystemRole(dbRole) {
  const r = String(dbRole || "").trim();
  if (r === "super_admin") return "super_admin";
  if (r === "admin" || r === "employee") return "internal_admin";
  return "internal_admin";
}

async function tableExists(tableName) {
  try {
    const { rows } = await db.query(
      `SELECT 1
         FROM information_schema.tables
        WHERE table_name = $1
          AND table_schema = ANY (current_schemas(false))
        LIMIT 1`,
      [tableName]
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function seedRbacIfNeeded() {
  if (!(await tableExists("permission_definitions"))) return { skipped: true };

  for (const key of ALL_PERMISSION_KEYS) {
    await db.query(
      `INSERT INTO permission_definitions (permission_key, description, module_tag) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [key, key, ""]
    );
  }

  const roleMeta = [
    ["super_admin", "Super-Admin", "Voller Zugriff"],
    ["internal_admin", "Interner Admin", "Admin-Panel"],
    ["tour_manager", "Tour-Manager (intern)", "Alle Touren firmenuebergreifend"],
    ["photographer", "Fotograf", "Auftraege und Kalender"],
  ];
  for (const [rk, label, desc] of roleMeta) {
    await db.query(
      `INSERT INTO system_roles (role_key, label, description) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [rk, label, desc]
    );
  }

  for (const [rk, keys] of Object.entries(ROLE_PRESETS)) {
    for (const pk of keys) {
      await db.query(
        `INSERT INTO system_role_permissions (role_key, permission_key) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [rk, pk]
      );
    }
  }

  return { seeded: true };
}

async function getSubjectByAdminUserId(adminUserId) {
  const { rows } = await db.query(`SELECT id FROM access_subjects WHERE admin_user_id = $1 LIMIT 1`, [
    Number(adminUserId),
  ]);
  return rows[0] || null;
}

async function ensureAdminUserSubject(adminUserId) {
  const id = Number(adminUserId);
  if (!Number.isFinite(id)) return null;
  let row = await getSubjectByAdminUserId(id);
  if (row) return row.id;
  const ins = await db.query(
    `INSERT INTO access_subjects (subject_type, admin_user_id) VALUES ('admin_user', $1) RETURNING id`,
    [id]
  );
  return ins.rows[0]?.id || null;
}

async function ensurePhotographerSubject(photographerKey) {
  const key = String(photographerKey || "").trim();
  if (!key) return null;
  const { rows } = await db.query(`SELECT id FROM access_subjects WHERE photographer_key = $1 LIMIT 1`, [key]);
  if (rows[0]) return rows[0].id;
  const ins = await db.query(
    `INSERT INTO access_subjects (subject_type, photographer_key) VALUES ('photographer', $1) RETURNING id`,
    [key]
  );
  return ins.rows[0]?.id || null;
}

async function ensureCustomerSubject(customerId) {
  const id = Number(customerId);
  if (!Number.isFinite(id)) return null;
  const { rows } = await db.query(`SELECT id FROM access_subjects WHERE customer_id = $1 LIMIT 1`, [id]);
  if (rows[0]) return rows[0].id;
  const ins = await db.query(
    `INSERT INTO access_subjects (subject_type, customer_id) VALUES ('customer', $1) RETURNING id`,
    [id]
  );
  return ins.rows[0]?.id || null;
}

async function ensureCustomerContactSubject(contactId) {
  const id = Number(contactId);
  if (!Number.isFinite(id)) return null;
  const { rows } = await db.query(`SELECT id FROM access_subjects WHERE customer_contact_id = $1 LIMIT 1`, [id]);
  if (rows[0]) return rows[0].id;
  const ins = await db.query(
    `INSERT INTO access_subjects (subject_type, customer_contact_id) VALUES ('customer_contact', $1) RETURNING id`,
    [id]
  );
  return ins.rows[0]?.id || null;
}

async function addSubjectSystemRole(subjectId, roleKey) {
  const sid = Number(subjectId);
  const rk = String(roleKey || "").trim();
  if (!Number.isFinite(sid) || !rk) return;
  await db.query(
    `INSERT INTO access_subject_system_roles (subject_id, role_key) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [sid, rk]
  );
}

async function removeSubjectSystemRole(subjectId, roleKey) {
  const sid = Number(subjectId);
  const rk = String(roleKey || "").trim();
  if (!Number.isFinite(sid) || !rk) return;
  await db.query(`DELETE FROM access_subject_system_roles WHERE subject_id = $1 AND role_key = $2`, [sid, rk]);
}

async function setSubjectSystemRoles(subjectId, roleKeys) {
  const sid = Number(subjectId);
  if (!Number.isFinite(sid)) return;
  await db.query(`DELETE FROM access_subject_system_roles WHERE subject_id = $1`, [sid]);
  for (const rk of roleKeys) {
    await db.query(`INSERT INTO access_subject_system_roles (subject_id, role_key) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
      sid,
      String(rk),
    ]);
  }
}

function groupAppliesToContext(group, ctx) {
  if (!group) return false;
  if (group.scope_type === "system") return ctx.scopeType === "system";
  if (group.scope_type === "customer") {
    return ctx.scopeType === "customer" && Number(group.scope_customer_id) === Number(ctx.customerId);
  }
  return false;
}

function overrideApplies(row, ctx) {
  const st = String(row.scope_type || "system");
  if (st === "system") return ctx.scopeType === "system";
  if (st === "customer") {
    return ctx.scopeType === "customer" && Number(row.scope_customer_id) === Number(ctx.customerId);
  }
  return false;
}

async function getEffectivePermissions(subjectId, ctx) {
  const sid = Number(subjectId);
  if (!Number.isFinite(sid)) return new Set();
  if (!(await tableExists("access_subjects"))) return new Set(ALL_PERMISSION_KEYS);

  const perms = new Set();

  const { rows: roleRows } = await db.query(
    `SELECT srp.permission_key
     FROM access_subject_system_roles asr
     JOIN system_role_permissions srp ON srp.role_key = asr.role_key
     WHERE asr.subject_id = $1`,
    [sid]
  );
  for (const r of roleRows) {
    if (r.permission_key) perms.add(String(r.permission_key));
  }

  const { rows: groups } = await db.query(
    `SELECT pg.id, pg.scope_type, pg.scope_customer_id
     FROM permission_group_members pgm
     JOIN permission_groups pg ON pg.id = pgm.group_id
     WHERE pgm.subject_id = $1`,
    [sid]
  );
  for (const g of groups) {
    if (!groupAppliesToContext(g, ctx)) continue;
    const { rows: gp } = await db.query(`SELECT permission_key FROM permission_group_permissions WHERE group_id = $1`, [
      g.id,
    ]);
    for (const x of gp) perms.add(String(x.permission_key));
  }

  const { rows: ovs } = await db.query(
    `SELECT permission_key, effect, scope_type, scope_customer_id
     FROM subject_permission_overrides
     WHERE subject_id = $1
     ORDER BY id ASC`,
    [sid]
  );
  for (const o of ovs) {
    if (!overrideApplies(o, ctx)) continue;
    if (String(o.effect) === "deny") perms.delete(String(o.permission_key));
    else perms.add(String(o.permission_key));
  }

  return perms;
}

function legacyFallbackPermissions(sessionRole) {
  const r = String(sessionRole || "");
  if (r === "super_admin" || r === "admin" || r === "employee") return new Set(ALL_PERMISSION_KEYS);
  if (r === "tour_manager") return new Set(ROLE_PRESETS.tour_manager);
  if (r === "photographer") return new Set(ROLE_PRESETS.photographer);
  return new Set();
}

async function resolveRequestAccessContext(req) {
  if (!(await tableExists("access_subjects"))) {
    return {
      subjectId: null,
      permissions: legacyFallbackPermissions(req.user?.role),
      scope: "system",
    };
  }

  const u = req.user;
  if (!u) {
    return { subjectId: null, permissions: new Set(), scope: "system" };
  }

  const sessionRole = String(u.role || "");

  if (sessionRole === "photographer" && u.id) {
    const sid = await ensurePhotographerSubject(String(u.id));
    if (!sid) {
      return {
        subjectId: null,
        permissions: legacyFallbackPermissions("photographer"),
        scope: "system",
      };
    }
    let perms = await getEffectivePermissions(sid, { scopeType: "system", customerId: null });
    if (perms.size === 0) {
      perms = legacyFallbackPermissions("photographer");
    }
    return { subjectId: sid, permissions: perms, scope: "system" };
  }

  const uid = parseInt(String(u.id || ""), 10);
  if (Number.isFinite(uid)) {
    const sid = await ensureAdminUserSubject(uid);
    if (!sid) {
      return {
        subjectId: null,
        permissions: legacyFallbackPermissions(sessionRole),
        scope: "system",
      };
    }
    let perms = await getEffectivePermissions(sid, { scopeType: "system", customerId: null });
    if (perms.size === 0) {
      perms = legacyFallbackPermissions(sessionRole);
    }
    return { subjectId: sid, permissions: perms, scope: "system" };
  }

  return {
    subjectId: null,
    permissions: legacyFallbackPermissions(sessionRole),
    scope: "system",
  };
}

async function syncAdminUserRolesFromDb(adminUserId) {
  const sid = await ensureAdminUserSubject(adminUserId);
  if (!sid) return;
  const { rows } = await db.query(`SELECT role FROM admin_users WHERE id = $1 LIMIT 1`, [Number(adminUserId)]);
  const rk = mapAdminDbRoleToSystemRole(rows[0]?.role);
  await setSubjectSystemRoles(sid, [rk]);
}

async function syncPhotographerRolesFromDb(photographerKey) {
  const sid = await ensurePhotographerSubject(photographerKey);
  if (!sid) return;
  const { rows } = await db.query(`SELECT is_admin FROM photographers WHERE key = $1 LIMIT 1`, [String(photographerKey)]);
  const isAdm = Boolean(rows[0]?.is_admin);
  await setSubjectSystemRoles(sid, [isAdm ? "internal_admin" : "photographer"]);
}

async function syncCustomerRolesFromDb(customerId) {
  const sid = await ensureCustomerSubject(customerId);
  if (!sid) return;
  await setSubjectSystemRoles(sid, []);
}

async function syncAllLegacySubjects() {
  if (!(await tableExists("access_subjects"))) return { skipped: true };
  await seedRbacIfNeeded();

  const { rows: admins } = await db.query(`SELECT id FROM admin_users`);
  for (const a of admins || []) {
    await syncAdminUserRolesFromDb(a.id);
  }

  const { rows: photogs } = await db.query(`SELECT key FROM photographers`);
  for (const p of photogs || []) {
    await syncPhotographerRolesFromDb(p.key);
  }

  return { ok: true };
}

function requirePermission(permissionKey) {
  return async (req, res, next) => {
    try {
      if (!req.effectivePermissions) {
        const ctx = await resolveRequestAccessContext(req);
        req.accessSubjectId = ctx.subjectId;
        req.effectivePermissions = ctx.permissions;
      }
      if (req.effectivePermissions.has(permissionKey)) return next();
      return res.status(403).json({ error: "Keine Berechtigung", permission: permissionKey });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "RBAC Fehler" });
    }
  };
}

module.exports = {
  ALL_PERMISSION_KEYS,
  ROLE_PRESETS,
  seedRbacIfNeeded,
  getEffectivePermissions,
  resolveRequestAccessContext,
  legacyFallbackPermissions,
  ensureAdminUserSubject,
  ensurePhotographerSubject,
  ensureCustomerSubject,
  ensureCustomerContactSubject,
  addSubjectSystemRole,
  removeSubjectSystemRole,
  setSubjectSystemRoles,
  syncAllLegacySubjects,
  syncAdminUserRolesFromDb,
  syncPhotographerRolesFromDb,
  syncCustomerRolesFromDb,
  mapAdminDbRoleToSystemRole,
  requirePermission,
  tableExists,
};
