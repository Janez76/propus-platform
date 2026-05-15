import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent, KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { getOrders, updateOrderStatus, type Order } from "../api/orders";
import { OrderSidePanel } from "../components/orders/OrderSidePanel";
import { DeadlineBadge } from "../components/ui/DeadlineBadge";
import { useQuery } from "../hooks/useQuery";
import { ordersQueryKey } from "../lib/queryKeys";
import { getStatusLabel, normalizeStatusKey, type StatusKey } from "../lib/status";
import { useAuthStore } from "../store/authStore";
import { useQueryStore } from "../store/queryStore";
import { t as translate } from "../i18n";

import "../styles/orders-kanban.css";

const LS_COLUMNS = "propus.orders.kanban.columns.v1";
const LS_SHOW_CANCELLED = "propus.orders.kanban.showCancelled.v1";
const LS_CARD_COLUMN = "propus.orders.kanban.cardColumn.v1";

type KanbanColumn = { id: string; label: string };

// Genau 5 sichtbare Spalten + Storniert (Toggle). Bewusste Reduktion vom
// vorherigen 15-Spalten-Modell, in dem Sub-Phasen (grundrisse-fehlen,
// staging-fehlt, video-fehlt, bereit-versenden, revision, versendet) als
// localStorage-only Zustaende existierten — ohne Backend-Persistenz und
// damit pro-Browser inkonsistent.
const DEFAULT_COLUMN_KEYS = [
  "ausstehend",
  "bestaetigt",
  "wartet-kunde",
  "material-bearbeitung",
  "abgeschlossen",
  "storniert",
] as const;

type DefaultColumnKey = (typeof DEFAULT_COLUMN_KEYS)[number];

const DEFAULT_COLUMN_LABEL_KEYS: Record<DefaultColumnKey, string> = {
  "ausstehend": "orders.kanban.col.ausstehend",
  "bestaetigt": "orders.kanban.col.bestaetigt",
  "wartet-kunde": "orders.kanban.col.wartetKunde",
  "material-bearbeitung": "orders.kanban.col.materialBearbeitung",
  "abgeschlossen": "orders.kanban.col.abgeschlossen",
  "storniert": "orders.kanban.col.storniert",
};

/**
 * Mapping Spalte -> Backend-Status. Drag in eine Spalte schreibt diesen
 * Status. "Ausstehend" buendelt drei DB-Status (pending/provisional/
 * disposition_offen) — ein Drop SETZT pending, eine Karte die schon einer
 * dieser drei Status hat wird via defaultColumnFor ohnehin hier eingeordnet,
 * ohne dass es eines DB-Updates beduerfte.
 * "Abgeschlossen" enthaelt {done, archived}; Drop schreibt done (archive ist
 * ein read-only Folgestatus, der nur ueber das Detail-Menue erreichbar ist).
 */
const COLUMN_TO_STATUS: Partial<Record<DefaultColumnKey, StatusKey>> = {
  "ausstehend":          "pending",
  "bestaetigt":          "confirmed",
  "wartet-kunde":        "paused",
  "material-bearbeitung":"completed",
  "abgeschlossen":       "done",
  "storniert":           "cancelled",
};

// Alte Default-Spalten aus dem 15-Spalten-Modell. Werden beim Hydraten aus
// dem persistierten Spalten-Layout entfernt, falls sie noch im
// localStorage liegen. cardOverrides die auf einen dieser Werte zeigen
// werden ebenfalls bereinigt.
const LEGACY_DEFAULT_COLUMN_IDS = new Set<string>([
  "disposition-offen",
  "neu",
  "termin-abmachen",
  "termin-provisorisch",
  "termin-abgemacht",
  "grundrisse-fehlen",
  "staging-fehlt",
  "video-fehlt",
  "bereit-versenden",
  "revision",
  "versendet",
  "bereit-verrechnung",
]);

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* noop */
  }
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "spalte";
}

function uniqueColumnId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

