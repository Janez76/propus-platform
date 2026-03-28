const crypto = require("crypto");

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeRole(value) {
  const role = String(value || "").trim().toLowerCase().replace(/-/g, "_");
  if (role === "company_owner" || role === "owner" || role === "hauptkontakt") return "company_owner";
  if (role === "company_admin" || role === "admin") return "company_admin";
  return "company_employee";
}

function normalizeCompanyStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (status === "ausstehend") return "ausstehend";
  if (status === "inaktiv") return "inaktiv";
  return "aktiv";
}

function toSlug(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const MANUAL_INVITE_EMAIL_DOMAIN = "invite.buchungstool.invalid";

function sanitizeCompanyInviteLoginName(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "")
    .slice(0, 64);
}

function buildSyntheticManualInviteEmail(companyId, loginSlug) {
  return `manual-c${Number(companyId)}-${loginSlug}@${MANUAL_INVITE_EMAIL_DOMAIN}`;
}

async function ensureUniqueCompanySlug(db, companyName) {
  const base = toSlug(companyName) || `firma-${Date.now()}`;
  for (let i = 0; i < 1000; i += 1) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const check = await db.query(`SELECT 1 FROM companies WHERE slug = $1 LIMIT 1`, [slug]);
    if (!check.rows[0]) return slug;
  }
  throw new Error("Konnte keinen eindeutigen Firmen-Slug erzeugen");
}

function mapCompanyRow(row, members, invitations) {
  return {
    id: Number(row.id),
    name: String(row.name || ""),
    slug: String(row.slug || ""),
    standort: String(row.standort || ""),
    notiz: String(row.notiz || ""),
    status: normalizeCompanyStatus(row.status),
    created_at: row.created_at,
    updated_at: row.updated_at,
    hauptkontakte_count: Number(row.hauptkontakte_count || 0),
    mitarbeiter_count: Number(row.mitarbeiter_count || 0),
    pending_invitations: Number(row.pending_invitations || 0),
    members,
    invitations,
  };
}

