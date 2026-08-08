// Typed allowlist helper for beneficiary audit metadata. Every
// restricted-read audit row must use this builder so we have a single,
// review-able list of fields that may land in `AuditLog.metadata`. Extra
// keys are refused at the *type* level — TypeScript will not compile a
// call site that passes anything outside `BeneficiaryAuditMetadata`. A
// runtime allowlist re-check exists too in case JS callers slip in.

/** The exhaustive set of fields we ever record on a beneficiary audit row. */
export type BeneficiaryAuditMetadata = {
  /** The user whose record was accessed (or attempted). Use `"*"` for
   *  bulk operations (queue export, bank-file export) that aren't scoped
   *  to a single user. */
  targetUserId: string;
  /** Beneficiary document id when the audit row is about a specific doc. */
  docId?: string;
  /** Document type (PROOF_OF_ADDRESS, IDENTIFICATION, …). */
  docType?: string;
  /** Where in the UI the read happened — drawer, signed URL, queue export,
   *  bank-file export. */
  source?: "admin_drawer" | "document_url" | "queue_export" | "bank_file_export";
  /** Permission key that was missing on an access_denied row. */
  permissionMissing?: string;
  /** HTTP method on access_denied rows (GET / PATCH / POST). */
  method?: string;
  /** Route path on access_denied rows. */
  route?: string;

  // ── Bulk-export evidence (added for T-PRIV finance CSV export audit) ──
  // These keys exist *only* on queue/bank-file export rows. They record
  // **what** was exported without ever recording the values themselves.
  /** Number of beneficiary rows produced by the export. */
  rowCount?: number;
  /** The allowlisted CSV field names included in this export — proves
   *  the export did not row-dump the underlying Prisma model. */
  fields?: ReadonlyArray<string>;
  /** Bank-readiness filter applied to the export, if any. Enum value
   *  only — never a free-form string. */
  filterStatus?: string;
  /** Length of the search query used (never the query itself, which
   *  could contain a partial name / email and is sensitive). `0` and
   *  `undefined` both mean "no search". */
  queryLength?: number;
};

/** Stable action names used by the helpers below — kept in one place
 * so audit dashboards and unit tests stay in sync. */
export const BENEFICIARY_AUDIT_ACTIONS = {
  detailViewed: "admin.beneficiary.detail.viewed",
  detailAccessDenied: "admin.beneficiary.detail.access_denied",
  documentViewed: "admin.beneficiary.document.viewed",
  documentAccessDenied: "admin.beneficiary.document.access_denied",
  queueExport: "compliance.export.beneficiary_queue",
  queueExportDenied: "compliance.export.beneficiary_queue.access_denied",
  // Reserved for the future Banesco bank-file export. Declared here so
  // the audit-action registry is the single source of truth and so any
  // dashboard / detector can subscribe ahead of the implementation.
  bankFileExport: "compliance.export.beneficiary_bank_file",
  bankFileExportDenied: "compliance.export.beneficiary_bank_file.access_denied",
} as const;

export type BeneficiaryAuditAction =
  (typeof BENEFICIARY_AUDIT_ACTIONS)[keyof typeof BENEFICIARY_AUDIT_ACTIONS];

const ALLOWED_KEYS: ReadonlyArray<keyof BeneficiaryAuditMetadata> = [
  "targetUserId",
  "docId",
  "docType",
  "source",
  "permissionMissing",
  "method",
  "route",
  "rowCount",
  "fields",
  "filterStatus",
  "queryLength",
];

/**
 * Build an audit metadata blob for a beneficiary read/denial. The generic
 * is constrained so any extra key is `never`, which makes TypeScript
 * reject the call. At runtime we still strip unknown keys defensively.
 */
export function buildBeneficiaryAuditMetadata<
  T extends BeneficiaryAuditMetadata,
>(
  input: T & {
    [K in Exclude<keyof T, keyof BeneficiaryAuditMetadata>]: never;
  },
): BeneficiaryAuditMetadata {
  const out: BeneficiaryAuditMetadata = { targetUserId: input.targetUserId };
  for (const key of ALLOWED_KEYS) {
    const v = (input as Record<string, unknown>)[key];
    if (v !== undefined) {
      (out as Record<string, unknown>)[key] = v;
    }
  }
  return out;
}
