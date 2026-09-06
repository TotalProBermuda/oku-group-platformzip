import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { type Prisma, InvuPayloadType, InvuOrderStatusCanonical } from "@prisma/client";

// All INVU Spanish-leaning field names stay inside this service —
// they must never leak into core OKÜ business logic outside adapter services.

export function computeChecksum(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function pickFirst(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * `citas/view` returns a detail envelope (`orden_datos`, `pagos`, `status`)
 * while `ordenesAllAdv` returns a flat row. Normalize both forms into the
 * existing closed-order shape so aggregation and commission minting retain a
 * single, audited path.
 */
function flattenInvoiceDetail(payload: Record<string, unknown>): Record<string, unknown> {
  const header = asObject(payload.orden_datos);
  if (!header) return payload;

  const status = asObject(payload.status);
  const payments = Array.isArray(payload.pagos) ? payload.pagos : payload.payments;
  const tips = Array.isArray(payload.propinas) ? payload.propinas : payload.tips;

  return {
    ...header,
    // The caller supplies `id` as the already-bound num_cita for deterministic
    // matching; preserve the provider's own id in the raw record as well.
    id: payload.id ?? header.id,
    num_cita: payload.num_cita ?? header.num_cita,
    mesa: payload.mesa ?? header.mesa,
    total: payload.total ?? header.total ?? header.total_final ?? header.importe,
    subtotal: payload.subtotal ?? header.subtotal,
    impuesto: payload.impuesto ?? header.impuesto ?? header.tax,
    descuento: payload.descuento ?? header.descuento,
    pagos: payments,
    payments,
    propinas: tips,
    status: status?.descripcion ?? header.status ?? header.estado,
    estado: status?.descripcion ?? header.estado,
    status_id: status?.id ?? header.status_id,
  };
}

/**
 * INVU sometimes returns fields like `mesa` and `cliente` as objects
 * (e.g. `{ id: 12, nombre: "T-9" }`) and sometimes as bare strings.
 * This helper safely coerces either shape to a display string, or null.
 */
function extractString(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "string") return val.trim() || null;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    const candidate =
      obj.nombre ?? obj.name ?? obj.label ?? obj.descripcion ?? obj.id;
    if (candidate === null || candidate === undefined) return null;
    const s = String(candidate).trim();
    return s || null;
  }
  const s = String(val).trim();
  return s || null;
}

function toIntCents(val: unknown): number {
  if (val === null || val === undefined) return 0;
  const n = parseFloat(String(val));
  if (isNaN(n)) return 0;
  return Math.round(n * 100);
}

function parseDate(val: unknown): Date | null {
  if (!val) return null;
  const numeric = typeof val === "number" ? val : Number(String(val));
  // INVU detail responses use Epoch timestamps. Accept seconds and
  // milliseconds as well as the ISO values returned by list endpoints.
  if (Number.isFinite(numeric) && numeric > 0) {
    const ms = numeric < 100_000_000_000 ? numeric * 1000 : numeric;
    const epochDate = new Date(ms);
    if (!isNaN(epochDate.getTime())) return epochDate;
  }
  const d = new Date(String(val));
  return isNaN(d.getTime()) ? null : d;
}

function normalizeStatus(raw: string | null | undefined): InvuOrderStatusCanonical {
  if (!raw) return InvuOrderStatusCanonical.UNKNOWN;
  const s = raw.toLowerCase();
  if (s === "closed" || s === "cerrado" || s === "cerrada" || s === "finalizado" || s === "si") return InvuOrderStatusCanonical.CLOSED;
  if (s === "open" || s === "abierto") return InvuOrderStatusCanonical.OPEN;
  if (s === "voided" || s === "anulado" || s === "void") return InvuOrderStatusCanonical.VOIDED;
  if (s === "credited" || s === "acreditado") return InvuOrderStatusCanonical.CREDITED;
  if (s === "partially_credited" || s === "parcialmente_acreditado") return InvuOrderStatusCanonical.PARTIALLY_CREDITED;
  return InvuOrderStatusCanonical.UNKNOWN;
}

function aggregateCents(arr: unknown[], ...fields: string[]): number {
  if (!Array.isArray(arr)) return 0;
  return arr.reduce((sum: number, item: unknown): number => {
    const obj = item as Record<string, unknown>;
    for (const f of fields) {
      const v = toIntCents(obj[f]);
      if (v) return sum + v;
    }
    return sum;
  }, 0);
}

