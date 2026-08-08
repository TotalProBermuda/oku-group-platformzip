/**
 * Cybersource authorize-then-capture helpers (Payments P215).
 *
 * Distinct from `transactions.ts` which does immediate auth+capture.
 * These functions implement the two-step flow:
 *   1. `cybersourceAuthorize`  — POST /pts/v2/payments  (capture: false)
 *   2. `cybersourceCapture`    — POST /pts/v2/payments/{id}/captures
 *   3. `cybersourceAuthorizeCapture` — convenience wrapper for one-shot auth+capture
 *      (delegates to the existing `cybersourceCharge` in transactions.ts)
 *
 * Never logs raw credential values.
 */
import {
  buildCybersourceHttpSignatureHeaders,
  cybersourceHost,
} from "@/server/payments/cybersourceSignature";
import {
  getResolvedCybersourceConfig,
  type ResolvedCybersourceConfig,
} from "@/server/cybersource/client";
import type { CybersourceCallResult } from "@/server/cybersource/transactions";

export type CybersourceAuthorizeInput = {
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
  /**
   * Transient JWT from Cybersource Flex / Unified Checkout.
   * This is the only accepted payment credential for the guest-facing
   * deposit flow — raw card numbers must never transit the OKÜ server.
   */
  transientToken: string;
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

/**
 * Authorize-only (no immediate capture). The transaction enters AUTHORIZED
 * state and must be captured separately via `cybersourceCapture`.
 *
 * Cybersource will VOID uncaptured authorizations automatically after 7 days
 * (sandbox) / 7–30 days (production, depending on merchant settings).
 */
export async function cybersourceAuthorize(
  input: CybersourceAuthorizeInput,
): Promise<CybersourceCallResult> {
  const cfg = await getResolvedCybersourceConfig();

  const body: any = {
    clientReferenceInformation: {
      code: input.invoiceNumber,
    },
    processingInformation: {
      capture: false, // ← authorize-only
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

  // Transient token is now the only accepted payment credential.
  // Raw card data must never transit the OKÜ server.
  body.tokenInformation = { transientTokenJwt: input.transientToken };

  return postSigned(cfg, "/pts/v2/payments", body);
}

/**
 * Capture a previously authorized transaction.
 * POST /pts/v2/payments/{authTransactionId}/captures
 */
export async function cybersourceCapture(input: {
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
    `/pts/v2/payments/${encodeURIComponent(input.originalTransactionId)}/captures`,
    body,
  );
}
