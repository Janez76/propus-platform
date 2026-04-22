export type Role =
  | "admin"
  | "employee"
  | "photographer"
  | "super_admin"
  | "tour_manager"
  | "customer_admin"
  | "customer_user";

export type ApiOrder = {
  orderNo: string;
  status: string;
  customerName?: string;
  customerEmail?: string;
  appointmentDate?: string;
  total?: number;
  address?: string;
};
