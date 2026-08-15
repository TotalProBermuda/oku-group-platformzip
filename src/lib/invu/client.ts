const INVU_AUTH_URL = "https://api6.invupos.com/invuApiPos/userAuth";
const INVU_API_BASE = "https://api6.invupos.com/invuApiPos/index.php";

// Unwrap INVU's `{ data: [...], error: null }` envelope. Some endpoints return a
// bare array; tolerate both shapes.
function unwrapInvuList(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
  if (parsed && typeof parsed === "object") {
    const o = parsed as Record<string, unknown>;
    for (const k of ["data", "records", "rows", "ordenes", "result"]) {
      const v = o[k];
      if (Array.isArray(v)) return v as Record<string, unknown>[];
    }
  }
  return [];
}

function toEpochSeconds(d: Date): number {
  return Math.floor(d.getTime() / 1000);
}

async function callInvuList(
  token: string,
  url: string,
  method: string
): Promise<Record<string, unknown>[]> {
  const res = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json", authorization: token },
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    // Provider errors can contain credentials, tokens, order details, or raw
    // customer data. Retain only the operation and HTTP status in any error.
    throw new Error(`INVU ${method} failed (${res.status})`);
  }
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* keep as text */ }
  return unwrapInvuList(parsed);
}

export interface InvuAuthResult {
  token: string;
}

// --- INVU satellite endpoints (invoices, payments, credit notes, order totals) ---
//
// The real INVU closed-orders endpoint (`citas/ordenesAllAdv`, wired in getClosedOrders
// below) already returns `total`, `subtotal`, `impuesto`, `propinas`, and status on each
// order. That is sufficient for OKÜ's commission/trust pipeline — the aggregation service
// (src/server/services/invu/invuAggregationService.ts) transparently falls back to the
// order-level fields when no satellite records are present.
//
// The vendor has four additional endpoints (invoice totals, payment breakdowns, credit
// notes, order totals) that would let the trust layer reconcile post-hoc voids and split
// payments. Their URLs are not yet published. Until then, these functions are intentional
// no-ops that return `[]`. They log once at INFO level so the behaviour is visible in
// dev without spamming production error streams.
//
// When the vendor confirms the URLs, replace the body of each function with a real
// `callInvuList(...)` call and remove the info log.

let _loggedSatelliteNoOp = false;
function logSatelliteNoOpOnce(): void {
  if (_loggedSatelliteNoOp) return;
  _loggedSatelliteNoOp = true;
  console.info(
    "[INVU] Satellite endpoints (invoiceTotals, payments, creditNotes, orderTotals) are intentionally no-ops; " +
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

// Satellite endpoint: invoice totals. See top-of-file comment — intentional no-op until the
// vendor URL is confirmed. Order-level totals from getClosedOrders are authoritative today.
export async function getInvoiceTotals(
  _token: string,
  _branchId: string,
  _fromDate: Date,
  _toDate: Date
): Promise<any[]> {
  logSatelliteNoOpOnce();
  return [];
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
