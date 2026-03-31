import { create } from "zustand";
import type { Order } from "../api/orders";

type OrderState = {
  orders: Order[];
  query: string;
  statusFilter: string;
  selectedOrderNo: string | null;
  cardView: boolean;
  setOrders: (orders: Order[]) => void;
  setQuery: (q: string) => void;
  setStatusFilter: (s: string) => void;
  selectOrder: (orderNo: string | null) => void;
  setCardView: (cardView: boolean) => void;
};

export const useOrderStore = create<OrderState>((set) => ({
  orders: [],
  query: "",
  statusFilter: "all",
  selectedOrderNo: null,
  cardView: true,
  setOrders: (orders) => set({ orders }),
  setQuery: (query) => set({ query }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  selectOrder: (selectedOrderNo) => set({ selectedOrderNo }),
  setCardView: (cardView) => set({ cardView }),
}));
