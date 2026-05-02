import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent, KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, RefreshCw, Search, Trash2, X } from "lucide-react";

import { getOrders, type Order } from "../api/orders";
import { OrderSidePanel } from "../components/orders/OrderSidePanel";
import { useQuery } from "../hooks/useQuery";
import { ordersQueryKey } from "../lib/queryKeys";
import { normalizeStatusKey, type StatusKey } from "../lib/status";
import { useAuthStore } from "../store/authStore";
import { t as translate } from "../i18n";

import "../styles/orders-kanban.css";

const LS_COLUMNS = "propus.orders.kanban.columns.v1";
const LS_CARD_COLUMN = "propus.orders.kanban.cardColumn.v1";

type KanbanColumn = { id: string; label: string };

const DEFAULT_COLUMN_KEYS = [
  "neu",
  "termin-abmachen",
  "termin-abgemacht",
  "wartet-kunde",
  "material-bearbeitung",
  "grundrisse-fehlen",
  "staging-fehlt",
  "video-fehlt",
  "bereit-versenden",
  "revision",
  "versendet",
  "bereit-verrechnung",
  "abgeschlossen",
] as const;

type DefaultColumnKey = (typeof DEFAULT_COLUMN_KEYS)[number];

const DEFAULT_COLUMN_LABEL_KEYS: Record<DefaultColumnKey, string> = {
  "neu": "orders.kanban.col.neu",
  "termin-abmachen": "orders.kanban.col.terminAbmachen",
  "termin-abgemacht": "orders.kanban.col.terminAbgemacht",
  "wartet-kunde": "orders.kanban.col.wartetKunde",
  "material-bearbeitung": "orders.kanban.col.materialBearbeitung",
  "grundrisse-fehlen": "orders.kanban.col.grundrisseFehlen",
  "staging-fehlt": "orders.kanban.col.stagingFehlt",
  "video-fehlt": "orders.kanban.col.videoFehlt",
  "bereit-versenden": "orders.kanban.col.bereitVersenden",
  "revision": "orders.kanban.col.revision",
  "versendet": "orders.kanban.col.versendet",
  "bereit-verrechnung": "orders.kanban.col.bereitVerrechnung",
  "abgeschlossen": "orders.kanban.col.abgeschlossen",
};

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
      return order.appointmentDate ? "termin-abmachen" : "neu";
    case "provisional":
    case "confirmed":
      return "termin-abgemacht";
    case "paused":
      return "wartet-kunde";
    case "completed":
      return "material-bearbeitung";
    case "done":
      return "bereit-verrechnung";
    case "archived":
      return "abgeschlossen";
    case "cancelled":
    default:
      return "neu";
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
  const [sidePanelNo, setSidePanelNo] = useState<string | null>(null);
  const [draggedOrderNo, setDraggedOrderNo] = useState<string | null>(null);
  const [dropTargetCol, setDropTargetCol] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const newColumnInputRef = useRef<HTMLInputElement | null>(null);

  // Hydrate from localStorage on mount.
  useEffect(() => {
    const stored = readLocal<KanbanColumn[] | null>(LS_COLUMNS, null);
    if (stored && Array.isArray(stored) && stored.length > 0) {
      setColumns(stored);
    }
    const overrides = readLocal<Record<string, string>>(LS_CARD_COLUMN, {});
    setCardOverrides(overrides);
    setHydrated(true);
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

    for (const o of filteredOrders) {
      if (normalizeStatusKey(o.status) === "cancelled") continue;
      const override = cardOverrides[o.orderNo];
      const targetId =
        override && columnIdSet.has(override)
          ? override
          : resolveColumnId(defaultColumnFor(o));
      if (!targetId) continue;
      const bucket = buckets.get(targetId);
      if (bucket) bucket.push(o);
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

    for (const [k, list] of buckets) buckets.set(k, [...list].sort(cmp));
    return buckets;
  }, [columns, filteredOrders, cardOverrides, columnIdSet, sort]);

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
      setCardOverrides((prev) => ({ ...prev, [orderNo]: columnId }));
    },
    [draggedOrderNo],
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
                <button
                  type="button"
                  onClick={() => handleDeleteColumn(col.id)}
                  className="pkanban__col-delete"
                  aria-label={t("orders.kanban.column.delete")}
                  title={t("orders.kanban.column.delete")}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
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

  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => onDragStart(e, order.orderNo)}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className="pkanban__card"
      data-dragging={isDragging ? "true" : undefined}
    >
      <div className="pkanban__card-title">
        {titleLine || "—"}{" "}
        <span className="pkanban__card-no">#{order.orderNo}</span>
      </div>
      {subLine ? (
        <div className="pkanban__card-sub">{subLine}</div>
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
