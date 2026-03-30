import { useState } from "react";
import { OrderDetails } from "./OrderDetails";
import type { Order, OrderStatus } from "../../types/order";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";

// Example order data
const exampleOrder: Order = {
  id: "order_123456",
  orderNumber: "100042",
  status: "pending",
  scheduledDate: "2026-03-15",
  contact: {
    name: "Hans Müller",
    email: "hans.mueller@example.ch",
    phone: "+41 79 123 45 67",
    company: "Müller Immobilien AG",
  },
  property: {
    address: "Bahnhofstrasse 123",
    city: "Zürich",
    postalCode: "8001",
    propertyType: "Einfamilienhaus",
    area: 250,
    floors: 3,
    latitude: 47.3769,
    longitude: 8.5417,
  },
  service: {
    packageName: "Premium Fotografie Paket",
    packagePrice: 2500,
    addons: [
      { name: "Drohnenaufnahmen", price: 500 },
      { name: "Virtuelle Tour", price: 800 },
      { name: "Twilight Shooting", price: 400 },
    ],
    notes: "Kunde wünscht spezielle Aufnahmen vom Garten und der modernen Küche. Beste Lichtverhältnisse am Nachmittag.",
  },
  finance: {
    subtotal: 4200,
    discount: 420,
    discountPercent: 10,
    vatRate: 8.1,
    vatAmount: 306.18,
    total: 4086.18,
  },
  createdAt: "2026-02-28T10:30:00Z",
  updatedAt: "2026-02-28T14:45:00Z",
};

export function OrderDetailsExample() {
  const language = useAuthStore((s) => s.language);
  const [order, setOrder] = useState<Order>(exampleOrder);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleStatusChange = (orderId: string, status: OrderStatus) => {
    console.log("Status changed:", orderId, status);
    setOrder((prev) => ({ ...prev, status }));
  };

  const handleDateChange = (orderId: string, date: string) => {
    console.log("Date changed:", orderId, date);
    setOrder((prev) => ({ ...prev, scheduledDate: date }));
  };

  const handleDelete = (orderId: string) => {
    console.log("Delete order:", orderId);
    if (window.confirm(t(language, "orderDetailsExample.confirmDelete"))) {
      alert(t(language, "orderDetailsExample.alertDelete"));
    }
  };

  const handlePrint = (orderId: string) => {
    console.log("Print order:", orderId);
    window.print();
  };

  const handleEmail = (orderId: string) => {
    console.log("Email order:", orderId);
    alert(t(language, "orderDetailsExample.alertEmail"));
  };

  const handleUpload = (orderId: string) => {
    console.log("Upload for order:", orderId);
    alert(t(language, "orderDetailsExample.alertUpload"));
  };

  return (
    <div className="space-y-4">
      <div className="p-4 bg-white rounded-lg shadow-sm border border-slate-200">
        <h2 className="text-lg font-bold mb-4">{t(language, "orderDetailsExample.title")}</h2>
        <div className="flex gap-4">
          <button
            onClick={() => setIsDialogOpen(true)}
            className="px-4 py-2 bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
          >
            {t(language, "orderDetailsExample.openDialog")}
          </button>
        </div>
      </div>

      {/* Full Page Version */}
      <OrderDetails
        order={order}
        onStatusChange={handleStatusChange}
        onDateChange={handleDateChange}
        onDelete={handleDelete}
        onPrint={handlePrint}
        onEmail={handleEmail}
        onUpload={handleUpload}
      />

      {/* Dialog Version */}
      <OrderDetails
        order={order}
        isDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onStatusChange={handleStatusChange}
        onDateChange={handleDateChange}
        onDelete={handleDelete}
        onPrint={handlePrint}
        onEmail={handleEmail}
        onUpload={handleUpload}
      />
    </div>
  );
}

