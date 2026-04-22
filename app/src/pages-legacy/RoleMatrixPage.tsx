import { useEffect, useState } from "react";
import { Building2, Check, Info, Lock, Plus, RotateCcw, Save, Shield, Trash2, Users, Camera } from "lucide-react";
import { cn } from "../lib/utils";
import { useAuthStore } from "../store/authStore";
import { getRolePresets, createRolePreset, deleteRolePreset, patchRolePreset } from "../api/access";
import { getAdminProfile } from "../api/profile";

// ─── Datenstruktur ────────────────────────────────────────────────────────────

type RoleKey = string;

type PermKey = string;

interface RoleDef {
  key: RoleKey;
  label: string;
  description: string;
  group: "intern" | "fotograf" | "kunde" | "custom";
  color: string;        // Tailwind / CSS-Variable Token
  headerBg: string;
  fixed?: boolean;      // true = immer alle Rechte, Checkboxen gesperrt
}

interface PermDef {
  key: PermKey;
  label: string;
  description: string;
  section: string;
}

// ─── Rollendefinitionen ───────────────────────────────────────────────────────

const ROLES: RoleDef[] = [
  // ─ Intern ──────────────────────────────────────────────────────────────────
  {
    key: "super_admin",
    label: "Super-Admin",
    description: "Voller Zugriff auf alles, inkl. Systemkonfiguration und Rollenverwaltung.",
    group: "intern",
    color: "text-amber-400",
    headerBg: "bg-amber-500/10 border-amber-500/20",
    fixed: true,
  },
  {
    key: "internal_admin",
    label: "Admin",
    description: "Interner Admin mit nahezu vollem Zugriff. Verwaltet Aufträge, Kunden, Fotografen.",
    group: "intern",
    color: "text-amber-300",
    headerBg: "bg-amber-400/10 border-amber-400/20",
    fixed: true,
  },
  {
    key: "tour_manager",
    label: "Tour-Manager",
    description: "Touren, Aufträge, Kalender, Kunden lesen, Reviews — kein Finanz- oder Einstellungs-Backoffice.",
    group: "intern",
    color: "text-sky-400",
    headerBg: "bg-sky-500/10 border-sky-500/20",
  },
  // ─ Fotografen ──────────────────────────────────────────────────────────────
  {
    key: "photographer",
    label: "Fotograf",
    description: "Sieht eigene Aufträge und Kalender. Kann Aufträge aktualisieren und zuweisen.",
    group: "fotograf",
    color: "text-violet-400",
    headerBg: "bg-violet-500/10 border-violet-500/20",
  },
  // ─ Kunde ──────────────────────────────────────────────────────────────────
  {
    key: "customer_admin",
    label: "Kunden-Admin",
    description: "Firmenverantwortlicher Kunde. Darf bestellen, Team einladen und Rechnungen sehen.",
    group: "kunde",
    color: "text-emerald-400",
    headerBg: "bg-emerald-500/10 border-emerald-500/20",
  },
  {
    key: "customer_user",
    label: "Kunden-Benutzer",
    description: "Kunden-Kontakt mit Lese-Zugriff auf eigene Touren und Rechnungen.",
    group: "kunde",
    color: "text-emerald-300",
    headerBg: "bg-emerald-400/10 border-emerald-400/20",
  },
  {
    key: "company_owner",
    label: "Firmen-Hauptkontakt",
    description: "Hauptkontakt einer Firma mit erweiterten Rechten.",
    group: "kunde",
    color: "text-teal-400",
    headerBg: "bg-teal-500/10 border-teal-500/20",
  },
  {
    key: "company_employee",
    label: "Firmen-Mitarbeiter",
    description: "Mitarbeiter einer Firma mit Lese-Zugriff.",
    group: "kunde",
    color: "text-teal-300",
    headerBg: "bg-teal-400/10 border-teal-400/20",
  },
];

// ─── Berechtigungs-Definitionen ───────────────────────────────────────────────

