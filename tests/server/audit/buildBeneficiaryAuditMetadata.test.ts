import { describe, it, expect } from "vitest";
import {
  buildBeneficiaryAuditMetadata,
  BENEFICIARY_AUDIT_ACTIONS,
} from "@/server/audit/buildBeneficiaryAuditMetadata";

describe("buildBeneficiaryAuditMetadata", () => {
  it("returns only allowlisted keys (with targetUserId required)", () => {
    const out = buildBeneficiaryAuditMetadata({
      targetUserId: "u_1",
      docId: "d_1",
      docType: "PROOF_OF_ADDRESS",
      source: "document_url",
    });
    expect(out).toEqual({
      targetUserId: "u_1",
      docId: "d_1",
      docType: "PROOF_OF_ADDRESS",
      source: "document_url",
    });
  });

  it("strips unknown keys at runtime even when callers cast around the type guard", () => {
    const sneaky = {
      targetUserId: "u_2",
      // Cast to any to defeat the type-level refusal — this simulates a
      // JS caller or a forced `as any` slipping past TypeScript.
      banescoAccountNumber: "9999888877",
      cookie: "session=stolen",
    } as unknown as Parameters<typeof buildBeneficiaryAuditMetadata>[0];
    const out = buildBeneficiaryAuditMetadata(sneaky);
    expect(out).toEqual({ targetUserId: "u_2" });
    expect((out as Record<string, unknown>).banescoAccountNumber).toBeUndefined();
    expect((out as Record<string, unknown>).cookie).toBeUndefined();
  });

  it("omits undefined optional fields", () => {
    const out = buildBeneficiaryAuditMetadata({
      targetUserId: "u_3",
      docId: undefined,
      source: "admin_drawer",
    });
    expect(out).toEqual({ targetUserId: "u_3", source: "admin_drawer" });
    expect("docId" in out).toBe(false);
  });

  it("exposes a stable action-name registry", () => {
    expect(BENEFICIARY_AUDIT_ACTIONS.detailViewed).toBe(
      "admin.beneficiary.detail.viewed",
    );
    expect(BENEFICIARY_AUDIT_ACTIONS.detailAccessDenied).toBe(
      "admin.beneficiary.detail.access_denied",
    );
    expect(BENEFICIARY_AUDIT_ACTIONS.documentViewed).toBe(
      "admin.beneficiary.document.viewed",
    );
    expect(BENEFICIARY_AUDIT_ACTIONS.queueExport).toBe(
      "compliance.export.beneficiary_queue",
    );
    expect(BENEFICIARY_AUDIT_ACTIONS.bankFileExport).toBe(
      "compliance.export.beneficiary_bank_file",
    );
    expect(BENEFICIARY_AUDIT_ACTIONS.bankFileExportDenied).toBe(
      "compliance.export.beneficiary_bank_file.access_denied",
    );
  });

  it("preserves bulk-export evidence keys (rowCount, fields, filterStatus, queryLength)", () => {
    const out = buildBeneficiaryAuditMetadata({
      targetUserId: "*",
      source: "queue_export",
      rowCount: 17,
      fields: ["userId", "name", "email", "accountLast4"],
      filterStatus: "BANK_READY",
      queryLength: 4,
    });
    expect(out).toEqual({
      targetUserId: "*",
      source: "queue_export",
      rowCount: 17,
      fields: ["userId", "name", "email", "accountLast4"],
      filterStatus: "BANK_READY",
      queryLength: 4,
    });
  });

  it("never lets a sneaky export caller smuggle row values through evidence keys", () => {
    // Caller tries to attach the actual exported account number under a
    // shape that *looks* like an evidence key but isn't allowlisted.
    const sneaky = {
      targetUserId: "*",
      source: "queue_export",
      rowCount: 1,
      // not in the allowlist — must be stripped:
      values: ["1234567890"],
      banescoAccountNumber: "9999888877",
    } as unknown as Parameters<typeof buildBeneficiaryAuditMetadata>[0];
    const out = buildBeneficiaryAuditMetadata(sneaky);
    expect(out).toEqual({
      targetUserId: "*",
      source: "queue_export",
      rowCount: 1,
    });
    expect((out as Record<string, unknown>).values).toBeUndefined();
    expect((out as Record<string, unknown>).banescoAccountNumber).toBeUndefined();
  });
});
