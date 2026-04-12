export type PayrexxStatus =
  | "waiting"
  | "confirmed"
  | "authorized"
  | "reserved"
  | "refunded"
  | "partially-refunded"
  | "cancelled"
  | "declined"
  | "error";

export interface PayrexxGateway {
  id: number;
  hash: string;
  referenceId: string;
  link: string;
  status: PayrexxStatus;
  amount: number; // in Rappen (CHF 59.00 = 5900)
  currency: string;
  createdAt: number;
  expiresAt?: number;
}

export interface PayrexxWebhookTransaction {
  id: number;
  uuid: string;
  status: PayrexxStatus;
  time: number;
  lang: string;
  pageConfig: string;
  invoice: {
    referenceId: string;
    paymentRequestId: string;
    amount: number;
    currency: string;
  };
}

export interface PayrexxWebhookPayload {
  transaction: PayrexxWebhookTransaction;
}

export interface Zahlung {
  id: string;
  dokumentId: string;
  payrexxId: number | null;
  payrexxHash: string | null;
  payrexxUuid: string | null;
  status: string;
  betrag: number;
  currency: string;
  zahlungsmethode: string | null;
  referenz: string | null;
  webhookPayload: unknown;
  createdAt: string;
  updatedAt: string;
}
