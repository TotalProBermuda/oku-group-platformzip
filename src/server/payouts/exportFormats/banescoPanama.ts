import type { ExportPayload } from "../payoutBatchService";
import type { RenderedPayoutFile } from "./index";

/**
 * Banesco Panamá bulk-payment file renderer — INTENTIONALLY UNIMPLEMENTED.
 *
 * Banesco has not yet confirmed which file format their bulk-payment
 * intake accepts (they support several: positional fixed-width, a
 * proprietary CSV variant, and a Multibank-style XML, depending on the
 * product the corporate account is enrolled in).
 *
 * This adapter exists so the registry seam is in place. The state
 * machine can already RECORD a batch as exported with this format —
 * marking the operator's intent — but rendering an actual file must
 * wait until Banesco confirms the spec.
 *
 * To wire this up later:
 *   1. Replace the throw below with the spec-compliant builder.
 *   2. Update the descriptor's `status` to `READY` in
 *      `./types.ts → PAYOUT_EXPORT_FORMAT_DESCRIPTORS`.
 *   3. Set the correct `contentType` and `fileExtension` on the
 *      descriptor.
 *   4. The smoke test will then exercise this format end-to-end without
 *      further changes.
 */
export function renderBanescoPanama(_payload: ExportPayload): RenderedPayoutFile {
  throw new Error(
    "Banesco Panamá bulk-payment file format is not yet implemented — " +
      "awaiting confirmation of the accepted file spec from the bank.",
  );
}
