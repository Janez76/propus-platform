export type OrderStatus =
  | "pending"
  | "provisional"
  | "paused"
  | "confirmed"
  | "completed"
  | "done"
  | "cancelled"
  | "archived";

export interface OrderContact {
  name: string;
  email: string;
  phone: string;
  company?: string;
}

export interface OrderProperty {
  address: string;
  city: string;
  postalCode: string;
  propertyType: string;
  area: number;
  floors: number;
  latitude?: number;
  longitude?: number;
}

export interface OrderService {
  packageName: string;
  packagePrice: number;
  addons: Array<{
    name: string;
    price: number;
  }>;
  notes?: string;
}

export interface OrderFinance {
  subtotal: number;
  discount: number;
  discountPercent?: number;
  vatRate: number;
  vatAmount: number;
  total: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  scheduledDate?: string;
  contact: OrderContact;
  property: OrderProperty;
  service: OrderService;
  finance: OrderFinance;
  createdAt: string;
  updatedAt: string;
}
