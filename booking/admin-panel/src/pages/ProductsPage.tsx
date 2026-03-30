import { useMemo, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { getProducts, setProductActive, type Product } from "../api/products";
import {
  createServiceCategory,
  deleteServiceCategory,
  getServiceCategories,
  type ServiceCategory,
} from "../api/serviceCategories";
import { useMutation } from "../hooks/useMutation";
import { useQuery } from "../hooks/useQuery";
import { t } from "../i18n";
import { productsQueryKey } from "../lib/queryKeys";
import { useAuthStore } from "../store/authStore";
import { useQueryStore } from "../store/queryStore";
import { ProductEditModal } from "../components/products/ProductEditModal";
import { ProductListByCategory } from "../components/products/ProductListByCategory";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";

type ModalMode = "create" | "edit" | "duplicate";

function pickFallbackCategoryKey(categories: ServiceCategory[], deletingKey: string): string {
  const deleted = categories.find((c) => c.key === deletingKey);
  const others = categories.filter((c) => c.key !== deletingKey);
  if (!others.length) return "";
  const scope = deleted?.kind_scope;
  if (scope) {
    const same = others.find((c) => c.kind_scope === scope);
    if (same) return same.key;
    if (scope !== "both") {
      const both = others.find((c) => c.kind_scope === "both");
      if (both) return both.key;
    }
  }
  return others[0].key;
}

export function ProductsPage() {
  const token = useAuthStore((s) => s.token);
  const language = useAuthStore((s) => s.language);
  const updateCachedProducts = useQueryStore((s) => s.updateData);

  const [actionError, setActionError] = useState("");
  const [listQuery, setListQuery] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("create");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const [categoryPendingDelete, setCategoryPendingDelete] = useState<ServiceCategory | null>(null);
  const [categoryDeleteBusy, setCategoryDeleteBusy] = useState(false);
  const [categorySectionError, setCategorySectionError] = useState("");
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [newCategory, setNewCategory] = useState({
    key: "",
    name: "",
    kind_scope: "addon" as ServiceCategory["kind_scope"],
  });

  const queryKey = productsQueryKey(token);
  const categoriesQueryKey = `service-categories:${token}`;
  const { data: products = [], loading, error: queryError, refetch } = useQuery<Product[]>(
    queryKey,
    () => getProducts(token, true),
    { enabled: Boolean(token), staleTime: 5 * 60 * 1000 },
  );
  const { data: categories = [], refetch: refetchCategories } = useQuery<ServiceCategory[]>(
    categoriesQueryKey,
    () => getServiceCategories(token, true),
    { enabled: Boolean(token), staleTime: 5 * 60 * 1000 },
  );

  const categoryDeleteFallback = useMemo(() => {
    if (!categoryPendingDelete) return { key: "", label: "" };
    const fk = pickFallbackCategoryKey(categories, categoryPendingDelete.key);
    const fc = fk ? categories.find((c) => c.key === fk) : undefined;
    return { key: fk, label: fc ? `${fc.name} (${fc.key})` : "" };
  }, [categoryPendingDelete, categories]);

  const toggleActiveMutation = useMutation<Product, { product: Product }, { previous?: Product[] }>(
    async ({ product }) => setProductActive(token, product.id, !product.active),
    {
      mutationKey: `products:toggleActive:${token}`,
      invalidateKeys: [queryKey],
      onMutate: ({ product }) => {
        const previous = useQueryStore.getState().queries[queryKey]?.data as Product[] | undefined;
        updateCachedProducts<Product[]>(queryKey, (current = []) =>
          current.map((entry) =>
            entry.id === product.id ? { ...entry, active: !entry.active } : entry,
          ),
        );
        return { previous: previous ? [...previous] : undefined };
      },
      onError: (_error, _variables, context) => {
        if (!context?.previous) return;
        useQueryStore.getState().setData(queryKey, context.previous);
      },
    },
  );

  const btnBaseClass = "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors";
  const btnPrimaryClass = `${btnBaseClass} bg-[#C5A059] text-white hover:bg-[#b8944f]`;
  const btnSecondaryClass = `${btnBaseClass} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800`;

  function startCreate() {
    setModalMode("create");
    setEditingProduct(null);
    setModalOpen(true);
  }

  function startEdit(product: Product) {
    setModalMode("edit");
    setEditingProduct(product);
    setModalOpen(true);
  }

  function startDuplicate(product: Product) {
    setModalMode("duplicate");
    setEditingProduct(product);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingProduct(null);
  }

  async function toggleActive(product: Product) {
    setActionError("");
    try {
      await toggleActiveMutation.mutate({ product });
      await refetch({ force: true });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Status konnte nicht geändert werden");
    }
  }

  if (loading) return <div className="p-4">{t(language, "catalog.loading")}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-zinc-100">Produkte</h1>
          <p className="text-slate-600 dark:text-zinc-400">{t(language, "catalog.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              await refetch({ force: true });
              await refetchCategories({ force: true });
            }}
            className={btnSecondaryClass}
          >
            <RefreshCw className="h-4 w-4" /> {t(language, "catalog.refresh")}
          </button>
          <button onClick={startCreate} className={btnPrimaryClass}>
            <Plus className="h-4 w-4" /> {t(language, "catalog.newProduct")}
          </button>
        </div>
      </div>

      {queryError || actionError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {queryError || actionError}
        </div>
      ) : null}
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 font-semibold">{t(language, "catalog.categoryManager.title")}</h2>
          {categorySectionError ? (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{categorySectionError}</div>
          ) : null}
          <div className="mb-4 grid gap-2 md:grid-cols-4">
            <input
              className="ui-input"
              placeholder={t(language, "catalog.categoryManager.keyPlaceholder")}
              value={newCategory.key}
              onChange={(e) => setNewCategory((p) => ({ ...p, key: e.target.value }))}
            />
            <input
              className="ui-input md:col-span-2"
              placeholder={t(language, "catalog.categoryManager.namePlaceholder")}
              value={newCategory.name}
              onChange={(e) => setNewCategory((p) => ({ ...p, name: e.target.value }))}
            />
            <select
              className="ui-input"
              value={newCategory.kind_scope}
              onChange={(e) =>
                setNewCategory((p) => ({ ...p, kind_scope: e.target.value as ServiceCategory["kind_scope"] }))
              }
            >
              <option value="addon">addon</option>
              <option value="package">package</option>
              <option value="service">service</option>
              <option value="extra">extra</option>
              <option value="both">both</option>
            </select>
          </div>
          <div className="mb-4">
            <button
              type="button"
              className={btnSecondaryClass}
              disabled={categoryBusy}
              onClick={async () => {
                setCategorySectionError("");
                setCategoryBusy(true);
                try {
                  await createServiceCategory(token, {
                    key: newCategory.key.trim(),
                    name: newCategory.name.trim(),
                    kind_scope: newCategory.kind_scope,
                    active: true,
                    show_in_frontpanel: newCategory.kind_scope === "addon" || newCategory.kind_scope === "both",
                    sort_order: (categories?.length || 0) * 10 + 10,
                  });
                  setNewCategory({ key: "", name: "", kind_scope: "addon" });
                  await refetchCategories({ force: true });
                  await refetch({ force: true });
                } catch (err) {
                  setCategorySectionError(err instanceof Error ? err.message : t(language, "catalog.category.createFailed"));
                } finally {
                  setCategoryBusy(false);
                }
              }}
            >
              {t(language, "catalog.categoryManager.add")}
            </button>
          </div>
          <p className="mb-2 text-xs text-zinc-500">{t(language, "catalog.categoryManager.frontpanelHint")}</p>
        </div>

        <div className="space-y-4">
          <ProductListByCategory
            products={products}
            categories={categories}
            query={listQuery}
            onQueryChange={setListQuery}
            onEdit={startEdit}
            onDuplicate={startDuplicate}
            onToggleActive={toggleActive}
            token={token}
            productsQueryKey={queryKey}
            categoriesQueryKey={categoriesQueryKey}
            onDeleteCategory={setCategoryPendingDelete}
            onAfterPersist={async () => {
              await refetchCategories({ force: true });
              await refetch({ force: true });
            }}
          />
        </div>
      </div>

      <Dialog
        open={categoryPendingDelete != null}
        onOpenChange={(open) => {
          if (!open && !categoryDeleteBusy) setCategoryPendingDelete(null);
        }}
      >
        {categoryPendingDelete ? (
          <DialogContent className="max-w-md">
            <DialogClose
              onClose={() => !categoryDeleteBusy && setCategoryPendingDelete(null)}
              disabled={categoryDeleteBusy}
            />
            <DialogHeader>
              <DialogTitle className="text-lg">{t(language, "catalog.category.deleteDialogTitle")}</DialogTitle>
            </DialogHeader>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {t(language, "catalog.category.deleteDialogBody")
                .replace("{{name}}", categoryPendingDelete.name)
                .replace("{{key}}", categoryPendingDelete.key)
                .replace("{{fallback}}", categoryDeleteFallback.label || "—")}
            </p>
            {!categoryDeleteFallback.key ? (
              <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">{t(language, "catalog.category.deleteDialogNoFallback")}</p>
            ) : null}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                className={btnSecondaryClass + " flex-1 justify-center"}
                disabled={categoryDeleteBusy}
                onClick={() => setCategoryPendingDelete(null)}
              >
                {t(language, "common.cancel")}
              </button>
              <button
                type="button"
                className={`${btnBaseClass} flex-1 justify-center border-none bg-red-600 text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-45`}
                disabled={categoryDeleteBusy}
                onClick={async () => {
                  if (!categoryPendingDelete) return;
                  setCategorySectionError("");
                  setCategoryDeleteBusy(true);
                  try {
                    const fallback = pickFallbackCategoryKey(categories, categoryPendingDelete.key);
                    await deleteServiceCategory(token, categoryPendingDelete.key, fallback);
                    await refetchCategories({ force: true });
                    await refetch({ force: true });
                    setCategoryPendingDelete(null);
                  } catch (err) {
                    setCategorySectionError(err instanceof Error ? err.message : t(language, "catalog.category.deleteFailed"));
                  } finally {
                    setCategoryDeleteBusy(false);
                  }
                }}
              >
                {categoryDeleteBusy ? t(language, "catalog.category.deleteDialogRemoving") : t(language, "catalog.category.remove")}
              </button>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>

      <ProductEditModal
        open={modalOpen}
        mode={modalMode}
        product={editingProduct}
        token={token}
        language={language}
        categories={categories}
        products={products}
        onClose={closeModal}
        onSaved={async () => {
          await refetch({ force: true });
          await refetchCategories({ force: true });
        }}
      />
    </div>
  );
}
/*
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { API_BASE } from "../api/client";
import { getProducts, previewPricing, setProductActive, type Product } from "../api/products";
import { t } from "../i18n";
import { useAuthStore } from "../store/authStore";
import { ProductEditModal } from "../components/products/ProductEditModal";
import { ProductListByCategory } from "../components/products/ProductListByCategory";

type ModalMode = "create" | "edit" | "duplicate";

function previewCategory(product: Product) {
  const group = String(product.group_key || "").toLowerCase();
  if (group === "camera" || group === "groundvideo") return "photo";
  if (group === "dronephoto" || group === "dronevideo") return "drone";
  if (group === "floorplans") return "floorplans";
  return "extras";
}

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

export function ProductsPage() {
  const token = useAuthStore((s) => s.token);
  const language = useAuthStore((s) => s.language);

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [backendHint, setBackendHint] = useState("");
  const [listQuery, setListQuery] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("create");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const [preview, setPreview] = useState<{ subtotal: number; discountAmount: number; vat: number; total: number } | null>(null);
  const [previewPackage, setPreviewPackage] = useState("");
  const [previewAddons, setPreviewAddons] = useState<string[]>([]);
  const [previewArea, setPreviewArea] = useState("120");
  const [previewFloors, setPreviewFloors] = useState("1");
  const [previewError, setPreviewError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setProducts(await getProducts(token, true));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Produkte konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/api/health`)
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((health) => {
        if (!alive || !health) return;
        if (health?.features?.adminPricingPreview !== true) {
          setBackendHint("Backend läuft vermutlich mit altem Build. Bitte Backend neu starten.");
          return;
        }
        setBackendHint("");
      })
      .catch(() => {
        if (alive) setBackendHint("Backend-Healthcheck fehlgeschlagen. Prüfe ob Backend läuft.");
      });
    return () => { alive = false; };
  }, []);

  const packages = useMemo(() => products.filter((p) => p.kind === "package"), [products]);
  const addons = useMemo(() => products.filter((p) => p.kind === "addon"), [products]);

  const btnBaseClass = "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors";
  const btnPrimaryClass = `${btnBaseClass} bg-[#C5A059] text-white hover:bg-[#b8944f]`;
  const btnSecondaryClass = `${btnBaseClass} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800`;

  const previewAddonGroups = useMemo(() => {
    const groups = new Map<"photo" | "drone" | "floorplans" | "extras", Product[]>();
    for (const addon of addons.filter((a) => a.active)) {
      const category = previewCategory(addon) as "photo" | "drone" | "floorplans" | "extras";
      const arr = groups.get(category) || [];
      arr.push(addon);
      groups.set(category, arr);
    }
    return [
      { key: "photo", label: t(language, "catalog.preview.category.photo") },
      { key: "drone", label: t(language, "catalog.preview.category.drone") },
      { key: "floorplans", label: t(language, "catalog.preview.category.floorplans") },
      { key: "extras", label: t(language, "catalog.preview.category.extras") },
    ]
      .map((entry) => ({ ...entry, items: groups.get(entry.key as "photo" | "drone" | "floorplans" | "extras") || [] }))
      .filter((x) => x.items.length > 0);
  }, [addons, language]);

  function startCreate() {
    setModalMode("create");
    setEditingProduct(null);
    setModalOpen(true);
  }

  function startEdit(product: Product) {
    setModalMode("edit");
    setEditingProduct(product);
    setModalOpen(true);
  }

  function startDuplicate(product: Product) {
    setModalMode("duplicate");
    setEditingProduct(product);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingProduct(null);
  }

  async function toggleActive(product: Product) {
    setError("");
    try {
      await setProductActive(token, product.id, !product.active);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status konnte nicht geändert werden");
    }
  }

  const runPreview = useCallback(async () => {
    setError("");
    setPreviewError("");
    try {
      const result = await previewPricing(token, {
        packageKey: previewPackage || undefined,
        addonIds: previewAddons,
        area: Number(previewArea || 0),
        floors: Number(previewFloors || 1),
      });
      setPreview(result.pricing);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Preview fehlgeschlagen";
      setPreviewError(msg);
      const lower = msg.toLowerCase();
      if (lower.includes("pricing-preview api nicht verfügbar") || lower.includes("http 404")) {
        setBackendHint("Der laufende Backend-Prozess kennt /api/admin/pricing/preview nicht. Bitte Backend neu starten.");
      }
    }
  }, [token, previewPackage, previewAddons, previewArea, previewFloors]);

  function togglePreviewAddon(code: string) {
    setPreviewAddons((prev) => (prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code]));
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      runPreview().catch(() => {});
    }, 220);
    return () => clearTimeout(timer);
  }, [runPreview]);

  if (loading) return <div className="p-4">{t(language, "catalog.loading")}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-zinc-100">Produkte</h1>
          <p className="text-slate-600 dark:text-zinc-400">{t(language, "catalog.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => load()} className={btnSecondaryClass}>
            <RefreshCw className="h-4 w-4" /> {t(language, "catalog.refresh")}
          </button>
          <button onClick={startCreate} className={btnPrimaryClass}>
            <Plus className="h-4 w-4" /> {t(language, "catalog.newProduct")}
          </button>
        </div>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {backendHint ? <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{backendHint}</div> : null}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr),380px]">
        <div className="space-y-4">
          <ProductListByCategory
            products={products}
            query={listQuery}
            onQueryChange={setListQuery}
            onEdit={startEdit}
            onDuplicate={startDuplicate}
            onToggleActive={toggleActive}
          />

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-3 font-semibold">{t(language, "catalog.serviceAreas")}</h2>
            <div className="grid gap-3 lg:grid-cols-2">
              {previewAddonGroups.map((group) => (
                <div key={group.label} className="rounded-lg border border-slate-200 p-2 dark:border-zinc-800">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">{group.label}</h3>
                  <div className="space-y-2">
                    {group.items.map((a) => {
                      const active = previewAddons.includes(a.code);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => togglePreviewAddon(a.code)}
                          className={
                            active
                              ? "w-full rounded-lg border border-[#C5A059] bg-[#C5A059]/10 p-2 text-left shadow-sm transition-all"
                              : "w-full rounded-lg border border-zinc-200 p-2 text-left transition-all hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500"
                          }
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium">{a.name}</span>
                            <span className="text-xs font-semibold text-[#C5A059]">{productRulePriceLabel(a)}</span>
                          </div>
                          {a.description ? <div className="mt-1 text-xs text-zinc-500">{a.description}</div> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="xl:sticky xl:top-20 rounded-xl border border-slate-200 bg-white p-4 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 font-semibold">{t(language, "catalog.pricingPreview")}</h2>
          {previewError ? <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{previewError}</div> : null}
          <div className="grid gap-2">
            <select className="ui-input" value={previewPackage} onChange={(e) => setPreviewPackage(e.target.value)}>
              <option value="">{t(language, "catalog.noPackage")}</option>
              {packages.filter((p) => p.active).map((p) => <option key={p.id} value={p.code}>{p.name}</option>)}
            </select>
            <input className="ui-input" type="number" placeholder="Fläche (m²)" value={previewArea} onChange={(e) => setPreviewArea(e.target.value)} />
            <input className="ui-input" type="number" placeholder="Etagen" value={previewFloors} onChange={(e) => setPreviewFloors(e.target.value)} />
            <button className={btnSecondaryClass} type="button" onClick={runPreview}>{t(language, "catalog.calculate")}</button>
          </div>
          <div className="mt-3 rounded-lg border border-zinc-200 p-2 dark:border-zinc-700">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">{t(language, "catalog.selectedServices")}</div>
            {previewAddons.length === 0 ? (
              <div className="text-sm text-zinc-500">{t(language, "catalog.noServicesSelected")}</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {previewAddons.map((code) => {
                  const item = addons.find((x) => x.code === code);
                  return <span key={code} className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs dark:bg-zinc-800">{item?.name || code}</span>;
                })}
              </div>
            )}
          </div>
          {preview ? (
            <div className="mt-4 grid gap-2 text-sm">
              <div className="rounded border border-zinc-200 px-3 py-2 dark:border-zinc-700">Zwischensumme: <strong>{preview.subtotal} CHF</strong></div>
              <div className="rounded border border-zinc-200 px-3 py-2 dark:border-zinc-700">Rabatt: <strong>{preview.discountAmount} CHF</strong></div>
              <div className="rounded border border-zinc-200 px-3 py-2 dark:border-zinc-700">MwSt: <strong>{preview.vat} CHF</strong></div>
              <div className="rounded border border-[#C5A059]/40 bg-[#C5A059]/10 px-3 py-2 text-lg transition-all duration-300">Total: <strong>{preview.total} CHF</strong></div>
            </div>
          ) : null}
        </div>
      </div>

      <ProductEditModal
        open={modalOpen}
        mode={modalMode}
        product={editingProduct}
        token={token}
        language={language}
        onClose={closeModal}
        onSaved={load}
      />
    </div>
  );
}
/*
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { API_BASE } from "../api/client";
import { getProducts, previewPricing, setProductActive, type Product } from "../api/products";
import { t } from "../i18n";
import { useAuthStore } from "../store/authStore";
import { ProductEditModal } from "../components/products/ProductEditModal";
import { ProductListByCategory } from "../components/products/ProductListByCategory";

type ModalMode = "create" | "edit" | "duplicate";

function previewCategory(product: Product) {
  const group = String(product.group_key || "").toLowerCase();
  if (group === "camera" || group === "groundvideo") return "photo";
  if (group === "dronephoto" || group === "dronevideo") return "drone";
  if (group === "floorplans") return "floorplans";
  return "extras";
}

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

export function ProductsPage() {
  const token = useAuthStore((s) => s.token);
  const language = useAuthStore((s) => s.language);

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [backendHint, setBackendHint] = useState("");
  const [listQuery, setListQuery] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("create");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const [preview, setPreview] = useState<{ subtotal: number; discountAmount: number; vat: number; total: number } | null>(null);
  const [previewPackage, setPreviewPackage] = useState("");
  const [previewAddons, setPreviewAddons] = useState<string[]>([]);
  const [previewArea, setPreviewArea] = useState("120");
  const [previewFloors, setPreviewFloors] = useState("1");
  const [previewError, setPreviewError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setProducts(await getProducts(token, true));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Produkte konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/api/health`)
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((health) => {
        if (!alive || !health) return;
        if (health?.features?.adminPricingPreview !== true) {
          setBackendHint("Backend läuft vermutlich mit altem Build. Bitte Backend neu starten.");
          return;
        }
        setBackendHint("");
      })
      .catch(() => {
        if (alive) setBackendHint("Backend-Healthcheck fehlgeschlagen. Prüfe ob Backend läuft.");
      });
    return () => { alive = false; };
  }, []);

  const packages = useMemo(() => products.filter((p) => p.kind === "package"), [products]);
  const addons = useMemo(() => products.filter((p) => p.kind === "addon"), [products]);

  const btnBaseClass = "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors";
  const btnPrimaryClass = `${btnBaseClass} bg-[#C5A059] text-white hover:bg-[#b8944f]`;
  const btnSecondaryClass = `${btnBaseClass} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800`;

  const previewAddonGroups = useMemo(() => {
    const groups = new Map<"photo" | "drone" | "floorplans" | "extras", Product[]>();
    for (const addon of addons.filter((a) => a.active)) {
      const category = previewCategory(addon) as "photo" | "drone" | "floorplans" | "extras";
      const arr = groups.get(category) || [];
      arr.push(addon);
      groups.set(category, arr);
    }
    return [
      { key: "photo", label: t(language, "catalog.preview.category.photo") },
      { key: "drone", label: t(language, "catalog.preview.category.drone") },
      { key: "floorplans", label: t(language, "catalog.preview.category.floorplans") },
      { key: "extras", label: t(language, "catalog.preview.category.extras") },
    ]
      .map((entry) => ({ ...entry, items: groups.get(entry.key as "photo" | "drone" | "floorplans" | "extras") || [] }))
      .filter((x) => x.items.length > 0);
  }, [addons, language]);

  function startCreate() {
    setModalMode("create");
    setEditingProduct(null);
    setModalOpen(true);
  }

  function startEdit(product: Product) {
    setModalMode("edit");
    setEditingProduct(product);
    setModalOpen(true);
  }

  function startDuplicate(product: Product) {
    setModalMode("duplicate");
    setEditingProduct(product);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingProduct(null);
  }

  async function toggleActive(product: Product) {
    setError("");
    try {
      await setProductActive(token, product.id, !product.active);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status konnte nicht geändert werden");
    }
  }

  const runPreview = useCallback(async () => {
    setError("");
    setPreviewError("");
    try {
      const result = await previewPricing(token, {
        packageKey: previewPackage || undefined,
        addonIds: previewAddons,
        area: Number(previewArea || 0),
        floors: Number(previewFloors || 1),
      });
      setPreview(result.pricing);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Preview fehlgeschlagen";
      setPreviewError(msg);
      const lower = msg.toLowerCase();
      if (lower.includes("pricing-preview api nicht verfügbar") || lower.includes("http 404")) {
        setBackendHint("Der laufende Backend-Prozess kennt /api/admin/pricing/preview nicht. Bitte Backend neu starten.");
      }
    }
  }, [token, previewPackage, previewAddons, previewArea, previewFloors]);

  function togglePreviewAddon(code: string) {
    setPreviewAddons((prev) => (prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code]));
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      runPreview().catch(() => {});
    }, 220);
    return () => clearTimeout(timer);
  }, [runPreview]);

  if (loading) return <div className="p-4">{t(language, "catalog.loading")}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-zinc-100">Produkte</h1>
          <p className="text-slate-600 dark:text-zinc-400">{t(language, "catalog.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => load()} className={btnSecondaryClass}>
            <RefreshCw className="h-4 w-4" /> {t(language, "catalog.refresh")}
          </button>
          <button onClick={startCreate} className={btnPrimaryClass}>
            <Plus className="h-4 w-4" /> {t(language, "catalog.newProduct")}
          </button>
        </div>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {backendHint ? <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{backendHint}</div> : null}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr),380px]">
        <div className="space-y-4">
          <ProductListByCategory
            products={products}
            query={listQuery}
            onQueryChange={setListQuery}
            onEdit={startEdit}
            onDuplicate={startDuplicate}
            onToggleActive={toggleActive}
          />

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-3 font-semibold">{t(language, "catalog.serviceAreas")}</h2>
            <div className="grid gap-3 lg:grid-cols-2">
              {previewAddonGroups.map((group) => (
                <div key={group.label} className="rounded-lg border border-slate-200 p-2 dark:border-zinc-800">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">{group.label}</h3>
                  <div className="space-y-2">
                    {group.items.map((a) => {
                      const active = previewAddons.includes(a.code);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => togglePreviewAddon(a.code)}
                          className={
                            active
                              ? "w-full rounded-lg border border-[#C5A059] bg-[#C5A059]/10 p-2 text-left shadow-sm transition-all"
                              : "w-full rounded-lg border border-zinc-200 p-2 text-left transition-all hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500"
                          }
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium">{a.name}</span>
                            <span className="text-xs font-semibold text-[#C5A059]">{productRulePriceLabel(a)}</span>
                          </div>
                          {a.description ? <div className="mt-1 text-xs text-zinc-500">{a.description}</div> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="xl:sticky xl:top-20 rounded-xl border border-slate-200 bg-white p-4 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 font-semibold">{t(language, "catalog.pricingPreview")}</h2>
          {previewError ? <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{previewError}</div> : null}
          <div className="grid gap-2">
            <select className="ui-input" value={previewPackage} onChange={(e) => setPreviewPackage(e.target.value)}>
              <option value="">{t(language, "catalog.noPackage")}</option>
              {packages.filter((p) => p.active).map((p) => <option key={p.id} value={p.code}>{p.name}</option>)}
            </select>
            <input className="ui-input" type="number" placeholder="Fläche (m²)" value={previewArea} onChange={(e) => setPreviewArea(e.target.value)} />
            <input className="ui-input" type="number" placeholder="Etagen" value={previewFloors} onChange={(e) => setPreviewFloors(e.target.value)} />
            <button className={btnSecondaryClass} type="button" onClick={runPreview}>{t(language, "catalog.calculate")}</button>
          </div>
          <div className="mt-3 rounded-lg border border-zinc-200 p-2 dark:border-zinc-700">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">{t(language, "catalog.selectedServices")}</div>
            {previewAddons.length === 0 ? (
              <div className="text-sm text-zinc-500">{t(language, "catalog.noServicesSelected")}</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {previewAddons.map((code) => {
                  const item = addons.find((x) => x.code === code);
                  return <span key={code} className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs dark:bg-zinc-800">{item?.name || code}</span>;
                })}
              </div>
            )}
          </div>
          {preview ? (
            <div className="mt-4 grid gap-2 text-sm">
              <div className="rounded border border-zinc-200 px-3 py-2 dark:border-zinc-700">Zwischensumme: <strong>{preview.subtotal} CHF</strong></div>
              <div className="rounded border border-zinc-200 px-3 py-2 dark:border-zinc-700">Rabatt: <strong>{preview.discountAmount} CHF</strong></div>
              <div className="rounded border border-zinc-200 px-3 py-2 dark:border-zinc-700">MwSt: <strong>{preview.vat} CHF</strong></div>
              <div className="rounded border border-[#C5A059]/40 bg-[#C5A059]/10 px-3 py-2 text-lg transition-all duration-300">Total: <strong>{preview.total} CHF</strong></div>
            </div>
          ) : null}
        </div>
      </div>

      <ProductEditModal
        open={modalOpen}
        mode={modalMode}
        product={editingProduct}
        token={token}
        language={language}
        onClose={closeModal}
        onSaved={load}
      />
    </div>
  );
}
/* Duplicate legacy block retained in file by prior merge tooling.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Camera, ChevronDown, Copy, Plane, Plus, RefreshCw, Search, Sparkles, X } from "lucide-react";
import { API_BASE } from "../api/client";
import {
  createProduct,
  getProducts,
  previewPricing,
  setProductActive,
  updateProduct,
  type PricingRule,
  type Product,
} from "../api/products";
import { cn } from "../lib/utils";
import { t } from "../i18n";
import { useAuthStore } from "../store/authStore";

type FormState = {
  code: string;
  name: string;
  kind: "package" | "addon";
  group_key: string;
  description: string;
  sort_order: string;
  active: boolean;
  show_on_website: boolean;
  affects_travel: boolean;
  affects_duration: boolean;
  duration_minutes: string;
  rule_type: PricingRule["rule_type"];
  rule_config_json: string;
  rule_priority: string;
};

const initialForm: FormState = {
  code: "",
  name: "",
  kind: "addon",
  group_key: "",
  description: "",
  sort_order: "0",
  active: true,
  show_on_website: true,
  affects_travel: true,
  affects_duration: false,
  duration_minutes: "0",
  rule_type: "fixed",
  rule_config_json: "{\"price\":0}",
  rule_priority: "10",
};

function parseRuleConfig(value: string): Record<string, unknown> {
  return JSON.parse(value || "{}") as Record<string, unknown>;
}

function getSimplePrice(ruleType: PricingRule["rule_type"], config: Record<string, unknown>) {
  if (ruleType === "per_floor" || ruleType === "per_room") {
    return Number(config.unitPrice || 0);
  }
  return Number(config.price || 0);
}

function applySimplePrice(ruleType: PricingRule["rule_type"], config: Record<string, unknown>, amount: number) {
  const next = { ...config };
  if (ruleType === "per_floor" || ruleType === "per_room") {
    next.unitPrice = amount;
    return next;
  }
  next.price = amount;
  return next;
}

function previewCategory(product: Product) {
  const group = String(product.group_key || "").toLowerCase();
  if (group === "camera" || group === "groundvideo") return "photo";
  if (group === "dronephoto" || group === "dronevideo") return "drone";
  if (group === "floorplans") return "floorplans";
  return "extras";
}

function productRulePriceLabel(product: Product) {
  const firstRule = (product.rules || []).find((r) => r?.active !== false);
  const cfg = (firstRule?.config_json || {}) as Record<string, unknown>;
  if (firstRule?.rule_type === "per_floor") return `${Number(cfg.unitPrice || 0)} CHF / Etage`;
  if (firstRule?.rule_type === "per_room") return `${Number(cfg.unitPrice || 0)} CHF / Einheit`;
  if (firstRule?.rule_type === "area_tier") return `${Number((cfg.tiers as Array<{ price?: number }> | undefined)?.[0]?.price || cfg.basePrice || 0)} CHF`;
  return `${Number(cfg.price || 0)} CHF`;
}

function ProductKindIcon({ product }: { product: Product }) {
  const name = String(product.name || "").toLowerCase();
  const code = String(product.code || "").toLowerCase();
  if (name.includes("bodenfoto") || code.includes("camera:")) {
    return <Camera className="h-4 w-4 text-[#C5A059]" />;
  }
  if (name.includes("luftaufnahme") || code.includes("drone")) {
    return <Plane className="h-4 w-4 text-[#C5A059]" />;
  }
  return <Sparkles className="h-4 w-4 text-[#C5A059]" />;
}

export function ProductsPage() {
  const token = useAuthStore((s) => s.token);
  const language = useAuthStore((s) => s.language);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [preview, setPreview] = useState<{ subtotal: number; discountAmount: number; vat: number; total: number } | null>(null);
  const [previewPackage, setPreviewPackage] = useState("");
  const [previewAddons, setPreviewAddons] = useState<string[]>([]);
  const [previewArea, setPreviewArea] = useState("120");
  const [previewFloors, setPreviewFloors] = useState("1");
  const [previewError, setPreviewError] = useState("");
  const [backendHint, setBackendHint] = useState("");
  const [listQuery, setListQuery] = useState("");
  const [showAdvancedRule, setShowAdvancedRule] = useState(false);
  const [simplePrice, setSimplePrice] = useState("0");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [showEditModal, setShowEditModal] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [serviceAreasExpanded, setServiceAreasExpanded] = useState(false);
  const [pricingPreviewExpanded, setPricingPreviewExpanded] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const productFormRef = useRef<HTMLFormElement | null>(null);
  const categoryOptions = [
    { key: "photo", label: t(language, "catalog.preview.category.photo") },
    { key: "drone", label: t(language, "catalog.preview.category.drone") },
    { key: "floorplans", label: t(language, "catalog.preview.category.floorplans") },
    { key: "extras", label: t(language, "catalog.preview.category.extras") },
  ];

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setProducts(await getProducts(token, true));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Produkte konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/api/health`)
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((health) => {
        if (!alive || !health) return;
        if (health?.features?.adminPricingPreview !== true) {
          setBackendHint("Backend läuft vermutlich mit altem Build. Bitte Backend neu starten.");
          return;
        }
        setBackendHint("");
      })
      .catch(() => {
        if (alive) setBackendHint("Backend-Healthcheck fehlgeschlagen. Prüfe ob Backend läuft.");
      });
    return () => { alive = false; };
  }, []);

  const packages = useMemo(() => products.filter((p) => p.kind === "package"), [products]);
  const addons = useMemo(() => products.filter((p) => p.kind === "addon"), [products]);
  const fieldLabelClass = "mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400";
  const btnBaseClass = "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors";
  const btnPrimaryClass = `${btnBaseClass} bg-[#C5A059] text-white hover:bg-[#b8944f]`;
  const btnSecondaryClass = `${btnBaseClass} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800`;
  const btnSmallClass = "inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors";
  const filteredProducts = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => [p.name, p.code, p.group_key, p.kind].join(" ").toLowerCase().includes(q));
  }, [products, listQuery]);
  const groupedProducts = useMemo(() => {
    const grouped = new Map<string, Product[]>();
    for (const product of filteredProducts) {
      const key = String(product.group_key || "").trim() || "Sonstige";
      const list = grouped.get(key) || [];
      list.push(product);
      grouped.set(key, list);
    }
    const entries = Array.from(grouped.entries())
      .sort(([a], [b]) => {
        if (a === "Sonstige") return 1;
        if (b === "Sonstige") return -1;
        return a.localeCompare(b, "de");
      })
      .map(([key, items]) => ({
        key,
        items,
        activeCount: items.filter((p) => p.active).length,
      }));
    return entries;
  }, [filteredProducts]);
  const previewAddonGroups = useMemo(() => {
    const groups = new Map<"photo" | "drone" | "floorplans" | "extras", Product[]>();
    for (const addon of addons.filter((a) => a.active)) {
      const category = previewCategory(addon) as "photo" | "drone" | "floorplans" | "extras";
      const arr = groups.get(category) || [];
      arr.push(addon);
      groups.set(category, arr);
    }
    return [
      { key: "photo", label: t(language, "catalog.preview.category.photo") },
      { key: "drone", label: t(language, "catalog.preview.category.drone") },
      { key: "floorplans", label: t(language, "catalog.preview.category.floorplans") },
      { key: "extras", label: t(language, "catalog.preview.category.extras") },
    ]
      .map((entry) => ({ ...entry, items: groups.get(entry.key as "photo" | "drone" | "floorplans" | "extras") || [] }))
      .filter((x) => x.items.length > 0);
  }, [addons, language]);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  useEffect(() => {
    setExpandedGroups((prev) => {
      const next = { ...prev };
      for (const group of groupedProducts) {
        if (next[group.key] === undefined) next[group.key] = true;
      }
      return next;
    });
  }, [groupedProducts]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const key = String(e.key || "").toLowerCase();
      if (key === "escape" && showEditModal) {
        e.preventDefault();
        setShowEditModal(false);
        return;
      }
      const ctrlOrMeta = e.ctrlKey || e.metaKey;
      if (!ctrlOrMeta) return;
      if (key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
      if (key === "s") {
        e.preventDefault();
        productFormRef.current?.requestSubmit();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showEditModal]);

  function closeEditorModal() {
    setShowEditModal(false);
    setEditing(null);
    setForm(initialForm);
    setShowAdvancedRule(false);
    setSimplePrice("0");
    setSelectedCategories([]);
    setTags([]);
    setTagInput("");
  }

  function startCreate() {
    setEditing(null);
    setForm(initialForm);
    setShowAdvancedRule(false);
    setSimplePrice("0");
    setSelectedCategories([]);
    setTags([]);
    setTagInput("");
    setShowEditModal(true);
  }

  function startEdit(product: Product) {
    setEditing(product);
    const rule = product.rules?.[0];
    const config = (rule?.config_json || {}) as Record<string, unknown>;
    setForm({
      code: product.code,
      name: product.name,
      kind: product.kind,
      group_key: product.group_key || "",
      description: product.description || "",
      sort_order: String(product.sort_order || 0),
      active: !!product.active,
      show_on_website: product.show_on_website !== false,
      affects_travel: product.affects_travel !== false,
      affects_duration: !!product.affects_duration,
      duration_minutes: String(product.duration_minutes || 0),
      rule_type: (rule?.rule_type as FormState["rule_type"]) || "fixed",
      rule_config_json: JSON.stringify(config, null, 2),
      rule_priority: String(rule?.priority || 10),
    });
    setShowAdvancedRule(false);
    setSimplePrice(String(getSimplePrice((rule?.rule_type as FormState["rule_type"]) || "fixed", config) || 0));
    const meta = config.meta && typeof config.meta === "object" ? (config.meta as Record<string, unknown>) : {};
    const nextCats = Array.isArray(meta.categories)
      ? (meta.categories as unknown[]).map((x) => String(x))
      : [previewCategory(product)];
    const nextTags = Array.isArray(meta.tags)
      ? (meta.tags as unknown[]).map((x) => String(x))
      : [];
    setSelectedCategories(nextCats);
    setTags(nextTags);
    setTagInput("");
    setShowEditModal(true);
  }

  function duplicateProduct(product: Product) {
    startEdit(product);
    setEditing(null);
    setForm((prev) => ({
      ...prev,
      code: `${product.code}-copy`,
      name: `${product.name} (Kopie)`,
      active: false,
    }));
    setShowEditModal(true);
  }

  async function submitForm(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (!form.code.trim() || !form.name.trim()) {
        setError(t(language, "catalog.error.requiredCodeName"));
        return;
      }
      const parsedConfig = parseRuleConfig(form.rule_config_json || "{}");
      const baseConfig = showAdvancedRule
        ? parsedConfig
        : applySimplePrice(form.rule_type, parsedConfig, Number(simplePrice || 0));
      const ruleConfig = {
        ...baseConfig,
        meta: {
          ...((baseConfig.meta && typeof baseConfig.meta === "object") ? (baseConfig.meta as Record<string, unknown>) : {}),
          categories: selectedCategories,
          tags,
        },
      };
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        kind: form.kind,
        group_key: form.group_key.trim(),
        description: form.description.trim(),
        active: form.active,
        show_on_website: form.show_on_website,
        affects_travel: form.affects_travel,
        affects_duration: form.affects_duration,
        duration_minutes: Number(form.duration_minutes || 0),
        sort_order: Number(form.sort_order || 0),
        rules: [
          {
            rule_type: form.rule_type,
            config_json: ruleConfig,
            priority: Number(form.rule_priority || 10),
            active: true,
          },
        ],
      };
      if (editing) {
        await updateProduct(token, editing.id, payload);
      } else {
        await createProduct(token, payload);
      }
      closeEditorModal();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Produkt konnte nicht gespeichert werden");
    }
  }

  async function toggleActive(product: Product) {
    setError("");
    try {
      await setProductActive(token, product.id, !product.active);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status konnte nicht geändert werden");
    }
  }

  const runPreview = useCallback(async () => {
    setError("");
    setPreviewError("");
    try {
      const result = await previewPricing(token, {
        packageKey: previewPackage || undefined,
        addonIds: previewAddons,
        area: Number(previewArea || 0),
        floors: Number(previewFloors || 1),
      });
      setPreview(result.pricing);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Preview fehlgeschlagen";
      setPreviewError(msg);
      const lower = msg.toLowerCase();
      if (lower.includes("pricing-preview api nicht verfügbar") || lower.includes("http 404")) {
        setBackendHint("Der laufende Backend-Prozess kennt /api/admin/pricing/preview nicht. Bitte Backend neu starten.");
      }
    }
  }, [token, previewPackage, previewAddons, previewArea, previewFloors]);

  function toggleCategory(categoryKey: string) {
    setSelectedCategories((prev) => (
      prev.includes(categoryKey) ? prev.filter((x) => x !== categoryKey) : [...prev, categoryKey]
    ));
  }

  function addTag() {
    const value = tagInput.trim();
    if (!value) return;
    setTags((prev) => (prev.includes(value) ? prev : [...prev, value]));
    setTagInput("");
  }

  function removeTag(value: string) {
    setTags((prev) => prev.filter((x) => x !== value));
  }

  function togglePreviewAddon(code: string) {
    setPreviewAddons((prev) => (prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code]));
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      runPreview().catch(() => {});
    }, 220);
    return () => clearTimeout(timer);
  }, [runPreview]);

  if (loading) return <div className="p-4">{t(language, "catalog.loading")}</div>;
  const isEditing = Boolean(editing);
  const modalTitle = isEditing ? `${t(language, "catalog.editProduct")} #${editing?.id}` : t(language, "catalog.newProductModalTitle");
  const modalSubmitLabel = isEditing ? t(language, "catalog.save") : t(language, "catalog.createProduct");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-zinc-100 mb-2">Produkte</h1>
          <p className="text-slate-600 dark:text-zinc-400">{t(language, "catalog.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => load()} className={btnSecondaryClass}>
            <RefreshCw className="h-4 w-4" /> {t(language, "catalog.refresh")}
          </button>
          <button onClick={startCreate} className={btnPrimaryClass}>
            <Plus className="h-4 w-4" /> {t(language, "catalog.newProduct")}
          </button>
        </div>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {backendHint ? <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{backendHint}</div> : null}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr),380px]">
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-semibold">Bestehende Produkte ({filteredProducts.length})</h2>
              <div className="relative w-full max-w-xs">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  ref={searchInputRef}
                  className="ui-input pl-8"
                  placeholder={t(language, "catalog.searchPlaceholder")}
                  value={listQuery}
                  onChange={(e) => setListQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2 pr-1">
              {groupedProducts.map((group) => {
                const isExpanded = expandedGroups[group.key] ?? true;
                return (
                  <div key={group.key} className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50/40 dark:bg-zinc-900/40">
                    <button
                      type="button"
                      onClick={() => setExpandedGroups((prev) => ({ ...prev, [group.key]: !isExpanded }))}
                      className="flex w-full items-center justify-between px-3 py-2 text-left"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{group.key}</div>
                        <div className="text-xs text-zinc-500">
                          {group.items.length} Produkte · {group.activeCount} aktiv · {group.items.length - group.activeCount} inaktiv
                        </div>
                      </div>
                      <ChevronDown className={cn("h-4 w-4 text-zinc-500 transition-transform", isExpanded ? "rotate-180" : "rotate-0")} />
                    </button>
                    {isExpanded ? (
                      <div className="space-y-2 border-t border-slate-200 px-2 py-2 dark:border-zinc-800">
                        {group.items.map((p) => (
                          <div key={p.id} className="rounded-lg border border-slate-200/70 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <ProductKindIcon product={p} />
                                  <div className="truncate font-semibold">{p.name}</div>
                                  <span className={cn(
                                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                    p.affects_travel === false
                                      ? "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                                      : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                  )}>
                                    {t(language, "catalog.travelCalcBadge")}: {p.affects_travel === false ? t(language, "catalog.no") : t(language, "catalog.yes")}
                                  </span>
                                </div>
                                <div className="mt-1 text-xs text-slate-500">{p.code} · {p.kind} · {p.group_key || "—"}</div>
                                {p.affects_duration ? (
                                  <div className="mt-1 text-xs text-amber-600 dark:text-amber-400">Dauer +{Number(p.duration_minutes || 0)} Min</div>
                                ) : null}
                              </div>
                              <div className="flex shrink-0 gap-1.5">
                                <button onClick={() => startEdit(p)} className={`${btnSmallClass} border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800`}>Bearbeiten</button>
                                <button onClick={() => duplicateProduct(p)} className={`${btnSmallClass} border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800`}>
                                  <Copy className="h-3 w-3" /> {t(language, "catalog.duplicate")}
                                </button>
                                <button
                                  onClick={() => toggleActive(p)}
                                  className={cn(
                                    btnSmallClass,
                                    p.active
                                      ? "border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40"
                                      : "border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                                  )}
                                >
                                  {p.active ? "Deaktivieren" : "Aktivieren"}
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {filteredProducts.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-5 text-center text-sm text-zinc-500">
                  {t(language, "catalog.emptySearch")}
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
            <button
              type="button"
              onClick={() => setServiceAreasExpanded((prev) => !prev)}
              className="mb-3 flex w-full items-center justify-between text-left"
            >
              <h2 className="font-semibold">{t(language, "catalog.serviceAreas")}</h2>
              <ChevronDown className={cn("h-4 w-4 text-zinc-500 transition-transform", serviceAreasExpanded ? "rotate-180" : "rotate-0")} />
            </button>
            {serviceAreasExpanded ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {previewAddonGroups.map((group) => (
                  <div key={group.label} className="rounded-lg border border-slate-200 dark:border-zinc-800 p-2">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">{group.label}</h3>
                    <div className="space-y-2">
                      {group.items.map((a) => {
                        const active = previewAddons.includes(a.code);
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => togglePreviewAddon(a.code)}
                            className={cn(
                              "w-full rounded-lg border p-2 text-left transition-all",
                              active
                                ? "border-[#C5A059] bg-[#C5A059]/10 shadow-sm"
                                : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500"
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-sm">{a.name}</span>
                              <span className="text-xs font-semibold text-[#C5A059]">{productRulePriceLabel(a)}</span>
                            </div>
                            {a.description ? <div className="mt-1 text-xs text-zinc-500">{a.description}</div> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="xl:sticky xl:top-20 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-lg">
          <button
            type="button"
            onClick={() => setPricingPreviewExpanded((prev) => !prev)}
            className="mb-3 flex w-full items-center justify-between text-left"
          >
            <h2 className="font-semibold">{t(language, "catalog.pricingPreview")}</h2>
            <ChevronDown className={cn("h-4 w-4 text-zinc-500 transition-transform", pricingPreviewExpanded ? "rotate-180" : "rotate-0")} />
          </button>
          {pricingPreviewExpanded ? (
            <>
              {previewError ? <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{previewError}</div> : null}
              <div className="grid gap-2">
                <select className="ui-input" value={previewPackage} onChange={(e) => setPreviewPackage(e.target.value)}>
                  <option value="">{t(language, "catalog.noPackage")}</option>
                  {packages.filter((p) => p.active).map((p) => <option key={p.id} value={p.code}>{p.name}</option>)}
                </select>
                <input className="ui-input" type="number" placeholder="Fläche (m²)" value={previewArea} onChange={(e) => setPreviewArea(e.target.value)} />
                <input className="ui-input" type="number" placeholder="Etagen" value={previewFloors} onChange={(e) => setPreviewFloors(e.target.value)} />
                <button className={btnSecondaryClass} type="button" onClick={runPreview}>{t(language, "catalog.calculate")}</button>
              </div>
              <div className="mt-3 rounded-lg border border-zinc-200 dark:border-zinc-700 p-2">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">{t(language, "catalog.selectedServices")}</div>
                {previewAddons.length === 0 ? (
                  <div className="text-sm text-zinc-500">{t(language, "catalog.noServicesSelected")}</div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {previewAddons.map((code) => {
                      const item = addons.find((x) => x.code === code);
                      return <span key={code} className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs dark:bg-zinc-800">{item?.name || code}</span>;
                    })}
                  </div>
                )}
              </div>
              {preview ? (
                <div className="mt-4 grid gap-2 text-sm">
                  <div className="rounded border border-zinc-200 dark:border-zinc-700 px-3 py-2">Zwischensumme: <strong>{preview.subtotal} CHF</strong></div>
                  <div className="rounded border border-zinc-200 dark:border-zinc-700 px-3 py-2">Rabatt: <strong>{preview.discountAmount} CHF</strong></div>
                  <div className="rounded border border-zinc-200 dark:border-zinc-700 px-3 py-2">MwSt: <strong>{preview.vat} CHF</strong></div>
                  <div className="rounded border border-[#C5A059]/40 bg-[#C5A059]/10 px-3 py-2 text-lg transition-all duration-300">Total: <strong>{preview.total} CHF</strong></div>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {showEditModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => closeEditorModal()}
        >
          <div
            className="w-full max-w-4xl rounded-xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-semibold">{modalTitle}</h2>
              <button
                type="button"
                onClick={closeEditorModal}
                className="rounded-md border border-zinc-300 p-1 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form ref={productFormRef} onSubmit={submitForm} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className={fieldLabelClass}>Code <span className="text-red-500">*</span></span>
                  <input required className="ui-input" placeholder="z.B. tour:main" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
                </label>
                <label className="block">
                  <span className={fieldLabelClass}>Name <span className="text-red-500">*</span></span>
                  <input required className="ui-input" placeholder="Produktname" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                </label>
                <label className="block">
                  <span className={fieldLabelClass}>{t(language, "catalog.type")}</span>
                  <select className="ui-input" value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as "package" | "addon" }))}>
                    <option value="package">package</option>
                    <option value="addon">addon</option>
                  </select>
                </label>
                <label className="block">
                  <span className={fieldLabelClass}>{t(language, "catalog.groupKey")}</span>
                  <input className="ui-input" placeholder="z.B. floorplans" value={form.group_key} onChange={(e) => setForm((f) => ({ ...f, group_key: e.target.value }))} />
                </label>
                <label className="col-span-2 block">
                  <span className={fieldLabelClass}>{t(language, "catalog.description")}</span>
                  <input className="ui-input" placeholder="Kurze Beschreibung" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
                </label>
                <label className="col-span-2 block">
                  <span className={fieldLabelClass}>{t(language, "catalog.categories")}</span>
                  <details className="rounded-lg border border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900">
                    <summary className="cursor-pointer list-none px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300">
                      {selectedCategories.length
                        ? selectedCategories.map((key) => categoryOptions.find((c) => c.key === key)?.label || key).join(", ")
                        : t(language, "catalog.selectCategories")}
                    </summary>
                    <div className="space-y-1 border-t border-zinc-200 p-2 dark:border-zinc-800">
                      {categoryOptions.map((opt) => (
                        <label key={opt.key} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
                          <input
                            type="checkbox"
                            checked={selectedCategories.includes(opt.key)}
                            onChange={() => toggleCategory(opt.key)}
                          />
                          {opt.label}
                        </label>
                      ))}
                    </div>
                  </details>
                </label>
                <label className="col-span-2 block">
                  <span className={fieldLabelClass}>{t(language, "catalog.tags")}</span>
                  <div className="rounded-lg border border-zinc-300 p-2 dark:border-zinc-700">
                    <div className="mb-2 flex flex-wrap gap-2">
                      {tags.map((tag) => (
                        <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                          {tag}
                          <button type="button" className="text-zinc-500 hover:text-red-500" onClick={() => removeTag(tag)}>×</button>
                        </span>
                      ))}
                    </div>
                    <input
                      className="ui-input"
                      placeholder={t(language, "catalog.tagsPlaceholder")}
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addTag();
                        }
                      }}
                    />
                  </div>
                </label>
                <label className="block">
                  <span className={fieldLabelClass}>{t(language, "catalog.sortOrder")}</span>
                  <input className="ui-input" placeholder="0" type="number" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))} />
                </label>
                <label className="block">
                  <span className={fieldLabelClass}>{t(language, "catalog.ruleType")}</span>
                  <select className="ui-input" value={form.rule_type} onChange={(e) => {
                    const nextRuleType = e.target.value as FormState["rule_type"];
                    setForm((f) => ({ ...f, rule_type: nextRuleType }));
                  }}>
                    <option value="fixed">fixed</option>
                    <option value="per_floor">per_floor</option>
                    <option value="per_room">per_room</option>
                    <option value="area_tier">area_tier</option>
                    <option value="conditional">conditional</option>
                  </select>
                </label>
                <label className="block">
                  <span className={fieldLabelClass}>{t(language, "catalog.simplePrice")}</span>
                  <input
                    className="ui-input"
                    type="number"
                    step="0.01"
                    disabled={form.rule_type === "area_tier"}
                    value={simplePrice}
                    onChange={(e) => setSimplePrice(e.target.value)}
                    placeholder={form.rule_type === "per_floor" || form.rule_type === "per_room" ? "unitPrice" : "price"}
                  />
                </label>
                <label className="block">
                  <span className={fieldLabelClass}>{t(language, "catalog.rulePriority")}</span>
                  <input className="ui-input" placeholder="10" type="number" value={form.rule_priority} onChange={(e) => setForm((f) => ({ ...f, rule_priority: e.target.value }))} />
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
                  {t(language, "catalog.active")}
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.show_on_website}
                    onChange={(e) => setForm((f) => ({ ...f, show_on_website: e.target.checked }))}
                  />
                  {t(language, "catalog.showOnWebsite")}
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.affects_travel} onChange={(e) => setForm((f) => ({ ...f, affects_travel: e.target.checked }))} />
                  {t(language, "catalog.includeTravel")}
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.affects_duration} onChange={(e) => setForm((f) => ({ ...f, affects_duration: e.target.checked }))} />
                  {t(language, "catalog.includeDuration")}
                </label>
                <label className="block">
                  <span className={fieldLabelClass}>{t(language, "catalog.durationBonus")}</span>
                  <input
                    className="ui-input"
                    placeholder="0"
                    type="number"
                    min={0}
                    value={form.duration_minutes}
                    onChange={(e) => setForm((f) => ({ ...f, duration_minutes: e.target.value }))}
                  />
                </label>
              </div>
              <div className="rounded-lg border border-slate-200 p-2 dark:border-zinc-800">
                <button
                  type="button"
                  className="text-xs font-semibold text-[#C5A059] hover:underline"
                  onClick={() => setShowAdvancedRule((v) => !v)}
                >
                  {showAdvancedRule ? t(language, "catalog.hideAdvanced") : t(language, "catalog.showAdvanced")}
                </button>
                {showAdvancedRule ? (
                  <label className="mt-2 block">
                    <span className={fieldLabelClass}>{t(language, "catalog.ruleConfigJson")}</span>
                    <textarea
                      className="ui-input w-full min-h-[140px] font-mono text-xs"
                      value={form.rule_config_json}
                      onChange={(e) => setForm((f) => ({ ...f, rule_config_json: e.target.value }))}
                    />
                  </label>
                ) : (
                  <p className="mt-1 text-xs text-zinc-500">{t(language, "catalog.simplePriceHint")}</p>
                )}
              </div>
              <div className="flex gap-2">
                <button type="submit" className={btnPrimaryClass}>{modalSubmitLabel}</button>
                <button type="button" onClick={closeEditorModal} className={btnSecondaryClass}>{t(language, "profile.close")}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
*/
