export type Role =
  | "admin"
  | "photographer"
  | "super_admin"
  | "tour_manager";

export type ApiOrder = {
  orderNo: string;
  status: string;
  customerName?: string;
  customerEmail?: string;
  appointmentDate?: string;
  total?: number;
  address?: string;
};
