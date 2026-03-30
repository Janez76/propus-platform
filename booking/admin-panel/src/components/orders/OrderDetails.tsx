import * as React from "react";
import {
  Building2,
  Calendar,
  Mail,
  MapPin,
  Package,
  Phone,
  Printer,
  Trash2,
  Upload,
  User,
  ExternalLink,
  Briefcase,
} from "lucide-react";
import { Badge } from "../ui/badge";
import { Separator } from "../ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "../ui/dialog";
import { formatCHF, formatSwissDate, formatArea, formatPhoneDisplay, phoneTelHref } from "../../lib/format";
import type { Order, OrderStatus } from "../../types/order";
import { cn } from "../../lib/utils";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";
import { getStatusLabel, getStatusBadgeClass } from "../../lib/status";
import { OrderStatusSelect } from "./OrderStatusSelect";

interface OrderDetailsProps {
  order: Order;
  isDialog?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onStatusChange?: (orderId: string, status: OrderStatus) => void;
  onDateChange?: (orderId: string, date: string) => void;
  onDelete?: (orderId: string) => void;
  onPrint?: (orderId: string) => void;
  onEmail?: (orderId: string) => void;
  onUpload?: (orderId: string) => void;
}

function SectionCard({
  icon: Icon,
  title,
  children,
  className,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-white rounded-xl border border-slate-200/60 shadow-sm p-6 hover:shadow-md transition-shadow",
        className
      )}
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-slate-50 rounded-lg">
          <Icon className="h-5 w-5 text-[var(--accent)]" />
        </div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
          {title}
        </h3>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function DataRow({
  label,
  value,
  href,
  icon: Icon,
  linkTarget = "_blank",
}: {
  label: string;
  value: string | React.ReactNode;
  href?: string;
  icon?: React.ElementType;
  linkTarget?: "_blank" | "_self";
}) {
  const content = (
    <div className="flex items-start justify-between gap-4 group">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <div className="flex items-center gap-2 text-right">
        <span className="text-sm font-medium text-slate-900">{value}</span>
        {Icon && <Icon className="h-4 w-4 text-slate-400 group-hover:text-[var(--accent)] transition-colors" />}
      </div>
    </div>
  );

  if (href) {
    const isBlank = linkTarget === "_blank";
    return (
      <a
        href={href}
        target={linkTarget}
        rel={isBlank ? "noopener noreferrer" : undefined}
        className="block hover:bg-slate-50/50 -mx-2 px-2 py-1 rounded-lg transition-colors"
      >
        {content}
      </a>
    );
  }

  return <div className="py-1">{content}</div>;
}

