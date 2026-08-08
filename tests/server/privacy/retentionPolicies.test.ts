import { describe, it, expect } from "vitest";
import {
  RETENTION_ALLOW_LIST,
  RETENTION_DENY_LIST,
  TOMBSTONE_EMAIL_DOMAIN,
  assertTableAllowed,
  isTombstonedEmail,
  tombstoneEmailForUserId,
  getMaxPerRun,
  isRetentionPaused,
  isBeneficiaryDocPurgeEnabled,
} from "../../../src/server/privacy/retentionPolicies";

describe("retentionPolicies", () => {
  it("allow-list and deny-list never overlap (financial/audit-record exemption)", () => {
    const allow = new Set<string>(RETENTION_ALLOW_LIST);
    for (const t of RETENTION_DENY_LIST) {
      expect(allow.has(t)).toBe(false);
    }
  });

  it("deny-list includes every financial/audit family called out in task-100", () => {
    // Order & payment ledger, commission/ledger families, attribution
    // decision tables, POS source-of-truth, and the per-user immutable
    // security trail — all must remain untouched by the privacy worker
    // because they're governed by the 7-year accounting/audit window.
    for (const required of [
      // Order & payment ledger
      "Order",
      "OrderLineItem",
      "OrderEvent",
      "OrderNote",
      "Payment",
      "PaymentGatewayCredential",
      "PayoutBatch",
      "SponsorPayment",
      // Commission & ledger families
      "LedgerEntry",
      "CommissionEntry",
      "CommissionSuggestion",
      "CommissionAllocation",
      "InfluencerSubCommissionLedger",
      "ReferralBenefit",
      // Attribution / referral decision tables
      "Attribution",
      "AttributionEvent",
      "AttributionSession",
      "ReservationAttribution",
      "ReferralAssignment",
      "ReferralActor",
      "ReferralActorTypeDef",
      "ReferralLink",
      // POS raw / normalised
      "InvuOrderRaw",
      "InvuOrderNormalized",
      // Per-user immutable security trail
      "UserAuditLog",
    ]) {
      expect(RETENTION_DENY_LIST as readonly string[]).toContain(required);
    }
  });

  it("assertTableAllowed accepts allow-listed tables and rejects everything else", () => {
    for (const t of RETENTION_ALLOW_LIST) {
      expect(() => assertTableAllowed(t)).not.toThrow();
    }
    for (const t of RETENTION_DENY_LIST) {
      expect(() => assertTableAllowed(t)).toThrow(/deny-listed/);
    }
    // Unknown tables fail closed even if not explicitly listed.
    expect(() => assertTableAllowed("SomeRandomFutureTable")).toThrow(/RETENTION_ALLOW_LIST/);
  });

  it("allow-list is exactly the four privacy-rule tables", () => {
    expect([...RETENTION_ALLOW_LIST].sort()).toEqual(
      ["AuditLog", "BeneficiaryDocument", "JobApplication", "User"].sort(),
    );
  });

  it("tombstoneEmailForUserId is deterministic and idempotent", () => {
    const a = tombstoneEmailForUserId("user_123");
    const b = tombstoneEmailForUserId("user_123");
    expect(a).toBe(b);
    expect(a.endsWith(`@${TOMBSTONE_EMAIL_DOMAIN}`)).toBe(true);
    expect(isTombstonedEmail(a)).toBe(true);
    expect(isTombstonedEmail("real@example.com")).toBe(false);
    expect(isTombstonedEmail(null)).toBe(false);
    expect(isTombstonedEmail(undefined)).toBe(false);
  });

  it("tombstoneEmailForUserId differs per user (no collisions in normal use)", () => {
    expect(tombstoneEmailForUserId("user_a")).not.toBe(
      tombstoneEmailForUserId("user_b"),
    );
  });

  it("env toggles default to safe values (paused=false, doc-purge=off)", () => {
    const prev = {
      paused: process.env.RETENTION_SWEEP_PAUSED,
      flag: process.env.RETENTION_DOC_PURGE_ENABLED,
      max: process.env.RETENTION_MAX_PER_RUN,
    };
    delete process.env.RETENTION_SWEEP_PAUSED;
    delete process.env.RETENTION_DOC_PURGE_ENABLED;
    delete process.env.RETENTION_MAX_PER_RUN;
    try {
      expect(isRetentionPaused()).toBe(false);
      // Banesco verbatim caveat: doc purge stays OFF until explicitly opted in.
      expect(isBeneficiaryDocPurgeEnabled()).toBe(false);
      expect(getMaxPerRun()).toBe(500);

      process.env.RETENTION_SWEEP_PAUSED = "true";
      expect(isRetentionPaused()).toBe(true);
      process.env.RETENTION_DOC_PURGE_ENABLED = "1";
      expect(isBeneficiaryDocPurgeEnabled()).toBe(true);
      process.env.RETENTION_MAX_PER_RUN = "42";
      expect(getMaxPerRun()).toBe(42);
      process.env.RETENTION_MAX_PER_RUN = "0";
      expect(getMaxPerRun()).toBe(500);
      process.env.RETENTION_MAX_PER_RUN = "999999";
      expect(getMaxPerRun()).toBe(5_000);
    } finally {
      if (prev.paused === undefined) delete process.env.RETENTION_SWEEP_PAUSED;
      else process.env.RETENTION_SWEEP_PAUSED = prev.paused;
      if (prev.flag === undefined) delete process.env.RETENTION_DOC_PURGE_ENABLED;
      else process.env.RETENTION_DOC_PURGE_ENABLED = prev.flag;
      if (prev.max === undefined) delete process.env.RETENTION_MAX_PER_RUN;
      else process.env.RETENTION_MAX_PER_RUN = prev.max;
    }
  });
});
