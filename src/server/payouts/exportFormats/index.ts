import type { ExportPayload } from "../payoutBatchService";
import {
  type PayoutExportFormat,
  getPayoutExportFormatDescriptor,
} from "./types";
import { renderCsvGeneric } from "./csvGeneric";
import { renderBanescoPanama } from "./banescoPanama";
import { renderNachaUs } from "./nachaUs";

export {
  PAYOUT_EXPORT_FORMATS,
  PAYOUT_EXPORT_FORMAT_DESCRIPTORS,
  assertSupportedPayoutExportFormat,
  normalisePayoutExportFormat,
  getPayoutExportFormatDescriptor,
} from "./types";
export type {
  PayoutExportFormat,
  PayoutExportFormatStatus,
  PayoutExportFormatDescriptor,
} from "./types";

export type RenderedPayoutFile = {
  /** UTF-8 string body of the file (binary formats can hex-encode if needed). */
  content: string;
  /** MIME type for HTTP download responses. */
  contentType: string;
  /** Suggested filename, including extension. */
  filename: string;
};

/**
 * Renders the canonical bank-agnostic export payload into a specific
 * bank-acceptable file via the format's adapter. Throws if the format
 * has no working renderer yet (status !== "READY"); use
 * `getPayoutExportFormatDescriptor(format).status` to check up front.
 *
 * Note: this function is a pure read — it does NOT mutate the
 * PayoutBatch. The state transition to EXPORTED happens separately
 * via `payoutBatchService.markExported`. That separation is deliberate:
 * marking a batch as exported is a workflow decision (we have committed
 * to paying these recipients with this format); rendering the file is
 * a presentation decision that may happen multiple times — e.g. a
 * download, a re-download, a re-format for a backup channel — without
 * altering the audited record.
 */
export function renderPayoutFile(
  format: PayoutExportFormat,
  payload: ExportPayload,
): RenderedPayoutFile {
  switch (format) {
    case "CSV_GENERIC":
      return renderCsvGeneric(payload);
    case "BANESCO_PANAMA_PENDING_SPEC":
      return renderBanescoPanama(payload);
    case "NACHA_US":
      return renderNachaUs(payload);
    default: {
      // Exhaustiveness guard — if a new format is added to the union,
      // TypeScript will fail this assignment at compile time.
      const _exhaustive: never = format;
      throw new Error(
        `No renderer wired up for payout export format: ${String(_exhaustive)}`,
      );
    }
  }
}

/**
 * Convenience: returns whether a format can render a file today (vs.
 * being recordable-but-not-renderable).
 */
export function isPayoutExportFormatRenderable(format: PayoutExportFormat): boolean {
  return getPayoutExportFormatDescriptor(format).status === "READY";
}
