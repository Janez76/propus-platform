import type { ReactNode } from "react";
import { type Order } from "../../api/orders";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";
import { formatCurrency } from "../../lib/utils";
import { formatPhoneDisplay, phoneTelHref } from "../../lib/format";
import { getStatusLabel } from "../../lib/status";

type Props = { data: Order };

function deriveZipCity(zipCity?: string, address?: string): string {
  const normalizedZipCity = (zipCity || "").trim();
  if (normalizedZipCity) return normalizedZipCity;
  const source = (address || "").trim();
  if (!source) return "";
  const segments = source.split(",").map((s) => s.trim()).filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i--) {
    const m = segments[i].match(/((?:CH[-\s]?)?\d{4}\s+[^,]+)$/i);
    if (m?.[1]) return m[1].trim();
  }
  return source.match(/((?:CH[-\s]?)?\d{4}\s+[^,]+)$/i)?.[1]?.trim() || "";
}

function Row({ label, value }: { label: string; value?: ReactNode }) {
  const empty = value == null || value === "";
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px solid #f0ece4", fontSize: 11 }}>
      <span style={{ color: "#888", flexShrink: 0, marginRight: 8 }}>{label}</span>
      <span style={{ fontWeight: 500, textAlign: "right" }}>{empty ? "–" : value}</span>
    </div>
  );
}

