import type { ExportPayload } from "../payoutBatchService";
import type { RenderedPayoutFile } from "./index";

/**
 * Minimal RFC-4180 CSV escaping: wrap any field containing comma,
 * quote, CR, or LF in double quotes; escape inner quotes by doubling.
 */
function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Generic per-recipient CSV. Bank-agnostic: every recipient becomes one
 * row with their net amount. Accountants and ops can hand this to any
 * bank's web portal that accepts a manual upload.
 *
 * Determinism: rows preserve the canonical sort order from the
 * `ExportPayload` (lexicographic by influencerId), so re-running the
 * renderer over the same payload yields a byte-identical file.
 */
export function renderCsvGeneric(payload: ExportPayload): RenderedPayoutFile {
  const header = [
    "batch_id",
    "currency",
    "influencer_id",
    "recipient_name",
    "recipient_handle",
    "net_amount_cents",
    "net_amount",
    "ledger_line_count",
    "ledger_entry_ids",
  ].join(",");

  const rows = payload.recipients.map(r => {
    const netAmount = (r.netCents / 100).toFixed(2);
    return [
      csvEscape(payload.batchId),
      csvEscape(payload.currency),
      csvEscape(r.influencerId),
      csvEscape(r.influencerDisplayName),
      csvEscape(r.influencerHandle ?? ""),
      csvEscape(r.netCents),
      csvEscape(netAmount),
      csvEscape(r.lineCount),
      // Pipe-joined to keep the CSV one-row-per-recipient while still
      // exposing the trace IDs auditors need.
      csvEscape(r.ledgerEntryIds.join("|")),
    ].join(",");
  });

  // CRLF line endings — friendlier to Excel and to bank portals that
  // were written against the RFC-4180 default.
  const content = [header, ...rows].join("\r\n") + "\r\n";

  const safeBatch = payload.batchId.replace(/[^A-Za-z0-9_-]/g, "_");
  return {
    content,
    contentType: "text/csv",
    filename: `payout-${safeBatch}.csv`,
  };
}
