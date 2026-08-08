/**
 * Bank-agnostic payout export format registry.
 *
 * The Payout Verification Layer separates two responsibilities:
 *
 *  1. The state machine + canonical export payload (in `payoutBatchService`)
 *     — bank-agnostic. Records WHAT was approved, WHO approved it, and a
 *     SHA-256 of the canonical recipient/total payload.
 *
 *  2. The format adapter (this directory) — bank-specific. Renders that
 *     canonical payload into whatever file shape a given bank accepts
 *     (NACHA for ACH in the US, Banesco's bulk-payment file in Panama,
 *     a generic CSV for spreadsheet handoff, etc).
 *
 * The schema column `PayoutBatch.exportFormat` is a free-form String so
 * we can add new formats without a migration. This registry is the
 * source of truth for which strings are accepted.
 */

export const PAYOUT_EXPORT_FORMATS = [
  "BANESCO_PANAMA_PENDING_SPEC",
  "NACHA_US",
  "CSV_GENERIC",
] as const;

export type PayoutExportFormat = (typeof PAYOUT_EXPORT_FORMATS)[number];

/**
 * `READY` — adapter can render a real bank-acceptable file today.
 * `PENDING_SPEC` — bank has not yet provided their file spec; we can
 *                   record the intent on a batch but cannot render a file.
 * `PLANNED` — spec is known but the renderer has not been written yet.
 */
export type PayoutExportFormatStatus = "READY" | "PENDING_SPEC" | "PLANNED";

export type PayoutExportFormatDescriptor = {
  format: PayoutExportFormat;
  label: string;
  status: PayoutExportFormatStatus;
  /** Country / institution context so operators know which file goes where. */
  destination: string;
  /** MIME type of the rendered file when status === "READY". */
  contentType: string;
  /** File extension (no leading dot) when status === "READY". */
  fileExtension: string;
  /** Short human-readable note shown in the admin UI. */
  note: string;
};

export const PAYOUT_EXPORT_FORMAT_DESCRIPTORS: Record<
  PayoutExportFormat,
  PayoutExportFormatDescriptor
> = {
  BANESCO_PANAMA_PENDING_SPEC: {
    format: "BANESCO_PANAMA_PENDING_SPEC",
    label: "Banesco Panamá (bulk payments)",
    status: "PENDING_SPEC",
    destination: "Banesco Panamá",
    contentType: "application/octet-stream",
    fileExtension: "bin",
    note: "Awaiting Banesco's accepted bulk-payment file spec. Recordable, not yet renderable.",
  },
  NACHA_US: {
    format: "NACHA_US",
    label: "NACHA (US ACH)",
    status: "PLANNED",
    destination: "United States ACH network",
    contentType: "text/plain",
    fileExtension: "ach",
    note: "Planned. Not in use until we onboard a US clearing partner.",
  },
  CSV_GENERIC: {
    format: "CSV_GENERIC",
    label: "Generic CSV (manual handoff)",
    status: "READY",
    destination: "Any bank accepting a per-recipient spreadsheet",
    contentType: "text/csv",
    fileExtension: "csv",
    note: "One row per recipient. Use this as a fallback while bank-native adapters are pending.",
  },
};

/**
 * Legacy stored values: very early payout exports recorded the format
 * as `"NACHA"` (no country suffix). When such a value comes back in
 * from the wire (or from a stored row that the UI re-submits), we
 * normalise it forward so writes only ever land canonical strings.
 */
const LEGACY_ALIASES: Record<string, PayoutExportFormat> = {
  NACHA: "NACHA_US",
};

export function normalisePayoutExportFormat(
  candidate: string | null | undefined,
): PayoutExportFormat | null {
  if (!candidate) return null;
  const trimmed = candidate.trim();
  if (!trimmed) return null;
  const aliased = LEGACY_ALIASES[trimmed] ?? trimmed;
  return (PAYOUT_EXPORT_FORMATS as readonly string[]).includes(aliased)
    ? (aliased as PayoutExportFormat)
    : null;
}

export function assertSupportedPayoutExportFormat(
  candidate: string | null | undefined,
): PayoutExportFormat {
  const normalised = normalisePayoutExportFormat(candidate);
  if (!normalised) {
    throw new Error(
      `Unsupported payout export format: ${JSON.stringify(candidate)}. ` +
        `Supported: ${PAYOUT_EXPORT_FORMATS.join(", ")}`,
    );
  }
  return normalised;
}

export function getPayoutExportFormatDescriptor(
  format: PayoutExportFormat,
): PayoutExportFormatDescriptor {
  return PAYOUT_EXPORT_FORMAT_DESCRIPTORS[format];
}
