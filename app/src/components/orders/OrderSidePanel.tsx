import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink, User, Calendar, MapPin, Package, Image as ImageIcon, History } from "lucide-react";
import type { Order } from "../../api/orders";
import { SidePanel } from "../handoff/SidePanel";
import { StatusChip } from "../handoff/StatusChip";
import { t, type Lang } from "../../i18n";
import { formatDateTime } from "../../lib/utils";
type Tab = "overview" | "services" | "customer" | "history";

const TAB_LABEL: Record<Tab, string> = {
  overview: "Übersicht",
  services: "Leistungen",
  customer: "Kunde",
  history: "Verlauf",
};

export function OrderSidePanel({
  open,
  order,
  onClose,
  lang,
}: {
  open: boolean;
  order: Order | null;
  onClose: () => void;
  lang: Lang;
}) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("overview");

  if (!open) return null;
  if (!order) return null;

  const orderNo = order.orderNo;
  const pkg = order.services?.package?.label ?? "—";
  const photographer = order.photographer?.name ?? "—";
  const termin = order.appointmentDate
    ? formatDateTime(order.appointmentDate)
    : "—";
  const addr = order.address || order.customerZipcity || "—";
  const total = order.total != null
    ? new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(order.total)
    : "—";

  return (
    <SidePanel
      open={open}
      title={`Bestellung #${orderNo}`}
      onClose={onClose}
      footer={(
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className="btn-ghost"
            onClick={onClose}
          >
            {t(lang, "common.close")}
          </button>
          <button
            type="button"
            className="btn-primary inline-flex items-center gap-1.5"
            onClick={() => {
              navigate(`/orders/${encodeURIComponent(orderNo)}`);
            }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t(lang, "orders.sidePanel.fullView") || "Volle Ansicht"}
          </button>
        </div>
      )}
    >
      <div className="mb-3 flex flex-wrap gap-1 border-b border-[var(--border-soft)] pb-2">
        {(Object.keys(TAB_LABEL) as Tab[]).map((k) => (
          <button
            key={k}
            type="button"
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              tab === k
                ? "bg-[var(--accent)]/15 text-[var(--accent)] ring-1 ring-[var(--accent)]/30"
                : "text-[var(--text-subtle)] hover:text-[var(--text-main)]"
            }`}
            onClick={() => setTab(k)}
          >
            {TAB_LABEL[k]}
          </button>
        ))}
      </div>

      <div className="mb-3">
        <StatusChip status={order.status} />
      </div>

      {tab === "overview" && (
        <div className="space-y-3 text-sm text-[var(--text-main)]">
          <p className="m-0 flex items-start gap-2">
            <User className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-subtle)]" />
            <span>
              <strong className="font-semibold">
                {order.customerName || t(lang, "orders.unknownCustomer") || "Kunde unbekannt"}
              </strong>
              {order.customerEmail ? (
                <span className="block text-xs text-[var(--text-subtle)]">{order.customerEmail}</span>
              ) : null}
            </span>
          </p>
          <p className="m-0 flex items-start gap-2">
            <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-subtle)]" />
            <span>{termin}</span>
          </p>
          <p className="m-0 flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-subtle)]" />
            <span className="break-words">{addr}</span>
          </p>
          <p className="m-0 flex items-start gap-2">
            <ImageIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-subtle)]" />
            <span>{order.listingTitle || order.listingSlug || "—"}</span>
          </p>
          <p className="m-0 flex items-start gap-2">
            <Package className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-subtle)]" />
            <span>{pkg}</span>
          </p>
          <p className="m-0 text-sm">
            <span className="text-[var(--text-subtle)]">Fotograf: </span>
            {photographer}
          </p>
          <p className="m-0 text-base font-semibold text-[var(--gold-700)]">Total: {total}</p>
        </div>
      )}

      {tab === "services" && (
        <ul className="m-0 list-none space-y-2 p-0 text-sm">
          <li className="flex justify-between gap-2">
            <span className="text-[var(--text-subtle)]">Paket</span>
            <span className="font-medium">{order.services?.package?.label ?? "—"}</span>
          </li>
          {order.services?.addons?.map((a) => (
            <li key={a.id ?? a.label} className="flex justify-between gap-2">
              <span className="text-[var(--text-subtle)]">{a.label}</span>
              {a.price != null ? (
                <span>
                  {new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(a.price)}
                </span>
              ) : (
                <span>—</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {tab === "customer" && (
        <div className="space-y-2 text-sm">
          {order.billing ? (
            <>
              <p>
                <span className="text-[var(--text-subtle)]">Firma / Name</span>
                <br />
                {order.billing.company || order.billing.name || "—"}
              </p>
              <p>
                <span className="text-[var(--text-subtle)]">E-Mail</span>
                <br />
                {order.billing.email || order.customerEmail || "—"}
              </p>
              <p>
                <span className="text-[var(--text-subtle)]">Telefon</span>
                <br />
                {order.billing.phone || order.customerPhone || "—"}
              </p>
            </>
          ) : (
            <p>
              {order.customerName}
              {order.customerEmail ? ` · ${order.customerEmail}` : ""}
            </p>
          )}
        </div>
      )}

      {tab === "history" && (
        <div className="flex items-start gap-2 text-sm text-[var(--text-subtle)]">
          <History className="h-4 w-4 shrink-0" />
          <p className="m-0">
            {t(lang, "orders.sidePanel.historyHint") || "Zeitleiste und Aktionen in der vollen Bestellansicht."}
          </p>
        </div>
      )}
    </SidePanel>
  );
}
