import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Calendar,
  CalendarCheck,
  Camera,
  Check,
  ChevronDown,
  Coins,
  Columns3,
  Folder,
  List,
  Map as MapIcon,
  Plus,
  Search,
  Trash2,
  User,
  UserMinus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import "../styles/orders-page.css";
import {
  createBexioSalesOrder,
  createExxasServiceOrder,
  deleteOrder,
  getOrders,
  syncExxasOrderLinks,
  updateOrderStatus,
  type Order,
} from "../api/orders";
import { getPhotographers, type Photographer } from "../api/photographers";
import { getAdminProfile, type AdminProfile } from "../api/profile";
import { fetchConfig } from "../api/bookingPublic";
import { CreateOrderWizard } from "../components/orders/CreateOrderWizard";
import { OrderMessages } from "../components/orders/OrderMessages";
import { OrdersMapView, OrdersMapViewNoKey } from "../components/orders/OrdersMapView";
import { OrderTable } from "../components/orders/OrderTable";
import { OrderSidePanel } from "../components/orders/OrderSidePanel";
import { OrderWeekCalendar } from "../components/orders/OrderWeekCalendar";
import { useQuery } from "../hooks/useQuery";
import { ordersQueryKey } from "../lib/queryKeys";
import { useAuthStore } from "../store/authStore";
import { useQueryStore } from "../store/queryStore";
import { t } from "../i18n";
import { getStatusLabel, normalizeStatusKey, STATUS_KEYS, type StatusKey } from "../lib/status";
import { getTerminInfo, startOfWeek, addDays, sameDay } from "../lib/orderTermin";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { useOrderStore } from "../store/orderStore";
import { BkbnOrdersBanner } from "../components/bkbn/BkbnOrdersBanner";
// BKBN-Auftraege haben eine eigene Detailseite (/admin/bkbn-orders) und
// werden NICHT mehr in die Auftraege-Liste gemischt — nur der Banner oben
// dient als Verweis auf die Detailseite.

type ViewMode = "list" | "kanban" | "calendar" | "map";
type QuickFilter = "none" | "today" | "thisWeek" | "nextWeek" | "overdue" | "overdueFlex" | "mine";

// Genau 5 sichtbare Chips, gespiegelt zum Kanban-Bucket-Modell:
//  - Ausstehend buendelt pending + provisional + disposition_offen
//    (alle drei sind operativ "wartet auf naechsten Schritt").
//  - Abgeschlossen buendelt done + archived (archived ist read-only-Endzustand).
//  - cancelled bleibt versteckt und wird via Toggle eingeblendet — Storni
//    sollen nicht standardmaessig im aktiven Workflow erscheinen.
// Filter-Label und Auftrags-Badge nutzen denselben Begriff (Single Source =
// app/src/lib/status.ts STATUS_MAP), damit Filter und Badge nicht
// auseinanderlaufen.
type ChipGroup = {
  id: string;
  labelKey: string;
  fallbackLabel: string;
  members: StatusKey[];
  dot: string;
  hiddenByDefault?: boolean;
};

export const CHIP_GROUPS: ChipGroup[] = [
  { id: "ausstehend", labelKey: "orders.chip.ausstehend", fallbackLabel: "Ausstehend", members: ["pending", "provisional", "disposition_offen"], dot: "#f59e0b" },
  { id: "confirmed", labelKey: "orders.chip.confirmed", fallbackLabel: "Bestätigt", members: ["confirmed"], dot: "#3b82f6" },
  { id: "paused", labelKey: "orders.chip.paused", fallbackLabel: "Wartet auf Kunde", members: ["paused"], dot: "#a78bfa" },
  { id: "material", labelKey: "orders.chip.material", fallbackLabel: "Material in Bearbeitung", members: ["completed"], dot: "#14b8a6" },
  { id: "abgeschlossen", labelKey: "orders.chip.abgeschlossen", fallbackLabel: "Abgeschlossen", members: ["done", "archived"], dot: "#10b981" },
  { id: "cancelled", labelKey: "orders.chip.cancelled", fallbackLabel: "Storniert", members: ["cancelled"], dot: "#ef4444", hiddenByDefault: true },
];

function isOpenOrder(key: StatusKey | null): boolean {
  if (!key) return true;
  return key !== "done" && key !== "archived" && key !== "cancelled";
}

