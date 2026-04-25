import { notFound } from "next/navigation";
import { ListChecks, Tag, Receipt, Clock, Wallet } from "lucide-react";
import { Section, Empty, KpiGrid, Kpi, formatCHF } from "../_shared";
import { LeistungenForm } from "./leistungen-form";
import { loadOrderContext } from "../_order-context";

type Addon = { id?: string; label: string; price?: number; qty?: number; group?: string };

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ edit?: string }>;
};

export default async function LeistungenPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = searchParams ? await searchParams : {};
  const isEditing = sp.edit === "1";
  const orderNo = Number(id);
  if (!Number.isInteger(orderNo) || orderNo <= 0) notFound();

  const o = await loadOrderContext(orderNo);
  if (!o) notFound();
  const order = {
    order_no: o.order_no,
    package_key: o.package_key,
    package_label: o.package_label,
    package_price: o.package_price,
    addons: o.addons as Addon[] | null,
    pricing_subtotal: o.pricing_subtotal,
    pricing_discount: o.pricing_discount,
    pricing_vat: o.pricing_vat,
    pricing_total: o.pricing_total,
    duration_min: o.duration_min,
  };

  const discount = Number(order.pricing_discount ?? 0);

  if (isEditing) {
    return (
      <>
        <LeistungenForm
          order={{
            order_no: order.order_no,
            discount_chf: Number.isFinite(discount) ? discount : 0,
            package_key: order.package_key,
            package_label: order.package_label,
            package_price: order.package_price,
            addons: order.addons,
            duration_min: order.duration_min,
            pricing_subtotal: order.pricing_subtotal,
            pricing_discount: order.pricing_discount,
            pricing_vat: order.pricing_vat,
            pricing_total: order.pricing_total,
          }}
        />
      </>
    );
  }

  const addons: Addon[] = order.addons ?? [];
  const subtotal = Number(order.pricing_subtotal ?? 0);
  const total = Number(order.pricing_total ?? 0);
  const addonQty = addons.reduce((acc, a) => acc + (a.qty ?? 1), 0);

  return (
    <div className="space-y-6">
      <KpiGrid>
        <Kpi
          icon={<Tag />}
          label="Paket"
          value={order.package_label ?? "—"}
          sub={order.package_price ? formatCHF(order.package_price) : (order.package_label ? undefined : "kein Paket")}
          accent={order.package_label ? "info" : undefined}
        />
        <Kpi
          icon={<ListChecks />}
          label="Zusatzleistungen"
          value={addons.length}
          sub={addonQty > addons.length ? `${addonQty} Einheiten` : undefined}
        />
        <Kpi
          icon={<Clock />}
          label="Dauer"
          value={order.duration_min ? `${order.duration_min} min` : "—"}
        />
        <Kpi
          icon={<Wallet />}
          label="Total inkl. MwSt"
          value={total > 0 ? formatCHF(total) : "—"}
          sub={discount > 0 ? `Rabatt ${formatCHF(discount)}` : undefined}
          accent="gold"
        />
      </KpiGrid>

      <Section title="Paket" icon={<Tag className="h-4 w-4" />}>
        {order.package_label ? (
          <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--paper-strip)] px-4 py-3">
            <div>
              <p className="text-sm font-medium text-[var(--ink)]">{order.package_label}</p>
              {order.package_key && (
                <p className="mt-0.5 text-xs text-[var(--ink-3)] font-mono">{order.package_key}</p>
              )}
            </div>
            <p className="text-sm font-semibold tabular-nums text-[var(--ink)] font-mono">{formatCHF(order.package_price)}</p>
          </div>
        ) : (
          <Empty>Kein Paket hinterlegt</Empty>
        )}
      </Section>

      <Section title="Zusatzleistungen" icon={<ListChecks className="h-4 w-4" />}>
        {addons.length > 0 ? (
          <div className="space-y-2">
            {addons.map((a, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--paper-strip)] px-4 py-3">
                <div className="flex items-center gap-3">
                  {a.qty && a.qty > 1 && (
                    <span className="rounded bg-[var(--gold-50)] border border-[var(--gold-200)] px-1.5 py-0.5 text-xs font-semibold text-[var(--gold-700)] tabular-nums font-mono">
                      ×{a.qty}
                    </span>
                  )}
                  <div>
                    <p className="text-sm text-[var(--ink)]">{a.label}</p>
                    {a.group && <p className="mt-0.5 text-xs text-[var(--ink-3)]">{a.group}</p>}
                  </div>
                </div>
                {a.price != null && (
                  <p className="text-sm tabular-nums font-mono text-[var(--ink)]">{formatCHF(a.price * (a.qty ?? 1))}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <Empty>Keine Zusatzleistungen gebucht</Empty>
        )}
      </Section>

      {order.duration_min != null && (
        <Section title="Dauer" icon={<Receipt className="h-4 w-4" />}>
          <p className="text-sm">{order.duration_min} min</p>
        </Section>
      )}

      <Section title="Preisübersicht" icon={<Receipt className="h-4 w-4" />}>
        {order.pricing_total ? (
          <div className="space-y-2">
            {subtotal > 0 && (
              <PriceLine label="Zwischensumme" value={formatCHF(subtotal)} />
            )}
            {discount > 0 && (
              <PriceLine label="Rabatt" value={`−${formatCHF(discount)}`} className="text-[var(--success)]" />
            )}
            {order.pricing_vat && (
              <PriceLine label="MwSt." value={formatCHF(order.pricing_vat)} />
            )}
            <div className="mt-3 border-t border-[var(--border)] pt-3">
              <div className="flex justify-between items-baseline">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-2)]">Total</span>
                <span className="text-2xl font-bold tabular-nums text-[var(--gold-700)] font-mono">{formatCHF(total)}</span>
              </div>
            </div>
          </div>
        ) : (
          <Empty>Keine Preisangaben hinterlegt</Empty>
        )}
      </Section>
    </div>
  );
}

function PriceLine({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-sm text-[var(--ink-3)]">{label}</span>
      <span className={`text-sm tabular-nums font-mono text-[var(--ink)] ${className ?? ""}`}>{value}</span>
    </div>
  );
}
