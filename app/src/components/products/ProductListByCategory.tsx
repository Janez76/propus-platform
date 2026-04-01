import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Camera, Copy, GripVertical, Plane, Search, Sparkles } from "lucide-react";
import { cn } from "../../lib/utils";
import { updateProduct, type Product } from "../../api/products";
import type { ServiceCategory } from "../../api/serviceCategories";
import { updateServiceCategory } from "../../api/serviceCategories";
import { t, type Lang } from "../../i18n";
import { useAuthStore } from "../../store/authStore";
import { useQueryStore } from "../../store/queryStore";
import { RichTextEditor } from "../ui/RichTextEditor";

type Props = {
  products: Product[];
  categories: ServiceCategory[];
  query: string;
  onQueryChange: (value: string) => void;
  onEdit: (product: Product) => void;
  onDuplicate: (product: Product) => void;
  onToggleActive: (product: Product) => void;
  token: string | null;
  productsQueryKey: string;
  categoriesQueryKey: string;
  onDeleteCategory: (cat: ServiceCategory) => void;
  /** Nach DnD-Persistenz: Queries vom Server neu laden (invalidate allein reicht nicht) */
  onAfterPersist?: () => void | Promise<void>;
};

type ProductGroup = {
  key: string;
  label: string;
  items: Product[];
};

function productRulePriceLabel(product: Product) {
  const firstRule = (product.rules || []).find((r) => r?.active !== false);
  const cfg = (firstRule?.config_json || {}) as Record<string, unknown>;
  if (firstRule?.rule_type === "per_floor") return `${Number(cfg.unitPrice || 0)} CHF / Etage`;
  if (firstRule?.rule_type === "per_room") return `${Number(cfg.unitPrice || 0)} CHF / Einheit`;
  if (firstRule?.rule_type === "area_tier") {
    return `${Number((cfg.tiers as Array<{ price?: number }> | undefined)?.[0]?.price || cfg.basePrice || 0)} CHF`;
  }
  return `${Number(cfg.price || 0)} CHF`;
}

function ProductKindIcon({ product }: { product: Product }) {
  const name = String(product.name || "").toLowerCase();
  const code = String(product.code || "").toLowerCase();
  if (name.includes("bodenfoto") || code.includes("camera:")) {
    return <Camera className="h-4 w-4 text-[var(--accent)]" />;
  }
  if (name.includes("luftaufnahme") || code.includes("drone")) {
    return <Plane className="h-4 w-4 text-[var(--accent)]" />;
  }
  return <Sparkles className="h-4 w-4 text-[var(--accent)]" />;
}

function sortProductsByOrder(a: Product, b: Product) {
  const da = Number(a.sort_order || 0) - Number(b.sort_order || 0);
  if (da !== 0) return da;
  return a.id - b.id;
}

function getGroupLabel(groupKey: string) {
  const group = String(groupKey || "").trim().toLowerCase();
  if (group === "dronephoto") return "Drone Foto";
  if (group === "dronevideo") return "Drohnenvideo";
  if (group === "groundvideo") return "Bodenvideo";
  if (group === "camera") return "Foto";
  return groupKey || "—";
}

function catId(key: string) {
  return `cat:${key}`;
}

function prodId(id: number) {
  return `prod:${id}`;
}

// ---------------------------------------------------------------------------
// Product card (sortable within its category's own DndContext)
// ---------------------------------------------------------------------------

type SortableProductCardProps = {
  product: Product;
  lang: Lang;
  dndDisabled: boolean;
  btnSmallClass: string;
  onEdit: (product: Product) => void;
  onDuplicate: (product: Product) => void;
  onToggleActive: (product: Product) => void;
};