export function normalizePayload(
  payload: Record<string, unknown>,
  payloadType: InvuPayloadType
): Record<string, unknown> {
  payload = flattenInvoiceDetail(payload);
  const publicOrderNumber = extractString(
    pickFirst(payload, ["num_cita", "num_factura", "folio", "order_number"])
  );

  const tableLabel = extractString(
    pickFirst(payload, ["mesa", "table", "table_label", "table_name"])
  );

  const tableIdRaw = extractString(
    pickFirst(payload, ["table_id", "mesa_id", "id_mesa"])
  );

  const customerName = extractString(
    pickFirst(payload, ["nombre_cliente", "client_name", "customer", "customer_name", "nombre", "cliente"])
  );

  const guestCountRaw = pickFirst(payload, ["personas", "covers", "guests", "guest_count", "pax", "comensales"]);
  const guestCount = guestCountRaw !== undefined && guestCountRaw !== null
    ? parseInt(String(guestCountRaw), 10) || null
    : null;

  const openedAt = parseDate(pickFirst(payload, ["fecha_apertura_date", "fecha_apertura", "open_at", "created_at", "openedAt", "fecha_creacion"]));
  const closedAt = parseDate(pickFirst(payload, ["fecha_cierre_date", "fecha_cierre", "closed_at", "end_at", "closedAt", "fecha_fin"]));

  const statusId = pickFirst(payload, ["status_id", "estado_id"]);
  const statusRaw = String(
    pickFirst(payload, ["status", "estado", "estado_orden", "pagada"])
      ?? (String(statusId) === "1" ? "cerrada" : "")
  ) || null;
  const statusCanonical = normalizeStatus(statusRaw);

  // INVU's `total` includes tax; `subtotal` is pre-tax. Use `total` as gross when present
  // so the trust-layer commissionable computation reflects what the guest actually paid.
  const paymentLines = (payload["pagos"] ?? payload["payments"] ?? []) as unknown[];
  const paymentGrossCents = Array.isArray(paymentLines)
    ? aggregateCents(paymentLines, "amount", "monto", "importe", "valor", "total")
    : 0;
  const grossCents = toIntCents(pickFirst(payload, ["total", "subtotal", "gross_total", "importe"])) || paymentGrossCents;

  const discountLines = (payload["discounts"] ?? payload["descuentos"]) as unknown[];
  const discountCents = Array.isArray(discountLines)
    ? aggregateCents(discountLines, "amount", "monto", "importe", "discount_amount")
    : toIntCents(pickFirst(payload, ["discount_total", "total_descuento", "descuento"]));

  const taxCents = toIntCents(pickFirst(payload, ["impuesto", "tax", "iva", "tax_amount", "total_impuesto"]));

  const tipLines = (payload["payments"] ?? payload["pagos"] ?? []) as unknown[];
  const tipFromPayments = Array.isArray(tipLines)
    ? aggregateCents(tipLines, "tip", "propina", "gratuity")
    : 0;
  const tipCents = tipFromPayments || toIntCents(pickFirst(payload, ["propina", "propinas", "tip", "gratuity", "total_propina"]));

  const creditLines = (payload["credit_notes"] ?? payload["notas_credito"] ?? payload["credits"]) as unknown[];
  const refundCents = Array.isArray(creditLines)
    ? aggregateCents(creditLines, "amount", "monto", "importe")
    : toIntCents(pickFirst(payload, ["credit_total", "total_credito", "refund_total"]));

  const netRevenueCents = toIntCents(
    pickFirst(payload, ["total_neto", "net_total", "net_amount", "total_net"])
  ) || Math.max(0, grossCents - discountCents - refundCents);

  const invuOrderId = String(pickFirst(payload, ["id", "order_id", "id_orden", "folio_id"]) ?? "") || null;

  return {
    invuOrderId,
    publicOrderNumber,
    tableLabel,
    tableIdRaw,
    customerName,
    guestCount,
    openedAt,
    closedAt,
    statusRaw,
    statusCanonical,
    grossCents,
    discountCents,
    taxCents,
    tipCents,
    refundCents,
    netRevenueCents,
    currency: String(payload["currency"] ?? payload["moneda"] ?? "USD"),
  };
}

export async function storeRawAndNormalize(params: {
  syncRunId: string;
  venueId: string;
  branchMappingId: string;
  payloadType: InvuPayloadType;
  payload: Record<string, unknown>;
}): Promise<{ rawId: string; normalizedId: string; skipped: boolean }> {
  const { syncRunId, venueId, branchMappingId, payloadType, payload } = params;
  const checksum = computeChecksum(payload);
  const invuOrderId = String(payload["id"] ?? payload["order_id"] ?? payload["id_orden"] ?? "") || null;

  // Dedup guard — skip if an identical raw record (same invuOrderId + venueId + payloadType + checksum) already exists.
  // Including checksum in the DB filter avoids false-positive dedup when multiple historical raws exist with different payloads.
  if (invuOrderId) {
    const existing = await prisma.invuOrderRaw.findFirst({
      where: { invuOrderId, venueId, payloadType, payloadChecksum: checksum },
      select: { id: true },
    });
    if (existing) {
      return { rawId: existing.id, normalizedId: "", skipped: true };
    }
  }

  const raw = await prisma.invuOrderRaw.create({
    data: {
      syncRunId,
      venueId,
      branchMappingId,
      externalOrderRef: invuOrderId,
      invuOrderId,
      payloadType,
      payloadJson: payload as Prisma.InputJsonValue,
      payloadChecksum: checksum,
      pulledAt: new Date(),
    },
  });

  const normalized = normalizePayload(payload, payloadType);

  const norm = await prisma.invuOrderNormalized.create({
    data: {
      syncRunId,
      rawRecordId: raw.id,
      venueId,
      branchMappingId,
      payloadType,
      invuOrderId: normalized.invuOrderId as string | null,
      publicOrderNumber: normalized.publicOrderNumber as string | null,
      tableLabel: normalized.tableLabel as string | null,
      tableIdRaw: normalized.tableIdRaw as string | null,
      customerName: normalized.customerName as string | null,
      guestCount: normalized.guestCount as number | null,
      openedAt: normalized.openedAt as Date | null,
      closedAt: normalized.closedAt as Date | null,
      statusRaw: normalized.statusRaw as string | null,
      statusCanonical: normalized.statusCanonical as InvuOrderStatusCanonical,
      grossCents: normalized.grossCents as number,
      discountCents: normalized.discountCents as number,
      taxCents: normalized.taxCents as number,
      tipCents: normalized.tipCents as number,
      refundCents: normalized.refundCents as number,
      netRevenueCents: normalized.netRevenueCents as number,
      currency: normalized.currency as string,
      normalizedJson: normalized as Prisma.InputJsonValue,
    },
  });

  return { rawId: raw.id, normalizedId: norm.id, skipped: false };
}
