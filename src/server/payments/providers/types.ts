/**
 * Payments P5 — Real Payment Gateway Runtime Layer.
 *
 * Provider-agnostic interface and normalized types. Both Authorize.net and
 * Cybersource implement `PaymentProviderAdapter`. The active checkout
 * gateway (`CommerceSettings.activeCheckoutGateway`) decides which adapter
 * `/api/v1/checkout/confirm` calls. Refund/void route by `Payment.provider`
 * on the original record (NEVER by active gateway) so historical orders
 * settle on the gateway that took the money.
 */

export type ProviderId = "AUTHORIZE_NET" | "CYBERSOURCE";

/** Caller-supplied payment instrument. Exactly one shape is consumed by the
 * adapter — adapters validate and reject the others. */
export interface PaymentInstrument {
  /** Authorize.net Accept.js opaque token. */
  authNetOpaqueData?: { dataDescriptor: string; dataValue: string };
  /** Cybersource Flex Microform transient JWT. */
  cybersourceTransientToken?: string;
  /** Sandbox-only direct card data (Cybersource test env). NEVER for prod. */
  cybersourceCard?: {
    number: string;
    expirationMonth: string; // "MM"
    expirationYear: string; // "YYYY"
    securityCode?: string;
  };
}

export interface NormalizedChargeInput {
  amountCents: number;
  currency: string; // ISO 4217, default "USD"
  /** Short, gateway-friendly invoice/order reference (≤ 20 chars). */
  invoiceNumber: string;
  orderId: string;
  customerEmail?: string | null;
  customerName?: string | null;
  billing?: {
    firstName?: string;
    lastName?: string;
    address1?: string;
    locality?: string;
    administrativeArea?: string;
    postalCode?: string;
    country?: string; // ISO-2
  };
  instrument: PaymentInstrument;
  metadata?: Record<string, string | number | null>;
}

export interface NormalizedChargeResult {
  ok: boolean;
  provider: ProviderId;
  /** Gateway's authoritative transaction id (used for refund/void). */
  transactionId: string | null;
  /** Provider-specific reference id (Authorize.net refId, etc). */
  referenceId: string | null;
  authCode: string | null;
  responseCode: string | null;
  message: string | null;
  /** Truncated, secret-stripped echo of the gateway response for audit. */
  rawSafeResponse: unknown;
  failureCode: string | null;
  failureMessage: string | null;
}

export interface NormalizedRefundInput {
  amountCents: number;
  currency: string;
  /** Original gateway transaction id from `Payment.gatewayTransactionId`. */
  originalTransactionId: string;
  orderId: string;
  reason?: string;
}

export interface NormalizedRefundResult {
  ok: boolean;
  provider: ProviderId;
  refundTransactionId: string | null;
  originalTransactionId: string;
  amountCents: number;
  message: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  rawSafeResponse: unknown;
}

export interface NormalizedVoidInput {
  /** Original gateway transaction id from `Payment.gatewayTransactionId`. */
  originalTransactionId: string;
  orderId: string;
}

export interface NormalizedVoidResult {
  ok: boolean;
  provider: ProviderId;
  voidTransactionId: string | null;
  originalTransactionId: string;
  message: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  rawSafeResponse: unknown;
}

export interface ProviderStatus {
  provider: ProviderId;
  configured: boolean;
  enabled: boolean;
  environment: "sandbox" | "test" | "production" | null;
  source: "db" | "env" | null;
  /** Whether this adapter could currently service a real charge call. */
  checkoutEligible: boolean;
  blockers: string[];
}

export interface PaymentProviderAdapter {
  readonly provider: ProviderId;
  getStatus(): Promise<ProviderStatus>;
  testConnection(): Promise<{ ok: boolean; message: string; status?: number | null }>;
  charge(input: NormalizedChargeInput): Promise<NormalizedChargeResult>;
  refund(input: NormalizedRefundInput): Promise<NormalizedRefundResult>;
  voidPayment(input: NormalizedVoidInput): Promise<NormalizedVoidResult>;
}

/** Truncate any raw gateway payload to a small JSON-safe shape for audit. */
export function safeTruncate(value: unknown, maxChars = 2000): unknown {
  try {
    const json = JSON.stringify(value);
    if (json.length <= maxChars) return value;
    return { _truncated: true, preview: json.slice(0, maxChars) + "…" };
  } catch {
    return { _truncated: true, preview: String(value).slice(0, maxChars) };
  }
}