function SortableProductCard({
  product,
  lang,
  dndDisabled,
  btnSmallClass,
  onEdit,
  onDuplicate,
  onToggleActive,
}: SortableProductCardProps) {
  const id = prodId(product.id);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: dndDisabled,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-lg border p-3 border-[var(--border-soft)] bg-[var(--surface)]/60",
        isDragging && "z-10 opacity-80 ring-2 ring-[var(--accent)]/40",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {!dndDisabled ? (
          <button
            type="button"
            className="mt-0.5 shrink-0 cursor-grab touch-none rounded p-1 text-[var(--accent)]/80 hover:bg-[var(--accent)]/15 hover:text-[var(--accent)] active:cursor-grabbing"
            aria-label={t(lang, "catalog.dnd.dragProduct")}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <ProductKindIcon product={product} />
            <div className="truncate font-semibold">{product.name}</div>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                product.affects_travel === false
                  ? "bg-[var(--surface-raised)] text-[var(--text-muted)]"
                  : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
              )}
            >
              {t(lang, product.affects_travel === false ? "catalog.label.travelNo" : "catalog.label.travelYes")}
            </span>
          </div>
          <div className="mt-1 text-xs text-[var(--text-subtle)]">
            {product.code} · {product.kind} · {getGroupLabel(String(product.group_key || ""))} · {productRulePriceLabel(product)}
          </div>
          {product.affects_duration ? (
            <div className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              {t(lang, "catalog.label.durationMinutes").replace("{{n}}", String(Number(product.duration_minutes || 0)))}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={() => onEdit(product)}
            className={`${btnSmallClass} border border-[var(--border-soft)] text-[var(--text-main)] hover:bg-[var(--surface-raised)]`}
          >
            {t(lang, "common.edit")}
          </button>
          <button
            type="button"
            onClick={() => onDuplicate(product)}
            className={`${btnSmallClass} border border-[var(--border-soft)] text-[var(--text-main)] hover:bg-[var(--surface-raised)]`}
          >
            <Copy className="h-3 w-3" /> {t(lang, "catalog.button.duplicate")}
          </button>
          <button
            type="button"
            onClick={() => onToggleActive(product)}
            className={cn(
              btnSmallClass,
              product.active
                ? "border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                : "border border-[var(--border-soft)] text-[var(--text-main)] hover:bg-[var(--surface-raised)]",
            )}
          >
            {product.active ? t(lang, "common.deactivate") : t(lang, "common.activate")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Product list with its own DndContext (used inside each category section)
// ---------------------------------------------------------------------------

type ProductDndListProps = {
  items: Product[];
  lang: Lang;
  dndDisabled: boolean;
  btnSmallClass: string;
  onEdit: (product: Product) => void;
  onDuplicate: (product: Product) => void;
  onToggleActive: (product: Product) => void;
  onReorder: (oldIndex: number, newIndex: number) => void;
};

function ProductDndList({
  items,
  lang,
  dndDisabled,
  btnSmallClass,
  onEdit,
  onDuplicate,
  onToggleActive,
  onReorder,
}: ProductDndListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const sortableIds = useMemo(() => items.map((p) => prodId(p.id)), [items]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (dndDisabled) return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = sortableIds.indexOf(String(active.id));
      const newIndex = sortableIds.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      onReorder(oldIndex, newIndex);
    },
    [dndDisabled, sortableIds, onReorder],
  );

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed px-3 py-2 text-xs border-[var(--border-soft)] text-[var(--text-subtle)]">
        {t(lang, "catalog.category.empty")}
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        {items.map((product) => (
          <SortableProductCard
            key={product.id}
            product={product}
            lang={lang}
            dndDisabled={dndDisabled}
            btnSmallClass={btnSmallClass}
            onEdit={onEdit}
            onDuplicate={onDuplicate}
            onToggleActive={onToggleActive}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
}

// ---------------------------------------------------------------------------
// Category section (sortable for category reorder; products have own DndContext)
// ---------------------------------------------------------------------------

type SortableCategorySectionProps = {
  group: ProductGroup;
  category: ServiceCategory;
  lang: Lang;
  dndDisabled: boolean;
  open: boolean;
  onToggle: () => void;
  btnSmallClass: string;
  onEdit: (product: Product) => void;
  onDuplicate: (product: Product) => void;
  onToggleActive: (product: Product) => void;
  onDeleteCategory: (cat: ServiceCategory) => void;
  onDeactivate: (cat: ServiceCategory) => Promise<void>;
  nameDraft: string;
  onNameChange: (key: string, val: string) => void;
  onNameSave: (cat: ServiceCategory, val: string) => Promise<void>;
  descriptionDraft: string;
  onDescriptionChange: (key: string, val: string) => void;
  onDescriptionSave: (cat: ServiceCategory, val: string) => Promise<void>;
  categoryBusy: boolean;
  onProductReorder: (groupKey: string, oldIndex: number, newIndex: number) => void;
};

function SortableCategorySection({
  group,
  category,
  lang,
  dndDisabled,
  open,
  onToggle,
  btnSmallClass,
  onEdit,
  onDuplicate,
  onToggleActive,
  onDeleteCategory,
  onDeactivate,
  nameDraft,
  onNameChange,
  onNameSave,
  descriptionDraft,
  onDescriptionChange,
  onDescriptionSave,
  categoryBusy,
  onProductReorder,
}: SortableCategorySectionProps) {
  const sortableId = catId(group.key);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
    disabled: dndDisabled,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleReorder = useCallback(
    (oldIndex: number, newIndex: number) => onProductReorder(group.key, oldIndex, newIndex),
    [group.key, onProductReorder],
  );

  const descSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const debouncedDescSave = useCallback(
    (html: string) => {
      onDescriptionChange(category.key, html);
      clearTimeout(descSaveTimer.current);
      descSaveTimer.current = setTimeout(() => onDescriptionSave(category, html), 600);
    },
    [category, onDescriptionChange, onDescriptionSave],
  );
  useEffect(() => () => clearTimeout(descSaveTimer.current), []);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("rounded-lg border border-[var(--border-soft)]", isDragging && "z-10 opacity-90 ring-2 ring-[var(--accent)]/40")}
    >
      <details className="group/details" open={open}>
        <summary
          className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--surface-raised)]"
          onClick={(e) => e.preventDefault()}
        >
          {!dndDisabled ? (
            <button
              type="button"
              className="shrink-0 cursor-grab touch-none rounded p-1 text-[var(--accent)]/80 hover:bg-[var(--accent)]/15 hover:text-[var(--accent)] active:cursor-grabbing"
              aria-label={t(lang, "catalog.dnd.dragCategory")}
              {...attributes}
              {...listeners}
              onClick={(e) => e.preventDefault()}
            >
              <GripVertical className="h-4 w-4" />
            </button>
          ) : null}
          <div
            className="min-w-0 flex flex-1 flex-wrap items-center gap-1.5 sm:gap-2"
            onClick={(e) => {
              e.preventDefault();
              onToggle();
            }}
            role="presentation"
          >
            <button
              type="button"
              className="shrink-0 rounded px-1 text-xs text-[var(--text-subtle)] hover:bg-[var(--surface-raised)]/50 hover:text-[var(--text-main)]"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggle();
              }}
            >
              {group.items.length}
            </button>
            <input
              className="ui-input h-8 min-w-[120px] flex-1 text-sm font-medium sm:min-w-[180px]"
              value={nameDraft}
              disabled={categoryBusy}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onChange={(e) => onNameChange(category.key, e.target.value)}
              onBlur={async (e) => {
                await onNameSave(category, e.target.value);
              }}
            />
            <span className="text-xs text-[var(--text-subtle)]">({category.key})</span>
            <button
              type="button"
              className={cn(
                btnSmallClass,
                category.active
                  ? "border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                  : "border border-[var(--border-soft)] text-[var(--text-main)] hover:bg-[var(--surface-raised)]",
              )}
              disabled={categoryBusy}
              onClick={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await onDeactivate(category);
              }}
            >
              {category.active ? t(lang, "common.deactivate") : t(lang, "common.activate")}
            </button>
            <button
              type="button"
              className={cn(
                btnSmallClass,
                "border border-[var(--border-soft)] text-[var(--text-main)] hover:bg-[var(--surface-raised)]",
              )}
              disabled={categoryBusy}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDeleteCategory(category);
              }}
            >
              {t(lang, "catalog.category.remove")}
            </button>
          </div>
        </summary>
        <div className="space-y-2 border-t p-2 border-[var(--border-soft)]">
          <RichTextEditor
            value={descriptionDraft}
            onChange={debouncedDescSave}
            placeholder={t(lang, "catalog.categoryManager.descriptionPlaceholder")}
            className="text-xs"
          />
          <ProductDndList
            items={group.items}
            lang={lang}
            dndDisabled={dndDisabled}
            btnSmallClass={btnSmallClass}
            onEdit={onEdit}
            onDuplicate={onDuplicate}
            onToggleActive={onToggleActive}
            onReorder={handleReorder}
          />
        </div>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Unassigned section (not sortable as category, but products inside are)