function OrderDetailsContent({ order, onStatusChange, onDateChange }: OrderDetailsProps) {
  const language = useAuthStore((s) => s.language);
  const token = useAuthStore((s) => s.token);
  const googleMapsUrl = order.property.latitude && order.property.longitude
    ? `https://www.google.com/maps?q=${order.property.latitude},${order.property.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${order.property.address}, ${order.property.postalCode} ${order.property.city}`
      )}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">
            {t(language, "orderDetails.title")} #{order.orderNumber}
          </h1>
          <p className="text-sm text-slate-500">
            {t(language, "orderDetails.createdAt")} {formatSwissDate(order.createdAt)}
          </p>
        </div>
        <span className={getStatusBadgeClass(order.status)}>
          {getStatusLabel(order.status)}
        </span>
      </div>

      {/* Responsive Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Contact Section */}
        <SectionCard icon={User} title={t(language, "orderDetails.section.contact")}>
          <DataRow label={t(language, "common.name")} value={order.contact.name} />
          <DataRow
            label={t(language, "common.email")}
            value={order.contact.email}
            href={`mailto:${order.contact.email}`}
            icon={Mail}
          />
          <DataRow
            label={t(language, "common.phone")}
            value={formatPhoneDisplay(order.contact.phone)}
            href={phoneTelHref(order.contact.phone) ?? undefined}
            linkTarget="_self"
            icon={Phone}
          />
          {order.contact.company && (
            <DataRow label={t(language, "common.company")} value={order.contact.company} icon={Briefcase} />
          )}
        </SectionCard>

        {/* Property Section */}
        <SectionCard icon={Building2} title={t(language, "orderDetails.section.property")}>
          <DataRow
            label={t(language, "common.address")}
            value={`${order.property.address}, ${order.property.postalCode} ${order.property.city}`}
            href={googleMapsUrl}
            icon={ExternalLink}
          />
          <DataRow label={t(language, "orderDetail.label.type")} value={order.property.propertyType} />
          <DataRow label={t(language, "orderDetail.label.area")} value={formatArea(order.property.area)} />
          <DataRow label={t(language, "orderDetail.label.floors")} value={order.property.floors.toString()} />
        </SectionCard>

        {/* Services Section */}
        <SectionCard icon={Package} title={t(language, "orderDetails.section.services")} className="md:col-span-2 lg:col-span-1">
          <div className="space-y-4">
            <div>
              <p className="text-sm font-bold text-slate-900 mb-2">
                {order.service.packageName}
              </p>
              <p className="text-xs text-slate-500">
                {formatCHF(order.service.packagePrice)}
              </p>
            </div>

            {order.service.addons.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                  {t(language, "wizard.label.addons")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {order.service.addons.map((addon, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      {addon.name} · {formatCHF(addon.price)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {order.service.notes && (
              <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  {t(language, "common.notes")}
                </p>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {order.service.notes}
                </p>
              </div>
            )}
          </div>
        </SectionCard>

        {/* Finance Section */}
        <SectionCard icon={Calendar} title={t(language, "orderDetails.section.finance")} className="md:col-span-2">
          <div className="space-y-2">
            <DataRow label={t(language, "orderDetails.finance.net")} value={formatCHF(order.finance.subtotal)} />
            {order.finance.discount > 0 && (
              <DataRow
                label={`${t(language, "orderDetail.pricing.discount")}${order.finance.discountPercent ? ` (${order.finance.discountPercent}%)` : ""}`}
                value={`-${formatCHF(order.finance.discount)}`}
              />
            )}
            <DataRow
              label={`${t(language, "orderDetails.finance.vat")} (${order.finance.vatRate}%)`}
              value={formatCHF(order.finance.vatAmount)}
            />
            <Separator className="my-2" />
            <div className="pt-2">
              <DataRow
                label={t(language, "orderDetail.pricing.total")}
                value={
                  <span className="text-lg font-bold text-[var(--accent)]">
                    {formatCHF(order.finance.total)}
                  </span>
                }
              />
            </div>
          </div>
        </SectionCard>

        {/* Controls Section */}
        <SectionCard icon={MapPin} title={t(language, "orderDetails.section.controls")} className="lg:col-span-1">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                {t(language, "orderDetail.section.status")}
              </label>
              <OrderStatusSelect
                orderNo={order.orderNumber || order.id}
                value={order.status}
                token={token}
                autoSave={false}
                onChanged={(next) => onStatusChange?.(order.id, next as OrderStatus)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition-colors hover:border-slate-300 focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                {t(language, "orderDetail.section.appointment")}
              </label>
              <input
                type="date"
                value={order.scheduledDate || ""}
                onChange={(e) => onDateChange?.(order.id, e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition-colors hover:border-slate-300 focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
              />
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function ActionBar({ order, onPrint, onUpload, onEmail, onDelete }: OrderDetailsProps) {
  const language = useAuthStore((s) => s.language);

  return (
    <div className="sticky bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 mt-8 -mx-6 -mb-6 md:-mx-8 md:-mb-8">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Action Group 1 */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPrint?.(order.id)}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-colors"
          >
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">{t(language, "orderDetail.button.print")}</span>
          </button>
          <button
            onClick={() => onUpload?.(order.id)}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-colors"
          >
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">{t(language, "orderDetail.button.upload")}</span>
          </button>
          <button
            onClick={() => onEmail?.(order.id)}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-colors"
          >
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">{t(language, "orderDetails.button.email")}</span>
          </button>
        </div>

        {/* Action Group 2 */}
        <button
          onClick={() => onDelete?.(order.id)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 hover:border-red-300 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
          <span>{t(language, "common.delete")}</span>
        </button>
      </div>
    </div>
  );
}

export function OrderDetails(props: OrderDetailsProps) {
  const language = useAuthStore((s) => s.language);
  const { isDialog = false, open, onOpenChange } = props;

  const content = (
    <>
      <OrderDetailsContent {...props} />
      <ActionBar {...props} />
    </>
  );

  if (isDialog && onOpenChange) {
    return (
      <Dialog open={open || false} onOpenChange={onOpenChange}>
        <DialogContent className="bg-slate-50">
          <DialogClose onClose={() => onOpenChange(false)} />
          <DialogHeader>
            <DialogTitle>{t(language, "orderDetails.dialogTitle")}</DialogTitle>
          </DialogHeader>
          <div className="bg-slate-50 -mx-6 -mb-6 md:-mx-8 md:-mb-8 px-6 py-4 md:px-8">
            {content}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200/60 p-6 md:p-8">
        {content}
      </div>
    </div>
  );
}

