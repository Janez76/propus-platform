import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent, KeyboardEvent } from "react";
import { Plus, Search, Trash2, X } from "lucide-react";

import { getOrders, type Order } from "../api/orders";
import { OrderSidePanel } from "../components/orders/OrderSidePanel";
import { PageHeader } from "../components/handoff";
import { useQuery } from "../hooks/useQuery";
import { ordersQueryKey } from "../lib/queryKeys";
import { normalizeStatusKey, type StatusKey } from "../lib/status";
import { useAuthStore } from "../store/authStore";
import { t as translate } from "../i18n";

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

  const queryKey = ordersQueryKey(token);
  const { data: allOrders = [], loading, error } = useQuery<Order[]>(
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

    for (const o of filteredOrders) {
      if (normalizeStatusKey(o.status) === "cancelled") continue;
      const override = cardOverrides[o.orderNo];
      const targetId =
        override && columnIdSet.has(override) ? override : defaultColumnFor(o);
      const bucket = buckets.get(targetId);
      if (bucket) bucket.push(o);
      else buckets.get(columns[0]?.id ?? "")?.push(o);
    }

    const cmp = (a: Order, b: Order) => {
      if (sort === "appointment") {
        const av = a.appointmentDate ? new Date(a.appointmentDate).getTime() : 0;
        const bv = b.appointmentDate ? new Date(b.appointmentDate).getTime() : 0;
        return bv - av;
      }
      // "created" → fall back to orderNo desc as proxy
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

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>, columnId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dropTargetCol !== columnId) setDropTargetCol(columnId);
  }, [dropTargetCol]);

  const handleDragLeave = useCallback((columnId: string) => {
    setDropTargetCol((prev) => (prev === columnId ? null : prev));
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>, columnId: string) => {
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
    <div className="padmin-shell space-y-4">
      <PageHeader
        title={t("orders.kanban.title")}
        sub={t("orders.kanban.description")}
      />

      <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-subtle)]" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("orders.kanban.search.placeholder")}
            className="h-9 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] pl-8 pr-3 text-sm text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)]"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as "created" | "appointment")}
          className="h-9 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)]"
          aria-label={t("orders.kanban.sort.created")}
        >
          <option value="created">{t("orders.kanban.sort.created")}</option>
          <option value="appointment">{t("orders.kanban.sort.appointment")}</option>
        </select>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div
        className="flex gap-3 overflow-x-auto pb-3"
        style={{ scrollbarGutter: "stable" } as CSSProperties}
      >
        {columns.map((col) => {
          const rows = ordersByColumn.get(col.id) ?? [];
          const dropActive = dropTargetCol === col.id;
          return (
            <article
              key={col.id}
              className="flex w-[280px] shrink-0 flex-col rounded-xl border border-[var(--border-soft)] bg-[var(--surface)]"
            >
              <header className="group flex items-center justify-between gap-2 border-b border-[var(--border-soft)] px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <h3 className="truncate text-sm font-semibold text-[var(--text-main)]" title={col.label}>
                    {col.label}
                  </h3>
                  <span className="rounded-full bg-[var(--surface-raised)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
                    {rows.length}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteColumn(col.id)}
                  className="invisible rounded p-1 text-[var(--text-subtle)] hover:bg-[var(--surface-raised)] hover:text-red-600 group-hover:visible"
                  aria-label={t("orders.kanban.column.delete")}
                  title={t("orders.kanban.column.delete")}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </header>
              <div
                className="flex flex-1 flex-col gap-2 p-2 transition-colors"
                data-drop-active={dropActive ? "true" : "false"}
                style={{
                  minHeight: 80,
                  background: dropActive ? "var(--accent-subtle)" : undefined,
                }}
                onDragOver={(e) => handleDragOver(e, col.id)}
                onDragLeave={() => handleDragLeave(col.id)}
                onDrop={(e) => handleDrop(e, col.id)}
              >
                {rows.length === 0 && !loading ? (
                  <div className="rounded-lg border border-dashed border-[var(--border-soft)] p-3 text-xs text-[var(--text-subtle)]">
                    {t("orders.kanban.column.empty")}
                  </div>
                ) : null}
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
            </article>
          );
        })}

        <article className="flex w-[280px] shrink-0 flex-col rounded-xl border border-dashed border-[var(--border-soft)] bg-[var(--surface)]">
          {adding ? (
            <div className="flex flex-col gap-2 p-3">
              <input
                ref={newColumnInputRef}
                type="text"
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                onKeyDown={onAddInputKey}
                placeholder={t("orders.kanban.column.addPlaceholder")}
                className="h-9 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)]"
              />
              <div className="flex justify-end gap-1">
                <button
                  type="button"
                  onClick={() => { setAdding(false); setNewColumnName(""); }}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--border-soft)] px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-raised)]"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={handleAddColumn}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--accent)] bg-[var(--accent)] px-2 py-1 text-xs text-white hover:opacity-90"
                >
                  <Plus className="h-3 w-3" aria-hidden="true" />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="m-2 inline-flex items-center justify-center gap-1 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-main)]"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("orders.kanban.column.add")}
            </button>
          )}
        </article>
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
      className="group/card w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)] p-3 text-left transition hover:border-[var(--border-strong)]"
      style={{ opacity: isDragging ? 0.4 : 1, cursor: "grab" }}
    >
      <div className="text-sm font-medium text-[var(--text-main)]">
        {titleLine || "—"} <span className="text-[var(--text-subtle)]">#{order.orderNo}</span>
      </div>
      {subLine ? (
        <div className="mt-1 text-xs text-[var(--text-muted)]">{subLine}</div>
      ) : null}
      <div className="mt-2 flex items-center justify-between gap-2">
        {showServiceTag ? (
          <span className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
            {serviceOrderTag}
          </span>
        ) : <span />}
        {photographerName ? (
          <span
            className="grid h-6 w-6 place-items-center rounded-full bg-[var(--accent-subtle)] text-[10px] font-semibold text-[var(--text-main)]"
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