const PERMISSIONS: PermDef[] = [
  // Dashboard
  { key: "dashboard.view",           label: "Dashboard anzeigen",                section: "Dashboard",              description: "Zugriff auf das Haupt-Dashboard mit Statistiken." },
  // Portal / Kunde
  { key: "portal_team.manage",       label: "Portal-Team verwalten",             section: "Portal / Kunde",         description: "Kunden-Team im Portal einladen und verwalten (Mitarbeiter-Rollen)." },
  { key: "portal.orders.read",       label: "Portal: Bestellungen ansehen",      section: "Kundenportal (API)",     description: "Kundensession: eigene Bestellungen (portal.propus.ch)." },
  { key: "portal.orders.cancel",     label: "Portal: stornieren",              section: "Kundenportal (API)",     description: "Eigene Bestellung stornieren (Fristen)." },
  { key: "portal.orders.reschedule", label: "Portal: umbuchen",                 section: "Kundenportal (API)",     description: "Termin der eigenen Bestellung aendern." },
  { key: "portal.messages.read",     label: "Portal: Nachrichten lesen",        section: "Kundenportal (API)",     description: "Nachrichten/Chat zu eigenen Auftraegen." },
  { key: "portal.messages.write",    label: "Portal: Nachrichten senden",      section: "Kundenportal (API)",     description: "An Fotograf/Office schreiben." },
  { key: "portal.invoices.read",     label: "Portal: Rechnungsdaten",          section: "Kundenportal (API)",     description: "Rechnungs-/Zahlungssicht." },
  { key: "portal.team.read",         label: "Portal: Team ansehen",            section: "Kundenportal (API)",     description: "Teamliste der Firma." },
  { key: "portal.team.manage",       label: "Portal: Team verwalten",          section: "Kundenportal (API)",     description: "Einladen, Rollen (Kunden-Admin)." },
  { key: "portal.profile.update",   label: "Portal: Profil",                  section: "Kundenportal (API)",     description: "Stammdaten im Kundenportal." },
  // Touren
  { key: "tours.read",               label: "Touren ansehen",                    section: "Touren",                 description: "Matterport-Touren und deren Details einsehen." },
  { key: "tours.manage",             label: "Touren verwalten",                  section: "Touren",                 description: "Touren erstellen, bearbeiten, Status ändern." },
  { key: "tours.assign",             label: "Touren zuweisen",                   section: "Touren",                 description: "Touren einem Fotografen oder Kunden zuweisen." },
  { key: "tours.cross_company",      label: "Touren (firmenübergreifend)",       section: "Touren",                 description: "Touren über Firmengrenzen hinweg einsehen und verwalten." },
  { key: "tours.archive",            label: "Touren archivieren",                section: "Touren",                 description: "Abgeschlossene Touren archivieren." },
  { key: "tours.link_matterport",    label: "Matterport verknüpfen",             section: "Touren",                 description: "Matterport-Spaces mit Touren verknüpfen und Space-IDs setzen." },
  // Aufträge
  { key: "orders.read",              label: "Aufträge ansehen",                  section: "Aufträge",               description: "Bestellungen und Aufträge einsehen." },
  { key: "orders.create",            label: "Auftrag erstellen",                 section: "Aufträge",               description: "Neue Bestellungen anlegen." },
  { key: "orders.update",            label: "Auftrag bearbeiten",                section: "Aufträge",               description: "Bestehende Aufträge bearbeiten (Status, Daten)." },
  { key: "orders.delete",            label: "Auftrag löschen",                   section: "Aufträge",               description: "Aufträge unwiderruflich löschen." },
  { key: "orders.assign",            label: "Auftrag zuweisen",                  section: "Aufträge",               description: "Fotografen einem Auftrag zuweisen oder austauschen." },
  { key: "orders.export",            label: "Aufträge exportieren",              section: "Aufträge",               description: "Auftragslisten als CSV/Excel exportieren." },
  // Kunden & Kontakte
  { key: "customers.read",           label: "Kunden ansehen",                    section: "Kunden & Kontakte",      description: "Kundenstammdaten einsehen." },
  { key: "customers.manage",         label: "Kunden verwalten",                  section: "Kunden & Kontakte",      description: "Kunden anlegen, bearbeiten, sperren/entsperren." },
  { key: "contacts.read",            label: "Kontakte ansehen",                  section: "Kunden & Kontakte",      description: "Kontaktpersonen eines Kunden einsehen." },
  { key: "contacts.manage",          label: "Kontakte verwalten",                section: "Kunden & Kontakte",      description: "Kontaktpersonen anlegen, bearbeiten und löschen." },
  // Fotografen
  { key: "photographers.read",       label: "Fotografen ansehen",                section: "Fotografen",             description: "Fotografenprofile und Verfügbarkeiten einsehen." },
  { key: "photographers.manage",     label: "Fotografen verwalten",              section: "Fotografen",             description: "Fotografen anlegen, bearbeiten, Verfügbarkeiten setzen." },
  // Produkte, Preise & Inhalte
  { key: "products.manage",          label: "Produkte verwalten",                section: "Produkte & Inhalte",     description: "Produkte, Pakete und Leistungen anlegen und bearbeiten." },
  { key: "discount_codes.manage",    label: "Gutscheine verwalten",              section: "Produkte & Inhalte",     description: "Rabatt- und Gutscheincodes erstellen und verwalten." },
  { key: "listing.manage",           label: "Listing-Page verwalten",            section: "Produkte & Inhalte",     description: "Inhalte der öffentlichen Listing-Seite (/admin/listing) pflegen." },
  { key: "picdrop.manage",           label: "Selekto (Bildauswahl)",             section: "Produkte & Inhalte",     description: "Selekto / Picdrop: Bildauswahl-Workflow für Kunden und Fotografen." },
  // Kalender
  { key: "calendar.view",            label: "Kalender ansehen",                  section: "Kalender",               description: "Terminkalender und geplante Aufträge einsehen." },
  { key: "calendar.manage",          label: "Kalender bearbeiten",               section: "Kalender",               description: "Termine erstellen, verschieben und löschen." },
  // Finanzen & Abrechnung
  { key: "finance.read",             label: "Finanzen einsehen",                 section: "Finanzen & Abrechnung",  description: "Zentrales Rechnungsmodul (/admin/finance): Rechnungen, Zahlungen, Mahnungen ansehen." },
  { key: "finance.manage",           label: "Finanzen verwalten",                section: "Finanzen & Abrechnung",  description: "Rechnungen erstellen/bearbeiten, Bank-Import, Mahnungen versenden." },
  { key: "billing.read",             label: "Abrechnung einsehen",               section: "Finanzen & Abrechnung",  description: "Abrechnungsdaten und Sammelrechnungen einsehen." },
  // Kommunikation
  { key: "tickets.read",             label: "Tickets einsehen",                  section: "Kommunikation",          description: "Zentrales Postfach / Ticketsystem (/admin/tickets) einsehen." },
  { key: "tickets.manage",           label: "Tickets verwalten",                 section: "Kommunikation",          description: "Tickets zuweisen, beantworten, schliessen." },
  { key: "emails.manage",            label: "E-Mail-Templates verwalten",        section: "Kommunikation",          description: "E-Mail-Vorlagen erstellen und bearbeiten." },
  { key: "reviews.read",             label: "Bewertungen ansehen",              section: "Kommunikation",          description: "Bewertungen und Google-Review-Flows lesen." },
  { key: "reviews.manage",           label: "Bewertungen verwalten",             section: "Kommunikation",          description: "Kundenbewertungen einsehen und moderieren." },
  // Einstellungen & System
  { key: "settings.manage",          label: "Einstellungen verwalten",           section: "Einstellungen & System", description: "Systemkonfiguration, Workflow und allgemeine Einstellungen." },
  { key: "backups.manage",           label: "Backups verwalten",                 section: "Einstellungen & System", description: "Datenbank-Backups erstellen und herunterladen." },
  { key: "bugs.read",                label: "Fehlerberichte ansehen",            section: "Einstellungen & System", description: "Fehlerberichte und Bug-Tickets einsehen." },
  { key: "bugs.manage",              label: "Fehlerberichte verwalten",          section: "Einstellungen & System", description: "Fehlerberichte bearbeiten, schliessen und löschen." },
  { key: "roles.manage",             label: "Rollen verwalten",                  section: "Einstellungen & System", description: "Systemrollen und Berechtigungen bearbeiten. Nur Super-Admin." },
  { key: "users.manage",             label: "Benutzer verwalten",                section: "Einstellungen & System", description: "Admin-Benutzer anlegen, sperren und löschen." },
];

