/**
 * Payments P5 — Cybersource transaction client.
 *
 * Implements signed REST calls to the Cybersource Payments API for charge,
 * refund, and void. Reuses `buildCybersourceHttpSignatureHeaders` for
 * HTTP-Signature auth.
 *
 * Endpoints:
 *   POST /pts/v2/payments                          — charge (authCapture)
 *   POST /pts/v2/payments/{id}/refunds             — refund
 *   POST /pts/v2/payments/{id}/voids               — void (pre-settlement)
 *
 * Reference docs:
 *   https://developer.cybersource.com/api-reference-assets/index.html#payments
 */
import {
  buildCybersourceHttpSignatureHeaders,
  cybersourceHost,
} from "@/server/payments/cybersourceSignature";
import {
  getResolvedCybersourceConfig,
  type ResolvedCybersourceConfig,
} from "@/server/cybersource/client";

export type CybersourceCallResult = {
  httpStatus: number | null;
  body: any;
  networkError: string | null;
};

async function postSigned(
  cfg: ResolvedCybersourceConfig,
  path: string,
  body: unknown,
): Promise<CybersourceCallResult> {
  const host = cybersourceHost(cfg.env);
  const json = JSON.stringify(body ?? {});
  const headers = buildCybersourceHttpSignatureHeaders({
    method: "POST",
    path,
    body: json,
    merchantId: cfg.merchantId,
    keyId: cfg.keyId,
    sharedSecret: cfg.sharedSecret,
    host,
  });
  const url = `https://${host}${path}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        Accept: "application/hal+json",
      },
      body: json,
    });
    const text = await res.text();
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { rawText: text.slice(0, 1000) };
    }
    return { httpStatus: res.status, body: parsed, networkError: null };
  } catch (e: any) {
    return {
      httpStatus: null,
      body: null,
      networkError: e?.message || "network error",
    };
  }
}

export type CybersourceChargeInput = {
  amount: string; // "150.00"
  currency: string;
  invoiceNumber: string;
  customerEmail?: string | null;
  billing?: {
    firstName?: string;
    lastName?: string;
    address1?: string;
    locality?: string;
    administrativeArea?: string;
    postalCode?: string;
    country?: string;
  };
  /** Provide ONE of these. */
  transientToken?: string;
  card?: {
    number: string;
    expirationMonth: string; // "MM"
    expirationYear: string; // "YYYY"
    securityCode?: string;
  };
};

export async function cybersourceCharge(
  input: CybersourceChargeInput,
): Promise<CybersourceCallResult> {
  const cfg = await getResolvedCybersourceConfig();

  // Body shape per Cybersource Payments REST. With a transient token from
  // Microform, paymentInformation.tokenizedCard.transientTokenJwt is set;
  // for sandbox testing we accept raw card data via paymentInformation.card.
  const body: any = {
    clientReferenceInformation: {
      code: input.invoiceNumber,
    },
    processingInformation: {
      capture: true,
      commerceIndicator: "internet",
    },
    orderInformation: {
      amountDetails: {
        totalAmount: input.amount,
        currency: input.currency || "USD",
      },
    },
  };

  if (input.billing || input.customerEmail) {
    body.orderInformation.billTo = {
      firstName: input.billing?.firstName ?? "Guest",
      lastName: input.billing?.lastName ?? "Customer",
      address1: input.billing?.address1 ?? "1 Main St",
      locality: input.billing?.locality ?? "Panama",
      administrativeArea: input.billing?.administrativeArea ?? "PA",
      postalCode: input.billing?.postalCode ?? "00000",
      country: input.billing?.country ?? "PA",
      email: input.customerEmail ?? "guest@example.com",
    };
  }

  if (input.transientToken) {
    body.tokenInformation = { transientTokenJwt: input.transientToken };
  } else if (input.card) {
    body.paymentInformation = {
      card: {
        number: input.card.number,
        expirationMonth: input.card.expirationMonth,
        expirationYear: input.card.expirationYear,
        securityCode: input.card.securityCode,
      },
    };
  } else {
    throw new Error("Cybersource charge requires transientToken or card");
  }

  return postSigned(cfg, "/pts/v2/payments", body);
}

export async function cybersourceRefund(input: {
  originalTransactionId: string;
  amount: string;
  currency: string;
}): Promise<CybersourceCallResult> {
  const cfg = await getResolvedCybersourceConfig();
  const body = {
    clientReferenceInformation: { code: input.originalTransactionId },
    orderInformation: {
      amountDetails: {
        totalAmount: input.amount,
        currency: input.currency || "USD",
      },
    },
  };
  return postSigned(
    cfg,
    `/pts/v2/payments/${encodeURIComponent(input.originalTransactionId)}/refunds`,
    body,
  );
}

export async function cybersourceVoid(input: {
  originalTransactionId: string;
}): Promise<CybersourceCallResult> {
  const cfg = await getResolvedCybersourceConfig();
  const body = {
    clientReferenceInformation: { code: input.originalTransactionId },
  };
  return postSigned(
    cfg,
    `/pts/v2/payments/${encodeURIComponent(input.originalTransactionId)}/voids`,
    body,
  );
}