function defaultColumnFor(order: Order): DefaultColumnKey {
  const k: StatusKey | null = normalizeStatusKey(order.status);
  switch (k) {
    case "pending":
    case "provisional":
    case "disposition_offen":
      return "ausstehend";
    case "confirmed":
      return "bestaetigt";
    case "paused":
      return "wartet-kunde";
    case "completed":
      return "material-bearbeitung";
    case "done":
    case "archived":
      return "abgeschlossen";
    case "cancelled":
      return "storniert";
    default:
      return "ausstehend";
  }
}

function initialsFromName(name?: string): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase() || "??";
}

export function OrdersKanbanPage() {
  const token = useAuthStore((s) => s.token);
  const lang = useAuthStore((s) => s.language);
  const t = useCallback((key: string) => translate(lang, key), [lang]);

  const navigate = useNavigate();
  const queryKey = ordersQueryKey(token);
  const { data: allOrders = [], error, isFetching, refetch } = useQuery<Order[]>(
    queryKey,
    () => getOrders(token),
    { enabled: Boolean(token), staleTime: 5 * 60 * 1000 },
  );

  const defaultColumns = useMemo<KanbanColumn[]>(
    () =>
      DEFAULT_COLUMN_KEYS.map((id) => ({
        id,
        label: t(DEFAULT_COLUMN_LABEL_KEYS[id]),
      })),
    [t],
  );

  const [columns, setColumns] = useState<KanbanColumn[]>(defaultColumns);
  const [cardOverrides, setCardOverrides] = useState<Record<string, string>>({});
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"created" | "appointment">("created");
  const [showCancelled, setShowCancelled] = useState<boolean>(false);
  const [sidePanelNo, setSidePanelNo] = useState<string | null>(null);
  const [draggedOrderNo, setDraggedOrderNo] = useState<string | null>(null);
  const [dropTargetCol, setDropTargetCol] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const newColumnInputRef = useRef<HTMLInputElement | null>(null);
  // Optimistic Backend-Status Overrides. Setzen wir beim Drop sofort, damit
  // die Karte in der Zielspalte landet bevor der Refetch zurueckkommt. Wenn
  // updateOrderStatus fehlschlaegt, revertieren wir den Eintrag.
  const [optimisticStatus, setOptimisticStatus] = useState<Record<string, StatusKey>>({});

  // Hydrate from localStorage on mount.
  useEffect(() => {
    const stored = readLocal<KanbanColumn[] | null>(LS_COLUMNS, null);
    if (stored && Array.isArray(stored) && stored.length > 0) {
      // Migration vom 15-Spalten-Modell auf 5+1 Spalten: alle Legacy-
      // Defaults (LEGACY_DEFAULT_COLUMN_IDS) werden entfernt, fehlende
      // neue Pflicht-Spalten ergaenzt. User-Custom-Spalten (alles was
      // weder in den neuen Defaults noch in den Legacy-Defaults vorkommt)
      // bleiben erhalten.
      const knownIds = new Set(stored.map((c) => c.id));
      let next = stored.filter((c) => !LEGACY_DEFAULT_COLUMN_IDS.has(c.id));
      const needed: DefaultColumnKey[] = [...DEFAULT_COLUMN_KEYS];
      // Wenn keine der neuen Pflicht-Spalten existiert, ersetzen wir das
      // Layout komplett mit den Defaults (alte Layouts ohne Schnittmenge).
      const hasAnyNew = needed.some((id) => knownIds.has(id));
      if (!hasAnyNew) {
        next = needed.map((id) => ({
          id,
          label: t(DEFAULT_COLUMN_LABEL_KEYS[id]),
        }));
      } else {
        for (const id of needed) {
          if (next.some((c) => c.id === id)) continue;
          next.push({ id, label: t(DEFAULT_COLUMN_LABEL_KEYS[id]) });
        }
      }
      setColumns(next);
    }
    const overrides = readLocal<Record<string, string>>(LS_CARD_COLUMN, {});
    // Overrides auf Legacy-Default-Spalten entfernen — sonst wuerde eine
    // Karte mit altem Override (z. B. "video-fehlt") in keiner sichtbaren
    // Spalte mehr landen.
    const cleanedOverrides: Record<string, string> = {};
    for (const [orderNo, colId] of Object.entries(overrides)) {
      if (!LEGACY_DEFAULT_COLUMN_IDS.has(colId)) {
        cleanedOverrides[orderNo] = colId;
      }
    }
    setCardOverrides(cleanedOverrides);
    setShowCancelled(readLocal<boolean>(LS_SHOW_CANCELLED, false));
    setHydrated(true);
    // t() wird hier intentional NICHT als dep gelistet — die Hydration soll
    // genau einmal beim Mount laufen. Lokalisierung der Default-Labels
    // passiert im separaten useEffect weiter unten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist column changes (skip until hydrated to avoid clobbering on first paint).
  useEffect(() => {
    if (!hydrated) return;
    writeLocal(LS_COLUMNS, columns);
  }, [columns, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    writeLocal(LS_CARD_COLUMN, cardOverrides);
  }, [cardOverrides, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    writeLocal(LS_SHOW_CANCELLED, showCancelled);
  }, [showCancelled, hydrated]);

  // Re-translate default columns when language changes — only for column ids
  // that still match a default key. User-renamed/added columns keep their label.
  useEffect(() => {
    setColumns((prev) =>
      prev.map((col) => {
        const key = DEFAULT_COLUMN_LABEL_KEYS[col.id as DefaultColumnKey];
        if (!key) return col;
        const fresh = t(key);
        return col.label === fresh ? col : { ...col, label: fresh };
      }),
    );
  }, [t]);

  // Focus input when adding a new column.
  useEffect(() => {
    if (adding) newColumnInputRef.current?.focus();
  }, [adding]);

  const filteredOrders = useMemo(() => {
    if (!query.trim()) return allOrders;
    const q = query.toLowerCase();
    return allOrders.filter((o) =>
      [o.orderNo, o.customerName, o.customerEmail, o.address, o.billing?.company]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [allOrders, query]);

  const columnIdSet = useMemo(() => new Set(columns.map((c) => c.id)), [columns]);

  // Effektiver Backend-Status der Karte: optimistic vorrangig vor o.status,
  // damit eine frisch verschobene Karte sofort in der Zielspalte sichtbar
  // ist (vor dem refetch). Sub-Spalten ohne Status-Mapping aendern den
  // Status nicht, fuer sie bleibt o.status massgebend.
  const effectiveOrderForRouting = useCallback(
    (o: Order): Order => {
      const o2 = optimisticStatus[o.orderNo];
      if (!o2) return o;
      return { ...o, status: o2 };
    },
    [optimisticStatus],
  );

  const ordersByColumn = useMemo(() => {
    const buckets = new Map<string, Order[]>();
    for (const col of columns) buckets.set(col.id, []);

    const resolveColumnId = (defaultId: string): string | null => {
      if (columnIdSet.has(defaultId)) return defaultId;
      // Default column has been deleted by the user. Walk forward through
      // DEFAULT_COLUMN_KEYS (later in the workflow) for the next visible
      // bucket; if none exist forward, walk backward; only as a final
      // resort use the last user column. We never silently dump cards
      // into columns[0], because that mixes e.g. "archived" into "Neu".
      const startIdx = DEFAULT_COLUMN_KEYS.indexOf(defaultId as DefaultColumnKey);
      if (startIdx >= 0) {
        for (let i = startIdx + 1; i < DEFAULT_COLUMN_KEYS.length; i += 1) {
          if (columnIdSet.has(DEFAULT_COLUMN_KEYS[i])) return DEFAULT_COLUMN_KEYS[i];
        }
        for (let i = startIdx - 1; i >= 0; i -= 1) {
          if (columnIdSet.has(DEFAULT_COLUMN_KEYS[i])) return DEFAULT_COLUMN_KEYS[i];
        }
      }
      return columns[columns.length - 1]?.id ?? null;
    };

    for (const o0 of filteredOrders) {
      const o = effectiveOrderForRouting(o0);
      const oStatusKey = normalizeStatusKey(o.status);
      if (!showCancelled && oStatusKey === "cancelled") continue;
      const override = cardOverrides[o.orderNo];
      // Override "storniert" nur fuer cancelled-Orders gelten lassen — sonst
      // koennte ein versehentliches Drop einer aktiven Karte in die
      // "storniert"-Spalte (waehrend showCancelled=true) sie unsichtbar machen,
      // sobald der Toggle ausgeschaltet wird (Spalte ausgeblendet, Karte
      // bleibt persistiert dort).
      //
      // Override gilt zusaetzlich NUR, wenn der gemappte Backend-Status zur
      // tatsaechlichen Order passt. Sonst koennte z. B. eine pending-Order
      // mit altem Override "termin-abgemacht" (=confirmed) faelschlich als
      // bestaetigt erscheinen, obwohl der Status-Update damals fehlschlug.
      const overrideStatus = override ? COLUMN_TO_STATUS[override as DefaultColumnKey] : undefined;
      const overrideStatusMatches = !overrideStatus || overrideStatus === oStatusKey;
      const overrideValid =
        !!override
        && columnIdSet.has(override)
        && overrideStatusMatches
        && (override !== "storniert" || (showCancelled && oStatusKey === "cancelled"));
      const targetId = overrideValid
        ? override
        : resolveColumnId(defaultColumnFor(o));
      if (!targetId) continue;
      const bucket = buckets.get(targetId);
      if (bucket) bucket.push(o0);
    }

    const orderNoNum = (no: string) => {
      const n = Number(no);
      return Number.isFinite(n) ? n : null;
    };

    const cmp = (a: Order, b: Order) => {
      if (sort === "appointment") {
        const av = a.appointmentDate ? new Date(a.appointmentDate).getTime() : 0;
        const bv = b.appointmentDate ? new Date(b.appointmentDate).getTime() : 0;
        return bv - av;
      }
      // "created" → newest first, using orderNo as proxy. Compare numerically
      // when both ids parse as numbers so that #1000 sorts before #999.
      const aNum = orderNoNum(a.orderNo);
      const bNum = orderNoNum(b.orderNo);
      if (aNum !== null && bNum !== null) return bNum - aNum;
      return String(b.orderNo).localeCompare(String(a.orderNo));
    };

    /** Disposition-Spalte: knappste Deadline zuerst (ASC). Aufträge ohne
     *  Deadline rutschen ans Ende. */
    const cmpDeadline = (a: Order, b: Order) => {
      const av = a.deadlineAt ? new Date(a.deadlineAt).getTime() : Number.POSITIVE_INFINITY;
      const bv = b.deadlineAt ? new Date(b.deadlineAt).getTime() : Number.POSITIVE_INFINITY;
      return av - bv;
    };

    for (const [k, list] of buckets) {
      const sorter = k === "disposition-offen" ? cmpDeadline : cmp;
      buckets.set(k, [...list].sort(sorter));
    }
    return buckets;
  }, [columns, filteredOrders, cardOverrides, columnIdSet, sort, showCancelled, effectiveOrderForRouting]);

  const sidePanelOrder = useMemo(
    () => (sidePanelNo ? allOrders.find((o) => o.orderNo === sidePanelNo) ?? null : null),
    [allOrders, sidePanelNo],
  );

  const handleDragStart = useCallback((e: DragEvent<HTMLButtonElement>, orderNo: string) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", orderNo);
    setDraggedOrderNo(orderNo);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedOrderNo(null);
    setDropTargetCol(null);
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLElement>, columnId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dropTargetCol !== columnId) setDropTargetCol(columnId);
  }, [dropTargetCol]);

  const handleDragLeave = useCallback((columnId: string) => {
    setDropTargetCol((prev) => (prev === columnId ? null : prev));
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLElement>, columnId: string) => {
      e.preventDefault();
      const orderNo = e.dataTransfer.getData("text/plain") || draggedOrderNo;
      setDraggedOrderNo(null);
      setDropTargetCol(null);
      if (!orderNo) return;

      const order = allOrders.find((o) => o.orderNo === orderNo);
      if (!order) return;

      const targetStatus = COLUMN_TO_STATUS[columnId as DefaultColumnKey];
      const currentStatus = normalizeStatusKey(order.status);

      // Reine UI-Position (User-Custom-Spalte ohne Status-Mapping ODER
      // Sub-Spalte mit gleichem Status wie aktuell): nur Override setzen,
      // keine API-Anfrage.
      if (!targetStatus || targetStatus === currentStatus) {
        setCardOverrides((prev) => ({ ...prev, [orderNo]: columnId }));
        return;
      }

      // Status-Wechsel: optimistic, API-Call, bei Fehler revertieren.
      if (!token) {
        toast.error(t("orders.kanban.dropAuthError") || "Nicht angemeldet — Statusaenderung abgebrochen.");
        return;
      }

      const prevOverride = cardOverrides[orderNo];
      setOptimisticStatus((prev) => ({ ...prev, [orderNo]: targetStatus }));
      setCardOverrides((prev) => ({ ...prev, [orderNo]: columnId }));

      const fromLabel = getStatusLabel(currentStatus || order.status);
      const toLabel = getStatusLabel(targetStatus);

      (async () => {
        try {
          await updateOrderStatus(token, orderNo, targetStatus, { sendEmails: false });
          await refetch({ force: true });
          // Cache invalidieren, damit Dashboard/Map nicht stale sind
          useQueryStore.getState().invalidate(queryKey);
          // optimistic-Eintrag entfernen — refetch hat den DB-Stand geladen
          setOptimisticStatus((prev) => {
            const next = { ...prev };
            delete next[orderNo];
            return next;
          });
          toast.success(
            (t("orders.kanban.dropSuccess") || "Status geaendert: {{from}} -> {{to}}")
              .replace("{{from}}", fromLabel)
              .replace("{{to}}", toLabel),
          );
        } catch (err) {
          // Revert: optimistic + override
          setOptimisticStatus((prev) => {
            const next = { ...prev };
            delete next[orderNo];
            return next;
          });
          setCardOverrides((prev) => {
            const next = { ...prev };
            if (prevOverride === undefined) delete next[orderNo];
            else next[orderNo] = prevOverride;
            return next;
          });
          const msg = err instanceof Error ? err.message : String(err);
          toast.error(
            (t("orders.kanban.dropError") || "Statusaenderung fehlgeschlagen: {{msg}}")
              .replace("{{msg}}", msg),
          );
        }
      })();
    },
    [allOrders, cardOverrides, draggedOrderNo, queryKey, refetch, t, token],
  );

  const handleAddColumn = useCallback(() => {
    const label = newColumnName.trim();
    if (!label) {
      setAdding(false);
      setNewColumnName("");
      return;
    }
    const taken = new Set(columns.map((c) => c.id));
    const id = uniqueColumnId(slugify(label), taken);
    setColumns((prev) => [...prev, { id, label }]);
    setAdding(false);
    setNewColumnName("");
  }, [columns, newColumnName]);

  const handleDeleteColumn = useCallback((columnId: string) => {
    // "storniert" ist eine geschuetzte Pflicht-Spalte: ohne sie kippen
    // cancelled-Karten via resolveColumnId() in andere Buckets (z.B.
    // "abgeschlossen") und tauchen unerwartet in aktiven Spalten auf.
    if (columnId === "storniert") return;
    const col = columns.find((c) => c.id === columnId);
    if (!col) return;
    const msg = t("orders.kanban.column.deleteConfirm").replace("{{name}}", col.label);
    if (typeof window !== "undefined" && !window.confirm(msg)) return;
    setColumns((prev) => prev.filter((c) => c.id !== columnId));
    setCardOverrides((prev) => {
      const next: Record<string, string> = {};
      for (const [orderNo, colId] of Object.entries(prev)) {
        if (colId !== columnId) next[orderNo] = colId;
      }
      return next;
    });
  }, [columns, t]);

  const onAddInputKey = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddColumn();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setAdding(false);
      setNewColumnName("");
    }
  }, [handleAddColumn]);

  return (
    <div className="padmin-shell pkanban flex min-h-0 flex-1 flex-col -mx-4 w-[calc(100%+2rem)] sm:-mx-6 sm:w-[calc(100%+3rem)] lg:-mx-8 lg:w-[calc(100%+4rem)]">
      {/* Tabs row — only Liste/Kanban for now since there is no separate
          "Tabelle" view in this codebase (OrdersPage uses a single list). */}
      <nav className="pkanban__tabs" aria-label={t("orders.kanban.title")}>
        <Link to="/orders" className="pkanban__tab" data-active="false">
          {t("nav.item.ordersList")}
        </Link>
        <span className="pkanban__tab" data-active="true" aria-current="page">
          {t("nav.item.ordersKanban")}
        </span>
      </nav>

      {/* Toolbar */}
      <div className="pkanban__toolbar">
        <button
          type="button"
          onClick={() => navigate("/orders?create=1")}
          className="pkanban__btn pkanban__btn--primary"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>{t("orders.button.newOrder")}</span>
        </button>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as "created" | "appointment")}
          className="pkanban__select"
          aria-label={t("orders.kanban.sort.created")}
        >
          <option value="created">{t("orders.kanban.sort.created")}</option>
          <option value="appointment">{t("orders.kanban.sort.appointment")}</option>
        </select>
        <div className="pkanban__search">
          <Search className="pkanban__search-icon" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("orders.kanban.search.placeholder")}
            className="pkanban__search-input"
          />
        </div>
        <label className="ml-2 inline-flex cursor-pointer items-center gap-1.5 text-xs text-[var(--text-muted)]">
          <input
            type="checkbox"
            checked={showCancelled}
            onChange={(e) => setShowCancelled(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-[var(--border-strong)] text-[var(--accent)] focus:ring-[var(--accent)]/30"
          />
          {t("orders.kanban.showCancelled")}
        </label>
        <div className="pkanban__toolbar-spacer" />
        <button
          type="button"
          onClick={() => void refetch({ force: true })}
          className="pkanban__icon-btn"
          aria-label="Refresh"
          title="Refresh"
          disabled={isFetching}
          data-busy={isFetching ? "true" : undefined}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {error ? (
        <div className="pkanban__error">{error}</div>
      ) : null}

      <div
        className="pkanban__board"
        style={{ scrollbarGutter: "stable" } as CSSProperties}
      >
        {columns.map((col) => {
          // "storniert"-Spalte nur anzeigen wenn der Toggle aktiv ist —
          // ansonsten visuell ausblenden (cancelled-Auftraege werden bereits
          // in ordersByColumn gefiltert, aber die leere Spalte wuerde sonst
          // immer Platz beanspruchen).
          if (col.id === "storniert" && !showCancelled) return null;
          const rows = ordersByColumn.get(col.id) ?? [];
          const dropActive = dropTargetCol === col.id;
          return (
            <section
              key={col.id}
              className="pkanban__column"
              data-drop-active={dropActive ? "true" : "false"}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDragLeave={() => handleDragLeave(col.id)}
              onDrop={(e) => handleDrop(e, col.id)}
            >
              <header className="pkanban__col-header group">
                <h3 className="pkanban__col-title" title={col.label}>
                  {col.label}{" "}
                  <span className="pkanban__col-count">({rows.length})</span>
                </h3>
                {col.id !== "storniert" ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteColumn(col.id)}
                    className="pkanban__col-delete"
                    aria-label={t("orders.kanban.column.delete")}
                    title={t("orders.kanban.column.delete")}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                ) : null}
              </header>
              <div className="pkanban__col-body">
                {rows.map((o) => (
                  <KanbanCard
                    key={o.orderNo}
                    order={o}
                    onOpen={() => setSidePanelNo(o.orderNo)}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    isDragging={draggedOrderNo === o.orderNo}
                    serviceOrderTag={t("orders.kanban.tag.serviceOrder")}
                  />
                ))}
              </div>
            </section>
          );
        })}

        <section className="pkanban__column pkanban__column--add">
          {adding ? (
            <div className="pkanban__add-form">
              <input
                ref={newColumnInputRef}
                type="text"
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                onKeyDown={onAddInputKey}
                placeholder={t("orders.kanban.column.addPlaceholder")}
                className="pkanban__add-input"
              />
              <div className="pkanban__add-actions">
                <button
                  type="button"
                  onClick={() => { setAdding(false); setNewColumnName(""); }}
                  className="pkanban__btn pkanban__btn--ghost"
                  aria-label="Abbrechen"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={handleAddColumn}
                  className="pkanban__btn pkanban__btn--primary"
                  aria-label={t("orders.kanban.column.add")}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="pkanban__add-trigger"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("orders.kanban.column.add")}
            </button>
          )}
        </section>
      </div>

      <OrderSidePanel
        open={Boolean(sidePanelNo && sidePanelOrder)}
        order={sidePanelOrder}
        onClose={() => setSidePanelNo(null)}
        lang={lang}
      />
    </div>
  );
}