// ─── Preset-Zuordnungen (Spiegelbild von access-rbac.js) ─────────────────────

const ALL_PERM_KEYS = PERMISSIONS.map((p) => p.key);

const ROLE_PRESETS: Record<RoleKey, Set<PermKey>> = {
  super_admin:      new Set(ALL_PERM_KEYS),
  internal_admin:   new Set(ALL_PERM_KEYS),
  // Touren-Manager: Touren, Auftraege, Kalender, Kunden lesen, Reviews — ohne Finance-Backoffice/Settings-Listing
  tour_manager:     new Set([
    "tours.read", "tours.manage", "tours.assign", "tours.cross_company",
    "tours.archive", "tours.link_matterport",
    "dashboard.view", "orders.read", "orders.update", "calendar.view", "customers.read", "reviews.read",
  ]),
  photographer: new Set([
    "dashboard.view", "orders.read", "orders.update", "orders.assign",
    "calendar.view", "photographers.read",
    "picdrop.manage",
  ]),
  customer_admin: new Set([
    "orders.read", "orders.create", "orders.update",
    "customers.read", "contacts.read", "contacts.manage",
    "tours.read", "tours.manage", "portal_team.manage", "billing.read",
    "portal.orders.read", "portal.orders.cancel", "portal.orders.reschedule", "portal.messages.read", "portal.messages.write",
    "portal.invoices.read", "portal.team.read", "portal.team.manage", "portal.profile.update",
  ]),
  customer_user: new Set([
    "orders.read", "tours.read", "billing.read",
    "portal.orders.read", "portal.orders.cancel", "portal.orders.reschedule", "portal.messages.read", "portal.messages.write",
    "portal.invoices.read", "portal.profile.update",
  ]),
  company_owner: new Set([
    "orders.read", "orders.create", "orders.update",
    "customers.read", "contacts.read", "tours.read", "billing.read",
    "portal.orders.read", "portal.orders.cancel", "portal.orders.reschedule", "portal.messages.read", "portal.messages.write",
    "portal.invoices.read", "portal.team.read", "portal.team.manage", "portal.profile.update",
  ]),
  company_employee: new Set([
    "orders.read", "tours.read",
    "portal.orders.read", "portal.orders.cancel", "portal.orders.reschedule", "portal.messages.read", "portal.messages.write",
    "portal.invoices.read", "portal.profile.update",
  ]),
};

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function getSections(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of PERMISSIONS) {
    if (!seen.has(p.section)) { seen.add(p.section); out.push(p.section); }
  }
  return out;
}

