import crypto from "crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Retention policy constants & allow/deny lists for the daily sweeper.
//
// Source of truth for retention windows: `docs/privacy/data-classification.md`.
// Source of truth for the financial / audit-record exemption: `task-100.md`
// — those tables MUST NOT be touched by this worker because they are
// governed by the 7-year financial/audit retention window, not the
// privacy storage-limitation rule.
//
// The worker is opt-out via env, idempotent, and rate-limited per run.
// ─────────────────────────────────────────────────────────────────────────────

export const TOMBSTONE_EMAIL_DOMAIN = "tombstone.oku.invalid";

/** Default per-table batch cap for a single sweep run (rate-limit). */
export const DEFAULT_MAX_PER_RUN = 500;

// ─── Window semantics ─────────────────────────────────────────────────────
// Policy interpretation: month-based windows are encoded as fixed
// 30-day blocks (NOT calendar months). This keeps the worker pure
// (no per-row calendar arithmetic) and simplifies idempotency
// reasoning — a row that was out-of-scope yesterday can only become
// in-scope by becoming OLDER, never younger. The trade-off vs strict
// calendar months is at most a few days of additional retention,
// which is comfortably inside the storage-limitation principle's
// "no longer than necessary" envelope. If finance/legal ever want
// strict calendar-month semantics we can swap these for `date-fns`
// `subMonths(now, N)` per call without changing the rest of the
// worker. Source of truth: docs/privacy/data-classification.md.

/** 24 months (= 24 × 30d) — User account-life retention after closure. */
export const USER_ANONYMISE_AFTER_MS = 24 * 30 * 24 * 60 * 60 * 1000;

/** 90 days — purge BeneficiaryDocument files after profile reaches BANK_READY. */
export const BENEFICIARY_DOC_PURGE_AFTER_MS = 90 * 24 * 60 * 60 * 1000;

/** 12 months (= 12 × 30d) — anonymise JobApplication after final hiring decision. */
export const JOB_APPLICATION_ANONYMISE_AFTER_MS = 12 * 30 * 24 * 60 * 60 * 1000;

/** 24 months (= 24 × 30d) — move AuditLog rows to encrypted cold storage (never delete inside 7y). */
export const AUDIT_LOG_COLD_STORAGE_AFTER_MS = 24 * 30 * 24 * 60 * 60 * 1000;

/**
 * Tables this worker is allowed to mutate. Anything not in this list is a
 * deliberate no-touch — the per-task code paths must not call into other
 * tables under any sweep step.
 */
export const RETENTION_ALLOW_LIST = [
  "User",                // anonymise PII fields only — financial rows untouched
  "BeneficiaryDocument", // purge file bytes + soft-delete row metadata
  "JobApplication",      // anonymise PII fields after final decision
  "AuditLog",            // cold-storage move (never outright delete inside 7y)
] as const;

/**
 * Tables this worker MUST NEVER touch. Encoded here as a runtime guard so a
 * future regression cannot accidentally widen the worker's blast radius —
 * see retentionPolicies.test for the assertion.
 *
 * These are the financial / audit-record tables that must follow the 7-year
 * accounting/audit retention window. Honouring storage-limitation on the
 * personal data they reference is done by anonymising the linked `User`
 * row (which leaves the financial rows intact pointing at a tombstone id).
 */
export const RETENTION_DENY_LIST = [
  // Order & payment ledger — 7-year accounting window.
  "Order",
  "OrderLineItem",
  "OrderEvent",
  "OrderNote",
  "Payment",
  "PaymentGatewayCredential",
  "PayoutBatch",
  "SponsorPayment",
  // Commission & ledger families — finance-of-record.
  "LedgerEntry",
  "CommissionEntry",
  "CommissionSuggestion",
  "CommissionAllocation",
  "InfluencerSubCommissionLedger",
  "ReferralBenefit",
  // Attribution / referral decision tables — feed the ledger.
  "Attribution",
  "AttributionEvent",
  "AttributionSession",
  "ReservationAttribution",
  "ReferralAssignment",
  "ReferralActor",
  "ReferralActorTypeDef",
  "ReferralLink",
  // POS raw / normalised — source-of-truth for INVU reconciliation.
  "InvuOrderRaw",
  "InvuOrderNormalized",
  // Per-user immutable security trail — separate from AuditLog cold-storage path.
  "UserAuditLog",
] as const;

export type RetentionAllowedTable = (typeof RETENTION_ALLOW_LIST)[number];
export type RetentionDeniedTable = (typeof RETENTION_DENY_LIST)[number];

/**
 * Runtime guard: throws if a sweep step ever tries to mutate a table that
 * isn't in the allow-list. Called at the top of every step in
 * `retentionWorker.ts` so a future regression cannot silently widen the
 * worker's blast radius — the guard fails closed.
 */
export function assertTableAllowed(table: string): asserts table is RetentionAllowedTable {
  const allow = RETENTION_ALLOW_LIST as readonly string[];
  const deny = RETENTION_DENY_LIST as readonly string[];
  if (deny.includes(table)) {
    throw new Error(
      `[retention] refusing to mutate deny-listed table "${table}" — covered by 7y financial/audit retention.`,
    );
  }
  if (!allow.includes(table)) {
    throw new Error(
      `[retention] refusing to mutate table "${table}" — not in RETENTION_ALLOW_LIST.`,
    );
  }
}

/**
 * Operational pause toggle. When set truthy, the BullMQ handler short-
 * circuits and writes a `retention.sweep.skipped` audit row.
 */
export function isRetentionPaused(): boolean {
  const v = (process.env.RETENTION_SWEEP_PAUSED ?? "").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Banesco verbatim caveat: document purge stays gated behind an explicit
 * feature flag until Banesco confirms the 90-day window in writing.
 */
export function isBeneficiaryDocPurgeEnabled(): boolean {
  const v = (process.env.RETENTION_DOC_PURGE_ENABLED ?? "").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Per-run cap — env override, falls back to DEFAULT_MAX_PER_RUN. */
export function getMaxPerRun(): number {
  const raw = process.env.RETENTION_MAX_PER_RUN;
  const n = raw ? Number(raw) : DEFAULT_MAX_PER_RUN;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_PER_RUN;
  return Math.min(Math.floor(n), 5_000);
}

/**
 * Deterministic tombstone email for an anonymised User. Uses the user's
 * stable id (NOT the email) so the same row always tombstones to the same
 * value — re-runs are idempotent. The hash is SHA-256 truncated; we do not
 * need cryptographic preimage resistance, just a stable unique-per-user
 * placeholder that satisfies the `email @unique` constraint.
 */
export function tombstoneEmailForUserId(userId: string): string {
  const hash = crypto.createHash("sha256").update(userId).digest("hex").slice(0, 32);
  return `${hash}@${TOMBSTONE_EMAIL_DOMAIN}`;
}

/** Did this email already get tombstoned by a previous sweep? */
export function isTombstonedEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.endsWith(`@${TOMBSTONE_EMAIL_DOMAIN}`);
}