function printPhoneLink(raw?: string | null): ReactNode {
  const display = formatPhoneDisplay(raw);
  if (!display) return null;
  const href = phoneTelHref(String(raw ?? ""));
  if (!href) return display;
  return (
    <a href={href} style={{ color: "#9E8649", textDecoration: "none" }}>
      {display}
    </a>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 8, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase",
        color: "#9E8649", borderLeft: "3px solid #9E8649", paddingLeft: 6, marginBottom: 8,
        lineHeight: 1,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const label = getStatusLabel(status);
  const colors: Record<string, string> = {
    confirmed: "#d1fae5", provisional: "#fef3c7", pending: "#f1f5f9",
    cancelled: "#fee2e2", done: "#ede9fe", completed: "#e0f2fe",
    paused: "#fce7f3", archived: "#f3f4f6",
  };
  const bg = colors[status] || "#f3f4f6";
  return (
    <span style={{ background: bg, borderRadius: 100, padding: "2px 10px", fontSize: 9, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#333" }}>
      {label}
    </span>
  );
}

export function PrintOrder({ data }: Props) {
  const language = useAuthStore((s) => s.language);
  const addressLine = data.address || data.billing?.street || "";
  const zipCityLine = deriveZipCity(data.billing?.zipcity, addressLine);
  const dateFormatted = data.appointmentDate
    ? new Date(data.appointmentDate).toLocaleDateString("de-CH")
    : data.schedule?.date || "–";
  const timeFormatted = data.appointmentDate
    ? new Date(data.appointmentDate).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" }) + " " + t(language, "printOrder.clockSuffix")
    : data.schedule?.time || "–";
  const subtotal = data.pricing?.subtotal || 0;
  const vat = data.pricing?.vat || 0;
  const total = data.total || data.pricing?.total || 0;
  const vatRate =
    vat > 0 && subtotal > 0
      ? ((vat / subtotal) * 100).toFixed(1)
      : vat === 0
        ? "0"
        : "8.1";

  return (
    <div style={{ background: "#fff", fontFamily: "'Helvetica Neue', Arial, sans-serif", color: "#1a1a1a", padding: "32px 40px", maxWidth: 720, margin: "0 auto" }}>

      {/* ── HEADER ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "0.18em", color: "#9E8649" }}>PROPUS</div>
          <div style={{ fontSize: 9, color: "#aaa", letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 2 }}>Real Estate Photography</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", marginBottom: 4 }}>
            {t(language, "printOrder.order")} <span style={{ color: "#9E8649" }}>#{data.orderNo}</span>
          </div>
          <div style={{ marginBottom: 4 }}>
            <StatusPill status={data.status} />
          </div>
          <div style={{ fontSize: 10, color: "#888" }}>{dateFormatted}</div>
        </div>
      </div>

      {/* ── GOLD DIVIDER ── */}
      <div style={{ height: 2, background: "linear-gradient(90deg, #9E8649 0%, #c9a85c 60%, #e8d5a3 100%)", marginBottom: 20, borderRadius: 2 }} />

      {/* ── 2-COLUMN GRID ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 32px" }}>

        {/* LEFT COL */}
        <div>
          <Section title={t(language, "printOrder.section.customer")}>
            <Row label={t(language, "common.name")} value={data.billing?.name || data.customerName} />
            <Row label={t(language, "common.company")} value={data.billing?.company} />
            <Row label={t(language, "common.email")} value={data.billing?.email || data.customerEmail} />
            <Row label={t(language, "common.phone")} value={printPhoneLink(data.billing?.phone)} />
            {(data.billing?.onsiteName || data.billing?.onsitePhone) && (
              <Row
                label={t(language, "printOrder.onsiteContact")}
                value={
                  <>
                    {data.billing.onsiteName || ""}
                    {data.billing.onsiteName && data.billing.onsitePhone ? " · " : ""}
                    {printPhoneLink(data.billing?.onsitePhone)}
                  </>
                }
              />
            )}
          </Section>

          <Section title={t(language, "printOrder.section.addressObject")}>
            <Row label={t(language, "common.address")} value={addressLine} />
            <Row label={t(language, "printOrder.objectType")} value={data.object?.type} />
            <Row label={t(language, "orderDetail.label.area")} value={data.object?.area ? `${data.object.area} m²` : undefined} />
            <Row label={t(language, "orderDetail.label.floors")} value={data.object?.floors != null ? String(data.object.floors) : undefined} />
            <Row label={t(language, "orderDetail.label.rooms")} value={data.object?.rooms != null ? String(data.object.rooms) : undefined} />
          </Section>
        </div>

        {/* RIGHT COL */}
        <div>
          <Section title={t(language, "orderDetail.section.appointment")}>
            <Row label={t(language, "orderCreate.label.date")} value={dateFormatted} />
            <Row label={t(language, "orderCreate.label.time")} value={timeFormatted} />
            <Row
              label={t(language, "printOrder.photographer")}
              value={
                (() => {
                  const name = data.photographer?.name || data.photographer?.key;
                  const phoneNode = printPhoneLink(data.photographer?.phone);
                  if (name && phoneNode) {
                    return (
                      <>
                        {name}
                        {" | "}
                        {phoneNode}
                      </>
                    );
                  }
                  return name || phoneNode || null;
                })()
              }
            />
          </Section>

          <Section title={t(language, "printOrder.section.services")}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 11, fontWeight: 600 }}>
              <span>{data.services?.package?.label || t(language, "orderDetail.label.package")}</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {(data.services?.addons || []).map((addon, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 10, borderTop: "1px solid #f0ece4" }}>
                <span style={{ color: "#888" }}>{addon.label}</span>
                <span>–</span>
              </div>
            ))}
          </Section>

          {/* PREIS BOX */}
          <div style={{ background: "#fdfaf3", border: "1px solid #e8d5a3", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
            <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "#9E8649", marginBottom: 8 }}>
              {t(language, "printOrder.section.price")}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 4, color: "#666" }}>
              <span>{t(language, "orderDetail.pricing.subtotal")}</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 8, color: "#666" }}>
              <span>{t(language, "orderDetail.pricing.vatPercent").replace("8.1", vatRate)}</span>
              <span>{formatCurrency(vat)}</span>
            </div>
            <div style={{ borderTop: "1px solid #d4b97a", paddingTop: 8, display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 13, color: "#9E8649" }}>
              <span>{t(language, "orderDetail.pricing.total")}</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>

          <Section title={t(language, "printOrder.section.billingAddress")}>
            <Row label={t(language, "orderDetail.label.street")} value={data.billing?.street} />
            <Row label={t(language, "orderCreate.label.zipCity")} value={zipCityLine} />
          </Section>
        </div>

      </div>

      {/* ── HINWEIS (wenn vorhanden) ── */}
      {(data.notes || data.billing?.notes) && (
        <Section title={t(language, "printOrder.section.notes")}>
          <div style={{ padding: "4px 0", fontSize: 11, lineHeight: 1.4, whiteSpace: "pre-wrap" }}>
            {data.notes || data.billing?.notes}
          </div>
        </Section>
      )}

      {/* ── SCHLÜSSELABHOLUNG (wenn vorhanden) ── */}
      {data.keyPickup && (data.keyPickup.address || data.keyPickup.notes || (data.keyPickup as { info?: string }).info) && (
        <Section title={t(language, "printOrder.section.keyPickup")}>
          {data.keyPickup.address && (
            <Row label={t(language, "common.address")} value={data.keyPickup.address} />
          )}
          {(data.keyPickup.notes || (data.keyPickup as { info?: string }).info) && (
            <div style={{ padding: "4px 0", fontSize: 11, lineHeight: 1.4, whiteSpace: "pre-wrap" }}>
              {data.keyPickup.notes || (data.keyPickup as { info?: string }).info}
            </div>
          )}
        </Section>
      )}

      {/* ── FOOTER ── */}
      <div style={{ marginTop: 24, paddingTop: 10, borderTop: "1px solid #f0ece4", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 9, color: "#bbb" }}>
        <span>© {new Date().getFullYear()} Propus GmbH · {t(language, "printOrder.footerRights")}</span>
        <span style={{ color: "#9E8649", fontWeight: 700, letterSpacing: "0.06em" }}>propus.ch</span>
      </div>

    </div>
  );
}