function registerAdminUsersRoutes(app, deps) {
  const { db, requireAdmin, rbac } = deps;
  const requireUsersManage = rbac.requirePermission("users.manage");

  app.get("/api/admin/users/companies", requireAdmin, requireUsersManage, async (req, res) => {
    try {
      const q = String(req.query.q || "").trim().toLowerCase();
      const rawStatus = String(req.query.status || "alle").trim().toLowerCase();
      const statusFilter = rawStatus === "alle" ? "" : normalizeCompanyStatus(rawStatus);
      const params = [];
      const whereParts = [];

      if (q) {
        params.push(`%${q}%`);
        whereParts.push(
          `(LOWER(c.name) LIKE $${params.length} OR LOWER(c.slug) LIKE $${params.length} OR LOWER(COALESCE(c.standort, '')) LIKE $${params.length})`
        );
      }
      if (statusFilter) {
        params.push(statusFilter);
        whereParts.push(`COALESCE(c.status, 'aktiv') = $${params.length}`);
      }
      const where = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

      const companiesResult = await db.query(
        `SELECT c.id, c.name, c.slug, COALESCE(c.standort, '') AS standort, COALESCE(c.notiz, '') AS notiz,
                COALESCE(c.status, 'aktiv') AS status, c.created_at, c.updated_at,
                COALESCE(SUM(CASE WHEN cm.status = 'active' AND cm.role IN ('company_owner','company_admin') THEN 1 ELSE 0 END), 0)::int AS hauptkontakte_count,
                COALESCE(SUM(CASE WHEN cm.status = 'active' AND cm.role = 'company_employee' THEN 1 ELSE 0 END), 0)::int AS mitarbeiter_count,
                COALESCE((
                  SELECT COUNT(*)
                  FROM company_invitations ci
                  WHERE ci.company_id = c.id
                    AND ci.accepted_at IS NULL
                    AND ci.expires_at > NOW()
                ), 0)::int AS pending_invitations
         FROM companies c
         LEFT JOIN company_members cm ON cm.company_id = c.id
         ${where}
         GROUP BY c.id
         ORDER BY LOWER(c.name) ASC`,
        params
      );

      const companyIds = companiesResult.rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id));
      const membersByCompany = new Map();
      const invitesByCompany = new Map();

      if (companyIds.length > 0) {
        const membersResult = await db.query(
          `SELECT cm.id, cm.company_id, cm.email, cm.role, cm.status, cm.is_primary_contact, cm.created_at, cm.updated_at
           FROM company_members cm
           WHERE cm.company_id = ANY($1::int[])
           ORDER BY
             CASE cm.role WHEN 'company_owner' THEN 0 WHEN 'company_admin' THEN 1 ELSE 2 END,
             LOWER(cm.email) ASC`,
          [companyIds]
        );
        for (const row of membersResult.rows) {
          const cid = Number(row.company_id);
          const list = membersByCompany.get(cid) || [];
          list.push({
            id: Number(row.id),
            company_id: cid,
            email: String(row.email || ""),
            role: normalizeRole(row.role),
            status: String(row.status || "active"),
            is_primary_contact: Boolean(row.is_primary_contact),
            created_at: row.created_at,
            updated_at: row.updated_at,
          });
          membersByCompany.set(cid, list);
        }

        const invitationsResult = await db.query(
          `SELECT id, company_id, email, role, token, expires_at, accepted_at, invited_by, created_at,
                  COALESCE(given_name, '') AS given_name, COALESCE(family_name, '') AS family_name, COALESCE(login_name, '') AS login_name
           FROM company_invitations
           WHERE company_id = ANY($1::int[])
             AND accepted_at IS NULL
             AND expires_at > NOW()
           ORDER BY created_at DESC`,
          [companyIds]
        );
        for (const row of invitationsResult.rows) {
          const cid = Number(row.company_id);
          const list = invitesByCompany.get(cid) || [];
          list.push({
            id: Number(row.id),
            company_id: cid,
            email: String(row.email || ""),
            role: normalizeRole(row.role),
            token: String(row.token || ""),
            expires_at: row.expires_at,
            accepted_at: row.accepted_at,
            invited_by: String(row.invited_by || ""),
            given_name: String(row.given_name || ""),
            family_name: String(row.family_name || ""),
            login_name: String(row.login_name || ""),
            created_at: row.created_at,
          });
          invitesByCompany.set(cid, list);
        }
      }

      const statsResult = await db.query(
        `SELECT
           COALESCE((SELECT COUNT(*) FROM companies c WHERE COALESCE(c.status, 'aktiv') = 'aktiv'), 0)::int AS active_companies,
           COALESCE((
             SELECT COUNT(*)
             FROM company_members cm
             WHERE cm.status = 'active'
               AND cm.role IN ('company_owner','company_admin')
           ), 0)::int AS main_contacts,
           COALESCE((
             SELECT COUNT(*)
             FROM company_members cm
             WHERE cm.status = 'active'
               AND cm.role = 'company_employee'
           ), 0)::int AS employees,
           COALESCE((
             SELECT COUNT(*)
             FROM company_invitations ci
             WHERE ci.accepted_at IS NULL
               AND ci.expires_at > NOW()
           ), 0)::int AS pending_invitations`
      );
      const statsRow = statsResult.rows[0] || {};

      const companies = companiesResult.rows.map((row) =>
        mapCompanyRow(row, membersByCompany.get(Number(row.id)) || [], invitesByCompany.get(Number(row.id)) || [])
      );

      return res.json({
        ok: true,
        stats: {
          active_companies: Number(statsRow.active_companies || 0),
          main_contacts: Number(statsRow.main_contacts || 0),
          employees: Number(statsRow.employees || 0),
          pending_invitations: Number(statsRow.pending_invitations || 0),
        },
        companies,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message || "Benutzerverwaltung konnte nicht geladen werden" });
    }
  });

  app.post("/api/admin/users/companies", requireAdmin, requireUsersManage, async (req, res) => {
    try {
      const name = String(req.body?.name || "").trim();
      const standort = String(req.body?.standort || "").trim();
      const notiz = String(req.body?.notiz || "").trim();
      const mainContactEmail = normalizeEmail(req.body?.mainContactEmail || req.body?.hauptkontaktEmail);

      if (!name) return res.status(400).json({ error: "Firmenname ist erforderlich" });

      const slug = await ensureUniqueCompanySlug(db, name);
      const companyStatus = mainContactEmail ? "ausstehend" : "aktiv";
      const companyInsert = await db.query(
        `INSERT INTO companies (name, slug, standort, notiz, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         RETURNING id, name, slug, standort, notiz, status, created_at, updated_at`,
        [name, slug, standort, notiz, companyStatus]
      );
      const company = companyInsert.rows[0];
      let invitation = null;

      if (mainContactEmail) {
        const token = crypto.randomBytes(32).toString("base64url");
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
        invitation = await db.createCompanyInvitation({
          companyId: Number(company.id),
          email: mainContactEmail,
          role: "company_owner",
          token,
          expiresAt,
          invitedBy: String(req.user?.id || req.user?.name || "admin"),
          givenName: "",
          familyName: "",
          loginName: "",
        });
      }

      return res.status(201).json({ ok: true, company, invitation });
    } catch (err) {
      return res.status(400).json({ error: err.message || "Firma konnte nicht erstellt werden" });
    }
  });

  app.post("/api/admin/users/companies/:id/invitations", requireAdmin, requireUsersManage, async (req, res) => {
    try {
      const companyId = Number(req.params.id);
      if (!Number.isFinite(companyId)) return res.status(400).json({ error: "Ungueltige Firmen-ID" });

      const role = normalizeRole(req.body?.role);
      const givenName = String(req.body?.givenName ?? req.body?.vorname ?? "").trim();
      const familyName = String(req.body?.familyName ?? req.body?.nachname ?? "").trim();
      const loginNameRaw = String(req.body?.loginName ?? req.body?.login_name ?? "").trim();
      const loginSlug = sanitizeCompanyInviteLoginName(loginNameRaw);
      let email = normalizeEmail(req.body?.email);

      if (email.includes("@")) {
        // echte E-Mail
      } else if (loginSlug && givenName && familyName) {
        email = buildSyntheticManualInviteEmail(companyId, loginSlug);
      } else {
        return res.status(400).json({
          error:
            "Gueltige E-Mail erforderlich, oder manuell: Vorname, Nachname und Login-Name (nur Buchstaben, Ziffern, . _ -).",
        });
      }

      const companyCheck = await db.query(`SELECT id FROM companies WHERE id = $1 LIMIT 1`, [companyId]);
      if (!companyCheck.rows[0]) return res.status(404).json({ error: "Firma nicht gefunden" });

      const token = crypto.randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
      const invitation = await db.createCompanyInvitation({
        companyId,
        email,
        role,
        token,
        expiresAt,
        invitedBy: String(req.user?.id || req.user?.name || "admin"),
        givenName,
        familyName,
        loginName: loginSlug || String(loginNameRaw).trim().toLowerCase(),
      });

      return res.status(201).json({ ok: true, invitation });
    } catch (err) {
      return res.status(400).json({ error: err.message || "Einladung konnte nicht erstellt werden" });
    }
  });

  app.post("/api/admin/users/invitations/:id/resend", requireAdmin, requireUsersManage, async (req, res) => {
    try {
      const invitationId = Number(req.params.id);
      if (!Number.isFinite(invitationId)) return res.status(400).json({ error: "Ungueltige Einladungs-ID" });

      const originalResult = await db.query(
        `SELECT id, company_id, email, role, given_name, family_name, login_name
         FROM company_invitations
         WHERE id = $1
           AND accepted_at IS NULL
         LIMIT 1`,
        [invitationId]
      );
      const original = originalResult.rows[0];
      if (!original) return res.status(404).json({ error: "Einladung nicht gefunden" });

      const token = crypto.randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
      const invitation = await db.createCompanyInvitation({
        companyId: Number(original.company_id),
        email: String(original.email || ""),
        role: normalizeRole(original.role),
        token,
        expiresAt,
        invitedBy: String(req.user?.id || req.user?.name || "admin"),
        givenName: String(original.given_name || ""),
        familyName: String(original.family_name || ""),
        loginName: String(original.login_name || ""),
      });

      return res.status(201).json({ ok: true, invitation });
    } catch (err) {
      return res.status(400).json({ error: err.message || "Einladung konnte nicht erneut gesendet werden" });
    }
  });

  app.patch("/api/admin/users/members/:id/role", requireAdmin, requireUsersManage, async (req, res) => {
    try {
      const memberId = Number(req.params.id);
      if (!Number.isFinite(memberId)) return res.status(400).json({ error: "Ungueltige Mitglieds-ID" });
      const role = normalizeRole(req.body?.role);
      const member = await db.updateCompanyMemberRole(memberId, role);
      if (!member) return res.status(404).json({ error: "Mitglied nicht gefunden" });
      await rbac.syncCompanyMemberRolesFromDb(member.id);
      return res.json({ ok: true, member });
    } catch (err) {
      return res.status(400).json({ error: err.message || "Rolle konnte nicht aktualisiert werden" });
    }
  });

  app.patch("/api/admin/users/members/:id/status", requireAdmin, requireUsersManage, async (req, res) => {
    try {
      const memberId = Number(req.params.id);
      if (!Number.isFinite(memberId)) return res.status(400).json({ error: "Ungueltige Mitglieds-ID" });
      const requested = String(req.body?.status || "").trim().toLowerCase();
      const status = ["active", "disabled", "invited"].includes(requested) ? requested : "active";
      const member = await db.updateCompanyMemberStatus(memberId, status);
      if (!member) return res.status(404).json({ error: "Mitglied nicht gefunden" });
      return res.json({ ok: true, member });
    } catch (err) {
      return res.status(400).json({ error: err.message || "Status konnte nicht aktualisiert werden" });
    }
  });
}

module.exports = { registerAdminUsersRoutes };