// ─── Gruppen-Render-Helfer ────────────────────────────────────────────────────

const GROUP_META = {
  intern:   { label: "Intern",        Icon: Shield,    border: "border-amber-500/30",  bg: "bg-amber-500/5"    },
  fotograf: { label: "Fotograf",      Icon: Camera,    border: "border-violet-500/30", bg: "bg-violet-500/5"   },
  kunde:    { label: "Kunde",         Icon: Building2, border: "border-emerald-500/30", bg: "bg-emerald-500/5" },
  custom:   { label: "Eigene Rollen", Icon: Plus,      border: "border-slate-500/30",  bg: "bg-slate-500/5"    },
};

const CUSTOM_ROLE_STYLE = {
  color: "text-slate-400",
  headerBg: "bg-slate-500/10 border-slate-500/20",
};

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-2.5 py-1.5 text-xs text-[var(--text-main)] opacity-0 shadow-lg transition-opacity group-hover:opacity-100 max-w-xs whitespace-normal text-center leading-snug">
        {text}
      </span>
    </span>
  );
}

// ─── Checkbox-Zelle ───────────────────────────────────────────────────────────

function MatrixCell({
  has,
  fixed,
  roleColor,
  permDesc,
  editable,
  onClick,
}: {
  has: boolean;
  fixed?: boolean;
  roleColor: string;
  permDesc: string;
  editable?: boolean;
  onClick?: () => void;
}) {
  const interactive = editable && !fixed;
  return (
    <td
      className={cn(
        "border-b border-[var(--border-soft)] px-0 py-0 text-center align-middle transition-colors",
        interactive && "cursor-pointer hover:bg-[var(--surface-raised)]",
      )}
      onClick={interactive ? onClick : undefined}
      title={interactive ? (has ? "Berechtigung entfernen" : "Berechtigung hinzufügen") : undefined}
    >
      <Tooltip text={interactive ? "" : permDesc}>
        <span className="flex h-full w-full items-center justify-center py-3">
          {has ? (
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-md border transition-all",
                fixed
                  ? cn("border-amber-500/40 bg-amber-500/15", roleColor)
                  : cn("border-current/30 bg-current/10", roleColor),
                interactive && "group-hover:scale-110",
              )}
            >
              <Check className="h-3 w-3" strokeWidth={2.5} />
            </span>
          ) : (
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-md border border-[var(--border-soft)] bg-transparent opacity-25 transition-all",
                interactive && "hover:opacity-60 hover:border-current/40",
                roleColor,
              )}
            >
              {fixed && <Lock className="h-2.5 w-2.5 text-[var(--text-subtle)]" />}
            </span>
          )}
        </span>
      </Tooltip>
    </td>
  );
}

// ─── Haupt-Komponente ─────────────────────────────────────────────────────────

