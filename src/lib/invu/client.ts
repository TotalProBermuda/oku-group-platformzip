const INVU_AUTH_URL = "https://api6.invupos.com/invuApiPos/userAuth";
const INVU_API_BASE = "https://api6.invupos.com/invuApiPos/index.php";
const INVU_READ_TIMEOUT_MS = 15_000;

/**
 * INVU read endpoints occasionally keep a connection open without returning
 * a body. Bound closeouts must fail safely rather than leaving a host request
 * (and its commission workflow) pending forever.
 */
async function fetchInvuRead(url: string, token: string): Promise<Response> {
  return fetch(url, {
    method: "GET",
    headers: { accept: "application/json", authorization: token },
    signal: AbortSignal.timeout(INVU_READ_TIMEOUT_MS),
  });
}

// Unwrap INVU's `{ data: [...], error: null }` envelope. Some endpoints return a
// bare array; tolerate both shapes.
function unwrapInvuList(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
  if (parsed && typeof parsed === "object") {
    const o = parsed as Record<string, unknown>;
    for (const k of ["data", "records", "rows", "ordenes", "totales", "result"]) {
      const v = o[k];
      if (Array.isArray(v)) return v as Record<string, unknown>[];
    }
  }
  return [];
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * INVU returns several provider-side failures as HTTP 200 JSON bodies, for
 * example `{ status: 403, error: "..." }`. Treating those as an empty list
 * makes an expired/under-scoped token look like a missing sale.
 *
 * Do not include the provider's error text: it may contain operational or
 * account details which must not reach application logs or the browser.
 */
function throwIfProviderError(parsed: unknown, method: string): void {
  const body = asObject(parsed);
  if (!body) return;

  const status = body.status;
  const hasError = typeof body.error === "string" && body.error.trim().length > 0;
  if (status === 401 || status === 403 || hasError) {
    const suffix = status === 401 || status === 403 ? ` (${status})` : "";
    throw new Error(`INVU ${method} authorization or provider error${suffix}`);
  }
}

function toEpochSeconds(d: Date): number {
  return Math.floor(d.getTime() / 1000);
}

async function callInvuList(
  token: string,
  url: string,
  method: string
): Promise<Record<string, unknown>[]> {
  const res = await fetchInvuRead(url, token);
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    // Provider errors can contain credentials, tokens, order details, or raw
    // customer data. Retain only the operation and HTTP status in any error.
    throw new Error(`INVU ${method} failed (${res.status})`);
  }
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* keep as text */ }
  throwIfProviderError(parsed, method);
  return unwrapInvuList(parsed);
}

export interface InvuAuthResult {
  token: string;
}

export type InvuInvoiceTotalsProbe = {
  /** True only when INVU accepted the endpoint and returned a parseable response. */
  accepted: boolean;
  /** Transport status only; no provider response body is returned. */
  httpStatus: number;
  /** INVU sometimes reports authorization failures in a JSON HTTP-200 envelope. */
  providerStatus: number | null;
  recordCount: number;
  matchedBoundOrder: boolean;
};

// --- INVU satellite endpoints (invoices, payments, credit notes, order totals) ---
//
// The real INVU closed-orders endpoint (`citas/ordenesAllAdv`, wired in getClosedOrders
// below) already returns `total`, `subtotal`, `impuesto`, `propinas`, and status on each
// order. That is sufficient for OKÜ's commission/trust pipeline — the aggregation service
// (src/server/services/invu/invuAggregationService.ts) transparently falls back to the
// order-level fields when no satellite records are present.
//
// INVU documents the invoice-totals endpoint, which we use as an independent closed-order
// fallback. Payment breakdowns, credit notes, and order totals would also support
// post-hoc void and split-payment reconciliation, but their URLs are not confirmed; those
// functions remain no-ops and log once at INFO level in development.

let _loggedSatelliteNoOp = false;
function logSatelliteNoOpOnce(): void {
  if (_loggedSatelliteNoOp) return;
  _loggedSatelliteNoOp = true;
  console.info(
    "[INVU] Satellite endpoints (payments, creditNotes, orderTotals) are intentionally no-ops; " +
      "commissionable revenue is derived from order-level fields on citas/ordenesAllAdv."
  );
}

export async function authenticate(
  username: string,
  password: string
): Promise<InvuAuthResult> {
  const res = await fetch(INVU_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, grant_type: "authorization" }),
  });

  if (!res.ok) {
    // Vendor error payloads may echo credentials or access tokens. Keep the
    // useful HTTP status but never attach the body to an Error that can reach
    // application logs, error reporting, or a test script's output.
    await res.text().catch(() => "");
    throw new Error(`INVU auth failed (${res.status})`);
  }

  const data = await res.json();
  const token =
    data?.token ??
    data?.access_token ??
    data?.authorization ??
    data?.data?.token ??
    data?.data?.authorization;
  if (!token) {
    // A successful response can still contain token-shaped fields under an
    // unexpected name. Do not serialize it into a thrown error.
    throw new Error("INVU auth succeeded but no usable token was returned");
  }
  return { token };
}

// Real INVU closed-orders endpoint. INVU groups results by Punto de Venta on
// the auth account, so `branchId` is informational only — the API returns rows
// for whatever branch the credential is scoped to.
export async function getClosedOrders(
  token: string,
  _branchId: string,
  fromDate: Date,
  toDate: Date
): Promise<Record<string, unknown>[]> {
  const fini = toEpochSeconds(fromDate);
  const ffin = toEpochSeconds(toDate);
  const url = `${INVU_API_BASE}?r=citas/ordenesAllAdv/fini/${fini}/ffin/${ffin}/tipo/1/grouping/1`;
  return callInvuList(token, url, "getClosedOrders");
}