// ---------------------------------------------------------------------------

type UnassignedCategorySectionProps = {
  group: ProductGroup;
  lang: Lang;
  dndDisabled: boolean;
  open: boolean;
  onToggle: () => void;
  btnSmallClass: string;
  onEdit: (product: Product) => void;
  onDuplicate: (product: Product) => void;
  onToggleActive: (product: Product) => void;
  onProductReorder: (groupKey: string, oldIndex: number, newIndex: number) => void;
};

function UnassignedCategorySection({
  group,
  lang,
  dndDisabled,
  open,
  onToggle,
  btnSmallClass,
  onEdit,
  onDuplicate,
  onToggleActive,
  onProductReorder,
}: UnassignedCategorySectionProps) {
  const handleReorder = useCallback(
    (oldIndex: number, newIndex: number) => onProductReorder(group.key, oldIndex, newIndex),
    [group.key, onProductReorder],
  );

  return (
    <div className="rounded-lg border border-[var(--border-soft)]">
      <details className="group/details" open={open}>
        <summary
          className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--surface-raised)]"
          onClick={(e) => e.preventDefault()}
        >
          <span
            className="min-w-0 flex-1 pl-1"
            onClick={() => {
              onToggle();
            }}
            role="presentation"
          >
            {group.label} ({group.items.length})
          </span>
        </summary>
        <div className="space-y-2 border-t p-2 border-[var(--border-soft)]">
          <ProductDndList
            items={group.items}
            lang={lang}
            dndDisabled={dndDisabled}
            btnSmallClass={btnSmallClass}
            onEdit={onEdit}
            onDuplicate={onDuplicate}
            onToggleActive={onToggleActive}
            onReorder={handleReorder}
          />
        </div>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ProductListByCategory({
  products,
  categories,
  query,
  onQueryChange,
  onEdit,
  onDuplicate,
  onToggleActive,
  token,
  productsQueryKey,
  categoriesQueryKey,
  onDeleteCategory,
  onAfterPersist,
}: Props) {
  const lang = useAuthStore((s) => s.language);
  const [openGroupKeys, setOpenGroupKeys] = useState<Record<string, boolean>>({});
  const [categoryOrder, setCategoryOrder] = useState<string[] | null>(null);
  const [productOrder, setProductOrder] = useState<Map<string, number[]>>(new Map());
  const [reorderError, setReorderError] = useState("");
  const [reordering, setReordering] = useState(false);
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [categoryError, setCategoryError] = useState("");
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [descriptionDrafts, setDescriptionDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    setNameDrafts(Object.fromEntries(categories.map((c) => [c.key, c.name])));
    setDescriptionDrafts(Object.fromEntries(categories.map((c) => [c.key, c.description ?? ""])));
  }, [categories]);

  const btnSmallClass =
    "inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors";
  const q = query.trim().toLowerCase();
  const dndDisabled = Boolean(q) || !token;

  const filteredProducts = q
    ? products.filter((p) => [p.name, p.code, p.group_key, p.kind].join(" ").toLowerCase().includes(q))
    : products;

  const baseCategoryKeys = useMemo(() => {
    return (categories || [])
      .filter((c) => c.active !== false)
      .sort(
        (a, b) =>
          (Number(a.sort_order || 0) - Number(b.sort_order || 0)) || String(a.name || "").localeCompare(String(b.name || ""), "de"),
      )
      .map((c) => c.key);
  }, [categories]);

  const baseCategoryKeysSig = baseCategoryKeys.join("\0");
  useEffect(() => {
    setCategoryOrder(null);
  }, [baseCategoryKeysSig]);

  const productsSig = products.map((p) => `${p.id}:${p.sort_order}`).join(",");
  useEffect(() => {
    setProductOrder(new Map());
  }, [productsSig]);

  const orderedCategoryKeys = categoryOrder ?? baseCategoryKeys;

  const { sortableGroups, unassignedGroup } = useMemo(() => {
    const sortableGroupsInner: ProductGroup[] = orderedCategoryKeys.map((key) => ({
      key,
      label: categories.find((c) => c.key === key)?.name || key,
      items: [],
    }));
    const unassigned: ProductGroup = { key: "__unassigned__", label: "Ohne Kategorie", items: [] };

    for (const product of filteredProducts) {
      const categoryKey = String(product.category_key || product.group_key || "").trim();
      const group = sortableGroupsInner.find((g) => g.key === categoryKey);
      if (group) {
        group.items.push(product);
      } else {
        unassigned.items.push(product);
      }
    }

    for (const group of [...sortableGroupsInner, unassigned]) {
      const override = productOrder.get(group.key);
      if (override && override.length > 0) {
        group.items.sort((a, b) => {
          const ai = override.indexOf(a.id);
          const bi = override.indexOf(b.id);
          if (ai >= 0 && bi >= 0) return ai - bi;
          if (ai >= 0) return -1;
          if (bi >= 0) return 1;
          return sortProductsByOrder(a, b);
        });
      } else {
        group.items.sort(sortProductsByOrder);
      }
    }

    return {
      sortableGroups: sortableGroupsInner,
      unassignedGroup: unassigned.items.length ? unassigned : null,
    };
  }, [orderedCategoryKeys, categories, filteredProducts, productOrder]);

  useEffect(() => {
    const availableKeys = sortableGroups.map((group) => group.key);
    if (unassignedGroup) availableKeys.push(unassignedGroup.key);

    setOpenGroupKeys((prev) => {
      const next: Record<string, boolean> = {};
      for (const key of availableKeys) {
        next[key] = prev[key] ?? true;
      }
      const prevKeys = Object.keys(prev);
      const changed =
        prevKeys.length !== availableKeys.length ||
        availableKeys.some((key) => prev[key] !== next[key]);
      return changed ? next : prev;
    });
  }, [sortableGroups, unassignedGroup]);

  const categorySortableIds = useMemo(() => sortableGroups.map((g) => catId(g.key)), [sortableGroups]);

  const categorySensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // ---- Category reorder ----

  const persistCategoryOrder = useCallback(
    async (nextKeys: string[]) => {
      if (!token) return;
      setReorderError("");
      setReordering(true);
      try {
        const tasks: Promise<unknown>[] = [];
        nextKeys.forEach((key, index) => {
          const sort_order = (index + 1) * 10;
          const cat = categories.find((c) => c.key === key);
          if (cat && Number(cat.sort_order || 0) !== sort_order) {
            tasks.push(updateServiceCategory(token, key, { sort_order }));
          }
        });
        await Promise.all(tasks);
        setCategoryOrder(null);
        useQueryStore.getState().invalidate(productsQueryKey);
        useQueryStore.getState().invalidate(categoriesQueryKey);
        await onAfterPersist?.();
      } catch (e) {
        setCategoryOrder(null);
        setReorderError(e instanceof Error ? e.message : t(lang, "catalog.dnd.error"));
      } finally {
        setReordering(false);
      }
    },
    [token, categories, productsQueryKey, categoriesQueryKey, lang, onAfterPersist],
  );

  const handleCategoryDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (dndDisabled) return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const keys = categoryOrder ?? baseCategoryKeys;
      const fromKey = String(active.id).slice(4);
      const toKey = String(over.id).slice(4);
      const oldIndex = keys.indexOf(fromKey);
      const newIndex = keys.indexOf(toKey);
      if (oldIndex < 0 || newIndex < 0) return;
      const nextKeys = arrayMove(keys, oldIndex, newIndex);
      setCategoryOrder(nextKeys);
      void persistCategoryOrder(nextKeys);
    },
    [dndDisabled, categoryOrder, baseCategoryKeys, persistCategoryOrder],
  );

  // ---- Product reorder (called from each section's inner DndContext) ----

  const persistProductOrder = useCallback(
    async (orderedIds: number[]) => {
      if (!token) return;
      setReorderError("");
      setReordering(true);
      try {
        const tasks: Promise<unknown>[] = [];
        orderedIds.forEach((id, index) => {
          const sort_order = (index + 1) * 10;
          const p = products.find((x) => x.id === id);
          if (p && Number(p.sort_order || 0) !== sort_order) {
            tasks.push(updateProduct(token, id, { sort_order }));
          }
        });
        await Promise.all(tasks);
        useQueryStore.getState().invalidate(productsQueryKey);
        await onAfterPersist?.();
      } catch (e) {
        setReorderError(e instanceof Error ? e.message : t(lang, "catalog.dnd.error"));
      } finally {
        setReordering(false);
      }
    },
    [token, products, productsQueryKey, lang, onAfterPersist],
  );

  const handleProductReorder = useCallback(
    (groupKey: string, oldIndex: number, newIndex: number) => {
      const pools: ProductGroup[] = unassignedGroup ? [...sortableGroups, unassignedGroup] : [...sortableGroups];
      const pool = pools.find((g) => g.key === groupKey);
      if (!pool) return;
      const ids = pool.items.map((p) => p.id);
      const nextIds = arrayMove(ids, oldIndex, newIndex);
      setProductOrder((prev) => new Map(prev).set(groupKey, nextIds));
      void persistProductOrder(nextIds);
    },
    [sortableGroups, unassignedGroup, persistProductOrder],
  );

  // ---- Category CRUD ----

  const updateCategory = useCallback(
    async (key: string, patch: Parameters<typeof updateServiceCategory>[2]) => {
      if (!token) return;
      setCategoryError("");
      setCategoryBusy(true);
      try {
        await updateServiceCategory(token, key, patch);
        useQueryStore.getState().invalidate(categoriesQueryKey);
        useQueryStore.getState().invalidate(productsQueryKey);
        await onAfterPersist?.();
      } catch (err) {
        setCategoryError(err instanceof Error ? err.message : t(lang, "catalog.category.updateFailed"));
        throw err;
      } finally {
        setCategoryBusy(false);
      }
    },
    [token, categoriesQueryKey, productsQueryKey, onAfterPersist, lang],
  );

  const handleNameSave = useCallback(
    async (category: ServiceCategory, rawName: string) => {
      const next = rawName.trim();
      if (!next || next === category.name) {
        setNameDrafts((d) => ({ ...d, [category.key]: category.name }));
        return;
      }
      try {
        await updateCategory(category.key, { name: next });
      } catch (_err) {
        setNameDrafts((d) => ({ ...d, [category.key]: category.name }));
      }
    },
    [updateCategory],
  );

  const handleDescriptionSave = useCallback(
    async (category: ServiceCategory, rawDescription: string) => {
      const next = rawDescription.trim();
      if (next === (category.description ?? "")) {
        setDescriptionDrafts((d) => ({ ...d, [category.key]: category.description ?? "" }));
        return;
      }
      try {
        await updateCategory(category.key, { description: next });
      } catch (_err) {
        setDescriptionDrafts((d) => ({ ...d, [category.key]: category.description ?? "" }));
      }
    },
    [updateCategory],
  );

  // ---- Render ----

  return (
    <div className="rounded-xl border p-4 border-[var(--border-soft)] bg-[var(--surface)]">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-semibold">{t(lang, "catalog.title.existing").replace("{{n}}", String(filteredProducts.length))}</h2>
        <div className="flex w-full flex-col gap-2 sm:max-w-xs">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-subtle)]" />
            <input
              className="ui-input pl-8"
              placeholder={t(lang, "catalog.search.placeholder")}
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
            />
          </div>
          {q ? (
            <p className="text-xs text-[var(--text-subtle)]">{t(lang, "catalog.dnd.disabledWhileSearching")}</p>
          ) : null}
        </div>
      </div>

      {categoryError ? (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {categoryError}
        </div>
      ) : null}
      {reorderError ? (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {reorderError}
        </div>
      ) : null}
      {reordering ? <div className="mb-2 text-xs text-[var(--text-subtle)]">{t(lang, "catalog.dnd.saving")}</div> : null}

      {/* Outer DndContext: ONLY for category reordering */}
      <DndContext sensors={categorySensors} collisionDetection={closestCenter} onDragEnd={handleCategoryDragEnd}>
        <div className="space-y-2">
          <SortableContext items={categorySortableIds} strategy={verticalListSortingStrategy}>
            {sortableGroups.map((group) => {
              const category = categories.find((c) => c.key === group.key);
              if (!category) return null;
              return (
                <SortableCategorySection
                  key={group.key}
                  group={group}
                  category={category}
                  lang={lang}
                  dndDisabled={dndDisabled}
                  open={openGroupKeys[group.key] !== false}
                  onToggle={() => setOpenGroupKeys((prev) => ({ ...prev, [group.key]: !prev[group.key] }))}
                  btnSmallClass={btnSmallClass}
                  onEdit={onEdit}
                  onDuplicate={onDuplicate}
                  onToggleActive={onToggleActive}
                  onDeleteCategory={onDeleteCategory}
                  onDeactivate={async (cat) => {
                    await updateCategory(cat.key, { active: !cat.active });
                  }}
                  nameDraft={nameDrafts[group.key] ?? category.name}
                  onNameChange={(key, value) => setNameDrafts((d) => ({ ...d, [key]: value }))}
                  onNameSave={handleNameSave}
                  descriptionDraft={descriptionDrafts[group.key] ?? (category.description ?? "")}
                  onDescriptionChange={(key, value) => setDescriptionDrafts((d) => ({ ...d, [key]: value }))}
                  onDescriptionSave={handleDescriptionSave}
                  categoryBusy={categoryBusy}
                  onProductReorder={handleProductReorder}
                />
              );
            })}
          </SortableContext>
          {unassignedGroup ? (
            <UnassignedCategorySection
              group={unassignedGroup}
              lang={lang}
              dndDisabled={dndDisabled}
              open={openGroupKeys[unassignedGroup.key] !== false}
              onToggle={() => setOpenGroupKeys((prev) => ({ ...prev, [unassignedGroup.key]: !prev[unassignedGroup.key] }))}
              btnSmallClass={btnSmallClass}
              onEdit={onEdit}
              onDuplicate={onDuplicate}
              onToggleActive={onToggleActive}
              onProductReorder={handleProductReorder}
            />
          ) : null}
          {filteredProducts.length === 0 ? (
            <div className="rounded-lg border border-dashed p-5 text-center text-sm border-[var(--border-soft)] text-[var(--text-subtle)]">
              {t(lang, "catalog.search.empty")}
            </div>
          ) : null}
        </div>
      </DndContext>
    </div>
  );
}
