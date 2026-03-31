export type Role =
  | "admin"
  | "photographer"
  | "super_admin"
  | "tour_manager"
  | "company_owner"
  | "company_admin"
  | "company_employee"
  | "customer"
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
