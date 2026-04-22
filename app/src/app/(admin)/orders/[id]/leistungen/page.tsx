import { notFound } from "next/navigation";
import { ListChecks, Tag, Receipt } from "lucide-react";
import { queryOne } from "@/lib/db";
import { Section, InfoItem, Empty, formatCHF } from "../_shared";
import { LeistungenForm } from "./leistungen-form";
import { OrderSaveToast } from "../order-save-toast";

type Addon = { id?: string; label: string; price?: number; qty?: number; group?: string };

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ edit?: string }>;
};

export default async function LeistungenPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = searchParams ? await searchParams : {};
  const isEditing = sp.edit === "1";

  const order = await queryOne<{
    order_no: number;
    package_key: string | null;
    package_label: string | null;
    package_price: string | null;
    addons: Addon[] | null;
    pricing_subtotal: string | null;
    pricing_discount: string | null;
    pricing_vat: string | null;
    pricing_total: string | null;
    duration_min: number | null;
  }>(`
    SELECT
      order_no,
      services->'package'->>'key'              AS package_key,
      services->'package'->>'label'            AS package_label,
      services->'package'->>'price'            AS package_price,
      services->'addons'                       AS addons,
      pricing->>'subtotal'                     AS pricing_subtotal,
      pricing->>'discount'                     AS pricing_discount,
      pricing->>'vat'                          AS pricing_vat,
      pricing->>'total'                        AS pricing_total,
      (schedule->>'durationMin')::int          AS duration_min
    FROM booking.orders
    WHERE order_no = $1
  `, [id]);

  if (!order) notFound();

  const discount = Number(order.pricing_discount ?? 0);

  if (isEditing) {
    return (
      <>
        <OrderSaveToast />
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

  return (
    <div className="space-y-6">
      <OrderSaveToast />
      <Section title="Paket" icon={<Tag className="h-4 w-4" />}>
        {order.package_label ? (
          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
            <div>
              <p className="text-sm font-medium">{order.package_label}</p>
              {order.package_key && (
                <p className="mt-0.5 text-xs text-white/40">{order.package_key}</p>
              )}
            </div>
            <p className="text-sm font-semibold tabular-nums">{formatCHF(order.package_price)}</p>
          </div>
        ) : (
          <Empty>Kein Paket hinterlegt</Empty>
        )}
      </Section>

      <Section title="Zusatzleistungen" icon={<ListChecks className="h-4 w-4" />}>
        {addons.length > 0 ? (
          <div className="space-y-2">
            {addons.map((a, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
                <div className="flex items-center gap-3">
                  {a.qty && a.qty > 1 && (
                    <span className="rounded bg-white/10 px-1.5 py-0.5 text-xs font-medium tabular-nums">
                      ×{a.qty}
                    </span>
                  )}
                  <div>
                    <p className="text-sm">{a.label}</p>
                    {a.group && <p className="mt-0.5 text-xs text-white/40">{a.group}</p>}
                  </div>
                </div>
                {a.price != null && (
                  <p className="text-sm tabular-nums">{formatCHF(a.price * (a.qty ?? 1))}</p>
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
          <p className="text-sm">{order.duration_min} min (schedule.durationMin)</p>
        </Section>
      )}

      <Section title="Preisübersicht" icon={<Receipt className="h-4 w-4" />}>
        {order.pricing_total ? (
          <div className="space-y-2">
            {subtotal > 0 && (
              <PriceLine label="Zwischensumme" value={formatCHF(subtotal)} />
            )}
            {discount > 0 && (
              <PriceLine label="Rabatt" value={`−${formatCHF(discount)}`} className="text-emerald-400" />
            )}
            {order.pricing_vat && (
              <PriceLine label="MwSt." value={order.pricing_vat} />
            )}
            <div className="mt-3 border-t border-white/10 pt-3">
              <PriceLine
                label="Total"
                value={formatCHF(total)}
                className="text-base font-semibold text-white"
              />
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
      <span className="text-sm text-white/60">{label}</span>
      <span className={`text-sm tabular-nums ${className ?? ""}`}>{value}</span>
    </div>
  );
}