/**
 * Fetch one order by its INVU `num_cita`, which is the identifier stored when
 * a host binds an open check. This is the deterministic closeout path; unlike
 * a date-range list it cannot miss a ticket because of a reporting delay or
 * grouping filter.
 */
export async function getInvoiceByNumCita(
  token: string,
  numCita: string
): Promise<Record<string, unknown> | null> {
  const encodedId = encodeURIComponent(numCita);
  const url = `${INVU_API_BASE}?r=citas/view/id/${encodedId}/tipo/0`;
  const res = await fetchInvuRead(url, token);
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`INVU getInvoiceByNumCita failed (${res.status})`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("INVU getInvoiceByNumCita returned a non-JSON response");
  }
  throwIfProviderError(parsed, "getInvoiceByNumCita");

  const invoice = asObject(parsed);
  if (!invoice || invoice.encontro === false) return null;
  return invoice;
}

// INVU's documented totals-per-invoice endpoint. It is deliberately separate
// from `getClosedOrders`: the former returns one financial-total row per
// invoice and is a useful read-only fallback when an exact invoice-detail
// lookup is temporarily unavailable.
export async function getInvoiceTotals(
  token: string,
  _branchId: string,
  fromDate: Date,
  toDate: Date
): Promise<Record<string, unknown>[]> {
  const fini = toEpochSeconds(fromDate);
  const ffin = toEpochSeconds(toDate);
  const url = `${INVU_API_BASE}?r=citas/OrdenesAllTotales/fini/${fini}/ffin/${ffin}/tipo/1`;
  return callInvuList(token, url, "getInvoiceTotals");
}

/**
 * Read-only, redacted capability check for the documented invoice-totals
 * endpoint. This intentionally exposes neither the token, financial rows,
 * customer data, nor INVU's raw error string.
 */
export async function probeInvoiceTotals(
  token: string,
  boundOrderId: string,
  fromDate: Date,
  toDate: Date
): Promise<InvuInvoiceTotalsProbe> {
  const fini = toEpochSeconds(fromDate);
  const ffin = toEpochSeconds(toDate);
  const url = `${INVU_API_BASE}?r=citas/OrdenesAllTotales/fini/${fini}/ffin/${ffin}/tipo/1`;
  let res: Response;
  try {
    res = await fetchInvuRead(url, token);
  } catch {
    // The diagnostic intentionally returns only its fixed, redacted shape.
    // A timeout or transport failure therefore appears as rejected with no
    // invented provider status or raw provider payload.
    return {
      accepted: false,
      httpStatus: 0,
      providerStatus: null,
      recordCount: 0,
      matchedBoundOrder: false,
    };
  }
  const text = await res.text().catch(() => "");
  let parsed: unknown = null;
  try { parsed = JSON.parse(text); } catch { /* non-JSON response remains rejected */ }

  const body = asObject(parsed);
  const providerStatus = typeof body?.status === "number" ? body.status : null;
  const providerRejected = providerStatus === 401 || providerStatus === 403 ||
    (typeof body?.error === "string" && body.error.trim().length > 0);
  const records = !providerRejected && res.ok ? unwrapInvuList(parsed) : [];

  return {
    accepted: res.ok && !providerRejected,
    httpStatus: res.status,
    providerStatus,
    recordCount: records.length,
    matchedBoundOrder: records.some((record) => recordReferencesBoundOrder(record, boundOrderId)),
  };
}

function recordReferencesBoundOrder(record: Record<string, unknown>, boundOrderId: string): boolean {
  const nested = [record, asObject(record.orden), asObject(record.orden_datos), asObject(record.order)]
    .filter((value): value is Record<string, unknown> => value !== null);
  const keys = ["num_cita", "numero_orden", "numeroOrden", "order_number", "id_cita", "id_orden", "order_id", "id"];
  return nested.some((candidate) => keys.some((key) => String(candidate[key] ?? "").trim() === boundOrderId));
}

// Satellite endpoint: payment breakdowns. Intentional no-op — see top-of-file comment.
export async function getPayments(
  _token: string,
  _branchId: string,
  _fromDate: Date,
  _toDate: Date
): Promise<any[]> {
  logSatelliteNoOpOnce();
  return [];
}

// Satellite endpoint: credit notes (post-hoc voids / refunds). Intentional no-op.
export async function getCreditNotes(
  _token: string,
  _branchId: string,
  _fromDate: Date,
  _toDate: Date
): Promise<any[]> {
  logSatelliteNoOpOnce();
  return [];
}

// Satellite endpoint: order-totals reconciliation view. Intentional no-op.
export async function getOrderTotals(
  _token: string,
  _branchId: string,
  _fromDate: Date,
  _toDate: Date
): Promise<any[]> {
  logSatelliteNoOpOnce();
  return [];
}

// citas/add — REMOVED Apr 28 2026.
//
// Previously this exported `writeReference(token, body)` which POSTed to
// `?r=citas/add` to inject an OKÜ booking_code into an open INVU order.
// The INVU vendor (Madelaine, ticket Apr 28 2026) confirmed definitively
// that the API does NOT support writing external data into open orders;
// that capability is reserved for their private OpenTable / Cover Manager
// integration tier. The function and its caller (invuReferenceWriter)
// were retired in commit 8980a22d to keep the bundle and trust surface
// lean. If a partner/webhook arrangement ever materialises, restore from
// git history (search the SHA above for the original implementation).

export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(INVU_AUTH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: token,
      },
      body: JSON.stringify({ grant_type: "revoke" }),
    });
  } catch (err) {
    console.warn("[INVU] revokeToken failed (non-fatal):", err);
  }
}