export function OrdersPage() {
  // Body-Klasse waehrend dieser Route — schaltet auf Apple-Look-Background
  // (siehe orders-page.css body.orders-route). :has(.orders-page-v2)
  // greift nicht zuverlaessig (vermutlich CSS-Compiler) — Body-Klasse ist
  // deterministisch.
  useEffect(() => {
    document.body.classList.add("orders-route");
    return () => document.body.classList.remove("orders-route");
  }, []);

  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.role);
  const lang = useAuthStore((s) => s.language);
  const canCreateExxasOrder = role === "admin" || role === "super_admin";
  const [searchParams, setSearchParams] = useSearchParams();
  const query = useOrderStore((s) => s.query);
  const setQuery = useOrderStore((s) => s.setQuery);

  const queryKey = ordersQueryKey(token);
  const {
    data: allOrders = [],
    loading,
    error,
    refetch,
  } = useQuery<Order[]>(
    queryKey,
    () => getOrders(token),
    { enabled: Boolean(token), staleTime: 5 * 60 * 1000 },
  );

  const { data: photographers = [] } = useQuery<Photographer[]>(
    `photographers:${token || "anon"}`,
    () => getPhotographers(token),
    { enabled: Boolean(token), staleTime: 10 * 60 * 1000 },
  );

  const { data: adminProfile } = useQuery<{ profile: AdminProfile } | undefined>(
    `adminProfile:${token || "anon"}`,
    async () => {
      const r = await getAdminProfile(token);
      return { profile: r.profile };
    },
    { enabled: Boolean(token), staleTime: 30 * 60 * 1000 },
  );

  const { data: bookingConfig, loading: bookingConfigLoading } = useQuery(
    "bookingConfig:public",
    () => fetchConfig(),
    { enabled: true, staleTime: 15 * 60 * 1000, refetchOnWindowFocus: false },
  );
  const googleMapsKey = bookingConfig?.googleMapsKey?.trim() || null;

  const [view, setView] = useState<ViewMode>("list");
  const [statusSelection, setStatusSelection] = useState<Set<string>>(() => new Set());
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("none");
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openDropdown) return;
    function onDocClick(e: globalThis.MouseEvent) {
      const root = toolbarRef.current;
      if (!root) return;
      if (!root.contains(e.target as Node)) setOpenDropdown(null);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [openDropdown]);
  // BKBN-Auftraege werden in der Auftraege-Liste nicht mehr eingeblendet —
  // sie haben einen eigenen Bereich. Der Banner oben verlinkt darauf.
  const [photographerFilter, setPhotographerFilter] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<"all" | "fixed" | "flexible">("all");
  const [showArchivedChip, setShowArchivedChip] = useState(false);

  const [msgNo, setMsgNo] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Open the create dialog when entered via ?create=1 (e.g. from the
  // Kanban CTA). The flag is stripped from the URL after consumption so
  // a reload doesn't re-open the dialog.
  useEffect(() => {
    if (searchParams.get("create") === "1") {
      setShowCreate(true);
      const next = new URLSearchParams(searchParams);
      next.delete("create");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // BKBN-Auftraege werden hier nicht mehr geladen — sie haben einen
  // eigenen Bereich unter /admin/bkbn-orders (siehe BkbnOrdersBanner oben).

  const [selectedNos, setSelectedNos] = useState<Set<string>>(() => new Set());
  const [bulkTargetStatus, setBulkTargetStatus] = useState<StatusKey>("pending");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkFeedback, setBulkFeedback] = useState<string | null>(null);
  const [exxasNotice, setExxasNotice] = useState<string | null>(null);
  const [exxasBusy, setExxasBusy] = useState(false);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [sidePanelNo, setSidePanelNo] = useState<string | null>(null);

  const now = useMemo(() => new Date(), []);
  const weekStart = useMemo(() => startOfWeek(now, true), [now]);
  const nextWeekStart = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const thisWeekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const nextWeekEnd = useMemo(() => addDays(nextWeekStart, 6), [nextWeekStart]);

  const statusCounts = useMemo(() => {
    const counts: Record<StatusKey, number> = {
      pending: 0,
      disposition_offen: 0,
      provisional: 0,
      confirmed: 0,
      paused: 0,
      completed: 0,
      done: 0,
      cancelled: 0,
      archived: 0,
    };
    for (const o of allOrders) {
      const k = normalizeStatusKey(o.status);
      if (k) counts[k] += 1;
    }
    return counts;
  }, [allOrders]);

  function matchesStatusSelection(o: Order): boolean {
    if (statusSelection.size === 0) {
      const k = normalizeStatusKey(o.status);
      return isOpenOrder(k);
    }
    const k = normalizeStatusKey(o.status);
    if (!k) return false;
    for (const groupId of statusSelection) {
      const grp = CHIP_GROUPS.find((g) => g.id === groupId);
      if (grp && grp.members.includes(k)) return true;
    }
    return false;
  }

  function matchesQuickFilter(o: Order): boolean {
    if (quickFilter === "none") return true;
    if (quickFilter === "mine") {
      const myEmail = adminProfile?.profile?.email?.toLowerCase() || "";
      const pEmail = o.photographer?.email?.toLowerCase() || "";
      return Boolean(myEmail && pEmail && myEmail === pEmail);
    }
    if (quickFilter === "overdueFlex") {
      // Flex-Auftraege deren Deadline vorbei ist und die noch in Disposition
      // haengen — so sieht Office sofort, was dringend disponiert werden muss.
      if (o.bookingKind !== "flexible") return false;
      if (normalizeStatusKey(o.status) !== "disposition_offen") return false;
      if (!o.deadlineAt) return false;
      const dl = new Date(o.deadlineAt);
      if (Number.isNaN(dl.getTime())) return false;
      return dl.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    }
    if (!o.appointmentDate) return quickFilter === "overdue" ? false : false;
    const d = new Date(o.appointmentDate);
    if (Number.isNaN(d.getTime())) return false;
    if (quickFilter === "today") {
      if (normalizeStatusKey(o.status) === "paused") return false;
      return sameDay(d, now);
    }
    if (quickFilter === "overdue") {
      return d.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
        && normalizeStatusKey(o.status) !== "done"
        && normalizeStatusKey(o.status) !== "cancelled"
        && normalizeStatusKey(o.status) !== "archived";
    }
    if (quickFilter === "thisWeek") {
      return d >= weekStart && d <= new Date(thisWeekEnd.getFullYear(), thisWeekEnd.getMonth(), thisWeekEnd.getDate(), 23, 59, 59);
    }
    if (quickFilter === "nextWeek") {
      return d >= nextWeekStart && d <= new Date(nextWeekEnd.getFullYear(), nextWeekEnd.getMonth(), nextWeekEnd.getDate(), 23, 59, 59);
    }
    return true;
  }

  const orders = useMemo(
    () =>
      allOrders.filter((o) => {
        const q = query.toLowerCase();
        const matchQ =
          !q || [o.orderNo, o.customerName, o.customerEmail, o.address, o.billing?.company].filter(Boolean).join(" ").toLowerCase().includes(q);
        if (!matchQ) return false;
        if (!matchesStatusSelection(o)) return false;
        if (photographerFilter !== "all") {
          if ((o.photographer?.key || "") !== photographerFilter) return false;
        }
        if (kindFilter !== "all") {
          const kind = o.bookingKind || "fixed";
          if (kind !== kindFilter) return false;
        }
        if (!matchesQuickFilter(o)) return false;
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allOrders, query, statusSelection, photographerFilter, kindFilter, quickFilter, adminProfile, now],
  );

  const visibleOrderNoSet = useMemo(() => new Set(orders.map((o) => String(o.orderNo))), [orders]);
  useEffect(() => {
    setSelectedNos((prev) => {
      const next = new Set([...prev].filter((n) => visibleOrderNoSet.has(n)));
      return next.size === prev.size ? prev : next;
    });
  }, [visibleOrderNoSet]);

  function toggleStatusChip(groupId: string) {
    setStatusSelection((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  function toggleRowSelection(orderNo: string) {
    setSelectedNos((prev) => {
      const next = new Set(prev);
      if (next.has(orderNo)) next.delete(orderNo);
      else next.add(orderNo);
      return next;
    });
  }

  function toggleAllVisible(select: boolean) {
    setSelectedNos((prev) => {
      const next = new Set(prev);
      const visible = orders.map((o) => String(o.orderNo));
      if (select) visible.forEach((n) => next.add(n));
      else visible.forEach((n) => next.delete(n));
      return next;
    });
  }

  function toggleSectionSelection(orderNos: string[], select: boolean) {
    setSelectedNos((prev) => {
      const next = new Set(prev);
      if (select) orderNos.forEach((n) => next.add(n));
      else orderNos.forEach((n) => next.delete(n));
      return next;
    });
  }

  const handleCreateExxasOrder = useCallback(
    async (orderNo: string) => {
      if (!token || exxasBusy) return;
      setExxasBusy(true);
      setExxasNotice(null);
      try {
        const result = await createExxasServiceOrder(token, orderNo);
        if (result?.ok) {
          setExxasNotice(
            t(lang, "orders.exxas.createSuccess").replace("{{id}}", String(result.exxasOrderId ?? "")),
          );
          await refetch({ force: true });
        } else {
          setExxasNotice(String((result as { error?: string })?.error || t(lang, "orders.exxas.createError")));
        }
      } catch (e) {
        setExxasNotice(e instanceof Error ? e.message : t(lang, "orders.exxas.createError"));
      } finally {
        setExxasBusy(false);
      }
      window.setTimeout(() => setExxasNotice(null), 8000);
    },
    [token, exxasBusy, lang, refetch],
  );

  const handleCreateBexioOrder = useCallback(
    async (orderNo: string) => {
      if (!token || exxasBusy) return;
      setExxasBusy(true);
      setExxasNotice(null);
      try {
        const result = await createBexioSalesOrder(token, orderNo);
        if (result?.ok) {
          const display = result.bexioOrderNumber || result.bexioOrderId || "";
          setExxasNotice(
            t(lang, "orders.bexio.createSuccess").replace("{{id}}", String(display)),
          );
          await refetch({ force: true });
        } else {
          setExxasNotice(String((result as { error?: string })?.error || t(lang, "orders.bexio.createError")));
        }
      } catch (e) {
        setExxasNotice(e instanceof Error ? e.message : t(lang, "orders.bexio.createError"));
      } finally {
        setExxasBusy(false);
      }
      window.setTimeout(() => setExxasNotice(null), 8000);
    },
    [token, exxasBusy, lang, refetch],
  );

  const handleSyncExxasOrderLinks = useCallback(
    async (orderNo: string) => {
      if (!token || exxasBusy) return;
      setExxasBusy(true);
      setExxasNotice(null);
      try {
        const result = await syncExxasOrderLinks(token, orderNo);
        if (result?.ok) {
          const tour = (result as { exxasLinkTour?: string | null }).exxasLinkTour;
          const drive = (result as { exxasLinkDrive?: string | null }).exxasLinkDrive;
          const msg = t(lang, "orders.exxas.syncSuccess")
            .replace("{{tour}}", tour || "—")
            .replace("{{drive}}", drive || "—");
          setExxasNotice(msg);
          await refetch({ force: true });
        } else {
          const err = String((result as { error?: string })?.error || "");
          if (err && (/Nichts zu synchronisieren/i.test(err) || /hinterlegt/.test(err))) {
            setExxasNotice(t(lang, "orders.exxas.syncNoLinks"));
          } else {
            setExxasNotice(err || t(lang, "orders.exxas.syncError"));
          }
        }
      } catch (e) {
        setExxasNotice(e instanceof Error ? e.message : t(lang, "orders.exxas.syncError"));
      } finally {
        setExxasBusy(false);
      }
      window.setTimeout(() => setExxasNotice(null), 10000);
    },
    [token, exxasBusy, lang, refetch],
  );

  async function runBulkSetStatus() {
    const list = [...selectedNos];
    if (!list.length || !token) return;
    setBulkBusy(true);
    setBulkFeedback(null);
    let ok = 0;
    let fail = 0;
    for (const no of list) {
      try {
        await updateOrderStatus(token, no, bulkTargetStatus, { sendEmails: false });
        ok++;
      } catch {
        fail++;
      }
    }
    setBulkBusy(false);
    await refetch({ force: true });
    setSelectedNos(new Set());
    if (fail > 0) {
      setBulkFeedback(
        t(lang, "orders.bulk.partialResult")
          .replace("{{ok}}", String(ok))
          .replace("{{fail}}", String(fail))
          .replace("{{total}}", String(list.length)),
      );
    } else {
      setBulkFeedback(t(lang, "orders.bulk.allStatusOk").replace("{{count}}", String(ok)));
    }
    window.setTimeout(() => setBulkFeedback(null), 8000);
  }

  async function runBulkDelete() {
    const list = [...selectedNos];
    if (!list.length || !token) return;
    setBulkBusy(true);
    setBulkFeedback(null);
    let ok = 0;
    let fail = 0;
    for (const no of list) {
      try {
        await deleteOrder(token, no);
        ok++;
      } catch {
        fail++;
      }
    }
    setBulkBusy(false);
    setShowBulkDelete(false);
    await refetch({ force: true });
    // Sprint 9: globalen Cache invalidieren, damit Dashboard/OrdersMap die gelöschten
    // Aufträge nicht mehr aus stale-cache zeigen.
    useQueryStore.getState().invalidate(queryKey);
    setSelectedNos(new Set());
    if (fail > 0) {
      setBulkFeedback(
        t(lang, "orders.bulk.partialDeleteResult")
          .replace("{{ok}}", String(ok))
          .replace("{{fail}}", String(fail))
          .replace("{{total}}", String(list.length)),
      );
    } else {
      setBulkFeedback(t(lang, "orders.bulk.allDeleteOk").replace("{{count}}", String(ok)));
    }
    window.setTimeout(() => setBulkFeedback(null), 8000);
  }

  const openOrderPreview = useCallback((orderNo: string) => {
    setSidePanelNo(orderNo);
  }, []);

  const sidePanelOrder = useMemo(
    () => (sidePanelNo ? allOrders.find((o) => o.orderNo === sidePanelNo) ?? null : null),
    [allOrders, sidePanelNo],
  );

  const overdueCount = useMemo(
    () =>
      allOrders.filter((o) => {
        const info = getTerminInfo(o.appointmentDate, lang, now);
        if (info.kind !== "overdue") return false;
        const k = normalizeStatusKey(o.status);
        return k !== "done" && k !== "cancelled" && k !== "archived";
      }).length,
    [allOrders, lang, now],
  );

  // Anzahl der Flex-Auftraege deren Deadline bereits vorbei ist und die noch
  // in Disposition haengen — dringliche Office-Aufgabe.
  const overdueFlexCount = useMemo(
    () =>
      allOrders.filter((o) => {
        if (o.bookingKind !== "flexible") return false;
        if (normalizeStatusKey(o.status) !== "disposition_offen") return false;
        if (!o.deadlineAt) return false;
        const dl = new Date(o.deadlineAt);
        if (Number.isNaN(dl.getTime())) return false;
        return dl.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      }).length,
    [allOrders, now],
  );

  const hasAnyActiveFilter = statusSelection.size > 0 || quickFilter !== "none" || photographerFilter !== "all" || kindFilter !== "all" || query.length > 0;

  // ── KPIs (Propus admin redesign) ──────────────────────
  // Active = open orders that aren't done/cancelled/archived.
  // Open revenue = sum of totals on orders that haven't been invoiced.
  // Today = orders scheduled for today (any status that still uses a slot).
  // Unassigned = open orders without a photographer.
  const kpiActiveCount = useMemo(
    () => allOrders.filter((o) => isOpenOrder(normalizeStatusKey(o.status))).length,
    [allOrders],
  );
  const kpiOpenRevenue = useMemo(() => {
    // Heuristic: orders that aren't done/cancelled/archived still have
    // open revenue from the operational view (work not yet delivered).
    // The Order shape doesn't expose an `invoiced` flag; once billing
    // status is wired through the API this can become a stronger
    // "unbilled" check.
    return allOrders.reduce((sum, o) => {
      const k = normalizeStatusKey(o.status);
      if (k === "done" || k === "cancelled" || k === "archived") return sum;
      const total = Number(o.total ?? 0);
      if (!Number.isFinite(total) || total <= 0) return sum;
      return sum + total;
    }, 0);
  }, [allOrders]);
  const kpiTodayCount = useMemo(() => {
    const today = new Date();
    return allOrders.filter((o) => {
      if (!o.appointmentDate) return false;
      const k = normalizeStatusKey(o.status);
      if (k === "cancelled" || k === "archived") return false;
      const d = new Date(o.appointmentDate);
      return !Number.isNaN(d.getTime()) && sameDay(d, today);
    }).length;
  }, [allOrders]);
  const kpiUnassignedCount = useMemo(
    () =>
      allOrders.filter((o) => {
        const k = normalizeStatusKey(o.status);
        if (k === "cancelled" || k === "archived" || k === "done") return false;
        // Match the assignment heuristic used by the table
        // (photographerDisplay in OrderTable.tsx): an order counts as
        // assigned when either `photographer.name` OR `photographer.key`
        // is set. Legacy/imported orders sometimes carry only a name.
        const name = o.photographer?.name?.trim() || "";
        const key = o.photographer?.key?.trim() || "";
        return !name && !key;
      }).length,
    [allOrders],
  );

  // BKBN-Auftraege werden hier nicht mehr beigemischt — die Map zeigt nur
  // die regulaeren DB-Auftraege; BKBN hat seinen eigenen Bereich.
  const mapOrders = orders;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-2"
          style={{ borderColor: "var(--accent-subtle)", borderTopColor: "var(--accent)" }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="cust-alert cust-alert--error rounded-xl p-6 text-center">
        <p className="font-medium">{error}</p>
      </div>
    );
  }

  const formattedRevenue = new Intl.NumberFormat("de-CH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(kpiOpenRevenue);

  const zeitraumItems: { id: QuickFilter; label: string; count?: number }[] = [
    { id: "none", label: t(lang, "orders.quick.all"), count: allOrders.length },
    { id: "today", label: t(lang, "orders.quick.today"), count: kpiTodayCount },
    { id: "thisWeek", label: t(lang, "orders.quick.thisWeek") },
    { id: "nextWeek", label: t(lang, "orders.quick.nextWeek") },
    { id: "overdue", label: t(lang, "orders.quick.overdue"), count: overdueCount > 0 ? overdueCount : undefined },
    ...(overdueFlexCount > 0
      ? [{ id: "overdueFlex" as QuickFilter, label: t(lang, "orders.quick.overdueFlex"), count: overdueFlexCount }]
      : []),
    { id: "mine", label: t(lang, "orders.quick.mine") },
  ];

  const zeitraumLabel = zeitraumItems.find((i) => i.id === quickFilter)?.label || t(lang, "orders.quick.all");

  const visibleChipGroups = CHIP_GROUPS.filter((g) => !g.hiddenByDefault || showArchivedChip || statusSelection.has(g.id));
  const selectedStatusGroups = visibleChipGroups.filter((g) => statusSelection.has(g.id));
  const statusValueLabel = (() => {
    if (statusSelection.size === 0) return t(lang, "orders.filter.statusAll") || "Alle offenen";
    if (selectedStatusGroups.length === 1) {
      return t(lang, selectedStatusGroups[0].labelKey) || selectedStatusGroups[0].fallbackLabel;
    }
    return `${selectedStatusGroups.length} ${t(lang, "orders.filter.statusActive") || "aktiv"}`;
  })();

  const photographerLabel = photographerFilter === "all"
    ? (t(lang, "orders.filter.allEmployees") || "Alle Mitarbeiter")
    : (photographers.find((p) => p.key === photographerFilter)?.name || photographerFilter);

  const kindLabel = kindFilter === "all"
    ? (t(lang, "orders.filter.kind.all") || "Alle")
    : kindFilter === "fixed"
      ? (t(lang, "orders.filter.kind.fixed") || "Fix")
      : (t(lang, "orders.filter.kind.flexible") || "Flexibel");

  const viewItems = [
    { key: "list" as const, label: t(lang, "orders.view.list"), icon: <List /> },
    { key: "kanban" as const, label: "Kanban", icon: <Columns3 /> },
    { key: "calendar" as const, label: t(lang, "orders.view.calendar"), icon: <Calendar /> },
    { key: "map" as const, label: t(lang, "orders.view.map"), icon: <MapIcon /> },
  ];

  return (
    <div className="orders-page-v2">
      <div className="op-page">
        {/* Header */}
        <header className="op-header">
          <div className="op-header-text">
            <div className="op-header-meta">
              {kpiActiveCount} {t(lang, "orders.eyebrowSuffix") || "aktive Bestellungen"}
            </div>
            <h1 className="op-page-title">{t(lang, "orders.title")}</h1>
          </div>
          <div className="op-header-right">
            <div className="op-view-switch" role="tablist">
              {viewItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`op-view-btn ${view === item.key ? "is-active" : ""}`}
                  onClick={() => setView(item.key)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
            <button type="button" className="op-primary-btn" onClick={() => setShowCreate(true)}>
              <Plus />
              <span>{t(lang, "orders.button.newOrder")}</span>
            </button>
          </div>
        </header>

        {/* KPI row */}
        <section className="op-kpi-row">
          <div className="op-kpi">
            <div className="op-kpi-label">
              <span className="op-kpi-icon"><Folder /></span>
              {t(lang, "orders.kpi.activeTotal") || "Gesamt aktiv"}
            </div>
            <div className="op-kpi-value">{kpiActiveCount}</div>
            <div className="op-kpi-hint">
              {(t(lang, "orders.kpi.totalSuffix") || "von {{total}} insgesamt").replace("{{total}}", String(allOrders.length))}
            </div>
          </div>
          <div className="op-kpi is-gold">
            <div className="op-kpi-label">
              <span className="op-kpi-icon"><Coins /></span>
              {t(lang, "orders.kpi.openRevenue") || "Umsatz offen"}
            </div>
            <div className="op-kpi-value">
              <span className="op-kpi-unit">CHF</span>
              {formattedRevenue}
            </div>
            <div className="op-kpi-hint">{t(lang, "orders.kpi.unbilled") || "Noch nicht abgerechnet"}</div>
          </div>
          <div className="op-kpi is-green">
            <div className="op-kpi-label">
              <span className="op-kpi-icon"><CalendarCheck /></span>
              {t(lang, "orders.kpi.today") || "Heute"}
            </div>
            <div className="op-kpi-value">{kpiTodayCount}</div>
            <div className="op-kpi-hint">{t(lang, "orders.kpi.todayHint") || "Termin geplant"}</div>
          </div>
          <div className={`op-kpi ${kpiUnassignedCount > 0 ? "is-orange" : ""}`}>
            <div className="op-kpi-label">
              <span className="op-kpi-icon"><UserMinus /></span>
              {t(lang, "orders.kpi.unassigned") || "Ohne Fotograf"}
            </div>
            <div className="op-kpi-value">{kpiUnassignedCount}</div>
            <div className={`op-kpi-hint ${kpiUnassignedCount > 0 ? "is-warn" : ""}`}>
              {kpiUnassignedCount > 0 ? <AlertCircle /> : null}
              <span>
                {kpiUnassignedCount > 0
                  ? (t(lang, "orders.kpi.unassignedHint") || "Mitarbeiter zuweisen")
                  : (t(lang, "orders.kpi.allAssigned") || "alle zugewiesen")}
              </span>
            </div>
          </div>
        </section>

        <BkbnOrdersBanner />

        {/* Toolbar */}
        <div className="op-toolbar" ref={toolbarRef}>
          <div className="op-search-wrap">
            <Search />
            <input
              type="search"
              className="op-search-input"
              placeholder={t(lang, "orders.placeholder.search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {/* Zeitraum (single-select) */}
          <Dropdown
            isOpen={openDropdown === "zeitraum"}
            onToggle={() => setOpenDropdown((prev) => (prev === "zeitraum" ? null : "zeitraum"))}
            leadIcon={<Calendar />}
            label={t(lang, "orders.filter.zeitraum") || "Zeitraum"}
            value={zeitraumLabel}
          >
            {zeitraumItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`op-dd-item ${quickFilter === item.id ? "is-selected" : ""}`}
                onClick={() => {
                  setQuickFilter(item.id);
                  setOpenDropdown(null);
                }}
              >
                <Check className="op-dd-check" />
                <span>{item.label}</span>
                {item.count != null ? <span className="op-dd-count">{item.count}</span> : null}
              </button>
            ))}
          </Dropdown>

          {/* Status (multi-select) */}
          <Dropdown
            isOpen={openDropdown === "status"}
            onToggle={() => setOpenDropdown((prev) => (prev === "status" ? null : "status"))}
            dots={selectedStatusGroups.slice(0, 3).map((g) => g.members[0])}
            label={t(lang, "orders.filter.status") || "Status"}
            value={statusValueLabel}
          >
            {visibleChipGroups.map((group) => {
              const n = group.members.reduce((acc, k) => acc + (statusCounts[k] || 0), 0);
              const active = statusSelection.has(group.id);
              const label = t(lang, group.labelKey) || group.fallbackLabel;
              return (
                <button
                  key={group.id}
                  type="button"
                  data-testid={`orders-chip-${group.id}`}
                  className={`op-dd-item ${active ? "is-selected" : ""}`}
                  onClick={() => toggleStatusChip(group.id)}
                >
                  <Check className="op-dd-check" />
                  <span className="op-dd-dot" data-st={group.members[0]} />
                  <span>{label}</span>
                  <span className="op-dd-count">{n}</span>
                </button>
              );
            })}
            {!showArchivedChip ? (
              <button
                type="button"
                className="op-dd-item"
                onClick={() => setShowArchivedChip(true)}
              >
                <Check className="op-dd-check" />
                <span>{t(lang, "orders.chip.showArchived") || "Archivierte zeigen"}</span>
              </button>
            ) : null}
          </Dropdown>

          {/* Mitarbeiter */}
          <Dropdown
            isOpen={openDropdown === "mitarbeiter"}
            onToggle={() => setOpenDropdown((prev) => (prev === "mitarbeiter" ? null : "mitarbeiter"))}
            leadIcon={<User />}
            label={t(lang, "orders.filter.mitarbeiter") || "Mitarbeiter"}
            value={photographerLabel}
          >
            <button
              type="button"
              className={`op-dd-item ${photographerFilter === "all" ? "is-selected" : ""}`}
              onClick={() => {
                setPhotographerFilter("all");
                setOpenDropdown(null);
              }}
            >
              <Check className="op-dd-check" />
              <span>{t(lang, "orders.filter.allEmployees") || "Alle Mitarbeiter"}</span>
            </button>
            {photographers.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`op-dd-item ${photographerFilter === p.key ? "is-selected" : ""}`}
                onClick={() => {
                  setPhotographerFilter(p.key);
                  setOpenDropdown(null);
                }}
              >
                <Check className="op-dd-check" />
                <span>{p.name || p.key}</span>
              </button>
            ))}
          </Dropdown>

          {/* Buchungsart */}
          <Dropdown
            isOpen={openDropdown === "buchung"}
            onToggle={() => setOpenDropdown((prev) => (prev === "buchung" ? null : "buchung"))}
            leadIcon={<Camera />}
            label={t(lang, "orders.filter.kind.label") || "Buchungsart"}
            value={kindLabel}
          >
            {(["all", "fixed", "flexible"] as const).map((k) => (
              <button
                key={k}
                type="button"
                className={`op-dd-item ${kindFilter === k ? "is-selected" : ""}`}
                onClick={() => {
                  setKindFilter(k);
                  setOpenDropdown(null);
                }}
              >
                <Check className="op-dd-check" />
                <span>
                  {k === "all"
                    ? t(lang, "orders.filter.kind.all")
                    : k === "fixed"
                      ? t(lang, "orders.filter.kind.fixed")
                      : t(lang, "orders.filter.kind.flexible")}
                </span>
              </button>
            ))}
          </Dropdown>

          {hasAnyActiveFilter ? (
            <button
              type="button"
              className="op-filter-reset"
              onClick={() => {
                setStatusSelection(new Set());
                setQuickFilter("none");
                setPhotographerFilter("all");
                setKindFilter("all");
                setQuery("");
              }}
            >
              <X />
              <span>{t(lang, "orders.filter.reset")}</span>
            </button>
          ) : null}
        </div>

        {bulkFeedback ? (
          <div className="cust-alert cust-alert--info rounded-xl px-4 py-3 text-sm">{bulkFeedback}</div>
        ) : null}
        {exxasNotice ? (
          <div className="cust-alert cust-alert--info rounded-xl px-4 py-3 text-sm">{exxasNotice}</div>
        ) : null}

        {/* View */}
        {view === "list" ? (
          <div className="space-y-4">
            {orders.length === 0 ? (
              <EmptyState lang={lang} />
            ) : (
              <OrderTable
                orders={orders}
                onOpenDetail={openOrderPreview}
                onOpenMessages={setMsgNo}
                onOpenUpload={(no) => navigate(`/upload?order=${encodeURIComponent(no)}`)}
                selectedNos={selectedNos}
                onToggleRow={toggleRowSelection}
                onToggleAllVisible={toggleAllVisible}
                onToggleSection={toggleSectionSelection}
                onCreateExxasOrder={canCreateExxasOrder ? handleCreateExxasOrder : undefined}
                onSyncExxasOrderLinks={canCreateExxasOrder ? handleSyncExxasOrderLinks : undefined}
                onCreateBexioOrder={canCreateExxasOrder ? handleCreateBexioOrder : undefined}
              />
            )}
          </div>
        ) : view === "kanban" ? (
          <OrdersKanban
            orders={orders}
            allOrders={allOrders}
            onOpenDetail={openOrderPreview}
            lang={lang}
            token={token}
            onChanged={async () => {
              await refetch({ force: true });
            }}
          />
        ) : view === "calendar" ? (
          <OrderWeekCalendar orders={orders} onOpenDetail={openOrderPreview} />
        ) : (
          mapOrders.length === 0 ? (
            <EmptyState lang={lang} />
          ) : bookingConfigLoading ? (
            <div className="flex h-64 items-center justify-center rounded-xl border border-[var(--border-soft)]">
              <div
                className="h-12 w-12 animate-spin rounded-full border-2"
                style={{ borderColor: "var(--accent-subtle)", borderTopColor: "var(--accent)" }}
              />
              <span className="ml-3 text-sm text-[var(--text-subtle)]">{t(lang, "orders.map.configLoading")}</span>
            </div>
          ) : !googleMapsKey ? (
            <OrdersMapViewNoKey lang={lang} />
          ) : (
            <OrdersMapView
              apiKey={googleMapsKey}
              googleMapId={bookingConfig?.googleMapId ?? null}
              orders={mapOrders}
              onOpenDetail={openOrderPreview}
              lang={lang}
            />
          )
        )}

        {/* Sticky Bulk-Bar */}
        {selectedNos.size > 0 ? (
          <div className="op-bulk-bar">
            <span className="op-bulk-count">
              {(() => {
                const full = t(lang, "orders.bulk.selected").replace("{{count}}", String(selectedNos.size));
                const parts = full.split(String(selectedNos.size));
                return (
                  <>
                    {parts[0] || ""}
                    <strong>{selectedNos.size}</strong>
                    {parts.slice(1).join(String(selectedNos.size)) || ""}
                  </>
                );
              })()}
            </span>
            <select
              value={bulkTargetStatus}
              onChange={(e) => setBulkTargetStatus(e.target.value as StatusKey)}
              className="op-bulk-select"
              disabled={bulkBusy}
              aria-label={t(lang, "orders.bulk.targetStatus")}
            >
              {STATUS_KEYS.map((s) => (
                <option key={s} value={s}>
                  {getStatusLabel(s)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="op-bulk-btn"
              disabled={bulkBusy}
              onClick={() => void runBulkSetStatus()}
            >
              <ArrowRight />
              <span>{bulkBusy ? t(lang, "orders.bulk.applying") : t(lang, "orders.bulk.applyStatus")}</span>
            </button>
            <div className="op-bulk-actions">
              <button
                type="button"
                className="op-bulk-btn"
                disabled={bulkBusy}
                onClick={() => setShowBulkDelete(true)}
              >
                <Trash2 />
                <span>{t(lang, "orders.bulk.deleteSelected")}</span>
              </button>
              <button
                type="button"
                className="op-bulk-btn"
                disabled={bulkBusy}
                onClick={() => setSelectedNos(new Set())}
              >
                <X />
                <span>{t(lang, "orders.bulk.clearSelection")}</span>
              </button>
            </div>
          </div>
        ) : null}

        <Dialog open={showBulkDelete} onOpenChange={(open) => !bulkBusy && setShowBulkDelete(open)}>
        <DialogContent className="max-w-md border-red-500/25">
          <DialogClose onClose={() => !bulkBusy && setShowBulkDelete(false)} />
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/15">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <DialogTitle className="text-lg">{t(lang, "orders.bulk.confirmDeleteTitle")}</DialogTitle>
            </div>
          </DialogHeader>
          <p className="mb-6 text-sm" style={{ color: "var(--text-muted)" }}>
            {t(lang, "orders.bulk.confirmDeleteMessage").replace("{{count}}", String(selectedNos.size))}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              className="btn-secondary flex-1 justify-center"
              disabled={bulkBusy}
              onClick={() => setShowBulkDelete(false)}
            >
              {t(lang, "common.cancel")}
            </button>
            <button
              type="button"
              className="flex-1 justify-center rounded-lg border-none bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              disabled={bulkBusy}
              onClick={() => void runBulkDelete()}
            >
              {bulkBusy ? t(lang, "orders.bulk.deleting") : t(lang, "orders.bulk.confirmDelete")}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <CreateOrderWizard
        token={token}
        open={showCreate}
        onOpenChange={setShowCreate}
        onSuccess={async () => {
          await refetch({ force: true });
        }}
      />
      {msgNo ? <OrderMessages token={token} orderNo={msgNo} onClose={() => setMsgNo(null)} /> : null}

        <OrderSidePanel
          open={Boolean(sidePanelNo && sidePanelOrder)}
          order={sidePanelOrder}
          onClose={() => setSidePanelNo(null)}
          lang={lang}
          token={token}
          onChanged={async () => { await refetch({ force: true }); }}
        />
      </div>
    </div>
  );
}

function OrdersKanban({
  orders,
  allOrders,
  onOpenDetail,
  lang,
  token,
  onChanged,
}: {
  orders: Order[];
  allOrders: Order[];
  onOpenDetail: (orderNo: string) => void;
  lang: "de" | "en" | "fr" | "it";
  token: string | null;
  onChanged: () => void | Promise<void>;
}) {
  // 5 sichtbare Spalten — provisional + disposition_offen werden im
  // Default-Routing zu "pending" gebuendelt (Slot bzw. Disposition offen,
  // beide sind operativ "Ausstehend"); archived faellt in "done"; cancelled
  // bekommt im View-Switch keine eigene Spalte (Filter via Status-Chip).
  const columns: { id: StatusKey; title: string }[] = [
    { id: "pending", title: "Ausstehend" },
    { id: "confirmed", title: "Bestätigt" },
    { id: "paused", title: "Wartet auf Kunde" },
    { id: "completed", title: "Material in Bearbeitung" },
    { id: "done", title: "Abgeschlossen" },
  ];

  // Statt der reinen normalizeStatusKey-Anzeige wird ein DB-Status auf einen
  // der 5 Bucket-Stati gemappt. Sonst verschwaenden provisional /
  // disposition_offen / archived im Kanban — alle drei haben semantisch ein
  // sichtbares Pendant unter den 5 Bucket-Spalten.
  const bucketFor = (raw: string | undefined | null): StatusKey | null => {
    const k = normalizeStatusKey(raw);
    if (k === "provisional" || k === "disposition_offen") return "pending";
    if (k === "archived") return "done";
    if (k === "cancelled") return null;
    return k;
  };

  const [draggingNo, setDraggingNo] = useState<string | null>(null);
  const [dropCol, setDropCol] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [optimistic, setOptimistic] = useState<Record<string, StatusKey>>({});

  function effectiveStatus(o: Order): StatusKey | null {
    const o2 = optimistic[o.orderNo];
    if (o2) return bucketFor(o2);
    return bucketFor(o.status);
  }

  async function applyDrop(orderNo: string, target: StatusKey) {
    const o = orders.find((x) => x.orderNo === orderNo);
    if (!o || !token) return;
    // Bucket-Vergleich statt Raw-Status: provisional/disposition_offen
    // teilen den "pending"-Bucket; archived teilt sich den "done"-Bucket.
    // Drag auf dieselbe Bucket-Spalte ist ein No-op, sonst wuerde der
    // Backend einen verbotenen Uebergang (provisional -> pending) ablehnen.
    const currentBucket = bucketFor(o.status);
    if (currentBucket === target) return;
    setOptimistic((prev) => ({ ...prev, [orderNo]: target }));
    setBusy(true);
    let writeOk = false;
    try {
      await updateOrderStatus(token, orderNo, target, { sendEmails: false });
      writeOk = true;
      // The DB write landed. A refetch failure must NOT roll the UI back —
      // otherwise the card snaps to its old column even though the new
      // status is now persisted. Keep the optimistic entry until the
      // refetch lands (then it gets cleared because `orders` reflects it).
      await onChanged();
      setOptimistic((prev) => {
        const next = { ...prev };
        delete next[orderNo];
        return next;
      });
      toast.success(
        `Status geändert: ${getStatusLabel(currentBucket || o.status)} → ${getStatusLabel(target)}`,
      );
    } catch (err) {
      if (!writeOk) {
        // Only roll back when the write itself failed.
        setOptimistic((prev) => {
          const next = { ...prev };
          delete next[orderNo];
          return next;
        });
      }
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Statusänderung fehlgeschlagen: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  // Anzahl der abgeschlossenen Auftraege (done + archived) — Counter aus
  // allOrders, NICHT aus der gefilterten orders-Liste. Sonst wuerde der
  // Counter 0 zeigen, sobald der Default-Filter ("nur offene") aktiv ist.
  const completedTotal = allOrders.filter((o) => {
    const k = normalizeStatusKey(o.status);
    return k === "done" || k === "archived";
  }).length;

  return (
    <div className="op-kanban-board op-kanban-board--simple" data-busy={busy ? "true" : undefined}>
      {columns.map((col) => {
        const isCompletedCol = col.id === "done";
        // Abgeschlossen-Spalte rendert keine Karten — abgeschlossene
        // Auftraege werden nur in der Listenansicht gezeigt.
        const rows = isCompletedCol ? [] : orders.filter((o) => effectiveStatus(o) === col.id);
        const headerCount = isCompletedCol ? completedTotal : rows.length;
        const isDropTarget = dropCol === col.id && draggingNo !== null;
        return (
          <section
            key={col.id}
            className={`op-kanban-col${isDropTarget ? " is-drop-target" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (dropCol !== col.id) setDropCol(col.id);
            }}
            onDragLeave={() => {
              setDropCol((prev) => (prev === col.id ? null : prev));
            }}
            onDrop={(e) => {
              e.preventDefault();
              const orderNo = e.dataTransfer.getData("text/plain") || draggingNo || "";
              setDropCol(null);
              setDraggingNo(null);
              if (orderNo) void applyDrop(orderNo, col.id);
            }}
          >
            <header className="op-kanban-col-head">
              <span className="op-kanban-col-title">{col.title}</span>
              <span className="op-kanban-col-count">{headerCount}</span>
            </header>
            <div className="op-kanban-col-body">
              {isCompletedCol ? (
                <div className="op-kanban-col-empty" style={{ textAlign: "center", padding: "12px 8px", lineHeight: 1.5 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    {completedTotal} abgeschlossene Aufträge
                  </div>
                  <div style={{ fontSize: 11 }}>
                    Abgeschlossene Aufträge werden nur in der Listenansicht angezeigt.
                  </div>
                </div>
              ) : rows.length === 0 ? (
                <div className="op-kanban-col-empty">{t(lang, "orders.kanban.column.empty") || "Keine Einträge"}</div>
              ) : rows.map((o) => (
                <button
                  key={o.orderNo}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", o.orderNo);
                    setDraggingNo(o.orderNo);
                  }}
                  onDragEnd={() => {
                    setDraggingNo(null);
                    setDropCol(null);
                  }}
                  onClick={() => onOpenDetail(o.orderNo)}
                  className="op-kanban-card"
                  data-dragging={draggingNo === o.orderNo ? "true" : undefined}
                >
                  <div className="op-kanban-card-no">#{o.orderNo}</div>
                  <div className="op-kanban-card-title">
                    {o.billing?.company || o.customerName || "—"}
                  </div>
                  <div className="op-kanban-card-sub">
                    {o.address || o.customerZipcity || ""}
                  </div>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function EmptyState({ lang }: { lang: "de" | "en" | "fr" | "it" }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border-soft)] bg-[var(--surface)] p-10 text-center">
      <p className="text-sm font-medium text-[var(--text-main)]">{t(lang, "orders.empty.title")}</p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{t(lang, "orders.empty.description")}</p>
    </div>
  );
}

function Dropdown({
  isOpen,
  onToggle,
  leadIcon,
  dots,
  label,
  value,
  children,
}: {
  isOpen: boolean;
  onToggle: () => void;
  leadIcon?: React.ReactNode;
  dots?: string[];
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`op-dropdown ${isOpen ? "is-open" : ""}`}>
      <button type="button" className="op-dd-trigger" onClick={onToggle}>
        {leadIcon ? <span className="op-dd-lead-wrap">{leadIcon}</span> : null}
        {dots && dots.length > 0 ? (
          <span className="op-dd-dots">
            {dots.map((st, i) => (
              <span key={`${st}-${i}`} className="op-dd-dot" data-st={st} />
            ))}
          </span>
        ) : null}
        <span className="op-dd-label">{label}:</span>
        <span className="op-dd-value">{value}</span>
        <ChevronDown className="op-dd-chev" />
      </button>
      <div className="op-dd-menu" role="menu">
        {children}
      </div>
    </div>
  );
}