function KanbanCard({
  order,
  onOpen,
  onDragStart,
  onDragEnd,
  isDragging,
  serviceOrderTag,
}: {
  order: Order;
  onOpen: () => void;
  onDragStart: (e: DragEvent<HTMLButtonElement>, orderNo: string) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  serviceOrderTag: string;
}) {
  const titleLine = [order.address, order.customerZipcity].filter(Boolean).join(", ");
  const company = order.billing?.company || "";
  const contact = order.customerName || "";
  const subLine = [company, contact].filter(Boolean).join(" · ");
  const photographerName = order.photographer?.name || "";
  const initials = initialsFromName(photographerName);
  const showServiceTag = Boolean(order.exxasOrderId);
  const statusKey = normalizeStatusKey(order.status);
  const isProvisional = statusKey === "provisional";
  // Verbleibende Tage bis Ablauf eines Provisoriums (max. 3 Tage Spec).
  // Negativ = abgelaufen (sollte vom Expiry-Job kassiert werden); 0 = heute.
  const provExpiresInDays = (() => {
    if (!isProvisional || !order.provisionalExpiresAt) return null;
    const d = new Date(order.provisionalExpiresAt);
    if (Number.isNaN(d.getTime())) return null;
    const now = new Date();
    return Math.ceil((d.getTime() - now.getTime()) / 86_400_000);
  })();

  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => onDragStart(e, order.orderNo)}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className="pkanban__card"
      data-dragging={isDragging ? "true" : undefined}
      data-status={statusKey ?? undefined}
    >
      <div className="pkanban__card-title">
        {titleLine || "—"}{" "}
        <span className="pkanban__card-no">#{order.orderNo}</span>
      </div>
      {subLine ? (
        <div className="pkanban__card-sub">{subLine}</div>
      ) : null}
      {isProvisional ? (
        <div className="pkanban__card-meta mt-1">
          <span
            className="inline-flex items-center rounded-full border border-violet-500/40 bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-700"
            title={order.provisionalExpiresAt || undefined}
          >
            {provExpiresInDays === null
              ? "Provisorisch"
              : provExpiresInDays < 0
                ? "Provisorium abgelaufen"
                : provExpiresInDays === 0
                  ? "Provisorium läuft heute ab"
                  : `Provisorium: noch ${provExpiresInDays} Tag${provExpiresInDays === 1 ? "" : "e"}`}
          </span>
        </div>
      ) : null}
      {order.deadlineAt ? (
        <div className="pkanban__card-meta mt-1">
          <DeadlineBadge deadlineAt={order.deadlineAt} />
        </div>
      ) : null}
      <div className="pkanban__card-foot">
        {showServiceTag ? (
          <span className="pkanban__card-tag">{serviceOrderTag}</span>
        ) : (
          <span />
        )}
        {photographerName ? (
          <span
            className="pkanban__card-avatar"
            title={photographerName}
            aria-label={photographerName}
          >
            {initials}
          </span>
        ) : null}
      </div>
    </button>
  );
}
