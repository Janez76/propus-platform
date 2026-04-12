/**
 * Payrexx API Client
 *
 * Erstellt Payment Gateways für Online-Zahlungen (Kreditkarte, TWINT, PostFinance, PayPal).
 * Konfiguration über Umgebungsvariablen: PAYREXX_INSTANCE, PAYREXX_API_SECRET, PAYREXX_WEBHOOK_SECRET
 */

import crypto from "crypto";

const BASE_URL = "https://api.payrexx.com/v1.0";

function getInstance(): string {
  const instance = process.env.PAYREXX_INSTANCE;
  if (!instance) throw new Error("PAYREXX_INSTANCE ist nicht konfiguriert");
  return instance;
}

function getApiSecret(): string {
  const secret = process.env.PAYREXX_API_SECRET;
  if (!secret) throw new Error("PAYREXX_API_SECRET ist nicht konfiguriert");
  return secret;
}

function sign(params: Record<string, string>): string {
  const query = new URLSearchParams(params).toString();
  return crypto.createHmac("sha256", getApiSecret()).update(query).digest("base64");
}

export interface CreateGatewayParams {
  amount: number; // CHF-Betrag (z.B. 59.00)
  currency?: string;
  referenceId: string; // Rechnungsnummer z.B. RE-2026-042
  purposeText: string; // z.B. "Propus Rechnung RE-2026-042"
  successRedirect?: string;
  failedRedirect?: string;
  cancelRedirect?: string;
  expiresIn?: number; // Sekunden, default 86400 (24h)
  email?: string;
  company?: string;
  paymentMethods?: string[]; // z.B. ["mastercard", "visa", "twint"]
}

export interface PayrexxGatewayResult {
  id: number;
  hash: string;
  link: string;
}

export async function createPayrexxGateway(params: CreateGatewayParams): Promise<PayrexxGatewayResult> {
  const instance = getInstance();
  const amountRappen = Math.round(params.amount * 100);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  const pm = params.paymentMethods ?? ["mastercard", "visa", "twint", "postfinance"];

  const body: Record<string, string> = {
    amount: String(amountRappen),
    currency: params.currency ?? "CHF",
    referenceId: params.referenceId,
    purpose: params.purposeText,
    successRedirectUrl: params.successRedirect ?? `${appUrl}/zahlung/erfolg`,
    failedRedirectUrl: params.failedRedirect ?? `${appUrl}/zahlung/fehler`,
    cancelRedirectUrl: params.cancelRedirect ?? `${appUrl}/zahlung/abbruch`,
  };

  // Zahlungsmethoden
  pm.forEach((method, i) => {
    body[`pm[${i}]`] = method;
  });

  if (params.expiresIn) body.expiresIn = String(params.expiresIn);
  if (params.email) body["fields[email][value]"] = params.email;
  if (params.company) body["fields[company][value]"] = params.company;

  body.ApiSignature = sign(body);

  const res = await fetch(`${BASE_URL}/Gateway/?instance=${instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Payrexx Gateway Fehler: ${res.status} — ${text}`);
  }

  const json = await res.json();

  if (json.status !== "success") {
    throw new Error(`Payrexx: ${json.message ?? "Unbekannter Fehler"}`);
  }

  const gw = json.data[0];
  return {
    id: gw.id,
    hash: gw.hash,
    link: `https://${instance}.payrexx.com/?payment=${gw.hash}`,
  };
}

export async function deletePayrexxGateway(gatewayId: number): Promise<void> {
  const instance = getInstance();
  const params: Record<string, string> = {};
  params.ApiSignature = sign({ id: String(gatewayId) });
  await fetch(`${BASE_URL}/Gateway/${gatewayId}/?instance=${instance}&${new URLSearchParams(params)}`, {
    method: "DELETE",
  });
}

export function verifyWebhookSignature(payload: string, signature: string): boolean {
  const secret = process.env.PAYREXX_WEBHOOK_SECRET || process.env.PAYREXX_API_SECRET;
  if (!secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

/**
 * Ermittelt aktive Zahlungsmethoden basierend auf Finanz-Einstellungen.
 */
export function getActivePaymentMethods(settings: {
  payrexxTwint?: boolean;
  payrexxKarte?: boolean;
  payrexxPostfinance?: boolean;
  payrexxPaypal?: boolean;
}): string[] {
  const methods: string[] = [];
  if (settings.payrexxKarte) methods.push("mastercard", "visa");
  if (settings.payrexxTwint) methods.push("twint");
  if (settings.payrexxPostfinance) methods.push("postfinance");
  if (settings.payrexxPaypal) methods.push("paypal");
  return methods;
}
