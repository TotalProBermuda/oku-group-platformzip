import type { ExportPayload } from "../payoutBatchService";
import type { RenderedPayoutFile } from "./index";

/**
 * NACHA (US ACH) file renderer — INTENTIONALLY UNIMPLEMENTED.
 *
 * NACHA is a candidate format for a future US clearing partner. We
 * keep it in the registry so the seam is in place, but rendering is
 * deliberately a stub: we do not currently bank in the US and have
 * no ODFI relationship to dictate file conventions (immediate origin,
 * ODFI routing, batch numbering, etc).
 *
 * To wire this up later:
 *   1. Replace the throw below with a NACHA file-set builder
 *      (File Header → Batch Header → Entry Detail → Batch Control →
 *      File Control), driven by the canonical ExportPayload.
 *   2. Add the ODFI-specific config (immediate origin, immediate
 *      destination, company ID) somewhere bank-credentials-shaped —
 *      DO NOT inline it into the renderer.
 *   3. Promote the descriptor `status` in `./types.ts` from `PLANNED`
 *      to `READY`.
 */
export function renderNachaUs(_payload: ExportPayload): RenderedPayoutFile {
  throw new Error(
    "NACHA US ACH file format is not yet implemented — no US clearing " +
      "partner is onboarded and ODFI conventions are unknown.",
  );
}