export function RoleMatrixPage() {
  const role = useAuthStore((s) => s.role);
  const token = useAuthStore((s) => s.token);
  const isSuperAdmin = role === "super_admin" || role === "admin";

  const [hoveredPerm, setHoveredPerm] = useState<string | null>(null);
  const [hoveredRole, setHoveredRole] = useState<RoleKey | null>(null);
  const [filterGroup, setFilterGroup] = useState<"all" | "intern" | "fotograf" | "kunde" | "custom">("all");
  const [mePerms, setMePerms] = useState<string[] | null>(null);

  useEffect(() => {
    if (!token) {
      setMePerms(null);
      return;
    }
    void getAdminProfile(token)
      .then((d) => setMePerms(Array.isArray(d.permissions) ? d.permissions : []))
      .catch(() => setMePerms([]));
  }, [token]);

  // ─── Custom Rollen (aus DB) ──────────────────────────────────────────────────
  const [customRoles, setCustomRoles] = useState<RoleDef[]>([]);

  // ─── Editier-State (nur Super-Admin) ────────────────────────────────────────
  const [loadedPresets, setLoadedPresets] = useState<Record<string, Set<string>> | null>(null);
  const [editedPresets, setEditedPresets] = useState<Record<string, Set<string>> | null>(null);
  const [savingRole, setSavingRole] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  // ─── Neue Rolle erstellen ────────────────────────────────────────────────────
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  // ─── Rolle löschen ──────────────────────────────────────────────────────────
  const [deletingRole, setDeletingRole] = useState<string | null>(null);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  function loadRoleData() {
    if (!isSuperAdmin || !token) return;
    getRolePresets(token)
      .then((r) => {
        const loaded: Record<string, Set<string>> = {};
        for (const [rk, perms] of Object.entries(r.presets)) {
          loaded[rk] = new Set(perms);
        }
        const edited: Record<string, Set<string>> = {};
        for (const [rk, s] of Object.entries(loaded)) {
          edited[rk] = new Set(s);
        }
        setLoadedPresets(loaded);
        setEditedPresets(edited);
        // Custom Rollen aus API-Antwort einlesen
        const custom = (r.roles ?? [])
          .filter((rm) => rm.is_custom)
          .map((rm): RoleDef => ({
            key: rm.role_key,
            label: rm.label || rm.role_key,
            description: rm.description || "",
            group: "custom",
            color: CUSTOM_ROLE_STYLE.color,
            headerBg: CUSTOM_ROLE_STYLE.headerBg,
          }));
        setCustomRoles(custom);
      })
      .catch(() => { /* fallback: hartkodierte ROLE_PRESETS bleiben */ });
  }

  useEffect(() => { loadRoleData(); }, [isSuperAdmin, token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    setCreating(true);
    setCreateErr(null);
    try {
      await createRolePreset(token, { label: newLabel.trim(), description: newDesc.trim() });
      setShowCreateModal(false);
      setNewLabel("");
      setNewDesc("");
      loadRoleData();
    } catch (err) {
      setCreateErr(err instanceof Error ? err.message : "Fehler beim Erstellen");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(roleKey: string) {
    setDeletingRole(roleKey);
    setDeleteErr(null);
    try {
      await deleteRolePreset(token, roleKey);
      loadRoleData();
    } catch (err) {
      setDeleteErr(err instanceof Error ? err.message : "Fehler beim Löschen");
    } finally {
      setDeletingRole(null);
    }
  }

  function getPresets(): Record<RoleKey, Set<PermKey>> {
    return (editedPresets ?? ROLE_PRESETS) as Record<RoleKey, Set<PermKey>>;
  }

  function isDirty(roleKey: RoleKey): boolean {
    if (!loadedPresets || !editedPresets) return false;
    const orig = loadedPresets[roleKey] ?? new Set<string>();
    const edit = editedPresets[roleKey] ?? new Set<string>();
    if (orig.size !== edit.size) return true;
    for (const k of orig) if (!edit.has(k)) return true;
    return false;
  }

  function handleToggle(roleKey: RoleKey, permKey: PermKey) {
    setEditedPresets((prev) => {
      if (!prev) return prev;
      const set = new Set(prev[roleKey] ?? []);
      if (set.has(permKey)) set.delete(permKey); else set.add(permKey);
      return { ...prev, [roleKey]: set };
    });
    setSaveErr(null);
    setSaveSuccess(null);
  }

  async function handleSave(roleKey: RoleKey) {
    if (!editedPresets) return;
    setSavingRole(roleKey);
    setSaveErr(null);
    setSaveSuccess(null);
    try {
      const perms = [...(editedPresets[roleKey] ?? [])];
      await patchRolePreset(token, roleKey, perms);
      setLoadedPresets((prev) => ({ ...prev, [roleKey]: new Set(perms) }));
      setSaveSuccess(roleKey);
      setTimeout(() => setSaveSuccess((v) => v === roleKey ? null : v), 2500);
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setSavingRole(null);
    }
  }

  function handleDiscard(roleKey: RoleKey) {
    if (!loadedPresets) return;
    setEditedPresets((prev) => ({ ...prev, [roleKey]: new Set(loadedPresets[roleKey] ?? []) }));
    setSaveErr(null);
  }

  function countPerms(roleKey: RoleKey): number {
    return getPresets()[roleKey]?.size ?? 0;
  }

  const allRoles = [...ROLES, ...customRoles];
  const sections = getSections();
  const visibleRoles = filterGroup === "all" ? allRoles : allRoles.filter((r) => r.group === filterGroup);

  return (
    <>
    <div className="min-h-screen bg-[var(--bg)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px]">

        {/* ─── Header ─────────────────────────────────────────────────────── */}
        <div className="mb-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-[var(--text-main)]">Rollen & Berechtigungen</h1>
              <p className="mt-1 text-sm text-[var(--text-subtle)]">
                Systemrollen und Zugriffsrechte verwalten.
              </p>
            </div>
            {isSuperAdmin && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-2.5 text-sm text-amber-400">
                <Shield className="h-4 w-4 shrink-0" />
                <span>Klick auf eine Checkbox zum Bearbeiten — Änderungen werden pro Rolle gespeichert. Fixe Rollen (Super-Admin, Admin) sind immer unveränderlich.</span>
              </div>
            )}
          </div>

          {mePerms && mePerms.length > 0 && (
            <div className="mb-4 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-raised)] p-3 text-sm">
              <p className="font-medium text-[var(--text-main)]">Meine effektiven Rechte ({mePerms.length})</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Von /api/admin/me (Debug / Abgleich mit UI)</p>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs text-[var(--text-subtle)]">
                {mePerms.slice().sort().join(", ")}
              </pre>
            </div>
          )}

        </div>

        {/* ─── Rollen-Matrix ──────────────────────────────────────────────── */}
        <>

          {/* Gruppen-Filter + Neue Rolle Button */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {(["all", "intern", "fotograf", "kunde", "custom"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setFilterGroup(g)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-sm font-medium transition-colors",
                    filterGroup === g
                      ? "border-[var(--accent)]/40 bg-[var(--accent)]/12 text-[var(--accent)]"
                      : "border-[var(--border-soft)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-main)]",
                  )}
                >
                  {g === "all" && <><Users className="h-3.5 w-3.5" /> Alle Rollen ({allRoles.length})</>}
                  {g === "intern" && <><Shield className="h-3.5 w-3.5" /> Intern</>}
                  {g === "fotograf" && <><Camera className="h-3.5 w-3.5" /> Fotografen</>}
                  {g === "kunde" && <><Building2 className="h-3.5 w-3.5" /> Kunde</>}
                  {g === "custom" && <><Plus className="h-3.5 w-3.5" /> Eigene{customRoles.length > 0 ? ` (${customRoles.length})` : ""}</>}
                </button>
              ))}
            </div>
            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => { setShowCreateModal(true); setCreateErr(null); }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3.5 py-1.5 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent)]/20 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Neue Rolle
              </button>
            )}
          </div>

          {/* ─── Fehler beim Löschen ─────────────────────────────────────────── */}
          {deleteErr && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              {deleteErr}
            </div>
          )}

          {/* ─── Rollen-Karten oben ──────────────────────────────────────────── */}
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {visibleRoles.map((r) => {
            const count = countPerms(r.key);
            const total = ALL_PERM_KEYS.length;
            const pct = Math.round((count / total) * 100);
            const { label: groupLabel, Icon: GroupIcon } = GROUP_META[r.group as keyof typeof GROUP_META];
            return (
              <div
                key={r.key}
                className={cn(
                  "cursor-pointer rounded-xl border p-4 transition-all",
                  r.headerBg,
                  hoveredRole === r.key
                    ? "shadow-lg scale-[1.02]"
                    : "hover:shadow-md hover:scale-[1.01]",
                )}
                onMouseEnter={() => setHoveredRole(r.key)}
                onMouseLeave={() => setHoveredRole(null)}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className={cn("text-sm font-semibold", r.color)}>{r.label}</span>
                  <div className="flex items-center gap-1.5">
                    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold tabular-nums", r.headerBg, r.color)}>
                      {count}/{total}
                    </span>
                    {!r.fixed && isSuperAdmin && (
                      <button
                        type="button"
                        disabled={deletingRole === r.key}
                        onClick={(e) => { e.stopPropagation(); void handleDelete(r.key); }}
                        className="rounded p-0.5 text-[var(--text-subtle)] hover:text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                        title="Rolle löschen"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="mt-1.5 text-[11px] leading-snug text-[var(--text-subtle)]">{r.description}</p>
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="flex items-center gap-1 text-[10px] text-[var(--text-subtle)]">
                      <GroupIcon className="h-3 w-3" /> {groupLabel}
                    </span>
                    <span className={cn("text-[11px] font-semibold tabular-nums", r.color)}>{pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[var(--surface-raised)] overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", r.fixed ? "bg-amber-500/60" : "bg-current/40 " + r.color)}
                      style={{ width: `${pct}%`, backgroundColor: "currentColor", opacity: 0.5 }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ─── Matrix-Tabelle ─────────────────────────────────────────────── */}
        <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] shadow-sm" style={{ overflowX: "auto" }}>
          <table className="w-full border-collapse text-sm" style={{ minWidth: `${200 + visibleRoles.length * 88}px` }}>
            <colgroup>
              <col style={{ width: "200px", minWidth: "160px" }} />
              {visibleRoles.map((r) => (
                <col key={r.key} style={{ width: "88px" }} />
              ))}
            </colgroup>

            {/* Thead mit Gruppen + Rollen */}
            <thead className="sticky top-0 z-20">
              {/* Gruppen-Zeile */}
              <tr className="border-b border-[var(--border-soft)] bg-[var(--surface-raised)]">
                <th className="sticky left-0 z-10 bg-[var(--surface-raised)] px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-[var(--text-subtle)]">
                  Berechtigung
                </th>
                {(["intern", "fotograf", "kunde", "custom"] as const)
                  .filter((g) => filterGroup === "all" || filterGroup === g)
                  .map((g) => {
                    const rolesInGroup = visibleRoles.filter((r) => r.group === g);
                    if (rolesInGroup.length === 0) return null;
                    const { label, Icon, bg, border } = GROUP_META[g];
                    return (
                      <th
                        key={g}
                        colSpan={rolesInGroup.length}
                        className={cn("border-l border-[var(--border-soft)] px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-widest", bg)}
                      >
                        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5", border, {
                          "text-amber-400": g === "intern",
                          "text-violet-400": g === "fotograf",
                          "text-emerald-400": g === "kunde",
                          "text-slate-400": g === "custom",
                        })}>
                          <Icon className="h-3 w-3" />
                          {label}
                        </span>
                      </th>
                    );
                  })}
              </tr>

              {/* Rollen-Header */}
              <tr className="border-b-2 border-[var(--border-soft)] bg-[var(--surface-raised)]">
                <th className="sticky left-0 z-10 bg-[var(--surface-raised)] px-4 py-3 text-left text-[11px] font-medium text-[var(--text-muted)]">
                  <span className="text-[var(--text-subtle)]">{PERMISSIONS.length} Berechtigungen</span>
                  {saveErr && (
                    <p className="mt-1 text-[10px] text-red-500">{saveErr}</p>
                  )}
                </th>
                {visibleRoles.map((r, i) => {
                  const dirty = isDirty(r.key);
                  const isSaving = savingRole === r.key;
                  const isOk = saveSuccess === r.key;
                  return (
                    <th
                      key={r.key}
                      className={cn(
                        "border-l border-[var(--border-soft)] px-2 py-2 text-center",
                        i === 0 && "border-l-2",
                        hoveredRole === r.key && "bg-[var(--surface)]",
                        dirty && "bg-amber-500/5",
                      )}
                      onMouseEnter={() => setHoveredRole(r.key)}
                      onMouseLeave={() => setHoveredRole(null)}
                    >
                      <Tooltip text={r.description}>
                        <div className="flex flex-col items-center gap-0.5">
                          <span className={cn("text-[10px] font-semibold leading-tight text-center break-words max-w-[80px]", r.color)}>
                            {r.label}
                          </span>
                          <span className={cn(
                            "rounded-full border px-1.5 py-0 text-[9px] font-bold tabular-nums",
                            r.headerBg, r.color,
                          )}>
                            {countPerms(r.key)}
                          </span>
                          {r.fixed && (
                            <span className="flex items-center gap-0.5 rounded bg-amber-500/15 px-1 py-0 text-[8px] font-medium text-amber-400">
                              <Lock className="h-2 w-2" /> Alle
                            </span>
                          )}
                          {/* Speichern / Zurücksetzen pro Rolle (nur Super-Admin, nicht fixe Rollen) */}
                          {isSuperAdmin && !r.fixed && dirty && (
                            <div className="flex items-center gap-1 mt-1">
                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={() => void handleSave(r.key)}
                                className="flex items-center gap-0.5 rounded bg-emerald-500 px-1.5 py-0.5 text-[8px] font-bold text-white hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                                title="Änderungen speichern"
                              >
                                <Save className="h-2 w-2" />
                                {isSaving ? "…" : "OK"}
                              </button>
                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={() => handleDiscard(r.key)}
                                className="flex items-center gap-0.5 rounded bg-[var(--surface)] border border-[var(--border-soft)] px-1.5 py-0.5 text-[8px] text-[var(--text-subtle)] hover:text-[var(--text-main)] disabled:opacity-50 transition-colors"
                                title="Änderungen verwerfen"
                              >
                                <RotateCcw className="h-2 w-2" />
                              </button>
                            </div>
                          )}
                          {isOk && !dirty && (
                            <span className="mt-1 text-[8px] text-emerald-500 font-semibold">✓ Gespeichert</span>
                          )}
                        </div>
                      </Tooltip>
                    </th>
                  );
                })}
              </tr>
            </thead>

            {/* Tbody mit Sektionen */}
            <tbody>
              {sections.map((section) => {
                const permsInSection = PERMISSIONS.filter((p) => p.section === section);
                return (
                  <>
                    {/* Sektion-Header */}
                    <tr key={`section-${section}`} className="border-b border-[var(--border-soft)] bg-[var(--surface-raised)]/80">
                      <td
                        colSpan={1 + visibleRoles.length}
                        className="sticky left-0 bg-[var(--surface-raised)]/80 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-subtle)]"
                      >
                        {section}
                      </td>
                    </tr>

                    {/* Berechtigungs-Zeilen */}
                    {permsInSection.map((perm) => {
                      const isHovered = hoveredPerm === perm.key;
                      return (
                        <tr
                          key={perm.key}
                          onMouseEnter={() => setHoveredPerm(perm.key)}
                          onMouseLeave={() => setHoveredPerm(null)}
                          className={cn(
                            "group transition-colors",
                            isHovered
                              ? "bg-[var(--surface-raised)]"
                              : "hover:bg-[var(--surface-raised)]/50",
                          )}
                        >
                          {/* Label-Spalte */}
                          <td className={cn(
                            "sticky left-0 z-10 border-b border-[var(--border-soft)] px-4 py-0 transition-colors",
                            isHovered ? "bg-[var(--surface-raised)]" : "bg-[var(--surface)]",
                          )}>
                            <div className="flex items-center gap-2 py-3">
                              <span className="text-[13px] font-medium text-[var(--text-main)]">
                                {perm.label}
                              </span>
                              <Tooltip text={perm.description}>
                                <Info className="h-3.5 w-3.5 shrink-0 text-[var(--text-subtle)] opacity-50 hover:opacity-100 transition-opacity cursor-help" />
                              </Tooltip>
                            </div>
                            {isHovered && (
                              <div className="pb-2 -mt-1 text-[11px] text-[var(--text-subtle)] leading-snug max-w-xs">
                                {perm.description}
                              </div>
                            )}
                          </td>

                          {/* Checkbox-Spalten */}
                          {visibleRoles.map((r) => (
                            <MatrixCell
                              key={r.key}
                              has={getPresets()[r.key]?.has(perm.key) ?? false}
                              fixed={r.fixed}
                              roleColor={r.color}
                              permDesc={`${r.label}: ${perm.label}`}
                              editable={isSuperAdmin}
                              onClick={() => handleToggle(r.key, perm.key)}
                            />
                          ))}
                        </tr>
                      );
                    })}
                  </>
                );
              })}
            </tbody>

            {/* Footer */}
            <tfoot>
              <tr className="border-t-2 border-[var(--border-soft)] bg-[var(--surface-raised)]">
                <td className="px-4 py-3 text-[11px] font-semibold text-[var(--text-muted)]">
                  Gesamt
                </td>
                {visibleRoles.map((r) => (
                  <td key={r.key} className="border-l border-[var(--border-soft)] px-3 py-3 text-center">
                    <span className={cn("text-sm font-bold tabular-nums", r.color)}>
                      {countPerms(r.key)}
                    </span>
                    <span className="text-[10px] text-[var(--text-subtle)]">/{ALL_PERM_KEYS.length}</span>
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ─── Legende ─────────────────────────────────────────────────────── */}
        <div className="mt-6 flex flex-wrap items-center gap-6 text-xs text-[var(--text-subtle)]">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/15 text-amber-400">
              <Check className="h-3 w-3" strokeWidth={2.5} />
            </span>
            <span>Recht vergeben (System-Rolle, immer aktiv)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-md border border-emerald-400/30 bg-emerald-400/10 text-emerald-400">
              <Check className="h-3 w-3" strokeWidth={2.5} />
            </span>
            <span>Recht vergeben</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-md border border-[var(--border-soft)] opacity-25">
            </span>
            <span>Kein Zugriff</span>
          </div>
          <div className="flex items-center gap-2">
            <Lock className="h-3.5 w-3.5" />
            <span>Fixe System-Rolle — immer alle Rechte</span>
          </div>
          {isSuperAdmin && (
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-md border border-[var(--border-soft)] bg-amber-500/5 opacity-60 cursor-pointer">
                <Check className="h-3 w-3 text-emerald-400" strokeWidth={2.5} />
              </span>
              <span>Klickbar = Berechtigung an/aus (nicht-fixe Rollen)</span>
            </div>
          )}
          <span className="ml-auto text-[var(--text-subtle)]">
            Gespeichert in: <code className="rounded bg-[var(--surface-raised)] px-1">system_role_permissions</code> (DB)
          </span>
        </div>

        </>

      </div>
    </div>

    {/* ─── Modal: Neue Rolle erstellen ─────────────────────────────────────── */}
    {showCreateModal && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
        onClick={() => setShowCreateModal(false)}
      >
        <div
          className="w-full max-w-md rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] p-6 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="text-lg font-semibold text-[var(--text-main)] mb-1">Neue Rolle erstellen</h2>
          <p className="text-sm text-[var(--text-subtle)] mb-5">
            Die Rolle wird leer angelegt. Berechtigungen kannst du danach in der Matrix setzen.
          </p>
          <form onSubmit={(e) => { void handleCreate(e); }} className="space-y-4">
            <label className="block">
              <span className="text-sm text-[var(--text-subtle)]">Name der Rolle <span className="text-red-500">*</span></span>
              <input
                autoFocus
                className="mt-1 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="z.B. Vertriebs-Manager"
                maxLength={60}
              />
            </label>
            <label className="block">
              <span className="text-sm text-[var(--text-subtle)]">Beschreibung</span>
              <textarea
                className="mt-1 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 resize-none"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Kurze Beschreibung der Rolle…"
                rows={2}
                maxLength={200}
              />
            </label>
            {createErr && (
              <p className="text-sm text-red-600 dark:text-red-400">{createErr}</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg border border-[var(--border-soft)] px-4 py-2 text-sm text-[var(--text-subtle)] hover:text-[var(--text-main)] transition-colors"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={!newLabel.trim() || creating}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                <Plus className="h-3.5 w-3.5" />
                {creating ? "Erstellen…" : "Erstellen"}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}
    </>
  );
}
